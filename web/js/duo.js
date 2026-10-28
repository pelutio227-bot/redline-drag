// duo.js — «iPhone Duo»: zwei Geräte fahren gegeneinander (22.10.2026).
//
// Transport: Supabase Realtime (Broadcast + Presence) — ist im Spiel schon drin
// (Cloud.sb), läuft in Web UND Store-App, braucht kein neues Backend. Ein
// Cloudflare-Worker mit WebSocket hätte Durable Objects + eigenes Deploy gebraucht.
//
// Fairness bei Latenz:
// - Jedes Gerät simuliert NUR sein eigenes Auto, in festen Physik-Ticks (sim.js).
// - Gemeinsamer Start: Host legt startAt (Host-Uhr) + Grün-Zeitpunkt fest; der
//   Gast rechnet per Ping/Pong-Uhrenabgleich in seine Uhr um. Jede Zeit wird ab
//   dem EIGENEN Grün gemessen → Netz-Verzögerung verfälscht keine Zeit.
// - Im Ziel schickt jedes Gerät seine Eingaben (Tick + Gas/NOS/Schalten). Beide
//   Geräte fahren den Lauf des Gegners mit dessen Setup nach (replayRun) →
//   identisches Ergebnis auf beiden iPhones, Manipulation fällt auf.
// - Während des Rennens: Positions-Snapshots mit Tick-Stempel (~8/s) nur für die
//   Anzeige des Gegner-Autos.
// Abbruch (✕) = Aufgabe; Verbindungsverlust = Rennen nicht gewertet.
const Duo = (() => {
  const PUBLIC_URL = "https://l.abooz.ch/";
  // Universal Link (28.10.): /duo/CODE öffnet auf dem iPhone direkt die App (apple-app-site-association),
  // ohne App landet man auf l.abooz.ch → iPhone: App Store, sonst Web-Spiel
  const duoLink = c => PUBLIC_URL + "duo/" + c;
  const $ = id => document.getElementById(id);
  const myId = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).slice(0, 18);
  let ch = null, code = null, host = false, phase = "start";
  let me = null, rival = null, offset = 0, synced = false, pings = [];
  let go = null, myFinal = null, rivalFinal = null, lastSeen = 0, watchT = 0, sendT = 0, hbT = 0, finT = 0, joinT = 0;
  let resolved = false;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const S = () => UI.save;
  function myName(){ const n = S().name; return n && n !== "RACER" ? n : (host ? "FAHRER 1" : "FAHRER 2"); }
  function myState(ready = false){
    const k = S().current, cs = S().cars[k];
    return { id: myId, host, name: myName(), car: k, up: cs.up, tune: cs.tune, style: cs.style,
             ready, synced: host || synced, v: 1 };
  }
  const send = (event, payload) => ch?.send({ type:"broadcast", event, payload });
  const sendState = () => { if (me) send("state", me); };

  // ── Einstieg ───────────────────────────────────────────────────────────────
  function open(joinCode){
    if (!window.Cloud?.sb){ UI.toast("iPhone Duo braucht Internet."); return; }
    if (!S().current){ UI.show("starter"); return; }
    UI.show("duo");
    if (joinCode) return join(joinCode);
    phase = "start"; render();
  }
  function create(){
    host = true;
    code = String(10000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90000));
    connect();
  }
  function join(c){
    c = String(c || "").replace(/\D/g, "").slice(0, 5);
    if (c.length !== 5){ UI.toast("Der Code hat 5 Ziffern."); return; }
    host = false; code = c; connect();
    clearTimeout(joinT);
    joinT = setTimeout(() => {
      if (!rival && phase === "connecting"){ phase = "notfound"; render(); }
    }, 7000);
  }

  function connect(){
    cleanup(true);
    phase = "connecting"; rival = null; synced = false; offset = 0; pings = [];
    me = myState(false);
    render();
    ch = Cloud.sb.channel("redline-duo-" + code, { config: { broadcast: { self:false }, presence: { key: myId } } });
    ch.on("broadcast", { event:"state" }, ({ payload }) => onState(payload))
      .on("broadcast", { event:"hello" }, () => sendState())
      .on("broadcast", { event:"full" },  ({ payload }) => { if (payload.to === myId){ cleanup(); phase = "full"; render(); } })
      .on("broadcast", { event:"ping" },  ({ payload }) => { if (host && payload.from === rival?.id) send("pong", { to: payload.from, t0: payload.t0, th: Date.now() }); })
      .on("broadcast", { event:"pong" },  ({ payload }) => { if (payload.to === myId) onPong(payload); })
      .on("broadcast", { event:"go" },    ({ payload }) => onGo(payload))
      .on("broadcast", { event:"snap" },  ({ payload }) => { if (go && payload.rid === go.rid){ lastSeen = Date.now(); Race.setRemote(payload); } })
      .on("broadcast", { event:"final" }, ({ payload }) => onFinal(payload))
      .on("broadcast", { event:"abort" }, ({ payload }) => onAbort(payload))
      .on("broadcast", { event:"leave" }, ({ payload }) => { if (payload.id === rival?.id) rivalGone(); })
      .on("presence",  { event:"leave" }, ({ key }) => { if (key === rival?.id) rivalGone(); })
      .subscribe(status => {
        if (status === "SUBSCRIBED"){
          ch.track({ id: myId, host });
          send("hello", {}); sendState();
          if (host){ phase = "wait"; render(); }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT"){
          if (phase === "race") return rivalGone(true);
          phase = "error"; render();
        }
      });
    clearInterval(hbT);
    hbT = setInterval(() => { if (phase === "lobby" || phase === "wait") sendState(); }, 3000);
    clearInterval(watchT);
    watchT = setInterval(watchdog, 1000);
  }

  function onState(p){
    if (!p?.id || p.id === myId) return;
    if (host){
      if (rival && rival.id !== p.id){ send("full", { to: p.id }); return; }   // Raum ist für 2
    } else if (!p.host) return;                                                    // Gast hört nur auf den Host
    const first = !rival;
    rival = p; lastSeen = Date.now();
    if (first){
      clearTimeout(joinT);
      window.NativeBridge?.haptic?.("medium");
      if (!host) startClockSync();
      if (phase === "connecting" || phase === "wait") phase = "lobby";
      sendState();
    }
    if (phase === "lobby") render();
    maybeGo();
  }

  // ── Uhren-Abgleich (Gast): 5 Pings, kleinste Laufzeit gewinnt ─────────────
  function startClockSync(){
    pings = [];
    for (let i = 0; i < 5; i++) setTimeout(() => send("ping", { from: myId, t0: Date.now() }), 150 + i*220);
  }
  function onPong(p){
    const now = Date.now(), rtt = now - p.t0;
    pings.push({ rtt, off: p.th - (p.t0 + rtt/2) });
    pings.sort((a, b) => a.rtt - b.rtt);
    offset = pings[0].off;
    if (pings.length >= 3 && !synced){ synced = true; me = { ...me, synced: true }; sendState(); }
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────
  function toggleReady(){
    me = myState(!me.ready);
    sendState(); render(); maybeGo();
  }
  function pickCar(k){
    if (!S().cars[k]?.owned) return;
    S().current = k; UI.persist();
    me = myState(false); sendState(); render();
  }
  function maybeGo(){
    if (!host || phase !== "lobby" || !me?.ready || !rival?.ready || !rival.synced) return;
    const payload = {
      rid: Math.random().toString(36).slice(2, 10),
      startAt: Date.now() + 3600,
      greenAt: +(2.6 + Math.random()*0.8).toFixed(3),
      cars: { [myId]: me, [rival.id]: rival },
    };
    send("go", payload);
    onGo(payload);
  }

  // ── Rennen ─────────────────────────────────────────────────────────────────
  function onGo(p){
    if (phase === "race" || !rival || !p.cars?.[myId] || !p.cars?.[rival.id]) return;
    go = p; myFinal = null; rivalFinal = null; resolved = false;
    phase = "race"; lastSeen = Date.now();
    const mine = p.cars[myId], his = p.cars[rival.id];
    go.mine = mine; go.his = his;
    const startAt = host ? p.startAt : p.startAt - offset;
    document.querySelectorAll(".screen").forEach(el => el.classList.remove("on"));
    UI.hideLevelUp?.();
    $("hud").classList.add("on", "duo");
    $("hudVs").textContent = "iPhone Duo · VS " + his.name;
    window.NativeBridge?.haptic?.("heavy");
    Race.start({
      carKey: mine.car, carState: { up: mine.up, tune: mine.tune, style: mine.style },
      opp: { name: his.name, car: his.car, up: his.up, tune: his.tune, style: his.style },
      duo: { startAt, greenAt: p.greenAt, onLocalFinish: r => setTimeout(() => onLocalFinish(r), 0) },
      onEvent: UI.raceEvent, onDone: () => {},
    });
    clearInterval(sendT);
    sendT = setInterval(() => {
      if (phase !== "race") return clearInterval(sendT);
      const s = Race.snapshot();
      if (s) send("snap", { rid: go.rid, ...s });
    }, 125);
  }
  function onLocalFinish(r){
    if (phase !== "race" || myFinal) return;
    myFinal = r;
    const msg = { rid: go.rid, id: myId, et: r.et, trap: r.trap, rt: r.rt, events: r.events };
    send("final", msg);
    // Broadcast ist «fire and forget» → zweimal nachsenden
    setTimeout(() => phase === "race" && send("final", msg), 900);
    setTimeout(() => phase === "race" && send("final", msg), 2200);
    clearTimeout(finT);
    // Gegner noch unterwegs: max. 20 s warten, dann zählt er als nicht im Ziel
    finT = setTimeout(() => {
      if (phase !== "race" || rivalFinal) return;
      if (Date.now() - lastSeen < 6000) resolve("win", null); else resolve("lost");
    }, 20000);
    tryResolve();
  }
  function onFinal(p){
    if (!go || p.rid !== go.rid || p.id !== rival?.id || rivalFinal) return;
    lastSeen = Date.now();
    // Lauf des Gegners mit SEINEM Setup nachfahren — die Replay-Zeit zählt
    const spec = buildSpec(go.his.car, { up: go.his.up, tune: go.his.tune });
    const rep = replayRun(spec, go.greenAt, p.events || []);
    if (rep.et == null || Math.abs(rep.et - p.et) > 0.005)
      console.warn("[duo] Replay weicht ab", { gemeldet: p.et, replay: rep.et });
    rivalFinal = { et: rep.et, trap: rep.trap, rt: rep.rt, claimed: p.et };
    Race.setRemote({ tick: 1e9, s: 9999, v: 0, fin: true });
    tryResolve();
  }
  function tryResolve(){
    if (!myFinal || !rivalFinal || resolved) return;
    const a = myFinal.et, b = rivalFinal.et;
    const st = b == null ? "win" : Math.abs(a - b) < 0.0005 ? "draw" : a < b ? "win" : "lose";
    resolve(st, b);
  }
  function resolve(status, rivalEt = rivalFinal?.et ?? null){
    if (resolved) return;
    resolved = true;
    clearTimeout(finT); clearInterval(sendT);
    phase = "result";
    me = myState(false); sendState();
    const connected = status !== "lost";
    const show = () => {
      Race.endDuo();
      if (status === "win" || status === "forfeit") AudioSys.winJingle(); else if (status === "lose") AudioSys.loseThud();
      UI.showDuoResults({ status, myEt: myFinal?.et ?? null, rivalEt, trap: myFinal?.trap, rt: myFinal?.rt,
                          rivalName: go?.his?.name ?? rival?.name ?? "GEGNER", connected });
    };
    // Ziel-Moment kurz stehen lassen, bei Abbruch/Verlust sofort
    (status === "win" || status === "lose" || status === "draw") ? setTimeout(show, 1100) : show();
  }
  function abort(){
    if (phase !== "race") return;
    send("abort", { rid: go.rid, id: myId });
    resolve("aborted");
  }
  function onAbort(p){
    if (phase !== "race" || !go || p.rid !== go.rid || p.id !== rival?.id) return;
    resolve("forfeit");
  }

  // ── Verbindung ─────────────────────────────────────────────────────────────
  function watchdog(){
    if (!rival) return;
    const quiet = Date.now() - lastSeen;
    if (phase === "race" && quiet > (myFinal ? 25000 : 6000) && !rivalFinal) rivalGone();
    else if ((phase === "lobby" || phase === "result") && quiet > 12000) rivalGone();
  }
  function rivalGone(selfLost = false){
    const name = rival?.name ?? "Gegner";
    if (phase === "race"){ resolve("lost"); }
    rival = null;
    if (phase === "lobby"){
      phase = host ? "wait" : "gone";
      UI.toast(`${name} hat den Raum verlassen`);
      render();
    } else if (phase === "result" && !selfLost){
      phase = host ? "wait" : "gone";
      UI.toast(`${name} hat den Raum verlassen`);
    }
  }
  function cleanup(keepScreen){
    clearInterval(sendT); clearInterval(hbT); clearInterval(watchT); clearTimeout(finT); clearTimeout(joinT);
    if (ch){ try { send("leave", { id: myId }); ch.untrack?.(); Cloud.sb.removeChannel(ch); } catch {} ch = null; }
    rival = null; go = null;
  }
  function leave(silent){
    if (phase === "race") abort();
    cleanup();
    phase = "start"; code = null;
    if (!silent) UI.show("menu");
  }
  function rematch(){
    if (!rival){ UI.toast("Gegner ist nicht mehr da"); phase = host ? "wait" : "gone"; UI.show("duo"); render(); return; }
    phase = "lobby"; me = myState(true); sendState();
    UI.show("duo"); render(); maybeGo();
  }
  function backToLobby(){
    phase = rival ? "lobby" : (host ? "wait" : "gone");
    me = myState(false); sendState();
    UI.show("duo"); render();
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  function qrCanvas(url){
    const qr = qrcode(0, "M"); qr.addData(url); qr.make();
    const n = qr.getModuleCount(), cell = 6, pad = 2*cell, size = n*cell + 2*pad;
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const c = cv.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, size, size); c.fillStyle = "#111";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) c.fillRect(pad + x*cell, pad + y*cell, cell, cell);
    cv.className = "duoqr"; cv.setAttribute("aria-label", "QR-Code zum Beitreten");
    return cv;
  }
  function etOf(k, st){ try { return carSimET(k, st).toFixed(2); } catch { return "—"; } }
  function render(){
    const el = $("duoBody"); if (!el) return;
    $("duoCodePill").style.display = code && phase !== "start" ? "" : "none";
    $("duoCodeSmall").textContent = code ?? "";
    const card = (html, cls = "") => `<div class="card ${cls}">${html}</div>`;
    if (phase === "start"){
      el.innerHTML = card(`<h3>Neues Duell</h3>
          <p class="mut" style="font-size:12.5px;margin-bottom:12px">Du bekommst einen Code. Das zweite iPhone gibt ihn ein oder scannt den QR-Code.</p>
          <button class="mbtn primary" id="duoCreate" style="width:100%">Raum erstellen</button>`)
        + card(`<h3>Code eingeben</h3>
          <input class="codein" id="duoCodeIn" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" placeholder="•••••" aria-label="5-stelliger Code">
          <button class="mbtn" id="duoJoin" style="width:100%;margin-top:10px">Beitreten</button>`)
        + `<p class="duostat">Beide fahren ihr eigenes getuntes Auto. Gleicher Start, Ergebnis auf beiden Handys.</p>`;
      $("duoCreate").onclick = create;
      const inp = $("duoCodeIn");
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, "").slice(0, 5); if (inp.value.length === 5) inp.blur(); };
      $("duoJoin").onclick = () => join(inp.value);
      inp.onkeydown = e => { if (e.key === "Enter") join(inp.value); };
      return;
    }
    if (phase === "connecting"){
      el.innerHTML = card(`<p class="duostat">${host ? "Raum wird geöffnet…" : `Suche Raum <b>${esc(code)}</b>…`}</p><div class="spin"></div>`);
      return;
    }
    if (phase === "wait"){
      el.innerHTML = card(`<h3 style="text-align:center">Dein Code</h3><div class="duocode">${esc(code)}</div>
          <div id="duoQr"></div>
          <p class="duostat">Zweites iPhone: Redline öffnen → <b>iPhone Duo</b> → Code eingeben.<br>Oder den QR-Code mit der Kamera scannen.</p>
          <div class="spin"></div><p class="duostat">Warte auf Mitspieler…</p>`)
        + `<button class="mbtn" id="duoShare" style="width:100%">🔗 Code teilen</button>`;
      $("duoQr").appendChild(qrCanvas(duoLink(code)));
      $("duoShare").onclick = share;
      return;
    }
    if (phase === "notfound" || phase === "full" || phase === "error" || phase === "gone"){
      const msg = { notfound:`Kein offener Raum mit Code <b>${esc(code)}</b>. Code prüfen — der Raum muss auf dem anderen iPhone offen sein.`,
        full:"Dieser Raum ist schon voll (2 Spieler).", error:"Keine Verbindung zum Server. Internet prüfen und nochmals versuchen.",
        gone:"Dein Mitspieler hat den Raum verlassen." }[phase];
      el.innerHTML = card(`<p class="duostat" style="font-size:14px">${msg}</p>
        <button class="mbtn primary" id="duoAgain" style="width:100%;margin-top:8px">Nochmals versuchen</button>`);
      $("duoAgain").onclick = () => { cleanup(); phase = "start"; code = null; render(); };
      return;
    }
    if (phase === "lobby" || phase === "result"){
      const r = rival;
      const mineEt = etOf(me.car, S().cars[me.car]);
      const hisEt = r ? etOf(r.car, { up: r.up, tune: r.tune }) : "—";
      el.innerHTML = card(`<div class="duelgrid">
          <div class="duelcard"><b>${esc(me.name)} (Du)</b><span>${esc(CAR_DEFS[me.car].name)} · ≈ ${mineEt}s</span><img id="duoMeImg" alt=""></div>
          <div class="duelvs">VS</div>
          <div class="duelcard"><b>${esc(r?.name ?? "…")}</b><span>${r ? esc(CAR_DEFS[r.car]?.name ?? "") + " · ≈ " + hisEt + "s" : ""}${r?.ready ? ' · <i style="color:var(--grn)">BEREIT ✓</i>' : r ? " · wählt…" : ""}</span><img id="duoRivImg" alt=""></div>
        </div>`)
        + card(`<h3>Dein Auto</h3><div class="duocars" id="duoCars"></div>`)
        + `<button class="mbtn primary readybtn ${me.ready ? "" : "armed"}" id="duoReady">${me.ready ? `BEREIT ✓ — warte auf ${esc(r?.name ?? "Gegner")}` : "BEREIT!"}</button>
           <p class="duostat">Sobald beide bereit sind, startet der Countdown auf beiden iPhones gleichzeitig.</p>`;
      UI.carImage(me.car, me.style).then(i => { const x = $("duoMeImg"); if (x) x.src = i.src; });
      if (r && CAR_DEFS[r.car]) UI.carImage(r.car, r.style).then(i => { const x = $("duoRivImg"); if (x) x.src = i.src; });
      const box = $("duoCars");
      CAR_KEYS.filter(k => S().cars[k]?.owned).forEach(k => {
        const b = document.createElement("button");
        b.className = "duocar" + (k === me.car ? " on" : "");
        b.innerHTML = `<img alt=""><span>${esc(CAR_DEFS[k].name)}</span><em>≈ ${etOf(k, S().cars[k])}s</em>`;
        UI.carImage(k, S().cars[k].style).then(i => { const x = b.querySelector("img"); if (x) x.src = i.src; });
        b.onclick = () => pickCar(k);
        box.appendChild(b);
      });
      $("duoReady").onclick = toggleReady;
    }
  }
  async function share(){
    const url = duoLink(code);
    const txt = `REDLINE iPhone Duo — Code ${code}`;
    if (navigator.share){ try { await navigator.share({ title: "Redline Duo", text: txt, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(`${txt} · ${url}`); UI.toast("Code kopiert"); } catch { UI.toast("Code: " + code); }
  }

  document.getElementById("duoBack").addEventListener("click", () => leave());
  // App geht in den Hintergrund → Lobby-Herzschlag pausiert; beim Zurückkommen sofort melden
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ch) sendState(); });

  return { open, leave, abort, rematch, backToLobby,
    get racing(){ return phase === "race"; },
    _debug: () => ({ phase, code, host, offset, synced, rival: rival?.name, myFinal, rivalFinal }) };
})();
window.Duo = Duo;
