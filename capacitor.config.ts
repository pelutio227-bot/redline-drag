import type { CapacitorConfig } from "@capacitor/cli";

// Store-Wrapper für «Redline Tuner: Street Battles» (Web-Spiel ~/Projects/redline, live l.abooz.ch).
// www/ = Kopie von redline/public + native-bridge.js (scripts/build-www.mjs).
const config: CapacitorConfig = {
  appId: "com.pelutio.redline",
  appName: "Redline Tuner",
  webDir: "www",
  ios: { contentInset: "never", backgroundColor: "#0A0A0E", scrollEnabled: false },
  android: { backgroundColor: "#0A0A0E" },
};

export default config;
