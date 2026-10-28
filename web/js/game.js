// game.js v2 — Physik + Rennlogik + Rendering (Eigenentwicklung).
// Neu: Squat-Animation (Heck taucht beim Beschleunigen, Front hebt — Rotation um
// die Hinterachse mit Feder), rotierende Rad-Sprites, realistischer Rundinstrument-
// Tacho mit GRÜNER Schaltzone (+PERFECT-Boost) und ZU-SPÄT-Anzeige, Ampel startet
// automatisch, Streckenobjekte (Lichtmasten, Distanztafeln, Tribüne, Leitplanken)
// für echtes Geschwindigkeitsgefühl, endlose Gegnerleiter.

// Physik, Rivalen und KI liegen seit 22.10.2026 in sim.js (DOM-frei, testbar).
let raceDist = QMILE;   // pro Rennen gesetzt (Race.start), nur fürs Zeichnen

// ── Rennen ───────────────────────────────────────────────────────────────────
const Race = (() => {
  const cv = document.getElementById("cv");
  let g = cv.getContext("2d", { alpha:false });   // let: Tacho-Cache zeichnet kurz in einen eigenen Kontext
  let W=0,H=0,dpr=1;
  const BG = "#0A0A0E";
  function resize(){
    dpr = Math.min(2, window.devicePixelRatio||1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W*dpr; cv.height = H*dpr;
    g.setTransform(dpr,0,0,dpr,0,0);
    g.fillStyle = BG; g.fillRect(0,0,W,H);
    gradCache.key = ""; tachoCache.key = "";
  }
  // Performance (28.10.): statische Verläufe + Tacho-Zifferblatt nur bei Grössenänderung neu bauen
  const gradCache = { key:"" }, tachoCache = { key:"", cv:null };
  window.addEventListener("resize", resize); resize();

  let st=null, raf=0, lastT=0, acc=0;
  const DT=1/120;
  let onDone=null;
  const parts=[];
  const input = { gas:false, nos:false };

  // Ereignis-Haken für die UI (Knauf-Animation, PERFECT-Blitz)
  let onEvent = null;
  async function start(opts){
    onDone = opts.onDone;
    onEvent = opts.onEvent ?? null;
    const opp = opts.opp;
    raceDist = opp.half ? HMILE : QMILE;
    const spec = buildSpec(opts.carKey, opts.carState, raceDist);
    const style = opts.carState.style;
    let oSpec, oStyle, ai = null;
    if (opts.duo || opp.vsGhost){
      // Echtes Auto eines Menschen (Duo / Freund-Link): exakt sein Setup
      const ost = { up: opp.up, tune: opp.tune };
      oSpec = buildSpec(opp.car, ost, raceDist);
      oStyle = opp.style ?? { hue: opp.hue ?? 0, drop:10, rim:1, exhaust:1, spoiler:1 };
      if (opp.vsGhost) ai = aiCreate(oSpec, 0.7);
    } else {
      // KI-Rivale: feste Stärke aus der Liga (nicht ans Spieler-Setup angeglichen)
      oSpec = rivalSpec(opp, opts.nerves ?? 0);
      oStyle = { hue: opp.hue ?? 0, drop:10, rim:1 + (opp.tier ?? 0) % 3, exhaust: Math.min(3, 1 + Math.floor((opp.league ?? 0)/2)),
                 spoiler: (opp.league ?? 0) >= 2 ? 2 : 1, kit: (opp.league ?? 0) >= 4 ? 2 : (opp.league ?? 0) >= 2 ? 1 : 0 };
      ai = aiCreate(oSpec, opp.skill ?? 0.5);
    }
    const [pBody, oBody] = await Promise.all([
      carBodyImage(opts.carKey, style),
      carBodyImage(opp.car, oStyle),
    ]);
    const greenAt = opts.duo ? opts.duo.greenAt : 2.6 + Math.random()*0.8;
    const run = runCreate(spec, greenAt);
    const remoteRacer = makeRacer(oSpec);
    st = {
      run, phase:"pre", t:0, treeT:0, green:null, greenAt,
      p: run.p, pBody, pWheel: wheelSprite(style.rim??0, 40),
      pAx: carAx(opts.carKey, spec.def), pPitch:0, pPitchV:0,
      ai: ai ?? { racer: remoteRacer },
      isAI: !!ai,
      oBody, oWheel: wheelSprite(oStyle.rim??1, 40),
      oAx: carAx(opp.car, oSpec.def), oPitch:0, oPitchV:0,
      opp, doneT:null, flash:0, exh: style.exhaust ?? 0,
      exTipF: exhaustXFrac(opts.carKey, spec.def), neon: !!style.neon, hue: style.hue ?? 0,
      duo: opts.duo ?? null, remote: null, waiting: !!opts.duo, ended:false,
    };
    input.gas = false; input.nos = false; input.shiftReq = false;
    AudioSys.unlock(); AudioSys.startEngine(soundProfile(opts.carKey, style.exhaust ?? 0));
    const sh = document.getElementById("pShift"); if (sh) sh.dataset.gear = "0";
    parts.length = 0;
    lastT = performance.now(); acc = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  function stop(){
    cancelAnimationFrame(raf); AudioSys.stopEngine(); AudioSys.skid(false); st=null;
    input.gas = false; input.nos = false; input.shiftReq = false;
  }
  function clear(){ if (!st){ g.fillStyle = BG; g.fillRect(0, 0, W, H); } }

  function physics(dt){
    const run = st.run, p = st.p;
    // Duo: bis zum gemeinsamen Startzeitpunkt nur warten (Countdown, kein Motor-Input
    // → beide Läufe starten exakt gleich bei Tick 0)
    if (st.waiting){
      if (Date.now() < st.duo.startAt){ p.throttle = 0; stepRacer(p, dt, 0); return; }
      st.waiting = false; p.rpm = p.spec.def.idle;
    }
    const wasLaunched = p.launched;
    const ev = runTick(run, { gas: input.gas, nos: input.nos, shift: input.shiftReq });
    input.shiftReq = false;
    st.t = run.t; st.treeT = run.treeT;
    if (run.green != null && st.green == null){ st.green = run.green; AudioSys.beep(880,.3,.4); }
    if (run.phase === "tree" && st.phase === "pre") st.phase = "tree";
    if (st.phase === "tree"){
      // ANTI-LAG beim Launch-Control: Nadel oben halten → der Auspuff ballert
      if (!p.launched && p.rpm > p.spec.def.redline*0.52 && Math.random() < dt*(5 + st.exh*2)){
        AudioSys.bang(0.5 + st.exh*0.3);
        st.antilag = 2 + ((Math.random()*3)|0);
        st.shake = Math.min(1, (st.shake||0) + 0.08);
      }
    }
    if (ev?.launch || (!wasLaunched && p.launched)){
      st.phase = "run";
      st.shake = Math.min(1, (st.shake||0) + 0.45);
      if (p.launchQ){ st.flash = 0.35; AudioSys.whoosh(); }
      onEvent?.({ launch:true });
    }
    if (ev?.shift){
      AudioSys.shiftPop(st.exh); if (p.spec.turbo) AudioSys.bov();
      if (ev.shift === "PERFECT"){
        st.shake = Math.min(1, (st.shake||0) + 0.25);
        st.flash = Math.max(st.flash||0, 0.2);
        AudioSys.whoosh();
      }
      onEvent?.({ shift: ev.shift, gear: p.gear });
    }
    if (st.phase === "run" && p.launched && !p.finished && p.throttle && p.rpm > p.spec.def.redline*0.6 &&
        Math.random() < dt*(0.30 + st.exh*0.15)){
      AudioSys.bang(0.9 + st.exh*0.4);
      st.antilag = 3 + ((Math.random()*3)|0);
      st.shake = Math.min(1, (st.shake||0) + 0.12);
    }
    st.isAI ? aiStep(dt) : remoteStep(dt);
    if (p.finished && st.doneT == null){
      st.doneT = st.t;
      st.shake = Math.min(1, (st.shake||0) + 0.5);
      st.flash = 0.5;
      if (st.duo) st.duo.onLocalFinish?.({ et: runEt(run), trap: p.trap, rt: p.rt, events: run.events.slice(),
        perfects: p.perfects, launchQ: p.launchQ });
    }
    if (!st.duo && st.phase !== "done"){
      const o = st.ai.racer;
      if (st.doneT != null && (st.t - st.doneT > 2.0 || o.finished)){ st.phase = "done"; setTimeout(finish, 350); }
      // Rivale längst im Ziel, Spieler kommt nicht an (nicht gestartet) → Niederlage
      else if (st.doneT == null && o.finished && st.green != null && st.t - st.green - o.time > 6){
        st.phase = "done"; setTimeout(finish, 350);
      }
    }
  }
  // Duo: Gegner-Auto aus zeitgestempelten Snapshots (Tick-Index) — Position wird auf
  // den EIGENEN Tick hochgerechnet, unabhängig von der Netz-Latenz.
  function remoteStep(dt){
    const o = st.ai.racer, R = st.remote;
    if (!R) return;
    o.launched = R.s > 0.05 || R.v > 0;
    const ahead = Math.max(0, Math.min(0.6, (st.run.tick - R.tick) / 120));
    const target = R.fin ? Math.max(o.s, R.s) : R.s + R.v*ahead;
    o.s += (target - o.s) * Math.min(1, 12*dt);
    o.v = R.v;
    o.wheelA += (o.v / o.spec.def.wheelR) * dt;
    o.aVis = R.a ?? 0;
    o.rpm = R.rpm ?? o.rpm;
    if (R.fin && !o.finished){ o.finished = true; }
  }
  function aiStep(dt){
    if (st.green == null) return;
    aiTick(st.ai, dt, st.t - st.green, true);
  }
  function finish(){
    const p = st.p, o = st.ai.racer;
    AudioSys.stopEngine(); AudioSys.skid(false);
    const pT = runEt(st.run) ?? Infinity;
    const oT = o.time != null ? o.time : Infinity;
    const win = pT < oT;
    win ? AudioSys.winJingle() : AudioSys.loseThud();
    const res = { win, et:pT, trap:p.trap, rt:p.rt, oppEt: oT===Infinity?null:oT, opp: st.opp,
                  perfects: p.perfects, launchQ: p.launchQ };
    const cb = onDone; stop(); cb && cb(res);
  }
  // Duo: Ergebnis steht fest (beide im Ziel / Abbruch) → Rennen beenden
  function endDuo(){ if (st){ st.ended = true; stop(); } }

  // ── Render ──
  function loop(now){
    raf = requestAnimationFrame(loop);
    if (!st) return;
    let dt = (now-lastT)/1000; lastT = now;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    while (acc >= DT && st){ physics(DT); acc -= DT; }
    if (!st) return;
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
    g.beginPath();
    for (let i=0;i<5;i++){
      const yy = y + h*(0.30 + 0.13*i) + Math.sin(t*40 + i*2)*2;
      const len = w*(0.36 + 0.16*Math.sin(t*30 + i*1.3));
      g.moveTo(x - 4, yy); g.lineTo(x - 4 - len, yy + (i-2)*2.4);
    }
    g.stroke();
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
    g.fillStyle = BG; g.fillRect(0,0,W,H);
    // Screenshake + Blitz abklingen lassen
    st.shake = (st.shake||0)*Math.exp(-5*dt);
    st.flash = (st.flash||0)*Math.exp(-4*dt);
    if (p.launched && !p.finished && p.rpm >= p.spec.def.redline && p.throttle>0)
      st.shake = Math.max(st.shake, 0.06);        // Begrenzer rüttelt
    g.save();
    if (st.shake > 0.01) g.translate((Math.random()-.5)*st.shake*16, (Math.random()-.5)*st.shake*11);

    // Himmel
    const gk = hz + "|" + roadY + "|" + laneH;
    if (gradCache.key !== gk){
      gradCache.key = gk;
      gradCache.sky = g.createLinearGradient(0,0,0,hz);
      gradCache.sky.addColorStop(0,"#0B0D18"); gradCache.sky.addColorStop(.7,"#141126"); gradCache.sky.addColorStop(1,"#221636");
      gradCache.cone = g.createLinearGradient(0,hz-90,0,roadY+laneH);
      gradCache.cone.addColorStop(0,"rgba(255,240,190,.10)"); gradCache.cone.addColorStop(1,"rgba(255,240,190,0)");
    }
    g.fillStyle = gradCache.sky; g.fillRect(0,0,W,hz);
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
      g.fillStyle = gradCache.cone;
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

    // Partikel — Mengen sind «pro 60-Hz-Frame» gedacht; k skaliert auf die echte Bildrate
    // (ProMotion 120 Hz würde sonst doppelt so viele Wolken/Flammen erzeugen → Ruckeln)
    const k60 = Math.min(3, dt*60);
    const chance = n => Math.random() < n*k60;
    if (p.spin > 0.3 && p.launched && !p.finished){
      if (chance(0.7)) puff(px+carW*(0.14+Math.random()*0.1), py+carH*0.92, "smoke");
      if (chance(0.7)) puff(px+carW*(0.24+Math.random()*0.12), py+carH*0.90, "smoke");
      if (p.spin > 0.6 && chance(0.5)) puff(px+carW*0.05, py+carH*0.88, "smoke");
    }
    const exF = 1 + st.exh*0.55;                       // Auspuff-Kit → Flammengrösse
    const exX = px + st.exTipF*carW;                   // echte Heckkante des Autos
    if (p.nosOn && chance(1)) puff(exX-4, py+carH*0.80, "flame", exF);
    if (p.shifting > p.spec.shiftTime*0.6 && chance(1)){
      puff(exX-2, py+carH*0.80, "flame", exF);
      if (st.exh >= 1) puff(exX-6, py+carH*0.84, "flame", exF*0.8);  // Duplex: 2. Flamme
      if (st.exh >= 2 && Math.random()<.6) puff(exX-12, py+carH*0.80, "flame", exF); // Big Bore+
    }
    if (p.overRev && chance(0.10 + st.exh*0.12))                     // Begrenzer-Crackle
      puff(exX-4, py+carH*0.81, "flame", 0.6 + st.exh*0.4);
    // Anti-Lag-/Backfire-Flammen (von physics() via st.antilag angestossen, 1 Stoss je 60-Hz-Frame)
    if (st.antilag > 0 && chance(1)){
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
    let wP = 0, nFlame = 0;
    for (let i=0;i<parts.length;i++){
      const q = parts[i]; q.life -= dt; if (q.life<=0) continue;
      q.x += q.vx*dt - p.v*pxPerM*dt*0.4; q.y += q.vy*dt;
      parts[wP++] = q;
      if (q.kind!=="smoke"){ nFlame++; continue; }
      // Comic-Wolke: Blumenkohl aus 3 Kreisen (ein Pfad) + heller Kern
      const a = q.life*0.30, rr2 = q.r*(2.1-q.life);
      g.fillStyle = `rgba(222,226,234,${a})`;
      g.beginPath();
      g.moveTo(q.x-rr2*0.45+rr2*0.72, q.y-rr2*0.15); g.arc(q.x-rr2*0.45, q.y-rr2*0.15, rr2*0.72, 0, 7);
      g.moveTo(q.x+rr2*0.45+rr2*0.78, q.y-0.2*rr2);  g.arc(q.x+rr2*0.45, q.y-0.2*rr2, rr2*0.78, 0, 7);
      g.moveTo(q.x+rr2, q.y+rr2*0.14);               g.arc(q.x, q.y+rr2*0.14, rr2, 0, 7);
      g.fill();
      g.fillStyle = `rgba(255,255,255,${a*0.55})`;
      g.beginPath(); g.arc(q.x-rr2*0.2, q.y-rr2*0.3, rr2*0.42, 0, 7); g.fill();
    }
    parts.length = wP;
    if (nFlame){
      // Realistische Flamme: additiv, aussen blau-violett → orange → weissgelber Kern
      g.save(); g.globalCompositeOperation = "lighter";
      for (const q of parts){
        if (q.kind==="smoke") continue;
        g.fillStyle = `rgba(80,70,255,${Math.min(1,q.life*2.4)})`;
        g.beginPath(); g.ellipse(q.x, q.y, q.r*1.9, q.r*0.58, 0, 0, 7); g.fill();
        g.fillStyle = `rgba(255,120,30,${Math.min(1,q.life*3)})`;
        g.beginPath(); g.ellipse(q.x+2, q.y, q.r*1.25, q.r*0.42, 0, 0, 7); g.fill();
        g.fillStyle = `rgba(255,235,160,${Math.min(1,q.life*3.6)})`;
        g.beginPath(); g.ellipse(q.x+4, q.y, q.r*0.68, q.r*0.26, 0, 0, 7); g.fill();
      }
      g.restore();
    }
    // Speedlines
    if (p.v > 30){
      g.strokeStyle = `rgba(255,255,255,${Math.min(.30,(p.v-30)/180)})`;
      g.lineWidth = 1.5;
      g.beginPath();
      for (let i=0;i<14;i++){
        const y = (i*79 + (camS*40)%79)%H;
        const x = W - (camS*pxPerM*3 + i*173)%W;
        g.moveTo(x,y); g.lineTo(x - p.v*0.9, y);
      }
      g.stroke();
      // Wind-Streaks auf Autohöhe
      g.strokeStyle = `rgba(255,255,255,${Math.min(.4,(p.v-30)/140)})`;
      g.lineWidth = 2;
      g.beginPath();
      for (let i=0;i<3;i++){
        const yy = py + carH*(0.25+0.25*i) + Math.sin(st.t*30+i*2)*2;
        g.moveTo(px - 8, yy); g.lineTo(px - 8 - p.v*0.7 - i*12, yy);
      }
      g.stroke();
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
  const MAX_PARTS = 90;
  function puff(x,y,kind,scale=1){
    if (parts.length >= MAX_PARTS) parts.shift();
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
    if (st.waiting){
      g.fillStyle = "#FFC61A"; g.font = "italic 900 30px system-ui";
      g.fillText("DUO — START IN " + Math.max(1, Math.ceil((st.duo.startAt - Date.now())/1000)), x, y + r*11.4);
      g.font = "800 13px system-ui";
    }
    if (st.green == null && !st.waiting){
      const txt = "Gas pumpen — Nadel in der GRÜNEN ZONE halten!";
      g.font = `800 ${W < 380 ? 12 : 13}px system-ui`;
      const tw = g.measureText(txt).width + 22, ty = y + r*9.6;
      g.fillStyle = "rgba(10,10,14,.72)"; rr(x - tw/2, ty - 16, tw, 24, 12); g.fill();
      g.fillStyle = "rgba(255,255,255,.9)";
      g.fillText(txt, x, ty);
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

    const [z0,z1] = shiftZone(def);
    // Zifferblatt (Gehäuse, Lünette, Zonen, Skala, Ziffern) ist statisch → einmal in ein
    // Offscreen-Canvas zeichnen und pro Frame nur noch blitten (Text/Verläufe sind am iPhone teuer)
    const pad = 20, bx = cxx - R - pad, by = cy - R - pad, bs = 2*(R + pad);
    const fk = [W, H, dpr, R, cxx, cy, def.redline, z0, z1].join("|");
    if (tachoCache.key !== fk){
      tachoCache.key = fk;
      const oc = tachoCache.cv || (tachoCache.cv = document.createElement("canvas"));
      oc.width = Math.ceil(bs*dpr); oc.height = Math.ceil(bs*dpr);
      const main = g;
      g = oc.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, -bx*dpr, -by*dpr);
      try {
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
      // "RPM ×1000" Beschriftung (echtes Instrument)
      g.fillStyle = "rgba(255,255,255,.45)"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `700 ${Math.max(8,R*0.11)}px system-ui`;
      g.fillText("RPM", cxx, cy - R*0.40);
      g.font = `700 ${Math.max(7,R*0.085)}px system-ui`;
      g.fillText("×1000", cxx, cy - R*0.40 + R*0.14);
      } finally { g = main; }
    }
    g.drawImage(tachoCache.cv, bx, by, bs, bs);
    g.textBaseline = "middle";   // wie bisher nach den Ziffern (Zone-Hinweise darunter)
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
    // Glow ohne shadowBlur (Blur-Schatten kosten in WebKit pro Frame einen Weichzeichner-Durchgang)
    g.lineCap="round";
    g.beginPath(); g.moveTo(cxx - Math.cos(na)*R*0.14, cy - Math.sin(na)*R*0.14);
    g.lineTo(cxx + Math.cos(na)*(R-14), cy + Math.sin(na)*(R-14));
    g.strokeStyle = inZone ? "rgba(43,224,94,.35)" : "rgba(255,45,64,.35)"; g.lineWidth = 10; g.stroke();
    g.strokeStyle = "#FF4A3C"; g.lineWidth = 4; g.stroke();
    g.fillStyle = "#22242c"; g.beginPath(); g.arc(cxx,cy,R*0.13,0,7); g.fill();
    g.strokeStyle = "#3c4049"; g.lineWidth=2; g.beginPath(); g.arc(cxx,cy,R*0.13,0,7); g.stroke();


    // Gang im grünen LCD-Fenster (Oldschool-Tuner-Bordcomputer) + Speed digital
    const lw = R*0.44, lh = R*0.34, lx = cxx - lw/2, ly = cy + R*0.28;
    g.fillStyle = "#07130a"; rr(lx, ly, lw, lh, 4); g.fill();
    g.strokeStyle = "rgba(120,255,150,.3)"; g.lineWidth = 1; rr(lx, ly, lw, lh, 4); g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `900 ${R*0.25}px ui-monospace,Menlo,monospace`;
    g.fillStyle = "#39FF6A";
    g.fillText(p.launched ? String(p.gear+1) : "N", cxx, ly + lh/2 + 1);
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

  let _safeTop = null;
  function safeTop(){
    if (_safeTop == null){
      const d = document.createElement("div");
      d.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden";
      document.body.appendChild(d); _safeTop = d.getBoundingClientRect().height || 0; d.remove();
      window.addEventListener("resize", () => { _safeTop = null; }, { once:true });
    }
    return _safeTop;
  }
  function drawTop(){
    const p = st.p, o = st.ai.racer;
    // unter Statusleiste (Safe-Area) + HUD-Titel (2 Zeilen) — nie darüber
    const y = safeTop() + 66, x0=W*0.14, x1=W*0.86;
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
    start, stop, clear, endDuo, input,
    // Schalten wird auf den nächsten Physik-Tick gelegt (deterministisch)
    shift(){ if (st && st.p.launched && !st.p.finished) input.shiftReq = true; },
    nos(on){ if (st){ input.nos = on; AudioSys.nosHiss(on && st.p.nos>0); } },
    active(){ return !!st; },
    gear(){ return st ? st.p.gear : 0; },
    launched(){ return !!st?.p.launched; },
    // Duo: eigener Zustand (mit Tick-Zeitstempel) / Gegner-Zustand einspeisen
    snapshot(){
      if (!st || st.waiting) return null;
      const p = st.p;
      return { tick: st.run.tick, s: +p.s.toFixed(2), v: +p.v.toFixed(2), a: +p.aVis.toFixed(1),
               rpm: Math.round(p.rpm), fin: p.finished };
    },
    setRemote(payload){ if (st) st.remote = payload; },
    debug(){ return st && { rpm: Math.round(st.p.rpm), green: st.green != null,
      launched: st.p.launched, launchQ: st.p.launchQ, boostMul: st.p.boostMul,
      phase: st.phase, zone: shiftZone(st.p.spec.def), waiting: st.waiting, gear: st.p.gear,
      finished: st.p.finished, s: st.p.s }; },
  };
})();
