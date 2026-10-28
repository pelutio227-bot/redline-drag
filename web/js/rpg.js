// rpg.js — Fortschritt «Season 2» (28.10.2026): jedes AUTO levelt (1–60), nicht der Spieler.
// DOM-frei (läuft auch in Node: tools/rpg-sim.mjs) → Spiel und Balancing rechnen gleich.
//
// Architektur
// - Auto-Level 1–60 mit XP-Balken. Jedes Level schaltet etwas frei: ungerade Level ein
//   Tuning-Teil (kaufbar mit Cash), ab Level 10 jedes Level einen Talentpunkt.
// - Talentbaum (ab LV 10): drei Schulen JDM / MUSCLE / GERMAN + GLÜCK. Jedes Auto kann alle
//   skillen; die eigene Schule hat eine Klassen-Fähigkeit und einen stärkeren Meister-Talent.
// - Gegner kommen per «Strassen-Radar» (Zufall nach Seltenheit): Grau oft … Legendär extrem selten.
//   Grau = nur XP, ab Grün Cash, ab Blau gewinnt man das Auto des Gegners (startet auf LV 1).
// - Alle Autos sind normalisiert (CAR_NORM): auf gleichem Level + Ausbau etwa gleich schnell,
//   seltene Autos haben einen eingebauten Vorsprung (CAR_RAR_F). Duelle: höheres Level +
//   besser gefahren (grüne Zone, NOS-Timing) gewinnt.

// ── Klassen ─────────────────────────────────────────────────────────────────
const CLASSES = {
  jdm:    { name:"JDM",    land:"Japan",       col:"#FF4D6A", icon:"⛩",
            passive:{ n:"Nocken-Kick", d:"+6 % Leistung im oberen Drehzahlband", fx:{ powHi:0.06 } } },
  muscle: { name:"MUSCLE", land:"USA",         col:"#FFB020", icon:"★",
            passive:{ n:"Holeshot", d:"Start-Boost +25 %, +4 % Drehmoment untenrum", fx:{ launchMul:0.25, powLo:0.04 } } },
  german: { name:"GERMAN", land:"Deutschland", col:"#6EA8FF", icon:"✠",
            passive:{ n:"Präzision", d:"Grüne Schaltzone 15 % breiter", fx:{ zoneMul:0.15 } } },
};
// Herkunft pro Auto (nach Look/Vorbild)
const CAR_CLASS = {
  hikari:"jdm", bauer:"german", scorcher:"muscle",
  kaze:"german", urban:"jdm", falco:"jdm", pico:"jdm", rota:"jdm", samura:"jdm", raiden:"jdm", sakura:"jdm",
  grenz:"german", bliz:"jdm", temp:"jdm", strat:"jdm", apex:"muscle", kami:"jdm", taifun:"jdm", axis:"jdm",
  hammer:"muscle", wago:"german", vulkan:"german", ryujin:"german", shini:"jdm", strip:"muscle", onyx:"jdm",
  bansh:"jdm", golem:"muscle", venom:"german", spectre:"german", tsuna:"jdm", bullet:"jdm", warlord:"german",
  eklipse:"german", phoenix:"german", mjoel:"muscle", kirin:"jdm", basil:"muscle", okami:"jdm", titan:"muscle",
  reaper:"german", kuro:"jdm", zenith:"muscle",
};
const carClass = k => CAR_CLASS[k] ?? "jdm";

