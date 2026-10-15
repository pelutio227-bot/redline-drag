// live.js — Live-VS-Duell über Supabase Realtime (Broadcast-Channel).
// Ablauf: Ersteller öffnet Lobby → teilt Link (?duel=CODE) → Beitreter wählt
// Auto (Neuling: erst Starter-Wahl) → Ersteller legt Einsatz fest → beide
// «Bereit» → synchroner Start → live fahren → Ergebnis → zurück in die Lobby
// («Nochmal» = direkt bereit, «Auto wechseln» = neues Auto, dann bereit).
const Live = (() => {
  let ch = null, code = null, isHost = false;
  let me = null, rival = null;         // {name, car, up, tune, style, money, ready}
  let bet = 0, sendT = 0, inRace = false, lobbyOpen = false;

  const $ = id => document.getElementById(id);
  const rndCode = () => Array.from({length:6}, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join("");

  function myState(ready){
    const cs = UI.save.cars[UI.save.current];
    return { name: UI.save.name, car: UI.save.current, up: cs.up, tune: cs.tune,
             style: cs.style, money: UI.save.money, ready: !!ready };
  }

  // ── Lobby öffnen (host: ohne Code, joiner: mit Code aus Link) ──────────────
  function openLobby(joinCode){
    if (!Cloud.sb){ UI.toast("Live-Duell braucht Internet."); return; }
    isHost = !joinCode;
    code = joinCode || rndCode();
    me = myState(false); rival = null; bet = 0; lobbyOpen = true;
    connect();
    UI.show("duel");
    renderLobby();
  }

  function connect(){
    if (ch) Cloud.sb.removeChannel(ch);
    ch = Cloud.sb.channel("duel-" + code, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "state" },  ({ payload }) => { rival = payload; renderLobby(); })
      .on("broadcast", { event: "hello" },  () => sendState())
      .on("broadcast", { event: "bet" },    ({ payload }) => { bet = payload.bet; renderLobby(); })
      .on("broadcast", { event: "go" },     ({ payload }) => startLiveRace(payload))
      .on("broadcast", { event: "race" },   ({ payload }) => Race.setRemote(payload))
      .on("broadcast", { event: "leave" },  () => { rival = null; if (lobbyOpen) { UI.toast("Gegner hat die Lobby verlassen"); renderLobby(); } })
      .subscribe(st => { if (st === "SUBSCRIBED"){ send("hello", {}); sendState(); } });
  }
  function send(event, payload){ ch?.send({ type: "broadcast", event, payload }); }
  function sendState(){ if (me) send("state", me); }

  function leave(){
    lobbyOpen = false;
    send("leave", {});
    if (ch){ Cloud.sb.removeChannel(ch); ch = null; }
    rival = null; code = null;
    UI.show("menu");
  }

  // ── Lobby-UI ───────────────────────────────────────────────────────────────
  const BETS = [0, 200, 1000, 5000];
  async function renderLobby(){
    if (!lobbyOpen) return;
    $("duelCode").textContent = code;
    // Mein Auto
    const myDef = CAR_DEFS[me.car];
    $("duelMe").innerHTML = `<b>${me.name}</b><span>${myDef.name}</span><img alt="">`;
    carImage(me.car, me.style).then(img => { const i = $("duelMe").querySelector("img"); if (i) i.src = img.src; });
    // Gegner
    if (rival){
      const rDef = CAR_DEFS[rival.car];
      $("duelRival").innerHTML = `<b>${rival.name}</b><span>${rDef.name}${rival.ready ? ' · <i style="color:var(--grn)">BEREIT ✓</i>' : " · wählt…"}</span><img alt="">`;
      carImage(rival.car, rival.style).then(img => { const i = $("duelRival").querySelector("img"); if (i) i.src = img.src; });
    } else {
      $("duelRival").innerHTML = `<b class="mut">Warte auf Gegner…</b><span>Schick ihm den Link ↓</span><div class="spin"></div>`;
    }
    // Einsatz (nur Host wählt)
    const bx = $("duelBets");
    bx.innerHTML = BETS.map(b =>
      `<button class="${b===bet?"on":""}" ${isHost?"":"disabled"} data-b="${b}">${b===0?"Just for Fun":"$"+b.toLocaleString("de-CH")}</button>`).join("");
    if (isHost) bx.querySelectorAll("button").forEach(b => b.onclick = () => {
      bet = +b.dataset.b; send("bet", { bet }); renderLobby();
    });
    $("duelBetInfo").textContent = bet > 0
      ? `Der Gewinner bekommt $${bet.toLocaleString("de-CH")} vom Verlierer.`
      : "Kein Einsatz — es geht um die Ehre.";
    // Bereit-Button
    const rb = $("duelReady");
    rb.textContent = me.ready ? "BEREIT ✓ — warte…" : "BEREIT!";
    rb.classList.toggle("armed", !me.ready);
    // Beide bereit → Host zündet
    if (isHost && me.ready && rival?.ready) fireGo();
  }

  function toggleReady(){
    me = myState(!me.ready);
    sendState(); renderLobby();
  }

  function fireGo(){
    const payload = {
      startAt: Date.now() + 3000,
      greenAt: 2.6 + Math.random()*0.8,
      bet: Math.min(bet, me.money, rival?.money ?? bet),
    };
    send("go", payload);
    startLiveRace(payload);
  }

  // ── Rennen ─────────────────────────────────────────────────────────────────
  function startLiveRace(go){
    if (!rival) return;
    lobbyOpen = false; inRace = true;
    const opp = { name: rival.name, emoji: "🏁", car: rival.car, power: 1,
      reaction: [9, 9], slack: 9999, prize: 0, up: rival.up, tune: rival.tune,
      style: rival.style, live: true, liveBet: go.bet };
    document.querySelectorAll(".screen").forEach(el => el.classList.remove("on"));
    document.getElementById("hud").classList.add("on");
    document.getElementById("hudVs").textContent = "LIVE VS " + rival.name;
    Race.start({
      carKey: UI.save.current, carState: UI.save.cars[UI.save.current], opp,
      live: { startAt: go.startAt, greenAt: go.greenAt },
      onDone: res => finishLive(res, go.bet),
    });
    // Eigene Position ~8×/s senden
    clearInterval(sendT);
    sendT = setInterval(() => {
      if (!Race.active()){ clearInterval(sendT); return; }
      const s = Race.snapshot();
      if (s) send("race", s);
    }, 125);
  }

  function finishLive(res, effBet){
    clearInterval(sendT); inRace = false;
    // Geld: Gewinner +Einsatz, Verlierer −Einsatz (nie unter 0)
    if (effBet > 0){
      if (res.win) UI.save.money += effBet;
      else UI.save.money = Math.max(0, UI.save.money - effBet);
    }
    UI.showLiveResults(res, rival?.name ?? "RIVALE", effBet);
    // zurück in die Lobby vorbereiten
    me = myState(false); sendState();
  }

  function backToLobby(){
    lobbyOpen = true;
    me = myState(false); sendState();
    UI.show("duel");
    renderLobby();
  }

  // ── Auto wechseln (eigene gekaufte Autos) ──────────────────────────────────
  async function renderCarPick(){
    const el = $("duelCars");
    el.innerHTML = "";
    const owned = CAR_KEYS.filter(k => UI.save.cars[k].owned);
    for (const k of owned){
      const b = document.createElement("button");
      b.className = "duelcar" + (k === UI.save.current ? " on" : "");
      b.innerHTML = `<img alt=""><span>${CAR_DEFS[k].name}</span>`;
      carImage(k, UI.save.cars[k].style).then(img => { const i = b.querySelector("img"); if (i) i.src = img.src; });
      b.onclick = () => {
        UI.save.current = k; UI.persist();
        me = myState(false); sendState();
        el.classList.remove("open");
        renderLobby();
      };
      el.appendChild(b);
    }
    el.classList.add("open");
  }

  async function shareLink(){
    const url = location.origin + location.pathname + "?duel=" + code;
    const txt = `REDLINE ⚡ LIVE-DUELL — fahr JETZT gegen mich! Raum ${code}`;
    if (navigator.share){ try { await navigator.share({ title: "REDLINE Live", text: txt, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); UI.toast("Link kopiert — verschick ihn!"); }
    catch { prompt("Link kopieren:", url); }
  }

  return { openLobby, leave, toggleReady, renderCarPick, shareLink, backToLobby,
    get active(){ return inRace; } };
})();

window.Live = Live;
