// audio.js — komplett synthetisierter Sound (WebAudio, keine Samples).
// Motor: Sägezahn+Sub-Oszillator → Waveshaper-Distortion → Tiefpass, Pitch = RPM.
// Dazu: Schalt-Blubbern, Turbo-Pfeifen + BOV, NOS-Zischen, Wheelspin-Skid, Tree-Beeps.

const AudioSys = (() => {
  let ctx = null, master = null;
  let eng = null;       // Motor-Knoten
  let started = false;

  function ensure(){
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }
  // iOS-PWA (Homescreen-App): WebAudio läuft dort in der "Ambient"-Session und
  // bleibt stumm (bzw. stirbt beim App-Wechsel mit state "interrupted").
  // Fix: (1) resume auch bei "interrupted", (2) stummes <audio>-Loop erzwingt
  // die PLAYBACK-Session, (3) globaler Gesten-Unlock + visibilitychange-Resume.
  let keepAlive = null;
  const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=";
  function unlock(){
    if (!ensure()) return;
    if (ctx.state !== "running") ctx.resume().catch(()=>{});
    // EIN Element, nur play() wird bei Bedarf wiederholt (vorher: neues <audio> pro Tap,
    // solange play() noch nicht bestätigt war → auf iOS Hunderte Elemente)
    if (!keepAlive){
      keepAlive = document.createElement("audio");
      keepAlive.src = SILENT_WAV; keepAlive.loop = true; keepAlive.volume = 0.01;
      keepAlive.setAttribute("playsinline", "");
    }
    if (keepAlive.paused && !keepAlive._pending){
      keepAlive._pending = true;
      const p = keepAlive.play();
      if (p) p.catch(()=>{}).finally(()=>{ keepAlive._pending = false; }); else keepAlive._pending = false;
    }
  }
  document.addEventListener("pointerdown", unlock, { passive: true, capture: true });
  document.addEventListener("touchend", unlock, { passive: true, capture: true });
  document.addEventListener("visibilitychange", ()=>{
    if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(()=>{});
  });

  // Performance (iPad «ruckelt ab dem 4. Rennen»): fertige One-Shots hängen sonst mit Filter/Gain
  // weiter am Master — WebKit rechnet diese Knoten im Audio-Thread mit, Rennen für Rennen mehr.
  // Darum: sobald die Quelle endet, alle Knoten der Kette abhängen.
  let shots = 0;   // laufende One-Shots (Diagnose perf.js)
  function done(src, ...nodes){
    shots++;
    src.onended = () => { shots--; for (const n of [src, ...nodes]){ try { n.disconnect(); } catch {} } };
  }
  const stats = () => ({ st: ctx?.state ?? "none", shots, eng: !!eng, sr: ctx?.sampleRate });
  function distCurve(amount){
    const n = 256, curve = new Float32Array(n);
    for (let i=0;i<n;i++){
      const x = (i/(n-1))*2-1;
      curve[i] = Math.tanh(x*amount);
    }
    return curve;
  }

  // ── Motor ──
  // Sound-Profil pro Auto (aus cars.js soundProfile()): fm/sub/dist/lp/vol
  let prof = { fm: 1, sub: 0.28, dist: 3.4, lp: 1, vol: 1, fam: "jdm", turbo: 0, redline: 7000 };
  function startEngine(p){
    if (p) prof = p;
    if (!ensure()) return;
    if (eng) stopEngine();   // laufenden Motor ersetzen — sonst gilt das alte Sound-Profil weiter
    const o1 = ctx.createOscillator(); o1.type = "sawtooth";
    const o2 = ctx.createOscillator(); o2.type = "square";
    const o1g = ctx.createGain(); o1g.gain.value = 0.55;
    const o2g = ctx.createGain(); o2g.gain.value = prof.sub;
    const sh = ctx.createWaveShaper(); sh.curve = distCurve(prof.dist); sh.oversample = "2x";
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 1.1;
    const g = ctx.createGain(); g.gain.value = 0.0;
    // Turbo-Whistle (Bandpass-Noise), nur hörbar wenn turbo>0
    const noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = noise(); noiseSrc.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 14; bp.frequency.value = 1200;
    const tg = ctx.createGain(); tg.gain.value = 0;
    o1.connect(o1g).connect(sh); o2.connect(o2g).connect(sh);
    sh.connect(lp).connect(g).connect(master);
    noiseSrc.connect(bp).connect(tg).connect(master);
    o1.start(); o2.start(); noiseSrc.start();
    eng = { o1, o2, o1g, o2g, sh, noise: noiseSrc, lp, g, tg, bp };
    if (prof.fam === "jdm"){
      // Ansaug-Rasp: 2. Harmonische durch resonanten Bandpass, öffnet ab ~60 % Drehzahl («VTEC»)
      const o3 = ctx.createOscillator(); o3.type = "sawtooth";
      const ib = ctx.createBiquadFilter(); ib.type = "bandpass"; ib.Q.value = 3.2; ib.frequency.value = 900;
      const ig = ctx.createGain(); ig.gain.value = 0;
      o3.connect(ib).connect(ig).connect(g);
      o3.start(); Object.assign(eng, { o3, ib, ig });
    } else if (prof.fam === "muscle"){
      // V8-Lope: unregelmässige Zündfolge als Amplituden-Modulation vor der Verzerrung —
      // im Leerlauf deutlich «blubb-blubb», unter Volllast fast weg
      const pre = ctx.createGain(); pre.gain.value = 0.7;
      o1g.disconnect(); o2g.disconnect();
      o1g.connect(pre); o2g.connect(pre); pre.connect(sh);
      const lfo = ctx.createOscillator(); lfo.type = "triangle"; lfo.frequency.value = 6;
      const depth = ctx.createGain(); depth.gain.value = 0.3;
      lfo.connect(depth).connect(pre.gain);
      lfo.start(); Object.assign(eng, { lfo, depth, pre });
    }
  }
  // Performance (28.10.): nicht jeden Frame (120 Hz) neue Automations-Events stapeln —
  // ~30 Updates/s reichen (setTargetAtTime glättet ohnehin), WebKit-Audio-Thread bleibt frei
  let engLast = 0;
  function engine(rpm, throttle, turbo){ // turbo 0..1 (Ladedruck)
    if (!eng) return;
    const t = ctx.currentTime;
    if (t - engLast < 0.033 && t >= engLast) return;
    engLast = t;
    const f = Math.max(24, rpm/60*2*prof.fm);    // Zündimpulse × Auto-Charakter
    eng.o1.frequency.setTargetAtTime(f, t, .02);
    eng.o2.frequency.setTargetAtTime(f/2, t, .02);
    const rf = Math.min(1.1, rpm/(prof.redline||7000));
    if (eng.o3){
      eng.o3.frequency.setTargetAtTime(f*2, t, .02);
      eng.ib.frequency.setTargetAtTime(f*2.4, t, .03);
      eng.ig.gain.setTargetAtTime(Math.max(0, rf - 0.58)*0.9*(0.4 + throttle*0.6), t, .04);
    }
    if (eng.lfo){
      eng.lfo.frequency.setTargetAtTime(Math.max(4, f/4), t, .03);
      eng.depth.gain.setTargetAtTime(0.32*Math.max(0.15, 1 - rf*1.1)*(1 - throttle*0.5), t, .05);
    }
    eng.lp.frequency.setTargetAtTime((300 + throttle*1400 + rpm*0.09)*prof.lp, t, .03);
    eng.g.gain.setTargetAtTime((0.10 + throttle*0.16 + (rpm/9000)*0.06)*prof.vol, t, .03);
    // Lader-Pfeifen: lauter + höher mit jeder Stage
    const ts = prof.turbo || (turbo ? 1 : 0);
    eng.tg.gain.setTargetAtTime(turbo*(0.025 + ts*0.017), t, .05);
    eng.bp.frequency.setTargetAtTime((900 + rpm*0.35)*(1 + ts*0.12), t, .05);
  }
  function stopEngine(){
    if (!eng) return;
    // ALLE Quellen stoppen — die Turbo-Noise-Schleife lief sonst ewig weiter
    // und stapelte sich pro Rennen zu einem immer lauteren Dauer-Zischen.
    try { eng.o1.stop(); eng.o2.stop(); eng.noise.stop(); eng.o3?.stop(); eng.lfo?.stop(); } catch {}
    for (const n of Object.values(eng)){ if (n instanceof AudioNode){ try { n.disconnect(); } catch {} } }
    eng = null; engLast = 0;
  }

  // ── One-Shots ──
  // EIN gemeinsamer Rausch-Puffer (1 s) statt pro Knall neu in JS zu würfeln;
  // das Abklingen macht jetzt eine Gain-Rampe (vorher im Puffer eingebacken)
  let noiseBuf = null;
  function noise(){
    if (!noiseBuf){
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
    }
    return noiseBuf;
  }
  function noiseBurst(dur, filterType, freq, q, gain){
    if (!ensure()) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise();
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(f).connect(g).connect(master); done(src, f, g);
    src.start(t0, Math.random()*(1 - Math.min(dur, 0.9)), dur);
  }
  function shiftPop(exhaust){ // Backfire — grösser mit dickerem Auspuff
    noiseBurst(0.14 + exhaust*0.06, "lowpass", 300 + exhaust*180, 1, 0.5 + exhaust*0.22);
  }
  function bov(level = 1, k = 1){   // Blow-off «Ptss-ss-ss»: Pitch fällt + Ventil-Flattern — HD-Version
    if (!ensure()) return;
    const t0 = ctx.currentTime, dur = 0.3 + 0.2*level;
    const src = ctx.createBufferSource(); src.buffer = noise();
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2.4;
    bp.frequency.setValueAtTime(4200, t0);
    bp.frequency.exponentialRampToValueAtTime(1100, t0 + dur);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55*level*k, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    const lfo = ctx.createOscillator(); lfo.type = "square";      // Flattern
    lfo.frequency.setValueAtTime(30, t0);
    lfo.frequency.exponentialRampToValueAtTime(14, t0 + dur);
    const lg = ctx.createGain(); lg.gain.value = 0.35;
    lfo.connect(lg).connect(g.gain);
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(master);
    done(src, bp, hp, g); done(lfo, lg);
    src.start(t0, Math.random()*0.4, dur); lfo.start(t0); lfo.stop(t0 + dur);
  }
  // Turbo beim Gas-Wegnehmen/Schalten (stage 1–3, boost 0–1 = Ladedruck):
  // JDM → Kompressor-Flattern «tu-tu-tu-tu» (Pumpstoss), wird mit der Stage länger, tiefer, satter;
  // Muscle/Exot → Blow-off-«Pssh»
  function turboRelease(stage, boost = 1){
    if (!ensure() || !stage) return;
    const k = Math.max(0.35, boost);
    if (prof.fam !== "jdm"){ bov(0.55 + stage*0.25, k); return; }
    const t0 = ctx.currentTime, dur = 0.32 + stage*0.16;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime((0.30 + stage*0.14)*k, t0 + 0.015);
    out.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    out.connect(master);
    // Flatter-Hüllkurve: Rechteck-LFO zerhackt das Signal, Takt fällt (Lader dreht runter)
    const chop = ctx.createGain(); chop.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = "square";
    lfo.frequency.setValueAtTime(19 + stage*2, t0);
    lfo.frequency.exponentialRampToValueAtTime(8 + stage, t0 + dur);
    const lg = ctx.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg).connect(chop.gain);
    chop.connect(out);
    // Luft-Anteil (zischend) + Druck-Anteil (tiefes «Wummern», ab Stage 2 deutlich)
    const air = ctx.createBufferSource(); air.buffer = noise();
    const ab = ctx.createBiquadFilter(); ab.type = "bandpass"; ab.Q.value = 1.6;
    ab.frequency.setValueAtTime(1500 - stage*150, t0);
    ab.frequency.exponentialRampToValueAtTime(700 - stage*80, t0 + dur);
    const ag = ctx.createGain(); ag.gain.value = 0.55;
    air.connect(ab).connect(ag).connect(chop);
    const thump = ctx.createBufferSource(); thump.buffer = noise();
    const tl = ctx.createBiquadFilter(); tl.type = "lowpass"; tl.frequency.value = 260 + stage*30; tl.Q.value = 2;
    const tgn = ctx.createGain(); tgn.gain.value = 0.35 + stage*0.35;
    thump.connect(tl).connect(tgn).connect(chop);
    const off = Math.random()*0.4;
    done(air, ab, ag, chop, out); done(thump, tl, tgn); done(lfo, lg);
    air.start(t0, off, dur); thump.start(t0, off, dur); lfo.start(t0); lfo.stop(t0 + dur);
    // Stage 3: zusätzlich das Runterpfeifen des grossen Laders
    if (stage >= 3){
      const w = ctx.createOscillator(); w.type = "sine";
      w.frequency.setValueAtTime(3200, t0); w.frequency.exponentialRampToValueAtTime(900, t0 + dur*1.2);
      const wg = ctx.createGain(); wg.gain.setValueAtTime(0.05*k, t0); wg.gain.exponentialRampToValueAtTime(0.0005, t0 + dur*1.2);
      w.connect(wg).connect(master); done(w, wg); w.start(t0); w.stop(t0 + dur*1.2);
    }
  }
  // Anti-Lag-/Backfire-KNALL: tiefer Druckstoss + Knack-Transient
  function bang(big = 1){
    if (!ensure()) return;
    noiseBurst(0.16 + big*0.10, "lowpass", 240 + big*160, 0.8, 0.5 + big*0.22);
    noiseBurst(0.05, "highpass", 2600, 1, 0.2);
    beep(72 + Math.random()*28, 0.09, 0.28);
  }
  function whoosh(){ noiseBurst(0.5, "bandpass", 650, 1.1, 0.42); noiseBurst(0.3, "highpass", 2600, 1, 0.18); } // Boost-Energie
  function nosHiss(on){
    if (!ensure()) return;
    if (on) noiseBurst(0.5, "highpass", 3500, 1, 0.25);
  }
  let skidG = null;
  function skid(on){
    if (!ensure()) return;
    if (on && !skidG){
      const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 1.4;
      const g = ctx.createGain(); g.gain.value = 0.20;
      src.connect(f).connect(g).connect(master); src.start();
      skidG = { src, g };
    } else if (!on && skidG){
      try { skidG.src.stop(); } catch {}
      skidG = null;
    }
  }
  function beep(freq, dur=0.14, gain=0.3){
    if (!ensure()) return;
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(master); done(o, g); o.start(); o.stop(ctx.currentTime + dur);
  }
  function winJingle(){
    [523, 659, 784, 1047].forEach((f,i)=>setTimeout(()=>beep(f, .22, .28), i*130));
  }
  function loseThud(){ beep(140, .4, .35); setTimeout(()=>beep(110, .5, .3), 180); }

  // ── Season 2: Radar, Seltenheit, VS, Level-Up, Beute (28.10.) ──
  // Ton mit Hüllkurve; glide = Zielfrequenz (Pitch-Fahrt), at = Startversatz in s
  function tone(freq, dur, { type = "sine", gain = 0.25, at = 0, glide = null, attack = 0.005, lp = null } = {}){
    if (!ensure()) return;
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o.connect(g), f = null;
    if (lp){ f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; node = g.connect(f); }
    node.connect(master); done(o, g, ...(f ? [f] : [])); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // Radar-Rolle: kurzes «Tick» pro Karte (Tonhöhe sinkt, wenn die Rolle bremst)
  function radarTick(k = 1){ tone(1800*k, 0.035, { type:"square", gain:0.06, lp:3200 }); noiseBurst(0.02, "highpass", 5000, 1, 0.05); }
  // Seltenheit enthüllt — je seltener, desto grösser
  function reveal(rar){
    if (rar === "grey"){ tone(160, 0.25, { type:"triangle", gain:0.3, glide:90 }); return; }
    if (rar === "green"){ tone(660, 0.5, { gain:0.18 }); tone(990, 0.6, { gain:0.14, at:0.08 }); return; }
    if (rar === "blue"){ [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.7, { gain:0.13, at:i*0.06 })); noiseBurst(0.6, "highpass", 6000, 1, 0.06); return; }
    // Episch/Legendär: tiefer Einschlag + Chor-Fläche (+ Glocken)
    tone(110, 1.6, { type:"sawtooth", gain:0.28, glide:38, lp:400 });
    noiseBurst(0.9, "lowpass", 220, 0.8, 0.5);
    const chord = rar === "legend" ? [196, 247, 294, 392, 494] : [185, 220, 277, 370];
    chord.forEach((f, i) => { tone(f, 2.4, { type:"sawtooth", gain:0.05, at:0.15, attack:0.5, lp:1400 }); tone(f*1.005, 2.4, { type:"sawtooth", gain:0.04, at:0.15, attack:0.6, lp:1200 }); });
    if (rar === "legend"){
      [1568, 1976, 2349, 3136].forEach((f, i) => tone(f, 1.4, { gain:0.08, at:0.45 + i*0.09 }));
      noiseBurst(1.4, "bandpass", 1800, 0.6, 0.12);
    }
  }
  // VS-Einschlag (Kampf-Bildschirm)
  function vsSlam(){
    tone(140, 0.7, { type:"sine", gain:0.5, glide:36 });
    noiseBurst(0.35, "lowpass", 900, 0.9, 0.55);
    tone(2200, 0.25, { type:"square", gain:0.05, glide:600, lp:4000 });
  }
  // Level-Up: heller Glocken-«Ding» + aufsteigende Fanfare + Fläche
  function levelUp(){
    tone(1318, 1.6, { gain:0.22 }); tone(1975, 1.4, { gain:0.12, at:0.01 }); tone(2637, 1.0, { gain:0.06, at:0.02 });
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.55, { type:"triangle", gain:0.16, at:0.25 + i*0.09 }));
    [262, 330, 392, 523].forEach(f => tone(f, 2.2, { type:"sawtooth", gain:0.035, at:0.3, attack:0.4, lp:1600 }));
  }
  // Beute: Münz-Kaskade / neues Auto
  function loot(big = false){
    const n = big ? 9 : 5;
    for (let i = 0; i < n; i++) tone(1400 + Math.random()*900, 0.12, { type:"triangle", gain:0.08, at:i*0.055 });
    if (big){ tone(98, 1.2, { type:"sawtooth", gain:0.2, glide:49, lp:500 }); [392, 523, 659, 784].forEach((f, i) => tone(f, 0.9, { gain:0.1, at:0.3 + i*0.1 })); }
  }

  return { stats, unlock, startEngine, engine, stopEngine, shiftPop, bov, turboRelease, bang, whoosh, nosHiss, skid, beep, winJingle, loseThud,
           tone, radarTick, reveal, vsSlam, levelUp, loot };
})();