// ── Seltenheit (Gegner UND Autos) ───────────────────────────────────────────
const RARITIES = ["grey","green","blue","epic","legend"];
const RARITY = {
  grey:   { n:"Gewöhnlich", col:"#9DA3B4", glow:"rgba(157,163,180,.45)", w:620, oppF:1.035, skill:0.42, xpM:1.0, cashM:0,   lv:[-3,-1] },
  green:  { n:"Ungewöhnlich", col:"#2BE05E", glow:"rgba(43,224,94,.5)",  w:260, oppF:0.993, skill:0.58, xpM:1.5, cashM:1,   lv:[0,1] },
  blue:   { n:"Selten",     col:"#3D8BFF", glow:"rgba(61,139,255,.55)", w:100, oppF:0.975, skill:0.72, xpM:2.2, cashM:2.5, lv:[1,2] },
  epic:   { n:"Episch",     col:"#B25CFF", glow:"rgba(178,92,255,.6)",  w:18,  oppF:0.957, skill:0.86, xpM:4.0, cashM:6,   lv:[3,3] },
  legend: { n:"Legendär",   col:"#FF9A1F", glow:"rgba(255,154,31,.7)",  w:2,   oppF:0.940, skill:0.95, xpM:7.0, cashM:15,  lv:[5,5] },
};
// Auto-Seltenheit → eingebauter Vorsprung (Zeit-Faktor auf gleichem Level/Ausbau)
const CAR_RAR_F = { grey:1.0, green:0.995, blue:0.989, epic:0.981, legend:0.970 };
const CAR_RARITY = {
  hikari:"grey", bauer:"grey", scorcher:"grey",
  kaze:"grey", urban:"grey", falco:"grey", pico:"grey", sakura:"grey", rota:"grey",
  grenz:"green", bliz:"green", temp:"green", strat:"green", samura:"green", apex:"green",
  raiden:"blue", kami:"blue", taifun:"blue", axis:"blue", hammer:"blue", wago:"blue", vulkan:"blue", ryujin:"blue",
  shini:"epic", strip:"epic", onyx:"epic", bansh:"epic", golem:"epic", venom:"epic", spectre:"epic", tsuna:"epic",
  bullet:"epic", warlord:"epic", eklipse:"epic", phoenix:"epic", kuro:"epic",
  mjoel:"legend", kirin:"legend", basil:"legend", okami:"legend", titan:"legend", reaper:"legend", zenith:"legend",
};
const carRarity = k => CAR_RARITY[k] ?? "grey";

