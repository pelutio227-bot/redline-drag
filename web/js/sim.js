// sim.js — reine Renn-Physik, Ligen/Rivalen, KI-Fahrer und deterministischer
// Replay (ohne DOM). Läuft im Browser (globale Funktionen) und in Node
// (tools/balance-sim.mjs lädt cars.js + sim.js per vm) → Balancing ist testbar.
//
// Grundsätze (Season 2, 28.10.2026):
// - Gegner haben eine FESTE Stärke aus Level × Seltenheit (rpg.js refEt/RARITY) —
//   NICHT ans Spieler-Setup angeglichen: jedes Teil und jedes Talent ist spürbar.
// - Physik in festen Ticks (SIM_DT). Eingaben werden pro Tick abgetastet →
//   gleiche Eingaben + gleiches Setup = exakt gleiche Zeit (Duell).

const QMILE = 402.336, HMILE = 804.672;
const SIM_DT = 1/120;

// Upgrades, Talente, Klassen, Normalisierung: js/rpg.js (Season 2, 28.10.2026)

function defaultTune(def){
  return { gears: def.gears.slice(), final: def.final, launchRpm: Math.round(def.redline*0.5) };
}

// Setup → Physik-Spec. Teile-Stufen (rpg.js UPGRADES), Talente + Klassen-Fähigkeit (talentFx)
// und die Auto-Normalisierung (CAR_NORM) fliessen hier ein — für Spieler, KI und Duell-Replay gleich.
function buildSpec(carKey, carState, dist = QMILE){
  const def = CAR_DEFS[carKey];
  const up = carState.up || {}, tune = carState.tune || defaultTune(def);
  const fx = talentFx(carKey, carState.tal);
  // Normalisierung LV 1 → LV 60 (log-linear dazwischen): jedes Auto bleibt auf jedem Level konkurrenzfähig
  const n0 = CAR_NORM[carKey] || [1, 1, 1, 1], tL = Math.max(0, Math.min(1, ((carState.lvl ?? 1) - 1) / 59));
  const nrm = [n0[0] * Math.pow((n0[2] ?? n0[0]) / n0[0], tL), n0[1] * Math.pow((n0[3] ?? n0[1]) / n0[1], tL)];
  const ts = Math.min(5, up.turbo|0);
  const powerMul = nrm[0] * (1 + (up.engine|0)*0.06 + TURBO_PM[ts] + (fx.pow || 0));
  const mass = def.mass - (up.weight|0)*32 + (fx.mass || 0);
  const mu = nrm[1] * (1.02 + (up.tires|0)*0.065 + (fx.mu || 0)) * (def.grip ?? 1);
  const shiftTime = (0.27 - (up.trans|0)*0.022) * (1 + (fx.shiftMul || 0));
  return {
    def, key: carKey, powerMul, mass, gripMass: def.mass, mu, shiftTime, dist,
    gears: tune.gears.slice(0, def.gears.length), final: tune.final,
    nosMax: 0.9 + (up.nos|0)*0.7 + (fx.nos || 0), turbo: TURBO_SND[ts], turboStage: ts, launchRpm: tune.launchRpm,
    powHi: fx.powHi || 0, powLo: fx.powLo || 0, zoneMul: 1 + (fx.zoneMul || 0), perfMul: fx.perfMul || 0,
    launchMul: fx.launchMul || 0, nosPow: fx.nosPow || 0, dragMul: 1 + (fx.drag || 0),
  };
}

function makeRacer(spec){
  return {
    spec, v:0, s:0, rpm: spec.def.idle, gear:0,
    shifting:0, spin:0, burn:0, nos: spec.nosMax, nosOn:false,
    throttle:0, finished:false, time:null, trap:0,
    launched:false, rt:null, boost:0, aVis:0, wheelA:0,
    lastShiftQ:null, overRev:false, boostMul:1.07, launchQ:null, launchAt:0,
    clutch:0, clutchRpm:0, perfects:0,
  };
}

