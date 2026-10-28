// ui.js — Season 2 (28.10.2026): Partner-Wahl, Auto-Level 1–60 mit XP-Balken, Strassen-Radar
// (Gegner nach Seltenheit), VS-Bildschirm, Beute + Level-Up, Garage mit Teilen / Talentbaum /
// Style (Lack-Bibliothek, Streifen, Sticker) / Setup / Sammlung, Duell-Ergebnis, Vault & Shop.
// Regeln/Zahlen: js/rpg.js · Physik: js/sim.js · Darstellung Autos: js/cars.js

const UI = (() => {
  const SAVE_KEY = "redline:save:v2";             // Key bleibt; Inhalt ab Season 2 = v 3
  const $ = id => document.getElementById(id);
  const fmt$ = n => "$" + Math.round(n).toLocaleString("de-CH");
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const NOUP = () => ({ engine:0, turbo:0, tires:0, trans:0, weight:0, nos:0 });
  // Werkslack der Starter (gratis): EG in Racing Rot, Euro-Hatch in Weiss, Muscle in Schwarz mit Gold-Hockeystick
  const STARTER_LOOK = { hikari: { paint:"racing", hue:355 }, bauer: { paint:"white", hue:210 }, scorcher: { paint:"black", hue:230, stripe:3, stripeCol:"gold" } };

  function defaultCarState(key){
    const def = CAR_DEFS[key];
    return {
      owned: false, lvl: 1, xp: 0, tal: {}, wins: 0,
      up: NOUP(),
      tune: { gears: def.gears.slice(), final: def.final, launchRpm: Math.round(def.redline*0.5) },
      style: { hue: (CAR_KEYS.indexOf(key)*53+355)%360, drop: 6, rim: 0, exhaust: 0, spoiler: 0, neon: 0, kit: 0, ...STARTER_LOOK[key] },
      bestEt: null,
    };
  }
  // Style-Kauf-Migration (Season 1): was ein alter Spielstand montiert hat, gilt als gekauft
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
  // Season 2: Teile auf die neuen Stufen umrechnen, Auto-Level = höchste dafür nötige Stufe.
  // Nichts wird weggenommen: gekaufte Autos, Cash und Style bleiben.
  const UPMAP = { engine:[0,3,5,8], turbo:[0,2,4,5], tires:[0,2,5], trans:[0,2,5], weight:[0,2,4], nos:[0,2,5] };
  function migrateV3(s){
    if ((s.v ?? 0) >= 3) return;
    CAR_KEYS.forEach(k => {
      const c = s.cars[k]; if (!c) return;
      c.tal ??= {}; c.xp = 0; c.wins ??= 0;
      const up = NOUP(); let lv = 1;
      if (c.owned) UPGRADES.forEach(u => {
        const map = UPMAP[u.k], old = Math.min(map.length - 1, c.up?.[u.k] | 0), st = map[old];
        up[u.k] = st; if (st) lv = Math.max(lv, partUnlockLvl(u.k, st));
      });
      // Level gedeckelt auf 80 % des alten Spieler-Levels: Teile bleiben verbaut (Veteranen-Vorsprung),
      // die Reise bis 60 bleibt aber eine Reise
      c.up = up; c.lvl = c.owned ? Math.max(1, Math.min(lv, Math.round((s.level ?? 1) * 0.8))) : 1;
    });
    s.season2 = { fromLevel: s.level ?? 1, at: Date.now(), seen: false };
    delete s.tier; delete s.losses; delete s.level; delete s.xp;
    s.v = 3; s.pity = 0; s.restLv = 0.5; s.enc = null;
    s.stats ??= { wins:0, races:0, rar:{} }; s.seen ??= {};
  }
  function fixup(s){
    CAR_KEYS.forEach(k => { if (!s.cars[k]) s.cars[k] = defaultCarState(k); });
    if (s.current && !s.cars[s.current]?.owned) s.current = CAR_KEYS.find(k => s.cars[k].owned) ?? null;
    migrateStyle(s); migrateV3(s);
    CAR_KEYS.forEach(k => { const c = s.cars[k]; c.lvl ??= 1; c.xp ??= 0; c.tal ??= {}; c.up = { ...NOUP(), ...c.up }; c.tune ??= defaultTune(CAR_DEFS[k]); c.style ??= defaultCarState(k).style; });
    s.stats ??= { wins:0, races:0, rar:{} }; s.seen ??= {}; s.pity ??= 0; s.restLv ??= 0;
    return s;
  }
  // Ausgeruht (WoW): pro Stunde offline 5 % eines Levels, max. 1.5 Level → doppelte XP
  function applyRest(s){
    const now = Date.now();
    if (s.lastSeen){ const h = (now - s.lastSeen) / 3.6e6; if (h >= 1) s.restLv = Math.min(1.5, (s.restLv || 0) + h*0.05); }
    s.lastSeen = now;
  }
  function load(){
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s?.cars){ fixup(s); applyRest(s); return s; }
    } catch {}
    const cars = {};
    CAR_KEYS.forEach(k => cars[k] = defaultCarState(k));
    return { v: 3, money: 600, current: null, name: "RACER", cars, pity: 0, restLv: 0, enc: null,
             stats: { wins:0, races:0, rar:{} }, seen: {}, styleV: 1, lastSeen: Date.now() };
  }
  const save = load();
  function persist(){
    save.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
    window.Cloud?.push?.();
  }
  function applyCloud(cloud){
    fixup(cloud);
    Object.keys(save).forEach(k => delete save[k]);
    Object.assign(save, cloud);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
    if (!Race.active()) show(save.current ? "menu" : "starter");
  }
  const cur = () => save.cars[save.current];
  const curLvl = () => cur()?.lvl ?? 1;
  const fxOf = k => talentFx(k, save.cars[k].tal);

  // XP aufs aktuelle Auto (inkl. Ausgeruht-Bonus) → gewonnene Level
  function giveXp(k, xp){
    const c = save.cars[k]; let bonus = 0;
    if (c.lvl >= MAX_LVL) return { total: 0, bonus: 0, gained: [] };
    if (save.restLv > 0){
      const need = xpNeed(c.lvl);
      bonus = Math.min(xp, Math.round(save.restLv * need));
      save.restLv = Math.max(0, save.restLv - bonus / need);
    }
    c.xp += xp + bonus; const gained = [];
    while (c.lvl < MAX_LVL && c.xp >= xpNeed(c.lvl)){ c.xp -= xpNeed(c.lvl); c.lvl++; gained.push(c.lvl); }
    if (c.lvl >= MAX_LVL) c.xp = 0;
    return { total: xp + bonus, bonus, gained };
  }

  // ── Bausteine ──
  const lvBadge = (lvl, rar, sm = false) => `<b class="lvb${sm ? " sm" : ""}${lvl >= MAX_LVL ? " max" : ""} r-${rar}"><i>${lvl}</i></b>`;
  const clsChip = k => { const C = CLASSES[carClass(k)]; return `<em class="clschip" style="--c:${C.col}">${C.icon} ${C.name}</em>`; };
  function xpBarHTML(c, labels = true, pct = null){
    if (c.lvl >= MAX_LVL) return `<div class="xpb"><i class="fill" style="width:100%;background:linear-gradient(180deg,#fff2b0,#FFD34D,#c98a12)"></i><span>LEVEL 60 · LEGENDE</span></div>`;
    const need = xpNeed(c.lvl), p = pct ?? c.xp / need;
    const rest = Math.min(1 - p, save.restLv || 0);
    const ticks = Array.from({ length: 9 }, (_, i) => `<i class="tick" style="left:${(i+1)*10}%"></i>`).join("");
    return `<div class="xpb"><i class="rest" style="left:${p*100}%;width:${rest*100}%"></i><i class="fill" style="width:${p*100}%"></i>${ticks}
      <span>${c.xp.toLocaleString("de-CH")} / ${need.toLocaleString("de-CH")} XP</span></div>`
      + (labels ? `<div class="xpline"><span>LV ${c.lvl}</span>${save.restLv > 0.01 ? `<span class="rs">Ausgeruht · ×2 XP</span>` : ""}<span>LV ${c.lvl + 1}</span></div>` : "");
  }
  // WoW-Rahmen: Flügel ab Blau (silber), Episch/Legendär (gold)
  const WING = col => `<svg class="wing" viewBox="0 0 44 78"><defs><linearGradient id="wg${col.slice(1)}" x1="0" x2="1"><stop offset="0" stop-color="${col}" stop-opacity=".2"/><stop offset="1" stop-color="${col}"/></linearGradient></defs>
    <path d="M42 14 C26 6 10 8 2 2 C6 14 4 22 12 28 C4 30 2 38 6 44 C12 40 18 42 22 44 C14 50 14 60 20 66 C24 58 32 56 40 56 Z" fill="url(#wg${col.slice(1)})" stroke="${col}" stroke-width="1.2"/></svg>`;
  function nameplate(d, lvl){
    const rar = d.r ?? d.rar, wingCol = rar === "blue" ? "#C9D3E6" : (rar === "epic" || rar === "legend") ? "#FFD34D" : null;
    const tag = { blue:"RAR", epic:"ELITE", legend:"LEGENDE" }[rar];
    return `<div class="np r-${rar}"><span class="np-ring">${wingCol ? WING(wingCol) + WING(wingCol).replace('class="wing"', 'class="wing r"') : ""}
        <img src="assets/drivers/${d.id}.jpg" alt=""><i class="np-lv">LV ${lvl}</i></span>
      <div class="np-t"><b>${esc(d.name)}</b><small>${esc(d.title)}</small>${tag ? `<em>${tag}</em>` : ""}</div></div>`;
  }
  const DRIVER = id => DRIVERS.find(d => d.id === id);

  // ── Screens ──
  const SCREENS = ["menu","radar","garage","results","starter","vschall","duo","vault"];
  function show(id){
    SCREENS.forEach(s => { const el = $(s); if (el) el.classList.toggle("on", s === id); });
    $("hud").classList.remove("on");
    if (id !== "results") Race.clear?.();
    if (id === "menu") renderMenu();
    if (id === "garage") renderGarage();
    if (id === "vault") renderVault();
    if (id === "starter") renderStarter();
    updateCash();
  }
  function updateCash(){
    ["cash1","cash2","cash3","cash4"].forEach(id => { const el = $(id); if (el) el.textContent = save.money.toLocaleString("de-CH"); });
  }
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => {
    AudioSys.unlock();
    const go = b.dataset.go;
    if (go === "quick") return startTest();
    if (go === "duo") return Duo.open();
    if (go === "radar") return openRadar();
    show(go);
  }));

  // ── Menü: Held mit Level-Plakette ÜBER dem Auto ──
  async function renderMenu(){
    if (!save.current) return;
    const k = save.current, c = cur(), d = CAR_DEFS[k], rar = carRarity(k);
    $("heroPlate").innerHTML = `${lvBadge(c.lvl, rar)}<div class="hp-t"><b style="color:${RARITY[rar].col}">${d.name}</b>
      <span>${clsChip(k)} · ${RARITY[rar].n}${c.lvl >= MAX_LVL ? " · LEGENDE" : ""}</span></div>`;
    $("heroXp").innerHTML = xpBarHTML(c);
    const free = talentPoints(c.lvl) - talentSpent(c.tal);
    const gb = $("menuGarage"); gb.querySelector(".badge-dot")?.remove();
    if (free > 0) gb.insertAdjacentHTML("beforeend", `<span class="badge-dot" title="Talentpunkte frei">${free}</span>`);
    const rb = document.querySelector(".radarbtn small");
    if (rb) rb.textContent = save.enc ? `Offen: ${save.enc.name} (${RARITY[save.enc.rar].n})` : "Herausforderer suchen";
    const img = await carImage(k, c.style, true);
    const mc = $("menuCar"); mc.src = img.src;
    mc.style.filter = `drop-shadow(0 24px 30px rgba(0,0,0,.6)) drop-shadow(0 4px 34px ${RARITY[rar].glow})`;
    if (save.season2 && !save.season2.seen){
      save.season2.seen = true; persist();
      setTimeout(() => toast(`Season 2! Deine Autos haben jetzt eigene Level — ${d.name} startet auf LV ${c.lvl}.`), 600);
    }
  }

  // ── Partner-Wahl (1 aus 3: Japan · Deutschland · USA) ──
  async function renderStarter(){
    const el = $("starterCards");
    el.innerHTML = "";
    for (const k of ["hikari","bauer","scorcher"]){
      const def = CAR_DEFS[k], C = CLASSES[carClass(k)];
      const img = await carImage(k, defaultCarState(k).style);
      const c = document.createElement("button");
      c.className = "startercard";
      c.innerHTML = `<div class="cls">${clsChip(k)}</div><img src="${img.src}" alt="">
        <b>${def.name}</b><span>${def.desc}</span>
        <div class="pc"><em>+ ${def.pros}</em><em class="con">− ${def.cons}</em></div>
        <div class="passive psv" style="--c:${C.col}"><div class="ic">${C.icon}</div><div><b>${C.passive.n}</b><span>${C.passive.d}</span></div></div>`;
      c.addEventListener("click", () => {
        save.cars[k].owned = true; save.current = k; save.restLv = Math.max(save.restLv, 0.3); persist();
        AudioSys.unlock(); AudioSys.levelUp();
        if (window.DUEL_CODE){ const dc = window.DUEL_CODE; window.DUEL_CODE = null; Duo.open(dc); return; }
        show("menu");
      });
      el.appendChild(c);
    }
  }

  // ══ Strassen-Radar ══════════════════════════════════════════════════════════
  // Gegner wird per Zufall nach Seltenheit gezogen (rpg.js) und GESPEICHERT — Neustart der
  // App bringt keinen neuen Wurf. Ausweichen kostet Cash, Grau gibt kein Geld → ehrlicher Zufall.
  $("radarBack").addEventListener("click", () => { radarAnim = null; show("menu"); });
  function oppStyle(enc){
    const r = enc.seed, rar = enc.rar, rank = RARITIES.indexOf(rar);
    const paints = PAINT_LIB.filter(p => p[2] === "solid" || (rank >= 2 && p[2] === "pro") || (rank >= 3 && p[2] === "leg"));
    return { hue: r % 360, paint: paints[r % paints.length][0], drop: 6 + (r >> 3) % 12, rim: 1 + (r >> 5) % 3,
             exhaust: Math.min(3, rank), spoiler: rank >= 2 ? 2 : (r >> 7) % 2, kit: rank >= 3 ? 2 : rank >= 1 ? (r >> 9) % 2 : 0,
             neon: rank >= 2 ? 1 : 0, neonHue: (r >> 2) % 360, stripe: (r >> 11) % 5, stripeCol: ["white","black","gold","racing"][(r >> 13) % 4],
             stk: rank >= 1 ? [["num","nitrox","kai","rl","kanji","star"][(r >> 15) % 6]] : [] };
  }
  function openRadar(){
    if (!save.current) return show("starter");
    show("radar");
    if (save.enc) return renderVS(save.enc, false);
    rollEncounter();
  }
  function rollEncounter(){
    const c = cur(), fx = fxOf(save.current);
    const enc = makeEncounter(c.lvl, Math.random, { luck: fx.luck || 0, pity: save.pity || 0, hunter: fx.hunter || 0 });
    save.pity = (enc.rar === "grey" || enc.rar === "green") ? (save.pity || 0) + 1 : 0;
    save.enc = { ...enc, tries: 0 };
    persist();
    animateRoll(save.enc);
  }
  let radarAnim = null;
  function animateRoll(enc){
    const body = $("radarBody");
    const N = 44, WIN = 36, CW = 142;                   // Karten, Gewinner-Index, Kartenbreite inkl. Abstand
    const pickR = () => { const x = Math.random()*100; return x < 42 ? "grey" : x < 70 ? "green" : x < 88 ? "blue" : x < 97 ? "epic" : "legend"; };
    const cards = Array.from({ length: N }, (_, i) => {
      if (i === WIN) return DRIVER(enc.id);
      const r = pickR(), L = DRIVERS.filter(d => d.r === r); return L[Math.floor(Math.random()*L.length)];
    });
    const fx = fxOf(save.current), thr = PITY_BASE - 4*(fx.hunter || 0), sig = Math.min(10, Math.round(10 * Math.min(1, (save.pity || 0) / thr)));
    body.innerHTML = `<div class="rad-flash"></div>
      <div class="rad-title">Strassen-Radar</div><div class="rad-q">Wer fährt heute Nacht?</div>
      <div class="rad-win"><div class="rad-strip" id="radStrip">${cards.map(d => `<div class="rc r-${d.r}"><img src="assets/drivers/${d.id}.jpg" alt=""><b>${esc(d.name)}</b></div>`).join("")}</div><div class="rad-mark"></div></div>
      <div class="rad-sig" title="Seltener Gegner garantiert, wenn voll">SIGNAL ${Array.from({ length: 10 }, (_, i) => `<i class="${i < sig ? "on" : ""}"></i>`).join("")}</div>
      <div class="rad-hint">Tippen zum Überspringen</div>`;
    const strip = $("radStrip"), W = body.clientWidth;
    const target = WIN*CW + 66 - W/2 + (Math.random() - 0.5)*80;
    const dur = enc.rar === "legend" ? 6200 : enc.rar === "epic" ? 5400 : 4600;
    const t0 = performance.now(); let lastCard = -1, skip = false;
    const me = radarAnim = { stop: false };
    body.onclick = () => { skip = true; };
    const ease = t => 1 - Math.pow(1 - t, 4);
    const step = now => {
      if (me.stop || radarAnim !== me) return;
      let t = Math.min(1, (now - t0) / dur);
      if (skip) t = 1;
      const x = target * ease(t);
      strip.style.transform = `translateX(${-x}px)`;
      const ci = Math.floor((x + W/2) / CW);
      if (ci !== lastCard){ lastCard = ci; if (!skip) AudioSys.radarTick(1 - 0.4*t); }
      if (t < 1) return requestAnimationFrame(step);
      body.onclick = null;
      reveal(enc, strip.children[WIN]);
    };
    requestAnimationFrame(step);
  }
  function reveal(enc, card){
    const body = $("radarBody"), R = RARITY[enc.rar];
    card.classList.add("win");
    body.classList.add(`r-${enc.rar}`);
    const fl = body.querySelector(".rad-flash"); fl.style.setProperty("--rc", R.col); fl.classList.add("go");
    AudioSys.reveal(enc.rar);
    window.NativeBridge?.haptic?.(RARITIES.indexOf(enc.rar) >= 2 ? "heavy" : "medium");
    if (enc.rar === "epic" || enc.rar === "legend"){ body.classList.remove("shake"); void body.offsetWidth; body.classList.add("shake"); }
    body.querySelector(".rad-hint").outerHTML = `<div class="rarlbl r-${enc.rar}" style="margin-top:14px">${R.n}${enc.rar === "legend" ? " ✦" : ""}</div>`;
    setTimeout(() => { if ($("radar").classList.contains("on")) renderVS(enc, true); }, enc.rar === "legend" ? 1700 : 1100);
  }
  function dodgePrice(enc){ return Math.round(rarCash(enc.lvl) * 0.6 / 10) * 10; }
  async function renderVS(enc, fresh){
    const d = DRIVER(enc.id), c = cur(), R = RARITY[enc.rar], k = save.current;
    const rw = encounterReward(enc, c.lvl, fxOf(k));
    const owned = save.cars[enc.car]?.owned;
    const body = $("radarBody");
    body.className = "";
    const loot = [`<span style="color:#8fd0ff">+${rw.xp} XP</span>`];
    if (rw.cash) loot.push(`<span style="color:var(--grn)">${fmt$(rw.cash)}</span>`);
    if (rw.car) loot.push(`<span style="color:${R.col}">🔑 ${owned ? "Ersatzteile" : "Sieg = sein " + CAR_DEFS[enc.car].name}</span>`);
    if (enc.rar === "grey") loot.push(`<span class="mut">kein Preisgeld</span>`);
    const revanche = enc.tries > 0;
    body.innerHTML = `<div class="vs r-${enc.rar}">
      <div class="vs-bg"></div>
      <div class="vs-opp"><img class="vs-portrait" src="assets/drivers/${d.id}.jpg" alt="">
        <div class="vs-oinfo">${nameplate(d, enc.lvl)}
          <div class="vs-q">«${esc(d.q)}»</div>
          ${enc.boss ? `<div class="vs-boss">⚡ ${esc(enc.boss)}</div>` : ""}
          <div class="vs-q" style="font-style:normal;font-size:11.5px;color:#aeb3c2">fährt ${CAR_DEFS[enc.car].name} · ${clsChip(enc.car)}</div>
          <img id="vsOppCar" class="vs-ocar" alt=""></div></div>
      <div class="vs-mid">VS</div>
      <div class="vs-me"><div class="np"><span>${lvBadge(c.lvl, carRarity(k))}</span><div class="np-t" style="--rc:${RARITY[carRarity(k)].col}"><b>${esc(CAR_DEFS[k].name)}</b><small>${esc(save.name !== "RACER" ? save.name : "Du")} · ${CLASSES[carClass(k)].name}</small></div></div>
        <img id="vsMyCar" alt=""></div>
      <div class="vs-loot">${loot.join("")}</div>
      <div class="vs-btns"><button class="mbtn primary go" id="vsGo">${revanche ? "REVANCHE!" : "FAHREN!"}</button>
        <button class="mbtn dodge" id="vsDodge">${revanche ? "Aufgeben — neuer Gegner" : `Ausweichen · ${fmt$(dodgePrice(enc))}`}</button></div>
    </div>`;
    if (fresh) setTimeout(() => AudioSys.vsSlam(), 450);
    carImage(k, c.style, true).then(im => { const x = $("vsMyCar"); if (x) x.src = im.src; });
    carImage(enc.car, oppStyle(enc), true).then(im => { const x = $("vsOppCar"); if (x) x.src = im.src; });
    $("vsGo").onclick = () => startEncounter(save.enc);
    $("vsDodge").onclick = () => {
      if (!revanche){
        const p = dodgePrice(enc);
        if (save.money < p) return toast(`Ausweichen kostet ${fmt$(p)} — fahr lieber!`);
        save.money -= p; updateCash();
      }
      save.enc = null; persist(); rollEncounter();
    };
  }

  // ── Rennen ──
  let lastRace = null;
  function startEncounter(enc){
    const d = DRIVER(enc.id);
    startRace({ mode:"enc", enc, name: d.name, car: enc.car, rar: enc.rar, lvl: enc.lvl, style: oppStyle(enc) });
  }
  // Testfahrt: grüner Gegner auf deinem Level, ohne Belohnung — zum Abstimmen
  function startTest(){
    if (!save.current) return show("starter");
    const enc = makeEncounter(curLvl(), Math.random, { rarity: "green" });
    startRace({ mode:"test", enc, name: "TESTFAHRER", car: enc.car, rar: "green", lvl: enc.lvl, style: oppStyle(enc) });
  }
  function startRace(opp){
    if (!save.current) return show("starter");
    lastRace = { opp };
    SCREENS.forEach(s => { const el = $(s); if (el) el.classList.remove("on"); });
    hideLevelUp();
    $("hud").classList.add("on");
    $("hud").classList.remove("duo");
    const c = cur();
    const myEt = carSimET(save.current, c);
    const col = RARITY[opp.rar]?.col ?? "#aeb3c2";
    $("hudVs").innerHTML = `<span style="color:${col}">LV ${opp.lvl ?? "?"} · ${esc(opp.name)}</span>`
      + `<small>Du LV ${c.lvl} ≈ ${myEt.toFixed(2)}s${opp.mode === "test" ? " · Testfahrt" : ""}</small>`;
    Race.start({ carKey: save.current, carState: c, opp,
      onEvent: raceEvent,
      onDone: res => showResults(res, opp) });
  }
  function raceEvent(ev){
    if (ev.launch) syncKnob();
    if (ev.shift){
      syncKnob();
      if (ev.shift === "PERFECT"){ pShift.classList.add("flash"); setTimeout(() => pShift.classList.remove("flash"), 300); }
      window.NativeBridge?.haptic?.(ev.shift === "PERFECT" ? "medium" : "light");
    }
  }
  function driveTip(res){
    if (res.et === Infinity) return "Gas halten, sobald die Ampel GRÜN wird — dann zählt's.";
    if (!res.launchQ && res.rt != null && res.rt > 0.3) return "Start: Gas exakt bei GRÜN geben — schnelle Reaktion = Boost.";
    if (!res.launchQ) return "Start: Nadel vor Grün in der GRÜNEN ZONE halten = PERFECT LAUNCH.";
    if ((res.perfects || 0) < 2) return "Schalten, wenn die Nadel im grünen Bogen steht = PERFECT +Boost.";
    return "NOS früh drücken und halten — volle Flasche bringt am meisten.";
  }
  // Nächstes bezahlbares Teil (Tipp nach Niederlage)
  function nextPart(){
    const k = save.current, c = cur(); let best = null;
    for (const u of UPGRADES){
      const st = (c.up[u.k] | 0) + 1; if (st > u.max) continue;
      const L = partUnlockLvl(u.k, st); if (L > c.lvl) continue;
      const cost = partCost(u.k, st);
      const et = carSimET(k, { ...c, up: { ...c.up, [u.k]: st } }), gain = carSimET(k, c) - et;
      if (!best || gain / cost > best.gain / best.cost) best = { u, st, cost, gain };
    }
    return best;
  }

  // ── Ergebnis: Beute, XP-Balken, Level-Up ──
  function setResButtons(primary, secondary){
    const box = $("resBtns");
    box.innerHTML = "";
    const mk = (b, cls) => { const x = document.createElement("button"); x.className = "mbtn " + cls; x.textContent = b.label; x.onclick = b.go; return x; };
    box.appendChild(mk(primary, "primary resmain"));
    const row = document.createElement("div"); row.className = "resrow";
    secondary.forEach(b => row.appendChild(mk(b, "")));
    box.appendChild(row);
  }
  function showResults(res, opp){
    $("hud").classList.remove("on");
    const k = save.current, c = cur(), enc = opp.enc, d = DRIVER(enc.id);
    const lvBefore = c.lvl, xpBefore = c.xp;
    let rw = { xp: 0, cash: 0, car: null }, gain = { total: 0, bonus: 0, gained: [] }, carDrop = null, spare = 0;
    if (res.et !== Infinity && (c.bestEt == null || res.et < c.bestEt)) c.bestEt = res.et;
    if (opp.mode === "enc"){
      save.stats.races++;
      if (res.win){
        rw = encounterReward(enc, c.lvl, fxOf(k));
        if ((res.perfects || 0) >= 3) rw.xp = Math.round(rw.xp * 1.1);
        gain = giveXp(k, rw.xp);
        save.money += rw.cash;
        if (rw.car){
          if (!save.cars[rw.car].owned){ Object.assign(save.cars[rw.car], { owned: true, lvl: 1, xp: 0, tal: {}, style: { ...save.cars[rw.car].style, ...oppStyle(enc), drop: 6 } }); carDrop = rw.car; }
          else { spare = Math.round(rarCash(enc.lvl) * 2 / 10) * 10; save.money += spare; }
        }
        save.stats.wins++; save.stats.rar[enc.rar] = (save.stats.rar[enc.rar] || 0) + 1;
        c.wins = (c.wins || 0) + 1; save.seen[enc.id] = true;
        save.enc = null;
      } else {
        save.enc.tries = (save.enc.tries || 0) + 1;
        if (RARITIES.indexOf(enc.rar) < 2 || save.enc.tries >= 2) save.enc = null;   // ab Blau: 1× Revanche
      }
    }
    persist();
    const R = RARITY[enc.rar];
    $("resHead").innerHTML = opp.mode === "enc" ? nameplate(d, enc.lvl) : "";
    $("resTitle").textContent = res.win ? (enc.rar === "legend" ? "LEGENDE BESIEGT!" : enc.rar === "epic" ? "BOSS BESIEGT!" : "SIEG!") : "VERLOREN";
    $("resTitle").className = "big " + (res.win ? "win" : "lose");
    if (res.win && RARITIES.indexOf(enc.rar) >= 2){ $("resTitle").style.color = R.col; $("resTitle").style.textShadow = `0 0 40px ${R.glow}`; }
    else { $("resTitle").style.color = ""; $("resTitle").style.textShadow = ""; }
    $("resSub").textContent = opp.mode === "test" ? "Testfahrt · keine Belohnung"
      : res.win ? `«${d.q}» — nicht heute.` : `${d.name}: «${["Zu langsam, Kleiner.","War das alles?","Komm wieder, wenn du bereit bist.","Nächstes Mal vielleicht."][Math.floor(Math.random()*4)]}»`;
    $("resGrid").innerHTML = `
      <div><b id="cEt">0.000s</b><span>Deine Zeit</span></div>
      <div><b>${res.oppEt == null ? "—" : res.oppEt.toFixed(3) + "s"}</b><span>${esc(opp.name)}</span></div>
      <div><b>${Math.round(res.trap)} km/h</b><span>Trap Speed</span></div>
      <div><b>${res.rt == null ? "—" : res.rt.toFixed(3) + "s"}</b><span>Reaktion</span></div>`;
    // XP-Balken: vom alten Stand zum neuen (über Level-Grenzen hinweg)
    const xb = $("resXpBox");
    if (opp.mode === "enc" && lvBefore < MAX_LVL){
      xb.innerHTML = `<div class="xpl">${lvBadge(lvBefore, carRarity(k), true)}<div style="flex:1">${xpBarHTML({ lvl: lvBefore, xp: xpBefore }, false, xpBefore / xpNeed(lvBefore))}</div></div>`;
      setTimeout(() => {
        const f = xb.querySelector(".fill"); if (!f) return;
        if (gain.gained.length){ f.style.width = "100%"; setTimeout(() => { xb.innerHTML = `<div class="xpl">${lvBadge(c.lvl, carRarity(k), true)}<div style="flex:1">${xpBarHTML(c, false, 0)}</div></div>`;
          setTimeout(() => { const f2 = xb.querySelector(".fill"); if (f2) f2.style.width = (c.lvl >= MAX_LVL ? 100 : 100 * c.xp / xpNeed(c.lvl)) + "%"; }, 60); }, 950); }
        else f.style.width = (100 * c.xp / xpNeed(c.lvl)) + "%";
      }, 450);
    } else xb.innerHTML = "";
    // Beute
    const L = [];
    if (res.win && opp.mode === "enc"){
      L.push(`<div class="loot"><i>✦</i><div>+${gain.total} XP${gain.bonus ? ` <small>davon +${gain.bonus} ausgeruht</small>` : ""}</div></div>`);
      if (rw.cash) L.push(`<div class="loot" style="animation-delay:.15s"><i>💵</i><div style="color:var(--grn)">+${fmt$(rw.cash)}</div></div>`);
      else L.push(`<div class="loot" style="animation-delay:.15s"><i>·</i><div class="mut">Grau zahlt kein Preisgeld <small>ab Grün gibt's Cash</small></div></div>`);
      if (spare) L.push(`<div class="loot" style="animation-delay:.3s"><i>🔧</i><div>Ersatzteile: +${fmt$(spare)} <small>${CAR_DEFS[enc.car].name} hast du schon</small></div></div>`);
      if (carDrop) L.push(`<div class="loot car r-${enc.rar}" style="animation-delay:.5s"><span class="rarlbl">${R.n} · Neues Auto</span><img id="dropImg" alt=""><b style="font-size:17px;font-style:italic">${CAR_DEFS[carDrop].name}</b><small>startet auf Level 1 · ${CLASSES[carClass(carDrop)].name}</small></div>`);
    } else if (opp.mode === "enc"){
      const t = nextPart();
      L.push(`<div class="loot"><i>💡</i><div>${driveTip(res)}</div></div>`);
      if (t) L.push(`<div class="loot"><i>🔧</i><div>${t.u.n} Stufe ${t.st} — ${fmt$(t.cost)} <small>bringt ≈ −${Math.max(0.01, t.gain).toFixed(2)}s · in der Garage</small></div></div>`);
      if (save.enc) L.push(`<div class="loot r-${enc.rar}" style="border:1px solid var(--rc)"><i>↺</i><div>Eine Revanche gegen ${esc(d.name)} bleibt dir.</div></div>`);
    }
    $("resLoot").innerHTML = L.join("");
    $("resTip").style.display = "none";
    if (carDrop) carImage(carDrop, save.cars[carDrop].style, true).then(im => { const x = $("dropImg"); if (x) x.src = im.src; });
    show("results");
    if (res.et === Infinity) $("cEt").textContent = "—";
    else countUp("cEt", res.et, v => v.toFixed(3) + "s", 900);
    if (res.win && opp.mode === "enc") setTimeout(() => AudioSys.loot(!!carDrop), 500);
    if (gain.gained.length) setTimeout(() => levelUp(k, gain.gained), carDrop ? 2600 : 1700);
    const menuB = { label: "Menü", go: () => show("menu") };
    const garB  = { label: "Garage", go: () => { gTab = "up"; markTab(); show("garage"); } };
    if (opp.mode === "test") setResButtons({ label: "↺ Nochmal", go: startTest }, [garB, menuB]);
    else if (!res.win && save.enc) setResButtons({ label: "↺ Revanche", go: () => startEncounter(save.enc) }, [{ label: "Neuer Gegner", go: () => { save.enc = null; persist(); openRadar(); } }, garB]);
    else setResButtons({ label: "Weiter suchen ▶", go: openRadar }, [garB, menuB]);
  }
  function countUp(id, end, fmt, dur){
    const el = $(id); if (!el) return;
    const t0 = performance.now();
    const step = t => { const p = Math.min(1, (t - t0) / dur), v = end * (1 - Math.pow(1 - p, 3)); el.textContent = fmt(v); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  // Level-Up: goldene Lichtsäule, alle Freischaltungen der gewonnenen Level
  function levelUp(k, levels){
    const L = levels[levels.length - 1];
    $("lvlupNum").textContent = L;
    $("lvlupCar").textContent = CAR_DEFS[k].name;
    const items = levels.flatMap(l => levelRewards(l).map(r => ({ ...r, l })));
    $("lvlupUnlocks").innerHTML = items.slice(0, 6).map((r, i) => `<div style="animation-delay:${0.25 + i*0.12}s">${r.type === "talent" ? "★" : r.type === "part" ? "🔧" : r.type === "title" ? "👑" : "🎨"} <b>${esc(r.t)}</b>${levels.length > 1 ? ` <span class="mut">LV ${r.l}</span>` : ""}</div>`).join("")
      || `<div>Weiter so — das nächste Teil wartet.</div>`;
    $("lvlup").classList.add("on");
    AudioSys.levelUp();
    window.NativeBridge?.haptic?.("heavy");
  }
  function hideLevelUp(){ $("lvlup")?.classList.remove("on"); }
  $("lvlupOk").addEventListener("click", hideLevelUp);
  function toast(msg){
    const t = $("toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2800);
  }

  // ══ Garage ═════════════════════════════════════════════════════════════════
  let gTab = "up", talTree = null, talSel = null;
  let stylePreview = {};
  $("gTabs").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    gTab = b.dataset.t; stylePreview = {};
    markTab(); renderGarageBody(); refreshPreview();
  });
  function markTab(){ document.querySelectorAll("#gTabs button").forEach(x => x.classList.toggle("on", x.dataset.t === gTab)); }
  async function renderGarage(){ stylePreview = {}; markTab(); renderGarageBody(); await refreshPreview(); }
  let pvBusy = null, pvAgain = false;
  function refreshPreview(){
    if (pvBusy){ pvAgain = true; return pvBusy; }
    pvBusy = (async () => { do { pvAgain = false; await refreshPreviewNow(); } while (pvAgain); })().finally(() => { pvBusy = null; });
    return pvBusy;
  }
  async function refreshPreviewNow(){
    const k = save.current, c = cur(), rar = carRarity(k);
    const stl = { ...c.style, ...stylePreview };
    const img = await carImage(k, stl, true);
    const el = $("gCar");
    el.src = img.src;
    el.parentElement?.classList.toggle("probe", Object.keys(stylePreview).length > 0);
    el.style.filter = `drop-shadow(0 18px 22px rgba(0,0,0,.55)) drop-shadow(0 4px 30px ${RARITY[rar].glow})`;
    $("gCarName").innerHTML = `<div class="gnp">${lvBadge(c.lvl, rar, true)}<b style="color:${RARITY[rar].col}">${CAR_DEFS[k].name}</b>${clsChip(k)}
      <span class="mut" style="font-size:11px">≈ ${carSimET(k, c).toFixed(2)}s</span></div>${xpBarHTML(c, false)}`;
  }
  function celebrate(){
    const w = $("gCar")?.parentElement; if (!w) return;
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
  function div(cls, html){ const d = document.createElement("div"); d.className = cls; d.innerHTML = html; return d; }

  function renderGarageBody(){
    const el = $("gBody");
    el.innerHTML = "";
    if (!save.current) return;
    ({ up: tabParts, tal: tabTalents, style: tabStyle, tune: tabTune, cars: tabCars })[gTab]?.(el);
  }

  // ── Teile (nach Auto-Level freigeschaltet, mit Cash gekauft) ──
  function tabParts(el){
    const k = save.current, c = cur(), def = CAR_DEFS[k];
    const etNow = carSimET(k, c), specNow = buildSpec(k, c);
    const card = div("card", `<h3>Tuning-Teile · ≈ ${etNow.toFixed(2)}s</h3>`);
    UPGRADES.forEach(u => {
      const lv = c.up[u.k] | 0, st = lv + 1, maxed = lv >= u.max;
      const L = maxed ? 0 : partUnlockLvl(u.k, st), cost = maxed ? 0 : partCost(u.k, st), locked = !maxed && L > c.lvl;
      let gainTxt = "";
      if (!maxed && !locked){
        const c2 = { ...c, up: { ...c.up, [u.k]: st } }, s2 = buildSpec(k, c2), dEt = etNow - carSimET(k, c2);
        const t = dEt > 0.005 ? ` · <strong>−${dEt.toFixed(2)}s</strong>` : "";
        gainTxt = u.k === "engine" || u.k === "turbo" ? `${carPS(def, specNow.powerMul)} → <strong>${carPS(def, s2.powerMul)} PS</strong>${t}`
          : u.k === "weight" ? `${specNow.mass} → <strong>${s2.mass} kg</strong>${t}`
          : u.k === "trans" ? `Schaltzeit ${specNow.shiftTime.toFixed(3)} → <strong>${s2.shiftTime.toFixed(3)}s</strong>${t}`
          : u.k === "tires" ? `Grip +${Math.round((s2.mu/specNow.mu - 1)*100)}%${t}`
          : `${specNow.nosMax.toFixed(1)} → <strong>${s2.nosMax.toFixed(1)}s NOS</strong>${t}`;
      }
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? "on" : partUnlockLvl(u.k, i+1) > c.lvl ? "lk" : ""}"></i>`).join("");
      const row = div("row", `<div class="nm"><b>${u.n} <span class="mut" style="font-size:11px">${lv}/${u.max}</span></b><span>${u.d}</span>
          ${gainTxt ? `<span style="color:var(--grn);font-weight:700;font-size:12px;font-variant-numeric:tabular-nums">${gainTxt}</span>` : ""}
          ${locked ? `<span style="color:#8fb6ff;font-weight:800;font-size:11.5px">Stufe ${st} ab Auto-Level ${L}</span>` : ""}</div>
        <div class="pips">${pips}</div>
        <button class="buy ${maxed ? "owned" : locked ? "lockd" : save.money >= cost ? "can" : ""}">${maxed ? "MAX" : locked ? "🔒 LV " + L : fmt$(cost)}</button>`);
      if (!maxed && !locked) row.querySelector("button").addEventListener("click", () => {
        if (save.money < cost) return toast(`Noch ${fmt$(cost - save.money)} — fahr grüne Gegner für Cash!`);
        save.money -= cost; c.up[u.k] = st; persist();
        AudioSys.beep(760, .12, .3); renderGarageBody(); refreshPreview().then(celebrate); updateCash();
      });
      card.appendChild(row);
    });
    el.appendChild(card);
    // Nächste Freischaltungen
    const nx = [];
    for (let L = c.lvl + 1; L <= MAX_LVL && nx.length < 4; L++) levelRewards(L).filter(r => r.type !== "talent").forEach(r => nx.length < 4 && nx.push(`<div class="row" style="padding:7px 0"><b class="lvb sm r-${carRarity(k)}"><i>${L}</i></b><div class="nm"><b style="font-size:13px">${esc(r.t)}</b></div></div>`));
    if (nx.length) el.appendChild(div("card", `<h3>Als Nächstes</h3>${nx.join("")}`));
    const spec = buildSpec(k, c), peak = Math.round(Math.max(...def.torque.map(t => t[1])) * spec.powerMul);
    el.appendChild(div("card", `<h3>Datenblatt</h3><div class="resgrid">
      <div><b>${carPS(def, spec.powerMul)} PS</b><span>Leistung</span></div>
      <div><b>${peak} Nm</b><span>Drehmoment</span></div>
      <div><b>${spec.mass} kg</b><span>Gewicht</span></div>
      <div><b>${spec.nosMax.toFixed(1)} s</b><span>NOS</span></div>
      <div><b>${Math.round((def.zone ?? 530) * spec.zoneMul)} rpm</b><span>Grüne Schaltzone</span></div>
      <div><b>${c.bestEt ? c.bestEt.toFixed(3) + "s" : "—"}</b><span>Bestzeit ¼</span></div>
    </div>`));
  }

  // ── Talentbaum (ab LV 10, 1 Punkt pro Level) ──
  function tabTalents(el){
    const k = save.current, c = cur(), cls = carClass(k), C = CLASSES[cls];
    const pts = talentPoints(c.lvl), spent = talentSpent(c.tal), free = pts - spent;
    talTree ??= cls;
    el.appendChild(div("card", `<div class="passive" style="--c:${C.col}"><div class="ic">${C.icon}</div><div><b>Klassen-Fähigkeit · ${C.passive.n}</b><span>${C.passive.d} — immer aktiv. Das Meister-Talent deiner Schule (${TALENTS[cls].n}) wirkt 1.5×.</span></div></div>`));
    const head = div("card", `<div class="tpts"><div><h3 style="margin:0">Talentpunkte</h3><span class="mut" style="font-size:12px">${c.lvl < 10 ? `Talentbaum öffnet auf Level 10 (noch ${10 - c.lvl})` : `${spent} von ${pts} verteilt · 1 Punkt pro Level`}</span></div><b>${free}</b></div>`);
    if (spent > 0){
      const cost = 300 * c.lvl;
      const rb = document.createElement("button"); rb.className = "buy"; rb.style.cssText = "width:100%;margin-top:10px;font-size:12px";
      rb.textContent = `Talente zurücksetzen · ${fmt$(cost)}`;
      rb.onclick = () => {
        if (save.money < cost) return toast(`Zurücksetzen kostet ${fmt$(cost)}`);
        if (!confirm("Alle Talentpunkte dieses Autos zurücksetzen?")) return;
        save.money -= cost; c.tal = {}; talSel = null; persist(); updateCash(); renderGarageBody(); refreshPreview();
      };
      head.appendChild(rb);
    }
    el.appendChild(head);
    const card = div("card", "");
    const tabs = div("ttabs", Object.entries(TALENTS).map(([id, T]) =>
      `<button data-tr="${id}" class="${id === talTree ? "on" : ""}" style="--c:${T.col}">${T.n}<small>${treeSpent(c.tal, id)} Pkt</small></button>`).join(""));
    tabs.onclick = e => { const b = e.target.closest("button"); if (!b) return; talTree = b.dataset.tr; talSel = null; renderGarageBody(); };
    card.appendChild(tabs);
    const T = TALENTS[talTree];
    card.appendChild(div("", `<p class="mut" style="font-size:12px;text-align:center;margin:4px 0 0">${T.sub}${talTree === cls ? " · <b style='color:" + T.col + "'>deine Schule</b>" : ""}</p>`));
    const tree = div("tree", "");
    tree.style.setProperty("--c", T.col);
    const inTree = treeSpent(c.tal, talTree);
    for (let tier = 0; tier <= 4; tier++){
      const nodes = T.nodes.filter(n => n.t === tier); if (!nodes.length) continue;
      const row = div("trow", tier ? `<span class="req">${tier*TIER_REQ} Pkt</span>` : "");
      nodes.forEach(n => {
        const r = c.tal[n.id] || 0, av = c.lvl >= 10 && inTree >= n.t*TIER_REQ;
        const b = document.createElement("button");
        b.className = `tn${av ? " av" : ""}${r ? " has" : ""}${r >= n.max ? " full" : ""}${n.cap ? " cap" : ""}${talSel === n.id ? " sel" : ""}`;
        b.innerHTML = `<span class="tic">${n.cap ? "★" : n.n[0]}</span><i class="rk">${r}/${n.max}</i><span>${esc(n.n)}</span>`;
        b.onclick = () => { talSel = n.id; renderGarageBody(); };
        row.appendChild(b);
      });
      tree.appendChild(row);
    }
    card.appendChild(tree);
    if (talSel){
      const n = TALENT_BY_ID[talSel], r = c.tal[n.id] || 0, ok = canLearn(c.tal, n.id, c.lvl);
      const why = r >= n.max ? "Voll ausgebaut" : c.lvl < 10 ? "Ab Level 10" : free <= 0 ? "Keine Punkte frei — nächstes Level!" : `Braucht ${n.t*TIER_REQ} Punkte in ${TALENTS[n.tree].n}`;
      const det = div("tdet", `<b style="color:${T.col}">${esc(n.n)}</b> <span class="mut">Rang ${r}/${n.max}</span>
        <p>${esc(n.d)}${n.max > 1 ? " — pro Rang" : ""}${n.cap && n.tree === cls ? " · <b style='color:var(--gold)'>×1.5 (deine Schule)</b>" : ""}</p>`);
      const lb = document.createElement("button");
      lb.className = "mbtn " + (ok ? "primary" : ""); lb.style.width = "100%";
      lb.textContent = ok ? `Lernen (+1) · ${free} frei` : why;
      lb.disabled = !ok;
      lb.onclick = () => {
        if (!canLearn(c.tal, n.id, c.lvl)) return;
        c.tal[n.id] = r + 1; persist();
        AudioSys.tone(880, 0.2, { gain: 0.15 }); AudioSys.tone(1320, 0.3, { gain: 0.1, at: 0.06 });
        renderGarageBody(); refreshPreview();
      };
      det.appendChild(lb);
      card.appendChild(det);
    } else card.appendChild(div("", `<p class="mut" style="font-size:12px;text-align:center">Tippe ein Talent an.</p>`));
    el.appendChild(card);
  }

  // ── Style: Lack-Bibliothek, Streifen, Sticker, Felgen, Fahrwerk, Kits, Neon ──
  function owns(c, key){ return !!c.styleOwned?.[key]; }
  function styleLock(c, key){ return c.lvl < styleUnlockLvl(key); }
  function buyStyle(c, key, label, apply){
    const price = stylePrice(key);
    if (styleLock(c, key)) return toast(`${label}: ab Auto-Level ${styleUnlockLvl(key)}`);
    if (save.money < price) return toast(`Zu wenig Cash — ${fmt$(price)} nötig. Fahr grüne Gegner!`);
    save.money -= price; c.styleOwned ??= {}; c.styleOwned[key] = true;
    apply?.(); persist(); updateCash(); AudioSys.loot();
    stylePreview = {}; renderGarageBody(); refreshPreview().then(celebrate);
    toast(`${label} ✓ −${fmt$(price)}`);
  }
  function probeBar(html, key, label, onBuy){
    const c = cur(), price = stylePrice(key), lk = styleLock(c, key);
    const bar = div("buybar", `<span>${html}</span>`);
    const b = document.createElement("button");
    b.className = "buy" + (!lk && save.money >= price ? " can" : "");
    b.textContent = lk ? `🔒 LV ${styleUnlockLvl(key)}` : `${label} ${fmt$(price)}`;
    b.addEventListener("click", onBuy);
    const no = document.createElement("button"); no.className = "dismiss"; no.textContent = "✕";
    no.addEventListener("click", () => { stylePreview = {}; renderGarageBody(); refreshPreview(); });
    bar.appendChild(b); bar.appendChild(no);
    return bar;
  }
  function tabStyle(el){
    const k = save.current, c = cur(), st = c.style;
    c.styleOwned ??= {};
    const sv = (key, def) => stylePreview[key] ?? st[key] ?? def;
    // Lack
    const card = div("card", "<h3>Lackierung</h3>");
    const groups = [["solid","Unifarben","paint"],["pro","Metallic & Perl","paintPro"],["leg","Chrom, Candy & Chamäleon","paintLeg"]];
    const pNow = sv("paint", null);
    groups.forEach(([g, label, key]) => {
      const lk = styleLock(c, key);
      card.appendChild(div("sgrp", `${label}${owns(c, key) ? " ✓" : lk ? ` · 🔒 LV ${styleUnlockLvl(key)}` : ` · ${fmt$(stylePrice(key))}`}`));
      const row = div("swatches", "");
      PAINT_LIB.filter(p => p[2] === g).forEach(p => {
        const b = document.createElement("button");
        const col = `hsl(${p[3]} ${p[4]*100}% ${p[5]*100}%)`;
        b.className = "sw" + (p[6] !== "solid" ? " fin" : "") + (pNow === p[0] ? " sel" : "");
        b.style.background = col; b.style.setProperty("--swc", col);
        if (p[6] === "chrome") b.style.background = "linear-gradient(135deg,#fff,#7d848f 45%,#e8ecf2 60%,#5a616c)";
        if (p[6] === "chameleon") b.style.background = "linear-gradient(135deg,#7a2cff,#00c2ff,#2bff9a)";
        b.setAttribute("aria-label", p[1]); b.title = p[1];
        if (lk) b.style.opacity = ".35";
        b.onclick = () => {
          if (lk) return toast(`${label}: ab Auto-Level ${styleUnlockLvl(key)}`);
          if (owns(c, key)){ st.paint = p[0]; st.hue = p[3]; delete stylePreview.paint; persist(); }
          else stylePreview.paint = p[0];
          renderGarageBody(); refreshPreview();
        };
        row.appendChild(b);
      });
      card.appendChild(row);
    });
    if (stylePreview.paint){
      const P = PAINT_BY_ID[stylePreview.paint], key = groups.find(g => g[0] === P[2])[2];
      card.appendChild(probeBar(`<b>${P[1]}</b> — einmal zahlen, danach alle Farben dieser Gruppe gratis`, key, "Lackieren",
        () => buyStyle(c, key, "Lackierung", () => { st.paint = P[0]; st.hue = P[3]; })));
    }
    el.appendChild(card);
    // Streifen
    const sc = div("card", `<h3>Streifen</h3>`);
    const sLk = styleLock(c, "stripes");
    if (sLk) sc.appendChild(div("stylehint", `<span class="mut">🔒 Ab Auto-Level ${styleUnlockLvl("stripes")}</span>`));
    else {
      const seg = div("seg", STRIPES.map((n, i) => `<button class="${sv("stripe", 0) === i ? "on" : ""}" data-i="${i}">${n}</button>`).join(""));
      seg.onclick = e => { const b = e.target.closest("button"); if (!b) return; const i = +b.dataset.i;
        if (owns(c, "stripes")){ st.stripe = i; delete stylePreview.stripe; persist(); } else stylePreview.stripe = i;
        renderGarageBody(); refreshPreview(); };
      seg.style.flexWrap = "wrap"; sc.appendChild(seg);
      const cols = ["white","black","racing","yellow","blue","gold","orange","lime"];
      const crow = div("swatches", ""); crow.style.marginTop = "10px";
      cols.forEach(id => { const P = PAINT_BY_ID[id], b = document.createElement("button");
        b.className = "sw" + (sv("stripeCol", "white") === id ? " sel" : ""); b.style.background = `hsl(${P[3]} ${P[4]*100}% ${P[5]*100}%)`; b.title = P[1];
        b.onclick = () => { if (owns(c, "stripes")){ st.stripeCol = id; persist(); } else stylePreview.stripeCol = id; renderGarageBody(); refreshPreview(); };
        crow.appendChild(b); });
      sc.appendChild(crow);
      if (!owns(c, "stripes") && (stylePreview.stripe || stylePreview.stripeCol))
        sc.appendChild(probeBar(`Streifen-Kit — alle Muster und Farben`, "stripes", "Kaufen",
          () => buyStyle(c, "stripes", "Streifen-Kit", () => { if (stylePreview.stripe != null) st.stripe = stylePreview.stripe; if (stylePreview.stripeCol) st.stripeCol = stylePreview.stripeCol; })));
    }
    el.appendChild(sc);
    // Sticker (3 Plätze; Sets nach Level)
    const kc = div("card", `<h3>Sticker</h3>`);
    const stk = (stylePreview.stk ?? st.stk ?? [null, null, null]).slice();
    const setOwned = n => owns(c, "sticker" + n), setLk = n => styleLock(c, "sticker" + n);
    ["Tür","Hinten","Vorne"].forEach((slot, si) => {
      kc.appendChild(div("sgrp", slot));
      const g = div("stk", "");
      const none = document.createElement("button"); none.textContent = "OHNE"; none.className = !stk[si] ? "on" : "";
      none.onclick = () => { stk[si] = null; if (STICKERS.every(s => !stk.includes(s.id) || setOwned(s.set))){ st.stk = stk; delete stylePreview.stk; persist(); } else stylePreview.stk = stk; renderGarageBody(); refreshPreview(); };
      g.appendChild(none);
      STICKERS.forEach(s => {
        const b = document.createElement("button");
        b.className = stk[si] === s.id ? "on" : "";
        const lk = setLk(s.set);
        if (lk){ b.textContent = `🔒 ${styleUnlockLvl("sticker" + s.set)}`; b.style.opacity = ".45"; }
        else { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 104; const x = cv.getContext("2d");
          x.fillStyle = "#3a3a46"; x.fillRect(0, 0, 128, 104); drawSticker(x, s.id, 64, 52, 80); b.appendChild(cv); }
        b.title = s.n;
        b.onclick = () => {
          if (lk) return toast(`Sticker-Set ab Auto-Level ${styleUnlockLvl("sticker" + s.set)}`);
          stk[si] = s.id;
          if (setOwned(s.set)){ st.stk = stk; delete stylePreview.stk; persist(); } else stylePreview.stk = stk;
          renderGarageBody(); refreshPreview();
        };
        g.appendChild(b);
      });
      kc.appendChild(g);
    });
    if (stylePreview.stk){
      const need = [...new Set(stylePreview.stk.filter(Boolean).map(id => STICKERS.find(s => s.id === id).set))].filter(n => !setOwned(n));
      if (need.length){ const n = need[0];
        kc.appendChild(probeBar(`Sticker-Set ${["","«Street»","«Tuner»","«Legends»","«Elite»"][n]}`, "sticker" + n, "Kaufen",
          () => buyStyle(c, "sticker" + n, "Sticker-Set", () => { if (need.length === 1) st.stk = stylePreview.stk; }))); }
    }
    el.appendChild(kc);
    // Fahrwerk
    const fc = div("card", "<h3>Fahrwerk</h3>");
    fc.appendChild(slider("Tieferlegung", sv("drop", 6), 0, 22, 1, v => {
      if (owns(c, "stance")){ st.drop = v; persist(); refreshPreview(); return; }
      const was = stylePreview.drop != null; stylePreview.drop = v; refreshPreview(); if (!was) renderGarageBody();
    }, v => v + " mm"));
    if (!owns(c, "stance") && stylePreview.drop != null)
      fc.appendChild(probeBar(`Gewindefahrwerk — Höhe danach frei`, "stance", "Einbauen", () => buyStyle(c, "stance", "Gewindefahrwerk", () => { st.drop = stylePreview.drop; })));
    el.appendChild(fc);
    // Teile mit Varianten
    const seg = (title, key, opts, keys) => {
      const card = div("card", `<h3>${title}</h3>`);
      const now = sv(key, 0);
      const s = div("seg", opts.map((o, i) => {
        const sk = keys[i], lk = sk && styleLock(c, sk), own = !sk || owns(c, sk);
        return `<button data-i="${i}" class="${now === i ? (own ? "on" : "prev") : ""}${lk ? " lockopt" : ""}">${lk ? `🔒 LV ${styleUnlockLvl(sk)}` : own ? o : `${o}<br><b style="color:var(--grn)">${fmt$(stylePrice(sk))}</b>`}</button>`;
      }).join(""));
      s.onclick = e => { const b = e.target.closest("button"); if (!b) return; const i = +b.dataset.i, sk = keys[i];
        if (sk && styleLock(c, sk)) return toast(`Ab Auto-Level ${styleUnlockLvl(sk)}`);
        if (key === "exhaust"){ AudioSys.unlock(); AudioSys.shiftPop(Math.min(i, 3)); }
        if (!sk || owns(c, sk)){ st[key] = i; delete stylePreview[key]; persist(); } else stylePreview[key] = i;
        renderGarageBody(); refreshPreview(); };
      card.appendChild(s);
      const pi = stylePreview[key];
      if (pi != null && keys[pi] && !owns(c, keys[pi])) card.appendChild(probeBar(`Vorschau: <b>${opts[pi]}</b>`, keys[pi], "Kaufen", () => buyStyle(c, keys[pi], opts[pi], () => { st[key] = pi; })));
      el.appendChild(card);
    };
    seg("Felgen", "rim", ["Sport","Mesh Gold","Turbofan","Racing Weiss"], [null,"rim1","rim2","rim3"]);
    seg("Auspuffanlage", "exhaust", ["Serie","Duplex","Big Bore","Sidepipe"], [null,"exhaust1","exhaust2","exhaust3"]);
    if (!window.CAR_SPRITES?.[k]?.wing) seg("Spoiler", "spoiler", ["Ohne","Lip","GT-Wing"], [null,"spoiler1","spoiler2"]);
    seg("Bodykit", "kit", ["Ohne","Street","Widebody"], [null,"kit1","kit2"]);
    // Neon
    const NEONS = [[null,"Aus"],[0,"Rot"],[28,"Orange"],[55,"Gelb"],[120,"Grün"],[180,"Cyan"],[210,"Blau"],[270,"Violett"],[305,"Magenta"]];
    const nc = div("card", "<h3>Neon-Unterboden</h3>");
    if (styleLock(c, "neon1")) nc.appendChild(div("stylehint", `<span class="mut">🔒 Ab Auto-Level ${styleUnlockLvl("neon1")}</span>`));
    else {
      const on = sv("neon", 0), nh = sv("neonHue", st.hue);
      const row = div("swatches", "");
      NEONS.forEach(([h, name]) => { const b = document.createElement("button"); const col = h == null ? "" : `hsl(${h} 100% 60%)`;
        b.className = "sw" + (h != null ? " neon" : " off") + ((h == null ? !on : on && h === nh) ? " sel" : "");
        if (h == null) b.textContent = "AUS"; else { b.style.background = col; b.style.setProperty("--swc", col); }
        b.title = name;
        b.onclick = () => { const o = h == null ? 0 : 1;
          if (owns(c, "neon1")){ st.neon = o; if (o) st.neonHue = h; delete stylePreview.neon; delete stylePreview.neonHue; persist(); }
          else if (!o){ delete stylePreview.neon; delete stylePreview.neonHue; } else { stylePreview.neon = 1; stylePreview.neonHue = h; }
          renderGarageBody(); refreshPreview(); };
        row.appendChild(b); });
      nc.appendChild(row);
      if (!owns(c, "neon1") && stylePreview.neon) nc.appendChild(probeBar(`Neon-Kit — alle Farben`, "neon1", "Einbauen", () => buyStyle(c, "neon1", "Neon-Kit", () => { st.neon = 1; st.neonHue = stylePreview.neonHue; })));
    }
    el.appendChild(nc);
  }
  function slider(label, val, min, max, step, on, fmt){
    const d = div("sld", `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><output></output>`);
    const inp = d.querySelector("input"), out = d.querySelector("output");
    const showv = v => out.textContent = fmt ? fmt(v) : (+v).toFixed(2);
    showv(val);
    inp.addEventListener("input", () => { const v = +inp.value; showv(v); on(v); });
    return d;
  }

  // ── Setup (Getriebe/Launch) ──
  function tabTune(el){
    const k = save.current, c = cur(), def = CAR_DEFS[k];
    const base = carSimET(k, { ...c, tune: defaultTune(def) });
    const card = div("card", `<h3>Getriebe-Setup</h3><p class="mut" style="font-size:12px;margin-bottom:6px">Kürzer = mehr Punch, weniger Endspeed. Länger = Top-End.</p><p id="tuneEt" style="font-size:13px;font-weight:800;margin-bottom:4px"></p>`);
    const showEt = () => { const now = carSimET(k, c), d = now - base, e2 = card.querySelector("#tuneEt"); if (!e2) return;
      e2.innerHTML = `Dein Setup: ≈ ${now.toFixed(2)}s <span style="color:${d < -0.005 ? "var(--grn)" : d > 0.005 ? "var(--red2)" : "var(--mut)"}">(${d <= 0 ? "−" : "+"}${Math.abs(d).toFixed(2)}s ggü. Werk)</span>`; };
    let etT = 0;
    const tuned = () => { persist(); clearTimeout(etT); etT = setTimeout(() => { showEt(); refreshPreview(); }, 120); };
    c.tune.gears.forEach((gv, i) => card.appendChild(slider(`${i+1}. Gang`, gv, 0.6, 4.2, 0.01, v => { c.tune.gears[i] = v; tuned(); })));
    card.appendChild(slider("Final Drive", c.tune.final, 2.6, 5.2, 0.01, v => { c.tune.final = v; tuned(); }));
    setTimeout(showEt, 0);
    el.appendChild(card);
    const c2 = div("card", "<h3>Launch</h3>");
    c2.appendChild(slider("Launch-RPM", c.tune.launchRpm, def.idle + 500, def.redline, 50, v => { c.tune.launchRpm = Math.round(v); persist(); }, v => Math.round(v)));
    el.appendChild(c2);
    const r = div("card", ""); const rb = document.createElement("button");
    rb.className = "buy"; rb.style.width = "100%"; rb.textContent = "Setup zurücksetzen";
    rb.addEventListener("click", () => { c.tune = defaultTune(def); persist(); renderGarageBody(); refreshPreview(); });
    r.appendChild(rb); el.appendChild(r);
  }

  // ── Sammlung (Pokédex-Prinzip): alle Autos nach Seltenheit ──
  function tabCars(el){
    const total = CAR_KEYS.filter(k => !CAR_DEFS[k].vault).length, have = CAR_KEYS.filter(k => save.cars[k].owned && !CAR_DEFS[k].vault).length;
    el.appendChild(div("card", `<h3>Sammlung · ${have} / ${total}</h3><p class="mut" style="font-size:12px">Neue Autos gibt's nur als Beute: besiege <b style="color:var(--r-blue)">seltene</b>, <b style="color:var(--r-epic)">epische</b> oder <b style="color:var(--r-legend)">legendäre</b> Gegner und ihr Auto gehört dir — auf Level 1.</p>`));
    for (const rar of [...RARITIES].reverse()){
      const ks = CAR_KEYS.filter(k => carRarity(k) === rar && (!CAR_DEFS[k].vault || save.cars[k].owned));
      if (!ks.length) continue;
      el.appendChild(div(`collh r-${rar}`, RARITY[rar].n));
      const grid = div("coll", "");
      ks.sort((a, b) => (save.cars[b].owned - save.cars[a].owned) || (save.cars[b].lvl - save.cars[a].lvl));
      ks.forEach(k => {
        const c = save.cars[k], d = CAR_DEFS[k];
        const cc = div(`cc r-${rar}${c.owned ? "" : " no"}${save.current === k ? " cur" : ""}`,
          `${c.owned ? lvBadge(c.lvl, rar, true) : ""}<img alt=""><b>${d.name}</b><small>${c.owned ? (save.current === k ? "AKTIV" : CLASSES[carClass(k)].name + " · wählen") : "Beute · " + CLASSES[carClass(k)].name}</small>`);
        carImage(k, c.owned ? c.style : defaultCarState(k).style).then(im => { const x = cc.querySelector("img"); if (x) x.src = im.src; });
        cc.onclick = () => {
          if (!c.owned) return toast(`${d.name}: wird von ${RARITY[rar].n.toLowerCase()}en Gegnern gefahren — besiege sie!`);
          save.current = k; save.enc = null; persist(); renderGarage();
        };
        grid.appendChild(cc);
      });
      el.appendChild(grid);
    }
  }
  $("gRace").addEventListener("click", openRadar);

  // ── VS-Freund-Link (Auto als Code) ──
  function encodeVS(){
    const c = cur();
    const data = { n: save.name, c: save.current, u: c.up, t: c.tune, s: c.style, a: c.tal, l: c.lvl };
    return btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  function decodeVS(code){
    try { const d = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g,"+").replace(/_/g,"/"))))); if (d?.c && CAR_DEFS[d.c]) return d; } catch {}
    return null;
  }
  async function shareVS(){
    const url = location.origin + location.pathname + "?vs=" + encodeVS();
    const txt = `REDLINE ⚡ Schlag mein ${CAR_DEFS[save.current].name} (LV ${curLvl()}) auf der Viertelmeile!`;
    if (navigator.share){ try { await navigator.share({ title: "REDLINE VS", text: txt, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); toast("VS-Link kopiert — verschick ihn!"); } catch { prompt("VS-Link kopieren:", url); }
  }
  async function checkVSLink(){
    const code = new URLSearchParams(location.search).get("vs");
    if (!code) return false;
    const d = decodeVS(code);
    if (!d) return false;
    const img = await carImage(d.c, d.s, true);
    $("vsInfo").innerHTML = `<img src="${img.src}" style="width:min(320px,74vw)"><b style="font-size:22px;font-style:italic">${esc((d.n || "EIN RIVALE").slice(0, 14))}</b>
      <span class="mut">fordert dich heraus — mit einem LV ${d.l ?? 1} <b style="color:var(--txt)">${CAR_DEFS[d.c].name}</b></span>`;
    $("vsAccept").onclick = () => {
      const enc = { id: "ghost", rar: "blue", lvl: d.l ?? 1, car: d.c, et: 0, skill: 0.7 };
      startRaceGhost({ name: (d.n || "RIVALE").slice(0, 14), car: d.c, up: d.u, tune: d.t, style: d.s, tal: d.a, lvl: d.l, vsGhost: true, enc, rar: "blue" });
    };
    history.replaceState(null, "", location.pathname);
    show("vschall");
    return true;
  }
  function startRaceGhost(opp){
    lastRace = { opp };
    SCREENS.forEach(s => { const el = $(s); if (el) el.classList.remove("on"); });
    $("hud").classList.add("on"); $("hud").classList.remove("duo");
    $("hudVs").innerHTML = `VS ${esc(opp.name)} <small>Freundes-Challenge</small>`;
    Race.start({ carKey: save.current, carState: cur(), opp, onEvent: raceEvent, onDone: res => {
      $("hud").classList.remove("on");
      $("resHead").innerHTML = ""; $("resLoot").innerHTML = ""; $("resXpBox").innerHTML = "";
      $("resTitle").textContent = res.win ? "SIEG!" : "VERLOREN"; $("resTitle").className = "big " + (res.win ? "win" : "lose");
      $("resSub").textContent = `Challenge von ${opp.name}`;
      $("resGrid").innerHTML = `<div><b>${res.et === Infinity ? "—" : res.et.toFixed(3) + "s"}</b><span>Deine Zeit</span></div><div><b>${res.oppEt == null ? "—" : res.oppEt.toFixed(3) + "s"}</b><span>${esc(opp.name)}</span></div>`;
      setResButtons({ label: "↺ Nochmal", go: () => startRaceGhost(opp) }, [{ label: "Menü", go: () => show("menu") }]);
      show("results");
    } });
  }

  document.getElementById("restartRace").addEventListener("click", () => {
    if (!lastRace || Duo.racing) return;
    Race.stop();
    if (lastRace.opp.vsGhost) return startRaceGhost(lastRace.opp);
    // Radar-Gegner: Abbruch zählt nicht als Versuch — gleiches Rennen neu
    startRace(lastRace.opp);
  });
  document.getElementById("leaveRace").addEventListener("click", () => {
    if (Duo.racing) return Duo.abort();
    Race.stop(); lastRace?.opp?.mode === "enc" ? openRadar() : show("menu");
  });

  // ── Race-Inputs ──
  function bindHold(el, on, off){
    el.addEventListener("touchstart", e => { e.preventDefault(); on(); }, { passive: false });
    el.addEventListener("touchend", e => { e.preventDefault(); off(); });
    el.addEventListener("touchcancel", off);
    el.addEventListener("mousedown", e => { e.preventDefault(); on(); });
    window.addEventListener("mouseup", off);
  }
  const pGas = $("pGas");
  bindHold(pGas, () => { Race.input.gas = true; pGas.classList.add("hot"); AudioSys.unlock(); if (Race.active()) syncKnob(); },
                 () => { Race.input.gas = false; pGas.classList.remove("hot"); });
  const pShift = $("pShift");
  function syncKnob(){ pShift.dataset.gear = String(Math.min(6, Race.gear() + 1)); }
  function uiShift(){ Race.shift(); }
  pShift.addEventListener("touchstart", e => { e.preventDefault(); uiShift(); }, { passive: false });
  pShift.addEventListener("mousedown", e => { e.preventDefault(); uiShift(); });
  const pNos = $("pNos");
  bindHold(pNos, () => { Race.nos(true); pNos.classList.add("hot"); }, () => { Race.nos(false); pNos.classList.remove("hot"); });
  window.addEventListener("keydown", e => {
    if (!Race.active() || e.repeat) return;
    if (e.code === "ArrowUp" || e.code === "Space"){ e.preventDefault(); Race.input.gas = true; pGas.classList.add("hot"); AudioSys.unlock(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "Enter" || e.code === "ArrowRight"){ e.preventDefault(); uiShift(); }
    if (e.code === "KeyN" || e.code === "ArrowDown"){ Race.nos(true); pNos.classList.add("hot"); }
    if (e.code === "Escape"){ if (Duo.racing) Duo.abort(); else { Race.stop(); show("menu"); } }
  });
  window.addEventListener("keyup", e => {
    if (e.code === "ArrowUp" || e.code === "Space"){ Race.input.gas = false; pGas.classList.remove("hot"); }
    if (e.code === "KeyN" || e.code === "ArrowDown"){ Race.nos(false); pNos.classList.remove("hot"); }
  });

  // ── VAULT (Echtgeld-Exklusivauto) ──
  const VAULT_LINK = window.VAULT_LINK ?? "";
  async function renderVault(){
    const owned = !!save.cars.kuro?.owned, def = CAR_DEFS.kuro;
    const img = await carImage("kuro", owned ? save.cars.kuro.style : { hue:0, drop:12, rim:2, exhaust:2, spoiler:0, kit:0 }, true);
    $("vaultCar").src = img.src;
    $("vaultStats").innerHTML = `<div><b>${carPS(def)} PS</b><span>Leistung</span></div><div><b>${def.mass} kg</b><span>Gewicht</span></div>
      <div><b>${def.zone} rpm</b><span>Schaltzone (Rekord)</span></div><div><b>Episch</b><span>startet auf LV 1</span></div>`;
    const b = $("vaultBuy");
    if (owned){ b.textContent = "IN DEINER GARAGE ✓ — fahren"; b.classList.add("owned"); b.onclick = () => { save.current = "kuro"; persist(); show("garage"); }; }
    else if (Shop.native && !Shop.price("redline_vault_kuro")){ b.textContent = "Bald im Vault erhältlich"; b.classList.add("owned"); b.onclick = null; }
    else if (Shop.native){ b.textContent = "Kaufen — " + Shop.price("redline_vault_kuro"); b.classList.remove("owned"); b.onclick = () => Shop.buy("redline_vault_kuro"); }
    else {
      b.textContent = "Kaufen — CHF 4.90"; b.classList.remove("owned");
      b.onclick = () => {
        if (!window.Cloud?.user){ toast("Zuerst anmelden (Menü) — der Kauf hängt an deinem Konto"); return; }
        if (!VAULT_LINK){ toast("Shop öffnet in Kürze — Drop #001 kommt!"); return; }
        window.open(VAULT_LINK + "?client_reference_id=" + Cloud.user.id, "_blank");
        toast("Nach dem Kauf hier zurückkommen — schaltet automatisch frei");
        Cloud.pollVault?.();
      };
    }
  }
  // ── SHOP (Store-App: App-Store-Käufe über window.NativeBridge) ──
  const Shop = (() => {
    const NB = window.NativeBridge;
    const native = !!(NB && NB.isNative);
    const prices = {};
    const CASH = { redline_cash_s: 25000, redline_cash_m: 90000, redline_cash_l: 250000 };
    async function load(){
      if (!native) return;
      try { for (const p of await NB.products()) prices[p.id] = p.price; } catch(e){ console.warn("shop products", e); }
      await syncOwned(); renderShopBits();
      if ($("vault").classList.contains("on")) renderVault();
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
      let ids = []; try { ids = await NB.owned(); } catch(e){ return; }
      let got = 0;
      for (const id of ids){
        if (id === "redline_vault_kuro" && !save.cars.kuro?.owned){ grantCar("kuro"); got++; }
        const m = /^redline_car_(\w+)$/.exec(id);
        if (m && !save.cars[m[1]]?.owned){ grantCar(m[1]); got++; }
      }
      if (got){ toast(`🔑 ${got} Auto${got > 1 ? "s" : ""} wiederhergestellt`); if ($("garage").classList.contains("on")) renderGarage(); }
      return got;
    }
    async function buy(id){
      if (!native){ toast("Kauf nur in der App-Version"); return; }
      NB.haptic?.("light");
      const r = await NB.purchase(id);
      if (!r.ok){ if (!r.cancelled) toast(r.error || "Kauf fehlgeschlagen"); return; }
      NB.haptic?.("heavy");
      if (CASH[id]){ save.money += CASH[id]; persist(); updateCash(); AudioSys.loot(true); toast(`💵 +${fmt$(CASH[id])} gutgeschrieben`); return; }
      if (id === "redline_vault_kuro"){ unlockVault("kuro"); AudioSys.loot(true); toast("🔑 KURO ØNI ist für immer deins"); return; }
      const m = /^redline_car_(\w+)$/.exec(id);
      if (m){ grantCar(m[1]); save.current = m[1]; persist(); AudioSys.loot(true); toast(`🏁 ${CAR_DEFS[m[1]].name} freigeschaltet`); renderGarage(); renderMenu(); }
    }
    async function buyCar(k){ return buy("redline_car_" + k); }
    async function restore(){
      if (!native) return;
      const r = await NB.restore();
      if (!r.ok){ toast(r.error || "Wiederherstellen fehlgeschlagen"); return; }
      if (!(await syncOwned())) toast("Keine neuen Käufe gefunden");
    }
    function renderShopBits(){
      const box = $("shopPacks"); if (!box) return;
      const mb = document.querySelector(".mbtn.vault small");
      const hasStore = native && Object.keys(prices).length > 0;
      if (mb && native) mb.textContent = hasStore ? "Exklusive Legenden · Cash-Pakete" : "Exklusive Legenden der Szene";
      if (!hasStore){ box.style.display = "none"; return; }
      box.style.display = "";
      box.innerHTML = `<h3 style="margin:18px 0 8px">Cash-Pakete</h3>
        <p class="mut" style="font-size:12px;margin-bottom:10px">Spielgeld für Teile und Style. Level und Talente gibt's nur auf der Strasse.</p>
        ${Object.entries(CASH).map(([id, amt]) => `<button class="buy can packbtn" data-id="${id}" style="width:100%;margin:6px 0;display:flex;justify-content:space-between;padding:14px 16px"><span>${fmt$(amt)}</span><b>${prices[id] || "…"}</b></button>`).join("")}
        <button class="buy" id="shopRestore" style="width:100%;margin-top:10px;font-size:12px;opacity:.8">Käufe wiederherstellen</button>`;
      box.querySelectorAll(".packbtn").forEach(b => b.onclick = () => buy(b.dataset.id));
      box.querySelector("#shopRestore").onclick = restore;
    }
    return { native, load, price, buy, buyCar, restore, syncOwned, renderShopBits };
  })();
  window.Shop = Shop;
  function unlockVault(key){
    if (!save.cars[key]) save.cars[key] = defaultCarState(key);
    save.cars[key].owned = true;
    persist();
    if ($("vault").classList.contains("on")) renderVault();
  }

  // ── Duell-Ergebnis (beide Seiten rechnen dasselbe: Replay beider Läufe) ──
  function showDuoResults(r){
    $("hud").classList.remove("on");
    const c = cur();
    if (r.myEt != null && (c.bestEt == null || r.myEt < c.bestEt)) c.bestEt = r.myEt;
    persist();
    const T = { win:["SIEG!","win"], lose:["VERLOREN","lose"], draw:["UNENTSCHIEDEN","win"],
      forfeit:["SIEG!","win"], aborted:["ABGEBROCHEN","lose"], lost:["VERBINDUNG WEG","lose"] }[r.status];
    $("resHead").innerHTML = ""; $("resLoot").innerHTML = ""; $("resXpBox").innerHTML = "";
    $("resTitle").textContent = T[0]; $("resTitle").className = "big " + T[1]; $("resTitle").style.color = "";
    $("resSub").textContent = { win:`Duell · ${r.rivalName} geschlagen`, lose:`Duell · ${r.rivalName} war schneller`,
      draw:"Duell · auf die Tausendstel gleich!", forfeit:`${r.rivalName} hat aufgegeben`,
      aborted:"Du hast das Duell abgebrochen", lost:`Verbindung zu ${r.rivalName} verloren — nicht gewertet` }[r.status];
    const f = v => v == null ? "—" : v.toFixed(3) + "s";
    $("resGrid").innerHTML = `
      <div><b>${f(r.myEt)}</b><span>Deine Zeit</span></div><div><b>${f(r.rivalEt)}</b><span>${esc(r.rivalName)}</span></div>
      <div><b>${r.trap ? Math.round(r.trap) + " km/h" : "—"}</b><span>Trap Speed</span></div><div><b>${f(r.rt)}</b><span>Reaktion</span></div>
      <div style="grid-column:span 2"><b>${r.myEt != null && r.rivalEt != null ? (r.myEt < r.rivalEt ? "−" : "+") + Math.abs(r.myEt - r.rivalEt).toFixed(3) + "s" : "—"}</b><span>Abstand</span></div>`;
    $("resTip").style.display = "none";
    if (r.connected) setResButtons({ label: "↺ Revanche", go: () => Duo.rematch() },
      [{ label: "Auto wechseln", go: () => Duo.backToLobby() }, { label: "Raum verlassen", go: () => Duo.leave() }]);
    else setResButtons({ label: "Neuen Raum öffnen", go: () => { Duo.leave(true); Duo.open(); } }, [{ label: "Menü", go: () => Duo.leave() }]);
    show("results");
  }

  // Duell-Link auf einem iPhone ohne App: Hinweis + automatisch in den App Store
  const APP_STORE_URL = "https://apps.apple.com/app/id6823108171";
  function duoStoreHint(code){
    const d = document.createElement("div");
    d.id = "duoStore";
    d.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:#0A0A0E;color:#F2F3F7";
    d.innerHTML = `<div style="font:italic 900 26px system-ui;letter-spacing:.04em">REDLINE <span style="color:#FF2D40">DUELL</span></div>
      <div style="color:#aeb3c2;font-size:15px;max-width:320px">Du wurdest zu einem Duell eingeladen. Lade Redline Tuner und gib unter <b>Duell</b> diesen Code ein:</div>
      <div style="font:900 34px ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#FFC61A">${esc(code)}</div>
      <a href="${APP_STORE_URL}" style="display:block;min-width:240px;padding:15px 18px;border-radius:16px;background:#FF2D40;color:#fff;font-weight:900;text-decoration:none">Im App Store laden</a>
      <button id="duoWeb" style="min-height:44px;background:none;border:0;color:#8E92A3;font-size:14px;text-decoration:underline">Im Browser spielen</button>`;
    document.body.appendChild(d);
    const t = setTimeout(() => { location.href = APP_STORE_URL; }, 1600);
    d.querySelector("#duoWeb").onclick = () => {
      clearTimeout(t); d.remove();
      if (!save.current) show("starter");
      else { const c = window.DUEL_CODE; window.DUEL_CODE = null; show("menu"); Duo.open(c); }
    };
    return true;
  }
  window.openDuoLink = code => {
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) return;
    if (Race.active() && !Duo.racing) Race.stop();
    if (!save.current){ window.DUEL_CODE = code; return; }
    show("menu"); Duo.open(code);
  };

  // ── Boot ──
  (async () => {
    window.Cloud?.init?.();
    const qs = new URLSearchParams(location.search);
    const pm = location.pathname.match(/^\/duo\/([A-Za-z0-9]+)/);
    const duo = qs.get("duo") || qs.get("duel") || pm?.[1];
    if (duo){ window.DUEL_CODE = duo.toUpperCase().replace(/[^A-Z0-9]/g, ""); history.replaceState(null, "", "/"); }
    if (duo && !window.NativeBridge?.isNative && /iPhone|iPad|iPod/.test(navigator.userAgent) && duoStoreHint(window.DUEL_CODE)) return;
    if (qs.get("vault") === "success"){
      history.replaceState(null, "", location.pathname);
      toast("✨ Danke! Dein VAULT-Auto wird freigeschaltet…");
      setTimeout(() => window.Cloud?.pollVault?.(), 1500);
    }
    if (await checkVSLink()) return;
    if (!save.current) show("starter");
    else if (window.DUEL_CODE){ const c = window.DUEL_CODE; window.DUEL_CODE = null; show("menu"); Duo.open(c); }
    else show("menu");
  })();

  setTimeout(() => { Shop.load(); }, 400);
  if (window.NativeBridge?.isNative){
    document.addEventListener("click", e => {
      const t = e.target.closest("button, .mbtn, .buy, .tab"); if (!t) return;
      window.NativeBridge.haptic(t.matches(".mbtn.primary, .vaultbuy, .go") ? "medium" : "light");
    }, true);
  }
  return { save, show, persist, toast, applyCloud, showDuoResults, shareVS, unlockVault, raceEvent,
    carImage: (k, st) => carImage(k, st), hideLevelUp, openRadar,
    currentExhaust: () => save.cars[save.current]?.style.exhaust ?? 0 };
})();