// ── Fahrer (Gegner-Charaktere) ──────────────────────────────────────────────
// side: gut / böse / grau (für spätere Geschichten). car = Signatur-Auto.
const DRIVERS = [
  // Grau — Strassen-Typen
  { id:"benny",     r:"grey",   name:"BENNY BRÖSEL",  title:"Pizza-Kurier",            side:"gut",  car:"pico",   q:"Wenn ich verliere, wird die Pizza kalt!" },
  { id:"kevin",     r:"grey",   name:"KEVIN",         title:"Azubi mit Papas Auto",    side:"grau", car:"kaze",   q:"Papa darf das NIE erfahren." },
  { id:"hilde",     r:"grey",   name:"OMA HILDE",     title:"Rentnerin auf Abwegen",   side:"gut",  car:"sakura", q:"Früher hatten wir mehr Hubraum, Schätzchen." },
  { id:"toni",      r:"grey",   name:"TONI TEMPO",    title:"Fahrlehrer",              side:"grau", car:"falco",  q:"Blinker setzen. Dann verlieren." },
  { id:"subwoofer", r:"grey",   name:"DJ SUBWOOFER",  title:"Kofferraum voller Bass",  side:"grau", car:"rota",   q:"Hörst du das? Das ist dein Untergang in 808." },
  { id:"mike",      r:"grey",   name:"SCHRAUBER-MIKE",title:"Hinterhof-Mechaniker",    side:"gut",  car:"urban",  q:"Hab ich heute Nacht zusammengeschweisst." },
  // Grün — Szene-Locals
  { id:"nadia",     r:"green",  name:"NADIA NIGHT",   title:"Techno-Racerin",          side:"gut",  car:"bliz",   q:"Mein Takt: 140 BPM. Und deiner?" },
  { id:"lorenzo",   r:"green",  name:"LUCKY LORENZO", title:"Der Zocker",              side:"grau", car:"temp",   q:"Ich setze alles. Immer." },
  { id:"yuki",      r:"green",  name:"YUKI FROST",    title:"Die Stille",              side:"gut",  car:"strat",  q:"…" },
  { id:"brutus",    r:"green",  name:"BRUTUS",        title:"Türsteher vom Hafenclub", side:"böse", car:"apex",   q:"Du kommst hier nicht vorbei." },
  { id:"sandro",    r:"green",  name:"SANDRO LIVE",   title:"Influencer",              side:"grau", car:"samura", q:"Like den Stream, während ich dich abhänge!" },
  // Blau — Selten
  { id:"vega",      r:"blue",   name:"VEGA",          title:"Legende der Ostbrücke",   side:"gut",  car:"taifun", q:"Die Brücke vergisst nie." },
  { id:"ghost",     r:"blue",   name:"GHOST",         title:"Der Phantomfahrer",       side:"grau", car:"axis",   q:"Du hast mich nie gesehen." },
  { id:"keiko",     r:"blue",   name:"KEIKO",         title:"Königin vom Hafen",       side:"böse", car:"raiden", q:"Mein Hafen. Meine Regeln." },
  { id:"doc",       r:"blue",   name:"DOC VOLT",      title:"Verrückter Ingenieur",    side:"grau", car:"wago",   q:"Ich habe die Physik nur… überredet." },
  { id:"panthera",  r:"blue",   name:"PANTHERA",      title:"Big-Block-Diva",          side:"böse", car:"hammer", q:"Acht Zylinder. Null Mitleid." },
  // Episch — Elite-Bosse
  { id:"baron",     r:"epic",   name:"DER BARON",     title:"Herr der Westrampe",      side:"böse", car:"golem",  q:"Geld gewinnt Rennen, mein Junge.",                 boss:"Bestochene Ampel: Reaktion fast perfekt" },
  { id:"noir",      r:"epic",   name:"MADAME NOIR",   title:"Syndikats-Chefin",        side:"böse", car:"onyx",   q:"Jeder hat seinen Preis. Deiner ist niedrig.",      boss:"Doppelter Ladedruck ab dem 3. Gang" },
  { id:"shogun",    r:"epic",   name:"SHOGUN",        title:"Herrscher der Bergpässe", side:"böse", car:"shini",  q:"Die Berge gehören mir. Die Nacht auch.",           boss:"Schaltet IMMER perfekt" },
  { id:"steel",     r:"epic",   name:"SERGEANT STEEL",title:"Dragstrip-Tyrann",        side:"böse", car:"strip",  q:"Runter! Und gib mir zwanzig… Sekunden Rückstand.", boss:"Brutaler Launch, Burnout-frei" },
  { id:"kaiserin",  r:"epic",   name:"DIE KAISERIN",  title:"Präzision aus Stahl",     side:"gut",  car:"spectre",q:"Perfektion ist keine Option. Sie ist Pflicht.",   boss:"Kein einziger Fehler im Getriebe" },
  // Legendär — Mythen der Nacht
  { id:"null",      r:"legend", name:"KÖNIG NULL",    title:"Herrscher der Nacht",     side:"böse", car:"zenith", q:"Niemand sah mein Gesicht. Keiner hat mich je geschlagen.", boss:"1500 Nm und endloses NOS" },
  { id:"inferno",   r:"legend", name:"LADY INFERNO",  title:"Die Feuerkönigin",        side:"grau", car:"reaper", q:"Ich brenne heller als dein Nitro.",                       boss:"Feuer-Launch: startet wie eine Rakete" },
  { id:"tenryu",    r:"legend", name:"MEISTER TENRYU",title:"Der Himmelsdrache",       side:"gut",  car:"kirin",  q:"Der Weg ist das Ziel. Und das Ziel gehört mir.",          boss:"Sieht jede Ampel, bevor sie grün wird" },
];
// Autos, die ein Gegner dieser Seltenheit fahren kann (Signatur-Auto bevorzugt)
const RAR_CAR_POOL = {
  grey:   [["grey",1]],
  green:  [["grey",.45],["green",.55]],
  blue:   [["grey",.2],["green",.4],["blue",.4]],
  epic:   [["blue",.35],["epic",.65]],
  legend: [["epic",.25],["legend",.75]],
};
const SIG_CHANCE = { grey:.5, green:.5, blue:.45, epic:.55, legend:.7 };

