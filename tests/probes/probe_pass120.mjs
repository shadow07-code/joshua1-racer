const H = await import("../harness.mjs");
const { g } = H.M;
const tot = [];
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  H.seed(seed); g.state = "TITLE"; H.tick(); H.startRace();
  while (g.raceTime < 120) { g.player.invuln = 99; g.player.lives = 3; H.tick(); }
  tot.push(g.traffic.passedCount);
}
console.log("cars passed in a 2-minute run (8 seeds):", tot.join(" "), " avg", (tot.reduce((a, b) => a + b) / tot.length).toFixed(1));
