// cloud.js — Google-Login + Cloud-Save. Seit 10.07.2026 konsolidiert im
// Supabase-Projekt ekiodhnwdgflhwqtbnio (Pelutio), Schema «redline».
// Lokal (localStorage) bleibt immer die schnelle Wahrheit; die Cloud ist das
// Backup über Geräte hinweg. Beim Login gewinnt der bessere Spielstand.
const Cloud = (() => {
  const SB_URL  = "https://ekiodhnwdgflhwqtbnio.supabase.co";
  const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVraW9kaG53ZGdmbGh3cXRibmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNDgyNDgsImV4cCI6MjA5NjYyNDI0OH0.78ExiZrdRK6zyyWT_pKT7DidfWw0i0qSU5yVknVeGtA";
  const sb = window.supabase?.createClient
    ? window.supabase.createClient(SB_URL, SB_ANON, { db: { schema: "redline" } })
    : null;
  let user = null, pushT = 0;

  // Fortschritt: Season 2 (v3) schlägt alte Stände; dann Summe aller Auto-Level/XP, dann Cash
  const score = s => {
    if (!s) return 0;
    if (!s.s2fresh) return (s.level ?? 0)*1e6 + (s.xp ?? 0);              // alter Stand (vor Neustart) verliert immer
    const prog = Object.values(s.cars || {}).reduce((a, c) => a + (c?.owned ? (c.lvl ?? 1)*1e5 + (c.xp ?? 0) : 0), 0);
    return 1e13 + prog*1e3 + Math.min(9.9e8, s.money ?? 0)/1000;
  };

  async function init(){
    if (!sb) return;
    renderStatus();
    // QR-Pairing: ?pair=CODE (vom Handy gescannt) überlebt den OAuth-Redirect
    // via sessionStorage. Nach dem Login wird das wartende Gerät gekoppelt.
    const urlPair = new URLSearchParams(location.search).get("pair");
    if (urlPair){
      sessionStorage.setItem("redline:pair", urlPair.toUpperCase());
      history.replaceState(null, "", location.pathname);
    }
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) await onLogin(session.user);
    else if (sessionStorage.getItem("redline:pair")){
      UI.toast("📱 Anmelden, um das andere Gerät zu koppeln");
      showSheet();
    }
    sb.auth.onAuthStateChange((ev, sess) => {
      if (ev === "SIGNED_IN" && sess?.user && !user) onLogin(sess.user);
      if (ev === "SIGNED_OUT"){ user = null; renderStatus(); }
    });
  }

  async function onLogin(u){
    user = u;
    hideSheet();
    const pend = sessionStorage.getItem("redline:pair");
    if (pend) grantPair(pend);
    // Spielername aus Google übernehmen, falls noch Standard
    const gname = (u.user_metadata?.name || u.user_metadata?.full_name || (u.email && !/privaterelay/.test(u.email) ? u.email : "") || "RACER").split(" ")[0].toUpperCase().slice(0,12);
    if (UI.save.name === "RACER") UI.save.name = gname;
    renderStatus();
    try {
      const { data, error } = await sb.from("saves").select("data").eq("user_id", u.id).maybeSingle();
      if (error) throw error;
      const cloud = data?.data;
      if (cloud?.reset){
        // Admin hat den Fortschritt zurückgesetzt → lokal komplett neu starten.
        // Flag ZUERST in der Cloud löschen — sonst greift es beim nächsten
        // Login wieder und die Seite reloaded endlos (Bug v19).
        localStorage.removeItem("redline:save:v2");
        await sb.from("saves").update({
          data: { resetDoneAt: Date.now() },
          updated_at: new Date().toISOString(),
        }).eq("user_id", u.id);
        UI.toast("♻️ Fortschritt wurde vom Admin zurückgesetzt");
        // Reload-Bremse: max. 1 automatischer Reload pro Tab, falls das
        // Update oben scheitert (offline/RLS) — nie wieder Endlos-Schleife.
        if (!sessionStorage.getItem("redline:resetReload")){
          sessionStorage.setItem("redline:resetReload", "1");
          setTimeout(()=>location.reload(), 1200);
        }
        return;
      }
      sessionStorage.removeItem("redline:resetReload");
      if (cloud && cloud.adminAt && cloud.adminAt !== UI.save.adminAt){
        UI.applyCloud(cloud);              // Admin-Änderung hat Vorrang
        UI.toast("☁️ Spielstand vom Admin aktualisiert");
      } else if (cloud && score(cloud) > score(UI.save)){
        UI.applyCloud(cloud);
        UI.toast("☁️ Cloud-Spielstand geladen");
      } else {
        push();
        if (cloud) UI.toast("☁️ Lokaler Stand ist aktueller — hochgeladen");
        else UI.toast("☁️ Fortschritt wird ab jetzt gespeichert");
      }
      loadEntitlements();
      showAdminLink();
    } catch(e){ console.warn("cloud load:", e.message); }
  }

  // Gekaufte VAULT-Autos freischalten
  async function loadEntitlements(){
    try {
      const { data } = await sb.from("entitlements").select("car_key").eq("user_id", user.id);
      let got = false;
      for (const e of data ?? []){
        if (CAR_DEFS[e.car_key] && !UI.save.cars[e.car_key]?.owned){
          UI.unlockVault(e.car_key); got = true;
        }
      }
      if (got) UI.toast("🔑 VAULT-Auto freigeschaltet!");
    } catch(e){ console.warn("entitlements:", e.message); }
  }

  // Nach Stripe-Kauf: bis zu 2 Minuten auf die Freischaltung warten
  let pollT = 0;
  function pollVault(){
    clearInterval(pollT);
    let tries = 0;
    pollT = setInterval(async () => {
      if (++tries > 30 || !user){ clearInterval(pollT); return; }
      const before = UI.save.cars.kuro?.owned;
      await loadEntitlements();
      if (!before && UI.save.cars.kuro?.owned) clearInterval(pollT);
    }, 4000);
  }

  // Admin-Link im Menü für owner/admin/senior
  async function showAdminLink(){
    try {
      const { data } = await sb.rpc("my_role");
      const el = document.getElementById("adminLink");
      if (el && ["owner","admin","senior"].includes(data)) el.style.display = "";
    } catch {}
  }

  // Debounced Upload — wird von persist() nach jeder Änderung angestossen
  function push(){
    if (!user || !sb) return;
    clearTimeout(pushT);
    pushT = setTimeout(async () => {
      try {
        await sb.from("saves").upsert({
          user_id: user.id, data: UI.save, name: UI.save.name, email: user.email,
          updated_at: new Date().toISOString(),
        });
        renderStatus(true);
      } catch(e){ console.warn("cloud push:", e.message); }
    }, 1500);
  }

  async function login(){
    if (!sb) return;
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
  }
  // SIGN IN WITH APPLE (Claw 30.10.): Web = OAuth über die Services-ID ch.abooz.web (Supabase),
  // App = natives Plugin (SignInWithApple) + signInWithIdToken — ohne Plugin wird der Knopf in der App nicht gezeigt.
  const appleNative = () => !!(window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.SignInWithApple);
  const appleAvailable = () => !window.Capacitor?.isNativePlatform?.() || appleNative();
  async function loginApple(){
    if (!sb) return;
    if (appleNative()){
      try {
        const raw = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))), b => b.toString(16).padStart(2, "0")).join("");
        const r = await window.Capacitor.Plugins.SignInWithApple.authorize({ clientId: "com.pelutio.redline", redirectURI: "https://l.abooz.ch/", scopes: "email name", nonce: hash });
        const { error } = await sb.auth.signInWithIdToken({ provider: "apple", token: r.response.identityToken, nonce: raw });
        if (error) throw error;
      } catch(e){ if (!/cancel|1001/i.test(String(e?.message || e))) UI.toast("Apple-Anmeldung fehlgeschlagen"); }
      return;
    }
    await sb.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: location.origin + location.pathname } });
  }
  // E-Mail-Code-Login — funktioniert ohne Google-Konfiguration
  async function loginMail(){
    if (!sb) return;
    const email = (prompt("Deine E-Mail-Adresse (du bekommst einen Anmelde-Code):") || "").trim();
    if (!email.includes("@")) return;
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error){ UI.toast("Mail-Versand fehlgeschlagen: " + error.message); return; }
    UI.toast("📬 Code an " + email + " geschickt");
    const token = (prompt("Der 6-stellige Code aus der E-Mail:") || "").trim();
    if (!token) return;
    const { error: e2 } = await sb.auth.verifyOtp({ email, token, type: "email" });
    if (e2) UI.toast("Code falsch oder abgelaufen — nochmal versuchen");
  }
  async function logout(){
    if (confirm("Abmelden? Dein Fortschritt bleibt lokal und in der Cloud erhalten.")){
      await sb.auth.signOut();
    }
  }

  // ── QR-Login (Geräte-Kopplung wie WhatsApp Web) ───────────────────────────
  // Gerät A: zeigt QR mit ?pair=CODE und lauscht auf dem Realtime-Kanal.
  // Handy B: scannt, meldet sich (falls nötig) mit Google an, holt via
  // pair-grant einen Magiclink-token_hash und funkt ihn an A → verifyOtp.
  let sheet = null, pairCh = null, pairTimer = 0;

  function showSheet(){
    hideSheet();
    const pending = sessionStorage.getItem("redline:pair");
    sheet = document.createElement("div");
    sheet.style.cssText = "position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(6,6,10,.72);backdrop-filter:blur(4px)";
    sheet.innerHTML = `
      <div style="background:var(--panel,#14141C);border:1px solid rgba(255,255,255,.1);border-radius:22px 22px 0 0;
                  padding:20px 22px calc(env(safe-area-inset-bottom,0px) + 22px);width:min(430px,100vw);text-align:center">
        <b style="font-size:16px;font-style:italic">ANMELDEN</b>
        <p style="font-size:11.5px;color:#8E92A3;margin:4px 0 14px">${pending
          ? "Danach wird das andere Gerät automatisch gekoppelt."
          : "Fortschritt sichern — mit Apple-ID oder Google auf allen Geräten."}</p>
        ${appleAvailable() ? `<button data-act="apple" style="display:block;width:100%;padding:14px;border-radius:14px;background:#000;color:#fff;border:1px solid rgba(255,255,255,.28);font-weight:800;font-size:14px;margin-bottom:9px"> Mit Apple anmelden</button>` : ""}
        <button data-act="google" style="display:block;width:100%;padding:14px;border-radius:14px;background:#fff;color:#111;font-weight:800;font-size:14px;margin-bottom:9px">Mit Google anmelden</button>
        ${pending ? "" : `<button data-act="qr" style="display:block;width:100%;padding:14px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-weight:800;font-size:14px;margin-bottom:9px">📱 Per QR-Code — mit dem Handy anmelden</button>`}
        <button data-act="mail" style="display:block;width:100%;padding:14px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-weight:800;font-size:14px">Per E-Mail-Code anmelden</button>
        <button data-act="x" style="margin-top:12px;font-size:12px;color:#8E92A3;text-decoration:underline;padding:6px 10px">Abbrechen</button>
      </div>`;
    sheet.addEventListener("click", e => {
      const act = e.target.dataset?.act;
      if (e.target === sheet || act === "x"){ sessionStorage.removeItem("redline:pair"); hideSheet(); }
      else if (act === "google"){ login(); }
      else if (act === "apple"){ loginApple(); }
      else if (act === "mail"){ hideSheet(); loginMail(); }
      else if (act === "qr"){ pairStart(); }
    });
    document.body.appendChild(sheet);
  }
  function hideSheet(){ sheet?.remove(); sheet = null; stopPair(); }
  function stopPair(){
    if (pairCh){ sb.removeChannel(pairCh); pairCh = null; }
    clearTimeout(pairTimer);
  }

  function pairStart(){
    const code = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
    const url = location.origin + location.pathname + "?pair=" + code;
    // QR rendern (js/vendor/qrcode.js)
    const qr = qrcode(0, "M"); qr.addData(url); qr.make();
    const n = qr.getModuleCount(), cell = 7, pad = 3*cell, size = n*cell + 2*pad;
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const c = cv.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, size, size);
    c.fillStyle = "#111";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
      if (qr.isDark(y, x)) c.fillRect(pad + x*cell, pad + y*cell, cell, cell);
    const box = sheet.firstElementChild;
    box.innerHTML = `
      <b style="font-size:16px;font-style:italic">MIT DEM HANDY SCANNEN</b>
      <p style="font-size:11.5px;color:#8E92A3;margin:4px 0 12px">Kamera aufs Bild — auf dem Handy mit Google anmelden, dieses Gerät ist dann automatisch drin.</p>
      <div id="pairQr" style="display:flex;justify-content:center"></div>
      <p style="font-size:12px;color:#8E92A3;margin-top:10px">oder am Handy eintippen:<br><b style="color:#F2F3F7;letter-spacing:.06em">${location.host}/?pair=${code}</b></p>
      <p id="pairState" style="font-size:12px;font-weight:700;color:#FFB020;margin-top:8px">Warte auf das Handy …</p>
      <button data-act="x" style="margin-top:10px;font-size:12px;color:#8E92A3;text-decoration:underline;padding:6px 10px">Abbrechen</button>`;
    cv.style.cssText = "width:min(230px,60vw);height:auto;border-radius:12px";
    box.querySelector("#pairQr").appendChild(cv);
    pairCh = sb.channel("pair:" + code);
    pairCh.on("broadcast", { event: "grant" }, async ({ payload }) => {
      const el = box.querySelector("#pairState");
      if (el){ el.textContent = "Handy gefunden — melde an …"; el.style.color = "#2BE05E"; }
      const { error } = await sb.auth.verifyOtp({ token_hash: payload.token_hash, type: payload.type || "magiclink" });
      if (error){ if (el){ el.textContent = "Fehlgeschlagen: " + error.message; el.style.color = "#FF5A68"; } return; }
      UI.toast("✓ Angemeldet via QR");
      hideSheet();
    });
    pairCh.subscribe();
    pairTimer = setTimeout(() => {   // Code läuft nach 5 Minuten ab
      const el = box.querySelector("#pairState");
      if (el){ el.textContent = "Code abgelaufen — neu öffnen"; el.style.color = "#FF5A68"; }
      stopPair();
    }, 5*60*1000);
  }

  // Handy-Seite: eingeloggt + Pairing-Code vorhanden → anderes Gerät anmelden
  async function grantPair(code){
    sessionStorage.removeItem("redline:pair");
    if (!confirm("Dieses Konto auch auf dem anderen Gerät (QR-Code) anmelden?")) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(SB_URL + "/functions/v1/pair-grant", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token, apikey: SB_ANON },
      });
      if (!res.ok) throw new Error(await res.text());
      const { token_hash, type } = await res.json();
      const ch = sb.channel("pair:" + code);
      ch.subscribe(status => {
        if (status !== "SUBSCRIBED") return;
        ch.send({ type: "broadcast", event: "grant", payload: { token_hash, type } })
          .then(() => { UI.toast("✓ Anderes Gerät wird angemeldet"); setTimeout(() => sb.removeChannel(ch), 3000); });
      });
    } catch(e){ UI.toast("Kopplung fehlgeschlagen: " + e.message); }
  }

  function renderStatus(justSynced){
    const b = document.getElementById("cloudBtn");
    const m = document.getElementById("cloudMail");
    if (!b) return;
    if (!sb){ b.style.display = "none"; if (m) m.style.display = "none"; return; }
    if (user){
      const nm = (user.user_metadata?.name || user.email || "").split("@")[0];
      b.innerHTML = `☁️ ${nm} <em>${justSynced ? "gespeichert ✓" : "angemeldet ✓"}</em>`;
      b.classList.add("in");
      b.onclick = logout;
      if (m) m.style.display = "none";
    } else {
      b.innerHTML = `Anmelden — ${appleAvailable() ? "Apple / " : ""}Google / QR <em>Fortschritt in der Cloud sichern</em>`;
      b.classList.remove("in");
      b.onclick = showSheet;
      if (m){ m.style.display = ""; m.onclick = loginMail; }
    }
  }

  return { init, login, loginMail, logout, push, renderStatus, pollVault, showSheet,
    get sb(){ return sb; }, get user(){ return user; } };
})();

window.Cloud = Cloud;