// ── Level & XP (WoW-Kurve: 1–60, lange Reise) ───────────────────────────────
const MAX_LVL = 60;
const mobXp = L => 45 + 5*L;
const xpNeed = L => L >= MAX_LVL ? Infinity : Math.round((3 + 0.75*L) * mobXp(L));
const rarCash = L => 80 + 30*L;                           // Grün-Preisgeld auf Level L

// ── Tuning-Teile: Stufen, Wirkung, Freischalt-Level ─────────────────────────
const UPGRADES = [
  { k:"engine", n:"Motor",       max:8, d:"+6 % Leistung pro Stufe" },
  { k:"turbo",  n:"Turbolader",  max:5, d:"Mehr Ladedruck — und Turbo-Flattern" },
  { k:"tires",  n:"Reifen",      max:5, d:"+6.5 % Grip pro Stufe" },
  { k:"trans",  n:"Getriebe",    max:5, d:"Schnellere Schaltzeiten" },
  { k:"weight", n:"Leichtbau",   max:5, d:"−32 kg pro Stufe" },
  { k:"nos",    n:"NOS-System",  max:5, d:"+0.7 s Lachgas pro Stufe" },
];
const TURBO_PM = [0, 0.12, 0.24, 0.34, 0.43, 0.50];
const TURBO_SND = [0, 1, 1, 2, 3, 3];                     // Flatter-Stärke (Sound) je Stufe
// Freischalt-Plan: LV 2–9 je ein Teil, danach jedes ungerade Level (11…59)
const PART_PLAN = [
  [2,"engine",1],[3,"nos",1],[4,"tires",1],[5,"turbo",1],[6,"trans",1],[7,"weight",1],[8,"engine",2],[9,"nos",2],
  [11,"turbo",2],[13,"engine",3],[15,"tires",2],[17,"trans",2],[19,"weight",2],[21,"nos",3],[23,"turbo",3],
  [25,"engine",4],[27,"tires",3],[29,"trans",3],[31,"engine",5],[33,"weight",3],[35,"turbo",4],[37,"nos",4],
  [39,"tires",4],[41,"engine",6],[43,"trans",4],[45,"weight",4],[47,"turbo",5],[49,"engine",7],[51,"tires",5],
  [53,"nos",5],[55,"trans",5],[57,"weight",5],[59,"engine",8],
];
const partUnlockLvl = (k, stage) => (PART_PLAN.find(p => p[1] === k && p[2] === stage) || [99])[0];
const partCost = (k, stage) => { const L = partUnlockLvl(k, stage); return Math.round(0.55 * rarCash(L) * (3 + 0.75*L) / 10) * 10; };
// Style-Freischaltungen (Auto-Level) — eine Quelle für Garage + Level-Up-Anzeige
const STYLE_PLAN = [
  [1,"paint","Lackierpistole"],[2,"sticker1","Sticker-Set «Street»"],[3,"rim1","Felge Mesh Gold"],[4,"stance","Gewindefahrwerk"],
  [5,"spoiler1","Lip-Spoiler"],[6,"exhaust1","Duplex-Auspuff"],[7,"stripes","Rennstreifen"],[8,"neon1","Neon-Unterboden"],
  [10,"kit1","Bodykit Street"],[12,"rim2","Felge Turbofan"],[14,"exhaust2","Big-Bore-Auspuff"],[16,"paintPro","Metallic- & Perleffekt-Lacke"],
  [18,"spoiler2","GT-Wing"],[20,"rim3","Felge Racing Weiss"],[22,"sticker2","Sticker-Set «Tuner»"],[24,"exhaust3","Race Sidepipe"],
  [26,"paintLeg","Chrom- & Candy-Lacke"],[30,"kit2","Widebody"],[36,"sticker3","Sticker-Set «Legends»"],[50,"sticker4","Sticker-Set «Elite»"],
  [60,"rim4","Felge Gold Legende"],
];
const styleUnlockLvl = key => (STYLE_PLAN.find(p => p[1] === key) || [1])[0];
const stylePrice = key => { const L = styleUnlockLvl(key); return Math.round(Math.max(200, 0.18 * rarCash(L) * (3 + 0.75*L)) / 10) * 10; };
// Was bringt Level L? (für Level-Up-Feier und Vorschau)
function levelRewards(L){
  const out = [];
  PART_PLAN.filter(p => p[0] === L).forEach(p => out.push({ type:"part", k:p[1], stage:p[2],
    t:`${UPGRADES.find(u => u.k === p[1]).n} Stufe ${p[2]}` }));
  STYLE_PLAN.filter(p => p[0] === L).forEach(p => out.push({ type:"style", k:p[1], t:p[2] }));
  if (L >= 10) out.push({ type:"talent", t: L === 10 ? "Talentbaum + 1. Talentpunkt" : "+1 Talentpunkt" });
  if (L === MAX_LVL) out.push({ type:"title", t:"Titel «Legende» — dein Auto ist komplett" });
  return out;
}
const talentPoints = L => Math.max(0, Math.min(MAX_LVL, L) - 9);

