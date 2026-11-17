// season.js — Season 3 «Beute» (18.11.2026): Kisten öffnen, Diamanten, Season Pass, Shop (In-App-Käufe), Tageskiste.
// Braucht ui.js (UI: save, persist, show, toast, giveXp, unlockVault, updateCash) und loot.js (window.Loot, Regeln).
// Regeln: KEIN Glücksspiel-Wording (Apple), Kisten fallen nach Leistung (Sieg/Seltenheit), nichts kostet Echtgeld ausser
// die Shop-Produkte in der App (Apple/Google). Im Browser gibt es keinen Kauf — Hinweis «Nur in der App».
window.Season = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const S = () => UI.save;
  const L = () => window.Loot;
  const GEM = `<svg class="gemi" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8f3ff"/><stop offset=".55" stop-color="#3fd0ff"/><stop offset="1" stop-color="#1b6cff"/></linearGradient></defs><path d="M6 3h12l4 6-10 13L2 9z" fill="url(#gg)"/><path d="M2 9h20M6 3l4 6 2-6 2 6 4-6M10 9l2 13 2-13" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/></svg>`;
  const fmtN = n => Math.round(n).toLocaleString("de-CH");
  const fmtLeft = ms => { const h = Math.floor(ms / 36e5), d = Math.floor(h / 24), m = Math.floor((ms % 36e5) / 6e4); return d >= 1 ? `${d} T ${h % 24} h` : h >= 1 ? `${h} h ${m} Min` : `${m} Min`; };
  const native = () => !!window.NativeBridge?.isNative && !!window.NativeBridge?.iapEnabled;
  const haptic = k => window.NativeBridge?.haptic?.(k);
  const fire = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

  function ensure(){ const s = S(); s.gems = s.gems ?? 0; s.crates = s.crates ?? []; L().passState(s); return s; }
  function updateGems(){ const s = ensure(); document.querySelectorAll(".gems b").forEach(el => el.textContent = fmtN(s.gems)); }

  // ── Gegenstände ──
  const ICON = { bolts: "🔩", xp2: "⚡", rest: "💤", crate: "🎁", car: "🔑" };
  function itemLabel(it){
    if (it.t === "bolts") return `+${fmtN(it.n)} Bolts`;
    if (it.t === "gems")  return `+${fmtN(it.n)} Diamanten`;
    if (it.t === "xp2")   return `XP ×2 · ${it.min >= 1440 ? "24 h" : it.min >= 60 ? (it.min / 60) + " h" : it.min + " Min"}`;
    if (it.t === "rest")  return `Ausgeruht +${Math.round(it.lv * 100)} %`;
    if (it.t === "crate") return L().CRATES[it.k].n;
    if (it.t === "car")   return (CAR_DEFS[it.k]?.name ?? it.k) + " · Auto";
    return "?";
  }
  const itemIcon = it => it.t === "gems" ? GEM : `<i>${ICON[it.t] || "·"}</i>`;
  const itemCls = it => it.t === "crate" ? `r-${L().CRATES[it.k].rar}` : it.t === "car" ? "r-epic" : it.t === "gems" ? "gemc" : "";
  // Gegenstand anwenden (sofort gespeichert — eine gekillte App verliert nichts)
  function apply(it){
    const s = ensure();
    if (it.t === "bolts") s.money += it.n;
    else if (it.t === "gems") s.gems += it.n;
    else if (it.t === "xp2") L().addBoost(s, it.min);
    else if (it.t === "rest") s.restLv = Math.min(1.5, (s.restLv || 0) + it.lv);
    else if (it.t === "crate") s.crates.push({ k: it.k, lvl: UI.cur()?.lvl ?? 1, at: Date.now() });
    else if (it.t === "car"){ if (!s.cars[it.k]?.owned){ UI.unlockVault(it.k); s.cars[it.k].got = Date.now(); } else s.gems += 200; }
    UI.persist(); UI.updateCash();
  }

  // ── Nach dem Rennen: Beute-Zeilen fürs Ergebnis (einmal pro Rennen) ──
  function resultRows(enc, res){
    if (res._drop) return res._drop.rows;
    const s = ensure(), drop = L().rollDrops(enc, !!res.win, Math.random, { perfects: res.perfects || 0 });
    const before = L().passState(s).tier;
    s.gems += drop.gems;
    const ps = drop.pass ? L().addPassPoints(s, drop.pass) : L().passState(s);
    let crateIdx = -1;
    if (drop.crate){ s.crates.push({ k: drop.crate, lvl: enc.lvl, at: Date.now(), race: true }); crateIdx = s.crates.length - 1; }
    UI.persist(); updateGems();
    const rows = [];
    if (drop.crate){ const C = L().CRATES[drop.crate];
      rows.push(`<button class="loot crate r-${C.rar}" data-crate="${crateIdx}" style="animation-delay:.6s"><span class="crbox"><i class="lid"></i></span><div><b>${C.n}</b><small>${res.win ? "Beute vom Sieg" : "Trostpreis"} · Tippen zum Öffnen</small></div><em>ÖFFNEN</em></button>`); }
    if (drop.gems) rows.push(`<div class="loot gemc" style="animation-delay:.75s">${GEM}<div>+${drop.gems} Diamanten</div></div>`);
    if (drop.pass){ const up = ps.tier > before;
      rows.push(`<div class="loot pass${up ? " up" : ""}" style="animation-delay:.9s"><i>🏁</i><div>+${drop.pass} Pass-Punkte${up ? ` <small>Stufe ${ps.tier} erreicht — Belohnung abholen</small>` : ` <small>Stufe ${ps.tier + (ps.done ? 0 : 1)} · ${ps.into}/${ps.need || "–"}</small>`}</div></div>`); }
    res._drop = { drop, rows };
    return rows;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-crate]"); if (!b) return;
    e.preventDefault(); openCrateUI(+b.dataset.crate, b);
  });

  // ── Kiste öffnen (Vollbild): Tippen → Deckel fliegt → Gegenstände nacheinander ──
  let crateState = null;
  function openCrateUI(idx, srcBtn){
    const s = ensure(), cr = s.crates[idx]; if (!cr) return;
    const items = L().openCrate(cr.k, cr.lvl, Math.random);
    s.crates.splice(idx, 1); items.forEach(apply);           // sofort gutgeschrieben
    if (srcBtn){ srcBtn.disabled = true; srcBtn.classList.add("opened"); srcBtn.querySelector("em").textContent = "GEÖFFNET"; }
    const C = L().CRATES[cr.k], ov = $("crate");
    crateState = { items, i: 0, C };
    ov.className = `on r-${C.rar} closed`;
    ov.innerHTML = `<div class="cr-rays"></div>
      <div class="cr-title"><span class="rarlbl">${C.n}</span><div class="cr-hint">Tippen zum Öffnen</div></div>
      <div class="cr-stage"><div class="cr-box"><i class="cr-lid"></i><i class="cr-front"></i><i class="cr-lock"></i></div></div>
      <div class="cr-items"></div>
      <button class="mbtn primary cr-ok" style="display:none">Einsammeln</button>`;
    AudioSys.radarTick(0.6);
    ov.onclick = crateTap;
    ov.querySelector(".cr-ok").onclick = e => { e.stopPropagation(); closeCrate(); };
  }
  function crateTap(){
    const st = crateState, ov = $("crate"); if (!st) return;
    if (ov.classList.contains("closed")){
      ov.classList.remove("closed"); ov.classList.add("shake");
      haptic("medium"); AudioSys.vsSlam();
      setTimeout(() => { ov.classList.remove("shake"); ov.classList.add("open"); haptic("heavy"); AudioSys.loot(st.C.rar === "epic" || st.C.rar === "legend"); ov.querySelector(".cr-hint").textContent = "Tippen für den nächsten Gegenstand"; revealNext(); }, 650);
      return;
    }
    if (ov.classList.contains("open")) revealNext();
  }
  function revealNext(){
    const st = crateState, ov = $("crate"); if (!st) return;
    if (st.i >= st.items.length){ ov.querySelector(".cr-hint").textContent = ""; ov.querySelector(".cr-ok").style.display = ""; return; }
    const it = st.items[st.i++], box = ov.querySelector(".cr-items");
    const el = document.createElement("div"); el.className = `cr-item ${itemCls(it)}`; el.innerHTML = `${itemIcon(it)}<b>${itemLabel(it)}</b>`;
    box.appendChild(el); haptic(it.t === "gems" || it.t === "car" ? "heavy" : "light"); AudioSys.reveal(it.t === "car" ? "legend" : it.t === "gems" ? "blue" : "green");
    if (st.i >= st.items.length) setTimeout(() => { ov.querySelector(".cr-hint").textContent = ""; ov.querySelector(".cr-ok").style.display = ""; }, 400);
  }
  function closeCrate(){ const ov = $("crate"); ov.className = ""; ov.innerHTML = ""; crateState = null; renderMenu(); fire("redline:crate-collected"); }

  // ── Menü: Pass-Karte + Tageskiste + Boost ──
  function renderMenu(){
    const s = ensure(), hp = $("heroPass"); if (!hp) return;
    const ps = L().passState(s), cl = L().claimable(s).length, daily = L().dailyReady(s), boost = L().boostActive(s);
    hp.innerHTML = `<button class="hp-pass" data-go="season" aria-label="Season Pass">
        <span class="hp-k">${esc(L().SEASON.n)} <small>· noch ${fmtLeft(ps.left)}</small></span>
        <span class="hp-row"><b class="hp-tier">STUFE ${ps.tier}</b><span class="hp-bar"><i style="width:${Math.round(ps.pct * 100)}%"></i></span><span class="hp-pts">${ps.done ? "MAX" : `${ps.into}/${ps.need}`}</span></span>
        ${cl ? `<span class="hp-claim">${cl} Belohnung${cl > 1 ? "en" : ""} abholen</span>` : `<span class="hp-more">${ps.prem ? "Premium aktiv" : "Pass ansehen"} ›</span>`}
      </button>
      <div class="hp-chips">
        <button class="hp-chip${daily ? " ready" : ""}" id="dailyBtn">🎁 ${daily ? "Tageskiste bereit" : `Tageskiste in ${fmtLeft(L().dailyLeftMs(s))}`}</button>
        ${boost ? `<span class="hp-chip boost">⚡ XP ×2 · ${fmtLeft(L().boostLeftMs(s))}</span>` : ""}
        ${s.crates.length ? `<button class="hp-chip ready" id="cratesBtn">📦 ${s.crates.length} Kiste${s.crates.length > 1 ? "n" : ""} ungeöffnet</button>` : ""}
      </div>`;
    hp.querySelector(".hp-pass").onclick = () => UI.show("season");
    $("dailyBtn").onclick = claimDaily;
    const cb = $("cratesBtn"); if (cb) cb.onclick = () => openCrateUI(0);
    updateGems();
  }
  function claimDaily(){
    const s = ensure();
    if (!L().dailyReady(s)) return UI.toast(`Nächste Tageskiste in ${fmtLeft(L().dailyLeftMs(s))}`);
    s.daily = Date.now(); s.crates.push({ k: L().dailyCrate(s), lvl: UI.cur()?.lvl ?? 1, at: Date.now(), daily: true }); UI.persist();
    openCrateUI(s.crates.length - 1);
  }

  // ── Season-Pass-Screen ──
  let prices = null;
  async function loadPrices(){
    if (prices || !native()) return prices || {};
    try { const list = await window.NativeBridge.products(Object.values(L().PRODUCTS).map(p => p.id)); prices = {}; list.forEach(p => prices[p.id] = p.price); } catch { prices = {}; }
    return prices;
  }
  const priceOf = id => prices?.[id] || null;
  async function render(){
    const s = ensure(), body = $("seasonBody"), ps = L().passState(s), P = L().PRODUCTS, G = L().GEM_PRICES;
    const tiers = Array.from({ length: L().SEASON.tiers }, (_, i) => i + 1);
    const cell = (t, prem) => {
      const rw = L().passReward(t, prem), claimed = !!s.pass[prem ? "cp" : "cf"][t], reach = t <= ps.tier, locked = prem && !ps.prem;
      const st = claimed ? "done" : locked ? "locked" : reach ? "ready" : "far";
      return `<button class="pcell ${st} ${itemCls(rw[0])}" data-claim="${t}:${prem ? 1 : 0}" ${st !== "ready" ? "disabled" : ""} aria-label="Stufe ${t} ${prem ? "Premium" : "Gratis"}">
        ${rw.map(it => `<span class="pci">${itemIcon(it)}<small>${itemLabel(it)}</small></span>`).join("")}
        ${claimed ? `<i class="pck">✓</i>` : locked ? `<i class="pck">🔒</i>` : st === "ready" ? `<i class="pck go">ABHOLEN</i>` : ""}</button>`;
    };
    body.innerHTML = `
      <div class="ps-head r-epic">
        <div class="ps-k">${esc(L().SEASON.n)}</div>
        <div class="ps-row"><b class="hp-tier big">STUFE ${ps.tier}</b><div class="ps-bar"><i style="width:${Math.round(ps.pct * 100)}%"></i><span>${ps.done ? "Alle Stufen erreicht" : `${ps.into} / ${ps.need} Punkte bis Stufe ${ps.tier + 1}`}</span></div></div>
        <div class="ps-sub">Noch ${fmtLeft(ps.left)} · Pass-Punkte gibt es für jeden Sieg (Grau 1 · Grün 2 · Blau 3 · Episch 5 · Legendär 10, +1 bei 3 perfekten Schaltungen)</div>
      </div>
      <div class="ptrack-wrap">
        <div class="ptrack-lbl"><span>GRATIS</span><span class="prem">PREMIUM${ps.prem ? " · AKTIV" : ""}</span></div>
        <div class="ptrack" id="ptrack">${tiers.map(t => `<div class="pt${t <= ps.tier ? " reached" : ""}${t === ps.tier + 1 ? " next" : ""}">${cell(t, false)}<i class="pnum">${t}</i>${cell(t, true)}</div>`).join("")}</div>
      </div>
      ${ps.prem ? `<div class="ps-prem on">★ Premium aktiv — alle Premium-Belohnungen dieser Season gehören dir.</div>`
        : `<button class="mbtn primary ps-buy" data-buy="${P.pass.id}">SEASON PASS HOLEN<small>${priceOf(P.pass.id) ? priceOf(P.pass.id) + " · einmalig für diese Season" : native() ? "Preis wird geladen …" : "Nur in der App (App Store / Google Play)"}</small></button>
           <ul class="ps-perks"><li>Premium-Spur mit 30 Belohnungen: Diamanten, Bolts, Boss- und Elite-Kisten, XP ×2</li><li>Stufe 30: <b>KURO ØNI</b> — das Season-Auto</li><li>Tageskiste wird zur Tuner-Kiste</li><li>Bereits erreichte Stufen zählen rückwirkend</li></ul>`}
      <h3 class="ps-h">Shop</h3>
      <div class="shop">
        <button class="shopc" data-gem="xp2"><i>⚡</i><b>XP ×2 für 24 h</b><small>Doppelte Erfahrung in jedem Rennen</small><em>${GEM} ${G.xp2_24h}</em></button>
        <button class="shopc" data-gem="boss"><i>🎁</i><b>Boss-Kiste</b><small>Bolts, Diamanten, Chance auf XP ×2</small><em>${GEM} ${G.boss_crate}</em></button>
        ${ps.done ? "" : `<button class="shopc" data-gem="tier"><i>🏁</i><b>Pass-Stufe kaufen</b><small>Sofort zur nächsten Stufe</small><em>${GEM} ${G.tier}</em></button>`}
        <button class="shopc iap" data-buy="${P.xp2.id}"><i>⚡</i><b>XP ×2 für 24 h</b><small>Direkt kaufen</small><em>${priceOf(P.xp2.id) || (native() ? "…" : "Nur in der App")}</em></button>
        ${["g100", "g550", "g1200"].map(k => `<button class="shopc iap gemc" data-buy="${P[k].id}">${GEM}<b>${P[k].n}</b><small>${P[k].tag || "Premium-Währung"}</small><em>${priceOf(P[k].id) || (native() ? "…" : "Nur in der App")}</em></button>`).join("")}
      </div>
      <div class="ps-foot">
        <button class="ps-link" id="restoreBtn">Käufe wiederherstellen</button>
        <button class="ps-link" id="tutBtn">Tutorial erneut zeigen</button>
        <p class="mut">Diamanten und Pass gehören zu deinem Spielstand (Cloud-Login sichert ihn). Der Season Pass gilt nur für diese Season. Kein Echtgeld-Gewinn, keine Zufallskäufe: Kisten fallen nach Leistung.</p>
      </div>`;
    body.querySelectorAll("[data-claim]").forEach(b => b.onclick = () => { const [t, p] = b.dataset.claim.split(":"); doClaim(+t, p === "1", b); });
    body.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => buy(b.dataset.buy));
    body.querySelectorAll("[data-gem]").forEach(b => b.onclick = () => gemBuy(b.dataset.gem));
    $("restoreBtn").onclick = restore;
    $("tutBtn").onclick = () => { window.Tut?.restart?.(); };
    const tr = $("ptrack"), nx = tr.querySelector(".pt.next") || tr.lastElementChild; if (nx) tr.scrollLeft = Math.max(0, nx.offsetLeft - tr.clientWidth / 2 + nx.offsetWidth / 2);
    updateGems();
    if (native() && !prices){ await loadPrices(); if ($("season").classList.contains("on")) render(); }
  }
  function doClaim(t, prem, btn){
    const s = ensure(), rw = L().claim(s, t, prem); if (!rw) return;
    rw.forEach(apply); haptic("heavy"); AudioSys.loot(rw.some(r => r.t === "car" || r.t === "crate"));
    if (btn){ btn.classList.remove("ready"); btn.classList.add("done", "pop"); btn.disabled = true; btn.querySelector(".pck")?.remove(); btn.insertAdjacentHTML("beforeend", `<i class="pck">✓</i>`); }
    UI.toast(rw.map(itemLabel).join(" · "));
    fire("redline:claimed", { t, prem });
    if (rw.some(r => r.t === "crate")) setTimeout(() => openCrateUI(s.crates.length - 1), 500);
  }
  function spend(n){ const s = ensure(); if (s.gems < n){ UI.toast(`Nicht genug Diamanten (${s.gems}/${n})`); return false; } s.gems -= n; UI.persist(); updateGems(); haptic("medium"); return true; }
  function gemBuy(what){
    const s = ensure(), G = L().GEM_PRICES;
    if (what === "xp2"){ if (!spend(G.xp2_24h)) return; L().addBoost(s, 1440); UI.persist(); UI.toast("XP ×2 aktiv für 24 h"); }
    if (what === "boss"){ if (!spend(G.boss_crate)) return; s.crates.push({ k: "boss", lvl: UI.cur()?.lvl ?? 1, at: Date.now() }); UI.persist(); openCrateUI(s.crates.length - 1); }
    if (what === "tier"){ if (!spend(G.tier)) return; L().buyTier(s); UI.persist(); UI.toast("Nächste Pass-Stufe erreicht"); }
    render();
  }
  // ── In-App-Kauf über die Bridge (RevenueCat → App Store / Play) ──
  let buying = false;
  async function buy(pid){
    if (!native()) return UI.toast("Käufe gibt es nur in der App (App Store / Google Play).");
    if (buying) return; buying = true;
    try {
      const r = await window.NativeBridge.purchase(pid);
      if (r.cancelled) return;
      if (!r.ok) return UI.toast(r.error || "Kauf fehlgeschlagen");
      grant(pid, r.owned || []);
    } finally { buying = false; }
  }
  function grant(pid, owned){
    const s = ensure(), P = L().PRODUCTS;
    if (pid === P.pass.id || owned.includes(P.pass.id)){ s.pass.prem = true; }
    if (pid === P.xp2.id) L().addBoost(s, 1440);
    const g = Object.values(P).find(p => p.id === pid && p.gems); if (g) s.gems += g.gems;
    s.iap = s.iap ?? []; s.iap.push({ pid, at: Date.now() });
    UI.persist(); updateGems(); haptic("heavy"); AudioSys.levelUp();
    UI.toast(pid === P.pass.id ? "Season Pass aktiv — Premium-Belohnungen freigeschaltet" : pid === P.xp2.id ? "XP ×2 aktiv für 24 h" : g ? `+${g.gems} Diamanten` : "Gekauft");
    render();
  }
  async function restore(){
    if (!native()) return UI.toast("Nur in der App.");
    const r = await window.NativeBridge.restore();
    if (!r.ok) return UI.toast(r.error || "Wiederherstellen fehlgeschlagen");
    const s = ensure(); let n = 0;
    if (r.owned.includes(L().PRODUCTS.pass.id) && !s.pass.prem){ s.pass.prem = true; n++; }
    UI.persist(); UI.toast(n ? "Season Pass wiederhergestellt" : "Nichts zum Wiederherstellen (Diamanten und Boosts sind im Spielstand).");
    render();
  }
  // Beim Start: gekaufter Pass auf diesem Apple-/Google-Konto? (z. B. neues Gerät ohne Cloud-Login)
  async function syncOwned(){
    if (!native()) return;
    try { const owned = await window.NativeBridge.owned(); const s = ensure(); if (owned.includes(L().PRODUCTS.pass.id) && !s.pass.prem){ s.pass.prem = true; UI.persist(); renderMenu(); } } catch {}
  }
  // Das Menü kann schon stehen, bevor dieses Skript geladen ist (Boot nach await) → nachziehen
  if ($("menu")?.classList.contains("on")) renderMenu(); else updateGems();
  setTimeout(syncOwned, 2500);
  setInterval(() => { if ($("menu")?.classList.contains("on")) renderMenu(); }, 60000);   // Zähler (Tageskiste/Boost) aktuell halten

  return { ensure, updateGems, resultRows, openCrateUI, renderMenu, render, claimDaily, buy, restore, grant, itemLabel, GEM };
})();
