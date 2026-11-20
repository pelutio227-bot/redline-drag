// loot.js — Season 3 «Beute» (18.11.2026): Kisten + Diamanten nach JEDEM Rennen, Season Pass, XP-Boost, Tageskiste.
// DOM-frei (läuft auch in Node: tools/loot-sim.mjs). Braucht rpg.js (RARITIES, rarCash).
//
// Prinzip wie bei grossen Mobile-Games: Jedes Rennen lohnt sich. Sieg = Kiste nach Gegner-Seltenheit + Diamanten +
// Pass-Punkte; Niederlage = Trostpreis (Chance auf Street-Kiste, 1 Diamant). Kisten enthalten Bolts, Diamanten,
// manchmal einen XP-Boost (×2 für eine Zeit) oder «Ausgeruht». Diamanten 💎 sind die Premium-Währung (Kauf in der App
// oder erspielt) und kaufen XP×2 24 h, eine Boss-Kiste, Pass-Stufen oder das Ausweichen im Radar.
// Season Pass: Punkte aus Siegen füllen 30 Stufen, jede Stufe hat eine Gratis-Belohnung und (mit gekauftem Pass) eine Premium-Belohnung.

const SEASON = { id: "s3", n: "Season 3 · Beute", start: Date.UTC(2026, 10, 18), days: 35, tiers: 30, pass: "redline_pass_s3" };
const seasonEnd = () => SEASON.start + SEASON.days * 864e5;
const seasonLeftMs = (now = Date.now()) => Math.max(0, seasonEnd() - now);
const seasonEnded = (now = Date.now()) => now >= seasonEnd();   // nach dem Ende: Pass nicht mehr verkaufen, Belohnungen bleiben abholbar
// Was steckt in einer Kiste? (Apple 3.1.1: Wahrscheinlichkeiten offenlegen, wenn Kisten mit gekaufter Währung gekauft werden)
const crateOdds = key => {
  const C = CRATES[key] || CRATES.street, [a, b] = C.gems, out = ["Bolts sicher"];
  if (a === b && a > 0) out.push(`${a} Diamant${a > 1 ? "en" : ""} sicher`);
  else if (a > 0) out.push(`${a}–${b} Diamanten sicher`);
  else if (b > 0) out.push(`1 Diamant ${Math.round(100 * b / (b + 1))} %`);
  out.push(`XP ×2 ${Math.round(C.xp2 * 100)} %`, `Ausgeruht ${Math.round(C.rest * 100)} %`);
  return out;
};

// ── Kisten ────────────────────────────────────────────────────────────────────
// bolts = Vielfaches von rarCash(Level) (Grün-Preisgeld), gems = Spanne, xp2/rest = Chance, xp2Min = Boost-Dauer
const CRATES = {
  street: { n: "Street-Kiste",   rar: "grey",   bolts: [0.25, 0.5], gems: [0, 1],    xp2: 0.06, xp2Min: 30,   rest: 0.08 },
  tuner:  { n: "Tuner-Kiste",    rar: "green",  bolts: [0.5, 0.8],  gems: [1, 1],    xp2: 0.12, xp2Min: 60,   rest: 0.12 },
  boss:   { n: "Boss-Kiste",     rar: "blue",   bolts: [1.0, 1.5],  gems: [2, 4],    xp2: 0.30, xp2Min: 120,  rest: 0.25 },
  elite:  { n: "Elite-Kiste",    rar: "epic",   bolts: [2.0, 3.0],  gems: [8, 12],   xp2: 0.60, xp2Min: 360,  rest: 0.40 },
  legend: { n: "Legenden-Kiste", rar: "legend", bolts: [4.0, 6.0],  gems: [30, 40],  xp2: 1.00, xp2Min: 1440, rest: 1.00 },
};
const CRATE_BY_RAR = { grey: "street", green: "tuner", blue: "boss", epic: "elite", legend: "legend" };
const GEM_WIN = { grey: [0, 0], green: [1, 1], blue: [2, 4], epic: [10, 15], legend: [40, 60] };
const PASS_WIN = { grey: 1, green: 2, blue: 3, epic: 5, legend: 10 };
const rint = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const rrange = (rng, a, b) => a + rng() * (b - a);

// Was fällt nach dem Rennen? (Sieg oder Niederlage) → { crate, gems, pass }
function rollDrops(enc, won, rng = Math.random, opts = {}){
  if (won){
    const g = GEM_WIN[enc.rar] || [1, 2];
    return { crate: CRATE_BY_RAR[enc.rar] || "street", gems: rint(rng, g[0], g[1]), pass: (PASS_WIN[enc.rar] || 1) + ((opts.perfects || 0) >= 3 ? 1 : 0) };
  }
  // Trostpreis: man geht nie ganz leer aus
  return { crate: rng() < 0.35 ? "street" : null, gems: rng() < 0.3 ? 1 : 0, pass: 0 };
}
// Kiste öffnen → Liste von Gegenständen (Reihenfolge = Reveal-Reihenfolge, das Beste zuletzt)
function openCrate(key, lvl, rng = Math.random, opts = {}){
  const C = CRATES[key] || CRATES.street, base = rarCash(Math.max(1, lvl || 1));
  const items = [];
  items.push({ t: "bolts", n: Math.round(base * rrange(rng, C.bolts[0], C.bolts[1]) / 10) * 10 });
  if (rng() < C.rest) items.push({ t: "rest", lv: key === "legend" ? 1.0 : key === "elite" ? 0.5 : 0.25 });
  if (rng() < C.xp2) items.push({ t: "xp2", min: C.xp2Min });
  const g = Math.round(rint(rng, C.gems[0], C.gems[1]) * (opts.gemsMul || 1)); if (g > 0) items.push({ t: "gems", n: g });
  return items;
}