// ── Talente ─────────────────────────────────────────────────────────────────
// fx-Schlüssel (alle in buildSpec ausgewertet, deterministisch für Duelle):
// pow powHi powLo mu shiftMul zoneMul perfMul launchMul nos nosPow mass drag | luck xp cash hunter
const TIER_REQ = 4;                                       // Punkte im Baum pro Reihe
const TALENTS = {
  jdm: { n:"TUNER", sub:"Japan-Schule", col:"#FF4D6A", nodes:[
    { id:"j_rev",   t:0, n:"Drehorgel",          max:5, fx:{ powHi:0.02 },   d:"+2 % Leistung im oberen Drehzahlband" },
    { id:"j_shift", t:0, n:"Kurzhub-Schaltung",  max:3, fx:{ shiftMul:-0.04 }, d:"−4 % Schaltzeit" },
    { id:"j_zone",  t:1, n:"Schaltgefühl",       max:3, fx:{ zoneMul:0.06 }, d:"Grüne Zone +6 % breiter" },
    { id:"j_boost", t:1, n:"Ladedruck-Junkie",   max:5, fx:{ pow:0.012 },    d:"+1.2 % Leistung" },
    { id:"j_alag",  t:2, n:"Anti-Lag",           max:3, fx:{ launchMul:0.10 }, d:"+10 % Start-Boost" },
    { id:"j_light", t:2, n:"Leichtbau-Wahn",     max:2, fx:{ mass:-15 },     d:"−15 kg" },
    { id:"j_perf",  t:3, n:"Perfektionist",      max:5, fx:{ perfMul:0.05 }, d:"+5 % PERFECT-Schub" },
    { id:"j_cap",   t:4, n:"Begrenzer-Brecher",  max:1, fx:{ powHi:0.06, zoneMul:0.08 }, d:"Meister-Talent: +6 % Leistung oben, Zone +8 %", cap:true },
  ]},
  muscle: { n:"V8", sub:"Muscle-Schule", col:"#FFB020", nodes:[
    { id:"m_disp",  t:0, n:"Hubraum",            max:5, fx:{ powLo:0.03 },   d:"+3 % Drehmoment untenrum" },
    { id:"m_tire",  t:0, n:"Breitreifen",        max:3, fx:{ mu:0.02 },      d:"+2 % Grip" },
    { id:"m_burn",  t:1, n:"Burnout-Profi",      max:3, fx:{ launchMul:0.12 }, d:"+12 % Start-Boost" },
    { id:"m_block", t:1, n:"Big Block",          max:5, fx:{ pow:0.012 },    d:"+1.2 % Leistung" },
    { id:"m_nos",   t:2, n:"Lachgas-Junkie",     max:3, fx:{ nos:0.35 },     d:"+0.35 s NOS" },
    { id:"m_brut",  t:2, n:"Brachial",           max:2, fx:{ nosPow:0.06 },  d:"+6 % NOS-Wucht" },
    { id:"m_wave",  t:3, n:"Drehmoment-Welle",   max:5, fx:{ powLo:0.02, mu:0.006 }, d:"+2 % Drehmoment unten, mehr Grip" },
    { id:"m_cap",   t:4, n:"Big-Block-Donner",   max:1, fx:{ nos:0.8, nosPow:0.10 }, d:"Meister-Talent: +0.8 s NOS, +10 % NOS-Wucht", cap:true },
  ]},
  german: { n:"INGENIEUR", sub:"Deutsche Schule", col:"#6EA8FF", nodes:[
    { id:"g_zone",  t:0, n:"Präzisionsarbeit",   max:5, fx:{ zoneMul:0.05 }, d:"Grüne Zone +5 % breiter" },
    { id:"g_dct",   t:0, n:"Doppelkupplung",     max:3, fx:{ shiftMul:-0.05 }, d:"−5 % Schaltzeit" },
    { id:"g_aero",  t:1, n:"Windkanal",          max:5, fx:{ drag:-0.025 },  d:"−2.5 % Luftwiderstand" },
    { id:"g_awd",   t:1, n:"Allrad-Grip",        max:3, fx:{ mu:0.02 },      d:"+2 % Grip" },
    { id:"g_eng",   t:2, n:"Ingenieurskunst",    max:5, fx:{ pow:0.01 },     d:"+1 % Leistung" },
    { id:"g_alu",   t:2, n:"Leichtmetall",       max:2, fx:{ mass:-15 },     d:"−15 kg" },
    { id:"g_ratio", t:3, n:"Perfekte Übersetzung", max:3, fx:{ perfMul:0.06 }, d:"+6 % PERFECT-Schub" },
    { id:"g_cap",   t:4, n:"Autobahn-Kaiser",    max:1, fx:{ drag:-0.08, pow:0.03 }, d:"Meister-Talent: −8 % Luftwiderstand, +3 % Leistung", cap:true },
  ]},
  luck: { n:"GLÜCK", sub:"Strasse & Ruf", col:"#FFD34D", nodes:[
    { id:"l_luck",  t:0, n:"Glückspilz",         max:5, fx:{ luck:1 },       d:"Seltenere Gegner tauchen öfter auf" },
    { id:"l_rep",   t:0, n:"Ruf der Strasse",    max:3, fx:{ xp:0.04 },      d:"+4 % XP" },
    { id:"l_spon",  t:1, n:"Sponsoren",          max:3, fx:{ cash:0.08 },    d:"+8 % Preisgeld" },
    { id:"l_hunt",  t:2, n:"Kopfgeldjäger",      max:2, fx:{ hunter:1 },     d:"Garantierter seltener Gegner 4 Suchen früher" },
  ]},
};
const TALENT_BY_ID = {};
Object.entries(TALENTS).forEach(([tree, T]) => T.nodes.forEach(n => TALENT_BY_ID[n.id] = { ...n, tree }));
const treeSpent = (tal, tree) => TALENTS[tree].nodes.reduce((a, n) => a + (tal?.[n.id] || 0), 0);
const talentSpent = tal => Object.values(tal || {}).reduce((a, b) => a + b, 0);
function canLearn(tal, id, level){
  const n = TALENT_BY_ID[id]; if (!n) return false;
  if ((tal[id] || 0) >= n.max) return false;
  if (talentSpent(tal) >= talentPoints(level)) return false;
  return treeSpent(tal, n.tree) >= n.t * TIER_REQ;
}
// Summe aller Effekte: Klassen-Fähigkeit + Talente (eigene Schule: Meister-Talent ×1.5)
function talentFx(carKey, tal){
  const fx = {}, add = (k, v) => fx[k] = (fx[k] || 0) + v;
  const cls = carClass(carKey);
  Object.entries(CLASSES[cls].passive.fx).forEach(([k, v]) => add(k, v));
  Object.entries(tal || {}).forEach(([id, rank]) => {
    const n = TALENT_BY_ID[id]; if (!n || !rank) return;
    const m = n.cap && n.tree === cls ? 1.5 : 1;
    Object.entries(n.fx).forEach(([k, v]) => add(k, v * rank * m));
  });
  return fx;
}

