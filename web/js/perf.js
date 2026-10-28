// perf.js — Diagnose «Ruckeln/Einfrieren auf dem iPad» (28.10.2026).
// Pro Rennen: Frame-Lücken, längster Hänger, Zeit für Physik/Zeichnen, Audio-Knoten, Bildschirm.
// Dazu ein Wachhund (Hauptthread blockiert > 1 s) und ein Herzschlag im localStorage, damit auch ein
// Einfrieren mit App-Abbruch beim nächsten Start gemeldet wird. Ziel: Supabase redline.perf (nur Insert).
const Perf = (() => {
  const URL_ = "https://ekiodhnwdgflhwqtbnio.supabase.co/rest/v1/perf";
  const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVraW9kaG53ZGdmbGh3cXRibmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNDgyNDgsImV4cCI6MjA5NjYyNDI0OH0.78ExiZrdRK6zyyWT_pKT7DidfWw0i0qSU5yVknVeGtA";
  const LS = "redline:perf", HB = "redline:perfHB";
  const ls = { get(k){ try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
               set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  let dev = ls.get("redline:devId");
  if (!dev){ dev = Math.random().toString(36).slice(2, 10); ls.set("redline:devId", dev); }
  const ua = navigator.userAgent, plat = /iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1 ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "Desktop";
  const isApp = !!window.Capacitor?.isNativePlatform?.();
  let raceNo = 0, rec = null, lastHb = 0;
  const errs = [], stalls = [];

  function queue(item){
    const q = ls.get(LS) || []; q.push(item); while (q.length > 40) q.shift(); ls.set(LS, q); flush();
  }
  let sending = false;
  async function flush(){
    if (sending) return;
    const q = ls.get(LS); if (!q?.length) return;
    sending = true;
    try {
      const r = await fetch(URL_, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + KEY,
        "Content-Type": "application/json", "Content-Profile": "redline", Prefer: "return=minimal" },
        body: JSON.stringify(q.map(d => ({ dev: `${plat}${isApp ? "-app" : "-web"}-${dev}`, data: d }))) });
      if (r.ok){ const now = ls.get(LS) || []; ls.set(LS, now.slice(q.length)); }
    } catch {}
    sending = false;
    if ((ls.get(LS) || []).length && !flush._retry){ flush._retry = setTimeout(() => { flush._retry = null; flush(); }, 1500); }
  }
  function base(){
    return { v: document.querySelector('script[src*="game.js"]')?.src.split("v=")[1], plat, app: isApp,
      W: innerWidth, H: innerHeight, dpr: devicePixelRatio, at: new Date().toISOString(),
      audio: typeof AudioSys !== "undefined" ? AudioSys.stats?.() : null, mem: performance.memory?.usedJSHeapSize };
  }
  // Rennen
  function begin(info){
    if (rec) end({ fin: false, cut: true });   // vorheriges Rennen ohne stop() verlassen
    raceNo++;
    rec = { kind: "race", race: raceNo, ...info, n: 0, long: 0, max: 0, phys: 0, draw: 0, maxPhys: 0, maxDraw: 0, hist: [0,0,0,0,0], t0: performance.now() };
  }
  // gap = Abstand zum letzten Frame, phys/draw = Arbeitszeit dieses Frames (ms)
  function frame(gap, phys, draw){
    if (!rec) return;
    rec.n++; rec.phys += phys; rec.draw += draw;
    if (phys > rec.maxPhys) rec.maxPhys = phys;
    if (draw > rec.maxDraw) rec.maxDraw = draw;
    if (gap > rec.max) rec.max = gap;
    if (gap > 50) rec.long++;
    rec.hist[gap < 20 ? 0 : gap < 34 ? 1 : gap < 50 ? 2 : gap < 200 ? 3 : 4]++;
    const now = performance.now();
    if (now - lastHb > 2000){ lastHb = now; ls.set(HB, { ...summ(), ...base(), kind: "heartbeat" }); }
  }
  function summ(){
    const r = rec; if (!r) return {};
    const dur = (performance.now() - r.t0) / 1000;
    return { kind: r.kind, race: r.race, mode: r.mode, car: r.car, opp: r.opp, dur: +dur.toFixed(1), fps: +(r.n / dur).toFixed(1),
      long: r.long, max: Math.round(r.max), phys: +(r.phys / Math.max(1, r.n)).toFixed(2), draw: +(r.draw / Math.max(1, r.n)).toFixed(2),
      maxPhys: Math.round(r.maxPhys), maxDraw: Math.round(r.maxDraw), hist: r.hist };
  }
  function end(extra){
    if (!rec) return;
    const s = { ...summ(), ...base(), ...extra, stalls: stalls.splice(0), errs: errs.splice(0) };
    rec = null; ls.set(HB, null); queue(s);
  }
  // Wachhund: Intervall kommt > 1 s zu spät → Hauptthread war blockiert
  let wd = performance.now();
  setInterval(() => {
    const now = performance.now(), late = now - wd - 500; wd = now;
    if (late > 1000 && !document.hidden){
      const sc = document.querySelector(".screen.on")?.id || "?";
      stalls.push({ ms: Math.round(late), sc, inRace: !!rec, race: raceNo });
      if (!rec) queue({ kind: "stall", ms: Math.round(late), sc, ...base() });
    }
  }, 500);
  window.addEventListener("error", e => { errs.push(String(e.message).slice(0, 160)); if (errs.length > 10) errs.shift(); });
  window.addEventListener("unhandledrejection", e => { errs.push("rej: " + String(e.reason?.message || e.reason).slice(0, 160)); if (errs.length > 10) errs.shift(); });
  // Start: Herzschlag eines abgebrochenen Rennens (App eingefroren/gekillt) nachmelden
  const hb = ls.get(HB);
  if (hb){ ls.set(HB, null); queue({ ...hb, kind: "killed" }); }
  setTimeout(() => queue({ kind: "boot", ...base() }), 4000);
  return { begin, frame, end, flush };
})();
window.Perf = Perf;
