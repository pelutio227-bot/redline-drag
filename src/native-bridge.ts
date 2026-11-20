// Native-Bridge für die Store-App (Capacitor). Wird als window.NativeBridge in index.html geladen.
// Im Browser (l.abooz.ch) existiert window.Capacitor nicht → isNative=false, das Spiel bleibt wie bisher.
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { Purchases, LOG_LEVEL, type PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";

const isNative = Capacitor.isNativePlatform();
/** Season 3 (18.11.2026): Season Pass, XP ×2, Diamanten als In-App-Käufe über RevenueCat (App Store; Play folgt).
 *  Das Spiel selbst bleibt gratis spielbar. RevenueCat-Projekt 9ee98494, App «Redline Drag iOS». */
const IAP_ENABLED = true;
const RC_KEY = Capacitor.getPlatform() === "ios" ? "appl_ZvNXrhYqzwYdKiHPLWRprvusnCK" : "";

export interface ProductInfo { id: string; price: string; title: string }
export interface PurchaseOutcome { ok: boolean; cancelled?: boolean; error?: string; owned: string[]; consumed?: string; txId?: string }
export interface TxInfo { id: string; product: string; at: number }

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
const productCache = new Map<string, PurchasesStoreProduct>();
/** Produkte direkt per ID aus dem Store (kein Angebot nötig), mit lokalisiertem Preis («CHF 5.90»). */
async function products(ids: string[]): Promise<ProductInfo[]> {
  if (!(await ensure())) return [];
  try {
    const { products: list } = await Purchases.getProducts({ productIdentifiers: ids });
    list.forEach((p) => productCache.set(p.identifier, p));
    return list.map((p) => ({ id: p.identifier, price: p.priceString, title: p.title }));
  } catch (e) { console.warn("[bridge] products", e); return []; }
}
function ownedFrom(info: { entitlements: { active: Record<string, unknown> }; allPurchasedProductIdentifiers?: string[]; nonSubscriptionTransactions?: { productIdentifier?: string; productId?: string }[] }): string[] {
  const ids = [...Object.keys(info.entitlements.active ?? {}), ...(info.allPurchasedProductIdentifiers ?? []), ...(info.nonSubscriptionTransactions ?? []).map((t) => t.productIdentifier ?? t.productId ?? "")];
  return Array.from(new Set(ids.filter(Boolean)));
}
/** Kauf (Produkt-ID wie im App Store). Verbrauchsgüter (XP ×2, Diamanten) melden `consumed`. */
async function purchase(productId: string): Promise<PurchaseOutcome> {
  if (!(await ensure())) return { ok: false, error: "Käufe gibt es nur in der App.", owned: [] };
  let product = productCache.get(productId);
  if (!product) { await products([productId]); product = productCache.get(productId); }
  if (!product) return { ok: false, error: "Produkt im Store noch nicht verfügbar. Bitte später nochmals versuchen.", owned: [] };
  try {
    const res = await Purchases.purchaseStoreProduct({ product });
    const tx = (res as unknown as { transaction?: { transactionIdentifier?: string } }).transaction;
    return { ok: true, owned: ownedFrom(res.customerInfo), consumed: res.productIdentifier, txId: tx?.transactionIdentifier };
  } catch (e) {
    const err = e as { code?: string | number; message?: string; userCancelled?: boolean };
    if (err?.userCancelled || String(err?.code) === "1" || /cancel/i.test(err?.message ?? "")) return { ok: false, cancelled: true, owned: [] };
    return { ok: false, error: err?.message || "Kauf fehlgeschlagen", owned: [] };
  }
}
/** Wiederherstellen (dauerhafte Käufe wie der Season Pass). */
async function restore(): Promise<PurchaseOutcome> {
  if (!(await ensure())) return { ok: false, error: "Nur in der App.", owned: [] };
  try { const { customerInfo } = await Purchases.restorePurchases(); return { ok: true, owned: ownedFrom(customerInfo) }; }
  catch (e) { return { ok: false, error: (e as Error)?.message || "Fehler", owned: [] }; }
}
/** Verbrauchsgüter-Transaktionen der letzten `minutes` Minuten (Absturz zwischen Apple-Kauf und Gutschrift → nachbuchen). */
async function recentTransactions(minutes = 20): Promise<TxInfo[]> {
  if (!(await ensure())) return [];
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    const list = ((customerInfo as unknown as { nonSubscriptionTransactions?: { transactionIdentifier?: string; productIdentifier?: string; productId?: string; purchaseDate?: string }[] }).nonSubscriptionTransactions ?? []);
    const since = Date.now() - minutes * 60000;
    return list.map((t) => ({ id: t.transactionIdentifier ?? "", product: t.productIdentifier ?? t.productId ?? "", at: Date.parse(t.purchaseDate ?? "") || 0 })).filter((t) => t.id && t.product && t.at >= since);
  } catch { return []; }
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

async function closeBrowser(): Promise<void> { if (!isNative) return; try { await Browser.close(); } catch { /* war nicht offen */ } }
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

const bridge = { pushRegister, isNative, iapEnabled: IAP_ENABLED, platform: Capacitor.getPlatform(), products, purchase, restore, owned, recentTransactions, haptic, openUrl, closeBrowser };
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
  // Anmeldung (Google/Apple) läuft im System-Browser; Supabase springt auf redlinetuner://auth#access_token=… zurück.
  const authFromUrl = (url?: string): boolean => {
    if (!url || !url.startsWith("redlinetuner://auth")) return false;
    void closeBrowser();
    (window as unknown as { __authUrl?: string }).__authUrl = url;       // falls cloud.js noch nicht lauscht (Kaltstart)
    window.dispatchEvent(new CustomEvent("redline:authurl", { detail: url }));
    return true;
  };
  void CapApp.addListener("appUrlOpen", (e) => { if (!authFromUrl(e.url)) duoFromUrl(e.url); });
  void CapApp.getLaunchUrl().then((r) => { if (!authFromUrl(r?.url)) duoFromUrl(r?.url); }).catch(() => {});
  // Zurück-Geste/Taste (Android) → Spiel-eigene Navigation
  void CapApp.addListener("backButton", () => {
    const back = document.querySelector<HTMLButtonElement>(".screen.on .back");
    if (back) back.click();
  });
}