// ── Auto-Normalisierung (aus tools/rpg-sim.mjs --norm) ──────────────────────
// [powerMul-Faktor, Grip-Faktor] pro Auto → Serienauto LV 1 ≈ BASE_ET × CAR_RAR_F
const BASE_ET = 16.2;
// <CAR-NORM>
const CAR_NORM = {
  hikari:[0.992,0.9987,0.992,0.9987],
  bauer:[0.9183,0.9865,0.9267,0.988],
  scorcher:[0.7626,0.9578,0.9268,0.988],
  kaze:[0.9663,0.9946,0.9156,0.9861],
  urban:[0.8829,0.9804,0.9592,0.9934],
  falco:[0.9124,0.9855,1.0673,1.0104],
  pico:[0.8306,0.9709,1.1927,1.0284],
  rota:[0.7941,0.964,0.8942,0.9824],
  samura:[0.5333,0.9048,0.7211,0.9493],
  raiden:[0.5668,0.9136,0.6872,0.9421],
  sakura:[0.7204,0.9492,0.766,0.9585],
  grenz:[0.7309,0.9513,0.7922,0.9636],
  bliz:[0.6128,0.9251,0.681,0.9407],
  temp:[0.5819,0.9175,0.6555,0.935],
  strat:[0.6172,0.9261,0.767,0.9587],
  apex:[0.5208,0.9014,0.6306,0.9293],
  kami:[0.4954,0.8943,0.5498,0.9092],
  taifun:[0.506,0.8973,0.6982,0.9444],
  axis:[0.5517,0.9097,0.5943,0.9206],
  hammer:[0.4714,0.8872,0.6173,0.9261],
  wago:[0.5493,0.9091,0.5735,0.9154],
  vulkan:[0.4153,0.8695,0.4078,0.867],
  ryujin:[0.364,0.8515,0.3264,0.8368],
  shini:[0.3253,0.8364,0.3141,0.8317],
  strip:[0.284,0.8185,0.2347,0.7941],
  onyx:[0.2607,0.8074,0.2794,0.8164],
  bansh:[0.2564,0.8053,0.282,0.8176],
  golem:[0.2966,0.8242,0.3048,0.8278],
  venom:[0.2864,0.8196,0.2581,0.8062],
  spectre:[0.2688,0.8114,0.2478,0.801],
  tsuna:[0.2281,0.7905,0.2413,0.7976],
  bullet:[0.2036,0.7763,0.1841,0.764],
  warlord:[0.2459,0.8,0.2532,0.8037],
  eklipse:[0.2396,0.7967,0.2165,0.784],
  phoenix:[0.2425,0.7982,0.2,0.7741],
  mjoel:[0.2389,0.7963,0.2266,0.7896],
  kirin:[0.2211,0.7866,0.2291,0.791],
  basil:[0.2006,0.7745,0.1619,0.7485],
  okami:[0.2255,0.789,0.2053,0.7773],
  titan:[0.1888,0.767,0.1627,0.7491],
  reaper:[0.19,0.7678,0.1493,0.739],
  kuro:[0.217,0.7842,0.1825,0.7629],
  zenith:[0.1579,0.7455,0.1213,0.7149],
};
// </CAR-NORM>
// Erwartete Zeit eines Gegners auf Level L (Referenz-Auto, alle Teile bis L, Talente)
// <REF-ET>
const REF_ET = [0,16.189,15.688,15.54,15.481,14.811,14.783,14.582,14.308,14.186,14.17,13.715,13.701,13.87,13.859,13.703,13.699,13.652,13.584,13.605,13.68,13.56,13.527,13.154,13.122,12.824,12.824,12.697,12.697,12.519,12.435,12.16,12.272,12.085,12.082,11.977,11.914,11.866,11.861,11.748,11.825,11.619,11.599,11.541,11.536,11.336,11.326,11.206,11.199,11.098,11.061,10.91,10.878,10.789,10.774,10.721,10.706,10.509,10.423,10.254,10.251,10.251,10.251,10.251,10.251,10.251,10.251];
// </REF-ET>

