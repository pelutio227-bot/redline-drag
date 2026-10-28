// ui.js v2 — Screens, Starter-Wahl, endlose Karriere, XP/Level, Garage (20 Autos),
// Resultat-Animationen (Geld-Count-Up, Level-Up), VS-Freund-Link (Auto als Code).

const UI = (() => {
  const SAVE_KEY = "redline:save:v2";

  function defaultCarState(key){
    const def = CAR_DEFS[key];
    return {
      owned: false,
      up: { engine:0, turbo:0, tires:0, trans:0, weight:0, nos:0 },
      tune: { gears: def.gears.slice(), final: def.final, launchRpm: Math.round(def.redline*0.5) },
      style: { hue: (CAR_KEYS.indexOf(key)*53+355)%360, drop: 6, rim: 0, exhaust: 0, spoiler: 0, neon: 0, kit: 0 },
      bestEt: null,
    };
  }
  // Style-Kauf-Migration: was ein alter Spielstand schon montiert hat, gilt als
  // gekauft (nichts wird weggenommen) — alles andere kostet ab jetzt Cash.
  function migrateStyle(s){
    if (s.styleV) return;
    CAR_KEYS.forEach(k => {
      const c = s.cars[k]; if (!c) return;
      const st = c.style, d = defaultCarState(k).style;
      c.styleOwned ??= {};
      if (st.rim)     c.styleOwned["rim"+st.rim] = true;
      if (st.exhaust) c.styleOwned["exhaust"+st.exhaust] = true;
      if (st.spoiler) c.styleOwned["spoiler"+st.spoiler] = true;
      if (st.kit)     c.styleOwned["kit"+st.kit] = true;
      if (st.neon)    c.styleOwned.neon1 = true;
      if (st.hue !== d.hue)   c.styleOwned.paint = true;
      if (st.drop !== d.drop) c.styleOwned.stance = true;
    });
    s.styleV = 1;
  }
  function load(){
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s?.cars){
        // Migration: neue Autos (Elite-Liga) in alte Spielstände einfüllen
        CAR_KEYS.forEach(k => { if (!s.cars[k]) s.cars[k] = defaultCarState(k); });
        if (s.current && !s.cars[s.current]) s.current = null;
        migrateStyle(s);
        s.losses ??= {};
        return s;
      }
    } catch {}
    const cars = {};
    CAR_KEYS.forEach(k => cars[k] = defaultCarState(k));
    return { money: 800, xp: 0, level: 1, tier: 0, current: null, name: "RACER", cars, losses: {} };
  }
  const save = load();
  function persist(){
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
    window.Cloud?.push?.();          // Cloud-Backup (debounced, nur wenn angemeldet)
  }
  // Cloud-Spielstand übernehmen (in-place, damit alle Referenzen gültig bleiben)
  function applyCloud(cloud){
    CAR_KEYS.forEach(k => { if (!cloud.cars?.[k]) cloud.cars[k] = defaultCarState(k); });
    migrateStyle(cloud);
    Object.keys(save).forEach(k => delete save[k]);
    Object.assign(save, cloud);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
    if (!Race.active()) show(save.current ? "menu" : "starter");
  }
  const xpNeed = lvl => 70 + lvl*55;

  // ── Screens ──
  const SCREENS = ["menu","career","garage","results","starter","vschall","duo","vault"];
  function show(id){
    SCREENS.forEach(s=>{ const el=document.getElementById(s); if (el) el.classList.toggle("on", s===id); });
    document.getElementById("hud").classList.remove("on");
    hideLevelUp();
    if (id !== "results") Race.clear?.();      // kein eingefrorenes Rennbild hinter Garage & Co.
    if (id==="menu") renderMenu();
    if (id==="career") renderCareer();
    if (id==="garage") renderGarage();
    if (id==="vault") renderVault();
    updateCash();
  }
  function updateCash(){
    ["cash1","cash2","cash3","cash4"].forEach(id=>{
      const el = document.getElementById(id);
      if (el) el.textContent = save.money.toLocaleString("de-CH");
    });
    const lp = document.getElementById("lvlPill");
    if (lp) lp.innerHTML = `LV ${save.level} <i style="width:${Math.round(100*save.xp/xpNeed(save.level))}%"></i>`;
  }
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click", ()=>{
    AudioSys.unlock();
    const go = b.dataset.go;
    if (go === "quick") return startQuick();
    if (go === "duo") return Duo.open();
    if (go === "next") return startCareer(save.tier);
    show(go);
  }));

  async function renderMenu(){
    if (!save.current) return;
    const st = save.cars[save.current].style;
    const img = await carImage(save.current, st, true);
    const mc = document.getElementById("menuCar");
    mc.src = img.src;
    mc.style.filter = `drop-shadow(0 24px 30px rgba(0,0,0,.6)) drop-shadow(0 4px 34px hsla(${st.hue},90%,55%,.42))`;
    document.getElementById("menuCarName").textContent = CAR_DEFS[save.current].name;
    const o = rivalFor(save.tier);
    const sm = document.querySelector('#menu [data-go="career"] small');
    if (sm) sm.textContent = leagueLabel(o) + " · VS " + o.name;
  }
  function leagueLabel(o){
    return o.league >= LEAGUES.length ? "Endlos-Liga" : `Liga ${o.league+1} · Rennen ${o.idx+1}/${LEAGUE_SIZE}`;
  }

  // ── Starter-Wahl (1 aus 3, Pokemon-Style) ──
  async function renderStarter(){
    const el = document.getElementById("starterCards");
    el.innerHTML = "";
    const starters = CAR_KEYS.filter(k=>CAR_DEFS[k].starter);
    for (const k of starters){
      const def = CAR_DEFS[k];
      const img = await carImage(k, defaultCarState(k).style);
      const c = document.createElement("button");
      c.className = "startercard";
      c.innerHTML = `<img src="${img.src}" alt="">
        <b>${def.name}</b><span>${def.desc}</span>
        <span style="font-weight:800;font-size:13px;margin-top:3px">${carPS(def)} PS · ${def.mass} kg</span>
        <div class="pc"><em>+ ${def.pros}</em><em class="con">− ${def.cons}</em></div>
        ${statBars(def)}`;
      c.addEventListener("click", ()=>{
        save.cars[k].owned = true; save.current = k; persist();
        AudioSys.unlock(); AudioSys.winJingle();
        // Neuling kam über einen Live-Duell-Link → direkt in die Lobby
        if (window.DUEL_CODE){ const c = window.DUEL_CODE; window.DUEL_CODE = null; Duo.open(c); return; }
        show("menu");
      });
      el.appendChild(c);
    }
  }
  const sp = d => (d.mass / carPS(d)).toFixed(1);   // Leistungsgewicht
  function statBars(def){
    const peak = Math.max(...def.torque.map(t=>t[1]));
    const pw = Math.min(100, peak/8.2);
    const wt = Math.min(100, 100 - (def.mass-750)/10);
    const gr = Math.min(100, (def.grip??1)*72);
    const rv = Math.min(100, def.redline/98);
    const bar = (l,v)=>`<div class="sb"><span>${l}</span><i><b style="width:${v}%"></b></i></div>`;
    return `<div class="sbs">${bar("Power",pw)}${bar("Leicht",wt)}${bar("Grip",gr)}${bar("Drehzahl",rv)}</div>`;
  }

  // ── Karriere: Ligen mit eigenen Rivalen + Boss ──
  // Rivalen haben feste Stärken (sim.js LEAGUES). Neben jedem Rivalen steht seine
  // erwartete Zeit und deine — so sieht man sofort, was ein Upgrade bringt.
  function rivalEt(o){ return o.et * (1 + 0.008*Math.min(3, save.losses?.[o.tier] || 0)); }
  function compareTag(myEt, rEt){
    const d = rEt - myEt;
    if (d > 0.08)  return `<span class="tag ok">Du bist ${d.toFixed(2)}s schneller</span>`;
    if (d > -0.08) return `<span class="tag mid">Kopf an Kopf</span>`;
    return `<span class="tag bad">Rivale ${(-d).toFixed(2)}s vorne — tunen!</span>`;
  }
  function renderCareer(){
    const el = document.getElementById("careerList");
    el.innerHTML = "";
    const cur = rivalFor(save.tier), L = cur.league;
    const myEt = carSimET(save.current, save.cars[save.current]);
    const endless = L >= LEAGUES.length;
    // Liga-Leiste
    const chips = LEAGUES.map((lg, i) =>
      `<i class="lchip ${i < L ? "done" : i === L ? "on" : ""}" title="${lg.name}">${i < L ? "✓" : i+1}</i>`).join("")
      + `<i class="lchip ${endless ? "on" : ""}">∞</i>`;
    const head = div("card lhead", `
      <div class="lchips">${chips}</div>
      <span class="vsl">${endless ? "ENDLOS-LIGA" : `LIGA ${L+1} VON ${LEAGUES.length}`}</span>
      <b class="vsn">${endless ? "Nur die Härtesten" : LEAGUES[L].name}</b>
      <span class="mut" style="font-size:12px">Dein Auto: <b style="color:var(--txt)">${CAR_DEFS[save.current].name}</b> · ≈ ${myEt.toFixed(2)}s</span>`);
    el.appendChild(head);
    const from = endless ? Math.max(LEAGUES.length*LEAGUE_SIZE, save.tier-1) : L*LEAGUE_SIZE;
    const to = endless ? save.tier + 2 : L*LEAGUE_SIZE + LEAGUE_SIZE - 1;
    for (let i = from; i <= to; i++){
      const o = rivalFor(i);
      const beaten = i < save.tier, locked = i > save.tier, current = i === save.tier;
      const rEt = rivalEt(o);
      const c = document.createElement("div");
      c.className = "card vsrow" + (locked ? " lock" : "") + (current ? " cur" : "") + (o.boss ? " boss" : "");
      c.innerHTML = `
        <div class="vsava">${o.emoji}</div>
        <div class="nm">
          <span class="vsl">${o.boss ? '<b style="color:#FFC61A">BOSS</b> · ' : ""}RENNEN ${o.idx+1}${beaten ? ' · <b style="color:var(--grn)">BESIEGT ✓</b>' : ""}</span>
          <b class="vsn">VS ${o.name}</b>
          <span>${CAR_DEFS[o.car].name} · ≈ ${rEt.toFixed(2)}s</span>
          ${current ? compareTag(myEt, rEt) : ""}
          <span style="color:var(--grn);font-weight:800">${beaten
            ? `$${Math.round(o.prize/3).toLocaleString("de-CH")} <span class="mut" style="font-weight:600">(Rematch ⅓)</span>`
            : `$${o.prize.toLocaleString("de-CH")} Preisgeld`}</span>
        </div>
        <button class="buy ${current?"can":""}" aria-label="${locked?"gesperrt":"Rennen starten"}">${locked?"🔒":(beaten?"↺":"RACE")}</button>`;
      if (!locked) c.querySelector("button").addEventListener("click", ()=>startCareer(i));
      el.appendChild(c);
    }
    if (!endless){
      const nx = L+1 < LEAGUES.length ? `Liga ${L+2} · ${LEAGUES[L+1].name}` : "Endlos-Liga";
      el.appendChild(div("card lock nextl", `<span class="vsl">DANACH</span><b class="vsn">🔒 ${nx}</b>
        <span class="mut" style="font-size:12px">Schlag den Boss ${LEAGUES[L].rivals[LEAGUE_SIZE-1].name}, dann geht's weiter.</span>`));
    }
  }

  // ── Garage ──
  let gTab = "cars";
  // Style-VORSCHAU: ungekaufte Teile werden nur hier eingeblendet (nie im Save/
  // Rennen). Kauf = expliziter Knopf; Tab-/Auto-Wechsel verwirft die Vorschau.
  let stylePreview = {};
  document.getElementById("gTabs").addEventListener("click", e=>{
    const b = e.target.closest("button"); if (!b) return;
    gTab = b.dataset.t;
    stylePreview = {};
    document.querySelectorAll("#gTabs button").forEach(x=>x.classList.toggle("on", x===b));
    renderGarageBody(); refreshPreview();
  });
  async function renderGarage(){ stylePreview = {}; markTab(); renderGoBar(); await refreshPreview(); renderGarageBody(); }
  // Schieber feuern viele Events → nur EIN Render gleichzeitig, danach der neueste Stand
  let pvBusy = null, pvAgain = false;
  function refreshPreview(){
    if (pvBusy){ pvAgain = true; return pvBusy; }
    pvBusy = (async () => {
      do { pvAgain = false; await refreshPreviewNow(); } while (pvAgain);
    })().finally(() => { pvBusy = null; });
    return pvBusy;
  }
  async function refreshPreviewNow(){
    const stl = { ...save.cars[save.current].style, ...stylePreview };
    const img = await carImage(save.current, stl, true);
    const el = document.getElementById("gCar");
    el.src = img.src;
    el.parentElement?.classList.toggle("probe", Object.keys(stylePreview).length > 0);
    el.style.filter = `drop-shadow(0 18px 22px rgba(0,0,0,.55)) drop-shadow(0 4px 30px hsla(${stl.hue},90%,55%,.4))`;
    const pcH = perfClass(save.current, save.cars[save.current]);
    document.getElementById("gCarName").innerHTML =
      `${classBadge(pcH.cls)} ${CAR_DEFS[save.current].name} <span class="mut" style="font-size:11px">≈ ${pcH.et.toFixed(2)}s</span>`;
  }

  // Kauf-Moment: Auto blitzt auf + Funken + Haptik
  function celebrate(){
    const w = document.getElementById("gCar")?.parentElement; if (!w) return;
    w.classList.remove("boom"); void w.offsetWidth; w.classList.add("boom");
    for (let i = 0; i < 14; i++){
      const sp = document.createElement("span"); sp.className = "spark";
      const a = Math.random()*Math.PI*2, r = 60 + Math.random()*90;
      sp.style.left = (40 + Math.random()*20) + "%"; sp.style.top = (45 + Math.random()*20) + "%";
      sp.style.setProperty("--dx", Math.cos(a)*r + "px"); sp.style.setProperty("--dy", Math.sin(a)*r*0.6 + "px");
      if (i % 3 === 0) sp.style.background = "#fff";
      w.appendChild(sp); setTimeout(() => sp.remove(), 900);
    }
    window.NativeBridge?.haptic?.("heavy");
  }

  // UPGRADES / upgCost / carSimET kommen aus sim.js (eine Quelle für Spiel + Test)

  // ── Performance-Klassen D–C–B–A–S: objektiv aus der Offline-Sim (¼-Meile).
  // Upgrades schieben das Auto in höhere Klassen → Lieblingsauto bleibt relevant.
  const classCache = {};
  const CLASS_COL = { S:"#FFD34D", A:"#FF4D6A", B:"#6EA8FF", C:"#2BE05E", D:"#8E92A3" };
  function perfClass(k, cs2){
    const key = k + JSON.stringify(cs2.up) + cs2.tune.final + "|" + cs2.tune.launchRpm + "|" + cs2.tune.gears.join(",");
    if (classCache[key]) return classCache[key];
    // Zeit-Potenzial = erwartete ¼-Meile gut gefahren (sim.js carSimET) — dieselbe
    // Kennzahl wie bei den Rivalen. Bänder passend zu den Ligen.
    const et = carSimET(k, cs2);
    const cls = et <= 9.7 ? "S" : et <= 10.5 ? "A" : et <= 11.9 ? "B" : et <= 13.7 ? "C" : "D";   // ≈ Liga 5–6 / 4 / 3 / 2 / 1
    return classCache[key] = { et, cls };
  }
  const classBadge = cls =>
    `<b style="display:inline-block;min-width:18px;text-align:center;padding:1px 6px;border-radius:6px;background:${CLASS_COL[cls]}26;color:${CLASS_COL[cls]};font-size:11px;font-style:normal">${cls}</b>`;

  // ── Style-Preise (eine Quelle — auch für den Verkaufswert) ──
  function stylePriceTable(k){
    const cp = CAR_DEFS[k].price || 0;
    const sp = (pct, min, cap = 30000) => Math.round(Math.max(min, Math.min(cp*pct, cap))/10)*10;
    return {
      paint:   sp(0.03, 300),
      stance:  sp(0.05, 500),
      rim:     [0, sp(0.05, 500), sp(0.07, 700), sp(0.08, 800)],
      exhaust: [0, sp(0.05, 450), sp(0.08, 750), sp(0.12, 1200)],
      spoiler: [0, sp(0.03, 300), sp(0.08, 800)],
      kit:     [0, sp(0.10, 1000), sp(0.18, 2000, 50000)],
      neon:    [0, sp(0.04, 400)],
    };
  }

  // ── Verkaufswert: 50% Basispreis + 60% der Performance- + 25% der Style-Investitionen ──
  function sellValue(k){
    const d = CAR_DEFS[k], c = save.cars[k];
    let up = 0;
    UPGRADES.forEach(u => { for (let i = 0; i < (c.up[u.k] || 0); i++) up += upgCost(u, i, k); });
    let style = 0;
    const P = stylePriceTable(k);
    Object.keys(c.styleOwned || {}).forEach(key => {
      if (key === "paint" || key === "stance"){ style += P[key]; return; }
      const mIdx = key.match(/^([a-z]+)(\d+)$/);
      if (mIdx && P[mIdx[1]]?.[+mIdx[2]]) style += P[mIdx[1]][+mIdx[2]];
    });
    return Math.round((d.price*0.5 + up*0.6 + style*0.25)/10)*10;
  }

  async function renderGarageBody(){
    const el = document.getElementById("gBody");
    const cs = save.cars[save.current];
    const def = CAR_DEFS[save.current];
    el.innerHTML = "";

    if (gTab === "cars"){
      // Nächstes freischaltbares Auto + XP-Fortschritt — sofort sichtbar
      const nextK = CAR_KEYS.filter(k=>!CAR_DEFS[k].vault && CAR_DEFS[k].unlock > save.level && !save.cars[k].owned)
        .sort((a,b)=>CAR_DEFS[a].unlock-CAR_DEFS[b].unlock)[0];
      if (nextK){
        const nd = CAR_DEFS[nextK], need = xpNeed(save.level);
        const lvlDiff = nd.unlock - save.level;
        const banner = div("card", `<h3>Nächstes Auto</h3>
          <div class="row" style="border:0;padding:4px 0">
            <img class="carthumb dim" alt="">
            <div class="nm"><b>${nd.name}</b><span>${nd.desc}</span>
            <span style="color:#6EA8FF;font-weight:800">Ab Level ${nd.unlock} — ${lvlDiff===1?"nur noch 1 Level!":"noch "+lvlDiff+" Level"}</span></div>
          </div>
          <div class="xpbar"><span>LV ${save.level}</span><i><b style="width:${Math.round(100*save.xp/need)}%"></b></i><span>${save.xp}/${need} XP</span></div>`);
        carImage(nextK, defaultCarState(nextK).style).then(img=>{
          const im = banner.querySelector("img"); if (im) im.src = img.src;
        });
        el.appendChild(banner);
      }
      const nCars = CAR_KEYS.filter(k => !CAR_DEFS[k].vault || save.cars[k].owned).length;
      const wrap = div("card",`<h3>Fuhrpark — ${nCars} Autos der Szene</h3>`);
      for (const k of CAR_KEYS){
        const d = CAR_DEFS[k], c = save.cars[k];
        if (d.vault && !c.owned) continue;      // Vault-Legenden erscheinen erst nach Kauf
        const lockLvl = d.unlock > save.level;
        const pc = perfClass(k, c.owned ? c : defaultCarState(k));
        // Verkaufen: nie Starter/Vault, nie das aktive Auto (Hauptauto-Regel)
        const sellable = c.owned && !d.starter && !d.vault && save.current !== k && d.price > 0;
        const row = div("row" + (lockLvl && !c.owned ? " lock" : ""), `
          <img class="carthumb${lockLvl && !c.owned ? " dim" : ""}" alt="">
          <div class="nm"><b>${classBadge(pc.cls)} ${d.name} ${save.current===k?'<span style="color:var(--red)">◀</span>':""}</b>
          <span style="font-weight:800;color:var(--txt);font-variant-numeric:tabular-nums">${carPS(d)}&nbsp;PS · ${d.mass}&nbsp;kg · ${sp(d)}&nbsp;kg/PS</span>
          <span>${d.desc}</span>
          <span style="font-size:11px"><em style="color:var(--grn);font-style:normal">+${d.pros}</em> · <em style="color:var(--mut);font-style:normal">−${d.cons}</em></span>
          ${(d.zone??530)<=460?`<span style="font-size:11px;color:#FFC61A;font-weight:800">⚡ Enge Schaltzone — Perfect +${(3700/(d.zone??530)).toFixed(1)}%</span>`:""}</div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
            <button class="buy ${c.owned?"owned":(lockLvl?"":(save.money>=d.price?"can":""))}">
              ${c.owned ? (save.current===k?"AKTIV":"WÄHLEN")
                : lockLvl ? "🔒 LV "+d.unlock
                : (d.price ? "$"+d.price.toLocaleString("de-CH") : "GRATIS")}
            </button>
            ${sellable ? `<button class="buy selbtn" style="font-size:11px;padding:8px 10px;color:var(--red2)">Verkaufen $${sellValue(k).toLocaleString("de-CH")}</button>` : ""}
            ${(!c.owned && !d.starter && Shop.price("redline_car_"+k)) ? `<button class="buy iapbtn" style="font-size:11px;padding:8px 10px;color:#FFC61A;border-color:rgba(255,198,26,.45)">Sofort · ${Shop.price("redline_car_"+k)}</button>` : ""}
          </div>`);
        carImage(k, c.owned ? c.style : defaultCarState(k).style).then(img=>{
          const im = row.querySelector("img.carthumb"); if (im) im.src = img.src;
        });
        row.querySelector("button").addEventListener("click", ()=>{
          if (c.owned){ save.current = k; persist(); renderGarage(); renderMenu(); }
          else if (!lockLvl && save.money >= d.price){
            save.money -= d.price; c.owned = true; save.current = k; persist();
            AudioSys.winJingle(); renderGarage(); updateCash();
          }
        });
        const ib = row.querySelector(".iapbtn");
        if (ib) ib.addEventListener("click", ()=> Shop.buyCar(k));
        const sb = row.querySelector(".selbtn");
        if (sb) sb.addEventListener("click", ()=>{
          const v = sellValue(k);
          if (!confirm(`${d.name} für $${v.toLocaleString("de-CH")} verkaufen?\nAuto + gekauftes Tuning/Style gehen verloren.`)) return;
          save.money += v;
          save.cars[k] = defaultCarState(k);      // Upgrades/Style/Besitz weg
          persist(); updateCash(); AudioSys.winJingle();
          toast(`${d.name} verkauft ✓ +$${v.toLocaleString("de-CH")}`);
          renderGarageBody();
        });
        wrap.appendChild(row);
      }
      el.appendChild(wrap);
    }

    if (gTab === "up"){
      const clsNow = perfClass(save.current, cs);
      const card = div("card",`<h3>Performance — Klasse ${classBadge(clsNow.cls)} · ≈ ${clsNow.et.toFixed(2)}s</h3>`);
      const specNow = buildSpec(save.current, cs);
      // Konkrete Steigerung der NÄCHSTEN Stufe: vorher → nachher (+ Klassen-Sprung)
      const gain = u => {
        const cs2 = { ...cs, up: { ...cs.up, [u.k]: cs.up[u.k] + 1 } };
        const s2 = buildSpec(save.current, cs2);
        const c2 = perfClass(save.current, cs2);
        const clsUp = c2.cls !== clsNow.cls ? ` · ${classBadge(clsNow.cls)}→${classBadge(c2.cls)}` : "";
        const dEt = clsNow.et - c2.et;
        const tSave = dEt > 0.005 ? ` · <strong>−${dEt.toFixed(2)}s</strong>` : "";
        if (u.k === "engine" || u.k === "turbo"){
          const a = carPS(def, specNow.powerMul), b = carPS(def, s2.powerMul);
          return `${a} → <strong>${b} PS</strong>${tSave}${clsUp}`;
        }
        if (u.k === "weight") return `${specNow.mass} → <strong>${s2.mass} kg</strong>${tSave}${clsUp}`;
        if (u.k === "trans")  return `Schaltzeit ${specNow.shiftTime.toFixed(2)} → <strong>${s2.shiftTime.toFixed(2)}s</strong>${tSave}${clsUp}`;
        if (u.k === "tires")  return `Traktion +${Math.round((s2.mu/specNow.mu-1)*100)}%${tSave}${clsUp}`;
        if (u.k === "nos")    return `${specNow.nosMax.toFixed(1)} → <strong>${s2.nosMax.toFixed(1)}s NOS</strong>${tSave}${clsUp}`;
        return "";
      };
      UPGRADES.forEach(u=>{
        const lv = cs.up[u.k];
        const next = lv < u.max ? upgCost(u, lv, save.current) : null;
        const row = div("row", `
          <div class="nm"><b>${u.n}</b><span>${u.d}</span>
          ${next!=null?`<span style="color:var(--grn);font-weight:700;font-size:12px;font-variant-numeric:tabular-nums">${gain(u)}</span>`:""}</div>
          <div class="lvl">${Array.from({length:u.max},(_,i)=>`<i class="${i<lv?"on":""}"></i>`).join("")}</div>
          <button class="buy ${next==null?"owned":(save.money>=next?"can":"")}">
            ${next==null?"MAX":"$"+next.toLocaleString("de-CH")}
          </button>`);
        if (next!=null) row.querySelector("button").addEventListener("click", ()=>{
          if (save.money < next) return;
          save.money -= next; cs.up[u.k]++; persist();
          AudioSys.beep(760,.12,.3);
          renderGarageBody(); updateCash();
        });
        card.appendChild(row);
      });
      el.appendChild(card);
      const spec = buildSpec(save.current, cs);
      const peak = Math.round(Math.max(...def.torque.map(t=>t[1])) * spec.powerMul);
      el.appendChild(div("card", `<h3>Datenblatt</h3><div class="resgrid">
        <div><b style="color:${CLASS_COL[clsNow.cls]}">Klasse ${clsNow.cls}</b><span>≈ ${clsNow.et.toFixed(2)}s ¼-Meile</span></div>
        <div><b>${carPS(def, spec.powerMul)} PS</b><span>Leistung</span></div>
        <div><b>${(spec.mass/carPS(def, spec.powerMul)).toFixed(1)} kg/PS</b><span>Leistungsgewicht</span></div>
        <div><b>${peak} Nm</b><span>Drehmoment</span></div>
        <div><b>${spec.mass} kg</b><span>Gewicht</span></div>
        <div><b>${def.redline} rpm</b><span>Redline</span></div>
        <div><b>${cs.bestEt?cs.bestEt.toFixed(3)+"s":"—"}</b><span>Bestzeit ¼</span></div>
        <div><b>${def.zone??530} rpm</b><span>Grüne Schaltzone</span></div>
        <div><b>+${(3700/(def.zone??530)).toFixed(1)}%</b><span>Perfect-Boost</span></div>
      </div>
      <p class="mut" style="font-size:11.5px;padding-top:8px">≈ Zeit = erwartete ¼-Meile, sauber gefahren — dieselbe Zahl wie bei deinen Rivalen in der Karriere. Enge Schaltzone = schwerer zu treffen, aber stärkerer Boost.</p>`));
    }

    if (gTab === "tune"){
      const base = perfClass(save.current, { ...cs, tune: defaultTune(def) }).et;
      const card = div("card", `<h3>Getriebe-Setup</h3>
        <p class="mut" style="font-size:12px;margin-bottom:6px">Kürzer = mehr Punch, weniger Endspeed. Länger = Top-End.</p>
        <p id="tuneEt" style="font-size:13px;font-weight:800;margin-bottom:4px"></p>`);
      const showEt = () => {
        const now = perfClass(save.current, cs).et, d = now - base;
        const el2 = card.querySelector("#tuneEt"); if (!el2) return;
        el2.innerHTML = `Dein Setup: ≈ ${now.toFixed(2)}s <span style="color:${d < -0.005 ? "var(--grn)" : d > 0.005 ? "var(--red2)" : "var(--mut)"}">(${d <= 0 ? "−" : "+"}${Math.abs(d).toFixed(2)}s ggü. Werk)</span>`;
      };
      let etT = 0;
      const tuned = () => { persist(); clearTimeout(etT); etT = setTimeout(()=>{ showEt(); refreshPreview(); }, 120); };
      cs.tune.gears.forEach((gv,i)=>{
        card.appendChild(slider(`${i+1}. Gang`, gv, 0.6, 4.2, 0.01, v=>{ cs.tune.gears[i]=v; tuned(); }));
      });
      card.appendChild(slider("Final Drive", cs.tune.final, 2.6, 5.2, 0.01, v=>{ cs.tune.final=v; tuned(); }));
      setTimeout(showEt, 0);
      el.appendChild(card);
      const c2 = div("card","<h3>Launch</h3>");
      c2.appendChild(slider("Launch-RPM", cs.tune.launchRpm, def.idle+500, def.redline, 50,
        v=>{ cs.tune.launchRpm = Math.round(v); persist(); }, v=>Math.round(v)));
      c2.appendChild(div("", `<p class="mut" style="font-size:12px;padding:4px 0">Zu hoch = Wheelspin. Zu tief = lahm. Slicks vertragen mehr.</p>`));
      el.appendChild(c2);
      const r = div("card",""); const rb = document.createElement("button");
      rb.className="buy"; rb.style.width="100%"; rb.textContent="Setup zurücksetzen";
      rb.addEventListener("click", ()=>{
        cs.tune = defaultTune(def);
        persist(); renderGarageBody(); refreshPreview();
      });
      r.appendChild(rb); el.appendChild(r);
    }

    if (gTab === "style"){
      const st = cs.style;
      cs.styleOwned ??= {};
      // Preise skalieren mit dem Auto-Wert — zentrale Tabelle (auch Verkaufswert)
      const PRICES = stylePriceTable(save.current);
      const fmt$ = p => "$" + p.toLocaleString("de-CH");
      const buyIt = (key, price, label, apply) => {
        if (save.money < price) return toast(`Zu wenig Cash — ${fmt$(price)} nötig. Fahr Rennen!`);
        save.money -= price; cs.styleOwned[key] = true;
        apply(); persist(); updateCash(); AudioSys.winJingle?.();
        renderGarageBody(); refreshPreview().then(celebrate);
        toast(`${label} montiert ✓ −${fmt$(price)}`);
      };
      // Kauf-Leiste nur, wenn gerade etwas AUSPROBIERT wird (vorher stand sie immer da)
      const probeBar = (html, price, btn, onBuy, onCancel) => {
        const bar = div("buybar", `<span>${html}</span>`);
        const b = document.createElement("button");
        b.className = "buy" + (save.money >= price ? " can" : ""); b.textContent = `${btn} ${fmt$(price)}`;
        b.addEventListener("click", onBuy);
        const no = document.createElement("button"); no.className = "dismiss"; no.textContent = "✕";
        no.addEventListener("click", onCancel);
        bar.appendChild(b); bar.appendChild(no);
        return bar;
      };
      const swatchRow = (list, cur, onPick, neon) => {
        const row = div("swatches", "");
        list.forEach(([h, name]) => {
          const b = document.createElement("button");
          const col = h == null ? "" : `hsl(${h} ${neon ? "100% 60%" : "75% 46%"})`;
          b.className = "sw" + (neon && h != null ? " neon" : "") + (h == null ? " off" : "") + (h === cur ? " sel" : "");
          if (h == null) b.textContent = "AUS";
          else { b.style.background = col; b.style.setProperty("--swc", col); }
          b.setAttribute("aria-label", name);
          b.addEventListener("click", () => onPick(h, name));
          row.appendChild(b);
        });
        return row;
      };
      const PAINTS = [[355,"Rosso"],[22,"Orange"],[48,"Gelb"],[88,"Lime"],[135,"Grün"],[175,"Türkis"],[205,"Blau"],[232,"Royal"],[272,"Violett"],[318,"Pink"]];
      const hueName = h => (PAINTS.reduce((a, p) => Math.abs(((p[0]-h+540)%360)-180) < Math.abs(((a[0]-h+540)%360)-180) ? p : a))[1];

      // ── Lackierung: Farbfelder (+ Feinabstimmung). Einmal kaufen = jede Farbe gratis ──
      const card = div("card","<h3>Lackierung</h3>");
      const paintNow = stylePreview.hue ?? st.hue;
      const setPaint = h => {
        if (cs.styleOwned.paint){ st.hue = h; delete stylePreview.hue; persist(); }
        else if (h === st.hue) delete stylePreview.hue;
        else stylePreview.hue = h;
        renderGarageBody(); refreshPreview();
      };
      if (cs.styleOwned.paint) card.appendChild(div("stylehint", "✓ Lackierpistole — jede Farbe gratis, so oft du willst"));
      card.appendChild(swatchRow(PAINTS, paintNow, h => setPaint(h)));
      card.appendChild(slider("Feinabstimmung", paintNow, 0, 360, 1, v=>{
        if (cs.styleOwned.paint){ st.hue = v; persist(); } else stylePreview.hue = v;
        refreshPreview();
      }, ()=> "●", true));
      if (!cs.styleOwned.paint && stylePreview.hue != null){
        card.appendChild(probeBar(`Neue Farbe <b style="color:hsl(${stylePreview.hue} 80% 62%)">${hueName(stylePreview.hue)}</b> — einmal zahlen, danach <b>jede Farbe gratis</b>`,
          PRICES.paint, "Lackieren", ()=> buyIt("paint", PRICES.paint, "Lackierung",
            ()=>{ st.hue = stylePreview.hue; delete stylePreview.hue; }),
          ()=>{ delete stylePreview.hue; renderGarageBody(); refreshPreview(); }));
      } else if (!cs.styleOwned.paint){
        card.appendChild(div("stylehint", `<span style="color:var(--mut);font-weight:600">Tipp auf eine Farbe — dein Auto zeigt sie sofort. Kostet erst beim Lackieren.</span>`));
      }
      el.appendChild(card);

      // ── Fahrwerk ──
      const sc = div("card","<h3>Fahrwerk</h3>");
      if (cs.styleOwned.stance) sc.appendChild(div("stylehint", "✓ Gewindefahrwerk — Höhe frei einstellbar"));
      sc.appendChild(slider("Tieferlegung", stylePreview.drop ?? st.drop, 0, 22, 1, v=>{
        if (cs.styleOwned.stance){ st.drop = v; persist(); refreshPreview(); return; }
        const was = stylePreview.drop != null;
        stylePreview.drop = v; refreshPreview();
        if (!was) renderGarageBody();                   // Kauf-Leiste einblenden
      }, v=>v+" mm"));
      if (!cs.styleOwned.stance && stylePreview.drop != null){
        sc.appendChild(probeBar(`Gewindefahrwerk — Höhe danach <b>frei einstellbar</b>`, PRICES.stance, "Einbauen",
          ()=> buyIt("stance", PRICES.stance, "Gewindefahrwerk", ()=>{ st.drop = stylePreview.drop; delete stylePreview.drop; }),
          ()=>{ delete stylePreview.drop; renderGarageBody(); refreshPreview(); }));
      }
      el.appendChild(sc);
      el.appendChild(segCard("Felgen", ["Sport","Mesh Gold","Turbofan","Racing Weiss"], st.rim,
        v=>{ st.rim=v; persist(); refreshPreview(); }, [0,0,0,5], PRICES.rim, "rim"));
      el.appendChild(segCard("Auspuffanlage", ["Serie","Duplex","Big Bore","Race Sidepipe"], st.exhaust,
        v=>{ st.exhaust=v; persist(); refreshPreview(); }, [0,0,0,8], PRICES.exhaust, "exhaust"));
      if (window.CAR_SPRITES?.[save.current]?.wing){
        el.appendChild(div("card", `<h3>Spoiler</h3>
          <p class="mut" style="font-size:12.5px">Dieses Auto hat einen fest verbauten <b style="color:var(--txt)">Werksflügel</b> — ein Kit-Spoiler entfällt.</p>`));
      } else {
        el.appendChild(segCard("Spoiler", ["Ohne","Lip","GT-Wing"], st.spoiler,
          v=>{ st.spoiler=v; persist(); refreshPreview(); }, null, PRICES.spoiler, "spoiler"));
      }
      el.appendChild(segCard("Bodykit", ["Ohne","Street","Widebody"], st.kit ?? 0,
        v=>{ st.kit=v; persist(); refreshPreview(); }, [0,10,16], PRICES.kit, "kit"));
      // ── Neon: eigene Farbe, Kit enthält alle Farben ──
      const NEONS = [[null,"Aus"],[0,"Rot"],[28,"Orange"],[55,"Gelb"],[120,"Grün"],[180,"Cyan"],[210,"Blau"],[270,"Violett"],[305,"Magenta"]];
      const nc = div("card","<h3>Neon-Unterboden</h3>");
      const neonLock = save.level < 6;
      const nOn = stylePreview.neon ?? st.neon ?? 0;
      const nHue = stylePreview.neonHue ?? st.neonHue ?? st.hue;
      if (neonLock){
        nc.appendChild(div("stylehint", `<span style="color:var(--mut)">🔒 Ab Level 6</span>`));
      } else {
        if (cs.styleOwned.neon1) nc.appendChild(div("stylehint", "✓ Neon-Kit — alle Farben inklusive"));
        nc.appendChild(swatchRow(NEONS, nOn ? nHue : null, h => {
          const on = h == null ? 0 : 1;
          if (cs.styleOwned.neon1){
            st.neon = on; if (on) st.neonHue = h;
            delete stylePreview.neon; delete stylePreview.neonHue; persist();
          } else if (!on){ delete stylePreview.neon; delete stylePreview.neonHue; }
          else { stylePreview.neon = 1; stylePreview.neonHue = h; }
          renderGarageBody(); refreshPreview();
        }, true));
        if (!cs.styleOwned.neon1 && stylePreview.neon){
          nc.appendChild(probeBar(`Neon <b style="color:hsl(${stylePreview.neonHue} 100% 62%)">${NEONS.find(n => n[0] === stylePreview.neonHue)?.[1] ?? ""}</b> — Kit mit <b>allen Farben</b>`,
            PRICES.neon[1], "Einbauen", ()=> buyIt("neon1", PRICES.neon[1], "Neon-Kit",
              ()=>{ st.neon = 1; st.neonHue = stylePreview.neonHue; delete stylePreview.neon; delete stylePreview.neonHue; }),
            ()=>{ delete stylePreview.neon; delete stylePreview.neonHue; renderGarageBody(); refreshPreview(); }));
        } else if (!cs.styleOwned.neon1){
          nc.appendChild(div("stylehint", `<span style="color:var(--mut);font-weight:600">Tipp auf eine Farbe zum Ausprobieren.</span>`));
        }
      }
      el.appendChild(nc);
    }
  }

  function div(cls, html){ const d=document.createElement("div"); d.className=cls; d.innerHTML=html; return d; }
  function slider(label, val, min, max, step, on, fmt, hueBg){
    const d = div("sld", `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><output></output>`);
    const inp = d.querySelector("input"), out = d.querySelector("output");
    const showv = v => out.textContent = fmt ? fmt(v) : (+v).toFixed(2);
    if (hueBg){
      inp.style.background = "linear-gradient(90deg,hsl(0 70% 50%),hsl(60 70% 50%),hsl(120 70% 50%),hsl(180 70% 50%),hsl(240 70% 50%),hsl(300 70% 50%),hsl(360 70% 50%))";
      out.style.color = `hsl(${val} 80% 60%)`;
    }
    showv(val);
    inp.addEventListener("input", ()=>{ const v=+inp.value; showv(v); if (hueBg) out.style.color=`hsl(${v} 80% 60%)`; on(v); });
    return d;
  }
  // Options-Karte mit VORSCHAU-VOR-KAUF: ungekaufte Option anklicken = nur
  // Vorschau am Auto (grün umrandet) + Kauf-Leiste. Kauf = expliziter Knopf.
  function segCard(title, opts, val, on, locks, prices, pkey){
    const cs = save.cars[save.current];
    cs.styleOwned ??= {};
    const owned = i => !prices || !prices[i] || cs.styleOwned[pkey + i];
    const c = div("card",`<h3>${title}</h3>`);
    const s = div("seg", opts.map((o,i)=>{
      const lock = locks && locks[i] && save.level < locks[i];
      const tag = lock ? `🔒 LV ${locks[i]}`
        : (!owned(i) ? `${o}<br><b style="color:var(--grn)">$${prices[i].toLocaleString("de-CH")}</b>` : o);
      return `<button class="${i===val?"on":""}${lock?" lockopt":""}">${tag}</button>`;
    }).join(""));
    c.appendChild(s);
    const bar = div("buybar",""); bar.style.display = "none";
    c.appendChild(bar);
    const mark = sel => s.querySelectorAll("button").forEach((x,j)=>{
      x.classList.toggle("on", j===sel && owned(sel));
      x.classList.toggle("prev", j===sel && !owned(sel));
    });
    const syncBar = () => {
      const i = stylePreview[pkey];
      if (i == null || owned(i)){ bar.style.display = "none"; bar.innerHTML = ""; return; }
      bar.style.display = "";
      bar.innerHTML = `<span>Vorschau: <b style="color:var(--txt)">${opts[i]}</b> — nur du siehst das gerade</span>`;
      const buy = document.createElement("button");
      buy.className = "buy" + (save.money >= prices[i] ? " can" : "");
      buy.textContent = `Kaufen $${prices[i].toLocaleString("de-CH")}`;
      buy.addEventListener("click", ()=>{
        const p = prices[i];
        if (save.money < p) return toast(`Zu wenig Cash — $${p.toLocaleString("de-CH")} nötig. Fahr Rennen!`);
        save.money -= p; cs.styleOwned[pkey + i] = true;
        delete stylePreview[pkey];
        updateCash(); AudioSys.winJingle?.();
        toast(`${opts[i]} montiert ✓ −$${p.toLocaleString("de-CH")}`);
        on(i);                                       // montiert + persistiert
        renderGarageBody(); setTimeout(celebrate, 120);
      });
      const no = document.createElement("button");
      no.className = "dismiss"; no.textContent = "✕";
      no.addEventListener("click", ()=>{
        delete stylePreview[pkey];
        mark(val); syncBar(); refreshPreview();
      });
      bar.appendChild(buy); bar.appendChild(no);
    };
    s.querySelectorAll("button").forEach((b,i)=>b.addEventListener("click", ()=>{
      if (locks && locks[i] && save.level < locks[i]){
        toast(`Ab Level ${locks[i]} — fahr Rennen!`); return;
      }
      if (pkey === "exhaust"){ AudioSys.unlock(); AudioSys.shiftPop(Math.min(i,3)); }
      if (owned(i)){                       // gekauft → direkt montieren
        delete stylePreview[pkey];
        mark(i); syncBar(); on(i);
      } else {                             // ungekauft → NUR Vorschau
        stylePreview[pkey] = i;
        mark(i); syncBar(); refreshPreview();
      }
    }));
    // Offene Vorschau (z.B. nach Re-Render) wiederherstellen
    if (stylePreview[pkey] != null){ mark(stylePreview[pkey]); syncBar(); }
    return c;
  }

  // ── VS-Freund: Auto als Link teilen / Challenge annehmen ──
  function encodeVS(){
    const cs = save.cars[save.current];
    const data = { n: save.name, c: save.current, u: cs.up, t: cs.tune, s: cs.style };
    return btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  function decodeVS(code){
    try {
      const s = code.replace(/-/g,"+").replace(/_/g,"/");
      const d = JSON.parse(decodeURIComponent(escape(atob(s))));
      if (d?.c && CAR_DEFS[d.c]) return d;
    } catch {}
    return null;
  }
  async function shareVS(){
    const url = location.origin + location.pathname + "?vs=" + encodeVS();
    const txt = `REDLINE ⚡ Schlag mein ${CAR_DEFS[save.current].name} auf der Viertelmeile!`;
    if (navigator.share){ try { await navigator.share({ title:"REDLINE VS", text:txt, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); toast("VS-Link kopiert — verschick ihn!"); }
    catch { prompt("VS-Link kopieren:", url); }
  }
  async function checkVSLink(){
    const code = new URLSearchParams(location.search).get("vs");
    if (!code) return false;
    const d = decodeVS(code);
    if (!d) return false;
    const el = document.getElementById("vsInfo");
    const img = await carImage(d.c, d.s, true);
    el.innerHTML = `<img src="${img.src}" style="width:min(320px,74vw)"><b style="font-size:22px;font-style:italic">${(d.n||"EIN RIVALE").slice(0,14)}</b>
      <span class="mut">fordert dich heraus — mit einem getunten<br><b style="color:var(--txt)">${CAR_DEFS[d.c].name}</b></span>`;
    document.getElementById("vsAccept").onclick = ()=>{
      const opp = { name:(d.n||"RIVALE").slice(0,14), emoji:"🏁", car:d.c, power:1.0,
        reaction:[0.22,0.34], slack:320, prize:800, up:d.u, tune:d.t, style:d.s, vsGhost:true };
      startRace(opp, save.tier);
    };
    history.replaceState(null,"",location.pathname);
    show("vschall");
    return true;
  }

  // ── Rennen ──
  let lastRace = null;
  function startCareer(tier){
    tier = Math.min(tier, save.tier);
    startRace({ ...rivalFor(tier), mode:"career" }, tier);
  }
  // Freies Rennen: Rivale aus der aktuellen (oder vorherigen) Liga, ⅓ Preisgeld,
  // manchmal ½ Meile. Zählt nicht für die Karriere.
  function startQuick(){
    const t = Math.max(0, save.tier - Math.floor(Math.random()*4));
    const o = rivalFor(t);
    startRace({ ...o, mode:"quick", prize: Math.max(150, Math.round(o.prize*0.35/10)*10),
                half: Math.random() < 0.3 }, t);
  }
  function startRace(opp, tier){
    if (!save.current) return show("starter");
    lastRace = { opp, tier };
    SCREENS.forEach(s=>{ const el=document.getElementById(s); if (el) el.classList.remove("on"); });
    hideLevelUp();
    document.getElementById("hud").classList.add("on");
    document.getElementById("hud").classList.remove("duo");
    const myEt = carSimET(save.current, save.cars[save.current]);
    const oEt = opp.vsGhost ? carSimET(opp.car, { up: opp.up, tune: opp.tune }) : (opp.mode === "career" ? rivalEt(opp) : opp.et);
    document.getElementById("hudVs").innerHTML = `${opp.mode === "career" ? leagueLabel(opp) + " · " : ""}VS ${opp.name}`
      + `<small>Du ≈ ${myEt.toFixed(2)}s · ${opp.name} ≈ ${oEt.toFixed(2)}s</small>`;
    Race.start({ carKey: save.current, carState: save.cars[save.current], opp,
      nerves: opp.mode === "career" ? (save.losses?.[tier] || 0) : 0,
      onEvent: raceEvent,
      onDone: res => showResults(res, opp, tier) });
  }
  function raceEvent(ev){
    if (ev.launch) syncKnob();
    if (ev.shift){
      syncKnob();
      if (ev.shift === "PERFECT"){ pShift.classList.add("flash"); setTimeout(()=>pShift.classList.remove("flash"), 300); }
      window.NativeBridge?.haptic?.(ev.shift === "PERFECT" ? "medium" : "light");
    }
  }

  // Günstigstes Upgrade mit spürbarem Zeitgewinn (für den Tipp nach einer Niederlage)
  function bestTip(){
    const k = save.current, cs = save.cars[k];
    const now = carSimET(k, cs); let best = null;
    for (const u of UPGRADES){
      const lv = cs.up[u.k]; if (lv >= u.max) continue;
      const cost = upgCost(u, lv, k);
      const et = carSimET(k, { ...cs, up: { ...cs.up, [u.k]: lv+1 } });
      const gain = now - et; if (gain < 0.02) continue;
      const sc = gain / cost * (cost <= save.money ? 3 : 1);   // bezahlbare bevorzugen
      if (!best || sc > best.sc) best = { u, lv, cost, et, gain, sc, now };
    }
    return best;
  }
  function driveTip(res){
    if (res.et === Infinity) return "Gas halten, sobald die Ampel GRÜN wird — dann zählt's.";
    if (!res.launchQ && res.rt != null && res.rt > 0.3) return "Start: Gas exakt bei GRÜN geben — schnelle Reaktion = Boost.";
    if (!res.launchQ) return "Start: Nadel vor Grün in der GRÜNEN ZONE halten = PERFECT LAUNCH.";
    if ((res.perfects || 0) < 2) return "Schalten, wenn die Nadel im grünen Bogen steht = PERFECT +Boost.";
    return "NOS nach dem Start drücken und halten — volle Flasche bringt am meisten.";
  }

  // ── Resultat: eine klare Haupt-Aktion, Belohnung mit Count-Up ──
  function setResButtons(primary, secondary){
    const box = document.getElementById("resBtns");
    box.innerHTML = "";
    const mk = (b, cls) => { const x = document.createElement("button"); x.className = "mbtn " + cls; x.textContent = b.label; x.onclick = b.go; return x; };
    box.appendChild(mk(primary, "primary resmain"));
    const row = document.createElement("div"); row.className = "resrow";
    secondary.forEach(b => row.appendChild(mk(b, "")));
    box.appendChild(row);
  }
  function showResults(res, opp, tier){
    document.getElementById("hud").classList.remove("on");
    const cs = save.cars[save.current];
    save.losses ??= {};
    const career = opp.mode === "career";
    const rematch = career && tier < save.tier;
    let { cash, xp } = raceReward({ win: res.win, opp, rematch, perfects: res.perfects });
    if (opp.vsGhost){ cash = 0; xp = res.win ? 35 : 12; }
    if (!res.win && res.et === Infinity){ cash = 0; xp = 5; }      // nicht im Ziel: kein Startgeld (kein AFK-Farmen)
    const wasTier = save.tier;
    if (career && res.win && tier === save.tier){ save.tier++; delete save.losses[tier]; }
    if (career && !res.win && tier === save.tier) save.losses[tier] = (save.losses[tier] || 0) + 1;
    save.money += cash;
    if (res.et !== Infinity && (cs.bestEt==null || res.et < cs.bestEt)) cs.bestEt = res.et;
    const lu = addXp(xp);
    persist();

    const bossDown = career && res.win && opp.boss && wasTier === tier;
    document.getElementById("resTitle").textContent = res.win ? (bossDown ? "BOSS BESIEGT!" : "SIEG!") : "VERLOREN";
    document.getElementById("resTitle").className = "big " + (res.win?"win":"lose");
    document.getElementById("resSub").textContent = (career ? leagueLabel(opp) + " · " : opp.mode === "quick" ? "Freies Rennen · " : "")
      + `VS ${opp.name}` + (res.win ? (rematch ? " · Rematch ⅓" : "") : "");
    document.getElementById("resGrid").innerHTML = `
      <div><b id="cEt">0.000s</b><span>Deine Zeit</span></div>
      <div><b>${res.oppEt==null?"—":res.oppEt.toFixed(3)+"s"}</b><span>${opp.name}</span></div>
      <div><b>${Math.round(res.trap)} km/h</b><span>Trap Speed</span></div>
      <div><b>${res.rt==null?"—":res.rt.toFixed(3)+"s"}</b><span>Reaktion</span></div>
      <div><b id="cCash" style="color:var(--grn)">$0</b><span>${res.win ? "Preisgeld" : "Startgeld"}</span></div>
      <div><b id="cXp" style="color:#6EA8FF">+0 XP</b><span>Erfahrung</span></div>`;
    document.getElementById("resXp").innerHTML = `<span>LV ${save.level}</span><i><b id="xpFill" style="width:0%"></b></i><span>${save.xp}/${xpNeed(save.level)}</span>`;

    // Tipp nach Niederlage: konkretes Upgrade (direkt kaufbar) + Fahr-Tipp
    const tipEl = document.getElementById("resTip");
    tipEl.innerHTML = ""; tipEl.style.display = "none";
    if (!res.win && !opp.vsGhost){
      const t = bestTip();
      const rEt = career ? rivalEt(opp) : opp.et;
      let html = `<p class="dt">💡 ${driveTip(res)}</p>`;
      if (t){
        const beats = t.et < rEt;
        html += `<div class="tiprow"><div class="nm"><b>${t.u.n}${t.u.max > 1 ? " Stufe " + (t.lv+1) : ""}</b>
          <span>≈ ${t.now.toFixed(2)} → <b style="color:var(--grn)">${t.et.toFixed(2)}s</b>${beats ? " · schneller als " + opp.name : ""}</span></div>
          <button class="buy ${save.money >= t.cost ? "can" : ""}" id="tipBuy">${save.money >= t.cost ? "Kaufen $" + t.cost.toLocaleString("de-CH") : "Noch $" + (t.cost - save.money).toLocaleString("de-CH")}</button></div>`;
      }
      tipEl.innerHTML = html; tipEl.style.display = "";
      const tb = document.getElementById("tipBuy");
      if (tb && t) tb.onclick = () => {
        if (save.money < t.cost){ toast("Noch nicht genug Cash — ein Rennen mehr!"); return; }
        save.money -= t.cost; cs.up[t.u.k]++; persist(); updateCash();
        AudioSys.beep(760,.12,.3);
        tb.textContent = "Eingebaut ✓"; tb.classList.remove("can"); tb.classList.add("owned"); tb.onclick = null;
        toast(`${t.u.n} eingebaut — jetzt ≈ ${carSimET(save.current, cs).toFixed(2)}s`);
      };
    }
    show("results");

    if (res.et === Infinity) document.getElementById("cEt").textContent = "—";
    else countUp("cEt", res.et, v=>v.toFixed(3)+"s", 900);
    countUp("cCash", cash, v=>"$"+Math.round(v).toLocaleString("de-CH"), 1100);
    countUp("cXp", xp, v=>"+"+Math.round(v)+" XP", 1100);
    setTimeout(()=>{ const f=document.getElementById("xpFill"); if (f) f.style.width = Math.round(100*save.xp/xpNeed(save.level))+"%"; }, 350);
    if (lu.leveled) setTimeout(()=>levelUp(lu.unlocked), 1300);

    const menuB = { label:"Menü", go:()=>show("menu") };
    const garB  = { label:"Garage", go:()=>{ gTab = "up"; markTab(); show("garage"); } };
    if (career && res.win){
      const nx = rivalFor(save.tier);
      setResButtons({ label: bossDown ? (nx.league >= LEAGUES.length ? "Endlos-Liga ▶" : `Liga ${nx.league+1} starten ▶`) : `Nächstes Rennen ▶ ${nx.name}`,
                      go:()=>startCareer(save.tier) }, [garB, menuB]);
    } else if (career){
      setResButtons({ label:"↺ Nochmal", go:()=>startCareer(tier) }, [garB, menuB]);
    } else if (opp.vsGhost){
      setResButtons({ label:"↺ Nochmal", go:()=>startRace(opp, tier) }, [garB, menuB]);
    } else {
      setResButtons({ label:"Neues Rennen ▶", go:()=>startQuick() },
                    [{ label:"Karriere", go:()=>show("career") }, garB]);
    }
  }
  function addXp(xp){
    save.xp += xp;
    const unlocked = []; let leveled = false;
    while (save.xp >= xpNeed(save.level)){
      save.xp -= xpNeed(save.level); save.level++; leveled = true;
      CAR_KEYS.forEach(k=>{ if (!CAR_DEFS[k].vault && CAR_DEFS[k].unlock === save.level) unlocked.push(CAR_DEFS[k].name); });
    }
    return { leveled, unlocked };
  }
  function countUp(id, end, fmt, dur){
    const el = document.getElementById(id); if (!el) return;
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1,(t-t0)/dur), v = end*(1-Math.pow(1-p,3));
      el.textContent = fmt(v);
      if (p<1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // Level-up: kurzer Toast OBEN (unter der Statusleiste), antippbar zum Schliessen,
  // blockiert nichts — verschwindet nach 2.6 s oder beim Screen-Wechsel.
  let luT = 0;
  function levelUp(unlocked){
    const el = document.getElementById("lvlup");
    document.getElementById("lvlupNum").textContent = save.level;
    document.getElementById("lvlupUnlocks").innerHTML = unlocked.length
      ? "Neu: " + unlocked.map(n=>`<b>${n}</b>`).join(", ")
      : "Weiter so — mehr Autos warten!";
    el.classList.add("on");
    AudioSys.winJingle();
    window.NativeBridge?.haptic?.("medium");
    clearTimeout(luT); luT = setTimeout(hideLevelUp, 2600);
  }
  function hideLevelUp(){ clearTimeout(luT); document.getElementById("lvlup")?.classList.remove("on"); }
  document.getElementById("lvlup").addEventListener("click", hideLevelUp);
  function toast(msg){
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove("on"), 2400);
  }
  function markTab(){ document.querySelectorAll("#gTabs button").forEach(x=>x.classList.toggle("on", x.dataset.t===gTab)); }

  document.getElementById("restartRace").addEventListener("click", ()=>{
    if (lastRace && !Duo.racing){ Race.stop(); startRace(lastRace.opp, lastRace.tier); }
  });
  document.getElementById("leaveRace").addEventListener("click", ()=>{
    if (Duo.racing) return Duo.abort();
    Race.stop(); show(lastRace?.opp?.mode === "career" ? "career" : "menu");
  });
  // Garage → direkt zum nächsten Karriere-Rennen
  document.getElementById("gRace").addEventListener("click", ()=>startCareer(save.tier));
  function renderGoBar(){
    const o = rivalFor(save.tier);
    document.getElementById("gRace").innerHTML = `▶ Zum Rennen <small>${leagueLabel(o)} · VS ${o.name}</small>`;
  }

  // ── Race-Inputs ──
  function bindHold(el, on, off){
    el.addEventListener("touchstart", e=>{ e.preventDefault(); on(); }, {passive:false});
    el.addEventListener("touchend", e=>{ e.preventDefault(); off(); });
    el.addEventListener("touchcancel", off);
    el.addEventListener("mousedown", e=>{ e.preventDefault(); on(); });
    window.addEventListener("mouseup", off);
  }
  const pGas = document.getElementById("pGas");
  bindHold(pGas, ()=>{ Race.input.gas=true; pGas.classList.add("hot"); AudioSys.unlock();
                       if (Race.active()) syncKnob(); },   // 1. Gang einlegen
                 ()=>{ Race.input.gas=false; pGas.classList.remove("hot"); });
  const pShift = document.getElementById("pShift");
  function syncKnob(){ pShift.dataset.gear = String(Math.min(6, Race.gear() + 1)); }
  function resetKnob(){ pShift.dataset.gear = "0"; }
  // Schalten wird im nächsten Physik-Tick ausgeführt; Knauf + PERFECT-Blitz kommen
  // als Ereignis zurück (raceEvent) — so bleibt der Lauf deterministisch (Duo).
  function uiShift(){ Race.shift(); }
  pShift.addEventListener("touchstart", e=>{ e.preventDefault(); uiShift(); }, {passive:false});
  pShift.addEventListener("mousedown", e=>{ e.preventDefault(); uiShift(); });
  const pNos = document.getElementById("pNos");
  bindHold(pNos, ()=>{ Race.nos(true); pNos.classList.add("hot"); },
                 ()=>{ Race.nos(false); pNos.classList.remove("hot"); });

  window.addEventListener("keydown", e=>{
    if (!Race.active()) return;
    if (e.repeat) return;
    if (e.code==="ArrowUp"||e.code==="Space"){ e.preventDefault(); Race.input.gas=true; pGas.classList.add("hot"); AudioSys.unlock(); }
    if (e.code==="ShiftLeft"||e.code==="ShiftRight"||e.code==="Enter"||e.code==="ArrowRight"){ e.preventDefault(); uiShift(); }
    if (e.code==="KeyN"||e.code==="ArrowDown"){ Race.nos(true); pNos.classList.add("hot"); }
    if (e.code==="Escape"){ if (Duo.racing) Duo.abort(); else { Race.stop(); show("menu"); } }
  });
  window.addEventListener("keyup", e=>{
    if (e.code==="ArrowUp"||e.code==="Space"){ Race.input.gas=false; pGas.classList.remove("hot"); }
    if (e.code==="KeyN"||e.code==="ArrowDown"){ Race.nos(false); pNos.classList.remove("hot"); }
  });

  // ── VAULT (Echtgeld-Exklusivautos) ──
  const VAULT_LINK = window.VAULT_LINK ?? "";
  async function renderVault(){
    const owned = !!save.cars.kuro?.owned;
    const def = CAR_DEFS.kuro;
    const img = await carImage("kuro", owned ? save.cars.kuro.style : { hue:0, drop:12, rim:2, exhaust:2, spoiler:0, kit:0 }, true);
    document.getElementById("vaultCar").src = img.src;
    document.getElementById("vaultStats").innerHTML = `
      <div><b>${carPS(def)} PS</b><span>Leistung</span></div>
      <div><b>${def.mass} kg</b><span>Gewicht</span></div>
      <div><b>${def.zone} rpm</b><span>Schaltzone (Rekord)</span></div>
      <div><b>+${(3700/def.zone).toFixed(1)}%</b><span>Perfect-Boost</span></div>`;
    const b = document.getElementById("vaultBuy");
    if (owned){
      b.textContent = "IN DEINER GARAGE ✓ — fahren";
      b.classList.add("owned");
      b.onclick = ()=>{ save.current = "kuro"; persist(); show("garage"); };
    } else if (Shop.native && !Shop.price("redline_vault_kuro")){
      // Store liefert (noch) kein Produkt: kein toter Kauf-Knopf
      b.textContent = "Bald im Vault erhältlich";
      b.classList.add("owned");
      b.onclick = null;
    } else if (Shop.native){
      b.textContent = "Kaufen — " + Shop.price("redline_vault_kuro");
      b.classList.remove("owned");
      b.onclick = ()=> Shop.buy("redline_vault_kuro");
    } else {
      b.textContent = "Kaufen — CHF 4.90";
      b.classList.remove("owned");
      b.onclick = ()=>{
        if (!window.Cloud?.user){ toast("Zuerst anmelden (Menü) — der Kauf hängt an deinem Konto"); return; }
        if (!VAULT_LINK){ toast("Shop öffnet in Kürze — Drop #001 kommt!"); return; }
        window.open(VAULT_LINK + "?client_reference_id=" + Cloud.user.id, "_blank");
        toast("Nach dem Kauf hier zurückkommen — schaltet automatisch frei");
        Cloud.pollVault?.();
      };
    }
  }
  // ── SHOP (Store-App: App-Store-Käufe über window.NativeBridge) ──
  const Shop = (()=>{
    const NB = window.NativeBridge;
    const native = !!(NB && NB.isNative);
    const prices = {};           // productId → "CHF 4.90"
    const CASH = { redline_cash_s: 25000, redline_cash_m: 90000, redline_cash_l: 250000 };
    async function load(){
      if (!native) return;
      try { for (const p of await NB.products()) prices[p.id] = p.price; } catch(e){ console.warn("shop products", e); }
      await syncOwned();
      renderShopBits();
      if (document.getElementById("vault").classList.contains("on")) renderVault();
    }
    function price(id){ return prices[id] || ""; }
    function grantCar(k){
      if (!CAR_DEFS[k]) return;
      if (!save.cars[k]) save.cars[k] = defaultCarState(k);
      if (save.cars[k].owned) return;
      save.cars[k].owned = true; save.cars[k].iap = true; persist();
    }
    async function syncOwned(){
      if (!native) return;
      let ids = [];
      try { ids = await NB.owned(); } catch(e){ return; }
      let got = 0;
      for (const id of ids){
        if (id === "redline_vault_kuro" && !save.cars.kuro?.owned){ grantCar("kuro"); got++; }
        const m = /^redline_car_(\w+)$/.exec(id);
        if (m && !save.cars[m[1]]?.owned){ grantCar(m[1]); got++; }
      }
      if (got){ toast(`🔑 ${got} Auto${got>1?"s":""} wiederhergestellt`); if (document.getElementById("garage").classList.contains("on")) renderGarage(); }
      return got;
    }
    async function buy(id){
      if (!native){ toast("Kauf nur in der App-Version"); return; }
      NB.haptic?.("light");
      const r = await NB.purchase(id);
      if (!r.ok){ if (!r.cancelled) toast(r.error || "Kauf fehlgeschlagen"); return; }
      NB.haptic?.("heavy");
      if (CASH[id]){ save.money += CASH[id]; persist(); updateCash(); AudioSys.winJingle(); toast(`💵 +$${CASH[id].toLocaleString("de-CH")} gutgeschrieben`); return; }
      if (id === "redline_vault_kuro"){ unlockVault("kuro"); AudioSys.winJingle(); toast("🔑 KURO ØNI ist für immer deins"); return; }
      const m = /^redline_car_(\w+)$/.exec(id);
      if (m){ grantCar(m[1]); save.current = m[1]; persist(); AudioSys.winJingle(); toast(`🏁 ${CAR_DEFS[m[1]].name} freigeschaltet — für immer deins`); renderGarage(); renderMenu(); }
    }
    async function buyCar(k){ return buy("redline_car_"+k); }
    async function restore(){
      if (!native) return;
      const r = await NB.restore();
      if (!r.ok){ toast(r.error || "Wiederherstellen fehlgeschlagen"); return; }
      const got = await syncOwned();
      if (!got) toast("Keine neuen Käufe gefunden");
    }
    function renderShopBits(){
      const box = document.getElementById("shopPacks"); if (!box) return;
      const mb = document.querySelector('.mbtn.vault small');
      const hasStore = native && Object.keys(prices).length > 0;
      if (mb && native) mb.textContent = hasStore ? "Exklusive Legenden · Cash-Pakete · Autos sofort freischalten" : "Exklusive Legenden der Szene";
      if (!hasStore){ box.style.display = "none"; return; }
      box.style.display = "";
      box.innerHTML = `<h3 style="margin:18px 0 8px">Cash-Pakete</h3>
        <p class="mut" style="font-size:12px;margin-bottom:10px">Für alle, die nicht warten wollen: Spielgeld für Upgrades und Autos. Kein Vorteil im Rennen — gleiche Physik für alle.</p>
        ${Object.entries(CASH).map(([id,amt])=>`<button class="buy can packbtn" data-id="${id}" style="width:100%;margin:6px 0;display:flex;justify-content:space-between;padding:14px 16px"><span>$${amt.toLocaleString("de-CH")}</span><b>${prices[id]||"…"}</b></button>`).join("")}
        <button class="buy" id="shopRestore" style="width:100%;margin-top:10px;font-size:12px;opacity:.8">Käufe wiederherstellen</button>
        <p class="mut" style="font-size:11.5px;margin-top:10px">Abrechnung über den App Store. Autos sind dauerhafte Käufe (nach Neuinstallation wiederherstellbar), Cash-Pakete werden sofort gutgeschrieben.</p>`;
      box.querySelectorAll(".packbtn").forEach(b=> b.onclick = ()=> buy(b.dataset.id));
      box.querySelector("#shopRestore").onclick = restore;
    }
    return { native, load, price, buy, buyCar, restore, syncOwned, renderShopBits };
  })();
  window.Shop = Shop;
  function unlockVault(key){
    if (!save.cars[key]) save.cars[key] = defaultCarState(key);
    save.cars[key].owned = true;
    persist();
    if (document.getElementById("vault").classList.contains("on")) renderVault();
  }

  // ── iPhone-Duo-Ergebnis (beide Seiten rechnen dasselbe: Replay beider Läufe) ──
  function showDuoResults(r){
    document.getElementById("hud").classList.remove("on");
    const xp = r.status === "win" || r.status === "forfeit" ? 40 : r.status === "lose" ? 15 : 0;
    const cs = save.cars[save.current];
    if (r.myEt != null && (cs.bestEt==null || r.myEt < cs.bestEt)) cs.bestEt = r.myEt;
    const lu = addXp(xp);
    persist();
    const T = { win:["SIEG!","win"], lose:["VERLOREN","lose"], draw:["UNENTSCHIEDEN","win"],
      forfeit:["SIEG!","win"], aborted:["ABGEBROCHEN","lose"], lost:["VERBINDUNG WEG","lose"] }[r.status];
    document.getElementById("resTitle").textContent = T[0];
    document.getElementById("resTitle").className = "big " + T[1];
    const sub = { win:`iPhone Duo · ${r.rivalName} geschlagen`, lose:`iPhone Duo · ${r.rivalName} war schneller`,
      draw:"iPhone Duo · auf die Tausendstel gleich!", forfeit:`${r.rivalName} hat aufgegeben`,
      aborted:"Du hast das Rennen abgebrochen", lost:`Verbindung zu ${r.rivalName} verloren — Rennen nicht gewertet` }[r.status];
    document.getElementById("resSub").textContent = sub;
    const f = v => v == null ? "—" : v.toFixed(3)+"s";
    document.getElementById("resGrid").innerHTML = `
      <div><b>${f(r.myEt)}</b><span>Deine Zeit</span></div>
      <div><b>${f(r.rivalEt)}</b><span>${r.rivalName}</span></div>
      <div><b>${r.trap ? Math.round(r.trap)+" km/h" : "—"}</b><span>Trap Speed</span></div>
      <div><b>${f(r.rt)}</b><span>Reaktion</span></div>
      <div><b>${r.myEt != null && r.rivalEt != null ? (r.myEt < r.rivalEt ? "−" : "+") + Math.abs(r.myEt - r.rivalEt).toFixed(3)+"s" : "—"}</b><span>Abstand</span></div>
      <div><b style="color:#6EA8FF">+${xp} XP</b><span>Erfahrung</span></div>`;
    document.getElementById("resXp").innerHTML = `<span>LV ${save.level}</span><i><b id="xpFill" style="width:${Math.round(100*save.xp/xpNeed(save.level))}%"></b></i><span>${save.xp}/${xpNeed(save.level)}</span>`;
    const tipEl = document.getElementById("resTip"); tipEl.innerHTML = ""; tipEl.style.display = "none";
    if (r.connected) setResButtons({ label:"↺ Revanche", go:()=>Duo.rematch() },
      [{ label:"Auto wechseln", go:()=>Duo.backToLobby() }, { label:"Raum verlassen", go:()=>Duo.leave() }]);
    else setResButtons({ label:"Neuen Raum öffnen", go:()=>{ Duo.leave(true); Duo.open(); } },
      [{ label:"Menü", go:()=>Duo.leave() }]);
    show("results");
    updateCash();
    if (lu.leveled) setTimeout(()=>levelUp(lu.unlocked), 1200);
  }

  // Duo-Link auf einem iPhone ohne App: kurzer Hinweis + automatisch in den App Store.
  // «Im Browser spielen» bleibt als Ausweg (gibt false zurück → normaler Start).
  const APP_STORE_URL = "https://apps.apple.com/app/id6823108171";
  function duoStoreHint(code){
    const d = document.createElement("div");
    d.id = "duoStore";
    d.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:#0A0A0E;color:#F2F3F7";
    d.innerHTML = `<div style="font:italic 900 26px system-ui;letter-spacing:.04em">REDLINE <span style="color:#FF2D40">DUO</span></div>
      <div style="color:#aeb3c2;font-size:15px;max-width:320px">Du wurdest zu einem Rennen eingeladen. Lade Redline Tuner und gib in <b>iPhone Duo</b> diesen Code ein:</div>
      <div style="font:900 34px ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#FFC61A">${code}</div>
      <a href="${APP_STORE_URL}" style="display:block;min-width:240px;padding:15px 18px;border-radius:16px;background:#FF2D40;color:#fff;font-weight:900;text-decoration:none">Im App Store laden</a>
      <button id="duoWeb" style="min-height:44px;background:none;border:0;color:#8E92A3;font-size:14px;text-decoration:underline">Im Browser spielen</button>`;
    document.body.appendChild(d);
    const t = setTimeout(() => { location.href = APP_STORE_URL; }, 1600);
    d.querySelector("#duoWeb").onclick = () => {
      clearTimeout(t); d.remove();
      if (!save.current){ renderStarter().then(() => show("starter")); }
      else { const c = window.DUEL_CODE; window.DUEL_CODE = null; show("menu"); Duo.open(c); }
    };
    return true;
  }
  // Store-App: Universal Link /duo/CODE (Kamera-Scan, Nachricht) → direkt in die Duo-Lobby
  window.openDuoLink = code => {
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) return;
    if (Race.active() && !Duo.racing) Race.stop();
    if (!save.current){ window.DUEL_CODE = code; return; }   // nach der Autowahl
    show("menu"); Duo.open(code);
  };

  // ── Boot ──
  (async ()=>{
    window.Cloud?.init?.();
    // iPhone Duo per QR/Link: ?duo=12345 (alte Live-Links ?duel=… landen auch hier)
    const qs = new URLSearchParams(location.search);
    const pm = location.pathname.match(/^\/duo\/([A-Za-z0-9]+)/);   // Universal-Link-Pfad /duo/CODE
    const duo = qs.get("duo") || qs.get("duel") || pm?.[1];
    if (duo){ window.DUEL_CODE = duo.toUpperCase().replace(/[^A-Z0-9]/g,""); history.replaceState(null,"","/"); }
    // iPhone im Browser ohne App: Duo-Link → App Store (Code bleibt sichtbar zum Eintippen)
    if (duo && !window.NativeBridge?.isNative && /iPhone|iPad|iPod/.test(navigator.userAgent) && duoStoreHint(window.DUEL_CODE)) return;
    if (new URLSearchParams(location.search).get("vault") === "success"){
      history.replaceState(null,"",location.pathname);
      toast("✨ Danke! Dein VAULT-Auto wird freigeschaltet…");
      setTimeout(()=>window.Cloud?.pollVault?.(), 1500);
    }
    if (await checkVSLink()) return;
    if (!save.current){ await renderStarter(); show("starter"); }
    else if (window.DUEL_CODE){ const c = window.DUEL_CODE; window.DUEL_CODE = null; show("menu"); Duo.open(c); }
    else show("menu");
  })();

  setTimeout(()=>{ Shop.load(); }, 400);
  // Haptik in der Store-App: leichtes Tippen auf Menü-/Kauf-/Zurück-Knöpfe, kräftiger beim Rennstart
  if (window.NativeBridge?.isNative){
    document.addEventListener("click", e=>{
      const t = e.target.closest("button, .mbtn, .buy, .tab");
      if (!t) return;
      const strong = t.matches(".mbtn.primary, .vaultbuy, #raceStart, .go");
      window.NativeBridge.haptic(strong ? "medium" : "light");
    }, true);
  }
  return { save, show, persist, toast, applyCloud, showDuoResults, shareVS, unlockVault, startCareer, raceEvent,
    carImage: (k, st) => carImage(k, st), hideLevelUp,
    currentExhaust: ()=> save.cars[save.current]?.style.exhaust ?? 0 };
})();
