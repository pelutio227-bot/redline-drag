// Native-Bridge für die Store-App (Capacitor). Wird als window.NativeBridge in index.html geladen.
// Im Browser (l.abooz.ch) existiert window.Capacitor nicht → isNative=false, das Spiel bleibt wie bisher.
import { Capacitor } from "@capacitor/core";
import { Purchases, LOG_LEVEL, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";

const RC_KEY = Capacitor.getPlatform() === "ios" ? "appl_ZvNXrhYqzwYdKiHPLWRprvusnCK" : "";
const isNative = Capacitor.isNativePlatform();
/** Version 1.0 erscheint gratis ohne In-App-Käufe: RevenueCat wird nicht gestartet, Shop/Vault sind ausgeblendet.
 *  Für 1.0.1 (IAPs eingereicht, Paid-Apps-Vertrag aktiv) auf true stellen. */
const IAP_ENABLED = false;

export interface ProductInfo { id: string; price: string; title: string }
export interface PurchaseOutcome { ok: boolean; cancelled?: boolean; error?: string; owned: string[]; consumed?: string }

let configured = false;
async function ensure(): Promise<boolean> {
  if (!isNative || !RC_KEY || !IAP_ENABLED) return false;
  if (!configured) {
    try {
      await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
      await Purchases.configure({ apiKey: RC_KEY });
      configured = true;
    } catch (e) { console.warn("[bridge] configure", e); return false; }
  }
  return true;
}

async function packages(): Promise<PurchasesPackage[]> {
  if (!(await ensure())) return [];
  try {
    const { current, all } = await Purchases.getOfferings();
    const list = current?.availablePackages ?? Object.values(all).flatMap((o) => o.availablePackages);
    return list;
  } catch (e) { console.warn("[bridge] offerings", e); return []; }
}

/** Produkte mit lokalisiertem Preis (z. B. «CHF 4.90»). */
async function products(): Promise<ProductInfo[]> {
  const pk = await packages();
  return pk.map((p) => ({ id: p.product.identifier, price: p.product.priceString, title: p.product.title }));
}

/** Aktive Entitlements + alle je gekauften Produkt-IDs (dauerhafte Käufe pro Auto, Abos). */
function ownedFrom(info: { entitlements: { active: Record<string, unknown> }; allPurchasedProductIdentifiers?: string[] }): string[] {
  return Array.from(new Set([...Object.keys(info.entitlements.active ?? {}), ...(info.allPurchasedProductIdentifiers ?? [])]));
}

/** Kauf eines Produkts (Produkt-ID wie im App Store). Verbrauchsgüter melden `consumed` = Produkt-ID. */
async function purchase(productId: string): Promise<PurchaseOutcome> {
  const pk = (await packages()).find((p) => p.product.identifier === productId);
  if (!pk) return { ok: false, error: "Produkt im Store noch nicht verfügbar.", owned: [] };
  try {
    const { customerInfo, productIdentifier } = await Purchases.purchasePackage({ aPackage: pk });
    return { ok: true, owned: ownedFrom(customerInfo), consumed: productIdentifier };
  } catch (e) {
    const err = e as { code?: string | number; message?: string; userCancelled?: boolean };
    if (err?.userCancelled || String(err?.code) === "1" || /cancel/i.test(err?.message ?? "")) return { ok: false, cancelled: true, owned: [] };
    return { ok: false, error: err?.message || "Kauf fehlgeschlagen", owned: [] };
  }
}

/** Wiederherstellen (nur dauerhafte Käufe/Entitlements). */
async function restore(): Promise<PurchaseOutcome> {
  if (!(await ensure())) return { ok: false, error: "Nur in der App.", owned: [] };
  try { const { customerInfo } = await Purchases.restorePurchases(); return { ok: true, owned: ownedFrom(customerInfo) }; }
  catch (e) { return { ok: false, error: (e as Error)?.message || "Fehler", owned: [] }; }
}

async function owned(): Promise<string[]> {
  if (!(await ensure())) return [];
  try { const { customerInfo } = await Purchases.getCustomerInfo(); return ownedFrom(customerInfo); } catch { return []; }
}

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
  if (!isNative) return Promise.resolve(null);
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
if (isNative) {
  // Tipp auf eine Push-Nachricht → Rivalen › Freunde öffnen
  void PushNotifications.addListener("pushNotificationActionPerformed", () => {
    const go = () => { const w = window as unknown as { Rivals?: { open: (t: string) => void } }; if (w.Rivals) w.Rivals.open("friends"); else setTimeout(go, 800); };
    setTimeout(go, 600);
  });
}

const bridge = { pushRegister, isNative, iapEnabled: IAP_ENABLED, platform: Capacitor.getPlatform(), products, purchase, restore, owned, haptic, openUrl };
(window as unknown as { NativeBridge: typeof bridge }).NativeBridge = bridge;

if (isNative) {
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
