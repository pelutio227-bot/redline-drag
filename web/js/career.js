// career.js — Karriere-Regeln ohne DOM (Belohnungen, XP, Level). Wird auch vom
// Balancing-Test (tools/balance-sim.mjs) geladen → Spiel und Test rechnen gleich.
const xpNeed = lvl => 70 + lvl*55;

// Belohnung eines KI-Rennens.
// - Sieg: volles Preisgeld (Rematch gegen schon besiegte Rivalen: ⅓)
// - Niederlage: 25% Startgeld → nach 2–3 Versuchen reicht es fürs nächste Upgrade
function raceReward({ win, opp, rematch = false, perfects = 0 }){
  let cash, xp;
  if (win){
    cash = opp.prize;
    // XP wächst mit dem Preisgeld → Level (und damit neue Autos) passen zur Liga
    xp = 30 + Math.round(opp.prize * 0.2) + (perfects >= 2 ? 10 : 0);
  } else {
    cash = Math.round(opp.prize * 0.25 / 10) * 10;
    xp = 10 + Math.round(opp.prize * 0.03);
  }
  if (rematch){ cash = Math.round(cash/3/10)*10; xp = Math.round(xp/3); }
  return { cash, xp };
}

if (typeof globalThis !== "undefined") Object.assign(globalThis, { xpNeed, raceReward });
