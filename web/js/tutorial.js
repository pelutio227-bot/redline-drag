// tutorial.js — Einstieg für neue Spieler (18.11.2026): Schrauber-Mike führt durch Radar → erstes Rennen (Start, Schalten,
// NOS) → Kiste öffnen → Season Pass → Belohnung abholen. Spotlight auf das nächste Ziel, Sprechblase, jederzeit überspringbar.
// Läuft ohne Eingriff in game.js: beobachtet Screens, Race.debug() und Ereignisse von season.js.
window.Tut = (() => {
  const $ = id => document.getElementById(id);
  const S = () => UI.save;
  const ORDER = ["radar", "vsgo", "launch", "shift", "nos", "crate", "pass", "menupass", "claim", "final", "done"];
  const TXT = {
    radar:   () => `Willkommen auf der Strasse, ${name()}. Ich bin Mike. Zuerst brauchst du einen Gegner: tipp auf STRASSEN-RADAR.`,
    vsgo:    () => `Dein erster Gegner — ein leichter. Tipp auf FAHREN!`,
    launch:  () => `GAS gedrückt halten und die Nadel in der grünen Zone halten. Bei Grün geht's los — in der Zone = perfekter Start.`,
    shift:   () => `Jetzt SCHALTEN, wenn die Nadel in der grünen Zone steht. Perfekt geschaltet gibt Schub.`,
    nos:     () => `NOS drücken für den Extra-Schub. Timing zählt!`,
    crate:   () => `Nach jedem Rennen fällt Beute. Tipp auf deine Kiste und öffne sie.`,
    crateno: () => `Diesmal keine Kiste — nach jedem Sieg gibt es eine, nach einer Niederlage manchmal. Weiter geht's.`,
    pass:    () => `Jeder Sieg bringt Pass-Punkte und Diamanten. Die Punkte füllen deinen Season Pass — Stufe für Stufe Belohnungen.`,
    menupass:() => `Hier ist dein Season Pass. Tipp drauf und hol dir deine erste Belohnung.`,
    claim:   () => `Tipp auf ABHOLEN.`,
    final:   () => `Mit Bolts kaufst du in der Garage Teile — jedes Level schaltet neue frei. Ab Level 10 warten echte Rivalen. Viel Erfolg auf der Strasse!`,
  };
  const name = () => (S()?.name && S().name !== "RACER") ? String(S().name) : "Racer";
  let el = null, timer = null, hideAt = 0, target = null, lastStep = null;
  const st = () => { const s = S(); if (!s) return null; return s.tut; };
  function eligible(){ const s = S(); return !!(s && s.current && !s.tut && (s.stats?.races || 0) < 3 && s.name && s.name !== "RACER"); }
  function set(step){ const s = S(); s.tut = { ...(s.tut || {}), step, at: Date.now() }; if (step === "done") s.tut.done = true; UI.persist(); if (step === "done") hide(); }
  const active = () => { const t = st(); return !!t && !t.done; };
  const stepIs = (...xs) => { const t = st(); return !!t && xs.includes(t.step); };
  function forceGrey(){ return active() && stepIs("radar", "vsgo"); }
  function restart(){ const s = S(); s.tut = { step: "radar", at: Date.now(), again: true }; UI.persist(); UI.show("menu"); }

  function ensureEl(){
    if (el) return el;
    el = document.createElement("div"); el.id = "tut";
    el.innerHTML = `<div class="tut-spot"></div><div class="tut-bubble"><img class="tut-face" src="assets/drivers/mike.jpg" alt=""><div class="tut-body"><div class="tut-txt"></div><div class="tut-btns"><button class="tut-skip">Überspringen</button><button class="tut-next mbtn primary">Weiter</button></div></div></div>`;
    document.body.appendChild(el);
    el.querySelector(".tut-skip").onclick = () => set("done");
    el.querySelector(".tut-next").onclick = () => onNext();
    return el;
  }
  let lastKey = "";
  function show(text, tgt, { next = false, bottom = false } = {}){
    const e = ensureEl(); e.classList.add("on");
    const key = text + "|" + (tgt ? "t" : "-") + next + bottom;
    if (key === lastKey && (!tgt || tgt === target)){ place(); return; }
    lastKey = key;
    e.querySelector(".tut-txt").innerHTML = text;
    e.querySelector(".tut-next").style.display = next ? "" : "none";
    target = tgt || null; e.classList.toggle("nospot", !target); e.classList.toggle("bottom", bottom);
    place();
  }
  function hide(){ if (el){ el.classList.remove("on"); } target = null; lastKey = ""; }
  function place(){
    if (!el || !el.classList.contains("on")) return;
    const spot = el.querySelector(".tut-spot"), bub = el.querySelector(".tut-bubble");
    if (target && target.isConnected){
      const r = target.getBoundingClientRect(), pad = 8;
      Object.assign(spot.style, { left: (r.left - pad) + "px", top: (r.top - pad) + "px", width: (r.width + 2*pad) + "px", height: (r.height + 2*pad) + "px", borderRadius: (parseFloat(getComputedStyle(target).borderRadius) || 14) + pad + "px" });
      const below = r.top + r.height / 2 < window.innerHeight / 2;
      bub.style.top = below ? Math.min(window.innerHeight - 170, r.bottom + 18) + "px" : "";
      bub.style.bottom = below ? "" : Math.max(16, window.innerHeight - r.top + 18) + "px";
    } else {
      bub.style.top = el.classList.contains("bottom") ? "" : "calc(env(safe-area-inset-top, 0px) + 64px)";
      bub.style.bottom = el.classList.contains("bottom") ? "calc(env(safe-area-inset-bottom, 0px) + 24px)" : "";
    }
  }
  function onNext(){
    if (stepIs("pass")){ set("menupass"); hide(); }
    else if (stepIs("final")){ set("done"); }
    else if (stepIs("crateno")){ set("pass"); showStep(); }
  }
  const on = id => $(id)?.classList.contains("on");
  const vis = e => !!e && e.isConnected && e.getClientRects().length > 0;
  let shiftShown = 0, nosShown = 0;
  function showStep(){
    const t = st(); if (!t || t.done) return hide();
    const race = Race.debug();
    switch (t.step){
      case "radar":
        if (on("menu") && vis($("heroPass"))) show(TXT.radar(), document.querySelector(".radarbtn"));
        else if (on("radar") || on("hud")) set("vsgo");
        break;
      case "vsgo": {
        const go = $("vsGo");
        if (on("radar") && vis(go)) show(TXT.vsgo(), go);
        else if (on("hud")) { set("launch"); hide(); }
        else if (on("menu")) set("radar");
        break; }
      case "launch":
        if (on("hud") && race){
          if (!race.launched) show(TXT.launch(), null);
          else { set("shift"); shiftShown = Date.now(); show(TXT.shift(), null); }
        } else if (on("results")) set("crate");
        break;
      case "shift":
        if (race && (race.gear >= 2 || Date.now() - shiftShown > 4500)){ set("nos"); nosShown = Date.now(); show(TXT.nos(), null); }
        if (on("results")) set("crate");
        break;
      case "nos":
        if (Date.now() - nosShown > 3000) hide();
        if (on("results")) set("crate");
        break;
      case "crate": {
        const b = document.querySelector("[data-crate]:not(.opened)");
        if (on("crate")) hide();
        else if (on("results") && vis(b)) show(TXT.crate(), b);
        else if (on("results") && document.querySelector("[data-crate].opened")) { set("pass"); show(TXT.pass(), null, { next: true }); }
        else if (on("results") && $("resLoot")?.children.length && !document.querySelector("[data-crate]")) { t.step = "crateno"; show(TXT.crateno(), null, { next: true }); }
        else if (on("menu")) set("menupass");
        break; }
      case "crateno": break;
      case "pass": if (on("results") && !on("crate")) show(TXT.pass(), null, { next: true }); else if (on("menu")) set("menupass"); break;
      case "menupass":
        if (on("menu") && vis($("heroPass"))) show(TXT.menupass(), $("heroPass").querySelector(".hp-pass"));
        else if (on("season")) { set("claim"); hide(); }
        else hide();
        break;
      case "claim": {
        const b = document.querySelector(".pcell.ready");
        if (on("season") && vis(b)) show(TXT.claim(), b);
        else if (on("season") && !b) { set("final"); show(TXT.final(), null, { next: true }); }
        else if (!on("season") && !on("crate")) hide();
        break; }
      case "final": if (!on("crate")) show(TXT.final(), null, { next: true, bottom: false }); else hide(); break;
    }
    if (lastStep !== t.step){ lastStep = t.step; }
  }
  window.addEventListener("redline:crate-collected", () => { if (stepIs("crate")) { set("pass"); } });
  window.addEventListener("redline:claimed", () => { if (stepIs("claim")) { set("final"); } });
  window.addEventListener("resize", place);
  function tick(){
    if (typeof UI === "undefined") return;
    if (eligible()) set("radar");
    if (active()) showStep(); else hide();
    place();
  }
  timer = setInterval(tick, 350);
  return { active, forceGrey, restart, set, tick };
})();