function stepRacer(r, dt, t){
  const sp = r.spec, def = sp.def, dist = sp.dist ?? QMILE;
  r.wheelA += (r.v / def.wheelR) * dt + r.spin*30*dt;
  if (r.finished){ const a=-6; r.v=Math.max(0,r.v+a*dt); r.s+=r.v*dt; r.aVis=a; return; }

  const g = sp.gears[r.gear] * sp.final;
  const wheelRpmToV = (2*Math.PI*def.wheelR)/60;

  if (!r.launched){
    if (r.manualRev){
      // Launch-Balancing: Gas = Nadel steigt (oben träger), loslassen = fällt
      if (r.throttle > 0.05){
        const rate = 5200 * Math.max(0.22, 1.12 - r.rpm/def.redline);
        r.rpm = Math.min(def.redline + 150, r.rpm + rate*dt);
      } else {
        const fall = 1300 + r.rpm*0.24;
        r.rpm = Math.max(def.idle, r.rpm - fall*dt);
      }
    } else {
      const target = (r.staged || r.throttle > 0.05) ? sp.launchRpm : def.idle;
      r.rpm += (target - r.rpm) * Math.min(1, 7*dt);
    }
    r.aVis = 0;
    return;
  }
  const roadRpm = Math.max(def.idle, (r.v / wheelRpmToV) * g);
  // Schlupf hebt die Drehzahl nur leicht (sichtbar), treibt aber nicht in den Begrenzer
  let rpmTarget = roadRpm + r.spin*700;
  if (r.clutch > 0){
    r.clutch = Math.max(0, r.clutch - dt);
    const k = r.clutch / 0.6;
    rpmTarget = Math.max(rpmTarget, r.clutchRpm*k + roadRpm*(1-k));
  }
  rpmTarget = Math.min(def.redline + 300, rpmTarget);
  r.rpm += (rpmTarget - r.rpm) * Math.min(1, 18*dt);
  r.overRev = r.rpm >= def.redline && r.throttle > 0 && r.gear < sp.gears.length-1;

  // Talente: Leistung im oberen (≥80 %) bzw. unteren (≤55 %) Drehzahlband
  const band = r.rpm >= def.redline*0.8 ? (sp.powHi || 0) : r.rpm <= def.redline*0.55 ? (sp.powLo || 0) : 0;
  let torque = torqueAt(def, r.rpm) * sp.powerMul * (1 + band);
  if (r.boost > 0){ torque *= (r.boostMul ?? 1.07); r.boost -= dt; }
  if (r.nosOn && r.nos > 0){ torque *= 1.38 + (sp.nosPow || 0); r.nos -= dt; if (r.nos<=0) r.nosOn=false; }
  if (r.shifting > 0){ torque *= 0.12; r.shifting -= dt; }
  if (r.rpm >= def.redline && roadRpm >= def.redline - 150) torque *= 0.22;   // Begrenzer (echte Fahr-Drehzahl)
  let F = (torque * g * 0.85) / def.wheelR * r.throttle;

  // Traktion: mehr Leistung als Grip → Räder drehen durch (Rauch, Sound), die
  // Kraft wird auf das Grip-Limit gekappt — OHNE Zusatzstrafe. So macht ein
  // Upgrade ein Auto nie langsamer (vorher bis −35% Kraft + Schlupf-Drehzahl im
  // Begrenzer → Motor-Upgrade machte viele Autos LANGSAMER).
  // Grip aus dem Serien-Gewicht: Leichtbau spart Masse, ohne Traktion zu kosten
  const Fmax = sp.mu * (sp.gripMass ?? sp.mass) * 9.81 * 0.62;
  if (F > Fmax){
    r.spin = Math.min(1, r.spin + (F-Fmax)/Fmax * 2.2 * dt);
    F = Fmax;
  } else r.spin = Math.max(0, r.spin - 2.5*dt);
  // Überdrehter Start: kurzer Burnout (Strafe, die man spürt, aber kein K.o.)
  if (r.burn > 0){ r.burn -= dt; F *= 0.55; r.spin = Math.max(r.spin, 0.8); }

  const drag = 0.40 * (sp.dragMul ?? 1) * r.v * r.v, roll = 180;
  const a = (F - drag - roll) / sp.mass;
  r.aVis = a;
  r.v = Math.max(0, r.v + a*dt);
  r.s += r.v*dt;
  if (r.s >= dist){
    r.finished = true;
    // Ziel-Zeit innerhalb des Ticks interpolieren (keine 1/120s-Raster-Gleichstände)
    r.time = t - (r.s - dist) / Math.max(1e-6, r.v);
    r.trap = r.v*3.6;
  }
}

