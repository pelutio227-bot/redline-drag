// Native-Bridge für die Store-App (Capacitor). Wird als window.NativeBridge in index.html geladen.
// Im Browser (l.abooz.ch) existiert window.Capacitor nicht → isNative=false, das Spiel bleibt wie bisher.
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";

const isNative = Capacitor.isNativePlatform();
/** Das Spiel ist gratis (Claw 01.11./05.11.2026): keine In-App-Käufe, kein RevenueCat, kein Shop, kein Vault. */
const IAP_ENABLED = false;

/** Haptik: "light" | "medium" | "heavy" */
async function haptic(kind: "light" | "medium" | "heavy" = "light"): Promise<void> {
  if (!isNative) return;
  const style = kind === "heavy" ? ImpactStyle.Heavy : kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light;
  try { await Haptics.impact({ style }); } catch { /* egal */ }
}

async function openUrl(url: string): Promise<void> {
  if (!isNative) { window.open(url, "_blank"); return; }
  try { await Browser.open({ url }); } catch { window.open(url, "_blank"); }
}

// Push (Rivalen/Freunde): Erlaubnis fragen, bei APNs registrieren, Gerätetoken zurückgeben (null = nein/keins)
let pushToken: Promise<string | null> | null = null;
function pushRegister(): Promise<string | null> {
  // Android: Push bräuchte Firebase (google-services.json) — ohne würde register() die App abstürzen lassen
  if (!isNative || Capacitor.getPlatform() !== "ios") return Promise.resolve(null);
  if (pushToken) return pushToken;
  pushToken = (async () => {
    try {
      let p = await PushNotifications.checkPermissions();
      if (p.receive === "prompt" || p.receive === "prompt-with-rationale") p = await PushNotifications.requestPermissions();
      if (p.receive !== "granted") return null;
      const tok = new Promise<string | null>((res) => {
        void PushNotifications.addListener("registration", (t) => res(t.value));
        void PushNotifications.addListener("registrationError", () => res(null));
        setTimeout(() => res(null), 15000);
      });
      await PushNotifications.register();
      return await tok;
    } catch { return null; }
  })();
  return pushToken;
}
if (isNative && Capacitor.getPlatform() === "ios") {
  // Tipp auf eine Push-Nachricht → Rivalen › Freunde öffnen
  void PushNotifications.addListener("pushNotificationActionPerformed", () => {
    const go = () => { const w = window as unknown as { Rivals?: { open: (t: string) => void } }; if (w.Rivals) w.Rivals.open("friends"); else setTimeout(go, 800); };
    setTimeout(go, 600);
  });
}

const bridge = { pushRegister, isNative, iapEnabled: IAP_ENABLED, platform: Capacitor.getPlatform(), haptic, openUrl };
(window as unknown as { NativeBridge: typeof bridge }).NativeBridge = bridge;

if (isNative && Capacitor.getPlatform() === "ios") {
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  const mark = () => document.documentElement?.classList.add("native-app", "native-" + Capacitor.getPlatform(), IAP_ENABLED ? "iap-on" : "iap-off");
  mark(); document.addEventListener("DOMContentLoaded", mark);
  // Universal Link https://l.abooz.ch/duo/CODE (QR-Scan mit der Kamera, Nachricht) → Duo-Lobby.
  // Kaltstart: getLaunchUrl; läuft die App schon: appUrlOpen.
  const duoFromUrl = (url?: string) => {
    const m = url?.match(/\/duo\/([A-Za-z0-9]+)/) ?? url?.match(/[?&]duo=([A-Za-z0-9]+)/);
    if (!m) return;
    const w = window as unknown as { openDuoLink?: (c: string) => void; DUEL_CODE?: string };
    if (w.openDuoLink) w.openDuoLink(m[1]);
    else w.DUEL_CODE = m[1].toUpperCase();      // Spiel bootet noch → Boot-Logik übernimmt
  };
  void CapApp.addListener("appUrlOpen", (e) => duoFromUrl(e.url));
  void CapApp.getLaunchUrl().then((r) => duoFromUrl(r?.url)).catch(() => {});
  // Zurück-Geste/Taste (Android) → Spiel-eigene Navigation
  void CapApp.addListener("backButton", () => {
    const back = document.querySelector<HTMLButtonElement>(".screen.on .back");
    if (back) back.click();
  });
}
