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
    if (!keepAlive){
      const a = document.createElement("audio");
      a.src = SILENT_WAV; a.loop = true; a.volume = 0.01;
      a.setAttribute("playsinline", "");
      const p = a.play();
      if (p) p.then(()=>{ keepAlive = a; }).catch(()=>{});  // braucht Geste — nächster Tap versucht's neu
      else keepAlive = a;
    }
  }
  document.addEventListener("pointerdown", unlock, { passive: true, capture: true });
  document.addEventListener("touchend", unlock, { passive: true, capture: true });
  document.addEventListener("visibilitychange", ()=>{
    if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(()=>{});
  });

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
  let prof = { fm: 1, sub: 0.28, dist: 3.4, lp: 1, vol: 1 };
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
    const nbuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i=0;i<nd.length;i++) nd[i] = Math.random()*2-1;
    const noise = ctx.createBufferSource(); noise.buffer = nbuf; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 14; bp.frequency.value = 1200;
    const tg = ctx.createGain(); tg.gain.value = 0;
    o1.connect(o1g).connect(sh); o2.connect(o2g).connect(sh);
    sh.connect(lp).connect(g).connect(master);
    noise.connect(bp).connect(tg).connect(master);
    o1.start(); o2.start(); noise.start();
    eng = { o1, o2, noise, lp, g, tg, bp };
  }
  function engine(rpm, throttle, turbo){ // turbo 0..1 (Ladedruck)
    if (!eng) return;
    const f = Math.max(24, rpm/60*2*prof.fm);    // Zündimpulse × Auto-Charakter
    const t = ctx.currentTime;
    eng.o1.frequency.setTargetAtTime(f, t, .02);
    eng.o2.frequency.setTargetAtTime(f/2, t, .02);
    eng.lp.frequency.setTargetAtTime((300 + throttle*1400 + rpm*0.09)*prof.lp, t, .03);
    eng.g.gain.setTargetAtTime((0.10 + throttle*0.16 + (rpm/9000)*0.06)*prof.vol, t, .03);
    eng.tg.gain.setTargetAtTime(turbo*0.05, t, .05);
    eng.bp.frequency.setTargetAtTime(900 + rpm*0.35, t, .05);
  }
  function stopEngine(){
    if (!eng) return;
    // ALLE Quellen stoppen — die Turbo-Noise-Schleife lief sonst ewig weiter
    // und stapelte sich pro Rennen zu einem immer lauteren Dauer-Zischen.
    try { eng.o1.stop(); eng.o2.stop(); eng.noise.stop(); } catch {}
    eng = null;
  }

  // ── One-Shots ──
  function noiseBurst(dur, filterType, freq, q, gain){
    if (!ensure()) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(master); src.start();
  }
  function shiftPop(exhaust){ // Backfire — grösser mit dickerem Auspuff
    noiseBurst(0.14 + exhaust*0.06, "lowpass", 300 + exhaust*180, 1, 0.5 + exhaust*0.22);
  }
  function bov(){   // Blow-off «Ptss-ss-ss»: Pitch fällt + Ventil-Flattern — HD-Version
    if (!ensure()) return;
    const t0 = ctx.currentTime, dur = 0.5;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate*dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2.4;
    bp.frequency.setValueAtTime(4200, t0);
    bp.frequency.exponentialRampToValueAtTime(1100, t0 + dur);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    const lfo = ctx.createOscillator(); lfo.type = "square";      // Flattern
    lfo.frequency.setValueAtTime(30, t0);
    lfo.frequency.exponentialRampToValueAtTime(14, t0 + dur);
    const lg = ctx.createGain(); lg.gain.value = 0.35;
    lfo.connect(lg).connect(g.gain);
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(master);
    src.start(t0); lfo.start(t0); lfo.stop(t0 + dur);
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
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
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
    o.connect(g).connect(master); o.start(); o.stop(ctx.currentTime + dur);
  }
  function winJingle(){
    [523, 659, 784, 1047].forEach((f,i)=>setTimeout(()=>beep(f, .22, .28), i*130));
  }
  function loseThud(){ beep(140, .4, .35); setTimeout(()=>beep(110, .5, .3), 180); }

  return { unlock, startEngine, engine, stopEngine, shiftPop, bov, bang, whoosh, nosHiss, skid, beep, winJingle, loseThud };
})();
