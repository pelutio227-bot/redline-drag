// game.js v2 — Physik + Rennlogik + Rendering (Eigenentwicklung).
// Neu: Squat-Animation (Heck taucht beim Beschleunigen, Front hebt — Rotation um
// die Hinterachse mit Feder), rotierende Rad-Sprites, realistischer Rundinstrument-
// Tacho mit GRÜNER Schaltzone (+PERFECT-Boost) und ZU-SPÄT-Anzeige, Ampel startet
// automatisch, Streckenobjekte (Lichtmasten, Distanztafeln, Tribüne, Leitplanken)
// für echtes Geschwindigkeitsgefühl, endlose Gegnerleiter.

const QMILE = 402.336, HMILE = 804.672;
let raceDist = QMILE;   // pro Rennen gesetzt (Race.start)

function buildSpec(carKey, carState){
  const def = CAR_DEFS[carKey];
  const up = carState.up, tune = carState.tune;
  const powerMul = 1 + up.engine*0.15 + (up.turbo ? 0.28 : 0);
  const mass = def.mass - up.weight*70;
  const mu = (1.02 + up.tires*0.16) * (def.grip ?? 1);
  const shiftTime = 0.27 - up.trans*0.05;
  return {
    def, key: carKey, powerMul, mass, mu, shiftTime,
    gears: tune.gears.slice(0, def.gears.length), final: tune.final,
    nosMax: 0.9 + up.nos * 1.6, turbo: up.turbo, launchRpm: tune.launchRpm,
  };
}

function makeRacer(spec){
  return {
    spec, v:0, s:0, rpm: spec.def.idle, gear:0,
    shifting:0, spin:0, nos: spec.nosMax, nosOn:false,
    throttle:0, finished:false, time:null, trap:0,
    launched:false, rt:null, boost:0, aVis:0, wheelA:0,
    lastShiftQ:null, overRev:false, boostMul:1.07, launchQ:null, launchAt:0,
    clutch:0, clutchRpm:0,
  };
}

function stepRacer(r, dt, t){
  const sp = r.spec, def = sp.def;
  // Rad-Rotation (auch nach Ziel)
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
        // Sanftes Absinken (Motorbremse) statt hartem Sturz — Nadel bleibt lesbar
        const fall = 1300 + r.rpm*0.24;
        r.rpm = Math.max(def.idle, r.rpm - fall*dt);
      }
    } else { // KI: hält Launch-RPM automatisch
      const target = (r.staged || r.throttle > 0.05) ? sp.launchRpm : def.idle;
      r.rpm += (target - r.rpm) * Math.min(1, 7*dt);
    }
    r.aVis = 0;
    return;
  }
  const roadRpm = Math.max(def.idle, (r.v / wheelRpmToV) * g);
  // Kein harter Sturz auf Leerlauf beim Launch: Kupplung schleift die hoch-
  // gedrehte Nadel über ~0.6s sanft auf die Fahr-Drehzahl runter, während das
  // Auto beschleunigt — die Nadel «trifft» die Strasse statt zu springen.
  let rpmTarget = roadRpm + r.spin*2400;
  if (r.clutch > 0){
    r.clutch = Math.max(0, r.clutch - dt);
    const k = r.clutch / 0.6;
    rpmTarget = Math.max(rpmTarget, r.clutchRpm*k + roadRpm*(1-k));
  }
  rpmTarget = Math.min(def.redline + 300, rpmTarget);
  r.rpm += (rpmTarget - r.rpm) * Math.min(1, 18*dt);   // flüssige Nadel statt Sprung
  r.overRev = r.rpm >= def.redline && r.throttle > 0 && r.gear < sp.gears.length-1;

  let torque = torqueAt(def, r.rpm) * sp.powerMul;
  if (r.boost > 0){ torque *= (r.boostMul ?? 1.07); r.boost -= dt; }  // PERFECT-/Launch-Bonus
  if (r.nosOn && r.nos > 0){ torque *= 1.38; r.nos -= dt; if (r.nos<=0) r.nosOn=false; }
  if (r.shifting > 0){ torque *= 0.12; r.shifting -= dt; }
  if (r.rpm >= def.redline) torque *= 0.22;                   // Begrenzer
  let F = (torque * g * 0.85) / def.wheelR * r.throttle;

  const Fmax = sp.mu * sp.mass * 9.81 * 0.62;
  if (F > Fmax){
    r.spin = Math.min(1, r.spin + (F-Fmax)/Fmax * 2.2 * dt);
    F = Fmax * (1 - r.spin*0.35);
  } else r.spin = Math.max(0, r.spin - 2.5*dt);

  const drag = 0.40 * r.v * r.v, roll = 180;
  const a = (F - drag - roll) / sp.mass;
  r.aVis = a;
  r.v = Math.max(0, r.v + a*dt);
  r.s += r.v*dt;
  if (r.s >= raceDist){ r.finished = true; r.time = t; r.trap = r.v*3.6; }
}

// Grüne Schaltzone: Breite pro Auto (def.zone). Enge Zone = schwerer zu
// treffen, dafür stärkerer PERFECT-Boost (Spezial-Autos wie SHINIGAMI/RYUJIN).
function shiftZone(def){
  const w = def.zone ?? 530;
  return [def.redline-120-w, def.redline-120];
}
function zoneBoostMul(def){ return 1 + 37/(def.zone ?? 530); } // 650→+5.7% … 300→+12.3%

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
  if (q === "PERFECT"){ r.boost = 0.6; r.boostMul = zoneBoostMul(def); } // Grün getroffen
  return q;
}

// Launch-Boost: Gas exakt bei Grün = Extra-Schub, skaliert mit Genauigkeit
function launchBoost(r, rt){
  const acc = Math.max(0, 1 - rt/0.25);          // 0.00s perfekt … ≥0.25s nichts
  if (acc <= 0) return;
  r.boost = 1.0;
  r.boostMul = 1 + 0.12 * Math.pow(acc, 1.5);    // bis +12% für 1s
  r.launchQ = rt <= 0.08 ? "PERFECT START" : rt <= 0.18 ? "GUTER START" : null;
}

// ── Gegner: 8 handgebaut + endlos generiert ─────────────────────────────────
const OPP_BASE = [
  { name:"RUSTY",  emoji:"🧢", car:"urban",  power:0.62, reaction:[0.60,0.95], slack:2300, hue:95,  prize:350,  desc:"Mamas Kompakter. Ehrlich." },
  { name:"NADIA",  emoji:"🎧", car:"kaze",   power:0.74, reaction:[0.48,0.75], slack:1500, hue:200, prize:600,  desc:"Hört beim Fahren Techno." },
  { name:"JOEL",   emoji:"🧊", car:"falco",  power:0.82, reaction:[0.40,0.60], slack:1100, hue:150, prize:950,  desc:"Eiskalt am Start." },
  { name:"DARA",   emoji:"😎", car:"rota",   power:0.88, reaction:[0.34,0.52], slack:800,  hue:280, prize:1400, desc:"Ihr Wankel kreischt nachts." },
  { name:"VITO",   emoji:"🕶", car:"apex",   power:0.90, reaction:[0.30,0.48], slack:650,  hue:45,  prize:2000, desc:"Sein V8 schläft nie." },
  { name:"KEIKO",  emoji:"⚡", car:"temp",   power:0.96, reaction:[0.25,0.40], slack:450,  hue:210, prize:2800, desc:"AWD. NOS. Kein Erbarmen." },
  { name:"MARKO",  emoji:"🐺", car:"taifun", power:1.00, reaction:[0.22,0.34], slack:350,  hue:0,   prize:3800, desc:"Der Wolf der Westrampe." },
  { name:"KING",   emoji:"👑", car:"kami",   power:1.05, reaction:[0.19,0.30], slack:260,  hue:355, prize:5200, desc:"Der King der Viertelmeile." },
];
const OPP_NAMES = ["SPIKE","LUNA","ORKAN","MISTA J","YUKI","BRUTUS","VEGA","GHOST","PANTHER","SIRIUS",
  "NITRO-NELL","EL RAYO","MIDNIGHT","DUKE","AKUMA","SANTOS","VALKYRIE","KAISER","MAMBA","RIKO",
  "THUNDER-T","LA BRUJA","OZZY","KRAKEN","SEVEN","DIABLO","FROSTBITE","JUNO","BARON","XENIA",
  "HAVOC","PIRANHA","SABLE","MAGNUS","VIXEN","COMET","GRIZZLY","NOVA","RAZOR","OMEGA"];