// Grüne Schaltzone: Breite pro Auto (def.zone). Eng = schwerer, stärkerer Boost.
function shiftZone(def, zoneMul = 1){
  const w = (def.zone ?? 530) * zoneMul;
  return [def.redline-120-w, def.redline-120];
}
function zoneBoostMul(def){ return 1 + 37/(def.zone ?? 530); }

function doShift(r){
  const sp = r.spec, def = sp.def;
  if (!r.launched || r.finished || r.shifting > 0) return null;
  if (r.gear >= sp.gears.length-1) return null;
  const [z0,z1] = shiftZone(def, sp.zoneMul);
  let q;
  if (r.rpm >= z0 && r.rpm <= z1) q = "PERFECT";
  else if (r.rpm > z1) q = "SPÄT";
  else if (r.rpm > z0-900) q = "GUT";
  else q = "FRÜH";
  r.lastShiftQ = q;
  r.gear++;
  r.shifting = sp.shiftTime * (q==="PERFECT" ? 0.7 : 1);
  if (q === "PERFECT"){ r.boost = 0.6; r.boostMul = 1 + (zoneBoostMul(def) - 1) * (1 + (sp.perfMul || 0)); r.perfects++; }
  return q;
}

// Reaktions-Bonus: Gas exakt bei Grün = Extra-Schub, skaliert mit Genauigkeit
function launchBoost(r, rt){
  const acc = Math.max(0, 1 - rt/0.25);
  if (acc <= 0) return;
  r.boost = 1.0;
  r.boostMul = 1 + 0.12 * Math.pow(acc, 1.5) * (1 + (r.spec.launchMul || 0));
  r.launchQ = rt <= 0.08 ? "PERFECT START" : rt <= 0.18 ? "GUTER START" : null;
}

// Start auslösen (Spieler + KI identisch): Nadel in der grünen Zone = Boost,
// überdreht = Burnout, sonst Reaktions-Bonus.
function launchRacer(r, rt, t){
  r.launched = true; r.rt = rt;
  r.clutch = 0.6; r.clutchRpm = r.rpm;
  const [z0, z1] = shiftZone(r.spec.def, r.spec.zoneMul);
  if (r.rpm >= z0 && r.rpm <= z1){
    r.boost = 1.0; r.boostMul = 1 + (zoneBoostMul(r.spec.def) - 1) * (1 + (r.spec.launchMul || 0));
    r.launchQ = "PERFECT LAUNCH"; r.launchAt = t;
  } else if (r.rpm > z1){ r.burn = 0.55; r.launchQ = null; }
  else if (rt < 0.25){ launchBoost(r, rt); r.launchAt = t; }
}

