// rivals.js — «Rivalen» (28.10.2026): Spieler in der Nähe + Freunde, live gegeneinander, um Cash oder HARDCORE.
//
// Online-Kanal «redline-rivals» (Supabase Presence): solange die App offen ist, ist jeder Spieler mit
// {pid, name, auto, level, sucht?, beschäftigt?, grobe Zone} eingetragen. Daraus:
//  • Suche in der Nähe: nur Spieler, die GERADE AUCH suchen. Geteilt wird nur eine grobe Standort-Zelle
//    (Geohash 4 Zeichen ≈ 40 km), nie die genaue Position. Radius + Level-Spanne wachsen mit der Suchdauer:
//    0–10 s ~40 km & ±3 LV → bis 22 s ~150 km & ±5 → bis 40 s Land & ±10 → danach überall & ±20.
//    Paarung zufällig; kreuzen sich zwei Einladungen, gewinnt die kleinere Spieler-ID.
//  • Freunde: Freundes-Code / Link (l.abooz.ch/duo/F<CODE>, Universal Link → App), Freundschaft ist
//    gegenseitig (Server redline.friends). Online-Punkt live; kommt ein Freund online → Banner im Spiel.
//    Herausfordern → Popup beim Freund (Annehmen/Ablehnen).
// Match: beide sehen das Auto des Gegners (Level, Teile, ≈ Zeit) und einigen sich auf
//   • Normales Rennen (Cash-Einsatz, 0 = nur Ehre) oder
//   • HARDCORE: Auto gegen Auto — Verlierer verliert sein Auto mit Level/Teilen/Style an den Gewinner.
// Erst wenn BEIDE demselben Vorschlag zustimmen, startet das Rennen (Duell-Engine, duo.js openMatch).
// Abrechnung macht der Server (redline.wager_* — nur RPC): beide melden ihre Zeit; wer nicht meldet
// (App beendet), verliert nach 90 s. Angewendet beim nächsten Abgleich (auch nach App-Neustart).
// XP: Sieg = Mittel aus Grün- und Blau-XP des eigenen Levels (mehr als gewöhnlich, nie mehr als blau), Niederlage 35 %.
const Rivals = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const S = () => UI.save;
  const fmt$ = n => "🔩 " + Math.round(n).toLocaleString("de-CH");   // Spielwährung «Bolts»
  const STAKES = [0, 500, 2000, 10000, 50000];
  const TIERS = [
    // de = erlaubter Unterschied der ≈ Zeit (s) — nur Gegner mit echter Chance (Claw 30.10.)
    { till: 10, geo: "g4", dl: 3,  de: 0.25, label: "in deiner Nähe · ~40 km" },
    { till: 22, geo: "g3", dl: 5,  de: 0.4,  label: "in deiner Region · ~150 km" },
    { till: 40, geo: "g2", dl: 10, de: 0.6,  label: "im ganzen Land" },
    { till: 1e9, geo: null, dl: 20, de: 0.8, label: "überall" },
  ];
  const FRIEND_LINK = c => "https://l.abooz.ch/duo/F" + c;
  let ch = null, live = false, phase = "home", tab = "near", geo = null, geoNote = "", t0 = 0, tickT = 0, matchT = 0, hbT = 0;
  let out = null;                 // { to, at, friend } offene Einladung
  const declined = new Set();
  let m = null;                   // Match: { mid, host, friend, opp, prop:{mode,stake,rev}, okMe, okOpp, ack }
  let myCode = null, friends = [];
  const lastOnline = {};          // pid → Zeitpunkt zuletzt online gesehen (Benachrichtigung entprellen)
  let online = new Set();

  function pid(){
    if (!S().pid){ S().pid = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, 20); UI.persist(); }
    return S().pid;
  }
  const myName = () => S().name && S().name !== "RACER" ? S().name : "RACER";
  const isFriend = p => friends.some(f => f.pid === p);
  const fname = p => friends.find(f => f.pid === p)?.name ?? "Freund";
  const rpc = async (fn, args) => { const { data, error } = await Cloud.sb.rpc(fn, args); if (error) throw error; return data; };

  // ── Standort → grobe Zelle ─────────────────────────────────────────────────
  function geohash(lat, lon, n){
    const B = "0123456789bcdefghjkmnpqrstuvwxyz";
    let la = [-90, 90], lo = [-180, 180], h = "", bit = 0, c = 0, even = true;
    while (h.length < n){
      const r = even ? lo : la, v = even ? lon : lat, mid = (r[0] + r[1]) / 2;
      if (v >= mid){ c = c*2 + 1; r[0] = mid; } else { c *= 2; r[1] = mid; }
      even = !even;
      if (++bit === 5){ h += B[c]; bit = 0; c = 0; }
    }
    return h;
  }
  function locate(){
    return new Promise(res => {
      if (!navigator.geolocation){ geoNote = "Standort nicht verfügbar — suche überall"; return res(null); }
      let done = false;
      const fin = v => { if (!done){ done = true; res(v); } };
      setTimeout(() => { geoNote = "Kein Standort — suche überall"; fin(null); }, 9000);
      navigator.geolocation.getCurrentPosition(p => {
        const h = geohash(p.coords.latitude, p.coords.longitude, 4);
        geoNote = ""; fin({ g4: h, g3: h.slice(0, 3), g2: h.slice(0, 2) });
      }, () => { geoNote = "Standort aus — suche überall"; fin(null); }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    });
  }

  // ── Eigene Daten ───────────────────────────────────────────────────────────
  const carOf = () => { const k = S().current; return [k, S().cars[k]]; };
  const ownedCount = () => CAR_KEYS.filter(k => S().cars[k]?.owned).length;
  // LEVEL-REGELN (Claw 30.10., wie PvP bei WoW): Rivalen ab Auto-Level 10, Titelkampf ab Auto-Level 20.
  // Gilt fürs AKTIVE Auto; der Server (wager_open) prüft dasselbe.
  const RIV_LVL = 10, HC_LVL = 20;
  function rivReason(){
    const [k, c] = carOf(), L = c?.lvl ?? 1;
    return L < RIV_LVL ? `Rivalen-Rennen ab Auto-Level ${RIV_LVL} — dein ${CAR_DEFS[k].name} ist LV ${L}.` : null;
  }
  // Fingerabdruck eines Autos (Modell, Level, Teile, Talente, Setup): eine Zustimmung gilt nur für genau diese Daten
  const sig = c => [c.car, c.lvl, JSON.stringify(c.up || {}), JSON.stringify(c.tal || {}), JSON.stringify(c.tune || {})].join("|");
  function hcReason(){
    const [k, c] = carOf();
    if ((c.lvl ?? 1) < HC_LVL) return `Titelkampf ab Auto-Level ${HC_LVL} — dein ${CAR_DEFS[k].name} ist LV ${c.lvl ?? 1}.`;
    if (c.iap || CAR_DEFS[k].vault) return "Vault-/Shop-Autos sind vom Titelkampf ausgeschlossen.";
    if (ownedCount() < 2) return "Titelkampf nur mit mindestens 2 Autos — dein letztes Auto ist geschützt.";
    return null;
  }
  function card(){
    const [k, c] = carOf();
    return { pid: pid(), name: myName(), car: k, lvl: c.lvl ?? 1, up: c.up, tune: c.tune, style: c.style, tal: c.tal ?? {}, money: S().money, hc: !hcReason(), hcLvl: (c.lvl ?? 1) >= HC_LVL };
  }
  const busy = () => phase === "match" || phase === "starting" || phase === "invite" || !!Duo.racing || !!Race.active?.();
  function presence(){
    const [k, c] = carOf();
    return { pid: pid(), name: myName(), car: k, lvl: c?.lvl ?? 1, et: myEt(), seek: phase === "search", busy: busy(), g4: geo?.g4, g3: geo?.g3, g2: geo?.g2 };
  }
  const retrack = () => { if (live) ch?.track(presence()); };

  // ── Online-Kanal (läuft, solange die App offen ist) ───────────────────────
  let booting = false;
  async function boot(){
    if (!window.Cloud?.sb || !S()?.current || ch || booting) return;
    booting = true;
    try { myCode = await rpc("player_hello", { p_pid: pid(), p_name: myName() }); } catch {}
    await loadFriends();
    if (!ch) connect();
    booting = false;
    pushSetup();
  }
  // Push (nur App): Token beim Server hinterlegen; Freunde erfahren per Push, dass ich online bin (Server drosselt)
  async function pushSetup(){
    try {
      const t = await window.NativeBridge?.pushRegister?.();
      if (t) await rpc("push_register", { p_pid: pid(), p_token: t, p_platform: window.NativeBridge.platform + "|" + (window.I18N?.lang ?? "de") });
    } catch {}
    notify("online");
  }
  function notify(type, to){
    try { Cloud.sb.functions.invoke("redline-push", { body: { type, pid: pid(), to } }).catch(() => {}); } catch {}
  }
  function poke(fp){ notify("poke", fp); UI.toast(`🔔 ${fname(fp)} bekommt eine Push-Nachricht`); }
  async function loadFriends(){
    try { friends = (await rpc("friend_list", { p_pid: pid() })) || []; S().friends = friends.map(f => ({ pid: f.pid, name: f.name })); UI.persist(); }
    catch { friends = S().friends || []; }
  }
  function connect(){
    ch = Cloud.sb.channel("redline-rivals", { config: { broadcast: { self: false }, presence: { key: pid() } } });
    const mine = f => ({ payload }) => { if (payload?.to === pid()) f(payload); };
    ch.on("broadcast", { event: "inv" }, mine(onInvite))
      .on("broadcast", { event: "acc" }, mine(onAccept))
      .on("broadcast", { event: "dec" }, mine(onDecline))
      .on("broadcast", { event: "prop" }, mine(onProp))
      .on("broadcast", { event: "ok" }, mine(onOk))
      .on("broadcast", { event: "bye" }, mine(onBye))
      .on("broadcast", { event: "go" }, mine(onGo))
      .on("broadcast", { event: "tuning" }, mine(p => { if (phase === "match" && p.mid === m?.mid){ m.oppTuning = true; m.okMe = m.okOpp = false; extend(); render(); } }))
      .on("broadcast", { event: "card" }, mine(p => { if (phase === "match" && p.mid === m?.mid){
        const switched = p.card.car !== m.opp.car;
        m.opp = p.card; m.oppTuning = false; m.okMe = m.okOpp = false; m.ack = false; m.oppChanged = switched ? "car" : "tune";
        if (m.prop.mode === "hardcore" && !p.card.hc) propose("cash", 0);
        window.NativeBridge?.haptic?.("heavy"); render();
        UI.toast(switched ? `🚗 ${p.card.name} fährt jetzt ${CAR_DEFS[p.card.car]?.name ?? p.card.car} — Daten prüfen, neu zustimmen` : `🔧 ${p.card.name} hat nachgerüstet — neu zustimmen`); } }))
      .on("broadcast", { event: "fr" }, mine(() => loadFriends().then(render)))   // jemand hat mich als Freund hinzugefügt
      .on("presence", { event: "sync" }, onSync)
      .subscribe(st => {
        if (st === "SUBSCRIBED"){ live = true; retrack(); }
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED"){
          live = false;
          if (phase === "search"){ phase = "error"; render(); }
          // nach Netz-Wackler neu verbinden
          setTimeout(() => { if (!live && ch){ try { Cloud.sb.removeChannel(ch); } catch {} ch = null; connect(); } }, 1500);
        }
      });
    clearInterval(hbT); hbT = setInterval(retrack, 15000);
  }
  const send = (event, payload) => ch?.send({ type: "broadcast", event, payload: { ...payload, from: pid() } });
  function everyone(){
    const st = ch?.presenceState?.() || {};
    return Object.values(st).map(a => a[a.length - 1]).filter(p => p?.pid && p.pid !== pid());
  }
  const presOf = p => everyone().find(x => x.pid === p);
  function onSync(){
    const now = Date.now(), nowOn = new Set(everyone().map(p => p.pid));
    for (const f of friends){
      if (nowOn.has(f.pid) && !online.has(f.pid)){
        // nur melden, wenn der Freund > 3 min weg war (kein Banner bei Netz-Wacklern)
        if (now - (lastOnline[f.pid] || 0) > 180000 && !busy()) notifyOnline(f);
      }
      if (nowOn.has(f.pid)) lastOnline[f.pid] = now;
    }
    online = nowOn;
    if ($("rivals")?.classList.contains("on") && (phase === "search" || phase === "home")) render();
    updateBadge();
  }
  function updateBadge(){
    const n = friends.filter(f => online.has(f.pid)).length;
    const b = $("rivOnline"); if (b){ b.textContent = n; b.style.display = n ? "" : "none"; }
  }

  // ── Banner / Popup ─────────────────────────────────────────────────────────
  function popup(html, buttons, ms){
    $("rvPop")?.remove();
    const d = document.createElement("div");
    d.id = "rvPop"; d.className = "rv-pop";
    d.innerHTML = `<div class="rv-pop-in">${html}<div class="rv-pop-btns">${buttons.map((b, i) => `<button class="mbtn ${i ? "" : "primary"}" data-i="${i}">${b.label}</button>`).join("")}</div></div>`;
    document.body.appendChild(d);
    const close = () => { d.remove(); clearTimeout(t); };
    d.querySelectorAll("button").forEach(btn => btn.onclick = () => { close(); buttons[+btn.dataset.i].go?.(); });
    const t = ms ? setTimeout(() => { if (d.isConnected){ close(); buttons[buttons.length - 1].timeout?.(); } }, ms) : 0;
    return close;
  }
  function notifyOnline(f){
    window.NativeBridge?.haptic?.("light"); AudioSys.tone?.(880, 0.12, { gain: 0.12 });
    popup(`<b class="rv-pop-t">🟢 ${esc(f.name)} ist online</b><p>Lust auf eine Runde?</p>`,
      [{ label: "⚔ Herausfordern", go: () => challenge(f.pid) }, { label: "Später" }], 9000);
  }

  // ── Suche in der Nähe ──────────────────────────────────────────────────────
  async function startSearch(){
    if (rivReason()){ UI.toast(rivReason()); return toHome(); }
    phase = "locate"; render();
    if (!live){
      if (!ch) boot();
      for (let i = 0; i < 40 && !live; i++) await new Promise(r => setTimeout(r, 250));
      if (!live){ phase = "error"; render(); return; }
    }
    if (!geo) geo = await locate();
    if (phase !== "locate") return;
    phase = "search"; t0 = Date.now(); out = null; m = null;
    retrack();
    clearInterval(tickT); tickT = setInterval(tick, 1200);
    render();
  }
  const tier = () => { const s = (Date.now() - t0) / 1000; return TIERS.find(t => s < t.till); };
  const searchers = () => everyone().filter(p => p.seek);
  function eligible(p, T = tier()){
    if (!p.seek || p.busy || declined.has(p.pid)) return false;
    if (Math.abs((p.lvl ?? 1) - (carOf()[1].lvl ?? 1)) > T.dl) return false;
    if (p.et != null && myEt() != null && Math.abs(p.et - myEt()) > T.de) return false;   // keine echte Chance → nicht vorschlagen
    if (!T.geo) return true;
    return !!(geo && p[T.geo] && p[T.geo] === geo[T.geo]);
  }
  function tick(){
    if (phase !== "search") return clearInterval(tickT);
    render();
    if (out && Date.now() - out.at < 4000) return;
    out = null;
    const c = searchers().filter(p => eligible(p));
    if (!c.length) return;
    const p = c[Math.floor(Math.random() * c.length)];
    out = { to: p.pid, at: Date.now() };
    send("inv", { to: p.pid, card: card() });
  }

  // ── Freunde ────────────────────────────────────────────────────────────────
  async function addFriend(code){
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) return UI.toast("Der Freundes-Code hat 6 Zeichen.");
    if (!myCode) try { myCode = await rpc("player_hello", { p_pid: pid(), p_name: myName() }); } catch { return UI.toast("Keine Verbindung."); }
    try {
      const r = await rpc("friend_add", { p_pid: pid(), p_code: code });
      if (r?.err === "self") return UI.toast("Das ist dein eigener Code 😄");
      if (r?.err) return UI.toast("Code nicht gefunden.");
      await loadFriends();
      send("fr", { to: r.pid });
      UI.toast(`🤝 ${r.name} ist jetzt dein Freund`);
      tab = "friends"; render(); updateBadge();
    } catch { UI.toast("Keine Verbindung."); }
  }
  async function nameChanged(){
    try { myCode = await rpc("player_hello", { p_pid: pid(), p_name: myName() }); } catch {}
    retrack();
  }
  // Vorbesitzer eines Autos (Garage) direkt als Freund
  async function addFriendPid(other, name){
    if (!other || other === pid()) return;
    if (isFriend(other)) return UI.toast(`${name ?? "Er/Sie"} ist schon dein Freund.`);
    try {
      if (!myCode) myCode = await rpc("player_hello", { p_pid: pid(), p_name: myName() });
      const r = await rpc("friend_add_pid", { p_pid: pid(), p_other: other });
      if (r?.err) return UI.toast("Spieler nicht gefunden.");
      await loadFriends(); send("fr", { to: r.pid }); updateBadge();
      UI.toast(`🤝 ${r.name} ist jetzt dein Freund`);
    } catch { UI.toast("Keine Verbindung."); }
  }
  async function removeFriend(p){
    try { await rpc("friend_remove", { p_pid: pid(), p_other: p }); } catch {}
    await loadFriends(); render(); updateBadge();
  }
  function challenge(fp){
    if (rivReason()) return UI.toast(rivReason());
    const p = presOf(fp);
    if (!p) return UI.toast(`${fname(fp)} ist gerade nicht online.`);
    if (p.busy) return UI.toast(`${fname(fp)} fährt gerade ein Rennen.`);
    if (Race.active?.() || Duo.racing) return;
    clearInterval(tickT);
    UI.show("rivals");
    phase = "invite"; out = { to: fp, at: Date.now(), friend: true }; retrack();
    send("inv", { to: fp, card: card(), friend: true }); keepInviting({ to: fp, card: card(), friend: true });
    render();
    clearTimeout(matchT);
    matchT = setTimeout(() => { if (phase === "invite"){ UI.toast(`${fname(fp)} antwortet nicht.`); toHome("friends"); } }, 30000);
  }
  // Offene Einladung alle 3 s erneut senden, bis Antwort/Abbruch — eine Nachricht kann bei einem
  // Verbindungs-Wackler beim Gegner verloren gehen. Der Gegner zeigt pro Absender nur EIN Popup (invSeen).
  let resendT = 0;
  function keepInviting(payload){
    clearInterval(resendT);
    resendT = setInterval(() => { if (phase !== "invite" || out?.to !== payload.to){ clearInterval(resendT); return; } send("inv", payload); }, 3000);
  }
  const invSeen = new Map();   // Absender → Zeitpunkt des offenen Popups
  const invDup = from => { const t = invSeen.get(from); if (t && Date.now() - t < 30000) return true; invSeen.set(from, Date.now()); return false; };
  // Revanche (Ergebnis-Bildschirm): gleiche Bedingungen oder Hardcore — Gegner muss annehmen, dann wie gewohnt zustimmen
  // Kanal kann nach einem Rennen kurz weg sein (Herzschlag-Timeout bei Volllast) → sofort neu verbinden
  // und warten, bis der Gegner wieder in der Presence auftaucht (Bug 30.10.: «Keine Verbindung» bei Revanche).
  async function ensureLive(oppPid, ms = 8000){
    if (!live && ch && ch.state !== "joining"){ try { Cloud.sb.removeChannel(ch); } catch {} ch = null; }
    if (!ch) connect();
    const t = Date.now();
    while (Date.now() - t < ms){ if (live && (!oppPid || presOf(oppPid))) return true; await new Promise(r => setTimeout(r, 250)); }
    return live;
  }
  async function rematch(oppPid, oppName, prop){
    if (rivReason()) return UI.toast(rivReason());
    if (!live || !presOf(oppPid)){ UI.toast("Verbinde…"); await ensureLive(oppPid); }
    if (!live) return UI.toast("Keine Verbindung.");
    const p = presOf(oppPid);
    if (!p) return UI.toast(`${oppName} ist nicht mehr online.`);
    if (prop.mode === "hardcore" && hcReason()) return UI.toast(hcReason());
    UI.show("rivals");
    phase = "invite"; out = { to: oppPid, at: Date.now(), rematch: true, prop, name: oppName }; retrack();
    send("inv", { to: oppPid, card: card(), rematch: true, prop }); keepInviting({ to: oppPid, card: card(), rematch: true, prop });
    render();
    clearTimeout(matchT);
    matchT = setTimeout(() => { if (phase === "invite"){ UI.toast(`${oppName} antwortet nicht.`); toHome(); } }, 30000);
  }
  async function share(){
    if (!myCode) return;
    const url = FRIEND_LINK(myCode), txt = window.I18N ? I18N.t(`Fahr gegen mich in REDLINE! Mein Freundes-Code: ${myCode}`) : `Fahr gegen mich in REDLINE! Mein Freundes-Code: ${myCode}`;
    if (navigator.share){ try { await navigator.share({ title: "Redline", text: txt, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(`${txt} · ${url}`); UI.toast("Link kopiert"); } catch { UI.toast("Code: " + myCode); }
  }

  // ── Einladung / Match ──────────────────────────────────────────────────────
  function onInvite(p){
    if (rivReason()) return send("dec", { to: p.from, lvl: true });   // mein Auto ist unter LV 10
    // Revanche nach einem Rivalen-Rennen (auch ohne Freundschaft)
    if (p.rematch){
      // Beide haben gleichzeitig «Revanche fragen» getippt: kleinere ID nimmt die Einladung des anderen an,
      // die grössere wartet auf dessen «acc» (onAccept passt, weil out.to === Absender).
      if (phase === "invite" && out?.to === p.from){
        if (pid() > p.from) return;
        out = null;
        const mid = "rv" + Math.random().toString(36).slice(2, 10);
        send("acc", { to: p.from, card: card(), mid });
        UI.show("rivals"); return enterMatch(mid, false, p.card, isFriend(p.from), p.prop || { mode: "cash", stake: 0 });
      }
      if (busy()) return send("dec", { to: p.from, busy: true });
      if (invDup(p.from)) return;
      window.NativeBridge?.haptic?.("heavy"); AudioSys.vsSlam?.();
      const c = p.card, P = p.prop || { mode: "cash", stake: 0 };
      popup(`<b class="rv-pop-t">↺ ${esc(c.name)} will Revanche!</b>
        <p>${P.mode === "hardcore" ? `<b style="color:#ffc84a">🏆 TITELKAMPF</b> — Auto gegen Auto` : P.stake ? `Preisgeld <b>${fmt$(P.stake)}</b>` : "Um die Ehre"} · ${esc(CAR_DEFS[c.car]?.name ?? c.car)} LV ${c.lvl}</p>`,
        [{ label: "Annehmen", go: () => {
            if (busy()) return send("dec", { to: p.from, busy: true });
            const mid = "rv" + Math.random().toString(36).slice(2, 10);
            send("acc", { to: p.from, card: card(), mid });
            UI.show("rivals"); enterMatch(mid, false, c, isFriend(p.from), P);
          } },
         { label: "Nein danke", go: () => { invSeen.delete(p.from); send("dec", { to: p.from }); }, timeout: () => { invSeen.delete(p.from); send("dec", { to: p.from }); } }], 25000);
      return;
    }
    if (p.friend && isFriend(p.from)){
      if (busy() || phase === "search" && out) return send("dec", { to: p.from, busy: true });
      if (invDup(p.from)) return;
      window.NativeBridge?.haptic?.("heavy"); AudioSys.vsSlam?.();
      const c = p.card;
      popup(`<b class="rv-pop-t">⚔ ${esc(c.name)} fordert dich heraus!</b><p>${esc(CAR_DEFS[c.car]?.name ?? c.car)} · LV ${c.lvl}</p>`,
        [{ label: "Annehmen", go: () => {
            if (busy()) return send("dec", { to: p.from, busy: true });
            clearInterval(tickT); out = null;
            const mid = "rv" + Math.random().toString(36).slice(2, 10);
            send("acc", { to: p.from, card: card(), mid });
            UI.show("rivals"); enterMatch(mid, false, c, true);
          } },
         { label: "Ablehnen", go: () => { invSeen.delete(p.from); send("dec", { to: p.from }); }, timeout: () => { invSeen.delete(p.from); send("dec", { to: p.from }); } }], 25000);
      return;
    }
    if (phase !== "search" || declined.has(p.from)) return send("dec", { to: p.from });
    { const e = statsOf(p.card)?.et; if (e != null && myEt() != null && Math.abs(e - myEt()) > tier().de) return send("dec", { to: p.from }); }
    if (out && out.to !== p.from && p.from > pid()) return send("dec", { to: p.from });   // kreuzend: kleinere ID gewinnt
    out = null;
    const mid = "rv" + Math.random().toString(36).slice(2, 10);
    send("acc", { to: p.from, card: card(), mid });
    enterMatch(mid, false, p.card, false);
  }
  function onAccept(p){
    if ((phase !== "search" && phase !== "invite") || out?.to !== p.from){ send("bye", { to: p.from, mid: p.mid }); return; }
    const fr = !!out.friend || isFriend(p.from), preset = out.prop; out = null;
    enterMatch(p.mid, true, p.card, fr, preset);
  }
  function onDecline(p){
    if (out?.to !== p.from) return;
    out = null;
    if (phase === "invite"){ UI.toast(p.lvl ? `${fname(p.from)} braucht ein Auto ab Level ${RIV_LVL}.` : p.busy ? `${fname(p.from)} ist gerade beschäftigt.` : `${fname(p.from)} hat abgelehnt.`); toHome("friends"); }
  }
  function defaultStake(opp){ return Math.min(S().money, opp.money ?? 0) >= 500 ? 500 : 0; }
  function enterMatch(mid, host, opp, friend, preset){
    invSeen.delete(opp.pid); clearInterval(resendT);
    // Ergebnis-Bildschirm des letzten Rennens ZUERST verlassen: Duo.leave → raceDone() setzt phase/m zurück —
    // danach erst das neue Match setzen (Bug 30.10.: Revanche-Annahme landete sonst auf «home» und hing).
    if (Duo.rivalMatch) Duo.leave(true);
    phase = "match"; clearInterval(tickT); clearTimeout(matchT);
    const prop = preset ? { mode: preset.mode, stake: Math.min(preset.stake || 0, S().money, opp.money ?? 0), rev: 1 } : { mode: "cash", stake: defaultStake(opp), rev: 0 };
    m = { mid, host, friend, opp, prop, okMe: false, okOpp: false, ack: false };
    retrack();
    window.NativeBridge?.haptic?.("medium"); AudioSys.reveal?.("blue");
    matchT = setTimeout(() => { if (phase === "match"){ UI.toast("Zeit abgelaufen"); bye(); } }, 120000);
    render();
  }
  const extend = () => { clearTimeout(matchT); matchT = setTimeout(() => { if (phase === "match"){ UI.toast("Zeit abgelaufen"); bye(); } }, 300000); };
  // In der Garage nachrüsten, Match bleibt offen; zurück (‹) → neue Daten an den Gegner, beide stimmen neu zu
  function tune(){
    if (phase !== "match") return;
    m.tuning = true; m.okMe = m.okOpp = false; extend();
    send("tuning", { to: m.opp.pid, mid: m.mid });
    UI.show("garage"); UI.toast("Nachrüsten — dann ‹ zurück zum Match");
  }
  const inMatch = () => phase === "match" && !!m;
  // Vorschlag ändern (beide Seiten dürfen) → Zustimmungen zurücksetzen
  function propose(mode, stake){
    if (phase !== "match") return;
    if (mode === "hardcore" && (hcReason() || !m.opp.hc)) return UI.toast(hcReason() || `${m.opp.name} kann keinen Titelkampf fahren.`);
    m.prop = { mode, stake: mode === "hardcore" ? 0 : stake, rev: Date.now() };
    m.okMe = m.okOpp = false; m.ack = false;
    send("prop", { to: m.opp.pid, mid: m.mid, prop: m.prop });
    render();
  }
  function onProp(p){
    if (phase !== "match" || p.mid !== m.mid || p.prop.rev <= m.prop.rev) return;
    m.prop = p.prop; m.okMe = m.okOpp = false; m.ack = false;
    window.NativeBridge?.haptic?.("light");
    render();
  }
  function agree(){
    if (phase !== "match") return;
    if (m.prop.mode === "hardcore" && !m.ack) return UI.toast("Bitte zuerst die Titelkampf-Warnung bestätigen.");
    if (m.prop.mode === "cash" && m.prop.stake > S().money) return UI.toast("Nicht genug Bolts für dieses Preisgeld.");
    m.okMe = true; m.agreedSig = sig(card());
    send("ok", { to: m.opp.pid, mid: m.mid, rev: m.prop.rev, mine: m.agreedSig, theirs: sig(m.opp) });
    render(); maybeStart();
  }
  function onOk(p){
    if (phase !== "match" || p.mid !== m.mid || p.rev !== m.prop.rev) return;
    if (p.theirs !== sig(card()) || p.mine !== sig(m.opp)) return;   // Zustimmung zu alten Auto-Daten → ungültig
    m.okOpp = true; render(); maybeStart();
  }
  function maybeStart(){
    if (!m?.host || !m.okMe || !m.okOpp) return;
    if (m.agreedSig !== sig(card())){ m.okMe = false; render(); return; }
    send("go", { to: m.opp.pid, mid: m.mid, rev: m.prop.rev, mine: sig(card()), theirs: sig(m.opp) });
    launch();
  }
  function onGo(p){
    if (!(phase === "match" && p.mid === m.mid && p.rev === m.prop.rev && m.okMe)) return;
    if (p.theirs !== sig(card()) || p.mine !== sig(m.opp) || m.agreedSig !== sig(card())){ m.okMe = m.okOpp = false; render(); return; }
    launch();
  }
  async function launch(){
    phase = "starting"; clearTimeout(matchT); render();
    const [k, c] = carOf(), mm = m;
    const state = { lvl: c.lvl ?? 1, xp: c.xp ?? 0, up: c.up, tune: c.tune, style: c.style, tal: c.tal ?? {}, owners: c.owners ?? [] };
    try {
      await rpc("wager_open", { p_match: mm.mid, p_pid: pid(), p_opp: mm.opp.pid, p_mode: mm.prop.mode,
        p_stake: mm.prop.stake, p_car: k, p_state: state, p_name: myName() });
    } catch {
      UI.toast("Server nicht erreichbar — Rennen abgesagt"); send("bye", { to: mm.opp.pid, mid: mm.mid }); return toHome(mm.friend ? "friends" : "near");
    }
    phase = "racing"; retrack();
    Duo.openMatch(mm.mid, mm.host, { mid: mm.mid, mode: mm.prop.mode, stake: mm.prop.stake, pid: pid(), friend: mm.friend,
      oppPid: mm.opp.pid, oppName: mm.opp.name, oppCar: mm.opp.car, oppLvl: mm.opp.lvl, myCar: k, myLvl: c.lvl ?? 1 });
  }
  function onBye(p){
    if (phase !== "match" || p.mid !== m?.mid) return;
    UI.toast(`${m.opp.name} hat abgelehnt`);
    if (m.friend) return toHome("friends");
    declined.add(m.opp.pid); startSearch();
  }
  function bye(){
    if (m){ send("bye", { to: m.opp.pid, mid: m.mid }); if (!m.friend) declined.add(m.opp.pid); }
    if (m?.friend) return toHome("friends");
    startSearch();
  }
  function toHome(t){
    clearInterval(tickT); clearTimeout(matchT);
    phase = "home"; m = null; out = null; if (t) tab = t;
    retrack(); render();
  }
  // Nach dem Rennen (duo.js) wieder frei
  function raceDone(){ phase = "home"; m = null; retrack(); }
  function open(t){
    if (!window.Cloud?.sb){ UI.toast("Rivalen braucht Internet."); return; }
    if (!S().current){ UI.show("starter"); return; }
    if (!ch) boot();
    if (phase !== "match" && phase !== "invite") phase = "home";
    if (t) tab = t;
    if (phase === "match" && m?.tuning){ m.tuning = false; m.okMe = m.okOpp = false; send("card", { to: m.opp.pid, mid: m.mid, card: card() }); }
    UI.show("rivals"); render();
  }
  function close(){
    if (phase === "match" && m) send("bye", { to: m.opp.pid, mid: m.mid });
    toHome();
    UI.show("menu");
  }

  // ── Abrechnung (Server) anwenden ───────────────────────────────────────────
  let settling = false;
  async function settle(){
    if (settling || !window.Cloud?.sb || !S()?.pid) return [];
    settling = true;
    const msgs = [];
    try {
      for (const w of (await rpc("wager_pending", { p_pid: S().pid })) || []){
        msgs.push(UI.applyWager(w));
        await rpc("wager_ack", { p_match: w.match, p_pid: S().pid });
      }
    } catch {}
    settling = false;
    return msgs;
  }
  // Nach einem Rivalen-Rennen: bis zur Server-Entscheidung nachfragen und das Ergebnis einblenden
  async function settleAfterRace(mid, show){
    for (let i = 0; i < 45; i++){
      const mine = (await settle()).find(x => x?.match === mid);
      if (mine) return show(mine);
      await new Promise(r => setTimeout(r, i < 10 ? 1500 : 4000));
    }
    show(null);
  }
  // Pink-Slip: alle im Hardcore verlorenen Autos (Server) — besessen und VOR dem Verlust erhalten → weg.
  // Greift beim Start, nach jeder Abrechnung und nach Cloud-Abgleich (alter Spielstand bringt nichts zurück).
  async function enforce(){
    if (!window.Cloud?.sb || !S()?.pid) return [];
    const gone = [];
    try {
      for (const l of (await rpc("wager_losses", { p_pid: S().pid })) || []){
        const c = S().cars[l.car];
        if (c?.owned && (c.got || 0) < l.at && UI.loseCar(l.car)) gone.push(`${CAR_DEFS[l.car]?.name ?? l.car} gehört ${l.to ?? "deinem Rivalen"}`);
      }
    } catch {}
    if (gone.length) UI.toast("🏆 " + gone.join(" · "));
    return gone;
  }
  // XP für ein Rivalen-Rennen: zwischen Grün und Blau (nie mehr als Blau)
  function xpFor(win){
    const L = carOf()[1].lvl ?? 1;
    const g = mobXp(L) * RARITY.green.xpM, b = mobXp(L) * RARITY.blue.xpM;
    return Math.round(Math.min(b, (g + b) / 2) * (win ? 1 : 0.35));
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  function etOf(k, st){ try { return carSimET(k, st).toFixed(2); } catch { return "—"; } }
  const partsLine = up => `Motor ${up?.engine ?? 0} · Turbo ${up?.turbo ?? 0} · Reifen ${up?.tires ?? 0} · NOS ${up?.nos ?? 0}`;
  function carBox(c, mine){
    const R = RARITY[carRarity(c.car)], C = CLASSES[carClass(c.car)];
    return `<div class="rv-car ${mine ? "me" : ""}">
      <div class="rv-who"><b class="lvb sm r-${carRarity(c.car)}"><i>${c.lvl}</i></b><div><b>${esc(c.name)}${mine ? " (Du)" : ""}</b>
        <small>${esc(CAR_DEFS[c.car]?.name ?? c.car)}</small>
        <small><span style="color:${R.col}">${R.n}</span> · <span style="color:${C.col}">${C.icon} ${C.name}</span></small></div></div>
      <img id="rvImg${mine ? "Me" : "Opp"}" alt="">
      <div class="rv-stats"><span>≈ <b>${etOf(c.car, { up: c.up, tune: c.tune, tal: c.tal, lvl: c.lvl })}s</b></span><span>${fmt$(c.money ?? 0)}</span></div>
      <div class="rv-parts">${partsLine(c.up)}</div></div>`;
  }
  function tabs(){
    const n = friends.filter(f => online.has(f.pid)).length;
    return `<div class="rv-tabs"><button data-tab="near" class="${tab === "near" ? "on" : ""}">📡 In der Nähe</button>
      <button data-tab="friends" class="${tab === "friends" ? "on" : ""}">👥 Freunde${n ? ` <em>${n} online</em>` : ""}</button></div>`;
  }
  function bindTabs(el){ el.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { if (phase === "search") toHome(); tab = b.dataset.tab; render(); }); }
  function render(){
    const el = $("rivBody"); if (!el) return;
    if (phase === "locate"){
      el.innerHTML = `<div class="rv-radar on"><i></i><i></i><i></i></div><p class="duostat">Standort wird ermittelt…<br><small>Geteilt wird nur eine grobe Zone (~40 km), nie deine genaue Position.</small></p>`;
      return;
    }
    if (phase === "search"){
      const T = tier(), n = searchers().length, near = searchers().filter(p => eligible(p, T)).length, s = Math.floor((Date.now() - t0) / 1000);
      const L = carOf()[1].lvl ?? 1;
      el.innerHTML = tabs() + `<div class="rv-radar on"><i></i><i></i><i></i><b>${s}s</b></div>
        <p class="rv-tier">Suche ${geo ? T.label : "überall"}</p>
        <p class="duostat">${geoNote ? esc(geoNote) + " · " : ""}Level ${Math.max(1, L - T.dl)}–${L + T.dl} · ${n ? `${n} ${n === 1 ? "Fahrer sucht" : "Fahrer suchen"} gerade${near ? ` · ${near} passend` : ""}` : "gerade sucht sonst niemand"}</p>
        <button class="mbtn" id="rvCancel" style="width:100%;margin-top:12px">Suche abbrechen</button>`;
      $("rvCancel").onclick = () => toHome();
      bindTabs(el);
      return;
    }
    if (phase === "invite"){
      el.innerHTML = `<div class="rv-radar on"><i></i><i></i><i></i></div><p class="rv-tier">Warte auf ${esc(out?.name ?? fname(out?.to))}…</p>
        <p class="duostat">Die Herausforderung ist unterwegs.</p><button class="mbtn" id="rvCancel" style="width:100%;margin-top:12px">Abbrechen</button>`;
      $("rvCancel").onclick = () => { if (out) send("bye", { to: out.to, mid: "" }); toHome("friends"); };
      return;
    }
    if (phase === "error"){
      el.innerHTML = `<div class="card"><p class="duostat">Keine Verbindung zum Server.</p><button class="mbtn primary" id="rvRetry" style="width:100%">Nochmals versuchen</button></div>`;
      $("rvRetry").onclick = () => { phase = "home"; startSearch(); };
      return;
    }
    if (phase === "starting" || phase === "racing"){
      el.innerHTML = `<div class="card"><p class="duostat">Rennen wird gestartet…</p><div class="spin"></div></div>`;
      return;
    }
    if (phase === "match" && m) return renderMatch(el);
    // Startseite
    if (tab === "near"){
      const n = everyone().filter(p => p.seek).length;
      el.innerHTML = tabs() + `<div class="card rv-hero"><div class="rv-radar"><i></i><i></i><i></i></div>
          <h3 style="text-align:center">Rivalen in der Nähe</h3>
          <p class="duostat">Zufälliger Gegner mit ähnlichem Level, der gerade auch sucht. Du siehst sein Auto und entscheidest:
            <b>Preisgeld-Rennen</b> oder <b style="color:#ffc84a">🏆 Titelkampf</b> — Auto gegen Auto.</p>
          <p class="duostat" style="color:#8fd0ff">Sieg: +${xpFor(true)} XP · Niederlage: +${xpFor(false)} XP</p>
          ${rivReason() ? `<div class="rv-warn"><b>🔒 ${esc(rivReason())}</b><p>Fahr Radar-Rennen, bis ein Auto LV ${RIV_LVL} hat, und wähl es in der Garage. Ein Duell Handy an Handy geht immer.</p></div>` : ""}
          <p class="duostat">🏆 Titelkampf (Auto gegen Auto) ab Auto-Level ${HC_LVL}.</p>
          <button class="mbtn primary" id="rvSearch" style="width:100%" ${rivReason() ? "disabled" : ""}>📡 RIVALEN SUCHEN</button>
          <p class="duostat">${n ? `${n} ${n === 1 ? "Fahrer sucht" : "Fahrer suchen"} gerade` : ""}</p></div>`;
      $("rvSearch").onclick = startSearch;
    } else {
      const list = friends.slice().sort((a, b) => online.has(b.pid) - online.has(a.pid));
      el.innerHTML = tabs() + `<div class="card"><h3>Dein Freundes-Code</h3>
          <div class="rv-code">${esc(myCode ?? "······")}</div>
          <button class="mbtn" id="rvShare" style="width:100%">🔗 Code / Link teilen</button></div>
        <div class="card"><h3>Freund hinzufügen</h3>
          <input class="codein" id="rvAdd" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="CODE" aria-label="Freundes-Code">
          <button class="mbtn" id="rvAddBtn" style="width:100%;margin-top:10px">Hinzufügen</button></div>
        <div class="card"><h3>Freunde (${friends.length})</h3>
          ${list.length ? list.map(f => { const p = presOf(f.pid), on = !!p;
            return `<div class="rv-friend"><i class="dot ${on ? (p.busy ? "busy" : "on") : ""}"></i><div><b>${esc(f.name)}</b>
              <small>${on ? (p.busy ? "fährt gerade" : `online · ${esc(CAR_DEFS[p.car]?.name ?? "")} LV ${p.lvl}`) : "offline"}</small></div>
              ${on && !p.busy ? `<button class="mbtn primary sm" data-ch="${esc(f.pid)}">⚔ Fahren</button>` : !on ? `<button class="mbtn sm" data-poke="${esc(f.pid)}">🔔 Anstupsen</button>` : ""}
              <button class="rv-x" data-rm="${esc(f.pid)}" aria-label="Entfernen">✕</button></div>`; }).join("")
            : `<p class="duostat">Noch keine Freunde. Teile deinen Code — wer ihn eingibt, ist automatisch gegenseitig befreundet.</p>`}
          <p class="duostat">Kommt ein Freund online, bekommst du im Spiel Bescheid.</p></div>`;
      $("rvShare").onclick = share;
      const inp = $("rvAdd");
      inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); };
      $("rvAddBtn").onclick = () => addFriend(inp.value);
      el.querySelectorAll("[data-ch]").forEach(b => b.onclick = () => challenge(b.dataset.ch));
      el.querySelectorAll("[data-poke]").forEach(b => b.onclick = () => poke(b.dataset.poke));
      el.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { if (confirm(`${fname(b.dataset.rm)} als Freund entfernen?`)) removeFriend(b.dataset.rm); });
    }
    bindTabs(el);
  }
  function renderMatch(el){
    const me = card(), o = m.opp, P = m.prop;
    const cap = Math.min(S().money, o.money ?? 0);
    const hcBlock = hcReason() || (!o.hc ? `${o.name} kann keinen Titelkampf fahren (${o.hcLvl === false || (o.lvl ?? 1) < HC_LVL ? `Auto erst LV ${o.lvl}, nötig ${HC_LVL}` : "Shop-Auto oder nur 1 Auto"}).` : null);
    const winCar = CAR_DEFS[o.car]?.name ?? o.car, myCar = CAR_DEFS[me.car].name;
    const ownsIt = S().cars[o.car]?.owned;
    el.innerHTML = `${m.friend ? `<p class="rv-tier">👥 Freundes-Duell</p>` : ""}<div class="rv-match">${carBox(me, true)}<div class="duelvs">VS</div>${carBox(o, false)}</div>
      ${lostNote(me)}
      ${m.oppChanged ? `<div class="rv-warn rv-chg"><b>${m.oppChanged === "car" ? `🚗 ${esc(o.name)} hat das Auto gewechselt` : `🔧 ${esc(o.name)} hat nachgerüstet`}</b><p>Prüf die neuen Daten unten — Zustimmungen wurden zurückgesetzt.</p></div>` : ""}
      ${compare(me, o)}
      ${chanceBlock(me, o, P.mode === "hardcore")}
      <div class="rv-row2"><button class="mbtn" id="rvPick">🚗 Auto wählen</button><button class="mbtn" id="rvTune">🔧 Nachrüsten</button></div>
      ${m.oppTuning ? `<p class="duostat" style="color:var(--amb)">🔧 ${esc(o.name)} rüstet gerade in der Garage nach…</p>` : ""}
      <div class="card"><h3>Um was fahrt ihr?</h3>
        <div class="rv-modes">
          <button class="rv-mode ${P.mode === "cash" ? "on" : ""}" data-mode="cash"><b>Normales Rennen</b><small>Preisgeld-Rennen · Sieger bekommt das Preisgeld des Gegners</small></button>
          <button class="rv-mode hc ${P.mode === "hardcore" ? "on" : ""}" data-mode="hardcore" ${hcBlock ? "disabled" : ""}><b>🏆 TITELKAMPF</b><small>${hcBlock ? esc(hcBlock) : "Auto gegen Auto"}</small></button>
        </div>
        ${P.mode === "cash" ? `<div class="rv-stakes">${STAKES.map(v => `<button class="rv-stake ${P.stake === v ? "on" : ""}" data-stake="${v}" ${v > cap ? "disabled" : ""}>${v ? fmt$(v) : "Nur Ehre"}</button>`).join("")}</div>` : ""}
        ${P.mode === "hardcore" ? `<div class="rv-warn">
            <b>⚠️ ACHTUNG — TITELKAMPF</b>
            <p>Wer verliert, <b>verliert sein Auto</b>. Verlierst du, gehört dein <b>${esc(myCar)} (LV ${me.lvl})</b> mit allen Teilen, Talenten und Style <b>${esc(o.name)}</b> — es verschwindet aus deiner Sammlung.
               Gewinnst du, gehört sein <b>${esc(winCar)} (LV ${o.lvl})</b> dir${ownsIt ? " (du hast das Modell schon: du behältst das höhere Level, sonst gibt's Bolts)" : ""}.</p>
            <p>Aufgeben, App schliessen oder Verbindung trennen zählt als <b>Niederlage</b>. Das kann nicht rückgängig gemacht werden.</p>
            <label class="rv-ack"><input type="checkbox" id="rvAck" ${m.ack ? "checked" : ""}> ${(etOf(me) ?? 0) - (etOf(o) ?? 0) > CH_NONE ? "Ich weiss, dass mein Auto keine realistische Chance hat. Verliere ich, ist es weg — selbst schuld." : "Ich habe verstanden: Es geht um mein Auto."}</label>
          </div>` : ""}
        <p class="duostat" style="color:#8fd0ff">+${xpFor(true)} XP bei Sieg · +${xpFor(false)} XP bei Niederlage</p>
      </div>
      <p class="duostat">${m.okOpp ? `<b style="color:var(--grn)">${esc(o.name)} hat zugestimmt ✓</b>` : `${esc(o.name)} entscheidet…`}${m.okMe ? " · Du hast zugestimmt ✓" : ""}</p>
      <button class="mbtn primary ${P.mode === "hardcore" ? "hcgo" : ""}" id="rvAgree" style="width:100%" ${m.okMe ? "disabled" : ""}>${m.okMe ? "Warte auf " + esc(o.name) + "…" : P.mode === "hardcore" ? "🏆 ZUSTIMMEN — TITELKAMPF" : P.stake ? `ZUSTIMMEN · ${fmt$(P.stake)}` : "ZUSTIMMEN"}</button>
      <button class="mbtn" id="rvNo" style="width:100%;margin-top:8px">${m.friend ? "Ablehnen" : "Ablehnen — weitersuchen"}</button>`;
    UI.carImage(me.car, me.style).then(i => { const x = $("rvImgMe"); if (x) x.src = i.src; });
    if (CAR_DEFS[o.car]) UI.carImage(o.car, o.style).then(i => { const x = $("rvImgOpp"); if (x) x.src = i.src; });
    el.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => propose(b.dataset.mode, b.dataset.mode === "cash" ? Math.min(P.mode === "cash" ? P.stake : defaultStake(o), cap) : 0));
    el.querySelectorAll("[data-stake]").forEach(b => b.onclick = () => propose("cash", +b.dataset.stake));
    const ack = $("rvAck"); if (ack) ack.onchange = () => { m.ack = ack.checked; };
    $("rvAgree").onclick = agree;
    $("rvNo").onclick = bye;
    $("rvTune").onclick = tune;
    $("rvPick").onclick = pickCar;
    el.querySelectorAll("[data-alt]").forEach(b => b.onclick = () => b.dataset.alt === "__next" ? bye() : switchCar(b.dataset.alt));
  }
  // Nach einem verlorenen Titelkampf: klar sagen, dass das Auto weg ist und welches jetzt fährt
  function lostNote(me){
    const L = S().lostCar;
    if (!L || Date.now() - L.at > 15 * 60000) return "";
    return `<div class="rv-warn"><b>🏆 Dein ${esc(CAR_DEFS[L.car]?.name ?? L.car)} gehört jetzt ${esc(L.to)}</b>
      <p>Für dieses Rennen fährst du deinen <b>${esc(CAR_DEFS[me.car].name)} (LV ${me.lvl})</b>. Tippe «Auto wählen», um ein anderes zu nehmen.</p></div>`;
  }
  function switchCar(k){
    if (phase !== "match" || k === S().current || !S().cars[k]?.owned) return;
    S().current = k; UI.persist();
    if (S().lostCar) S().lostCar.at = 0;   // Hinweis erledigt
    m.okMe = m.okOpp = false; m.ack = false; m.agreedSig = null;
    if (m.prop.mode === "hardcore" && hcReason()) propose("cash", 0);
    send("card", { to: m.opp.pid, mid: m.mid, card: card() }); retrack(); render();
  }
  // AUTO WÄHLEN im Match: alle eigenen Autos mit ≈ Zeit gegen den Gegner — «gleich stark / schwächer / stärker».
  // Wechsel → neue Daten an den Gegner, BEIDE Zustimmungen weg (Fingerabdruck), Gegner sieht den Wechsel.
  function pickCar(){
    if (phase !== "match") return;
    const o = m.opp, oEt = statsOf(o)?.et, hc = m.prop.mode === "hardcore";
    const rows = CAR_KEYS.filter(k => S().cars[k]?.owned).map(k => {
      const c = S().cars[k], st = statsOf({ car: k, lvl: c.lvl ?? 1, up: c.up, tune: c.tune, tal: c.tal ?? {} }), et = st?.et ?? 99;
      const d = oEt ? et - oEt : 0, L = c.lvl ?? 1;
      const why = L < RIV_LVL ? `ab LV ${RIV_LVL}` : hc && L < HC_LVL ? `Titelkampf ab LV ${HC_LVL}` : hc && (c.iap || CAR_DEFS[k].vault) ? "nicht im Titelkampf" : "";
      const tag = Math.abs(d) <= 0.15 ? ["eq", "≈ gleich stark"] : d > CH_NONE ? ["no", `keine Chance · +${d.toFixed(2)}s`] : d > 0 ? ["lo", `schwächer · +${d.toFixed(2)}s`] : ["hi", `stärker · −${Math.abs(d).toFixed(2)}s`];
      return { k, L, et, d, why, tag, cur: k === S().current };
    }).sort((a, b) => !!a.why - !!b.why || Math.abs(a.d) - Math.abs(b.d));
    const w = document.createElement("div"); w.className = "rv-pop"; w.id = "rvPick";
    w.innerHTML = `<div class="rv-pop-in rv-pick"><b class="rv-pop-t">🚗 Auto für dieses Rennen</b>
      <p>Gegner: <b>${esc(CAR_DEFS[o.car]?.name ?? o.car)} LV ${o.lvl}</b>${oEt ? ` · ≈ ${oEt.toFixed(2)}s` : ""}</p>
      <div class="rv-plist">${rows.map(r => `<button class="rv-pc ${r.cur ? "cur" : ""}" data-k="${r.k}" ${r.why ? "disabled" : ""}>
        <span><b>${esc(CAR_DEFS[r.k].name)}</b><small>LV ${r.L} · ≈ ${r.et.toFixed(2)}s${r.cur ? " · aktuell" : ""}</small></span>
        <i class="${r.why ? "no" : r.tag[0]}">${r.why ? "🔒 " + r.why : r.tag[1]}</i></button>`).join("")}</div>
      <p class="duostat">Wechselst du, sieht ${esc(o.name)} das neue Auto und muss neu zustimmen.</p>
      <div class="rv-pop-btns"><button class="mbtn" data-x="1">Abbrechen</button></div></div>`;
    w.onclick = e => {
      if (e.target === w || e.target.closest("[data-x]")) return w.remove();
      const b = e.target.closest("[data-k]"); if (!b || b.disabled) return;
      w.remove(); switchCar(b.dataset.k);
    };
    document.body.appendChild(w);
  }
  // ── CHANCE (Claw 30.10.): ≈ Zeit-Unterschied → ausgeglichen / Aussenseiter / keine Chance ──
  const CH_FAIR = 0.35, CH_NONE = 0.6;
  const etCache = new Map();
  function etOf(c){
    const key = sig(c); if (etCache.has(key)) return etCache.get(key);
    const v = statsOf(c)?.et ?? null; etCache.set(key, v); return v;
  }
  const myEt = () => { try { return etOf(card()); } catch { return null; } };
  const chance = d => d > CH_NONE ? "none" : d > CH_FAIR ? "under" : d < -CH_NONE ? "fav" : "fair";
  // eigene Autos mit echter Chance gegen den Gegner (für Titelkampf: LV ≥ 20, kein Shop-Auto)
  function fairCars(oEt, hc){
    return CAR_KEYS.filter(k => S().cars[k]?.owned && k !== S().current).map(k => {
      const c = S().cars[k], L = c.lvl ?? 1;
      if (L < RIV_LVL || (hc && (L < HC_LVL || c.iap || CAR_DEFS[k].vault))) return null;
      const et = etOf({ car: k, lvl: L, up: c.up, tune: c.tune, tal: c.tal ?? {} });
      return et != null && et - oEt <= CH_FAIR ? { k, L, d: et - oEt } : null;
    }).filter(Boolean).sort((a, b) => Math.abs(a.d) - Math.abs(b.d)).slice(0, 4);
  }
  function chanceBlock(me, o, hc){
    const a = etOf(me), b = etOf(o); if (a == null || b == null) return "";
    const d = a - b, ch = chance(d), myN = esc(CAR_DEFS[me.car].name), oN = esc(CAR_DEFS[o.car]?.name ?? o.car);
    if (ch === "fair") return `<p class="rv-chance fair">⚖️ Ausgeglichen — ≈ ${Math.abs(d).toFixed(2)}s Unterschied. Fahrkönnen entscheidet.</p>`;
    if (ch === "fav") return `<p class="rv-chance fav">💪 Du bist klar stärker (≈ ${Math.abs(d).toFixed(2)}s schneller) — ${esc(o.name)} hat kaum eine Chance.</p>`;
    const alt = fairCars(b, hc);
    const altHtml = alt.length
      ? `<p>Diese Autos aus deiner Sammlung hätten eine echte Chance:</p><div class="rv-alts">${alt.map(x => `<button class="mbtn sm" data-alt="${x.k}">${esc(CAR_DEFS[x.k].name)} · LV ${x.L} · ${Math.abs(x.d) <= 0.15 ? "≈ gleich" : x.d > 0 ? "+" + x.d.toFixed(2) + "s" : "−" + Math.abs(x.d).toFixed(2) + "s"}</button>`).join("")}</div>`
      : `<p><b>Keines deiner Autos hat gegen ${oN} eine reale Chance.</b> Besser weitersuchen.</p><button class="mbtn sm" data-alt="__next">Weitersuchen</button>`;
    if (ch === "under") return `<div class="rv-warn rv-under"><b>⚠️ Du bist Aussenseiter — ≈ ${d.toFixed(2)}s langsamer</b>
      <p>Mit einem perfekten Start und perfekten Schaltungen ist ein Sieg möglich, aber schwer.</p>${hc ? altHtml : ""}</div>`;
    return `<div class="rv-warn rv-none"><b>⛔ Dein ${myN} hat realistisch keine Chance</b>
      <p>≈ ${d.toFixed(2)}s langsamer als ${esc(o.name)}s ${oN} — das holt auch die beste Fahrt nicht auf.${hc ? ` Verlierst du, ist dein ${myN} weg. <b>Auf eigenes Risiko.</b>` : ""}</p>${altHtml}</div>`;
  }
  // PS / Drehmoment / Gewicht / NOS / ≈ Zeit nebeneinander — das bessere grün
  function statsOf(c){
    try {
      const def = CAR_DEFS[c.car], sp = buildSpec(c.car, { up: c.up, tune: c.tune, tal: c.tal, lvl: c.lvl });
      return { ps: carPS(def, sp.powerMul), nm: Math.round(Math.max(...def.torque.map(t => t[1])) * sp.powerMul), kg: sp.mass, nos: sp.nosMax,
               et: carSimET(c.car, { up: c.up, tune: c.tune, tal: c.tal, lvl: c.lvl }) };
    } catch { return null; }
  }
  function compare(me, o){
    const a = statsOf(me), b = statsOf(o);
    if (!a || !b) return "";
    const rows = [["Leistung", "ps", " PS", 1, 0], ["Drehmoment", "nm", " Nm", 1, 0], ["Gewicht", "kg", " kg", -1, 0], ["NOS", "nos", " s", 1, 1], ["≈ Zeit ¼ Meile", "et", " s", -1, 2]];
    return `<div class="card rv-cmp"><h3>Leistung im Vergleich</h3>
      <div class="rv-cmp-h"><span></span><b>Du</b><b>${esc(o.name)}</b></div>
      ${rows.map(([l, k, u, dir, d]) => { const x = a[k], y = b[k], better = (x - y) * dir;
        return `<div class="rv-cmp-r"><span>${l}</span><b class="${better > 1e-9 ? "w" : ""}">${x.toFixed(d)}${u}</b><b class="${better < -1e-9 ? "w" : ""}">${y.toFixed(d)}${u}</b></div>`; }).join("")}
    </div>`;
  }

  $("rivBack")?.addEventListener("click", close);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) retrack(); });
  // Start: online gehen + offene Abrechnungen nachholen (z. B. Rennen vor App-Abbruch)
  setTimeout(async () => {
    boot();
    const msgs = (await settle()).filter(Boolean);
    enforce();
    if (msgs.length) popup(msgs.map(x => `<p>${x.html}</p>`).join(""), [{ label: "OK" }]);
  }, 2500);

  // Freundes-Code für die Auto-Karte (UI): holt ihn beim ersten Mal vom Server
  async function friendCode(){
    if (!myCode) try { myCode = await rpc("player_hello", { p_pid: pid(), p_name: myName() }); } catch {}
    return myCode ? { code: myCode, url: FRIEND_LINK(myCode) } : null;
  }
  return { rivReason, RIV_LVL, HC_LVL, open, close, nameChanged, friendCode, rematch, enforce, tune, inMatch, poke, addFriend, addFriendPid, isFriend: p => isFriend(p), myPid: () => pid(), challenge, settle, settleAfterRace, xpFor, raceDone,
    _debug: () => ({ phase, tab, geo, m, out, live, myCode, friends, online: [...online], n: everyone().length }) };
})();
window.Rivals = Rivals;
