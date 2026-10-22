// sim.js — reine Renn-Physik, Ligen/Rivalen, KI-Fahrer und deterministischer
// Replay (ohne DOM). Läuft im Browser (globale Funktionen) und in Node
// (tools/balance-sim.mjs lädt cars.js + sim.js per vm) → Balancing ist testbar.
//
// Grundsätze (22.10.2026):
// - Rivalen haben eine FESTE Stärke (Ziel-ET pro Rivale, aus der Balancing-
//   Simulation) — NICHT mehr ans Spieler-Setup angeglichen. Darum ist jedes
//   Upgrade im Rennen spürbar: schnelleres Auto = sichtbar mehr Vorsprung.
// - Physik in festen Ticks (SIM_DT). Eingaben werden pro Tick abgetastet →
//   gleiche Eingaben + gleiches Setup = exakt gleiche Zeit (iPhone Duo).

const QMILE = 402.336, HMILE = 804.672;
const SIM_DT = 1/120;

// ── Upgrades (eine Quelle für Garage, Ökonomie und Balancing-Test) ──
const UPGRADES = [
  { k:"engine", n:"Motor", d:"+15% Leistung pro Stufe", max:3, cost:[900,2600,6200] },
  { k:"turbo",  n:"Turbolader", d:"+28% Leistung · Ladedruck", max:1, cost:[3800] },
  { k:"tires",  n:"Slicks", d:"Mehr Grip beim Launch", max:2, cost:[1200,3200] },
  { k:"trans",  n:"Renngetriebe", d:"Schnellere Schaltzeiten", max:2, cost:[1500,3600] },
  { k:"weight", n:"Leichtbau", d:"−70 kg pro Stufe", max:2, cost:[2200,4800] },
  { k:"nos",    n:"NOS-Flasche", d:"+1.6s NOS pro Stufe (0.9s serienmässig)", max:2, cost:[1100,2400] },
];
// Teile kosten relativ zum Auto-Wert: am Starter billig und spürbar.
const upgMul = k => Math.min(5, Math.max(0.55, 0.55 + (CAR_DEFS[k].price || 0)/50000));
const upgCost = (u, lvl, k) => Math.round(u.cost[lvl] * upgMul(k) / 10) * 10;

function defaultTune(def){
  return { gears: def.gears.slice(), final: def.final, launchRpm: Math.round(def.redline*0.5) };
}

