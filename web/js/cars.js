// cars.js v4 — 20 Autos, jetzt mit 15 EIGENSTÄNDIGEN Karosserien nach echten
// Vorbildern der Tuner-Szene (Masse massstäblich: Länge/Radstand/Höhe des
// jeweiligen Vorbilds auf 480px-Canvas umgerechnet). Eigene Namen/Marken.
// Vorbilder: 80er Keilcoupé, EG-Hatch, S13-Coupé, FD-RX7, NA-Roadster, Kei-Box,
// Rallye-Limo, R34-GTR, MK4-Supra, 69er-Fastback-Muscle, 850R-Kombi, NSX,
// V10-Keil, GT1-Renner, Pro-Street-Dragster.
// Karosserie OHNE Räder (SVG→Image); Räder = rotierende Canvas-Sprites im Spiel.
// Style editierbar: hue (Lack), drop (Tieferlegung), rim, exhaust, spoiler.

// Drehmomentkurve kompakt erzeugen
function mkTorque(peak, peakRpm, redline, opt = {}){
  const low = opt.low ?? 0.62;         // Anteil bei 1000rpm (Turbo: tiefer)
  const hold = opt.hold ?? 0.88;       // Anteil kurz vor Redline (VTEC-Feeling: hoch)
  return [
    [1000, peak*low],
    [Math.round(peakRpm*0.62), peak*0.86],
    [peakRpm, peak],
    [Math.round(redline*0.94), peak*hold],
    [redline, peak*0.74],
  ];
}

// key: name, desc; unlock = Karriere-Level; starter = Startwahl; zone = grüne Schaltzone (rpm).
const CAR_DEFS = {
  // ── Starter (Wahl 1 aus 3) ──
  kaze:   { name:"KAZE ZX",    desc:"80er Keil-Coupé · federleicht, wenig Dampf", price:0, unlock:1, starter:true,
            mass:890,  wheelR:0.28, redline:7600, idle:950,  torque:mkTorque(150,5800,7600,{hold:.92}),
            gears:[3.25,1.95,1.35,1.03,0.84], final:4.25, shape:"wedge", grip:1.0, zone:650,
            pros:"Leicht · giftig", cons:"Wenig Drehmoment" },
  urban:  { name:"URBAN R",    desc:"Kompakt-Hatch · der Allrounder der Szene", price:0, unlock:1, starter:true,
            mass:1020, wheelR:0.29, redline:8200, idle:1000, torque:mkTorque(165,6400,8200,{hold:.95}),
            gears:[3.23,2.10,1.48,1.11,0.89], final:4.30, shape:"hatch", grip:1.0, zone:650,
            pros:"Dreht hoch · ausgewogen", cons:"Braucht Drehzahl" },
  falco:  { name:"FALCO 86",   desc:"Heck-Coupé · Drift-Balance-Legende", price:0, unlock:1, starter:true,
            mass:1080, wheelR:0.29, redline:7800, idle:950,  torque:mkTorque(175,5600,7800),
            gears:[3.59,2.02,1.38,1.00,0.86], final:4.10, shape:"coupe", grip:0.96, zone:640,
            pros:"Sauberer Punch", cons:"Heck will Grip" },
  // ── Aufsteiger ──
  pico:   { name:"PICO KT",    desc:"Kei-Turbo · klein, frech, zappelig", price:3500, unlock:2,
            mass:780,  wheelR:0.26, redline:8800, idle:1100, torque:mkTorque(130,7000,8800,{low:.45}),
            gears:[3.60,2.35,1.65,1.25,1.00], final:4.60, shape:"kei", grip:0.94, zone:600,
            pros:"Superleicht", cons:"Kurzer Atem oben raus" },
  rota:   { name:"ROTA R2",    desc:"Wankel-Coupé · Kurven wie gegossen", price:6500, unlock:3,
            mass:1180, wheelR:0.30, redline:9500, idle:1100, torque:mkTorque(210,7800,9500,{low:.5,hold:.96}),
            gears:[3.48,2.02,1.39,1.03,0.79], final:4.35, shape:"rx7", grip:0.98, zone:420,
            pros:"Irrer Drehzahlbereich", cons:"Unten zäh" },
  samura: { name:"SAMURA RZ",  desc:"DIE 90er-Legende · 2JZ-Ikone, endlos tunebar", price:18500, unlock:4,
            mass:1510, wheelR:0.31, redline:7700, idle:900, torque:mkTorque(425,5600,7700,{low:.55}),
            gears:[3.83,2.36,1.69,1.31,1.00,0.79], final:3.73, shape:"supra", grip:1.02, zone:430,
            pros:"2JZ-Punch · Turbo-Schub ohne Ende", cons:"Schwer · teuer für den Level" },
  raiden: { name:"RAIDEN R",   desc:"Godzilla · AWD-Twin-Turbo-Legende", price:26000, unlock:6,
            mass:1560, wheelR:0.31, redline:7800, idle:950, torque:mkTorque(395,5000,7800,{low:.6}),
            gears:[3.83,2.36,1.69,1.31,1.00,0.79], final:3.90, shape:"gtr", grip:1.14, zone:400,
            pros:"AWD-Launch wie angenagelt", cons:"Schwer · säuft Budget" },
  sakura: { name:"SAKURA S",   desc:"Roadster · Präzisionswerkzeug", price:9000, unlock:4,
            mass:1140, wheelR:0.29, redline:9000, idle:1000, torque:mkTorque(220,7500,9000,{hold:.95}),
            gears:[3.13,2.04,1.48,1.16,0.94,0.81], final:4.10, shape:"roadster", grip:1.0, zone:500,
            pros:"6-Gang · dreht wie irre", cons:"Leichtes Heck" },
  grenz:  { name:"GRENZ GT",   desc:"Euro-Hatch · Autobahn-DNA", price:12000, unlock:5,
            mass:1240, wheelR:0.30, redline:7200, idle:900,  torque:mkTorque(280,4800,7200,{low:.7}),
            gears:[3.36,2.09,1.47,1.10,0.90], final:3.94, shape:"hatch", grip:1.02, zone:620,
            pros:"Fetter Mitteldruck", cons:"Frontlastig" },
  bliz:   { name:"BLIZZARD RS",desc:"AWD-Rallye-Limo · Launch-Monster", price:16000, unlock:6,
            mass:1350, wheelR:0.30, redline:7600, idle:950,  torque:mkTorque(330,5200,7600,{low:.55}),
            gears:[3.63,2.36,1.69,1.25,1.00], final:4.11, shape:"sedan", grip:1.18, zone:580,
            pros:"Klebt beim Start", cons:"Schwer" },
  temp:   { name:"TEMPEST X",  desc:"AWD-Turbo-Limo · der Rivale", price:19000, unlock:7,
            mass:1380, wheelR:0.30, redline:7800, idle:950,  torque:mkTorque(345,5600,7800,{low:.5}),
            gears:[3.90,2.42,1.71,1.28,1.00], final:4.05, shape:"sedan", grip:1.16, zone:560,
            pros:"Traktion + Turbo", cons:"Turboloch" },
  strat:  { name:"STRATOS SI", desc:"90er Sport-Coupé · Understatement", price:23000, unlock:8,
            mass:1270, wheelR:0.30, redline:8400, idle:950,  torque:mkTorque(290,6800,8400,{hold:.93}),
            gears:[3.27,1.90,1.36,1.03,0.82,0.71], final:4.39, shape:"coupe", grip:1.02, zone:520,
            pros:"Breites Band", cons:"Kein Wumms unten" },
  apex:   { name:"APEX GT",    desc:"69er Muscle · Drehmoment ohne Ende", price:28000, unlock:9,
            mass:1420, wheelR:0.32, redline:7000, idle:900,  torque:mkTorque(465,4500,7000,{low:.75}),
            gears:[3.10,2.02,1.46,1.12,0.90], final:3.73, shape:"muscle", grip:0.98, zone:540,
            pros:"Brachialer Antritt", cons:"Schwer · Grip-Limit" },
  kami:   { name:"KAMI R",     desc:"Import-Legende · Godzilla-Archetyp", price:36000, unlock:10,
            mass:1400, wheelR:0.31, redline:8600, idle:1000, torque:mkTorque(400,6200,8600,{low:.55}),
            gears:[3.45,2.30,1.65,1.26,1.00,0.84], final:4.10, shape:"gtr", grip:1.15, zone:460,
            pros:"AWD-Grip + Twin-Turbo", cons:"Massig" },
  taifun: { name:"TAIFUN MK",  desc:"Legenden-Coupé · 2JZ-Archetyp", price:45000, unlock:11,
            mass:1460, wheelR:0.31, redline:8000, idle:900,  torque:mkTorque(440,5800,8000,{low:.5}),
            gears:[3.83,2.36,1.69,1.31,1.00,0.79], final:3.77, shape:"supra", grip:1.02, zone:480,
            pros:"Endloser Turbo-Schub", cons:"Träge unter 3000" },
  axis:   { name:"AXIS NX",    desc:"Mittelmotor · Alu-Skalpell", price:56000, unlock:12,
            mass:1230, wheelR:0.30, redline:8800, idle:1000, torque:mkTorque(320,7200,8800,{hold:.96}),
            gears:[3.07,1.95,1.43,1.09,0.88,0.72], final:4.44, shape:"nsx", grip:1.08, zone:420,
            pros:"Perfekte Balance", cons:"Teuer im Ausbau" },
  hammer: { name:"HAMMER 502", desc:"Big-Block · Asphalt-Presslufthammer", price:68000, unlock:13,
            mass:1580, wheelR:0.33, redline:6600, idle:850,  torque:mkTorque(600,4200,6600,{low:.8}),
            gears:[2.97,2.07,1.43,1.00,0.84], final:3.55, shape:"muscle", grip:1.0, zone:560,
            pros:"600 Nm ab Standgas", cons:"Panzer-Gewicht" },
  wago:   { name:"WAGO RS",    desc:"Power-Kombi · Schläfer", price:80000, unlock:14,
            mass:1520, wheelR:0.31, redline:7400, idle:900,  torque:mkTorque(480,5400,7400,{low:.6}),
            gears:[3.40,2.19,1.63,1.29,1.03,0.84], final:3.90, shape:"wagon", grip:1.12, zone:560,
            pros:"AWD · unauffällig tödlich", cons:"Kombi-Kilos" },
  vulkan: { name:"VULKAN V10", desc:"V10-Keil · Feuerwerk", price:110000, unlock:15,
            mass:1350, wheelR:0.31, redline:8900, idle:1100, torque:mkTorque(540,6800,8900,{hold:.94}),
            gears:[3.13,2.11,1.56,1.22,0.97,0.82], final:3.54, shape:"v10", grip:1.12, zone:380,
            pros:"V10-Sound der Götter", cons:"Nervös am Limit" },
  ryujin: { name:"RYUJIN GT1", desc:"GT-Renner · Strassenzulassung? Knapp.", price:117000, unlock:16,
            mass:1180, wheelR:0.31, redline:9200, idle:1200, torque:mkTorque(520,7400,9200,{hold:.95}),
            gears:[2.92,2.05,1.55,1.24,1.02,0.86], final:3.90, shape:"gt1", grip:1.22, zone:340,
            pros:"Rennwagen-Grip", cons:"Kompromisslos" },
  shini:  { name:"SHINIGAMI R",desc:"Drag-GTR · gebaut für die Meile", price:127000, unlock:18,
            mass:1150, wheelR:0.32, redline:9800, idle:1300, torque:mkTorque(640,7800,9800,{low:.4}),
            gears:[3.20,2.10,1.55,1.18,0.94], final:3.90, shape:"gtr", grip:1.25, zone:300,
            pros:"Monster-Ladedruck", cons:"Alles oder nichts" },
  strip:  { name:"STRIP KING", desc:"Pro-Street · die Endstufe", price:137000, unlock:20,
            mass:1250, wheelR:0.34, redline:8400, idle:1200, torque:mkTorque(820,6200,8400,{low:.7}),
            gears:[2.90,1.95,1.40,1.05,0.86], final:3.60, shape:"drag", grip:1.30, zone:320,
            pros:"820 Nm Wahnsinn", cons:"Nur geradeaus" },
  // ── Elite-Liga (Level 22–70) — für alle, die das «Maximum» erreicht haben ──
  onyx:   { name:"ONYX TT",    desc:"Twin-Turbo-Coupé · schwarz wie die Nacht", price:146000, unlock:22,
            mass:1380, wheelR:0.31, redline:8400, idle:950,  torque:mkTorque(860,6200,8400,{low:.45}),
            gears:[3.40,2.20,1.62,1.26,1.02,0.84], final:3.70, shape:"supra", grip:1.28, zone:300,
            pros:"Doppelter Ladedruck", cons:"Turboloch bleibt" },
  bansh:  { name:"BANSHEE RX", desc:"Renn-Wankel · schreit bis 10'600", price:160000, unlock:25,
            mass:1120, wheelR:0.30, redline:10600, idle:1200, torque:mkTorque(600,8800,10600,{low:.38,hold:.97}),
            gears:[3.55,2.30,1.68,1.28,1.00,0.82], final:4.20, shape:"rx7", grip:1.22, zone:260,
            pros:"Dreht in den Wahnsinn", cons:"Unten komplett tot" },
  golem:  { name:"GOLEM V12",  desc:"V12-Muscle · rollender Erdrutsch", price:176000, unlock:28,
            mass:1620, wheelR:0.33, redline:7200, idle:850,  torque:mkTorque(980,4600,7200,{low:.82}),
            gears:[2.95,2.00,1.42,1.05,0.85], final:3.50, shape:"muscle", grip:1.24, zone:340,
            pros:"980 Nm ab Keller", cons:"Wiegt wie ein Fels" },
  venom:  { name:"VENOM X",    desc:"V10-Keil · giftig bis zum Begrenzer", price:190000, unlock:31,
            mass:1330, wheelR:0.31, redline:9200, idle:1100, torque:mkTorque(760,7200,9200,{hold:.95}),
            gears:[3.10,2.08,1.54,1.20,0.96,0.80], final:3.60, shape:"v10", grip:1.30, zone:300,
            pros:"Beisst oben brutal", cons:"Will hohe Drehzahl" },
  spectre:{ name:"SPECTRE S",  desc:"Mittelmotor-Phantom · kaum zu fassen", price:205000, unlock:34,
            mass:1210, wheelR:0.30, redline:9400, idle:1050, torque:mkTorque(680,7600,9400,{hold:.96}),
            gears:[3.05,1.98,1.46,1.12,0.90,0.74], final:4.30, shape:"nsx", grip:1.32, zone:280,
            pros:"Federleicht + Grip", cons:"Kein Drehmoment-Berg" },
  tsuna:  { name:"TSUNAMI R",  desc:"AWD-Flaggschiff · die Welle rollt", price:220000, unlock:37,
            mass:1420, wheelR:0.31, redline:9000, idle:1000, torque:mkTorque(880,6600,9000,{low:.5}),
            gears:[3.40,2.25,1.64,1.26,1.00,0.83], final:4.00, shape:"gtr", grip:1.38, zone:280,
            pros:"Klebt + drückt endlos", cons:"Massige Technik" },
  bullet: { name:"BULLET K",   desc:"640-kg-Kei mit Monsterlader · Wahnsinn", price:235000, unlock:40,
            mass:640,  wheelR:0.26, redline:9800, idle:1250, torque:mkTorque(420,7800,9800,{low:.42}),
            gears:[3.70,2.45,1.72,1.30,1.02], final:4.50, shape:"kei", grip:1.18, zone:260,
            pros:"Absurd leicht", cons:"Zappelt wie irre" },
  warlord:{ name:"WARLORD",    desc:"Panzer-Kombi · 1000 Nm Familienkutsche", price:249000, unlock:43,
            mass:1560, wheelR:0.32, redline:8000, idle:900,  torque:mkTorque(1000,5800,8000,{low:.6}),
            gears:[3.30,2.15,1.60,1.26,1.01,0.83], final:3.80, shape:"wagon", grip:1.40, zone:300,
            pros:"AWD-Dampfhammer", cons:"Kombi bleibt Kombi" },
  eklipse:{ name:"EKLIPSE 9",  desc:"Retro-Keil, Neuzeit-Technik · Sonnenfinsternis", price:264000, unlock:46,
            mass:1150, wheelR:0.30, redline:9600, idle:1100, torque:mkTorque(720,7800,9600,{hold:.95}),
            gears:[3.20,2.10,1.55,1.20,0.96,0.79], final:4.10, shape:"wedge", grip:1.34, zone:260,
            pros:"Scharf wie eine Klinge", cons:"Eng am Limit" },
  phoenix:{ name:"PHOENIX GT", desc:"GT-Renner · steigt aus jeder Asche", price:279000, unlock:49,
            mass:1190, wheelR:0.31, redline:9600, idle:1200, torque:mkTorque(820,7800,9600,{hold:.96}),
            gears:[2.95,2.05,1.55,1.24,1.02,0.86], final:3.85, shape:"gt1", grip:1.44, zone:240,
            pros:"Downforce ohne Ende", cons:"Null Komfort" },
  mjoel:  { name:"MJÖLNIR",    desc:"Hammer der Götter · Big Block reloaded", price:293000, unlock:52,
            mass:1500, wheelR:0.33, redline:7600, idle:850,  torque:mkTorque(1150,5000,7600,{low:.85}),
            gears:[2.90,2.00,1.42,1.04,0.85], final:3.45, shape:"muscle", grip:1.40, zone:300,
            pros:"1150 Nm Donnerschlag", cons:"Träge Masse" },
  kirin:  { name:"KIRIN RS",   desc:"AWD-Fabelwesen · Launch aus einer anderen Welt", price:308000, unlock:55,
            mass:1440, wheelR:0.31, redline:8800, idle:950,  torque:mkTorque(950,6600,8800,{low:.55}),
            gears:[3.45,2.28,1.66,1.27,1.01,0.84], final:3.95, shape:"sedan", grip:1.46, zone:260,
            pros:"Startet wie ein Blitz", cons:"Elektronik-Diva" },
  basil:  { name:"BASILISK",   desc:"Drag-Bestie · ein Blick versteinert", price:323000, unlock:58,
            mass:1280, wheelR:0.34, redline:9000, idle:1250, torque:mkTorque(1200,6800,9000,{low:.6}),
            gears:[2.85,1.92,1.38,1.04,0.85], final:3.55, shape:"drag", grip:1.50, zone:260,
            pros:"1200 Nm Gift", cons:"Frisst Reifen" },
  okami:  { name:"OKAMI Z",    desc:"Leichtbau-Roadster · der weisse Wolf", price:337000, unlock:61,
            mass:980,  wheelR:0.29, redline:10200, idle:1100, torque:mkTorque(640,8400,10200,{hold:.97}),
            gears:[3.15,2.06,1.50,1.16,0.94,0.80], final:4.25, shape:"roadster", grip:1.36, zone:220,
            pros:"Skalpell mit Zähnen", cons:"Winzige Schaltzone" },
  titan:  { name:"TITAN 900",  desc:"900-PS-Strassenrakete · offiziell zu viel", price:352000, unlock:64,
            mass:1350, wheelR:0.31, redline:8800, idle:1000, torque:mkTorque(1250,6400,8800,{low:.5}),
            gears:[3.30,2.18,1.60,1.24,0.99,0.82], final:3.65, shape:"supra", grip:1.50, zone:240,
            pros:"Endloser Vortrieb", cons:"Alles will dich töten" },
  reaper: { name:"REAPER GT1", desc:"Prototyp · fährt, wo andere aufhören", price:367000, unlock:67,
            mass:1140, wheelR:0.31, redline:10000, idle:1300, torque:mkTorque(1050,8200,10000,{hold:.96}),
            gears:[2.90,2.02,1.53,1.23,1.01,0.85], final:3.80, shape:"gt1", grip:1.55, zone:210,
            pros:"Rennwagen pur", cons:"Gnadenlos eng" },
  kuro:   { name:"KURO ØNI",   desc:"Vault-Dämon · schwarzer Widebody, violettes Feuer", price:0, unlock:1, vault:true,
            mass:1240, wheelR:0.33, redline:9400, idle:1250, torque:mkTorque(1100,7000,9400,{low:.6}),
            gears:[2.95,1.98,1.42,1.06,0.86], final:3.55, shape:"drag", grip:1.52, zone:220,
            pros:"Einmaliger Look + Sound", cons:"Nur im Vault" },
  zenith: { name:"ZENITH ∞",   desc:"Die absolute Endstufe · mehr geht nicht", price:382000, unlock:70,
            mass:1220, wheelR:0.34, redline:9600, idle:1300, torque:mkTorque(1500,7200,9600,{low:.65}),
            gears:[2.80,1.90,1.36,1.02,0.84], final:3.50, shape:"drag", grip:1.60, zone:200,
            pros:"1500 Nm Unendlichkeit", cons:"Nur für Könige" },
};
const CAR_KEYS = Object.keys(CAR_DEFS);

