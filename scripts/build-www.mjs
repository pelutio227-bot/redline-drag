// Kopiert das Web-Spiel nach www/ (ohne Test-/Admin-Seiten) und hängt die Native-Bridge ein.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
const SRC = process.env.REDLINE_PUBLIC ?? (existsSync("web") ? "web" : path.resolve("../redline/public"));
if (!existsSync(SRC)) throw new Error("Quelle fehlt: " + SRC);
rmSync("www", { recursive: true, force: true }); mkdirSync("www");
for (const f of readdirSync(SRC)) {
  if (f.startsWith("_") || f === "admin.html" || f === "sw.js" || f === "robots.txt") continue;
  cpSync(path.join(SRC, f), path.join("www", f), { recursive: true });
}
execSync("bun build src/native-bridge.ts --outfile www/js/native-bridge.js --target browser --minify", { stdio: "inherit" });
let html = readFileSync("www/index.html", "utf8");
html = html.replace(/<link rel="manifest"[^>]*>\s*/g, "");
html = html.replace("</head>", '<script src="js/native-bridge.js"></script>\n</head>');
writeFileSync("www/index.html", html);
console.log("www/ gebaut aus", SRC);
