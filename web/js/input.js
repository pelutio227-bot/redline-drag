// input.js — Bedienung ohne Touch (Claw 30.10.): Fernseher (Fernbedienung), Tesla, PC, Controller.
// 1) Menüs per Pfeiltasten: räumliche Navigation zum nächsten Knopf in Pfeilrichtung, gelber Fokus-Rahmen,
//    OK/Enter = antippen, Zurück/Escape = Fenster schliessen bzw. ‹ zurück (inkl. Tizen/webOS-Zurück-Taste).
// 2) Gamepad-API: im Rennen A/RT = Gas, RB/→ = Schalten, B/LB = NOS; in Menüs Steuerkreuz/Stick + A/B.
//    Controller-Eingaben werden als Tastatur-Ereignisse weitergereicht → dieselben Handler wie die Tastatur (ui.js).
(() => {
  const racing = () => !!window.Race?.active?.();
  // ── AUTOMATISCHE ERKENNUNG: womit wird gerade bedient? touch | mouse | keys | remote | pad ──
  const root = document.documentElement;
  const TV = /SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|BRAVIA|AFT[A-Z]|Android TV|GoogleTV|CrKey|HbbTV|VIDAA/i.test(navigator.userAgent);
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  root.dataset.touch = hasTouch ? "yes" : "no";
  let mode = TV ? "remote" : matchMedia("(hover: none) and (pointer: coarse)").matches ? "touch" : "mouse", fromPad = false;
  const HINT = {
    keys: "Leertaste / ↑ halten = Gas · Enter / → = Schalten · ↓ = NOS",
    remote: "▲ halten = Gas · OK / ► = Schalten · ▼ = NOS",
    pad: "🎮 A / RT = Gas · RB = Schalten · B / LB = NOS",
  };
  function setMode(m){
    if (m === mode) return;
    mode = m; root.dataset.input = m; hint();
    if (m === "pad") window.UI?.toast?.("🎮 Controller erkannt");
    if (m === "keys" || m === "remote" || m === "pad") autoFocus(true);
  }
  root.dataset.input = mode;
  addEventListener("pointerdown", e => setMode(e.pointerType === "mouse" ? "mouse" : "touch"), true);
  addEventListener("keydown", e => { if (!fromPad && !(e.target?.tagName === "INPUT")) setMode(TV ? "remote" : "keys"); }, true);
  // Steuerungs-Hinweis im Rennen (nur ohne Touch-Bedienung)
  function hint(){
    const hud = document.getElementById("hud"); if (!hud) return;
    let h = document.getElementById("inputHint");
    if (!h){ h = document.createElement("div"); h.id = "inputHint"; hud.appendChild(h); }
    h.textContent = HINT[mode] ? (window.I18N ? I18N.t(HINT[mode]) : HINT[mode]) : "";
  }
  // Fokus automatisch auf die Hauptaktion des sichtbaren Bildschirms/Fensters (nur Tastatur/Fernbedienung/Controller)
  const PREF = ".tlearn:not([disabled]), #vsGo, .resmain, .rv-pop .primary:not([disabled]), .primary:not([disabled])";
  let afT = 0;
  function autoFocus(force){
    if (mode === "touch" || mode === "mouse" || racing()) return;
    clearTimeout(afT);
    afT = setTimeout(() => {
      const L = layer(), cur = document.activeElement;
      if (!force && cur && cur !== document.body && L.contains(cur) && visible(cur)) return;
      const el = [...L.querySelectorAll(PREF)].find(visible) || focusables(L).find(x => !x.classList.contains("back")) || focusables(L)[0];
      el?.focus({ preventScroll: false });
    }, 160);
  }
  new MutationObserver(() => autoFocus(false)).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  setTimeout(hint, 500);
  const visible = el => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
    const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && !el.disabled; };
  // oberste Ebene: offenes Fenster (Popup, Blatt, Dialog) hat Vorrang vor dem Bildschirm darunter
  function layer(){
    const pops = [...document.querySelectorAll(".rv-pop, #nameDlg, #lvlup.on, [data-sheet], body > div[style*='position:fixed']")].filter(visible);
    return pops[pops.length - 1] || document.querySelector(".screen.on") || document.body;
  }
  const focusables = root => [...root.querySelectorAll("button, input, select, a[href], [tabindex]:not([tabindex='-1'])")].filter(visible);
  const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  function move(dir){
    const root = layer(), items = focusables(root); if (!items.length) return;
    const cur = document.activeElement;
    if (!cur || !items.includes(cur)){ (root.querySelector(".primary:not([disabled])") || items[0]).focus(); return; }
    const a = center(cur.getBoundingClientRect());
    let best = null, bestScore = Infinity;
    for (const el of items){
      if (el === cur) continue;
      const b = center(el.getBoundingClientRect()), dx = b.x - a.x, dy = b.y - a.y;
      const main = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
      const side = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
      if (main <= 2) continue;
      const score = main + side * 2.2;
      if (score < bestScore){ bestScore = score; best = el; }
    }
    if (best){ best.focus({ preventScroll: true }); best.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }
  }
  function back(){
    const root = layer();
    if (root.matches?.(".rv-pop") || root.id === "nameDlg"){
      const x = root.querySelector("[data-v='x'], [data-a='x'], [data-x], [data-act='x']"); if (x) return x.click();
      if (root.id !== "nameDlg") return root.remove();
      return;
    }
    if (root.id === "lvlup") return document.getElementById("lvlupOk")?.click();
    const b = root.querySelector(".back, [data-go='menu']"); if (b && visible(b)) b.click();
  }
  const DIRS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  const BACK = new Set(["Escape", "Backspace", "GoBack", "BrowserBack"]);
  window.addEventListener("keydown", e => {
    if (racing()) return;                                       // im Rennen: Gas/Schalten/NOS (ui.js)
    const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    if (DIRS[e.key] && !(typing && (e.key === "ArrowLeft" || e.key === "ArrowRight"))){ e.preventDefault(); move(DIRS[e.key]); return; }
    if ((BACK.has(e.key) || e.keyCode === 10009 || e.keyCode === 461) && !typing){ e.preventDefault(); back(); }
  });

  // ── Gamepad ──
  const pads = () => [...(navigator.getGamepads?.() || [])].filter(Boolean);
  const held = {}; let rep = 0, raf = 0;
  const key = (type, code, k) => { fromPad = true; window.dispatchEvent(new KeyboardEvent(type, { code, key: k ?? code, bubbles: true })); fromPad = false; };
  function poll(t){
    raf = requestAnimationFrame(poll);
    const p = pads()[0]; if (!p) return;
    if (p.buttons.some(x => x.pressed) || p.axes.some(v => Math.abs(v) > 0.6)) setMode("pad");
    const b = i => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4));
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const st = { A: b(0), B: b(1), X: b(2), LB: b(4), RB: b(5), RT: b(7), up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6, start: b(9) };
    const edge = n => st[n] && !held[n];
    if (racing()){
      if ((st.A || st.RT) && !(held.A || held.RT)) key("keydown", "Space", " ");
      if (!(st.A || st.RT) && (held.A || held.RT)) key("keyup", "Space", " ");
      if (edge("RB") || edge("right") || edge("X")) key("keydown", "Enter", "Enter");
      if ((st.B || st.LB) && !(held.B || held.LB)) key("keydown", "KeyN", "n");
      if (!(st.B || st.LB) && (held.B || held.LB)) key("keyup", "KeyN", "n");
    } else {
      for (const d of ["up", "down", "left", "right"]){
        if (edge(d) || (st[d] && t - rep > 220 && t - (held[d + "T"] || 0) > 420)){ move(d); rep = t; if (edge(d)) held[d + "T"] = t; }
      }
      if (edge("A") || edge("start")){ const el = document.activeElement; if (el && el !== document.body && el.click) el.click(); else move("down"); }
      if (edge("B")) back();
    }
    for (const n in st) held[n] = st[n];
  }
  window.addEventListener("gamepadconnected", () => { if (!raf) raf = requestAnimationFrame(poll); });
  window.addEventListener("gamepaddisconnected", () => { if (!pads().length){ cancelAnimationFrame(raf); raf = 0; } });
})();