// ── XP-Boost (×2) ─────────────────────────────────────────────────────────────
const boostActive = (s, now = Date.now()) => !!(s.boost && s.boost > now);
const boostLeftMs = (s, now = Date.now()) => Math.max(0, (s.boost || 0) - now);
function addBoost(s, minutes, now = Date.now()){ s.boost = Math.max(s.boost || 0, now) + minutes * 6e4; return s.boost; }

// ── Tageskiste ────────────────────────────────────────────────────────────────
const DAILY_MS = 20 * 36e5;    // alle 20 h (wer jeden Abend spielt, bekommt sie jeden Abend)
const dailyReady = (s, now = Date.now()) => !s.daily || now - s.daily >= DAILY_MS;
const dailyLeftMs = (s, now = Date.now()) => Math.max(0, (s.daily || 0) + DAILY_MS - now);
const dailyCrate = s => (passState(s).prem ? "tuner" : "street");

// ── Season Pass ───────────────────────────────────────────────────────────────
const tierNeed = t => t === 1 ? 1 : 10 + 2 * Math.floor((t - 1) / 5);   // Stufe 1 = erster Sieg (Tutorial), 2–5: 10 Punkte, 6–10: 12, … 26–30: 20
const passTotal = () => { let s = 0; for (let t = 1; t <= SEASON.tiers; t++) s += tierNeed(t); return s; };
// Belohnungen pro Stufe. Gratis-Spur bescheiden, Premium-Spur grosszügig (Ziel: Pass lohnt sich ab Stufe ~8).
function passReward(t, prem){
  if (!prem){
    if (t === SEASON.tiers) return [{ t: "crate", k: "boss" }];
    if (t % 5 === 0) return [{ t: "xp2", min: 60 }];
    if (t % 4 === 0) return [{ t: "crate", k: "street" }];
    if (t % 3 === 0) return [{ t: "gems", n: 5 }];
    return [{ t: "bolts", n: 300 + 120 * t }];
  }
  if (t === SEASON.tiers) return [{ t: "car", k: "kuro" }, { t: "crate", k: "legend" }];
  if (t === 25) return [{ t: "crate", k: "elite" }, { t: "gems", n: 40 }];
  if (t % 10 === 0) return [{ t: "crate", k: "boss" }, { t: "gems", n: 25 }];
  if (t % 5 === 0) return [{ t: "xp2", min: 1440 }, { t: "gems", n: 15 }];
  if (t % 2 === 0) return [{ t: "gems", n: 10 + t }];
  return [{ t: "bolts", n: 700 + 260 * t }];
}
function passState(s, now = Date.now()){
  if (!s.pass || s.pass.id !== SEASON.id) s.pass = { id: SEASON.id, pts: 0, cf: {}, cp: {}, prem: false };
  const p = s.pass; let pts = p.pts, tier = 0;
  while (tier < SEASON.tiers && pts >= tierNeed(tier + 1)){ pts -= tierNeed(tier + 1); tier++; }
  const need = tier >= SEASON.tiers ? 0 : tierNeed(tier + 1);
  return { pts: p.pts, tier, into: pts, need, pct: need ? pts / need : 1, prem: !!p.prem, left: seasonLeftMs(now), ended: seasonEnded(now), done: tier >= SEASON.tiers };
}
function addPassPoints(s, n){ passState(s); s.pass.pts += n; return passState(s); }
// Welche Stufen sind abholbar? → [{ tier, prem }]
function claimable(s){
  const st = passState(s), out = [];
  for (let t = 1; t <= st.tier; t++){
    if (!s.pass.cf[t]) out.push({ tier: t, prem: false });
    if (st.prem && !s.pass.cp[t]) out.push({ tier: t, prem: true });
  }
  return out;
}
function claim(s, tier, prem){
  const st = passState(s);
  if (tier < 1 || tier > st.tier) return null;
  if (prem && !st.prem) return null;
  const key = prem ? "cp" : "cf";
  if (s.pass[key][tier]) return null;
  s.pass[key][tier] = Date.now();
  return passReward(tier, prem);
}
function buyTier(s){ const st = passState(s); if (st.done) return false; s.pass.pts += st.need - st.into; return true; }

// ── Preise in Diamanten + In-App-Produkte ────────────────────────────────────
const GEM_PRICES = { xp2_24h: 80, boss_crate: 150, tier: 60, dodge: 4 };
const PRODUCTS = {
  pass:  { id: SEASON.pass,           n: "Season Pass",      what: "Premium-Spur mit 30 Stufen, Tuner-Tageskiste, KURO ØNI auf Stufe 30" },
  xp2:   { id: "redline_xp2_24h",      n: "XP ×2 für 24 h",   what: "Doppelte Erfahrung für jedes Rennen, 24 Stunden lang" },
  g100:  { id: "redline_gems_100",     n: "100 Diamanten",    gems: 100 },
  g550:  { id: "redline_gems_550",     n: "550 Diamanten",    gems: 550, tag: "+10 %" },
  g1200: { id: "redline_gems_1200",    n: "1200 Diamanten",   gems: 1200, tag: "+20 %" },
};
const productByItem = id => Object.values(PRODUCTS).find(p => p.id === id);

if (typeof globalThis !== "undefined") globalThis.Loot = {
  SEASON, seasonEnd, seasonLeftMs, seasonEnded, crateOdds, CRATES, CRATE_BY_RAR, rollDrops, openCrate,
  boostActive, boostLeftMs, addBoost, DAILY_MS, dailyReady, dailyLeftMs, dailyCrate,
  tierNeed, passTotal, passReward, passState, addPassPoints, claimable, claim, buyTier,
  GEM_PRICES, PRODUCTS, productByItem,
};
