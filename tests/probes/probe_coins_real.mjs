// Coins a clean 2-minute run yields in the REAL game (full main.js), with a
// coin-seeking driver steering at the real steer rate. Invulnerable so every
// seed runs the full two minutes.
const H = await import("../harness.mjs");
const { g } = H.M;
const { PHYS } = await import("../../src/config.js");
const got = [];
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
  H.seed(seed); g.state = "TITLE"; H.tick(); H.startRace();
  while (g.raceTime < 120) {
    g.player.invuln = 99; g.player.lives = 3;
    let target = null, best = Infinity;
    for (const c of g.traffic.coins) { const d = c.z - g.player.z; if (!c.got && d > -2 && d < 120 && d < best) { best = d; target = c; } }
    if (target) { const r = PHYS.steerSpeed * PHYS.steerSpeedFactor / 60; g.player.x += Math.max(-r, Math.min(r, target.x - g.player.x)); }
    H.tick();
  }
  got.push(g.coins);
}
console.log("real-game coins / clean 2-min run (12 seeds):", got.join(" "), " avg", (got.reduce((a, b) => a + b) / got.length).toFixed(1));