function buildSpec(carKey, carState, dist = QMILE){
  const def = CAR_DEFS[carKey];
  const up = carState.up, tune = carState.tune;
  const powerMul = 1 + up.engine*0.15 + (up.turbo ? 0.28 : 0);
  const mass = def.mass - up.weight*70;
  const mu = (1.02 + up.tires*0.16) * (def.grip ?? 1);
  const shiftTime = 0.27 - up.trans*0.05;
  return {
    def, key: carKey, powerMul, mass, gripMass: def.mass, mu, shiftTime, dist,
    gears: tune.gears.slice(0, def.gears.length), final: tune.final,
    nosMax: 0.9 + up.nos * 1.6, turbo: up.turbo, launchRpm: tune.launchRpm,
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

  let torque = torqueAt(def, r.rpm) * sp.powerMul;
  if (r.boost > 0){ torque *= (r.boostMul ?? 1.07); r.boost -= dt; }
  if (r.nosOn && r.nos > 0){ torque *= 1.38; r.nos -= dt; if (r.nos<=0) r.nosOn=false; }
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

  const drag = 0.40 * r.v * r.v, roll = 180;
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
function shiftZone(def){
  const w = def.zone ?? 530;
  return [def.redline-120-w, def.redline-120];
}
function zoneBoostMul(def){ return 1 + 37/(def.zone ?? 530); }

function doShift(r){
  const sp = r.spec, def = sp.def;
  if (!r.launched || r.finished || r.shifting > 0) return null;
  if (r.gear >= sp.gears.length-1) return null;
  const [z0,z1] = shiftZone(def);
  let q;
  if (r.rpm >= z0 && r.rpm <= z1) q = "PERFECT";
  else if (r.rpm > z1) q = "SPÄT";
  else if (r.rpm > z0-900) q = "GUT";
  else q = "FRÜH";
  r.lastShiftQ = q;
  r.gear++;
  r.shifting = sp.shiftTime * (q==="PERFECT" ? 0.7 : 1);
  if (q === "PERFECT"){ r.boost = 0.6; r.boostMul = zoneBoostMul(def); r.perfects++; }
  return q;
}

// Reaktions-Bonus: Gas exakt bei Grün = Extra-Schub, skaliert mit Genauigkeit
function launchBoost(r, rt){
  const acc = Math.max(0, 1 - rt/0.25);
  if (acc <= 0) return;
  r.boost = 1.0;
  r.boostMul = 1 + 0.12 * Math.pow(acc, 1.5);
  r.launchQ = rt <= 0.08 ? "PERFECT START" : rt <= 0.18 ? "GUTER START" : null;
}

// Start auslösen (Spieler + KI identisch): Nadel in der grünen Zone = Boost,
// überdreht = Burnout, sonst Reaktions-Bonus.
function launchRacer(r, rt, t){
  r.launched = true; r.rt = rt;
  r.clutch = 0.6; r.clutchRpm = r.rpm;
  const [z0, z1] = shiftZone(r.spec.def);
  if (r.rpm >= z0 && r.rpm <= z1){
    r.boost = 1.0; r.boostMul = zoneBoostMul(r.spec.def);
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
  const [z0, z1] = shiftZone(spec.def), zm = (z0 + z1) / 2;
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
  const k = key + JSON.stringify(cs.up) + cs.tune.final + "|" + cs.tune.launchRpm + "|" + cs.tune.gears.join(",");
  return _etCache[k] ??= aiExpectedEt(buildSpec(key, cs), POT_SKILL);
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

// ── Ligen ─────────────────────────────────────────────────────────────────────
// 6 Ligen × (4 Rivalen + Boss), danach Endlos-Liga. et = erwartete Rennzeit des Rivalen-
// (¼ Meile, ab Grün inkl. Reaktion, bei seinem Können). Werte kalibriert mit
// tools/balance-sim.mjs auf Ziel-Siegquoten des typischen Spielers: Liga 1
// leicht, danach knapp (Rivale meist leicht vorne, schlagbar durch sauberes
// Fahren + das nächste Upgrade).
// skill 0..1 = Fahrkönnen der KI (Reaktion, Schaltpunkt, Launch).
const LEAGUES = [
  { name:"Parkplatz-Rookies", short:"ROOKIES", cls:"D", col:"#8E92A3", rivals:[
    { name:"RUSTY", emoji:"🧢", car:"pico",   skill:0.15,  desc:"Fährt seit gestern. Ehrlich." },
    { name:"NADIA", emoji:"🎧", car:"sakura", skill:0.25,  desc:"Hört beim Fahren Techno." },
    { name:"JOEL",  emoji:"🧊", car:"grenz",  skill:0.30,  desc:"Eiskalt am Start." },
    { name:"DARA",  emoji:"😎", car:"rota",   skill:0.35,  desc:"Ihr Wankel kreischt nachts." },
    { name:"VITO",  emoji:"🕶", car:"samura", skill:0.45, desc:"Boss der Rookies. Sein 2JZ schläft nie.", boss:true },
  ]},
  { name:"Hafen-Nächte", short:"HAFEN", cls:"C", col:"#2BE05E", rivals:[
    { name:"LUNA",   emoji:"🌙", car:"bliz",   skill:0.40, desc:"Rallye-Herz, Hafen-Seele." },
    { name:"ORKAN",  emoji:"🌪", car:"temp",   skill:0.45, desc:"AWD. NOS. Kein Erbarmen." },
    { name:"YUKI",   emoji:"❄️", car:"strat",  skill:0.50, desc:"Understatement auf vier Rädern." },
    { name:"BRUTUS", emoji:"🦍", car:"apex",   skill:0.50, desc:"Drehmoment statt Diplomatie." },
    { name:"KEIKO",  emoji:"⚡", car:"raiden", skill:0.55, desc:"Boss vom Hafen. Startet wie angenagelt.", boss:true },
  ]},
  { name:"Highway-Club", short:"HIGHWAY", cls:"B", col:"#6EA8FF", rivals:[
    { name:"VEGA",    emoji:"🌟", car:"taifun", skill:0.55, desc:"Die Legende der Ostbrücke." },
    { name:"GHOST",   emoji:"👻", car:"axis",   skill:0.55, desc:"Kommt aus dem Nichts." },
    { name:"PANTHER", emoji:"🐆", car:"hammer", skill:0.60, desc:"Big-Block, kurze Zündschnur." },
    { name:"SIRIUS",  emoji:"💫", car:"wago",   skill:0.60, desc:"Der schnellste Kombi der Stadt." },
    { name:"MARKO",   emoji:"🐺", car:"kami",   skill:0.65, desc:"Boss des Highways. Der Wolf der Westrampe.", boss:true },
  ]},
  { name:"Bergstrassen-Elite", short:"ELITE", cls:"A", col:"#FF4D6A", rivals:[
    { name:"NITRO-NELL", emoji:"💉", car:"vulkan", skill:0.60, desc:"Ihr V10 macht Feuerwerk." },
    { name:"EL RAYO",    emoji:"⚡", car:"ryujin", skill:0.65, desc:"Blitz aus dem Süden." },
    { name:"MIDNIGHT",   emoji:"🌑", car:"onyx",   skill:0.65, desc:"Fährt nur nachts." },
    { name:"DUKE",       emoji:"🎩", car:"shini",  skill:0.70, desc:"Gentleman mit Drag-GTR." },
    { name:"AKUMA",      emoji:"😈", car:"strip",  skill:0.70, desc:"Boss der Elite. Pro-Street, null Gnade.", boss:true },
  ]},
  { name:"Nacht-Meister", short:"MEISTER", cls:"A", col:"#FF4D6A", rivals:[
    { name:"SANTOS",   emoji:"🌴", car:"bansh",   skill:0.70,  desc:"Sein Wankel schreit bis 10'600." },
    { name:"VALKYRIE", emoji:"🛡", car:"golem",   skill:0.75,  desc:"V12 und eiserne Nerven." },
    { name:"KAISER",   emoji:"👑", car:"venom",   skill:0.75, desc:"Regiert die Westrampe." },
    { name:"MAMBA",    emoji:"🐍", car:"spectre", skill:0.80, desc:"Kaum zu fassen." },
    { name:"KING",     emoji:"👑", car:"tsuna",   skill:0.80, desc:"Boss der Meister. Der King der Viertelmeile.", boss:true },
  ]},
  { name:"Legenden", short:"LEGENDEN", cls:"S", col:"#FFD34D", rivals:[
    { name:"KRAKEN",    emoji:"🐙", car:"warlord", skill:0.80, desc:"1000 Nm Familienkutsche." },
    { name:"DIABLO",    emoji:"🔱", car:"eklipse", skill:0.85, desc:"Sonnenfinsternis auf Rädern." },
    { name:"FROSTBITE", emoji:"🧊", car:"phoenix", skill:0.85, desc:"Steigt aus jeder Asche." },
    { name:"BARON",     emoji:"🎖", car:"mjoel",   skill:0.90, desc:"Hammer der Götter." },
    { name:"OMEGA",     emoji:"♾",  car:"zenith",  skill:0.90, desc:"Die absolute Endstufe.", boss:true },
  ]},
];
const LEAGUE_SIZE = 5;
// Ziel-Sim-Zeiten der Rivalen — automatisch kalibriert von
// `node tools/balance-sim.mjs 300 --calibrate` (Ziel-Siegquoten siehe dort).
// <ET-TABELLE>
const RIVAL_ET = [
  [16.72,15.27,15.01,14.12,13.72],
  [13.71,13.30,12.83,12.59,11.93],
  [11.79,11.37,11.28,11.18,11.12],
  [11.11,10.93,10.91,10.71,10.52],
  [10.42,10.14,10.10,10.01,9.74],
  [9.73,9.72,9.64,9.07,8.76],
];
// </ET-TABELLE>
// Preisgeld: wächst pro Liga stark (neue Autos kosten 6.5k … 380k), +12% pro
// Rivale, Boss ×1.6. Damit ist das nächste Auto immer in Reichweite.
const LEAGUE_PRIZE = [400, 1300, 3200, 8500, 17000, 30000];
LEAGUES.forEach((lg, L) => lg.rivals.forEach((r, i) => {
  r.et = RIVAL_ET[L][i];
  r.prize = Math.round(LEAGUE_PRIZE[L] * Math.pow(1.12, i) * (r.boss ? 1.6 : 1) / 50) * 50;
}));
const ENDLESS_NAMES = ["HAVOC","PIRANHA","SABLE","MAGNUS","VIXEN","COMET","GRIZZLY","NOVA","RAZOR","XENIA",
  "SPIKE","MISTA J","THUNDER-T","LA BRUJA","OZZY","SEVEN","JUNO","RIKO","MIDAS","ZERO"];
const ENDLESS_EMOJI = ["💥","🐟","🖤","🧲","🦊","☄️","🐻","✨","🪒","💎","🔥","🃏","⛈","🔮","🦴","7️⃣","🚀","🎯","🏆","⭕"];
const ENDLESS_CARS = ["titan","reaper","basil","kirin","okami","zenith","mjoel","phoenix"];

function leagueOf(tier){ return Math.min(LEAGUES.length, Math.floor(tier / LEAGUE_SIZE)); }

// Rivale für einen Karriere-Platz (tier = 0,1,2,… über alle Ligen)
function rivalFor(tier){
  const L = Math.floor(tier / LEAGUE_SIZE), idx = tier % LEAGUE_SIZE;
  if (L < LEAGUES.length){
    const lg = LEAGUES[L], r = lg.rivals[idx];
    return { ...r, tier, league:L, idx, leagueName: lg.name, boss: !!r.boss,
             half: false,
             hue: (tier*47 + 20) % 360 };
  }
  // Endlos-Liga: langsam schneller, Preisgeld gedeckelt
  const n = tier - LEAGUES.length*LEAGUE_SIZE;
  const boss = n % LEAGUE_SIZE === LEAGUE_SIZE-1;
  return {
    name: ENDLESS_NAMES[n % ENDLESS_NAMES.length] + (n >= ENDLESS_NAMES.length ? " " + (Math.floor(n/ENDLESS_NAMES.length)+1) : ""),
    emoji: ENDLESS_EMOJI[n % ENDLESS_EMOJI.length], car: ENDLESS_CARS[n % ENDLESS_CARS.length],
    et: Math.max(8.15, RIVAL_ET[5][4] - 0.03 - n*0.008), skill: 0.92,   // nähert sich dem Maximum (ZENITH voll ≈ 8.0s)
    prize: Math.round(Math.min(60000, 42000 + n*600) * (boss ? 1.5 : 1) / 50) * 50,
    desc: "Endlos-Liga · nur die Härtesten.", tier, league: LEAGUES.length, idx: n % LEAGUE_SIZE,
    leagueName: "Endlos-Liga", boss, half: false, hue: (tier*47)%360,
  };
}

// Rivalen-Auto: Serien-Setup, auf die Ziel-Zeit kalibriert. nerves = Anzahl
// Niederlagen des Spielers gegen genau diesen Rivalen → Rivale wird pro
// Niederlage 0.8% langsamer (max 2.4%): kein frustrierender Grind.
const _rivalSpecCache = {};
function rivalSpec(opp, nerves = 0){
  const n = Math.min(3, nerves|0);
  const key = opp.car + "|" + opp.et + "|" + n + "|" + (opp.half ? "h" : "q");
  const def = CAR_DEFS[opp.car];
  const cs = { up:{engine:0,turbo:0,tires:0,trans:0,weight:0,nos:1}, tune: defaultTune(def) };
  cs.tune.launchRpm = Math.round((shiftZone(def)[0] + shiftZone(def)[1]) / 2);
  const spec = buildSpec(opp.car, cs);
  const c = _rivalSpecCache[key];
  if (c){ spec.powerMul = c.powerMul; spec.mu = c.mu; }
  else {
    calibrateSpec(spec, opp.et * (1 + 0.008*n), opp.skill);
    _rivalSpecCache[key] = { powerMul: spec.powerMul, mu: spec.mu };
  }
  spec.dist = opp.half ? HMILE : QMILE;
  return spec;
}

// ── KI-Fahrer ─────────────────────────────────────────────────────────────────
// skill steuert Reaktion, Launch (Nadel in der Zone?) und Schaltpunkt.
function aiCreate(spec, skill, rnd = Math.random){
  const s = Math.max(0, Math.min(1, skill));
  const [z0, z1] = shiftZone(spec.def), zm = (z0+z1)/2, zw = z1 - z0;
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
    const [z0, z1] = shiftZone(def);
    r.rpm = ai.launchInZone ? (z0+z1)/2 : z0 - 600 - ai.skill*0;
    if (green && t >= ai.reaction) launchRacer(r, ai.reaction, t);
  } else {
    r.throttle = 1;
    ai.nextShift ??= ai.shiftAt();
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
  Object.assign(globalThis, { QMILE, HMILE, SIM_DT, UPGRADES, upgMul, upgCost, defaultTune, buildSpec,
    makeRacer, stepRacer, shiftZone, zoneBoostMul, doShift, launchBoost, launchRacer, simulateET, carSimET, aiExpectedEt, POT_SKILL,
    calibrateSpec, LEAGUES, LEAGUE_SIZE, RIVAL_ET, LEAGUE_PRIZE, leagueOf, rivalFor, rivalSpec, aiCreate, aiTick,
    runCreate, runTick, runEt, replayRun });
}