const OPP_EMOJI = ["🔥","🌙","🌪","🃏","❄️","🦍","🌟","👻","🐆","💫",
  "💉","⚡","🌑","🎩","😈","🌴","🛡","👑","🐍","🎯",
  "⛈","🔮","🦴","🐙","7️⃣","🔱","🧊","🚀","🎖","💎",
  "💥","🐟","🖤","🧲","🦊","☄️","🐻","✨","🪒","♾"];
const OPP_DESCS = [
  "Jeder Sieg macht die Strasse hungriger.","Hat noch nie zurückgeschaut.",
  "Fährt nur nachts. Verliert nie bei Regen.","Sein Auto kennt keine Gnade.",
  "Die Legende der Ostbrücke.","Kommt aus dem Nichts, geht als Erste:r.",
  "Tunt seit 20 Jahren. Schläft in der Garage.","Kalt. Präzise. Unbezahlbar.",
];
function getOpponent(tier){
  if (tier < OPP_BASE.length) return { ...OPP_BASE[tier], tier };
  const i = tier - OPP_BASE.length;
  // Hohe Tiers fahren die Elite-Autos (bis Unlock-Level 70)
  const pool = CAR_KEYS.filter(k=>CAR_DEFS[k].unlock <= Math.min(70, 8 + i*2));
  const car = pool[(tier*7) % pool.length];
  return {
    name: OPP_NAMES[i % OPP_NAMES.length] + (i >= OPP_NAMES.length ? " " + (Math.floor(i/OPP_NAMES.length)+1) : ""),
    emoji: OPP_EMOJI[i % OPP_EMOJI.length], car, tier,
    power: Math.min(1.8, 1.06 + i*0.024),   // nur Startwert — adaptOpponent() gleicht ans Spieler-Setup an
    reaction: [Math.max(0.15, 0.19-i*0.002), Math.max(0.22, 0.30-i*0.003)],
    slack: Math.max(120, 260 - i*10),
    // Preisgeld flach gedeckelt: kein Geld-Inflations-Endgame mehr (war 5200+i*1400
    // → 60k+/Rennen). Reichtum kommt jetzt aus Serien-Siegen, nicht aus Tier-Zahl.
    hue: (tier*47)%360, prize: Math.min(14000, 5200 + i*350),
    desc: OPP_DESCS[(tier*3) % OPP_DESCS.length],
  };
}

// ── Adaptive Karriere-Balance ────────────────────────────────────────────────
// Der Gegner wird ans ECHTE Potenzial des Spieler-Setups angeglichen: beide
// Autos werden offline mit identischem Ideal-Fahrer simuliert, dann wird die
// Gegner-Power iterativ auf eine Ziel-ET relativ zum Spieler skaliert.
// Rennen bleiben dadurch auf jedem Level knapp — entschieden wird über
// Reaktion, Launch-Qualität, Schaltzonen und NOS, nicht über Zahlen-Power.
function simulateET(spec){
  const r = makeRacer(spec);
  r.launched = true; r.throttle = 1;
  r.rpm = spec.launchRpm; r.clutch = 0.6; r.clutchRpm = spec.launchRpm;
  const [z0, z1] = shiftZone(spec.def), zm = (z0 + z1) / 2;
  let t = 0;
  while (!r.finished && t < 60){
    if (!r.nosOn && r.nos > 0 && r.v*3.6 > 60) r.nosOn = true;
    if (r.shifting <= 0 && r.gear < spec.gears.length-1 && r.rpm >= zm){
      r.gear++; r.shifting = spec.shiftTime;
    }
    t += 1/60;
    stepRacer(r, 1/60, t);
  }
  return r.finished ? r.time : 999;
}
function adaptOpponent(pSpec, oSpec, tier){
  // Ziel: früh klar schlagbar (bis +5.5% ET), ab Tier 8 eng — KI-Potenzial
  // höchstens 1% ÜBER dem Spieler (Perfect-Launch/-Shifts + NOS gleichen das aus).
  const f = tier < 8 ? 1.055 - tier*0.007 : Math.max(0.99, 1.0 - (tier-8)*0.0012);
  const target = simulateET(pSpec) * f;
  if (target > 500) return true;
  let err = 1;
  for (let i = 0; i < 5; i++){
    err = simulateET(oSpec) / target;
    if (Math.abs(err - 1) < 0.004) break;
    oSpec.powerMul = Math.min(9, Math.max(0.2, oSpec.powerMul * Math.pow(err, 2)));
    oSpec.mu = Math.min(2.4, Math.max(0.6, oSpec.mu * Math.pow(err, 0.25)));
  }
  return Math.abs(err - 1) < 0.02;   // false = Gegner-Auto kann das Ziel nicht erreichen
}

