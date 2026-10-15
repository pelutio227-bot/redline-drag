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
        return s;
      }
    } catch {}
    const cars = {};
    CAR_KEYS.forEach(k => cars[k] = defaultCarState(k));
    return { money: 800, xp: 0, level: 1, tier: 0, current: null, name: "RACER", cars };
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
  const SCREENS = ["menu","career","garage","results","starter","vschall","duel","vault"];
  function show(id){
    SCREENS.forEach(s=>{ const el=document.getElementById(s); if (el) el.classList.toggle("on", s===id); });
    document.getElementById("hud").classList.remove("on");
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
    if (go === "bet") return startBet();
    if (go === "vs") return Live.openLobby();
    show(go);
  }));

  async function renderMenu(){
    if (!save.current) return;
    const st = save.cars[save.current].style;
    const img = await carImage(save.current, st);
    const mc = document.getElementById("menuCar");
    mc.src = img.src;
    mc.style.filter = `drop-shadow(0 24px 30px rgba(0,0,0,.6)) drop-shadow(0 4px 34px hsla(${st.hue},90%,55%,.42))`;
    document.getElementById("menuCarName").textContent = CAR_DEFS[save.current].name;
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
        if (window.DUEL_CODE){ Live.openLobby(window.DUEL_CODE); return; }
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

  // ── Karriere (endlose VS-Leiter) ──
  function renderCareer(){
    const el = document.getElementById("careerList");
    el.innerHTML = "";
    const from = Math.max(0, save.tier-2);
    for (let i = from; i <= save.tier + 3; i++){
      const o = getOpponent(i);
      o.half = (i+1) % 5 === 0;   // jeder 5. Tier: ½ Meile
      const beaten = i < save.tier, locked = i > save.tier, current = i === save.tier;
      const c = document.createElement("div");
      c.className = "card vsrow" + (locked ? " lock" : "") + (current ? " cur" : "");
      c.innerHTML = `
        <div class="vsava">${o.emoji}</div>
        <div class="nm">
          <span class="vsl">TIER ${i+1} ${o.half?'· <b style="color:#FFC61A">½ MEILE</b>':""} ${beaten?'· <b style="color:var(--grn)">BESIEGT ✓</b>':""}</span>
          <b class="vsn">VS ${o.name}</b>
          <span>${o.desc.replace(/\.$/,"")} · ${CAR_DEFS[o.car].name} · ${Math.round(carPS(CAR_DEFS[o.car])*(o.power??1))}&nbsp;PS</span>
          <span style="color:var(--grn);font-weight:800">${beaten
            ? `$${Math.round(o.prize/3).toLocaleString("de-CH")} <span class="mut" style="font-weight:600">(Rematch ⅓)</span>`
            : `$${o.prize.toLocaleString("de-CH")} Preisgeld`}</span>
        </div>
        <button class="buy ${current?"can":""}">${locked?"🔒":(beaten?"↺":"RACE")}</button>`;
      if (!locked) c.querySelector("button").addEventListener("click", ()=>startRace(o, i));
      el.appendChild(c);
    }
    const hint = document.createElement("p");
    hint.className = "mut"; hint.style.cssText = "font-size:12px;text-align:center;padding:14px";
    hint.textContent = "… es geht endlos weiter. Jeder Gegner ist besser getunt.";
    el.appendChild(hint);
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
  async function renderGarage(){ stylePreview = {}; await refreshPreview(); renderGarageBody(); }
  async function refreshPreview(){
    const stl = { ...save.cars[save.current].style, ...stylePreview };
    const img = await carImage(save.current, stl);
    const el = document.getElementById("gCar");
    el.src = img.src;
    el.style.filter = `drop-shadow(0 18px 22px rgba(0,0,0,.55)) drop-shadow(0 4px 30px hsla(${stl.hue},90%,55%,.4))`;
    const pcH = perfClass(save.current, save.cars[save.current]);
    document.getElementById("gCarName").innerHTML =
      `${classBadge(pcH.cls)} ${CAR_DEFS[save.current].name} <span class="mut" style="font-size:11px">Sim ${pcH.et.toFixed(2)}s</span>`;
  }

  const UPGRADES = [
    { k:"engine", n:"Motor", d:"+15% Leistung pro Stufe", max:3, cost:[900,2600,6200] },
    { k:"turbo",  n:"Turbolader", d:"+28% Leistung · Ladedruck", max:1, cost:[3800] },
    { k:"tires",  n:"Slicks", d:"Traktion beim Launch", max:2, cost:[1200,3200] },
    { k:"trans",  n:"Renngetriebe", d:"Schnellere Schaltzeiten", max:2, cost:[1500,3600] },
    { k:"weight", n:"Leichtbau", d:"−70 kg pro Stufe", max:2, cost:[2200,4800] },
    { k:"nos",    n:"NOS-Flasche", d:"+1.6s NOS pro Stufe (0.9s serienmässig)", max:2, cost:[1100,2400] },
  ];
  // ── Tuning-Ökonomie (NFS-Heat-Logik): Teile kosten relativ zum Auto-Wert —
  // am Starter billig und SPÜRBAR, am Elite-Renner ein echtes Investment.
  const upgMul = k => Math.min(5, Math.max(0.55, 0.55 + (CAR_DEFS[k].price || 0)/50000));
  const upgCost = (u, lvl, k = save.current) => Math.round(u.cost[lvl] * upgMul(k) / 10) * 10;

  // ── Performance-Klassen D–C–B–A–S: objektiv aus der Offline-Sim (¼-Meile).
  // Upgrades schieben das Auto in höhere Klassen → Lieblingsauto bleibt relevant.
  const classCache = {};
  const CLASS_COL = { S:"#FFD34D", A:"#FF4D6A", B:"#6EA8FF", C:"#2BE05E", D:"#8E92A3" };
  function perfClass(k, cs2){
    const key = k + JSON.stringify(cs2.up) + cs2.tune.final + "|" + cs2.tune.launchRpm + "|" + cs2.tune.gears.join(",");
    if (classCache[key]) return classCache[key];
    const et = simulateET(buildSpec(k, cs2));
    // Bänder aus der Sim-Verteilung aller 39 Autos: Stock-Elite = B,
    // nur voll ausgebaute Top-Autos = S, getunte Starter schaffen C–B.
    const cls = et <= 10.6 ? "S" : et <= 11.4 ? "A" : et <= 12.4 ? "B" : et <= 14.1 ? "C" : "D";
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
      const wrap = div("card",`<h3>Fuhrpark — ${CAR_KEYS.length} Autos der Szene</h3>`);
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
      const card = div("card",`<h3>Performance — Klasse ${classBadge(clsNow.cls)} · Sim ${clsNow.et.toFixed(2)}s</h3>`);
      const specNow = buildSpec(save.current, cs);
      // Konkrete Steigerung der NÄCHSTEN Stufe: vorher → nachher (+ Klassen-Sprung)
      const gain = u => {
        const cs2 = { ...cs, up: { ...cs.up, [u.k]: cs.up[u.k] + 1 } };
        const s2 = buildSpec(save.current, cs2);
        const c2 = perfClass(save.current, cs2);
        const clsUp = c2.cls !== clsNow.cls ? ` · ${classBadge(clsNow.cls)}→${classBadge(c2.cls)}` : "";
        if (u.k === "engine" || u.k === "turbo"){
          const a = carPS(def, specNow.powerMul), b = carPS(def, s2.powerMul);
          return `${a} → <b>${b} PS</b> (+${b-a})${clsUp}`;
        }
        if (u.k === "weight") return `${specNow.mass} → <b>${s2.mass} kg</b>${clsUp}`;
        if (u.k === "trans")  return `Schaltzeit ${specNow.shiftTime.toFixed(2)} → <b>${s2.shiftTime.toFixed(2)}s</b>${clsUp}`;
        if (u.k === "tires")  return `Traktion +${Math.round((s2.mu/specNow.mu-1)*100)}%${clsUp}`;
        if (u.k === "nos")    return `${specNow.nosMax.toFixed(1)} → <b>${s2.nosMax.toFixed(1)}s NOS</b>${clsUp}`;
        return "";
      };
      UPGRADES.forEach(u=>{
        const lv = cs.up[u.k];
        const next = lv < u.max ? upgCost(u, lv) : null;
        const row = div("row", `
          <div class="nm"><b>${u.n}</b><span>${u.d}</span>
          ${next!=null?`<span style="color:var(--grn);font-weight:700;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${gain(u)}</span>`:""}</div>
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
        <div><b style="color:${CLASS_COL[clsNow.cls]}">Klasse ${clsNow.cls}</b><span>Sim ¼-Meile ${clsNow.et.toFixed(2)}s</span></div>
        <div><b>${carPS(def, spec.powerMul)} PS</b><span>Leistung</span></div>
        <div><b>${(spec.mass/carPS(def, spec.powerMul)).toFixed(1)} kg/PS</b><span>Leistungsgewicht</span></div>
        <div><b>${peak} Nm</b><span>Drehmoment</span></div>
        <div><b>${spec.mass} kg</b><span>Gewicht</span></div>
        <div><b>${def.redline} rpm</b><span>Redline</span></div>
        <div><b>${cs.bestEt?cs.bestEt.toFixed(3)+"s":"—"}</b><span>Bestzeit ¼</span></div>
        <div><b>${def.zone??530} rpm</b><span>Grüne Schaltzone</span></div>
        <div><b>+${(3700/(def.zone??530)).toFixed(1)}%</b><span>Perfect-Boost</span></div>
      </div>
      <p class="mut" style="font-size:11.5px;padding-top:8px">Enge Schaltzone = schwerer zu treffen, aber stärkerer Boost. Gas exakt bei GRÜN = Launch-Boost bis +12%.</p>`));
    }

    if (gTab === "tune"){
      const card = div("card", `<h3>Getriebe-Setup</h3>
        <p class="mut" style="font-size:12px;margin-bottom:6px">Kürzer = mehr Punch, weniger Endspeed. Länger = Top-End.</p>`);
      cs.tune.gears.forEach((gv,i)=>{
        card.appendChild(slider(`${i+1}. Gang`, gv, 0.6, 4.2, 0.01, v=>{ cs.tune.gears[i]=v; persist(); }));
      });
      card.appendChild(slider("Final Drive", cs.tune.final, 2.6, 5.2, 0.01, v=>{ cs.tune.final=v; persist(); }));
      el.appendChild(card);
      const c2 = div("card","<h3>Launch</h3>");
      c2.appendChild(slider("Launch-RPM", cs.tune.launchRpm, def.idle+500, def.redline, 50,
        v=>{ cs.tune.launchRpm = Math.round(v); persist(); }, v=>Math.round(v)));
      c2.appendChild(div("", `<p class="mut" style="font-size:12px;padding:4px 0">Zu hoch = Wheelspin. Zu tief = lahm. Slicks vertragen mehr.</p>`));
      el.appendChild(c2);
      const r = div("card",""); const rb = document.createElement("button");
      rb.className="buy"; rb.style.width="100%"; rb.textContent="Setup zurücksetzen";
      rb.addEventListener("click", ()=>{
        cs.tune = { gears: def.gears.slice(), final: def.final, launchRpm: Math.round(def.redline*0.5) };
        persist(); renderGarageBody();
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
        renderGarageBody(); refreshPreview();
        toast(`${label} gekauft ✓ −${fmt$(price)}`);
      };
      // Slider mit LIVE-Vorschau: ungekauft → wirkt nur auf die Vorschau,
      // darunter Kauf-Leiste «Übernehmen». Gekauft → wirkt direkt.
      const card = div("card","<h3>Lack &amp; Stance</h3>");
      card.appendChild(slider("Farbe", stylePreview.hue ?? st.hue, 0, 360, 1, v=>{
        if (cs.styleOwned.paint){ st.hue = v; persist(); } else stylePreview.hue = v;
        refreshPreview();
      }, ()=> "●", true));
      if (!cs.styleOwned.paint){
        const bar = div("buybar", `<span>Farb-Vorschau frei — <b>Lackierung</b> übernehmen?</span>`);
        const b = document.createElement("button");
        b.className = "buy can"; b.textContent = `Kaufen ${fmt$(PRICES.paint)}`;
        b.addEventListener("click", ()=> buyIt("paint", PRICES.paint, "Lackierung",
          ()=>{ if (stylePreview.hue != null) st.hue = stylePreview.hue; delete stylePreview.hue; }));
        bar.appendChild(b); card.appendChild(bar);
      }
      card.appendChild(slider("Tieferlegung", stylePreview.drop ?? st.drop, 0, 22, 1, v=>{
        if (cs.styleOwned.stance){ st.drop = v; persist(); } else stylePreview.drop = v;
        refreshPreview();
      }, v=>v+" mm"));
      if (!cs.styleOwned.stance){
        const bar = div("buybar", `<span>Stance-Vorschau frei — <b>Gewindefahrwerk</b> übernehmen?</span>`);
        const b = document.createElement("button");
        b.className = "buy can"; b.textContent = `Kaufen ${fmt$(PRICES.stance)}`;
        b.addEventListener("click", ()=> buyIt("stance", PRICES.stance, "Gewindefahrwerk",
          ()=>{ if (stylePreview.drop != null) st.drop = stylePreview.drop; delete stylePreview.drop; }));
        bar.appendChild(b); card.appendChild(bar);
      }
      el.appendChild(card);
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
      el.appendChild(segCard("Neon-Unterboden", ["Aus","An"], st.neon ?? 0,
        v=>{ st.neon=v; persist(); refreshPreview(); }, [0,6], PRICES.neon, "neon"));
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
        toast(`${opts[i]} gekauft &amp; montiert ✓ −$${p.toLocaleString("de-CH")}`);
        on(i);                                       // montiert + persistiert
        renderGarageBody();
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
    const img = await carImage(d.c, d.s);
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
  function startQuick(){
    const o = getOpponent(Math.max(0, save.tier-1 + Math.floor(Math.random()*2)));
    startRace({ ...o, prize: Math.max(150, Math.round(o.prize*0.35)), quick:true,
                half: Math.random() < 0.3 }, o.tier);
  }
  // Bet & Race: Einsatz zahlen — Sieg verdoppelt, Niederlage weg
  function startBet(){
    if (save.money < 100) return toast("Mindestens $100 für Bet & Race!");
    const bet = Math.max(100, Math.min(Math.round(save.money*0.25), 10000));
    save.money -= bet; persist(); updateCash();
    const o = getOpponent(save.tier + (Math.random()<0.5?0:1));
    toast(`Einsatz: $${bet.toLocaleString("de-CH")} — Sieg bringt $${(bet*2).toLocaleString("de-CH")}!`);
    startRace({ ...o, prize: bet*2, quick:true, bet, half: Math.random() < 0.3 }, o.tier);
  }
  function startRace(opp, tier){
    if (!save.current) return show("starter");
    lastRace = { opp, tier };
    SCREENS.forEach(s=>{ const el=document.getElementById(s); if (el) el.classList.remove("on"); });
    document.getElementById("hud").classList.add("on");
    document.getElementById("hudVs").textContent = "VS " + opp.name;
    Race.start({ carKey: save.current, carState: save.cars[save.current], opp,
      onDone: res => showResults(res, opp, tier) });
  }

  // ── Resultate mit Animation (Geld-Count-Up, XP, Level-Up) ──
  function showResults(res, opp, tier){
    document.getElementById("hud").classList.remove("on");
    const cs = save.cars[save.current];
    // Rematch gegen schon besiegte Karriere-Gegner: nur ⅓ Geld + XP —
    // Farmen alter Tiers lohnt kaum, der volle Preis wartet beim NÄCHSTEN Gegner.
    const rematch = !opp.quick && !opp.vsGhost && !opp.bet && tier < save.tier;
    let cash = 0, xp = 0;
    if (res.win){
      cash = opp.prize;
      xp = 40 + (opp.tier ?? tier)*12 + (res.perfects ? 15 : 0);
      if (rematch){ cash = Math.round(cash/3); xp = Math.round(xp/3); }
      if (!opp.quick && !opp.vsGhost && tier === save.tier) save.tier++;
    } else { xp = rematch ? 4 : 12; }
    save.money += cash;
    if (res.et !== Infinity && (cs.bestEt==null || res.et < cs.bestEt)) cs.bestEt = res.et;

    // Level-Up prüfen
    save.xp += xp;
    const unlocked = [];
    let leveled = false;
    while (save.xp >= xpNeed(save.level)){
      save.xp -= xpNeed(save.level); save.level++; leveled = true;
      CAR_KEYS.forEach(k=>{ if (CAR_DEFS[k].unlock === save.level) unlocked.push(CAR_DEFS[k].name); });
    }
    persist();

    document.getElementById("resTitle").textContent = res.win ? "SIEG!" : "VERLOREN";
    document.getElementById("resTitle").className = "big " + (res.win?"win":"lose");
    document.getElementById("resSub").textContent = res.win
      ? `VS ${opp.name} geschlagen${opp.bet ? ` · Einsatz verdoppelt!` : ""}${res.perfects ? " · PERFECT-Bonus!" : ""}${rematch ? " · Rematch: ⅓ Belohnung" : ""}`
      : `VS ${opp.name} — ${opp.bet ? `$${opp.bet.toLocaleString("de-CH")} Einsatz futsch!` : "tune nach, hol dir den Sieg!"}`;
    document.getElementById("resGrid").innerHTML = `
      <div><b id="cEt">0.000s</b><span>Deine ¼-Meile</span></div>
      <div><b>${res.oppEt==null?"—":res.oppEt.toFixed(3)+"s"}</b><span>${opp.name}</span></div>
      <div><b>${Math.round(res.trap)} km/h</b><span>Trap Speed</span></div>
      <div><b>${res.rt==null?"—":res.rt.toFixed(3)+"s"}</b><span>Reaktion</span></div>
      <div><b id="cCash" style="color:var(--grn)">$0</b><span>Preisgeld</span></div>
      <div><b id="cXp" style="color:#6EA8FF">+0 XP</b><span>Erfahrung</span></div>`;
    // XP-Bar
    document.getElementById("resXp").innerHTML = `<span>LEVEL ${save.level}</span><i><b id="xpFill" style="width:0%"></b></i><span>${save.xp}/${xpNeed(save.level)}</span>`;
    show("results");

    // Count-Up-Animationen
    countUp("cEt", res.et===Infinity?0:res.et, v=>v.toFixed(3)+"s", 900);
    countUp("cCash", cash, v=>"$"+Math.round(v).toLocaleString("de-CH"), 1100);
    countUp("cXp", xp, v=>"+"+Math.round(v)+" XP", 1100);
    setTimeout(()=>{ const f=document.getElementById("xpFill"); if (f) f.style.width = Math.round(100*save.xp/xpNeed(save.level))+"%"; }, 350);

    if (leveled) setTimeout(()=>levelUp(unlocked), 1400);

    // «Nächster ▶» — nach Karriere-Sieg direkt zum nächsten Gegner
    const nextBtn = document.getElementById("btnNext");
    const showNext = res.win && !opp.quick && !opp.vsGhost && !opp.bet;
    nextBtn.style.display = showNext ? "" : "none";
    document.getElementById("btnAgain").classList.toggle("primary", !showNext);
    document.getElementById("btnAgain").style.display = "";
    document.getElementById("btnLobby").style.display = "none";
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
  function levelUp(unlocked){
    const el = document.getElementById("lvlup");
    document.getElementById("lvlupNum").textContent = save.level;
    document.getElementById("lvlupUnlocks").innerHTML = unlocked.length
      ? "Freigeschaltet: " + unlocked.map(n=>`<b>${n}</b>`).join(", ")
      : "Weiter so — nächstes Auto wartet!";
    el.classList.add("on");
    AudioSys.winJingle();
    setTimeout(()=>el.classList.remove("on"), 2600);
  }
  function toast(msg){
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("on");
    setTimeout(()=>t.classList.remove("on"), 2400);
  }

  document.getElementById("btnAgain").addEventListener("click", ()=>{ if (lastRace) startRace(lastRace.opp, lastRace.tier); });
  document.getElementById("btnNext").addEventListener("click", ()=>{
    const o = getOpponent(save.tier);
    o.half = (save.tier+1) % 5 === 0;
    startRace(o, save.tier);
  });
  document.getElementById("restartRace").addEventListener("click", ()=>{
    if (lastRace){ Race.stop(); startRace(lastRace.opp, lastRace.tier); }
  });
  document.getElementById("leaveRace").addEventListener("click", ()=>{ Race.stop(); show("menu"); });

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
  function uiShift(){
    const q = Race.shift();
    if (q){                                   // Knauf wandert sichtbar in den nächsten Slot
      syncKnob();
      if (q === "PERFECT"){ pShift.classList.add("flash"); setTimeout(()=>pShift.classList.remove("flash"), 300); }
    }
  }
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
    if (e.code==="Escape"){ Race.stop(); show("menu"); }
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
    const img = await carImage("kuro", owned ? save.cars.kuro.style : { hue:0, drop:12, rim:2, exhaust:2, spoiler:0, kit:0 });
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
    } else if (Shop.native){
      b.textContent = "Kaufen — " + (Shop.price("redline_vault_kuro") || "…");
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
      if (!native){ box.style.display = "none"; return; }
      box.style.display = "";
      box.innerHTML = `<h3 style="margin:18px 0 8px">Cash-Pakete</h3>
        <p class="mut" style="font-size:12px;margin-bottom:10px">Für alle, die nicht warten wollen: Spielgeld für Upgrades und Autos. Kein Vorteil im Rennen — gleiche Physik für alle.</p>
        ${Object.entries(CASH).map(([id,amt])=>`<button class="buy can packbtn" data-id="${id}" style="width:100%;margin:6px 0;display:flex;justify-content:space-between;padding:14px 16px"><span>$${amt.toLocaleString("de-CH")}</span><b>${prices[id]||"…"}</b></button>`).join("")}
        <button class="buy" id="shopRestore" style="width:100%;margin-top:10px;font-size:12px;opacity:.8">Käufe wiederherstellen</button>
        <p class="mut" style="font-size:10.5px;margin-top:10px">Abrechnung über den App Store. Autos sind dauerhafte Käufe (nach Neuinstallation wiederherstellbar), Cash-Pakete werden sofort gutgeschrieben.</p>`;
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

  // ── Live-Duell-Ergebnis (Geld ist in live.js schon verrechnet) ──
  function showLiveResults(res, rivalName, bet){
    document.getElementById("hud").classList.remove("on");
    const xp = res.win ? 35 : 12;
    save.xp += xp;
    const unlocked = []; let leveled = false;
    while (save.xp >= xpNeed(save.level)){
      save.xp -= xpNeed(save.level); save.level++; leveled = true;
      CAR_KEYS.forEach(k=>{ if (CAR_DEFS[k].unlock === save.level) unlocked.push(CAR_DEFS[k].name); });
    }
    const cs = save.cars[save.current];
    if (res.et !== Infinity && (cs.bestEt==null || res.et < cs.bestEt)) cs.bestEt = res.et;
    persist();
    document.getElementById("resTitle").textContent = res.win ? "SIEG!" : "VERLOREN";
    document.getElementById("resTitle").className = "big " + (res.win?"win":"lose");
    document.getElementById("resSub").textContent = res.win
      ? `LIVE VS ${rivalName} geschlagen${bet>0 ? ` · $${bet.toLocaleString("de-CH")} kassiert!` : " · Ehre verteidigt!"}`
      : `LIVE VS ${rivalName}${bet>0 ? ` · $${bet.toLocaleString("de-CH")} verloren` : " — Revanche in der Lobby!"}`;
    document.getElementById("resGrid").innerHTML = `
      <div><b>${res.et===Infinity?"—":res.et.toFixed(3)+"s"}</b><span>Deine Zeit</span></div>
      <div><b>${res.oppEt==null?"—":res.oppEt.toFixed(3)+"s"}</b><span>${rivalName}</span></div>
      <div><b>${Math.round(res.trap)} km/h</b><span>Trap Speed</span></div>
      <div><b>${res.rt==null?"—":res.rt.toFixed(3)+"s"}</b><span>Reaktion</span></div>
      <div><b style="color:${res.win?"var(--grn)":"var(--red)"}">${bet>0 ? (res.win?"+$":"−$")+bet.toLocaleString("de-CH") : "Fun-Race"}</b><span>Einsatz</span></div>
      <div><b style="color:#6EA8FF">+${xp} XP</b><span>Erfahrung</span></div>`;
    document.getElementById("resXp").innerHTML = `<span>LEVEL ${save.level}</span><i><b id="xpFill" style="width:${Math.round(100*save.xp/xpNeed(save.level))}%"></b></i><span>${save.xp}/${xpNeed(save.level)}</span>`;
    document.getElementById("btnNext").style.display = "none";
    document.getElementById("btnAgain").style.display = "none";
    document.getElementById("btnLobby").style.display = "";
    show("results");
    updateCash();
    if (leveled) setTimeout(()=>levelUp(unlocked), 1200);
  }
  document.getElementById("btnLobby").addEventListener("click", ()=>{
    document.getElementById("btnLobby").style.display = "none";
    document.getElementById("btnAgain").style.display = "";
    Live.backToLobby();
  });

  // ── Boot ──
  (async ()=>{
    window.Cloud?.init?.();
    const duel = new URLSearchParams(location.search).get("duel");
    if (duel){ window.DUEL_CODE = duel.toUpperCase(); history.replaceState(null,"",location.pathname); }
    if (new URLSearchParams(location.search).get("vault") === "success"){
      history.replaceState(null,"",location.pathname);
      toast("✨ Danke! Dein VAULT-Auto wird freigeschaltet…");
      setTimeout(()=>window.Cloud?.pollVault?.(), 1500);
    }
    if (await checkVSLink()) return;
    if (!save.current){ await renderStarter(); show("starter"); }
    else if (window.DUEL_CODE) Live.openLobby(window.DUEL_CODE);
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
  return { save, show, persist, toast, applyCloud, showLiveResults, shareVS, unlockVault,
    currentExhaust: ()=> save.cars[save.current]?.style.exhaust ?? 0 };
})();