// ── Karosserie-Formen ────────────────────────────────────────────────────────
// viewBox 480×200, Boden y=176, Achse y=150, Front = rechts.
// ax/span aus ECHTEN Vorbild-Massen (L/WB/Überhänge massstäblich, Rad-Ø 0.65m→58px).
const AXLE_Y = 150, GROUND_Y = 176;
const SHAPES = {
  wedge:   { ax:[139/480, 352/480], span:[60, 432],  draw: wedgeBody },    // 80er Keil (4.18m/WB2.40)
  hatch:   { ax:[124/480, 352/480], span:[62, 424],  draw: hatchBody },    // EG-Hatch (4.07/2.57)
  coupe:   { ax:[130/480, 350/480], span:[44, 441],  draw: coupeBody },    // S13 (4.47/2.47)
  rx7:     { ax:[126/480, 342/480], span:[50, 432],  draw: rx7Body },      // FD (4.30/2.43)
  roadster:{ ax:[145/480, 347/480], span:[68, 419],  draw: roadsterBody }, // NA (3.95/2.27)
  kei:     { ax:[135/480, 345/480], span:[94, 387],  draw: keiBody },      // Kei (3.30/2.36)
  sedan:   { ax:[130/480, 353/480], span:[48, 435],  draw: sedanBody },    // Evo (4.35/2.51)
  gtr:     { ax:[112/480, 349/480], span:[38, 447],  draw: gtrBody },      // R34 (4.60/2.67)
  supra:   { ax:[122/480, 349/480], span:[42, 443],  draw: supraBody },    // MK4 (4.51/2.55)
  muscle:  { ax:[119/480, 363/480], span:[30, 453],  draw: muscleBody },   // 69er (4.76/2.74)
  wagon:   { ax:[120/480, 356/480], span:[36, 450],  draw: wagonBody },    // 850R (4.66/2.66)
  nsx:     { ax:[128/480, 353/480], span:[44, 438],  draw: nsxBody },      // NSX (4.43/2.53)
  v10:     { ax:[124/480, 352/480], span:[48, 430],  draw: v10Body },      // V10-Keil (4.30/2.56)
  gt1:     { ax:[114/480, 354/480], span:[24, 460],  draw: gt1Body },      // GT1 (4.9/2.7)
  drag:    { ax:[119/480, 363/480], span:[8, 453],   draw: dragBody },     // Pro-Street
};

function paint(hue){
  return {
    P:  "url(#bp)",                 // Gloss-Lack
    P2: `hsl(${hue} 75% 24%)`,      // dunkler Solid-Ton (Spoiler/Trim)
    P3: `hsl(${hue} 60% 70%)`,      // heller Solid-Ton
    G:  "url(#gl)", DK: "#0b0e12",
  };
}
function defsSVG(hue){
  return `<defs>
  <linearGradient id="bp" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 55% 80%)"/>
    <stop offset=".16" stop-color="hsl(${hue} 68% 58%)"/>
    <stop offset=".42" stop-color="hsl(${hue} 76% 44%)"/>
    <stop offset=".64" stop-color="hsl(${hue} 80% 33%)"/>
    <stop offset=".86" stop-color="hsl(${hue} 74% 20%)"/>
    <stop offset="1" stop-color="hsl(${hue} 60% 13%)"/>
  </linearGradient>
  <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c6dcec"/>
    <stop offset=".22" stop-color="#5d7488"/>
    <stop offset=".55" stop-color="#1a2530"/>
    <stop offset="1" stop-color="#070b0f"/>
  </linearGradient>
  <linearGradient id="lw" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity=".72"/>
  </linearGradient>
  <linearGradient id="hlg" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#f2f9ff"/><stop offset="1" stop-color="#8fb4d6"/>
  </linearGradient>
  <linearGradient id="tlg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff8a72"/><stop offset="1" stop-color="#b8140c"/>
  </linearGradient>
  <linearGradient id="crm" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f4f8fc"/><stop offset=".5" stop-color="#9ba7b3"/><stop offset="1" stop-color="#565f69"/>
  </linearGradient>
  <radialGradient id="tire">
    <stop offset=".55" stop-color="#23272c"/><stop offset=".78" stop-color="#111418"/><stop offset="1" stop-color="#04060a"/>
  </radialGradient>
  </defs>`;
}

// ── Detail-Bausteine ─────────────────────────────────────────────────────────
function arch(cx){ // Radhaus: dunkler Ausschnitt + Kanten-Lippe + Gloss-Kante
  return `<circle cx="${cx}" cy="${AXLE_Y}" r="31" fill="#04060a"/>
  <path d="M${cx-31} ${AXLE_Y} A31 31 0 0 1 ${cx+31} ${AXLE_Y}" fill="none" stroke="#000" stroke-width="4" opacity=".5"/>
  <path d="M${cx-33} ${AXLE_Y-3} A33 33 0 0 1 ${cx+33} ${AXLE_Y-3}" fill="none" stroke="#fff" stroke-width="1.6" opacity=".12"/>`;
}
function fender(cx, w=30, h=38){ // Kotflügel-Bulge über dem Radhaus
  return `<path d="M${cx-w} ${AXLE_Y-16} Q${cx} ${AXLE_Y-h} ${cx+w} ${AXLE_Y-16}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2.2"/>`;
}
function glassQ(d, x, y, w, h){ // Scheibe: Tönung + Trim + Reflex-Streak
  return `<path d="${d}" fill="url(#gl)" stroke="#05080c" stroke-width="2.4"/>
  <path d="M${x+w*0.20} ${y+h} L${x+w*0.44} ${y+2} L${x+w*0.60} ${y+2} L${x+w*0.34} ${y+h} Z" fill="#e4f2ff" opacity=".15"/>`;
}
function seam(x, y1, y2){
  return `<path d="M${x} ${y1} Q${x+3} ${(y1+y2)/2} ${x} ${y2}" stroke="rgba(0,0,0,.42)" stroke-width="1.5" fill="none"/>`;
}
function handle(x, y){
  return `<rect x="${x}" y="${y}" width="15" height="4" rx="2" fill="rgba(0,0,0,.45)"/>
  <rect x="${x+1}" y="${y}" width="13" height="1.4" rx=".7" fill="rgba(255,255,255,.4)"/>`;
}
function mirror(x, y){
  return `<path d="M${x} ${y} q2 -8 12 -7 l3 8 q-1 4 -6 4 q-8 0 -9 -5z" fill="#11151a"/>
  <path d="M${x+4} ${y-4} l8 1 2 5 -8 1z" fill="#7fa8c8"/>`;
}
function gloss(x1, y1, x2, y2){ // Schulterlinie-Highlight
  return `<path d="M${x1} ${y1} Q${(x1+x2)/2} ${(y1+y2)/2-6} ${x2} ${y2}" stroke="rgba(255,255,255,.30)" stroke-width="2" fill="none"/>`;
}
function headSVG(x, y, w){ // flacher Scheinwerfer (Front rechts)
  return `<path d="M${x} ${y} L${x+w} ${y+3} Q${x+w+5} ${y+5} ${x+w+4} ${y+10} L${x-2} ${y+8} Z" fill="url(#hlg)"/>
  <path d="M${x} ${y} L${x+w} ${y+3} L${x+w} ${y+5} L${x} ${y+2.5} Z" fill="#fff" opacity=".75"/>
  <rect x="${x+w+2}" y="${y+11}" width="7" height="5" rx="2" fill="#ffb36b"/>`;
}
function roundHead(cx, cy){ // runder Scheinwerfer + Chromring (Muscle)
  return `<circle cx="${cx}" cy="${cy}" r="6.5" fill="url(#crm)"/>
  <circle cx="${cx}" cy="${cy}" r="4.6" fill="url(#hlg)"/>
  <circle cx="${cx-1.5}" cy="${cy-1.5}" r="1.6" fill="#fff" opacity=".85"/>`;
}
function popups(x, y, w=26){ // geschlossene Klappscheinwerfer (Fuge)
  return `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="rgba(0,0,0,.42)"/>
  <path d="M${x+1} ${y+1} L${x+w-1} ${y+1}" stroke="rgba(255,255,255,.25)" stroke-width="1.2"/>`;
}
function tailSVG(x, y, w=22){ // Rückleuchten-Band + Blinker
  return `<rect x="${x}" y="${y}" width="${w}" height="10" rx="2" fill="url(#tlg)"/>
  <rect x="${x+1}" y="${y+1.5}" width="${w-2}" height="2" rx="1" fill="#ffd9cf" opacity=".85"/>
  <rect x="${x+w-7}" y="${y}" width="7" height="10" rx="2" fill="#ffb36b"/>`;
}
function roundTails(x, y){ // GTR-Style: 2 runde Leuchten
  return `<circle cx="${x}" cy="${y}" r="5" fill="url(#tlg)"/><circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#1a0505" stroke-width="1.6"/>
  <circle cx="${x+13}" cy="${y}" r="5" fill="url(#tlg)"/><circle cx="${x+13}" cy="${y}" r="5" fill="none" stroke="#1a0505" stroke-width="1.6"/>
  <circle cx="${x-1.4}" cy="${y-1.4}" r="1.4" fill="#ffd9cf"/><circle cx="${x+11.6}" cy="${y-1.4}" r="1.4" fill="#ffd9cf"/>`;
}
function intake(x, y, w, h){ // dunkler Lufteinlass
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2.6}" fill="#05070a"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h/3}" rx="${h/6}" fill="#1b2128"/>`;
}
function rocker(x1, x2, yb){ // dunkler Schweller-Verlauf
  return `<path d="M${x1} ${yb} L${x2} ${yb} L${x2-6} ${yb-13} Q${(x1+x2)/2} ${yb-7} ${x1+6} ${yb-12} Z" fill="url(#lw)"/>`;
}
function scoop(x, y, w, h){ // Hauben-Hutze
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#0d1014"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h*0.32}" rx="2" fill="#272d36"/>`;
}
function exhaustSVG(ex, drop, bx){ // bx = linke Kante Heckstossfänger
  const y = GROUND_Y - 15 + Math.min(drop*0.3, 6);
  const tip = (x,yy,w,h)=>`<rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="${h/2}" fill="url(#crm)"/>
    <ellipse cx="${x+3}" cy="${yy+h/2}" rx="2.6" ry="${h/2-1}" fill="#05070a"/>`;
  return [ tip(bx-14,y,20,7), tip(bx-18,y-5,24,7)+tip(bx-18,y+4,24,7), tip(bx-24,y-4,34,13) ][ex];
}
function spoilerSVG(sp, x, topY, c){
  if (!sp) return "";
  if (sp === 1) return `<path d="M${x} ${topY} l40 -5 5 9 -43 5z" fill="${c.P2}"/>
    <path d="M${x} ${topY} l40 -5 1.5 3 -40 5z" fill="#fff" opacity=".22"/>`;
  return `<g>
    <rect x="${x+4}" y="${topY-19}" width="5" height="21" rx="2" fill="#171b20"/>
    <rect x="${x+44}" y="${topY-19}" width="5" height="21" rx="2" fill="#171b20"/>
    <path d="M${x-14} ${topY-22} L${x+58} ${topY-27} L${x+66} ${topY-17} L${x-10} ${topY-12} Z" fill="#101317"/>
    <path d="M${x-14} ${topY-22} L${x+58} ${topY-27} L${x+59} ${topY-24} L${x-13} ${topY-19} Z" fill="#fff" opacity=".2"/>
    <rect x="${x-17}" y="${topY-25}" width="6" height="15" rx="2" fill="#0b0e12"/>
  </g>`;
}
function dY(drop){ return ((drop-6)*0.5).toFixed(1); } // Tieferlegung