// ── Strassen-Radar: Gegner ziehen ────────────────────────────────────────────
const PITY_BASE = 25;                                     // spätestens jede 25. Suche ein Blauer+
function rollRarity(rng, luck = 0, pity = 0, hunter = 0){
  const W = {
    grey: RARITY.grey.w, green: RARITY.green.w * (1 + 0.05*luck), blue: RARITY.blue.w * (1 + 0.08*luck),
    epic: RARITY.epic.w * (1 + 0.12*luck), legend: RARITY.legend.w * (1 + 0.15*luck),
  };
  if (pity >= PITY_BASE - 4*hunter - 1){ W.grey = 0; W.green = 0; }
  const sum = RARITIES.reduce((a, r) => a + W[r], 0);
  let x = rng() * sum;
  for (const r of RARITIES){ x -= W[r]; if (x < 0) return r; }
  return "grey";
}
function pickCarFor(rar, rng, sig){
  if (sig && rng() < SIG_CHANCE[rar]) return sig;
  const pools = RAR_CAR_POOL[rar];
  let x = rng(), cr = pools[pools.length-1][0];
  for (const [r, p] of pools){ x -= p; if (x < 0){ cr = r; break; } }
  const cars = Object.keys(CAR_RARITY).filter(k => CAR_RARITY[k] === cr && k !== "kuro" && (typeof CAR_DEFS === "undefined" || CAR_DEFS[k]));
  return cars[Math.floor(rng() * cars.length)] ?? sig;
}
// Begegnung erzeugen: Fahrer, Level, Auto, Belohnung (Sieg)
function makeEncounter(myLvl, rng = Math.random, opts = {}){
  const rar = opts.rarity ?? rollRarity(rng, opts.luck || 0, opts.pity || 0, opts.hunter || 0);
  const list = DRIVERS.filter(d => d.r === rar);
  const drv = list[Math.floor(rng() * list.length)];
  const [a, b] = RARITY[rar].lv;
  const lvl = Math.max(1, Math.min(MAX_LVL + 5, myLvl + a + Math.floor(rng() * (b - a + 1))));
  const car = pickCarFor(rar, rng, drv.car);
  return { id: drv.id, rar, lvl, car, name: drv.name, title: drv.title, q: drv.q, boss: drv.boss || null,
           et: refEt(lvl) * RARITY[rar].oppF, skill: RARITY[rar].skill, seed: Math.floor(rng()*1e9) };
}
function refEt(L){
  if (!REF_ET.length) return BASE_ET * Math.pow(0.988, L - 1);
  const i = Math.max(1, Math.min(REF_ET.length - 1, Math.round(L)));
  return REF_ET[i];
}
// Belohnung bei SIEG (Niederlage: nichts). fx = Talent-Effekte (xp/cash)
function encounterReward(enc, myLvl, fx = {}){
  const R = RARITY[enc.rar];
  const d = enc.lvl - myLvl;
  const diffM = d < 0 ? Math.max(0.3, 1 + d*0.15) : Math.min(1.4, 1 + d*0.05);
  const xp = myLvl >= MAX_LVL ? 0 : Math.round(mobXp(enc.lvl) * R.xpM * diffM * (1 + (fx.xp || 0)));
  const cash = Math.round(rarCash(enc.lvl) * R.cashM * (1 + (fx.cash || 0)) / 10) * 10;
  const car = enc.rar === "blue" || enc.rar === "epic" || enc.rar === "legend" ? enc.car : null;
  return { xp, cash, car };
}

if (typeof globalThis !== "undefined") Object.assign(globalThis, {
  CLASSES, CAR_CLASS, carClass, RARITIES, RARITY, CAR_RAR_F, CAR_RARITY, carRarity, DRIVERS, MAX_LVL, mobXp, xpNeed, rarCash,
  UPGRADES, TURBO_PM, TURBO_SND, PART_PLAN, partUnlockLvl, partCost, STYLE_PLAN, styleUnlockLvl, stylePrice, levelRewards,
  talentPoints, TIER_REQ, TALENTS, TALENT_BY_ID, treeSpent, talentSpent, canLearn, talentFx, BASE_ET, CAR_NORM, REF_ET,
  PITY_BASE, rollRarity, makeEncounter, refEt, encounterReward,
});