// Ideal-Fahrer (Offline): Launch in der Zone, Schalten in Zonen-Mitte ohne
// Boost, NOS ab 60 km/h. Ergibt die «Sim»-Zeit, die Garage und Liga zeigen.
function simulateET(spec){
  const r = makeRacer(spec);
  r.launched = true; r.throttle = 1;
  r.rpm = spec.launchRpm; r.clutch = 0.6; r.clutchRpm = spec.launchRpm;
  const [z0, z1] = shiftZone(spec.def, spec.zoneMul), zm = (z0 + z1) / 2;
  let t = 0;
  const dt = 1/60;
  while (!r.finished && t < 60){
    if (!r.nosOn && r.nos > 0 && r.v*3.6 > 60) r.nosOn = true;
    if (r.shifting <= 0 && r.gear < spec.gears.length-1 && r.rpm >= zm){
      r.gear++; r.shifting = spec.shiftTime;
    }
    t += dt;
    stepRacer(r, dt, t);
  }
  return r.finished ? r.time : 999;
}
// Erwartete RENNZEIT (ab Grün, inkl. Reaktion) eines KI-Fahrers mit Können
// skill — deterministisch (Zufall = Mittelwert). Eine Kennzahl für alles:
// Garage («Zeit-Potenzial» = gut gefahren, skill 0.75), Rivalen-Stärke und
// Vergleich in der Karriere. Passt zu den Zeiten im Ergebnis-Screen.
const POT_SKILL = 0.75;
function aiExpectedEt(spec, skill){
  const ai = aiCreate(spec, skill, () => 0.5);
  let t = 0;
  while (!ai.racer.finished && t < 90){ t += SIM_DT; aiTick(ai, SIM_DT, t, true); }
  return ai.racer.finished ? ai.racer.time : 999;
}
const _etCache = {};
function carSimET(key, cs){
  const k = key + JSON.stringify(cs.up) + JSON.stringify(cs.tal || {}) + "|" + (cs.lvl ?? 1) + "|" + cs.tune.final + "|" + cs.tune.launchRpm + "|" + cs.tune.gears.join(",");
  return _etCache[k] = _etCache[k] ?? (aiExpectedEt(buildSpec(key, cs), POT_SKILL));
}

// Gegner-Auto auf eine Ziel-Rennzeit bringen (Leistung + etwas Grip skalieren)
function calibrateSpec(spec, targetEt, skill = POT_SKILL){
  let err = 1;
  for (let i = 0; i < 14; i++){
    err = aiExpectedEt(spec, skill) / targetEt;
    if (Math.abs(err - 1) < 0.002) break;
    spec.powerMul = Math.min(12, Math.max(0.12, spec.powerMul * Math.pow(err, 2.2)));
    spec.mu = Math.min(2.6, Math.max(0.6, spec.mu * Math.pow(err, 0.35)));
  }
  return spec;
}

// ── Gegner aus dem Strassen-Radar (rpg.js makeEncounter) ────────────────────
// Serien-Auto des Gegners, auf seine Ziel-Zeit (Level × Seltenheit) kalibriert.
const _oppSpecCache = {};
function oppSpec(enc, dist = QMILE){
  const key = enc.car + "|" + enc.et.toFixed(3) + "|" + enc.skill;
  const def = CAR_DEFS[enc.car];
  const cs = { up:{ engine:0, turbo:0, tires:0, trans:0, weight:0, nos:1 }, tune: defaultTune(def) };
  cs.tune.launchRpm = Math.round((shiftZone(def)[0] + shiftZone(def)[1]) / 2);
  const spec = buildSpec(enc.car, cs, dist);
  const c = _oppSpecCache[key];
  if (c){ spec.powerMul = c.powerMul; spec.mu = c.mu; }
  else {
    calibrateSpec(spec, enc.et, enc.skill);
    _oppSpecCache[key] = { powerMul: spec.powerMul, mu: spec.mu };
  }
  spec.dist = dist;
  return spec;
}

// ── KI-Fahrer ─────────────────────────────────────────────────────────────────
// skill steuert Reaktion, Launch (Nadel in der Zone?) und Schaltpunkt.
function aiCreate(spec, skill, rnd = Math.random){
  const s = Math.max(0, Math.min(1, skill));
  const [z0, z1] = shiftZone(spec.def, spec.zoneMul), zm = (z0+z1)/2, zw = z1 - z0;
  const gauss = () => { let u = 0; for (let i=0;i<4;i++) u += rnd(); return (u-2)/0.577; };
  return {
    racer: makeRacer(spec), skill: s, rnd,
    reaction: Math.max(0.13, 0.46 - 0.26*s + gauss()*0.05),
    launchInZone: rnd() < 0.25 + 0.6*s,
    shiftAt: () => zm + gauss() * (zw*0.25 + (1-s)*480) + (1-s)*120,
    nextShift: null,
    nosAt: 40 + rnd()*40,
  };
}
// t = Zeit seit Grün (Sekunden)
function aiTick(ai, dt, t, green){
  const r = ai.racer, def = r.spec.def;
  if (!r.launched){
    r.staged = true; r.throttle = 1;
    const [z0, z1] = shiftZone(def, r.spec.zoneMul);
    r.rpm = ai.launchInZone ? (z0+z1)/2 : z0 - 600 - ai.skill*0;
    if (green && t >= ai.reaction) launchRacer(r, ai.reaction, t);
  } else {
    r.throttle = 1;
    ai.nextShift = ai.nextShift ?? (ai.shiftAt());
    if (r.shifting <= 0 && r.rpm >= Math.min(def.redline + 50, ai.nextShift)){
      if (doShift(r)) ai.nextShift = ai.shiftAt();
    }
    // NOS erst, wenn die Reifen greifen (sonst verpufft es im Schlupf)
    if (r.s > ai.nosAt && r.nos > 0 && (r.spin < 0.15 || r.nosOn)) r.nosOn = true;
  }
  stepRacer(r, dt, t);
}