// ── 15 Karosserien nach Vorbild ─────────────────────────────────────────────
// WEDGE — 80er Keilcoupé: Klappscheinwerfer, kantig, Lichtband, Plastik-Trim
function wedgeBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 64)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp, 66, 101, c)}
  <path d="M64 142 L60 130 L60 114 L66 108 L112 103 L126 101 L156 64 L238 60 L252 60 L286 92
    L308 96 L424 104 L428 106 L430 114 L428 130 L420 142 Z" fill="${c.P}"/>
  ${glassQ("M162 68 L236 63 L236 90 L140 92 Z",140,63,96,28)}
  ${glassQ("M244 63 L250 64 L278 90 L244 90 Z",244,63,34,27)}
  <path d="M156 66 L238 61.5 L252 61.5" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  ${seam(240, 92, 138)}${seam(294, 94, 138)}${handle(256, 100)}${mirror(282, 86)}
  ${gloss(66, 105, 424, 108)}
  <rect x="66" y="131" width="352" height="8" rx="2" fill="rgba(0,0,0,.45)"/>
  <rect x="66" y="130" width="352" height="1.6" fill="rgba(255,255,255,.18)"/>
  ${popups(392, 100.5)}
  <rect x="60" y="112" width="30" height="10" rx="2" fill="url(#tlg)"/>
  <rect x="61" y="113.5" width="28" height="2" rx="1" fill="#ffd9cf" opacity=".85"/>
  ${intake(400, 122, 26, 6)}
  ${rocker(64, 426, 142)}
  </g>${arch(139)}${arch(352)}`;
}
// HATCH — EG-Hatch: kurz, rund, One-Motion-Linie, steile Heckklappe
function hatchBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 66)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp, 86, 56, c)}
  <path d="M68 142 L64 132 Q60 118 66 110 L74 66 Q78 56 94 54 L218 52 Q246 54 268 74
    Q276 84 288 91 Q302 95 324 96 L392 100 Q416 102 422 110 L424 120 Q424 134 414 140 L412 142 Z" fill="${c.P}"/>
  ${glassQ("M80 92 L84 62 Q86 57 98 57 L146 57 L146 92 Z",80,57,66,35)}
  ${glassQ("M154 57 L214 56 Q236 58 254 76 Q261 84 270 90 L154 92 Z",154,56,116,36)}
  <path d="M78 62 Q82 55 96 54.5 L216 53" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  ${seam(150, 94, 139)}${seam(278, 92, 138)}${handle(188, 100)}${mirror(264, 82)}
  ${gloss(70, 104, 418, 108)}
  ${headSVG(394, 97, 22)}
  <ellipse cx="70" cy="106" rx="6" ry="5" fill="url(#tlg)"/>
  <ellipse cx="82" cy="105" rx="5" ry="4.2" fill="#ffb36b"/>
  ${intake(388, 124, 30, 7)}
  ${rocker(68, 420, 142)}
  </g>${arch(124)}${arch(352)}`;
}
// COUPE — S13: lang, flach, messerscharfe Schulterlinie, flacher Kofferraum
function coupeBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 48)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp, 58, 104, c)}
  <path d="M48 142 L44 130 Q42 116 50 110 L58 107 Q80 102 106 100 Q118 74 148 66 Q166 61 196 60
    L232 60 Q250 61 264 72 Q276 84 292 92 Q312 96 338 98 L414 102 Q438 104 444 111 L446 122
    Q446 134 438 140 L434 142 Z" fill="${c.P}"/>
  ${glassQ("M128 90 Q140 70 166 63 L200 61 L202 90 Z",128,61,74,29)}
  ${glassQ("M210 61 L230 61 Q246 62 258 72 Q268 82 280 90 L210 90 Z",210,61,70,29)}
  <path d="M110 98 Q122 74 150 66.5 L230 61.5" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  <path d="M56 104 L436 108" stroke="rgba(255,255,255,.22)" stroke-width="1.6"/>
  ${seam(206, 92, 139)}${seam(300, 93, 138)}${handle(238, 100)}${mirror(276, 84)}
  <rect x="418" y="100.5" width="26" height="5" rx="2" fill="url(#hlg)"/>
  ${tailSVG(46, 108, 24)}
  ${intake(396, 124, 42, 8)}<rect x="416" y="114" width="28" height="4" rx="2" fill="#05070a"/>
  ${rocker(48, 442, 142)}
  </g>${arch(130)}${arch(350)}`;
}
// RX7 — FD: alles Kurven, Kotflügel-Bulges, Klappscheinwerfer, runde Leuchten
function rx7Body(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 54)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp, 62, 101, c)}
  <path d="M56 142 L52 132 Q48 120 56 112 Q60 107 76 105 Q98 100 116 98 Q128 78 156 66 Q184 57 210 57
    Q242 59 264 75 Q280 87 296 92 Q318 96 340 98 Q380 99 404 101 Q432 103 438 112 Q440 118 438 124
    Q436 136 426 141 L422 142 Z" fill="${c.P}"/>
  ${glassQ("M138 90 Q150 70 178 61 L206 60 L208 90 Z",138,60,70,30)}
  ${glassQ("M216 60 Q244 62 258 74 Q268 83 278 90 L216 90 Z",216,60,62,30)}
  <path d="M122 96 Q132 76 158 65 Q186 58 210 58" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  ${fender(126, 32, 40)}${fender(342, 32, 40)}
  ${seam(210, 92, 138)}${seam(296, 94, 137)}${handle(240, 100)}${mirror(278, 86)}
  ${gloss(60, 106, 430, 110)}
  ${popups(384, 99)}
  <ellipse cx="60" cy="111" rx="7" ry="5.5" fill="url(#tlg)"/>
  <ellipse cx="76" cy="110" rx="7" ry="5.5" fill="url(#tlg)"/>
  ${intake(398, 122, 34, 8)}
  ${rocker(56, 434, 142)}
  </g>${arch(126)}${arch(342)}`;
}
// ROADSTER — NA: winzig, rund, Klappscheinwerfer, Cockpit + Bügel
function roadsterBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 72)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp, 88, 103, c)}
  <path d="M74 142 L70 132 Q66 120 74 113 Q86 107 112 105 L162 102 Q178 98 200 98 L246 98
    Q256 98 266 96 L286 74 Q289 71 295 72 L298 92 Q318 94 340 96 L382 100 Q408 102 414 110
    L416 120 Q416 134 406 140 L402 142 Z" fill="${c.P}"/>
  <path d="M170 101 Q198 92 244 95 L262 96 Q240 106 200 106 Q182 105 170 101 Z" fill="#05080c"/>
  <path d="M196 97 A15 13 0 0 1 226 97" fill="none" stroke="#171b20" stroke-width="4.5"/>
  ${glassQ("M268 94 L285 74 Q288 72 292 73 L295 92 Z",266,73,30,20)}
  ${seam(300, 94, 138)}${handle(314, 102)}${mirror(290, 78)}
  ${gloss(80, 106, 410, 109)}
  ${popups(352, 98, 22)}
  <ellipse cx="78" cy="112" rx="6.5" ry="5" fill="url(#tlg)"/>
  <ellipse cx="91" cy="111" rx="4.5" ry="3.8" fill="#ffb36b"/>
  ${intake(384, 122, 28, 7)}
  ${rocker(74, 412, 142)}
  </g>${arch(145)}${arch(347)}`;
}
// KEI — Turbo-Box: winzig, hoch, Räder an den Ecken, Mini-Hutze
function keiBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 98)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp, 108, 48, c)}
  <path d="M100 142 L96 132 Q92 120 98 112 L100 60 Q100 50 114 48 L296 48 Q310 49 316 60
    Q322 72 330 86 Q336 90 348 93 L356 96 Q364 100 364 110 L362 132 Q360 140 350 142 Z" fill="${c.P}"/>
  ${glassQ("M106 90 L106 58 Q106 53 118 53 L186 53 L186 90 Z",106,53,80,37)}
  ${glassQ("M194 53 L292 53 Q303 54 308 62 Q314 74 322 88 L194 90 Z",194,53,128,37)}
  <path d="M104 58 Q106 50 118 50 L294 50" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  ${seam(190, 92, 138)}${seam(328, 90, 137)}${handle(238, 98)}${mirror(318, 78)}
  ${gloss(102, 102, 358, 105)}
  ${scoop(318, 88, 20, 6)}
  ${headSVG(336, 92, 16)}${tailSVG(100, 96, 16)}
  ${intake(334, 122, 24, 6)}
  ${rocker(98, 360, 142)}
  </g>${arch(135)}${arch(345)}`;
}
// SEDAN — Rallye-Limo: kastig, fette Backen, Hutze + Hauben-Vents
function sedanBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 52)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp, 58, 96, c)}
  <path d="M52 142 L48 130 Q46 114 56 108 Q70 100 94 97 Q104 68 132 60 Q148 55 178 54 L258 54
    Q276 55 290 68 Q302 82 316 91 Q334 95 356 97 L404 100 Q434 102 442 110 L444 122 L442 134
    Q440 141 430 142 Z" fill="${c.P}"/>
  ${glassQ("M114 88 Q124 68 146 61 L170 59 L170 88 Z",114,59,56,29)}
  ${glassQ("M178 59 L224 59 L224 88 L178 88 Z",178,59,46,29)}
  ${glassQ("M232 59 L256 59 Q270 60 282 72 Q289 80 296 87 L232 88 Z",232,59,64,29)}
  <path d="M118 86 Q128 66 148 60 L256 56" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  ${fender(130, 34, 40)}${fender(353, 34, 40)}
  ${seam(174, 90, 139)}${seam(228, 90, 139)}${seam(304, 90, 138)}
  ${handle(194, 96)}${handle(250, 96)}${mirror(292, 82)}
  ${gloss(58, 102, 438, 108)}
  ${scoop(350, 90, 32, 9)}
  <rect x="392" y="95" width="14" height="3" rx="1.5" fill="#0d1014"/>
  ${headSVG(410, 98, 26)}${tailSVG(50, 106, 24)}
  ${intake(396, 124, 44, 9)}<rect x="416" y="113" width="26" height="4" rx="2" fill="#05070a"/>
  ${rocker(52, 440, 142)}
  </g>${arch(130)}${arch(353)}`;
}
// GTR — R34: kastig-muskulös, fette Haunches, 4 runde Rückleuchten
function gtrBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 42)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp===0?1:sp, 50, 103, c)}
  <path d="M42 142 L38 130 Q36 114 46 108 L54 106 Q76 100 100 98 Q112 72 142 63 Q158 58 188 57
    L240 57 Q258 58 272 70 Q284 82 298 90 Q318 95 344 97 L410 100 Q438 102 444 110 L446 124
    L444 136 Q442 142 432 142 Z" fill="${c.P}"/>
  ${glassQ("M124 88 Q136 68 160 61 L196 59 L198 88 Z",124,59,74,29)}
  ${glassQ("M206 59 L238 59 Q254 60 266 71 Q275 80 284 88 L206 88 Z",206,59,78,29)}
  <path d="M104 96 Q116 72 144 64 L238 58.5" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  ${fender(112, 36, 42)}${fender(349, 36, 42)}
  <path d="M46 103 L438 107" stroke="rgba(255,255,255,.2)" stroke-width="1.6"/>
  ${seam(202, 90, 139)}${seam(308, 92, 138)}${handle(232, 98)}${mirror(280, 82)}
  ${roundTails(51, 112)}
  ${headSVG(412, 98, 26)}
  ${intake(394, 124, 48, 9)}<rect x="414" y="112" width="30" height="5" rx="2" fill="#05070a"/>
  <rect x="46" y="130" width="392" height="7" rx="2" fill="rgba(0,0,0,.4)"/>
  ${rocker(42, 442, 142)}
  </g>${arch(112)}${arch(349)}`;
}
// SUPRA — MK4: rund gelutscht, hängende Nase, fette Hüfte
function supraBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 46)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp, 54, 103, c)}
  <path d="M48 142 L44 132 Q40 120 48 112 Q54 107 70 106 Q94 100 116 99 Q128 76 158 67 Q180 61 210 61
    L240 61 Q260 62 276 74 Q288 86 302 92 Q322 96 346 98 Q390 100 412 102 Q436 104 440 112
    Q442 118 440 124 Q438 137 428 141 L424 142 Z" fill="${c.P}"/>
  ${glassQ("M138 90 Q150 72 176 65 L208 63 L210 90 Z",138,63,72,27)}
  ${glassQ("M218 63 L238 63 Q256 64 270 76 Q279 84 288 90 L218 90 Z",218,63,70,27)}
  <path d="M120 97 Q132 76 160 68 Q182 62 210 62" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  ${fender(122, 34, 40)}${fender(349, 32, 38)}
  ${seam(214, 92, 139)}${seam(304, 94, 138)}${handle(246, 100)}${mirror(292, 84)}
  ${gloss(54, 106, 430, 110)}
  <ellipse cx="54" cy="111" rx="7" ry="5.5" fill="url(#tlg)"/>
  <ellipse cx="70" cy="110" rx="7" ry="5.5" fill="url(#tlg)"/>
  <path d="M406 100.5 Q426 101.5 436 105 L436 110 L404 106 Z" fill="url(#hlg)"/>
  ${intake(396, 124, 40, 9)}
  ${rocker(48, 436, 142)}
  </g>${arch(122)}${arch(349)}`;
}
// MUSCLE — 69er Fastback: Monsterhaube, Kamm-Heck, Chrom, Side-Scoop
function muscleBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 34)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp, 42, 102, c)}
  <path d="M34 142 L30 130 Q28 114 38 108 L46 106 Q60 100 82 98 Q92 72 120 63 Q136 58 162 57
    L204 57 Q222 58 238 70 Q252 82 268 90 Q282 94 300 96 L424 104 Q446 106 450 114 L452 126
    L450 136 Q448 142 438 142 Z" fill="${c.P}"/>
  ${glassQ("M104 88 Q114 68 138 61 L174 59 L176 88 Z",104,59,72,29)}
  ${glassQ("M184 59 L202 58 Q218 59 232 71 Q241 80 250 88 L184 88 Z",184,58,66,30)}
  <path d="M108 86 Q118 66 140 60 L202 58" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  <path d="M158 108 L178 106 L178 124 L160 122 Z" fill="#05070a"/>
  <path d="M158 108 L178 106 L178 110 L158 112 Z" fill="#232a32"/>
  ${seam(180, 90, 140)}${seam(258, 92, 139)}${handle(206, 98)}${mirror(246, 82)}
  ${gloss(40, 102, 444, 112)}
  ${scoop(330, 94, 36, 10)}
  ${roundHead(440, 116)}
  <rect x="404" y="132" width="48" height="5" rx="2.5" fill="url(#crm)"/>
  <rect x="30" y="132" width="36" height="5" rx="2.5" fill="url(#crm)"/>
  <rect x="32" y="108" width="5" height="9" rx="1" fill="url(#tlg)"/>
  <rect x="39" y="108" width="5" height="9" rx="1" fill="url(#tlg)"/>
  <rect x="46" y="108" width="5" height="9" rx="1" fill="url(#tlg)"/>
  ${intake(400, 124, 34, 7)}
  ${rocker(34, 448, 142)}
  </g>${arch(119)}${arch(363)}`;
}
// WAGON — 850R-Box: kerzengerade Linien, senkrechtes Heck, Hochkant-Leuchte
function wagonBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 42)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp===2?1:sp, 52, 49, c)}
  <path d="M42 142 L38 132 L36 118 Q36 110 44 108 L48 62 Q50 52 64 51 L262 51 Q278 52 290 66
    Q300 80 314 90 Q332 94 354 96 L410 100 Q440 102 446 110 L448 122 L446 134 Q444 141 434 142 Z" fill="${c.P}"/>
  <rect x="64" y="47" width="192" height="3" rx="1.5" fill="#22272e"/>
  ${glassQ("M54 90 L58 60 Q60 56 70 56 L120 56 L120 90 Z",54,56,66,34)}
  ${glassQ("M128 56 L192 56 L192 90 L128 90 Z",128,56,64,34)}
  ${glassQ("M200 56 L258 56 Q270 57 280 69 Q288 79 298 88 L200 90 Z",200,56,98,34)}
  <path d="M52 60 Q54 54 66 53 L260 53" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  ${seam(124, 92, 139)}${seam(196, 92, 139)}${seam(306, 91, 138)}
  ${handle(150, 97)}${handle(220, 97)}${mirror(294, 82)}
  ${gloss(48, 102, 442, 108)}
  <rect x="38" y="106" width="7" height="28" rx="2" fill="url(#tlg)"/>
  ${headSVG(412, 98, 26)}
  ${intake(400, 124, 40, 8)}<rect x="418" y="113" width="24" height="4" rx="2" fill="#05070a"/>
  ${rocker(42, 444, 142)}
  </g>${arch(120)}${arch(356)}`;
}
// NSX — Mittelmotor: superflach, schwarzes Kanzeldach, Buttress-Heck, Lichtband
function nsxBody(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 48)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp===0?0:1, 52, 102, c)}
  <path d="M48 140 L44 130 Q42 118 50 112 Q60 106 84 104 L120 101 Q142 98 152 96 Q160 78 184 74
    Q200 70 222 70 L242 70 Q258 71 270 79 Q280 86 292 91 Q310 94 334 95 L408 98 Q436 100 442 108
    L444 118 Q444 130 436 136 L432 140 Z" fill="${c.P}"/>
  <path d="M152 96 Q160 78 184 74 Q200 70 222 70 L242 70 Q258 71 270 79 Q276 84 282 88
    L276 88 Q266 80 252 76 Q236 72 220 72 Q198 72 184 76 Q166 80 158 96 Z" fill="#0c0e12"/>
  ${glassQ("M160 92 Q168 79 188 75 L208 73 L210 92 Z",160,73,50,19)}
  ${glassQ("M218 73 L240 73 Q254 74 264 82 L272 90 L218 92 Z",218,73,54,19)}
  <path d="M120 101 Q142 97 154 95" stroke="rgba(0,0,0,.4)" stroke-width="1.6" fill="none"/>
  ${seam(214, 94, 136)}${seam(284, 93, 136)}${handle(240, 99)}${mirror(276, 84)}
  ${gloss(52, 106, 436, 106)}
  <rect x="46" y="106" width="30" height="4" rx="2" fill="url(#tlg)"/>
  <path d="M108 100 L142 95 L142 106 L110 108 Z" fill="#05080c"/>
  <path d="M426 100 L444 103 L444 109 L426 105 Z" fill="url(#hlg)"/>
  ${intake(396, 122, 42, 8)}
  ${rocker(48, 440, 140)}
  </g>${arch(128)}${arch(353)}`;
}
// V10 — Keil: messerscharfe Kanten, Motordeck mit Lamellen, Riesen-Einlass
function v10Body(c, drop, ex, sp){
  return `${exhaustSVG(ex, drop, 52)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(sp===0?0:sp, 58, 102, c)}
  <path d="M52 138 L48 128 L48 116 L56 110 L100 104 L144 100 L166 78 L206 72 L240 72 L286 92
    L318 95 L408 99 L436 102 L444 110 L446 118 L442 128 L436 134 L432 136 Z" fill="${c.P}"/>
  ${glassQ("M172 80 L204 75 L206 92 L164 92 Z",164,75,42,17)}
  ${glassQ("M212 75 L238 74 L276 90 L212 92 Z",212,74,64,18)}
  <path d="M166 79 L206 73.5 L240 73.5" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  <path d="M104 103 L136 100 M106 107 L138 104 M108 111 L140 108" stroke="#05070a" stroke-width="2.4"/>
  <path d="M148 100 L180 94 L180 122 L152 118 Z" fill="#05070a"/>
  <path d="M148 100 L180 94 L180 98 L148 104 Z" fill="#232a32"/>
  ${seam(286, 93, 134)}${handle(242, 99)}${mirror(282, 86)}
  ${gloss(56, 104, 436, 106)}
  <path d="M52 112 L70 110 L70 118 L52 119 Z" fill="url(#tlg)"/>
  <path d="M424 101 L444 104 L442 111 L422 107 Z" fill="url(#hlg)"/>
  ${intake(398, 120, 42, 9)}
  ${rocker(52, 438, 137)}
  </g>${arch(124)}${arch(352)}`;
}
// GT1 — Le-Mans-Renner: ultraflach, Splitter, Riesen-Wing, Startnummer
function gt1Body(c, drop, ex, sp){
  return `${exhaustSVG(2, drop, 34)}<g transform="translate(0 ${dY(drop)})">
  <g>
    <rect x="34" y="76" width="5" height="26" rx="2" fill="#171b20"/>
    <rect x="66" y="76" width="5" height="26" rx="2" fill="#171b20"/>
    <path d="M18 72 L88 68 L96 78 L22 82 Z" fill="#101317"/>
    <path d="M18 72 L88 68 L89 71 L19 75 Z" fill="#fff" opacity=".2"/>
    <rect x="15" y="70" width="6" height="16" rx="2" fill="#0b0e12"/>
  </g>
  <path d="M28 134 L24 126 L24 114 L34 108 L120 102 Q150 98 170 96 Q178 82 200 78 Q214 75 232 75
    L252 75 Q268 76 278 84 Q286 90 296 93 Q320 96 350 97 L430 100 Q452 102 456 108 L458 116
    Q458 126 450 130 L444 132 Z" fill="${c.P}"/>
  ${glassQ("M178 92 Q184 82 202 79 L222 77 L224 92 Z",178,77,46,15)}
  ${glassQ("M232 77 L250 77 Q262 78 270 85 L276 91 L232 92 Z",232,77,44,15)}
  <circle cx="240" cy="112" r="15" fill="#f2f5f9" opacity=".92"/>
  <text x="240" y="118" text-anchor="middle" font-family="system-ui" font-weight="900" font-size="17" fill="#14171c">1</text>
  ${seam(288, 94, 130)}${mirror(280, 88)}
  ${gloss(30, 104, 450, 105)}
  <path d="M430 128 L462 132 L462 138 L426 134 Z" fill="#0b0e12"/>
  <path d="M24 126 L14 132 L14 136 L24 132 Z" fill="#0b0e12"/>
  <rect x="26" y="108" width="22" height="4" rx="2" fill="url(#tlg)"/>
  <path d="M432 101 L454 104 L452 110 L430 106 Z" fill="url(#hlg)"/>
  ${intake(400, 118, 44, 8)}
  ${rocker(30, 452, 133)}
  </g>${arch(114)}${arch(354)}`;
}
// DRAG — Pro-Street: Blower durch die Haube, Wheelie-Bar, Chute, Decal
function dragBody(c, drop, ex, sp){
  return `${exhaustSVG(2, drop, 34)}<g transform="translate(0 ${dY(drop)})">
  ${spoilerSVG(2, 42, 100, c)}
  <path d="M10 168 L34 130 M10 172 L44 140" stroke="#3a3f47" stroke-width="3"/>
  <circle cx="11" cy="171" r="5" fill="#14171c"/><circle cx="11" cy="171" r="2" fill="#3f454e"/>
  <path d="M34 142 L30 130 Q28 114 38 108 L46 106 Q60 100 82 98 Q92 72 120 63 Q136 58 162 57
    L204 57 Q222 58 238 70 Q252 82 268 90 Q282 94 300 96 L424 104 Q446 106 450 114 L452 126
    L450 136 Q448 142 438 142 Z" fill="${c.P}"/>
  ${glassQ("M104 88 Q114 68 138 61 L174 59 L176 88 Z",104,59,72,29)}
  ${glassQ("M184 59 L202 58 Q218 59 232 71 Q241 80 250 88 L184 88 Z",184,58,66,30)}
  <path d="M108 86 Q118 66 140 60 L202 58" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.8"/>
  ${seam(180, 90, 140)}${seam(258, 92, 139)}${handle(206, 98)}${mirror(246, 82)}
  ${gloss(40, 102, 444, 112)}
  <rect x="322" y="76" width="42" height="24" rx="4" fill="#0d1014"/>
  <rect x="322" y="76" width="42" height="7" rx="3" fill="#272d36"/>
  <rect x="330" y="68" width="26" height="10" rx="3" fill="#1a1f26"/>
  <rect x="318" y="98" width="50" height="4" rx="2" fill="rgba(0,0,0,.5)"/>
  <rect x="30" y="104" width="12" height="14" rx="3" fill="#171b20"/>
  <rect x="31" y="106" width="10" height="3" rx="1.5" fill="#c73a3a"/>
  ${roundHead(440, 116)}
  <rect x="404" y="132" width="48" height="5" rx="2.5" fill="url(#crm)"/>
  ${tailSVG(44, 108, 20)}
  ${intake(400, 124, 34, 7)}
  ${rocker(34, 448, 142)}
  </g>${arch(119)}${arch(363)}`;
}