// ── Rennen ───────────────────────────────────────────────────────────────────
const Race = (() => {
  const cv = document.getElementById("cv");
  const g = cv.getContext("2d");
  let W=0,H=0,dpr=1;
  function resize(){
    dpr = Math.min(2, window.devicePixelRatio||1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W*dpr; cv.height = H*dpr;
    g.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener("resize", resize); resize();

  let st=null, raf=0, lastT=0, acc=0;
  const DT=1/120;
  let onDone=null;
  const parts=[];
  const input = { gas:false, nos:false };

  async function start(opts){
    onDone = opts.onDone;
    raceDist = opts.opp.half ? HMILE : QMILE;
    const spec = buildSpec(opts.carKey, opts.carState);
    const style = opts.carState.style;
    const oppDef = { up: opts.opp.up ?? {engine:1,turbo:0,tires:1,trans:0,weight:0,nos:0},
      tune: opts.opp.tune ?? { gears: CAR_DEFS[opts.opp.car].gears.slice(), final: CAR_DEFS[opts.opp.car].final,
             launchRpm: Math.round(CAR_DEFS[opts.opp.car].redline*0.55) },
      style: opts.opp.style ?? { hue: opts.opp.hue ?? 0, drop:10, rim:1, exhaust:1, spoiler:1 } };
    let oSpec = buildSpec(opts.opp.car, oppDef);
    oSpec.powerMul *= (opts.opp.power ?? 1);
    // KI-Rennen (Karriere/Quick/Bet): Gegner-Potenzial ans Spieler-Setup angleichen.
    // Ghost (echtes Freund-Auto) und LIVE-Duelle bleiben unangetastet.
    if (!opts.live && !opts.opp.vsGhost){
      if (!adaptOpponent(spec, oSpec, opts.opp.tier ?? 0)){
        // Gegner-Auto zu schwach fürs Spieler-Setup (Traktion/Drag-Limit) →
        // Mirror-Duell: gleiches Auto, gleiche Upgrades + Tune wie der Spieler
        // (identisches Potenzial), eigener Lack. Adaption justiert nur noch ±1%.
        opts.opp = { ...opts.opp, car: opts.carKey };
        oppDef.up = { ...opts.carState.up };
        oppDef.tune = { gears: opts.carState.tune.gears.slice(), final: opts.carState.tune.final,
                        launchRpm: opts.carState.tune.launchRpm };
        oSpec = buildSpec(opts.carKey, oppDef);
        adaptOpponent(spec, oSpec, opts.opp.tier ?? 0);
      }
    }

    const [pBody, oBody] = await Promise.all([
      carBodyImage(opts.carKey, style),
      carBodyImage(opts.opp.car, oppDef.style),
    ]);
    st = {
      phase:"pre", t:0, treeT:-1, green:null,
      p: Object.assign(makeRacer(spec), {manualRev:true}), pBody, pWheel: wheelSprite(style.rim??0, 40),
      pAx: carAx(opts.carKey, spec.def), pPitch:0, pPitchV:0,
      ai: { racer: makeRacer(oSpec),
            reaction: opts.opp.reaction ? opts.opp.reaction[0]+Math.random()*(opts.opp.reaction[1]-opts.opp.reaction[0]) : 0.3,
            slack: opts.opp.slack ?? 350, nosAt: oSpec.nosMax>0 ? 60 : null },
      oBody, oWheel: wheelSprite(oppDef.style.rim??1, 40),
      oAx: carAx(opts.opp.car, oSpec.def), oPitch:0, oPitchV:0,
      opp: opts.opp, doneT:null, flash:0, exh: style.exhaust ?? 0,
      exTipF: exhaustXFrac(opts.carKey, spec.def), neon: !!style.neon, hue: style.hue ?? 0,
      live: opts.live ?? null, remote: null, remoteEt: null,
    };
    AudioSys.unlock(); AudioSys.startEngine(soundProfile(opts.carKey, style.exhaust ?? 0));
    const sh = document.getElementById("pShift"); if (sh) sh.dataset.gear = "0";  // Knauf auf N
    parts.length = 0;
    lastT = performance.now(); acc = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  function stop(){ cancelAnimationFrame(raf); AudioSys.stopEngine(); AudioSys.skid(false); st=null; }

  function physics(dt){
    const p = st.p;
    st.t += dt;
    p.throttle = input.gas ? 1 : 0;

    if (st.phase === "pre"){
      // LIVE: auf den synchronen Startzeitpunkt beider Spieler warten
      if (st.live && Date.now() < st.live.startAt){
        st.t = 0;
        stepRacer(p, dt, st.t);
        return;
      }
      // Ampel startet AUTOMATISCH nach kurzem Moment
      stepRacer(p, dt, st.t);
      if (st.t >= 1.0){
        st.phase = "tree"; st.treeT = 0;
        // LIVE: beide Seiten nutzen dasselbe Grün-Timing (fair)
        st.greenAt = st.live ? st.live.greenAt : 2.6 + Math.random()*0.8;
      }
      return;
    }
    if (st.phase === "tree"){
      st.treeT += dt;
      // ANTI-LAG beim Launch-Control: Nadel oben halten → der Auspuff ballert
      // (Knall + Flammen), dichter je fetter das Auspuff-Kit
      if (!p.launched && p.rpm > p.spec.def.redline*0.52 && Math.random() < dt*(5 + st.exh*2)){
        AudioSys.bang(0.5 + st.exh*0.3);
        st.antilag = 2 + ((Math.random()*3)|0);
        st.shake = Math.min(1, (st.shake||0) + 0.08);
      }
      if (st.green == null && st.treeT >= st.greenAt){ st.green = st.t; AudioSys.beep(880,.3,.4); }
      if (st.green != null && !p.launched && input.gas){
        p.launched = true;
        p.rt = st.t - st.green;
        p.clutch = 0.6; p.clutchRpm = p.rpm;   // Nadel gleitet runter statt Sprung
        const [z0, z1] = shiftZone(p.spec.def);
        if (p.rpm >= z0 && p.rpm <= z1){        // Nadel in der grünen Zone = Boost!
          p.boost = 1.0; p.boostMul = zoneBoostMul(p.spec.def);
          p.launchQ = "PERFECT LAUNCH"; p.launchAt = st.t;
        } else if (p.rpm > z1){ p.spin = 0.9; } // überdreht = Wheelspin
        else if (p.rt < 0.25){ launchBoost(p, p.rt); p.launchAt = st.t; } // Reaktions-Bonus
        st.shake = Math.min(1, (st.shake||0) + 0.45);
        if (p.launchQ){ st.flash = 0.35; AudioSys.whoosh(); }
        st.phase = "run";
      }
      stepRacer(p, dt, st.t);
      st.live ? remoteStep(dt) : aiGo(dt);
      return;
    }
    // run
    p.nosOn = input.nos && p.nos > 0;
    // Getunter Knall «ab und an» während der Fahrt: kurzer Backfire mit Flammen
    if (p.launched && !p.finished && p.throttle && p.rpm > p.spec.def.redline*0.6 &&
        Math.random() < dt*(0.30 + st.exh*0.15)){
      AudioSys.bang(0.9 + st.exh*0.4);
      st.antilag = 3 + ((Math.random()*3)|0);
      st.shake = Math.min(1, (st.shake||0) + 0.12);
    }
    stepRacer(p, dt, st.t);
    st.live ? remoteStep(dt) : aiGo(dt);
    if (p.finished && st.doneT == null){
      st.doneT = st.t;
      st.shake = Math.min(1, (st.shake||0) + 0.5);
      st.flash = 0.5;
    }
    if (st.doneT != null && st.phase !== "done"){
      const oppDone = st.live
        ? (st.remoteEt != null || st.t - st.doneT > 10)     // auf echten Gegner warten
        : (st.t - st.doneT > 2.0 || st.ai.racer.finished);
      if (oppDone){ st.phase = "done"; setTimeout(finish, 350); }
    }
  }
  // LIVE: Gegner-Auto folgt den empfangenen Positions-Snapshots (sanft geglättet)
  function remoteStep(dt){
    const o = st.ai.racer, R = st.remote;
    if (!R) return;
    o.launched = true;
    o.v = R.v;
    const age = Math.min(0.5, (performance.now() - R.rxAt)/1000);
    const target = R.s + R.v*age;
    o.s += (target - o.s) * Math.min(1, 10*dt);
    o.wheelA += (o.v / o.spec.def.wheelR) * dt;
    o.aVis = 0;
    if (R.fin && !o.finished) o.finished = true;
  }
  function aiGo(dt){
    if (st.green == null) return;
    const a = st.ai, t = st.t - st.green;
    const def = a.racer.spec.def;
    if (!a.racer.launched){
      a.racer.staged = true; a.racer.throttle = 1; a.racer.rpm = a.racer.spec.launchRpm;
      if (t >= a.reaction){ a.racer.launched = true; a.racer.rt = a.reaction; launchBoost(a.racer, a.reaction); }
    } else {
      a.racer.throttle = 1;
      if (a.racer.rpm > def.redline - a.slack) doShift(a.racer);
      if (a.nosAt != null && a.racer.s > a.nosAt && a.racer.nos > 0) a.racer.nosOn = true;
    }
    stepRacer(a.racer, dt, t);
  }
  function finish(){
    const p = st.p, o = st.ai.racer;
    AudioSys.stopEngine(); AudioSys.skid(false);
    const pT = p.time != null ? p.time - st.green : Infinity;
    const oT = st.live ? (st.remoteEt ?? Infinity)
                       : (o.time != null ? o.time : Infinity);
    const win = pT < oT;
    win ? AudioSys.winJingle() : AudioSys.loseThud();
    const res = { win, et:pT, trap:p.trap, rt:p.rt, oppEt: oT===Infinity?null:oT, opp: st.opp,
                  perfects: p.lastShiftQ === "PERFECT", live: !!st.live };
    const cb = onDone; stop(); cb && cb(res);
  }

  // ── Render ──
  function loop(now){
    raf = requestAnimationFrame(loop);
    if (!st) return;
    let dt = (now-lastT)/1000; lastT = now;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    while (acc >= DT){ physics(DT); acc -= DT; }
    draw(dt);
    const p = st.p;
    AudioSys.engine(p.rpm, p.throttle, p.spec.turbo ? Math.min(1, p.throttle*(p.rpm/p.spec.def.redline)) : 0);
    AudioSys.skid(p.spin > 0.25 && p.launched && !p.finished);
  }

  // Boost-Aura: pulsierender Energieschein + Speed-Streaks + Energie-Licks
  function drawAura(x, y, w, h, kind){
    const t = st.t;
    const col = kind === "nos" ? "80,150,255" : "255,190,70";
    const pul = 0.75 + 0.25*Math.sin(t*26);
    const cx2 = x + w*0.5, cy2 = y + h*0.62;
    const rg = g.createRadialGradient(cx2, cy2, w*0.08, cx2, cy2, w*0.62*pul);
    rg.addColorStop(0, `rgba(${col},${0.30*pul})`);
    rg.addColorStop(0.7, `rgba(${col},${0.12*pul})`);
    rg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = rg;
    g.beginPath(); g.ellipse(cx2, cy2, w*0.68*pul, h*0.55*pul, 0, 0, 7); g.fill();
    g.strokeStyle = `rgba(${col},${0.5*pul})`; g.lineWidth = 2; g.lineCap = "round";
    for (let i=0;i<5;i++){
      const yy = y + h*(0.30 + 0.13*i) + Math.sin(t*40 + i*2)*2;
      const len = w*(0.36 + 0.16*Math.sin(t*30 + i*1.3));
      g.beginPath(); g.moveTo(x - 4, yy); g.lineTo(x - 4 - len, yy + (i-2)*2.4); g.stroke();
    }
    g.strokeStyle = `rgba(${col},${0.35*pul})`; g.lineWidth = 2.5;
    for (let i=0;i<3;i++){
      const xx = x + w*(0.26 + 0.22*i), yb = y + h*0.30;
      g.beginPath(); g.moveTo(xx, yb);
      g.quadraticCurveTo(xx-14, yb-12-6*Math.sin(t*33+i*1.7), xx-26-6*i, yb-20-8*Math.sin(t*27+i));
      g.stroke();
    }
  }

  function springPitch(cur, vel, target, dt){
    const k=60, d=9;
    const acc = (target-cur)*k - vel*d;
    vel += acc*dt; cur += vel*dt;
    return [cur, vel];
  }

  function draw(dt){
    const p = st.p, o = st.ai.racer;
    const camS = p.s;
    const pxPerM = Math.min(W,900)/34;
    const portrait = H > W;
    const roadY = portrait ? H*0.55 : H*0.70;
    const laneH = Math.min(H*0.135, 120);
    const hz = roadY - laneH*1.7;
    g.clearRect(0,0,W,H);
    // Screenshake + Blitz abklingen lassen
    st.shake = (st.shake||0)*Math.exp(-5*dt);
    st.flash = (st.flash||0)*Math.exp(-4*dt);
    if (p.launched && !p.finished && p.rpm >= p.spec.def.redline && p.throttle>0)
      st.shake = Math.max(st.shake, 0.06);        // Begrenzer rüttelt
    g.save();
    if (st.shake > 0.01) g.translate((Math.random()-.5)*st.shake*16, (Math.random()-.5)*st.shake*11);

    // Himmel
    const sky = g.createLinearGradient(0,0,0,hz);
    sky.addColorStop(0,"#0B0D18"); sky.addColorStop(.7,"#141126"); sky.addColorStop(1,"#221636");
    g.fillStyle = sky; g.fillRect(0,0,W,hz);
    g.fillStyle = "rgba(255,45,64,.10)";
    g.beginPath(); g.arc(W*0.78, hz*0.40, 90, 0, 7); g.fill();
    // Skyline (langsame Parallax)
    g.fillStyle = "#0A0A12";
    const off1 = -(camS*pxPerM*0.10)%160;
    for (let x=off1-160; x<W+160; x+=160){
      g.fillRect(x, hz-110, 46, 110); g.fillRect(x+62, hz-80, 38, 80); g.fillRect(x+112, hz-140, 34, 140);
    }
    g.fillStyle = "rgba(255,190,80,.16)";
    for (let x=off1-160; x<W+160; x+=160)
      for (let i=0;i<5;i++) g.fillRect(x+8+(i%2)*20, hz-96+i*17, 5, 6);

    // Strasse
    g.fillStyle = "#17181D"; g.fillRect(0, hz, W, laneH*2.9);
    g.fillStyle = "#101115"; g.fillRect(0, hz, W, 6);
    const worldX = m => W*0.30 + (m - camS)*pxPerM;

    // ── Streckenobjekte (Speed-Gefühl!) ──
    // Leitplanken-Pfosten alle 8m (hinter der Gegner-Spur)
    g.fillStyle = "#2a2d35";
    for (let m = Math.floor((camS-14)/8)*8; m < camS+40; m+=8){
      const x = worldX(m);
      g.fillRect(x, hz-14, 4, 14);
    }
    g.fillStyle = "#3a3e48"; g.fillRect(0, hz-16, W, 4);
    // Lichtmasten alle 40m mit Lichtkegel
    for (let m = Math.floor((camS-14)/40)*40; m < camS+44; m+=40){
      const x = worldX(m);
      g.fillStyle = "#20232b"; g.fillRect(x, hz-92, 5, 92);
      g.fillRect(x-1, hz-96, 22, 5);
      g.fillStyle = "rgba(255,240,190,.9)"; g.fillRect(x+16, hz-95, 8, 4);
      const lg = g.createLinearGradient(0,hz-90,0,roadY+laneH);
      lg.addColorStop(0,"rgba(255,240,190,.10)"); lg.addColorStop(1,"rgba(255,240,190,0)");
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(x+20, hz-90); g.lineTo(x-34, roadY+laneH); g.lineTo(x+80, roadY+laneH); g.closePath(); g.fill();
    }
    // Distanztafeln 100/200/300m + Start-Portal + FINISH
    const board = (m, txt, big) => {
      const x = worldX(m);
      if (x<-160||x>W+160) return;
      g.fillStyle="#20232b"; g.fillRect(x, hz-46, 5, 46);
      g.fillStyle= big?"#FF2D40":"#F2F3F7";
      const w= big?96:64, h= big?30:24;
      g.fillRect(x-w/2+2, hz-46-h, w, h);
      g.fillStyle= big?"#fff":"#101115"; g.font=`900 ${big?15:12}px system-ui`; g.textAlign="center";
      g.fillText(txt, x+2, hz-46-h/2+5);
    };
    board(100,"100m"); board(200,"200m"); board(300,"300m");
    if (raceDist > QMILE){ board(QMILE,"¼"); board(600,"600m"); }
    board(raceDist,"FINISH",true);
    // Start-Portal + Tribüne beim Start
    if (worldX(0) > -300){
      const x0 = worldX(-6);
      g.fillStyle = "#232630";
      g.fillRect(x0-70, hz-60, 150, 26);
      for (let i=0;i<10;i++){ g.fillStyle = `hsl(${(i*67)%360} 60% 55%)`; g.fillRect(x0-62+i*14, hz-54, 9, 9); }
      g.fillStyle="#F2F3F7"; g.font="900 11px system-ui"; g.textAlign="center";
      g.fillText("REDLINE STRIP", x0+5, hz-42);
    }

    // Fahrbahn-Markierung
    const dashOff = -(camS*pxPerM)%80;
    g.fillStyle = "rgba(255,255,255,.26)";
    for (let x=dashOff-80; x<W+80; x+=80) g.fillRect(x, roadY - laneH*0.28, 42, 5);
    g.fillStyle = "rgba(255,255,255,.13)";
    g.fillRect(0, roadY + laneH*1.05, W, 4);
    // Start/Ziel auf Asphalt
    lineMarker(worldX(0)); lineMarker(worldX(raceDist));

    // ── Autos (Räder rotierend + Karosserie mit Pitch um Hinterachse) ──
    const carW = Math.min(W*0.38, 280), carH = carW*(200/480);
    const wheelR = carW * (40/480) * 0.72;
    // Pitch-Ziel aus Beschleunigung (+ Wheelspin-Zittern)
    const pt = Math.max(-0.05, Math.min(0.11, p.aVis*0.011)) + (p.spin>0.3 ? (Math.random()-.5)*0.02 : 0);
    [st.pPitch, st.pPitchV] = springPitch(st.pPitch, st.pPitchV, p.launched?pt:0, dt);
    const ot = Math.max(-0.05, Math.min(0.11, o.aVis*0.011));
    [st.oPitch, st.oPitchV] = springPitch(st.oPitch, st.oPitchV, o.launched?ot:0, dt);

    const py = roadY + laneH*0.62 - carH, px = W*0.30 - carW*0.5;
    const oy = hz + laneH*0.55 - carH, ox = worldX(o.s) - carW*0.5;
    drawCar(st.oBody, st.oWheel, st.oAx, ox, oy, carW, carH, wheelR, st.oPitch, o.wheelA);
    if ((p.boost > 0 && p.launched) || p.nosOn)
      drawAura(px, py, carW, carH, p.nosOn ? "nos" : "boost");
    drawCar(st.pBody, st.pWheel, st.pAx, px, py, carW, carH, wheelR, st.pPitch, p.wheelA);

    // Partikel
    if (p.spin > 0.3 && p.launched && !p.finished){
      puff(px+carW*(0.14+Math.random()*0.1), py+carH*0.92, "smoke");
      puff(px+carW*(0.24+Math.random()*0.12), py+carH*0.90, "smoke");
      if (p.spin > 0.6) puff(px+carW*0.05, py+carH*0.88, "smoke");
    }
    const exF = 1 + st.exh*0.55;                       // Auspuff-Kit → Flammengrösse
    const exX = px + st.exTipF*carW;                   // echte Heckkante des Autos
    if (p.nosOn) puff(exX-4, py+carH*0.80, "flame", exF);
    if (p.shifting > p.spec.shiftTime*0.6){
      puff(exX-2, py+carH*0.80, "flame", exF);
      if (st.exh >= 1) puff(exX-6, py+carH*0.84, "flame", exF*0.8);  // Duplex: 2. Flamme
      if (st.exh >= 2 && Math.random()<.6) puff(exX-12, py+carH*0.80, "flame", exF); // Big Bore+
    }
    if (p.overRev && Math.random() < 0.10 + st.exh*0.12)             // Begrenzer-Crackle
      puff(exX-4, py+carH*0.81, "flame", 0.6 + st.exh*0.4);
    // Anti-Lag-/Backfire-Flammen (von physics() via st.antilag angestossen)
    if (st.antilag > 0){
      st.antilag--;
      puff(exX-4 - Math.random()*8, py+carH*0.80, "flame", exF*(1.1 + Math.random()*0.6));
      if (st.exh >= 1 && Math.random() < .6) puff(exX-10, py+carH*0.84, "flame", exF*0.8);
    }
    // Neon-Unterboden im Rennen
    if (st.neon){
      const ng = g.createRadialGradient(px+carW/2, py+carH*0.92, 8, px+carW/2, py+carH*0.92, carW*0.42);
      ng.addColorStop(0, `hsla(${st.hue} 95% 60% / .5)`);
      ng.addColorStop(1, `hsla(${st.hue} 95% 60% / 0)`);
      g.fillStyle = ng;
      g.beginPath(); g.ellipse(px+carW/2, py+carH*0.92, carW*0.42, 8, 0, 0, 7); g.fill();
    }
    for (let i=parts.length-1;i>=0;i--){
      const q = parts[i]; q.life -= dt; if (q.life<=0){ parts.splice(i,1); continue; }
      q.x += q.vx*dt - p.v*pxPerM*dt*0.4; q.y += q.vy*dt;
      if (q.kind==="smoke"){
        // Comic-Wolke: Blumenkohl aus 3 Kreisen + heller Kern
        const a = q.life*0.30, rr2 = q.r*(2.1-q.life);
        g.fillStyle = `rgba(222,226,234,${a})`;
        g.beginPath(); g.arc(q.x-rr2*0.45, q.y-rr2*0.15, rr2*0.72, 0, 7); g.fill();
        g.beginPath(); g.arc(q.x+rr2*0.45, q.y-0.2*rr2, rr2*0.78, 0, 7); g.fill();
        g.beginPath(); g.arc(q.x, q.y+rr2*0.14, rr2, 0, 7); g.fill();
        g.fillStyle = `rgba(255,255,255,${a*0.55})`;
        g.beginPath(); g.arc(q.x-rr2*0.2, q.y-rr2*0.3, rr2*0.42, 0, 7); g.fill();
      } else {
        // Realistische Flamme: additiv, aussen blau-violett → orange → weissgelber Kern
        g.save(); g.globalCompositeOperation = "lighter";
        g.fillStyle = `rgba(80,70,255,${Math.min(1,q.life*2.4)})`;
        g.beginPath(); g.ellipse(q.x, q.y, q.r*1.9, q.r*0.58, 0, 0, 7); g.fill();
        g.fillStyle = `rgba(255,120,30,${Math.min(1,q.life*3)})`;
        g.beginPath(); g.ellipse(q.x+2, q.y, q.r*1.25, q.r*0.42, 0, 0, 7); g.fill();
        g.fillStyle = `rgba(255,235,160,${Math.min(1,q.life*3.6)})`;
        g.beginPath(); g.ellipse(q.x+4, q.y, q.r*0.68, q.r*0.26, 0, 0, 7); g.fill();
        g.restore();
      }
    }
    // Speedlines
    if (p.v > 30){
      g.strokeStyle = `rgba(255,255,255,${Math.min(.30,(p.v-30)/180)})`;
      g.lineWidth = 1.5;
      for (let i=0;i<14;i++){
        const y = (i*79 + (camS*40)%79)%H;
        const x = W - (camS*pxPerM*3 + i*173)%W;
        g.beginPath(); g.moveTo(x,y); g.lineTo(x - p.v*0.9, y); g.stroke();
      }
      // Wind-Streaks auf Autohöhe
      g.strokeStyle = `rgba(255,255,255,${Math.min(.4,(p.v-30)/140)})`;
      g.lineWidth = 2;
      for (let i=0;i<3;i++){
        const yy = py + carH*(0.25+0.25*i) + Math.sin(st.t*30+i*2)*2;
        g.beginPath(); g.moveTo(px - 8, yy); g.lineTo(px - 8 - p.v*0.7 - i*12, yy); g.stroke();
      }
    }
    g.restore();
    drawTree();
    drawTacho();
    drawTop();
    // FINISH-Stempel + Weissblitz (ausserhalb des Shakes)
    if (st.doneT != null && st.t - st.doneT < 1.2){
      const k = Math.min(1, (st.t - st.doneT) * 5);
      g.save(); g.translate(W/2, H*0.32); g.scale(0.6+0.4*k, 0.6+0.4*k);
      g.fillStyle = `rgba(255,255,255,${Math.max(0, 1-(st.t-st.doneT)/1.2)})`;
      g.font = "italic 900 54px system-ui"; g.textAlign = "center";
      g.fillText("FINISH!", 0, 0); g.restore();
    }
    if (st.flash > 0.02){
      g.fillStyle = `rgba(255,255,255,${Math.min(.6, st.flash)*.6})`;
      g.fillRect(0, 0, W, H);
    }
  }

  function drawCar(body, wheel, ax, x, y, w, h, wr, pitch, wa){
    const rearX = x + ax[0]*w, frontX = x + ax[1]*w;
    const axleY = y + (150/200)*h;
    const wells = body._wells;          // Foto-Auto: Räder HINTER die Karosserie
    const sc = w/480;
    const drawWheels = () => {
      for (let i = 0; i < 2; i++){
        // Foto-Auto: exakte detektierte Radposition aus _wells (x/y in 480×200)
        const wx = wells ? x + (wells[i].x/480)*w : (i === 0 ? rearX : frontX);
        const wy = wells ? y + (wells[i].y/200)*h : axleY;
        let r = wr;
        if (wells){
          g.fillStyle = "#05070a";      // Radhaus deckt das GANZE radierte Loch
          const hy = y + ((wells[i].hy ?? wells[i].y)/200)*h;   // Loch folgt der Tieferlegung
          g.beginPath(); g.arc(wx, hy, (wells[i].hole ?? wells[i].r)*sc, 0, 7); g.fill();
          r = wells[i].r*sc - 2;        // Rad füllt sein Radhaus (Drag-Slicks grösser)
        }
        // Sprite hat 2px Leer-Rand rundum → hochskalieren, damit der Reifen
        // wirklich Radius r bekommt (sonst ~5% zu klein, Ring-Lücke im Radhaus)
        const dr = r * (wheel.width / (wheel.width - 4));
        g.save(); g.translate(wx, wy); g.rotate(wa % (Math.PI*2));
        g.drawImage(wheel, -dr, -dr, dr*2, dr*2);
        g.restore();
      }
    };
    if (wells) drawWheels();            // Foto: Rad unter dem Kotflügel (echte Tieferlegung)
    // Karosserie: Rotation um Hinterachse (Squat) + leichtes Eintauchen
    g.save();
    g.translate(rearX, axleY);
    g.rotate(-pitch);
    g.translate(-rearX, -axleY);
    g.drawImage(body, x, y + pitch*14, w, h);
    g.restore();
    if (!wells) drawWheels();           // SVG: Räder oben drauf (deckende Radhäuser)
  }

  function lineMarker(x){
    if (x<-40||x>W+40) return;
    const roadY = (H>W?H*0.55:H*0.70), laneH = Math.min(H*0.135,120), hz = roadY-laneH*1.7;
    for (let i=0;i<14;i++){
      g.fillStyle = i%2 ? "#e8e8ee" : "#141419";
      g.fillRect(x, hz+6 + i*(laneH*2.8/14), 9, laneH*2.8/14);
    }
  }
  function puff(x,y,kind,scale=1){
    parts.push({x,y,kind, life: kind==="flame"?.16+scale*0.03:1.05,
      vx:(Math.random()-.5)*36-(kind==="smoke"?55:0), vy:-24-Math.random()*36,
      r: (kind==="flame"?6+Math.random()*8:12+Math.random()*18)*scale});
  }

  function drawTree(){
    if (st.green != null && st.t - st.green > 1.1) return;
    const x = W/2, y = H*0.22, r = Math.min(15, W*0.024+8);
    const tt = st.treeT;
    const gelbAt = Math.max(0.9, (st.greenAt ?? 2.2) - 1.0);
    const rot   = st.green == null;
    const gelb  = st.green == null && tt >= gelbAt;
    const gruen = st.green != null;
    // Gehäuse mit Metall-Verlauf + Schirmchen über den Lampen
    const hw = r*1.9, hy = y - r*1.8, hh = r*8.6;
    const hg = g.createLinearGradient(x-hw, 0, x+hw, 0);
    hg.addColorStop(0,"#2c2f38"); hg.addColorStop(.5,"#171a21"); hg.addColorStop(1,"#0a0b10");
    g.fillStyle = hg; rr(x-hw, hy, hw*2, hh, r*0.9); g.fill();
    g.strokeStyle = "rgba(255,255,255,.16)"; g.lineWidth = 1.5;
    rr(x-hw, hy, hw*2, hh, r*0.9); g.stroke();
    const lamps = [
      { on: rot,   c:"#FF2D2D", off:"#380e12" },
      { on: gelb,  c:"#FFC61A", off:"#382c08" },
      { on: gruen, c:"#2BE05E", off:"#0b2f18" },
    ];
    lamps.forEach((l,i)=>{
      const ly = y + i*r*2.7;
      // Schirmchen
      g.fillStyle = "#05060a";
      g.beginPath(); g.ellipse(x, ly-r*1.02, r*1.28, r*0.42, 0, Math.PI, 0); g.fill();
      // Fassung
      g.fillStyle = "#05060a"; g.beginPath(); g.arc(x, ly, r*1.18, 0, 7); g.fill();
      if (l.on){
        // Bloom aussen
        const bl = g.createRadialGradient(x, ly, r*0.4, x, ly, r*3.0);
        bl.addColorStop(0, l.c+"55"); bl.addColorStop(1, l.c+"00");
        g.fillStyle = bl; g.beginPath(); g.arc(x, ly, r*3.0, 0, 7); g.fill();
        // Lampe: heisses Zentrum → Farbe
        const lg = g.createRadialGradient(x-r*0.25, ly-r*0.28, r*0.1, x, ly, r);
        lg.addColorStop(0, "#ffffff"); lg.addColorStop(.3, l.c); lg.addColorStop(1, l.c);
        g.fillStyle = lg; g.beginPath(); g.arc(x, ly, r, 0, 7); g.fill();
      } else {
        g.fillStyle = l.off; g.beginPath(); g.arc(x, ly, r, 0, 7); g.fill();
      }
      // Glas-Glanzpunkt
      g.fillStyle = `rgba(255,255,255,${l.on ? .75 : .12})`;
      g.beginPath(); g.ellipse(x-r*0.32, ly-r*0.42, r*0.3, r*0.18, -0.5, 0, 7); g.fill();
    });
    // Sound: Rot- und Gelb-Beep
    if (tt >= 0.15 && !st._bR){ st._bR = 1; AudioSys.beep(300,.12,.28); }
    if (gelb && !st._bY){ st._bY = 1; AudioSys.beep(440,.12,.3); }
    // Status-Text unter der Ampel
    g.font = "800 13px system-ui"; g.textAlign = "center";
    if (st.live && st.phase === "pre" && Date.now() < st.live.startAt){
      g.fillStyle = "#FFC61A"; g.font = "900 24px system-ui";
      g.fillText("LIVE — Start in " + Math.ceil((st.live.startAt - Date.now())/1000) + "…", x, y + r*11.4);
      g.font = "800 13px system-ui";
    }
    if (st.green == null){
      g.fillStyle = "rgba(255,255,255,.8)";
      g.fillText("Gas pumpen — Nadel in der GRÜNEN ZONE halten!", x, y + r*9.6);
    }
    if (st.green != null && !st.p.launched){
      g.fillStyle = "#2BE05E"; g.font = "900 26px system-ui";
      g.fillText("GAS!!", x, y + r*9.8);
    }
  }

  // Realistischer Rundinstrument-Tacho mit grüner Schaltzone
  function drawTacho(){
    const p = st.p, def = p.spec.def;
    let R = Math.min(100, W*0.155);
    let cxx = W/2;
    let cy = H - Math.min(152, H*0.185);
    // Touch-Control-Kanten (müssen zum CSS passen: #pGas 22vw/max112 links:20,
    // #pShift kompakt 26vw/max96 rechts:16)
    const pedalRight = 20 + Math.min(W*0.22, 112);
    const shifterLeft = W - 16 - Math.min(W*0.26, 96);
    if (W < 900 && H > W){
      // Mobil HOCHFORMAT (9:16): Tacho GROSS unten in der Mitte — zwischen
      // Gaspedal (links) und kompaktem Schalthebel (rechts). Nie übers Auto
      // (das steht weit oberhalb), nie über die Controls.
      const gap = shifterLeft - pedalRight;                // freie Lücke unten Mitte
      R = Math.max(48, Math.min(78, gap/2 - 16 - 4));      // so gross wie die Lücke erlaubt
      cxx = (pedalRight + shifterLeft) / 2;                // Lückenmitte (leicht links von W/2)
      cy = H - 18 - (R + 16);                              // bündig mit den Controls
    } else if (W < 900 && H <= W){
      // Mobil QUERFORMAT: kleiner + unten in die freie Lücke zwischen
      // Auto/Gaspedal (links) und Schalthebel (rechts).
      R = Math.min(66, H*0.17);
      cy = H - (R + 16) - 10;                    // Gehäuse-Unterkante ~10px über Rand
      const carFront = W*0.30 + Math.min(W*0.38, 280)/2;   // rechte Kante Spielerauto
      cxx = Math.max(W/2, carFront + R + 26);              // rechts vom Auto …
      cxx = Math.min(cxx, shifterLeft - R - 22);           // … aber links vom Schalthebel
    }
    const maxR = def.redline + 1000;
    const a0 = Math.PI*0.78, a1 = Math.PI*2.22;
    const ang = f => a0 + (a1-a0)*Math.min(1, Math.max(0, f));

    // Gehäuse (dunkles Zifferblatt) + Chrom-Lünette wie ein echtes Rundinstrument
    const bg = g.createRadialGradient(cxx,cy,R*0.2, cxx,cy,R+18);
    bg.addColorStop(0,"#181a20"); bg.addColorStop(.85,"#0d0e13"); bg.addColorStop(1,"#05060a");
    g.fillStyle = bg; g.beginPath(); g.arc(cxx,cy,R+16,0,7); g.fill();
    const bez = g.createLinearGradient(cxx-R,cy-R, cxx+R,cy+R);
    bez.addColorStop(0,"#d9dde4"); bez.addColorStop(.42,"#7a828c");
    bez.addColorStop(.58,"#3a3f47"); bez.addColorStop(1,"#181b21");
    g.strokeStyle = bez; g.lineWidth = 5;
    g.beginPath(); g.arc(cxx,cy,R+13,0,7); g.stroke();
    g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = 2;
    g.beginPath(); g.arc(cxx,cy,R+16,0,7); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.09)"; g.lineWidth = 1;
    g.beginPath(); g.arc(cxx,cy,R+9,0,7); g.stroke();

    // GRÜNE Schaltzone + rote Über-Redline-Zone
    const [z0,z1] = shiftZone(def);
    g.lineWidth = 13; g.lineCap="butt";
    g.strokeStyle = "rgba(43,224,94,.85)";
    g.beginPath(); g.arc(cxx,cy,R-4, ang(z0/maxR), ang(z1/maxR)); g.stroke();
    g.strokeStyle = "rgba(255,45,64,.9)";
    g.beginPath(); g.arc(cxx,cy,R-4, ang(def.redline/maxR), a1); g.stroke();

    // Ticks + Ziffern (pro 1000 rpm)
    for (let k=0; k<=Math.floor(maxR/1000); k++){
      const a = ang(k*1000/maxR);
      const big = true;
      const r1 = R-1, r2 = R-11;
      g.strokeStyle = k*1000 >= def.redline ? "#FF2D40" : "rgba(255,255,255,.85)";
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(cxx+Math.cos(a)*r1, cy+Math.sin(a)*r1);
      g.lineTo(cxx+Math.cos(a)*r2, cy+Math.sin(a)*r2); g.stroke();
      g.fillStyle = k*1000 >= def.redline ? "#FF2D40" : "rgba(255,255,255,.82)";
      g.font = `italic 800 ${Math.max(10,R*0.16)}px system-ui`; g.textAlign="center"; g.textBaseline="middle";
      g.fillText(k, cxx+Math.cos(a)*(R-24), cy+Math.sin(a)*(R-24));
      // Zwischenticks
      if (k < Math.floor(maxR/1000)){
        const ah = ang((k*1000+500)/maxR);
        g.strokeStyle = "rgba(255,255,255,.3)"; g.lineWidth=1.5;
        g.beginPath();
        g.moveTo(cxx+Math.cos(ah)*(R-2), cy+Math.sin(ah)*(R-2));
        g.lineTo(cxx+Math.cos(ah)*(R-8), cy+Math.sin(ah)*(R-8)); g.stroke();
      }
    }
    // ZU-SPÄT / Zone-Feedback
    const inZone = p.rpm>=z0 && p.rpm<=z1;
    if (!p.launched && st.phase !== "done"){
      if (inZone){
        g.fillStyle = `rgba(43,224,94,${0.55+0.45*Math.sin(st.t*20)})`;
        g.font = "900 17px system-ui"; g.textAlign="center";
        g.fillText("LAUNCH BEREIT — HALTEN!", cxx, cy - R - 30);
      } else if (p.rpm > z1){
        g.fillStyle = "#FF2D40"; g.font = "900 17px system-ui"; g.textAlign="center";
        g.fillText("ZU HOCH — LOSLASSEN!", cxx, cy - R - 30);
      } else if (p.rpm > def.idle + 200){
        g.fillStyle = "rgba(255,255,255,.6)"; g.font = "800 14px system-ui"; g.textAlign="center";
        g.fillText("höher in die grüne Zone …", cxx, cy - R - 30);
      }
    }
    if (p.launched && !p.finished && p.gear < p.spec.gears.length-1){
      if (inZone){
        g.fillStyle = `rgba(43,224,94,${0.5+0.5*Math.sin(st.t*22)})`;
        g.font = "900 16px system-ui"; g.textAlign="center";
        g.fillText("JETZT SCHALTEN", cxx, cy - R - 30);
      } else if (p.rpm > z1){
        g.fillStyle = "#FF2D40"; g.font = "900 16px system-ui"; g.textAlign="center";
        g.fillText(p.rpm >= def.redline ? "BEGRENZER!" : "ZU SPÄT!", cxx, cy - R - 30);
      }
    }
    // Nadel
    const na = ang(p.rpm/maxR);
    g.save();
    g.shadowColor = inZone ? "#2BE05E" : "#FF2D40"; g.shadowBlur = 8;
    g.strokeStyle = "#FF4A3C"; g.lineWidth = 4; g.lineCap="round";
    g.beginPath(); g.moveTo(cxx - Math.cos(na)*R*0.14, cy - Math.sin(na)*R*0.14);
    g.lineTo(cxx + Math.cos(na)*(R-14), cy + Math.sin(na)*(R-14)); g.stroke();
    g.restore();
    g.fillStyle = "#22242c"; g.beginPath(); g.arc(cxx,cy,R*0.13,0,7); g.fill();
    g.strokeStyle = "#3c4049"; g.lineWidth=2; g.beginPath(); g.arc(cxx,cy,R*0.13,0,7); g.stroke();

    // "RPM ×1000" Beschriftung (echtes Instrument)
    g.fillStyle = "rgba(255,255,255,.45)"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 ${Math.max(8,R*0.11)}px system-ui`;
    g.fillText("RPM", cxx, cy - R*0.40);
    g.font = `700 ${Math.max(7,R*0.085)}px system-ui`;
    g.fillText("×1000", cxx, cy - R*0.40 + R*0.14);

    // Gang im grünen LCD-Fenster (Oldschool-Tuner-Bordcomputer) + Speed digital
    const lw = R*0.44, lh = R*0.34, lx = cxx - lw/2, ly = cy + R*0.28;
    g.fillStyle = "#07130a"; rr(lx, ly, lw, lh, 4); g.fill();
    g.strokeStyle = "rgba(120,255,150,.3)"; g.lineWidth = 1; rr(lx, ly, lw, lh, 4); g.stroke();
    g.fillStyle = "#39FF6A"; g.shadowColor = "#39FF6A"; g.shadowBlur = 6;
    g.font = `900 ${R*0.25}px ui-monospace,Menlo,monospace`;
    g.fillText(p.launched ? String(p.gear+1) : "N", cxx, ly + lh/2 + 1);
    g.shadowBlur = 0;
    g.textBaseline = "alphabetic";
    g.fillStyle = "#fff"; g.font = `800 ${Math.max(13,R*0.16)}px system-ui`;
    g.fillText(Math.round(p.v*3.6), cxx, cy + R*0.84);
    g.font = "700 9px system-ui"; g.fillStyle = "#8E92A3";
    g.fillText("km/h", cxx, cy + R*0.96);

    // NITRO-Balken (rot-orange wie der Knopf)
    if (p.spec.nosMax > 0){
      const bw = R*1.4;
      g.fillStyle = "#1e2027"; rr(cxx-bw/2, cy+R+4, bw, 7, 4); g.fill();
      const ng2 = g.createLinearGradient(cxx-bw/2, 0, cxx+bw/2, 0);
      ng2.addColorStop(0, "#FF3B2D"); ng2.addColorStop(1, "#FF8A2D");
      g.fillStyle = ng2; rr(cxx-bw/2, cy+R+4, bw*(p.nos/p.spec.nosMax), 7, 4); g.fill();
    }
    // Launch-Feedback (PERFECT START / GUTER START)
    if (p.launchQ && p.launchAt && st.t - p.launchAt < 1.5){
      g.fillStyle = "#2BE05E"; g.font = "900 22px system-ui"; g.textAlign = "center";
      g.fillText(p.launchQ + " +BOOST", cxx, cy - R - 54);
    }
    // Schaltqualität
    if (p.lastShiftQ && p.shifting > 0){
      const col = {PERFECT:"#2BE05E", GUT:"#FFB020", "SPÄT":"#FF2D40", "FRÜH":"#8E92A3"}[p.lastShiftQ];
      g.fillStyle = col; g.font="900 24px system-ui"; g.textAlign="center";
      g.fillText(p.lastShiftQ + (p.lastShiftQ==="PERFECT" ? " +BOOST" : ""), cxx, cy - R - 52);
    }
  }

  function drawTop(){
    const p = st.p, o = st.ai.racer;
    const y = Math.max(56, H*0.075), x0=W*0.14, x1=W*0.86;
    g.fillStyle = "rgba(255,255,255,.12)"; rr(x0,y,x1-x0,5,3); g.fill();
    const pf = Math.min(1,p.s/raceDist), of = Math.min(1,o.s/raceDist);
    g.fillStyle = "#8E92A3"; g.beginPath(); g.arc(x0+(x1-x0)*of, y+2.5, 5, 0, 7); g.fill();
    g.fillStyle = "#FF2D40"; g.beginPath(); g.arc(x0+(x1-x0)*pf, y+2.5, 7, 0, 7); g.fill();
    g.font="700 10px system-ui"; g.textAlign="center"; g.fillStyle="#666a78";
    g.fillText(raceDist > QMILE ? "½ MEILE" : "¼ MEILE", (x0+x1)/2, y-8);
    if (st.green != null && p.launched){
      const t = (p.finished ? p.time : st.t) - st.green;
      g.font="800 17px ui-monospace,monospace"; g.fillStyle="#F2F3F7"; g.textAlign="left";
      g.fillText(t.toFixed(2)+"s", 16, y+30);
      if (p.rt != null){ g.font="600 11px system-ui"; g.fillStyle="#8E92A3"; g.fillText("RT "+p.rt.toFixed(3), 16, y+46); }
    }
  }

  function rr(x,y,w,h,r){
    g.beginPath();
    g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
    g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
  }

  return {
    start, stop, input,
    shift(){
      if (!st) return null;
      const q = doShift(st.p);
      if (q){ AudioSys.shiftPop(UI?.currentExhaust?.() ?? 0); if (st.p.spec.turbo) AudioSys.bov(); }
      if (q === "PERFECT"){
        st.shake = Math.min(1, (st.shake||0) + 0.25);
        st.flash = Math.max(st.flash||0, 0.2);
        AudioSys.whoosh();
      }
      return q;
    },
    nos(on){ if (st){ input.nos = on; AudioSys.nosHiss(on && st.p.nos>0); } },
    active(){ return !!st; },
    gear(){ return st ? st.p.gear : 0; },
    launched(){ return !!st?.p.launched; },
    // LIVE-Duell: eigenen Zustand melden / Gegner-Zustand einspeisen
    snapshot(){
      if (!st) return null;
      const p = st.p;
      return { s: p.s, v: p.v, fin: p.finished,
               et: (p.finished && p.time != null && st.green != null) ? p.time - st.green : null };
    },
    setRemote(payload){
      if (!st) return;
      st.remote = { ...payload, rxAt: performance.now() };
      if (payload.et != null) st.remoteEt = payload.et;
    },
    debug(){ return st && { rpm: Math.round(st.p.rpm), green: st.green != null,
      launched: st.p.launched, launchQ: st.p.launchQ, boostMul: st.p.boostMul,
      phase: st.phase, zone: shiftZone(st.p.spec.def) }; },
  };
})();
