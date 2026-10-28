// i18n.js — Sprache (28.10.2026): Deutsch oder Englisch. Standard: Gerätesprache (de* → Deutsch, sonst Englisch),
// umschaltbar im Menü (🌐). Der Spielcode bleibt deutsch; im Englisch-Modus übersetzt diese Schicht ALLES Sichtbare:
//  • DOM-Text + placeholder/aria-label/title (MutationObserver — auch was später per innerHTML/textContent kommt)
//  • Canvas-Text im Rennen (fillText/strokeText/measureText)  • confirm/alert/prompt  • Dokument-Titel
// Wörterbuch: js/i18n-en.js (window.I18N_EN). Schlüssel mit {0},{1}… sind Muster für dynamische Werte (Namen, Zahlen).
// Fehlende Übersetzungen: I18N.missing() (Debug/QA).
const I18N = (() => {
  const KEY = "redline:lang";
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  const lang = saved === "de" || saved === "en" ? saved : ((navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en");
  document.documentElement.lang = lang;
  const on = lang === "en";
  const exact = new Map(), tpl = [], cache = new Map(), miss = new Set();
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [k, v] of Object.entries(window.I18N_EN || {})){
    if (/\{\d+\}/.test(k)){
      let re = "^", order = [];
      for (const p of k.split(/(\{\d+\})/)){
        const m = p.match(/^\{(\d+)\}$/);
        if (m){ re += "(.*?)"; order.push(+m[1]); } else re += esc(p);
      }
      tpl.push({ re: new RegExp(re + "$", "s"), order, v, len: k.replace(/\{\d+\}/g, "").length });
    } else exact.set(k, v);
  }
  tpl.sort((a, b) => b.len - a.len);       // spezifischere Muster zuerst
  const GERMAN = /[äöüÄÖÜ]|\b(der|die|das|und|nicht|mit|dein|deine|ist|auf|für|gegen|noch|wird|kein|keine|jetzt|Gegner|Auto|Rennen|Stufe|Leistung|Freund|Zeit)\b/;

  function core(t){
    let c = cache.get(t);
    if (c !== undefined) return c;
    c = exact.get(t);
    if (c == null){
      for (const x of tpl){
        const m = t.match(x.re);
        if (m){ c = x.v.replace(/\{(\d+)\}/g, (_, i) => { const j = x.order.indexOf(+i); return j >= 0 ? tr(m[j + 1]) : ""; }); break; }
      }
    }
    if (c == null){ c = null; if (GERMAN.test(t)) miss.add(t); }
    if (cache.size > 6000) cache.clear();
    cache.set(t, c);
    return c;
  }
  function tr(s){
    if (!on || s == null) return s;
    s = String(s);
    const t = s.trim();
    if (!t || !/[A-Za-zÄÖÜäöü]/.test(t)) return s;
    const c = core(t);
    if (c == null) return s;
    return s.slice(0, s.indexOf(t)) + c + s.slice(s.indexOf(t) + t.length);
  }

  if (on){
    const ATTR = ["placeholder", "aria-label", "title"];
    const walk = node => {
      if (node.nodeType === 3){ const v = node.nodeValue, n = tr(v); if (n !== v) node.nodeValue = n; return; }
      if (node.nodeType !== 1 || node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
      for (const a of ATTR){ const v = node.getAttribute(a); if (v){ const n = tr(v); if (n !== v) node.setAttribute(a, n); } }
      for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
    };
    const mo = new MutationObserver(ms => {
      for (const m of ms){
        if (m.type === "characterData") walk(m.target);
        else if (m.type === "attributes") walk(m.target);
        else m.addedNodes.forEach(walk);
      }
    });
    const start = () => { walk(document.body); document.title = tr(document.title);
      mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR }); };
    if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
    // Canvas-Text (Tacho-Hinweise, Ampel, Ziel …) — gleiche Übersetzung für Messen und Zeichnen
    const P = CanvasRenderingContext2D.prototype;
    for (const fn of ["fillText", "strokeText", "measureText"]){
      const o = P[fn];
      P[fn] = function(text, ...a){ return o.call(this, typeof text === "string" ? tr(text) : text, ...a); };
    }
    for (const fn of ["confirm", "alert", "prompt"]){
      const o = window[fn].bind(window);
      window[fn] = (msg, ...a) => o(tr(msg), ...a);
    }
  }
  // Sprach-Knopf im Menü: zeigt die ANDERE Sprache
  const btn = () => { const b = document.getElementById("langBtn"); if (!b) return;
    b.textContent = on ? "🌐 Deutsch" : "🌐 English"; b.onclick = () => set(on ? "de" : "en"); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", btn); else btn();
  function set(l){ try { localStorage.setItem(KEY, l); } catch {} location.reload(); }
  return { lang, t: tr, set, missing: () => [...miss] };
})();
window.I18N = I18N;