// Bodykit (Street/Widebody) — SVG-Version für gezeichnete Autos
function kitSVG(defKey, st){
  const kit = st.kit ?? 0; if (!kit) return "";
  const sh = SHAPES[CAR_DEFS[defKey].shape];
  const x2 = sh.span[1], axs = sh.ax.map(f=>f*480);
  const dy = ((st.drop ?? 6) - 6) * 0.5;
  const yb = 142 + dy;
  let s = `<g>
    <path d="M${x2-52} ${yb} L${x2+8} ${yb-3} L${x2+12} ${yb+5} L${x2-50} ${yb+7} Z" fill="#0c0f13"/>
    <rect x="${x2-50}" y="${yb-1}" width="56" height="1.6" fill="rgba(255,255,255,.16)"/>
    <rect x="${axs[0]+40}" y="${yb+1}" width="${Math.max(20, axs[1]-axs[0]-80)}" height="6" rx="3" fill="#0c0f13"/>`;
  if (kit >= 2){
    for (const cx of axs){
      s += `<path d="M${cx-33} ${AXLE_Y-2} A33 33 0 0 1 ${cx+33} ${AXLE_Y-2}" fill="none" stroke="#101317" stroke-width="8" stroke-linecap="round"/>
        <path d="M${cx-36} ${AXLE_Y-4} A36 36 0 0 1 ${cx+36} ${AXLE_Y-4}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="2"/>`;
    }
  }
  return s + `</g>`;
}
// Karosserie (ohne Räder) als SVG-String
function bodySVG(defKey, st){
  const d = CAR_DEFS[defKey];
  const c = paint(st.hue ?? 0);
  const sh = SHAPES[d.shape];
  const mid = (sh.span[0]+sh.span[1])/2, rx = (sh.span[1]-sh.span[0])/2 + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 200">
    ${defsSVG(st.hue ?? 0)}
    <ellipse cx="${mid}" cy="${GROUND_Y+8}" rx="${rx}" ry="10" fill="#000" opacity=".42"/>
    <ellipse cx="${mid}" cy="${GROUND_Y+7}" rx="${rx*0.7}" ry="7" fill="#000" opacity=".3"/>
    ${sh.draw(c, st.drop ?? 6, st.exhaust ?? 0, st.spoiler ?? 0)}
    ${kitSVG(defKey, st)}
  </svg>`;
}
// Komplett-Auto (mit statischen Rädern) — für Menü/Garage-Previews
function fullSVG(defKey, st){
  const d = CAR_DEFS[defKey];
  const sh = SHAPES[d.shape];
  const rim = st.rim ?? 0;
  const wheelG = cx => `
    <circle cx="${cx}" cy="${AXLE_Y}" r="28.5" fill="url(#tire)"/>
    <circle cx="${cx}" cy="${AXLE_Y}" r="28.5" fill="none" stroke="#000" stroke-width="1.4" opacity=".6"/>
    <circle cx="${cx}" cy="${AXLE_Y}" r="23" fill="none" stroke="#2b3036" stroke-width="1" opacity=".7"/>
    ${rimSVG(cx, AXLE_Y, rim)}`;
  return bodySVG(defKey, st).replace("</svg>",
    wheelG(480*sh.ax[0]) + wheelG(480*sh.ax[1]) + "</svg>");
}
function rimSVG(cx, cy, rim){
  if (rim === 1) // Gold-Mesh
    return `<circle cx="${cx}" cy="${cy}" r="17" fill="#171105"/>
    <circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="#e2bc60" stroke-width="2.4"/>
    ${[0,15,30,45,60,75,90,105,120,135,150,165].map(a=>`<rect x="${cx-1.1}" y="${cy-16}" width="2.2" height="32" rx="1.1" fill="#d6b25e" transform="rotate(${a} ${cx} ${cy})"/>`).join("")}
    <circle cx="${cx}" cy="${cy}" r="4.5" fill="#f4e3b2"/><circle cx="${cx}" cy="${cy}" r="4.5" fill="none" stroke="#8a6c2c" stroke-width="1"/>`;
  if (rim === 2) // Chrom Deep-Dish
    return `<circle cx="${cx}" cy="${cy}" r="17" fill="#0c0f13"/>
    <circle cx="${cx}" cy="${cy}" r="15.5" fill="none" stroke="url(#crm)" stroke-width="4.5"/>
    ${[0,72,144,216,288].map(a=>`<path d="M${cx-3} ${cy} L${cx-1.2} ${cy-12} L${cx+1.2} ${cy-12} L${cx+3} ${cy} Z" fill="url(#crm)" transform="rotate(${a} ${cx} ${cy})"/>`).join("")}
    <circle cx="${cx}" cy="${cy}" r="4" fill="#e8ecf1"/><circle cx="${cx}" cy="${cy}" r="1.6" fill="#5c646d"/>`;
  if (rim === 3) // Racing Weiss (Rallye-Style)
    return `<circle cx="${cx}" cy="${cy}" r="17" fill="#e8e4dc"/>
    <circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="#b8b2a6" stroke-width="1.6"/>
    ${[0,45,90,135,180,225,270,315].map(a=>`<rect x="${cx-2.4}" y="${cy-15}" width="4.8" height="13" rx="2" fill="#f6f3ec" stroke="#b8b2a6" stroke-width=".8" transform="rotate(${a} ${cx} ${cy})"/>`).join("")}
    <circle cx="${cx}" cy="${cy}" r="4.5" fill="#c73a3a"/>`;
  // Sport 5-Speiche poliert
  return `<circle cx="${cx}" cy="${cy}" r="17" fill="#101318"/>
  <circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="url(#crm)" stroke-width="2"/>
  ${[0,72,144,216,288].map(a=>`<path d="M${cx-3.2} ${cy+2} L${cx-2} ${cy-15} L${cx+2} ${cy-15} L${cx+3.2} ${cy+2} Z" fill="url(#crm)" transform="rotate(${a} ${cx} ${cy})"/>`).join("")}
  <circle cx="${cx}" cy="${cy}" r="4.5" fill="#e8ecf1"/><circle cx="${cx}" cy="${cy}" r="1.8" fill="#697079"/>`;
}

// ── Foto-Sprites (AI-generiert): ersetzen SVG, wenn Meta vorhanden ─────────
const spriteImgCache = {};
function loadSprite(m){
  if (!m) return Promise.resolve(null);
  if (!spriteImgCache[m.src]){
    spriteImgCache[m.src] = new Promise(res=>{
      const im = new Image();
      im.onload = ()=>res(im); im.onerror = ()=>res(null);
      im.src = m.src;
    });
  }
  return spriteImgCache[m.src];
}
// Alpha-Vermessung: echte Heckkante, Deck-Anker (Spoiler) und Heck-Unterkante
// (Auspuff) aus der Sprite-Kontur. Die meta-sx/sy stammten aus verschiedenen
// Pipeline-Generationen und passten nicht mehr — die Kontur lügt nicht.
// Zählt nur vertikale Läufe ≥4px mit Alpha>128 (filtert Antennen/Freistell-Reste).
const spriteMeasureCache = {};
function measureSprite(im, m){
  if (m.src in spriteMeasureCache) return spriteMeasureCache[m.src];
  const cv = document.createElement("canvas");
  cv.width = m.w; cv.height = m.h;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.drawImage(im, 0, 0, m.w, m.h);
  const d = c.getImageData(0, 0, m.w, m.h).data;
  const top = new Array(m.w).fill(-1), bot = new Array(m.w).fill(-1);
  for (let x = 0; x < m.w; x++){
    let run = 0;
    for (let y = 0; y < m.h; y++){
      if (d[(y*m.w + x)*4 + 3] > 128){
        if (++run >= 4){ if (top[x] < 0) top[x] = y - 3; bot[x] = y; }
      } else run = 0;
    }
  }
  let x0 = -1, x1 = -1;
  for (let x = 0; x < m.w; x++) if (top[x] >= 0){ if (x0 < 0) x0 = x; x1 = x; }
  if (x0 < 0) return spriteMeasureCache[m.src] = null;
  const w = x1 - x0;
  const med = a => { const s = a.filter(v => v >= 0).sort((p,q) => p-q); return s.length ? s[s.length>>1] : -1; };
  const deckY   = med(top.slice(Math.round(x0 + w*0.05), Math.round(x0 + w*0.14)));
  const rearBot = med(bot.slice(Math.round(x0 + w*0.01), Math.round(x0 + w*0.10)));
  // Räder aus den dunklen Reifen-Pixeln nachdetektieren (meta = Startschätzung).
  // Ergebnis eng an den Prior geklammert — Detektion korrigiert, halluziniert nicht.
  const detectWheel = (cx0, cy0, r0) => {
    let cx = cx0, cy = cy0;
    for (let it = 0; it < 2; it++){
      const R = r0 * 1.25;
      let sx = 0, sy = 0, n = 0;
      const ya = Math.max(0, Math.round(cy - R)), yb = Math.min(m.h - 1, Math.round(cy + R));
      const xa = Math.max(0, Math.round(cx - R)), xb = Math.min(m.w - 1, Math.round(cx + R));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++){
        const i = (y*m.w + x)*4;
        if (d[i+3] > 140 && d[i] < 90 && d[i+1] < 90 && d[i+2] < 90 &&
            Math.hypot(x - cx, y - cy) <= R){ sx += x; sy += y; n++; }
      }
      if (n < 60) return { x: cx0, y: cy0, r: r0 };
      cx = sx/n; cy = sy/n;
    }
    cx = Math.max(cx0 - r0*0.2, Math.min(cx0 + r0*0.2, cx));
    cy = Math.max(cy0 - r0*0.2, Math.min(cy0 + r0*0.2, cy));
    // Radius = Reifen-UNTERKANTE aus der Alpha-Kontur direkt unter der Radmitte.
    // (Dunkel-Pixel-Perzentile fressen sich in Schweller/Unterboden-Schatten und
    // blähen den Radius auf — die Kontur unterm Rad ist dagegen sauber.)
    const win = Math.max(6, Math.round(r0*0.3));
    const bots = [];
    for (let x = Math.max(0, Math.round(cx - win)); x <= Math.min(m.w - 1, Math.round(cx + win)); x++)
      if (bot[x] >= 0) bots.push(bot[x]);
    bots.sort((a,b) => a-b);
    const r = bots.length ? bots[bots.length>>1] - cy : r0;
    return { x: cx, y: cy, r: Math.max(r0*0.75, Math.min(r0*1.3, r)) };
  };
  // Rad-Deckel: das gezeichnete Rad darf nicht über die Kotflügel-Kontur ragen
  // (Rad sitzt HINTER der Karosserie — alles über der Radhaus-Linie stünde
  // sichtbar überm Blech). Ausnahme bleibt via 0.75r-Floor: exponierte
  // Drag-Slicks (strip/basil), wo die Kontur der Reifen selbst ist.
  const capWheel = wd => {
    let fender = 1e9;
    for (let x = Math.max(0, Math.round(wd.x - wd.r*0.5)); x <= Math.min(m.w-1, Math.round(wd.x + wd.r*0.5)); x++)
      if (top[x] >= 0) fender = Math.min(fender, top[x]);
    if (fender < 1e9){
      wd.fy = fender;                                  // Kotflügel-Linie überm Rad
      wd.r = Math.min(wd.r, Math.max(wd.r*0.75, wd.y - fender));
    }
    return wd;
  };
  // er = voller Reifen-Radius (Detektion) — bestimmt Radier-Zone + gezeichnete
  // Radgrösse. capWheel kappt nur wd.r (= Voll-Radierscheibe, schont den Kotflügel).
  // Reifen-Kreis aus der FREIEN Unterhälfte (28.10., «Rad auf Rad»): unter der Radmitte steht
  // der Reifen frei → linke/rechte Alpha-Kante je Zeile ergibt Mitte + Radius des ECHTEN
  // Foto-Reifens. Vorher Schätzung → Foto-Reifen blieb neben dem gezeichneten Rad sichtbar.
  const fitTire = (wd, r0) => {
    // Kantenpunkte (links/rechts) aller freien Zeilen bis zur Reifen-Unterkante sammeln
    const P = [];
    for (let y = Math.round(wd.y + r0*0.15); y < Math.min(m.h, wd.y + r0*1.7); y += 2){
      const x0 = Math.round(wd.x);
      if (d[(y*m.w + x0)*4 + 3] <= 60) continue;
      let l = x0, rr = x0;
      while (l > 0 && d[(y*m.w + l - 1)*4 + 3] > 60) l--;
      while (rr < m.w - 1 && d[(y*m.w + rr + 1)*4 + 3] > 60) rr++;
      const hw = (rr - l)/2;
      if (hw < r0*0.12 || hw > r0*1.7) continue;       // Zeile hängt am Schweller/Stossfänger
      // Kanten müssen Reifengummi sein (dunkel, unbunt) — sonst hängt Blech dran
      const rubber = x => { let n = 0; for (let k = 0; k < 4; k++){ const i = (y*m.w + x)*4;
        const R = d[i], G = d[i+1], B = d[i+2]; if (Math.max(R,G,B) < 95 && Math.max(R,G,B) - Math.min(R,G,B) < 40) n++; x += (x < wd.x ? 1 : -1); } return n >= 2; };
      if (!rubber(l) || !rubber(rr)) continue;
      P.push([l, y], [rr, y]);
    }
    if (P.length < 8) return wd;
    // Kreis-Regression (Kåsa): x²+y² + D·x + E·y + F = 0
    let Sx=0,Sy=0,Sxx=0,Syy=0,Sxy=0,Sz=0,Sxz=0,Syz=0; const n = P.length;
    for (const [x, y] of P){ const z = x*x + y*y; Sx+=x; Sy+=y; Sxx+=x*x; Syy+=y*y; Sxy+=x*y; Sz+=z; Sxz+=x*z; Syz+=y*z; }
    const A = [[Sxx,Sxy,Sx],[Sxy,Syy,Sy],[Sx,Sy,n]], B = [-Sxz,-Syz,-Sz];
    const det = M3 => M3[0][0]*(M3[1][1]*M3[2][2]-M3[1][2]*M3[2][1]) - M3[0][1]*(M3[1][0]*M3[2][2]-M3[1][2]*M3[2][0]) + M3[0][2]*(M3[1][0]*M3[2][1]-M3[1][1]*M3[2][0]);
    const dA = det(A); if (!dA) return wd;
    const col = (i) => A.map((row, j) => row.map((v, k) => k === i ? B[j] : v));
    const D = det(col(0))/dA, E = det(col(1))/dA, F = det(col(2))/dA;
    const x = -D/2, y = -E/2, r = Math.sqrt(x*x + y*y - F);
    if (!(r > r0*0.7 && r < r0*1.9) || Math.abs(x - wd.x) > r0*0.5 || Math.abs(y - wd.y) > r0*0.5) return wd;
    return { ...wd, x, y, r, fitted: true };
  };
  // Mitte bei bekanntem Radius aus der freien Reifen-Unterkante: Boden-Kontur unter dem Rad
  // = Mitte + r; x = Mitte der linken/rechten Gummi-Kante in den untersten Zeilen
  const recenter = (wd, r) => {
    const xs = [], x0 = Math.round(wd.x);
    const bots = [];
    for (let x = Math.max(0, x0 - Math.round(r*0.25)); x <= Math.min(m.w - 1, x0 + Math.round(r*0.25)); x++) if (bot[x] >= 0) bots.push(bot[x]);
    if (bots.length < 5) return;
    bots.sort((p, q) => p - q);
    const yb = bots[bots.length >> 1];
    for (let y = Math.round(yb - r*0.55); y <= yb - r*0.12; y += 2){
      if (y < 0 || d[(y*m.w + x0)*4 + 3] <= 60) continue;
      let l = x0, rr = x0;
      while (l > 0 && d[(y*m.w + l - 1)*4 + 3] > 60) l--;
      while (rr < m.w - 1 && d[(y*m.w + rr + 1)*4 + 3] > 60) rr++;
      const hw = (rr - l)/2, dy = yb - r - y;                 // erwartete Halbbreite am Kreis
      const want = Math.sqrt(Math.max(0, r*r - dy*dy));
      if (Math.abs(hw - want) > r*0.25) continue;            // Zeile hängt an Blech/Schatten
      xs.push((l + rr)/2);
    }
    const ny = yb - r;
    if (Math.abs(ny - wd.y) < r*0.45) wd.y = ny;
    if (xs.length >= 3){ xs.sort((p, q) => p - q); const nx = xs[xs.length >> 1]; if (Math.abs(nx - wd.x) < r*0.4) wd.x = nx; }
  };
  const mkWheel = (cx, cy, r0) => {
    const wd = fitTire(detectWheel(cx, cy, r0), r0);
    wd.er = wd.r;
    return capWheel(wd);
  };
  const wheels = [ mkWheel(m.wx1, m.wy, m.rr ?? m.r), mkWheel(m.wx2, m.wy, m.r) ];
  // Echte STOSSSTANGEN-Kanten fürs Ankern von Auspuff/Splitter/Diffusor:
  // erste/letzte Spalte, deren Karosserie bis unter die Radmitte reicht UND
  // auch oberhalb davon Blech hat (Heckflügel-Überhang + Wheelie-Bar zählen NICHT).
  const isBody = x => bot[x] > m.wy && top[x] >= 0 && top[x] < m.wy - 10;
  let rearX = x0, noseX = x1, seen = 0;
  for (let x = x0; x <= x1; x++){
    if (isBody(x)){ if (++seen >= 3){ rearX = x - 2; break; } } else seen = 0;
  }
  seen = 0;
  for (let x = x1; x >= x0; x--){
    if (isBody(x)){ if (++seen >= 3){ noseX = x + 2; break; } } else seen = 0;
  }
  const bumBot  = med(bot.slice(rearX, Math.min(x1, Math.round(rearX + w*0.05))));
  const noseBot = med(bot.slice(Math.max(x0, Math.round(noseX - w*0.05)), noseX));
  // Schweller-Unterlinie zwischen den Radhäusern (für Kit-Schweller + Neon-Röhre)
  const sa = Math.round(wheels[0].x + (wheels[0].er ?? wheels[0].r) + 6);
  const sb = Math.round(wheels[1].x - (wheels[1].er ?? wheels[1].r) - 6);
  const sillBot = sb > sa ? med(bot.slice(sa, sb)) : -1;
  // Vorder-/Hinterrad gleich gross (Detektion streut je nach Foto-Schatten), ausser das
  // Auto hat bewusst andere Hinterräder (m.rr = Drag-Slicks)
  if (m.rr == null){
    // Stimmen vorne/hinten überein (±12 %) → grösserer Wert; sonst ist einer durch Schürze/
    // Schatten aufgebläht → kleinerer, aber nie unter dem Metadaten-Radius
    const ra = wheels[0].er, rb = wheels[1].er;
    const er = Math.abs(ra - rb) / Math.min(ra, rb) <= 0.12 ? Math.max(ra, rb) : Math.max(Math.min(ra, rb), m.r);
    for (const wd of wheels){ wd.er = er; recenter(wd, er); }
    if (wheels.some(w => w.fitted)) m._fit = { r: Math.max(wheels[0].er, wheels[1].er), y: (wheels[0].y + wheels[1].y)/2 };
  }
  // Zeilen-Linkskante (Heck-Kontur je Höhe) — Auspuff kommt exakt aus der Schürze
  const left = new Array(m.h).fill(-1);
  for (let y = 0; y < m.h; y++){
    let run = 0;
    for (let x = 0; x < m.w; x++){
      if (d[(y*m.w + x)*4 + 3] > 128){ if (++run >= 3){ left[y] = x - 2; break; } } else run = 0;
    }
  }
  let bumperY = -1, noseY = -1, noseRX = -1;
  for (let y = m.h - 1; y >= 0; y--){
    if (left[y] >= 0 && left[y] - x0 < w*0.07){ bumperY = y; break; }
  }
  // dasselbe vorne (Zeilen-Rechtskante)
  for (let y = m.h - 1; y >= 0 && noseY < 0; y--){
    let run = 0;
    for (let x = m.w - 1; x >= 0; x--){
      if (d[(y*m.w + x)*4 + 3] > 128){ if (++run >= 3){ if (x1 - (x + 2) < w*0.07){ noseY = y; noseRX = x + 2; } break; } } else run = 0;
    }
  }
  return spriteMeasureCache[m.src] = { x0, x1, rearX, noseX, bumperY, noseY, noseRX,
    deckX: Math.round(x0 + w*0.08), deckY,
    rearBot: bumBot >= 0 ? bumBot : rearBot, noseBot, sillBot, wheels, top, left };
}
function spriteLayout(m){
  // Rad = 28.8 Einheiten; nie breiter als der Canvas; nie höher als der Platz
  // über der Achse (sonst wird das Dach geklippt, z.B. pico)
  const scale = Math.min(28.8 / m.r, 470 / m.w, (AXLE_Y - 2) / m.wy);
  const midX = (m.wx1 + m.wx2) / 2 * scale;
  const xoff = 240 - midX;
  let yoff = AXLE_Y - m.wy * scale;
  // Echter Foto-Reifen vermessen (m._fit) → Auto so setzen, dass DIESER Reifen auf dem Boden steht
  // (Rad füllt sein Radhaus wie im Foto; nie übers Canvas-Dach hinaus)
  if (m._fit) yoff = Math.max(1, GROUND_Y + 2 - (m._fit.y + m._fit.r) * scale);
  return { scale, xoff, yoff,
    ax: [(xoff + m.wx1*scale)/480, (xoff + m.wx2*scale)/480] };
}
// Chrom-Verlauf für Canvas-Kits
function chromeGrad(c, y, h){
  const g2 = c.createLinearGradient(0, y, 0, y+h);
  g2.addColorStop(0,"#f4f8fc"); g2.addColorStop(.5,"#9ba7b3"); g2.addColorStop(1,"#565f69");
  return g2;
}
function rrC(c, x, y, w, h, r){
  c.beginPath();
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}
// Auspuff-Kit am Heck (bx = echte Heckkante, gy = Heck-Unterkante der Karosserie,
// tube = [x1,x2]-Klemme fürs Sidepipe-Rohr, damit es nicht durchs Hinterrad läuft)
function drawExhaustC(c, bx, ex, k=1, gy=AXLE_Y+26, tube=null){
  // Endrohr: Öffnung skaliert mit der Rohrhöhe → Big Bore wirkt wirklich BIG
  const tip = (x,y,w,h)=>{
    c.fillStyle = chromeGrad(c, y, h); rrC(c, x, y, w, h, h/2); c.fill();
    c.fillStyle = "#05070a";
    c.beginPath(); c.ellipse(x+h*0.42, y+h/2, h*0.30, h/2-1, 0, 0, 7); c.fill();
    c.fillStyle = "rgba(255,255,255,.35)";
    c.fillRect(x+2, y+1, w-4, 1.4);
  };
  // Rohre müssen DEUTLICH hinterm Heck herausragen — was unter der Karosserie
  // liegt, wird vom Body (später gezeichnet) verdeckt (Duplex sah aus wie Serie).
  if (ex === 0) tip(bx-12*k, gy-6*k, 18*k, 6*k);           // Serie: dezent einzeln
  else if (ex === 1){                                      // Duplex: 2 klar getrennte Rohre
    tip(bx-20*k, gy-14*k, 26*k, 7*k);
    tip(bx-20*k, gy-4*k,  26*k, 7*k);
  }
  else if (ex === 2){                                      // Big Bore: EIN fetter Kanonenlauf
    tip(bx-26*k, gy-15*k, 38*k, 14*k);
    c.strokeStyle = "rgba(255,255,255,.30)"; c.lineWidth = 1.6;   // Mündungsring
    c.beginPath(); c.ellipse(bx-26*k+14*k*0.42, gy-15*k+7*k, 14*k*0.34, 7*k, 0, 0, 7); c.stroke();
  }
  else { // Race Side-Pipe: Längsrohr am Schweller + MEGAPHON vor dem Hinterrad —
         // KEIN Heck-Endrohr (sonst nicht von Big Bore unterscheidbar)
    const sy = tube?.[2] ?? gy;                            // Schweller-Linie
    let t1 = tube ? tube[0] + 2 : bx + 30*k;
    let t2 = tube ? Math.min(tube[1] - 2, t1 + 170*k) : t1 + 150*k;
    if (t2 - t1 > 14*k){
      c.fillStyle = chromeGrad(c, sy-7*k, 7*k);
      rrC(c, t1, sy-7*k, t2-t1, 7*k, 3.5*k); c.fill();
      c.fillStyle = "rgba(0,0,0,.35)";                     // Hitzeschild-Schlitze
      for (let x = t1+16*k; x < t2-8*k; x += 16*k) c.fillRect(x, sy-6*k, 2.2*k, 5*k);
      // Megaphon: Rohr weitet sich nach hinten (links) auf und endet offen
      c.fillStyle = chromeGrad(c, sy-10*k, 10*k);
      c.beginPath();
      c.moveTo(t1+18*k, sy-7*k); c.lineTo(t1-10*k, sy-10.5*k);
      c.lineTo(t1-10*k, sy+2*k); c.lineTo(t1+18*k, sy);
      c.closePath(); c.fill();
      c.fillStyle = "#05070a";
      c.beginPath(); c.ellipse(t1-8*k, sy-4.2*k, 2.6*k, 6.2*k, 0, 0, 7); c.fill();
    } else {
      tip(bx-24*k, gy-12*k, 40*k, 12*k);                   // Notnagel: kein Platz fürs Rohr
    }
  }
}
// Spoiler am Deck-Anker. WICHTIG: Lackteile in Basis-Rot zeichnen, Aufruf
// erfolgt INNERHALB des hue-rotate-Filters → Farbton = exakt Foto-Lack.
function drawSpoilerC(c, ax, ay, sp, k=1, wing, hue=0){
  if (!sp || wing) return;
  if (sp === 1){ // Lack-Lip in der Lackfarbe (hue direkt — ctx.filter gibt's auf iOS nicht)
    c.fillStyle = `hsl(${hue} 68% 34%)`;
    c.beginPath(); c.moveTo(ax-2*k, ay); c.lineTo(ax+46*k, ay-8*k); c.lineTo(ax+50*k, ay+2*k); c.lineTo(ax, ay+9*k); c.closePath(); c.fill();
    c.fillStyle = `hsl(${hue} 65% 55%)`;
    c.beginPath(); c.moveTo(ax-2*k, ay); c.lineTo(ax+46*k, ay-8*k); c.lineTo(ax+47*k, ay-4.5*k); c.lineTo(ax-1*k, ay+3.5*k); c.closePath(); c.fill();
    c.fillStyle = `hsl(${hue} 70% 42%)`;                     // kleine Endplatte
    c.fillRect(ax-3*k, ay-2*k, 3*k, 9*k);
    // Kontaktschatten aufs Deck
    c.fillStyle = "rgba(0,0,0,.28)";
    c.beginPath(); c.ellipse(ax+22*k, ay+9*k, 24*k, 2.8*k, 0, 0, 7); c.fill();
  } else { // GT-Wing: Carbon (hue-neutral dunkel), präsent + hoch
    const kw = k*1.15;
    c.fillStyle = "rgba(0,0,0,.30)";
    c.beginPath(); c.ellipse(ax+22*kw, ay+2*kw, 24*kw, 2.6*kw, 0, 0, 7); c.fill();
    c.fillStyle = "#171b20";
    c.fillRect(ax+4*kw, ay-19*kw, 4.5*kw, 20*kw); c.fillRect(ax+34*kw, ay-19*kw, 4.5*kw, 20*kw);
    const pg = c.createLinearGradient(0, ay-27*kw, 0, ay-14*kw);
    pg.addColorStop(0, "#2a2f36"); pg.addColorStop(.45, "#14171c"); pg.addColorStop(1, "#0a0d11");
    c.fillStyle = pg;
    c.beginPath(); c.moveTo(ax-13*kw, ay-22*kw); c.lineTo(ax+50*kw, ay-26*kw); c.lineTo(ax+56*kw, ay-16*kw); c.lineTo(ax-9*kw, ay-12*kw); c.closePath(); c.fill();
    c.fillStyle = "rgba(255,255,255,.22)";
    c.beginPath(); c.moveTo(ax-13*kw, ay-22*kw); c.lineTo(ax+50*kw, ay-26*kw); c.lineTo(ax+51*kw, ay-23.2*kw); c.lineTo(ax-12*kw, ay-19.2*kw); c.closePath(); c.fill();
    c.fillStyle = "#0b0e12"; c.fillRect(ax-16*kw, ay-24*kw, 5.5*kw, 13*kw);
  }
}
// Endrohr-Anker aus der Kontur (null = keine Messung → alter Fallback)
const EX_H = [6, 13, 13];            // Gesamthöhe des Rohr-Pakets je Kit (×k)
function exhaustAnchor(M, L, ex, k, dropPx){
  if (!M || !M.left || !(M.bumperY >= 0)) return null;
  const H = EX_H[ex]*k;
  const y = Math.min(GROUND_Y - 3, L.yoff + M.bumperY*L.scale + dropPx - H*0.5 - 1*k);
  const sy = Math.round((y - dropPx - L.yoff) / L.scale);
  // Rohr muss HINTER dem Hinterrad aus der Schürze kommen (halbtransparente Schürzen-
  // Unterkanten lassen die Kontur sonst erst am Reifen beginnen) → notfalls höher suchen
  const w0 = M.wheels[0], wl = w0.x - (w0.er ?? w0.r) - 4;
  for (let dy = 0; dy < 60 && sy - dy >= 0; dy++){
    const v = M.left[sy - dy];
    if (v >= 0 && v < wl) return { x: L.xoff + v*L.scale, y: y - dy*L.scale };
  }
  return null;
}
// Endrohre: nur ein kurzes Stück ragt aus der Schürze (der Rest liegt unterm Blech,
// die Karosserie wird danach darübergezeichnet)
function drawExhaustTip(c, bx, cy, ex, k){
  const tip = (x, y, w, h) => {
    c.fillStyle = chromeGrad(c, y, h); rrC(c, x, y, w, h, h/2); c.fill();
    c.fillStyle = "#05070a";
    c.beginPath(); c.ellipse(x + h*0.38, y + h/2, h*0.26, h/2 - 0.8, 0, 0, 7); c.fill();
    c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(x + 2, y + 0.8, w - 4, 1.2);
  };
  if (ex === 0) tip(bx - 6*k, cy - 3*k, 20*k, 6*k);                 // Serie: dezent
  else if (ex === 1){                                               // Duplex: Doppelrohr
    tip(bx - 8*k, cy - 6.5*k, 22*k, 6*k);
    tip(bx - 8*k, cy + 0.5*k, 22*k, 6*k);
  } else {                                                          // Big Bore: dicker Lauf
    tip(bx - 11*k, cy - 6.5*k, 26*k, 13*k);
    c.strokeStyle = "rgba(255,255,255,.30)"; c.lineWidth = 1.4;
    c.beginPath(); c.ellipse(bx - 11*k + 13*k*0.38, cy, 13*k*0.3, 6.5*k - 0.5, 0, 0, 7); c.stroke();
  }
}
// Spoiler, der der Karosserie-Kontur folgt (28.10.: vorher fester Anker → schwebte über
// Dach/Deck). Erkennt Steil-/Schrägheck (Deck fast auf Dachhöhe) → Dachspoiler statt Flügel.
// sp 1 = Lack-Ducktail bzw. Dachkante, sp 2 = Carbon-GT-Flügel bzw. grosser Dachspoiler
function drawSpoilerFit(c, G, sp, k, hue){
  const { x0c, Lc, topC } = G;
  const at = f => topC(x0c + Lc*f);
  let roof = 1e9;
  for (let f = 0.30; f <= 0.70; f += 0.02){ const y = at(f); if (y != null) roof = Math.min(roof, y); }
  const deck = at(0.07);
  if (roof > 1e8 || deck == null) return;
  const hatch = deck - roof < 0.35*(AXLE_Y - roof);
  const paint = l => `hsl(${hue} 68% ${l}%)`;
  if (hatch){
    // Hinterkante des Dachs: erste Stelle (von hinten), die fast Dachhöhe erreicht
    let xr = x0c + Lc*0.04;
    for (let f = 0.01; f < 0.4; f += 0.005){ const y = at(f); if (y != null && y <= roof + 0.10*(AXLE_Y - roof)){ xr = x0c + Lc*f; break; } }
    const yr = topC(xr + 8*k) ?? roof;
    const len = sp === 2 ? 30*k : 22*k, th = sp === 2 ? 7*k : 5.5*k, lift = sp === 2 ? 2*k : 0.5*k;
    const x1 = xr + 12*k, x2 = xr - len + 12*k, yA = yr - lift;
    const yEnd = topC(x2);                                 // Heckschräge unter dem Spoilerende
    const yB = yA + Math.max(2*k, Math.min(10*k, ((yEnd ?? yA) - yA)*0.35));
    c.fillStyle = sp === 2 ? "#14171c" : paint(36);
    c.beginPath(); c.moveTo(x1, yA); c.lineTo(x2, yB - th*0.2); c.lineTo(x2 + 2*k, yB + th*0.8); c.lineTo(x1, yA + th); c.closePath(); c.fill();
    c.fillStyle = sp === 2 ? "rgba(255,255,255,.22)" : paint(56);
    c.beginPath(); c.moveTo(x1, yA); c.lineTo(x2, yB - th*0.2); c.lineTo(x2 + 0.6*k, yB + th*0.15); c.lineTo(x1, yA + th*0.35); c.closePath(); c.fill();
    if (sp === 2){                                        // Endplatte am Spoilerende
      c.fillStyle = "#0b0e12"; c.fillRect(x2 - 1*k, yB - 3*k, 3*k, th + 5*k);
    }
    return;
  }
  if (sp === 1){
    // Ducktail: Lackkante folgt dem Deckel, hinten hochgezogen
    const xa = x0c + Lc*0.012, xb = x0c + Lc*0.15, N = 12, up = [];
    c.beginPath();
    for (let i = 0; i <= N; i++){ const x = xa + (xb - xa)*i/N; const y = topC(x); if (y == null) return; up.push([x, y]); c[i ? "lineTo" : "moveTo"](x, y + 1.5); }
    for (let i = N; i >= 0; i--){ const [x, y] = up[i]; c.lineTo(x, y - (1 + 6*(1 - i/N)**1.5)*k); }
    c.closePath(); c.fillStyle = paint(36); c.fill();
    c.beginPath();
    for (let i = 0; i <= N; i++){ const [x, y] = up[i]; c[i ? "lineTo" : "moveTo"](x, y - (1 + 6*(1 - i/N)**1.5)*k); }
    c.strokeStyle = paint(58); c.lineWidth = 1.4; c.stroke();
    return;
  }
  // GT-Flügel: zwei Stützen stehen exakt auf dem Deckel (jede eigene Länge)
  const xr1 = x0c + Lc*0.04, xr2 = x0c + Lc*0.115;
  const b1 = topC(xr1), b2 = topC(xr2);
  if (b1 == null || b2 == null) return;
  let yp = Math.min(b1, b2) - 13*k;
  yp = Math.max(yp, roof + 3*k);                          // nie über Dachhöhe
  if (Math.min(b1, b2) - yp < 6*k) yp = Math.min(b1, b2) - 6*k;
  const xa = x0c - 3*k, xb = xr2 + 13*k;
  c.fillStyle = "rgba(0,0,0,.28)";
  c.beginPath(); c.ellipse((xr1 + xr2)/2, (b1 + b2)/2 + 1.5, (xr2 - xr1)/2 + 6*k, 2.2*k, 0, 0, 7); c.fill();
  c.fillStyle = "#171b20";
  c.fillRect(xr1 - 1.8*k, yp, 3.6*k, b1 - yp + 1.5);
  c.fillRect(xr2 - 1.8*k, yp, 3.6*k, b2 - yp + 1.5);
  const pg = c.createLinearGradient(0, yp - 6*k, 0, yp + 3*k);
  pg.addColorStop(0, "#2a2f36"); pg.addColorStop(.45, "#14171c"); pg.addColorStop(1, "#0a0d11");
  c.fillStyle = pg;
  c.beginPath(); c.moveTo(xa, yp - 4*k); c.lineTo(xb, yp - 1.5*k); c.lineTo(xb, yp + 2*k); c.lineTo(xa + 2*k, yp + 2.5*k); c.closePath(); c.fill();
  c.fillStyle = "rgba(255,255,255,.22)";
  c.beginPath(); c.moveTo(xa, yp - 4*k); c.lineTo(xb, yp - 1.5*k); c.lineTo(xb, yp - 0.4*k); c.lineTo(xa + 0.5*k, yp - 2.8*k); c.closePath(); c.fill();
  c.fillStyle = "#0b0e12"; c.fillRect(xa - 3*k, yp - 7*k, 3.5*k, 12*k);   // Endplatte
}
// Neon-Unterboden (Lackfarbe) — Licht-Pool am Boden, SKALIERT mit dem Auto (k)
// und BREITER als die Karosserie, sonst deckt das Auto das Licht komplett ab.
function drawNeonC(c, x1, x2, hue, k = 1, gy = GROUND_Y){
  const cx = (x1+x2)/2, w = (x2-x1)/2 + 30*k;
  const g2 = c.createRadialGradient(cx, gy, 6, cx, gy, w);
  g2.addColorStop(0,   `hsla(${hue} 100% 62% / .85)`);
  g2.addColorStop(0.5, `hsla(${hue} 100% 58% / .40)`);
  g2.addColorStop(1,   `hsla(${hue} 100% 55% / 0)`);
  c.fillStyle = g2;
  c.beginPath(); c.ellipse(cx, gy, w, 9 + 7*k, 0, 0, 7); c.fill();
}
// Heller Neon-Kern am Schweller — NACH der Karosserie zeichnen (Röhre sichtbar)
function drawNeonTube(c, x1, x2, hue, gy){
  if (x2 - x1 < 30) return;
  c.save();
  c.strokeStyle = `hsla(${hue} 100% 70% / .95)`;
  c.lineWidth = 2.6; c.lineCap = "round";
  c.shadowColor = `hsl(${hue} 100% 60%)`; c.shadowBlur = 10;
  c.beginPath(); c.moveTo(x1, gy); c.lineTo(x2, gy); c.stroke();
  c.stroke();                                   // 2. Pass = kräftigerer Glow
  c.restore();
}
async function spriteCanvas(key, st){
  let m = (window.CAR_SPRITES || {})[key];
  let kitFoto = false;
  // Widebody als ECHTES AI-Foto-Kit (nano_banana), wenn generiert
  if ((st.kit ?? 0) === 2 && window.CAR_KIT_SPRITES?.[key]){
    m = window.CAR_KIT_SPRITES[key]; kitFoto = true;
  }
  if (!m) return null;
  const im = await loadSprite(m);
  if (!im) return null;
  const M = measureSprite(im, m);                 // vor dem Layout: liefert m._fit (echter Reifen)
  const L = spriteLayout(m);
  const cv = document.createElement("canvas");
  cv.width = 480; cv.height = 200;
  const c = cv.getContext("2d");
  const bx = L.xoff, bx2 = L.xoff + m.w*L.scale;
  const k = (m.wx2 - m.wx1) * L.scale / 240;   // Kit-Skalierung relativ zum Radstand
  // TIEFERLEGUNG: Karosserie sinkt relativ zu den (fixen) Rädern — wie dY() bei SVG
  const dropPx = ((st.drop ?? 6) - 6) * 0.5;
  c.fillStyle = "rgba(0,0,0,.42)";
  c.beginPath(); c.ellipse(240, GROUND_Y+8, m.w*L.scale/2 + 4, 10, 0, 0, 7); c.fill();
  const hue = st.hue ?? 0;
  const nHue = st.neonHue ?? hue;                 // eigene Neonfarbe (28.10.), sonst Lackfarbe
  if (st.neon) drawNeonC(c, bx+8, bx2-8, nHue, k, GROUND_Y + 2);
  // Anker aus der Alpha-Kontur: Auspuff an echter Heckkante + Heck-Unterkante
  // (folgt der Tieferlegung), Spoiler am vermessenen Deck-Punkt.
  const whl = M ? M.wheels : [{ x:m.wx1, y:m.wy, r:m.rr ?? m.r, er:m.rr ?? m.r }, { x:m.wx2, y:m.wy, r:m.r, er:m.r }];
  // Auspuff an der STOSSSTANGE (M.rearX), nicht am Flügel-Überhang (M.x0) —
  // sonst schwebt der Endtopf bei phoenix/reaper/zenith/taifun hinterm Auto.
  // Clamp: Rohre dürfen nicht links aus dem 480er-Canvas rausfallen (onyx,
  // dessen Heck fast am Sprite-Rand liegt).
  const rearX = Math.max(L.xoff + (M ? (M.rearX ?? M.x0) : 0) * L.scale, 30*k);
  const exY = M && M.rearBot >= 0
    ? Math.max(AXLE_Y + 2, Math.min(AXLE_Y + 27, L.yoff + M.rearBot*L.scale + dropPx))
    : AXLE_Y + 26;
  // Schweller-Linie (für Sidepipe + Neon-Röhre) aus der gemessenen Kontur
  const sillC = M && M.sillBot >= 0
    ? Math.min(L.yoff + M.sillBot*L.scale + dropPx, GROUND_Y + 1)
    : Math.min(AXLE_Y + 21 + dropPx, AXLE_Y + 25);
  // Sidepipe-Rohr nur zwischen den Radhäusern zeichnen ([2] = Schweller-Linie)
  const tube = [ L.xoff + (whl[0].x + (whl[0].er ?? whl[0].r) + 6)*L.scale,
                 L.xoff + (whl[1].x - (whl[1].er ?? whl[1].r) - 6)*L.scale,
                 sillC ];
  // Heck-Endrohre HINTER dem Body (ragen seitlich raus) — die Sidepipe (ex 3)
  // dagegen NACH dem Body, sonst verschluckt der Schweller das Längsrohr.
  // Kontur-Helfer (Canvas-Koordinaten): Oberkante je x — Spoiler sitzen AUF dem Blech
  const srcX = xc => Math.max(0, Math.min(m.w - 1, Math.round((xc - L.xoff) / L.scale)));
  const topC = xc => { const t = M?.top?.[srcX(xc)]; return t >= 0 ? L.yoff + t*L.scale + dropPx : null; };
  const ex = st.exhaust ?? 0;
  if (ex < 3){
    // Endrohr kommt UNTER der Heckschürze heraus: Höhe = Schürzen-Unterkante, x = Heck-Kontur
    // in genau dieser Zeile (vorher feste Höhe → Rohr hing frei unterm Heck)
    const tip = exhaustAnchor(M, L, ex, k, dropPx);
    if (tip) drawExhaustTip(c, tip.x, tip.y, ex, k);
    else drawExhaustC(c, rearX + 4, ex, k, exY, tube);
  }
  // Foto-Räder im QUELLRAUM pixelgenau ausradieren: Voll-Scheibe nur bis zur
  // Kotflügel-Kante (wd.r, gekappt); im Ring bis zum vollen Reifen (er+6)
  // fliegt nur was NICHT Lack ist (Reifen dunkel, Felge grau/weiss) und unter
  // der Kotflügel-Linie liegt. So verschwindet der komplette Foto-Reifen,
  // ohne dass die Radierung den Kotflügel/Flare anfrisst.
  // Arbeits-Auflösung = Ziel-Auflösung (×1.25 Reserve) statt volle Foto-Grösse → ~¼ der Pixel
  const fz = Math.min(1, L.scale*1.25), SW = Math.round(m.w*fz), SH = Math.round(m.h*fz);
  const srcCv = document.createElement("canvas");
  srcCv.width = SW; srcCv.height = SH;
  const sc = srcCv.getContext("2d", { willReadFrequently: true });
  sc.drawImage(im, 0, 0, SW, SH);
  const sd = sc.getImageData(0, 0, SW, SH);
  for (const w0 of whl){
    const wd = { x: w0.x*fz, y: w0.y*fz };
    const rIn = (w0.r + 2)*fz, rOut = ((w0.er ?? w0.r) + 4)*fz, fy = (w0.fy ?? 0)*fz;
    const ya = Math.max(0, Math.floor(wd.y - rOut)), yb = Math.min(SH - 1, Math.ceil(wd.y + rOut));
    const xa = Math.max(0, Math.floor(wd.x - rOut)), xb = Math.min(SW - 1, Math.ceil(wd.x + rOut));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++){
      const i = (y*SW + x)*4;
      if (!sd.data[i+3]) continue;
      const dist = Math.hypot(x - wd.x, y - wd.y);
      if (dist > rOut) continue;
      if (dist <= rIn){ sd.data[i+3] = 0; continue; }
      if (y >= fy){
        const R = sd.data[i], G = sd.data[i+1], B = sd.data[i+2];
        if (!(R > 40 && R > G*1.45 && R > B*1.45)) sd.data[i+3] = 0;  // Basislack = Rot
      }
    }
  }
  // Ganzes Sprite: (1) Alpha-Schleier weg (halbtransparente BG-Kästen, Halos),
  // (2) alles was NICHT roter Basislack ist entsättigen, (3) Lackfarbe per
  // PIXEL-Hue-Rotation (CSS-hue-rotate-Matrix). WICHTIG: ctx.filter wird von
  // iOS/WebKit NICHT unterstützt — deshalb blieb der Lack am Handy immer rot,
  // während Neon (hsla-fillStyle) brav die Farbe wechselte.
  const D = sd.data;
  const rad = (hue||0)*Math.PI/180, co = Math.cos(rad), si = Math.sin(rad);
  const H = [
    0.213+co*0.787-si*0.213, 0.715-co*0.715-si*0.715, 0.072-co*0.072+si*0.928,
    0.213-co*0.213+si*0.143, 0.715+co*0.285+si*0.140, 0.072-co*0.072-si*0.283,
    0.213-co*0.213-si*0.787, 0.715-co*0.715+si*0.715, 0.072+co*0.928+si*0.072,
  ];
  for (let i = 0; i < D.length; i += 4){
    const a = D[i+3];
    if (!a) continue;
    if (a < 60){ D[i+3] = 0; continue; }
    let R = D[i], G = D[i+1], B = D[i+2];
    if (Math.max(R,G,B) - Math.min(R,G,B) > 16 && !(R > 40 && R > G*1.45 && R > B*1.45)){
      const l = 0.299*R + 0.587*G + 0.114*B;
      R += (l-R)*0.75; G += (l-G)*0.75; B += (l-B)*0.75;
    }
    if (hue){
      const r2 = H[0]*R + H[1]*G + H[2]*B;
      const g2 = H[3]*R + H[4]*G + H[5]*B;
      const b2 = H[6]*R + H[7]*G + H[8]*B;
      R = r2; G = g2; B = b2;
    }
    D[i]   = R < 0 ? 0 : R > 255 ? 255 : R;
    D[i+1] = G < 0 ? 0 : G > 255 ? 255 : G;
    D[i+2] = B < 0 ? 0 : B > 255 ? 255 : B;
  }
  sc.putImageData(sd, 0, 0);
  c.drawImage(srcCv, L.xoff, L.yoff + dropPx, m.w*L.scale, m.h*L.scale);
  if (M && M.top && !m.wing && (st.spoiler ?? 0)){
    const x0c = L.xoff + M.x0*L.scale, Lc = (M.x1 - M.x0)*L.scale;
    drawSpoilerFit(c, { x0c, Lc, topC }, st.spoiler, k, hue);
  }
  drawBodykitC(c, L, m, kitFoto ? 0 : (st.kit ?? 0), k, dropPx, whl, M, hue);
  if ((st.exhaust ?? 0) === 3) drawExhaustC(c, rearX + 4, 3, k, exY, tube);
  // Neon-Röhre am Schweller zwischen den Radhäusern (an der gemessenen Schweller-Linie)
  if (st.neon) drawNeonTube(c, tube[0] + 4, tube[1] - 4, nHue, sillC - 1);
  // Räder werden von den AUFRUFERN HINTER die Karosserie gelegt (durchs
  // Radhaus-Loch sichtbar) — so deckt der Kotflügel das Rad bei Tieferlegung
  // wie beim echten Auto, statt dass das Rad über dem Blech klebt.
  // r = gezeichnetes Rad in ECHTER Reifengrösse (er) — füllt den Radkasten,
  // der Kotflügel darüber blieb ja stehen. hole = dunkle Radhaus-Scheibe,
  // deckt das ganze radierte Loch; hy = Loch-Mitte (wandert mit drop,
  // das Rad selbst bleibt auf der Achse).
  cv._wells = whl.map(wd => ({
    x: L.xoff + wd.x*L.scale,
    y: L.yoff + wd.y*L.scale,
    hy: L.yoff + wd.y*L.scale + dropPx,
    r: (wd.er ?? wd.r)*L.scale + 2,
    hole: ((wd.er ?? wd.r) + 4)*L.scale + 2,
  }));
  return cv;
}
// ── Bodykit (Street/Widebody) — Canvas-Version für Foto-Autos ──────────────
function drawBodykitC(c, L, m, kit, k, dropPx, whl, M, hue = 0){
  if (!kit) return;
  const s = L.scale, yo = L.yoff + dropPx;
  // Alle Kit-Teile ankern an der GEMESSENEN Karosserie-Unterlinie — vorher
  // hingen sie auf fixer Höhe frei unterm Auto («schwebendes Street-Kit»).
  const noseX = Math.min(L.xoff + (M?.noseX ?? m.w)*s, 480 - 28*k);
  const rearX = Math.max(L.xoff + (M?.rearX ?? 0)*s, 24*k);
  // Kit-Teile nie unter ~60 % Radradius unter der Achse (vorher Bodenhöhe → Leiste am Boden)
  const yCl   = v => Math.min(v, AXLE_Y + 17 + dropPx);
  const noseY = yCl(M && M.noseY >= 0 ? yo + M.noseY*s : M && M.noseBot >= 0 ? yo + M.noseBot*s : AXLE_Y + 15 + dropPx);
  const rearY = yCl(M && M.bumperY >= 0 ? yo + M.bumperY*s : M && M.rearBot >= 0 ? yo + M.rearBot*s : AXLE_Y + 15 + dropPx);
  const sillY = yCl(M && M.sillBot >= 0 ? yo + M.sillBot*s : AXLE_Y + 22 + dropPx);
  // Street-Kit (28.10. v2, «kein Unterschied sichtbar»): deutlich sichtbar, aber an der Kontur
  const paint = l => `hsl(${hue} 68% ${l}%)`;
  // Front-Splitter: Carbon-Lippe an der Schürzen-Unterkante, ragt sichtbar vor
  const nX = M && M.noseRX >= 0 ? Math.min(L.xoff + M.noseRX*s, 480 - 14*k) : noseX;
  c.fillStyle = "#151a20";
  c.beginPath();
  c.moveTo(nX-46*k, noseY-3*k); c.lineTo(nX+9*k, noseY-2*k);
  c.lineTo(nX+12*k, noseY+2.5*k); c.lineTo(nX-44*k, noseY+3.5*k);
  c.closePath(); c.fill();
  c.fillStyle = "rgba(255,255,255,.45)"; c.fillRect(nX-46*k, noseY-3*k, 55*k, 1.4);
  c.fillStyle = paint(50); c.fillRect(nX-40*k, noseY+1.2*k, 46*k, 1.3*k);         // Lack-Akzentlinie
  // Heck-Diffusor mit Finnen
  const rX = M && M.bumperY >= 0 && M.left?.[M.bumperY] >= 0 ? Math.max(L.xoff + M.left[M.bumperY]*s, 10*k) : rearX;
  c.fillStyle = "#151a20";
  c.beginPath();
  c.moveTo(rX-8*k, rearY-3*k); c.lineTo(rX+40*k, rearY-3*k);
  c.lineTo(rX+40*k, rearY+2.5*k); c.lineTo(rX-6*k, rearY+4*k);
  c.closePath(); c.fill();
  c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(rX-8*k, rearY-3*k, 48*k, 1.3);
  c.fillStyle = "#06080b";
  for (let i = 0; i < 5; i++) c.fillRect(rX - 4*k + i*8*k, rearY - 1*k, 2*k, 6*k);
  // Seitenschweller: direkt unter der Schweller-Linie, mit heller Kante
  const x1 = L.xoff + (whl[0].x + (whl[0].er ?? whl[0].r) + 4)*s;
  const x2 = L.xoff + (whl[1].x - (whl[1].er ?? whl[1].r) - 4)*s;
  if (x2 > x1){
    c.fillStyle = paint(30); rrC(c, x1, sillY-4, x2-x1, 6*k+3, 2*k); c.fill();         // Schweller in Lackfarbe
    c.fillStyle = paint(52); c.fillRect(x1+3, sillY-3, x2-x1-6, 1.6);                 // Glanzkante
    c.fillStyle = "#151a20"; rrC(c, x1+4*k, sillY+5*k-1, x2-x1-8*k, 2.6*k, 1.2*k); c.fill(); // Carbon-Lippe
  }
  if (kit >= 2){ // Widebody: FETTE Flares über beiden Radhäusern (+ Nieten)
    for (let i = 0; i < 2; i++){
      const wd = whl?.[i];
      const cx = wd ? L.xoff + wd.x*s : L.ax[i]*480;
      const cy = wd ? L.yoff + wd.y*s + dropPx : AXLE_Y + dropPx;
      const fr = wd ? (wd.er ?? wd.r)*s + 5
                    : ((i === 0 && m.rr ? m.rr : m.r) * s) + 5;
      // Nur oberer Halbkreis — Endpunkte unterhalb der Radmitte wirkten wie
      // «Haken» unter dem Auto (kaze/pico).
      c.strokeStyle = "#0d1014"; c.lineWidth = 12; c.lineCap = "round";
      c.beginPath(); c.arc(cx, cy, fr, Math.PI*0.97, Math.PI*0.03, false); c.stroke();
      c.strokeStyle = "rgba(255,255,255,.20)"; c.lineWidth = 2.4;
      c.beginPath(); c.arc(cx, cy, fr+5, Math.PI*0.97, Math.PI*0.03, false); c.stroke();
      c.fillStyle = "#39404b";
      for (const a of [-2.6,-2.2,-1.8,-1.4,-1.0,-0.6]){
        c.beginPath(); c.arc(cx + Math.cos(a)*fr, cy + Math.sin(a)*fr, 1.8, 0, 7); c.fill();
      }
    }
  }
}
// Heckkanten-X (Anteil 0..1) für Backfire-Flammen im Rennen
function exhaustXFrac(key, def){
  const m = (window.CAR_SPRITES || {})[key];
  if (m){
    const L = spriteLayout(m), M = spriteMeasureCache[m.src]; // gefüllt, sobald das Auto gerendert wurde
    return (L.xoff + (M ? M.x0 : 0) * L.scale) / 480;
  }
  return SHAPES[def.shape].span[0] / 480;
}
// Achspositionen: Sprite-Kalibrierung vor SVG-Formdaten
function carAx(key, def){
  const m = (window.CAR_SPRITES || {})[key];
  return m ? spriteLayout(m).ax : SHAPES[def.shape].ax;
}
function svg2img(svg){
  return new Promise(res=>{
    const img = new Image();
    img.onload = ()=>res(img);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
// Performance (28.10., «nach Autokauf hängt das Spiel»): Garage rief 40× carImage gleichzeitig
// (je Pixel-Bearbeitung des ganzen Fotos + PNG-Kodierung, ohne Cache) — bei jedem Neuaufbau.
// Jetzt: Cache je Auto+Style, Aufträge EINZELN nacheinander mit Pause für die UI, Kodierung per toBlob.
const carImgCache = new Map();
let carImgQueue = Promise.resolve();
// urgent = grosse Vorschau (Garage/Menü): sofort, nicht hinter den Fuhrpark-Bildchen anstellen
function carImage(defKey, st, urgent = false){
  const key = defKey + "|" + JSON.stringify(st);
  const hit = carImgCache.get(key);
  if (hit){ carImgCache.delete(key); carImgCache.set(key, hit); return hit; }   // LRU: nach hinten
  const job = urgent ? carImageNow(defKey, { ...st })
    : carImgQueue.then(() => new Promise(r => setTimeout(r, 0))).then(() => carImageNow(defKey, { ...st }));
  if (!urgent) carImgQueue = job.catch(() => {});
  carImgCache.set(key, job);
  job.catch(() => carImgCache.delete(key));
  while (carImgCache.size > 90){
    const old = carImgCache.keys().next().value;
    carImgCache.get(old).then(im => { if (im?._blobUrl) URL.revokeObjectURL(im._blobUrl); }).catch(() => {});
    carImgCache.delete(old);
  }
  return job;
}
async function carImageNow(defKey, st){                                     // Preview
  const cv = await spriteCanvas(defKey, st);
  if (cv){
    // Kompositions-Reihenfolge: Radhaus (dunkel) → Rad → Karosserie DARÜBER
    const out = document.createElement("canvas");
    out.width = 480; out.height = 200;
    const c = out.getContext("2d");
    const ws = wheelSprite(st.rim ?? 0, 40);
    for (const wl of cv._wells){
      // Radhaus nur OBERHALB der Achse dunkeln (hinterm Kotflügel) — sonst ragt die mit der
      // Tieferlegung abgesenkte Scheibe unten als schwarzer «zweiter Reifen» raus
      const hr = wl.hole ?? wl.r, hy = wl.hy ?? wl.y;
      c.save(); c.beginPath(); c.rect(wl.x - hr - 1, hy - hr - 1, hr*2 + 2, wl.y - (hy - hr - 1)); c.clip();
      c.fillStyle = "#05070a";
      c.beginPath(); c.arc(wl.x, hy, hr, 0, 7); c.fill(); c.restore();
      // Rad füllt sein Radhaus — Sprite hat 2px Leer-Rand rundum, deshalb
      // beim Zeichnen hochskalieren, sonst ist jeder Reifen ~5% zu klein
      const d = (wl.r - 2) * 2 * (ws.width / (ws.width - 4));
      c.drawImage(ws, wl.x - d/2, wl.y - d/2, d, d);
    }
    c.drawImage(cv, 0, 0);
    const blob = await new Promise(res => out.toBlob ? out.toBlob(res, "image/png") : res(null));
    return await new Promise(res=>{
      const im = new Image(); im.onload = ()=>res(im);
      if (blob){ im._blobUrl = URL.createObjectURL(blob); im.src = im._blobUrl; }
      else im.src = out.toDataURL();
    });
  }
  return svg2img(fullSVG(defKey, st));
}
async function carBodyImage(defKey, st){                                    // Rennen
  return (await spriteCanvas(defKey, st)) ?? svg2img(bodySVG(defKey, st));
}

// Rad-Sprite (Offscreen-Canvas) — wird im Rennen rotiert gezeichnet
function wheelSprite(rim, r){
  const s = document.createElement("canvas");
  const px = r*2+4; s.width = px; s.height = px;
  const g = s.getContext("2d");
  const c = px/2;
  // Reifen: radialer Gummi-Verlauf + Flanken-Ring
  const tg = g.createRadialGradient(c,c,r*0.4,c,c,r);
  tg.addColorStop(0,"#23272c"); tg.addColorStop(0.72,"#111418"); tg.addColorStop(1,"#04060a");
  g.fillStyle = tg; g.beginPath(); g.arc(c,c,r,0,7); g.fill();
  g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1.5;
  g.beginPath(); g.arc(c,c,r*0.88,0,7); g.stroke();
  // Chrom-Verlauf für Speichen/Lippe
  const cg = g.createLinearGradient(0,c-r*0.5,0,c+r*0.5);
  cg.addColorStop(0,"#f4f8fc"); cg.addColorStop(0.5,"#9ba7b3"); cg.addColorStop(1,"#565f69");
  const RIM = r*0.52;                        // grössere Felge = Stile klar erkennbar
  if (rim === 1){ // Gold-Mesh: sattes Gold, dichtes Kreuzgeflecht, fette Lippe
    g.fillStyle = "#181205"; g.beginPath(); g.arc(c,c,RIM,0,7); g.fill();
    g.strokeStyle = "#e8c25f"; g.lineWidth = r*0.09;
    g.beginPath(); g.arc(c,c,RIM*0.94,0,7); g.stroke();
    g.strokeStyle = "#d9b556"; g.lineWidth = r*0.045;
    for (let i=0;i<16;i++){ const a=i*Math.PI/8;
      g.beginPath(); g.moveTo(c-Math.cos(a)*RIM*0.86, c-Math.sin(a)*RIM*0.86);
      g.lineTo(c+Math.cos(a)*RIM*0.86, c+Math.sin(a)*RIM*0.86); g.stroke(); }
    g.fillStyle = "#f6e6b4"; g.beginPath(); g.arc(c,c,r*0.13,0,7); g.fill();
    g.fillStyle = "#8a6f2e"; g.beginPath(); g.arc(c,c,r*0.055,0,7); g.fill();
  } else if (rim === 2){ // TURBOFAN: geschlossener Renn-Deckel mit Lüfterschlitzen
    g.fillStyle = "#c9ced6"; g.beginPath(); g.arc(c,c,RIM,0,7); g.fill();
    const fg = g.createLinearGradient(0,c-RIM,0,c+RIM);
    fg.addColorStop(0,"#e9edf2"); fg.addColorStop(.55,"#aeb6c0"); fg.addColorStop(1,"#7d8590");
    g.fillStyle = fg; g.beginPath(); g.arc(c,c,RIM*0.97,0,7); g.fill();
    g.fillStyle = "#12161b";                                    // Lüfterschlitze
    for (let i=0;i<6;i++){ const a=i*Math.PI/3;
      g.save(); g.translate(c,c); g.rotate(a);
      g.beginPath(); g.ellipse(0, -RIM*0.68, r*0.10, r*0.045, 0, 0, 7); g.fill();
      g.restore(); }
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = r*0.03;    // Deckel-Fuge
    g.beginPath(); g.arc(c,c,RIM*0.55,0,7); g.stroke();
    g.fillStyle = "#2a3138"; g.beginPath(); g.arc(c,c,r*0.10,0,7); g.fill();
    g.fillStyle = "#e8ecf1"; g.beginPath(); g.arc(c,c,r*0.05,0,7); g.fill();
  } else if (rim === 3){ // Racing Weiss: 8 breite weisse Speichen + roter Deckel
    g.fillStyle = "#e8e4dc"; g.beginPath(); g.arc(c,c,RIM,0,7); g.fill();
    g.strokeStyle = "#b8b2a6"; g.lineWidth = r*0.05;
    g.beginPath(); g.arc(c,c,RIM*0.97,0,7); g.stroke();
    g.fillStyle = "#faf7f0";
    for (let i=0;i<8;i++){ const a=i*Math.PI/4;
      g.save(); g.translate(c,c); g.rotate(a);
      g.fillRect(-r*0.075, -RIM*0.95, r*0.15, RIM*0.82); g.restore(); }
    g.fillStyle = "#c73a3a"; g.beginPath(); g.arc(c,c,r*0.13,0,7); g.fill();
    g.fillStyle = "#f2d8d8"; g.beginPath(); g.arc(c,c,r*0.05,0,7); g.fill();
  } else { // Sport 5-Speiche poliert
    g.fillStyle = "#101318"; g.beginPath(); g.arc(c,c,RIM,0,7); g.fill();
    g.strokeStyle = cg; g.lineWidth = r*0.05;
    g.beginPath(); g.arc(c,c,RIM*0.97,0,7); g.stroke();
    g.fillStyle = cg;
    for (let i=0;i<5;i++){ const a=i*Math.PI*2/5;
      g.save(); g.translate(c,c); g.rotate(a);
      g.beginPath(); g.moveTo(-r*0.09,r*0.05); g.lineTo(-r*0.05,-RIM*0.90); g.lineTo(r*0.05,-RIM*0.90); g.lineTo(r*0.09,r*0.05); g.closePath(); g.fill();
      g.restore(); }
    g.fillStyle = "#e8ecf1"; g.beginPath(); g.arc(c,c,r*0.11,0,7); g.fill();
    g.fillStyle = "#697079"; g.beginPath(); g.arc(c,c,r*0.045,0,7); g.fill();
  }
  return s;
}

// ── Sound-Charakter pro Auto ────────────────────────────────────────────────
// fm = Zündfrequenz-Faktor (tief=bassig), sub = Bass-Oszillator-Anteil,
// dist = Verzerrung (dreckig), lp = Tiefpass-Faktor (hell/dumpf)
const SND_SHAPE = {
  wedge:   {fm:1.00, sub:.30, dist:3.2, lp:1.00},
  hatch:   {fm:1.15, sub:.22, dist:3.0, lp:1.15},
  coupe:   {fm:1.05, sub:.32, dist:3.4, lp:1.00},
  rx7:     {fm:1.60, sub:.18, dist:5.5, lp:1.25},
  sedan:   {fm:0.95, sub:.38, dist:3.6, lp:0.90},
  roadster:{fm:1.25, sub:.20, dist:2.8, lp:1.20},
  kei:     {fm:1.45, sub:.14, dist:2.6, lp:1.35},
  gtr:     {fm:0.95, sub:.42, dist:4.0, lp:0.90},
  supra:   {fm:0.85, sub:.45, dist:3.8, lp:0.80},
  muscle:  {fm:0.58, sub:.60, dist:5.0, lp:0.62},
  wagon:   {fm:0.90, sub:.42, dist:3.4, lp:0.85},
  nsx:     {fm:1.40, sub:.24, dist:2.6, lp:1.30},
  v10:     {fm:1.70, sub:.24, dist:2.6, lp:1.40},
  gt1:     {fm:1.55, sub:.30, dist:3.2, lp:1.35},
  drag:    {fm:0.52, sub:.68, dist:6.0, lp:0.55},
};
const SND_CAR = { // Feintuning einzelner Autos
  hammer: {fm:0.50, sub:.65, dist:5.5, lp:0.55},  // Big Block: Presslufthammer
  shini:  {fm:1.10, sub:.40, dist:5.0, lp:0.95},  // Drag-GTR: brutal
  bansh:  {fm:1.75, sub:.16, dist:6.0, lp:1.35},  // Renn-Wankel: kreischt
  golem:  {fm:0.46, sub:.70, dist:5.8, lp:0.50},  // V12: Erdbeben
  mjoel:  {fm:0.44, sub:.72, dist:6.2, lp:0.48},  // Donnerschlag
  zenith: {fm:0.50, sub:.70, dist:6.5, lp:0.52},  // Endstufe
  bullet: {fm:1.60, sub:.12, dist:3.2, lp:1.45},  // Monster-Kei: hell + böse
  kuro:   {fm:0.56, sub:.68, dist:6.4, lp:0.55},  // Vault-Dämon: höllisch tief
};
// Klangfamilie nach Aussehen (28.10., Claw): JDM = Standard (hochdrehend, Ansaug-Rasp,
// Turbo-Flattern), Muscle = V8-Blubbern mit Leerlauf-Lope, Exot = bisheriger Klang (V10/GT1/Mittelmotor)
const SND_FAM_SHAPE = { muscle:"muscle", drag:"muscle", v10:"exotic", gt1:"exotic" };
const SND_FAM_CAR = { spectre:"exotic", eklipse:"exotic", zenith:"exotic", kuro:"jdm" };
const soundFamily = k => SND_FAM_CAR[k] ?? SND_FAM_SHAPE[CAR_DEFS[k].shape] ?? "jdm";
// Auspuff-Kit (Serie/Duplex/Big Bore) macht lauter, bassiger, dreckiger; turbo = gekaufte Stage (0–3)
function soundProfile(defKey, exhaust = 0, turbo = 0){
  const base = { ...SND_SHAPE[CAR_DEFS[defKey].shape], ...(SND_CAR[defKey] || {}) };
  return { fm: base.fm, sub: Math.min(.8, base.sub + exhaust*0.12),
           dist: base.dist + exhaust*1.0, lp: base.lp * (1 - exhaust*0.08),
           vol: 1 + exhaust*0.20, fam: soundFamily(defKey), turbo: turbo|0,
           redline: CAR_DEFS[defKey].redline };
}

// Spitzenleistung in PS (aus der Drehmomentkurve, optional mit Upgrade-Faktor)
function carPS(def, powerMul = 1){
  let best = 0;
  for (let r = 1000; r <= def.redline; r += 100)
    best = Math.max(best, torqueAt(def, r) * r / 7023);
  return Math.round(best * powerMul);
}

// Drehmoment-Interpolation
function torqueAt(def, rpm){
  const c = def.torque;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i=1;i<c.length;i++){
    if (rpm <= c[i][0]){
      const [r0,t0]=c[i-1],[r1,t1]=c[i];
      return t0 + (t1-t0)*(rpm-r0)/(r1-r0);
    }
  }
  return c[c.length-1][1] * Math.max(0, 1-(rpm-c[c.length-1][0])/1500);
}