// ── Spieler-Lauf (Spiel UND Replay identisch) ────────────────────────────────
// Ablauf in Ticks ab Lauf-Start: 1.0 s «pre» (Gas pumpen erlaubt), dann Ampel;
// Grün nach greenAt Sekunden Ampel-Zeit. Eingabe pro Tick: {gas, nos, shift}.
function runCreate(spec, greenAt){
  const p = makeRacer(spec); p.manualRev = true;
  return { p, tick:0, t:0, phase:"pre", treeT:0, greenAt, green:null, events:[], last:0 };
}
// gibt ggf. ein Ereignis zurück: {launch:true} oder {shift:q}
function runTick(run, inp){
  const p = run.p, dt = SIM_DT;
  run.tick++; run.t += dt;
  // Eingabe-Protokoll (nur Änderungen) für den deterministischen Replay
  const code = (inp.gas?1:0) | (inp.nos?2:0) | (inp.shift?4:0);
  if (code !== run.last){ run.events.push([run.tick, code]); run.last = code; }
  p.throttle = inp.gas ? 1 : 0;
  let ev = null;
  if (run.phase === "pre"){
    stepRacer(p, dt, run.t);
    if (run.t >= 1.0 - 1e-9){ run.phase = "tree"; run.treeT = 0; }
    return ev;
  }
  if (run.phase === "tree"){
    run.treeT += dt;
    if (run.green == null && run.treeT >= run.greenAt - 1e-9) run.green = run.t;
    if (run.green != null && !p.launched && inp.gas){
      launchRacer(p, run.t - run.green, run.t);
      run.phase = "run"; ev = { launch:true };
    }
    stepRacer(p, dt, run.t);
    return ev;
  }
  if (inp.shift){ const q = doShift(p); if (q) ev = { shift:q }; }
  p.nosOn = !!inp.nos && p.nos > 0;
  stepRacer(p, dt, run.t);
  return ev;
}
// ET = Zeit ab Grün bis Ziel (inkl. Reaktion), wie im Rennen angezeigt
function runEt(run){ return (run.p.finished && run.green != null) ? run.p.time - run.green : null; }

// Replay: Eingabe-Protokoll mit demselben Setup nachfahren → identische Zeit
function replayRun(spec, greenAt, events, maxTicks = 120*90){
  const run = runCreate(spec, greenAt);
  let code = 0, ei = 0;
  while (!run.p.finished && run.tick < maxTicks){
    const next = run.tick + 1;
    while (ei < events.length && events[ei][0] <= next){ code = events[ei][1]; ei++; }
    runTick(run, { gas: !!(code&1), nos: !!(code&2), shift: !!(code&4) });
  }
  return { et: runEt(run), trap: run.p.trap, rt: run.p.rt };
}

// Node/vm-Export
if (typeof globalThis !== "undefined"){
  Object.assign(globalThis, { QMILE, HMILE, SIM_DT, defaultTune, buildSpec,
    makeRacer, stepRacer, shiftZone, zoneBoostMul, doShift, launchBoost, launchRacer, simulateET, carSimET, aiExpectedEt, POT_SKILL,
    calibrateSpec, oppSpec, aiCreate, aiTick,
    runCreate, runTick, runEt, replayRun });
}
