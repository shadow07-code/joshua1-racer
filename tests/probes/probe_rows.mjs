// When do rows actually reach the player, over a real run? (invulnerable ghost
// driver: never crashes, so the clock runs the full ramp)
const H = await import("../harness.mjs");
const { g } = H.M;
const { PHYS } = await import("../../src/config.js");
const out = [];
for (const seed of [1, 2, 3, 4]) {
  H.seed(seed); g.state = "TITLE"; H.tick(); H.startRace();
  let lastPassed = g.traffic.passedCount, lastRowT = null;
  const gaps = [];                          // [raceTime, secondsSincePrevRow]
  while (g.raceTime < 150) {
    g.player.invuln = 99; g.player.lives = 3;
    H.tick();
    if (g.traffic.passedCount > lastPassed) {
      if (lastRowT === null || g.raceTime - lastRowT > 0.35) {   // a new row (cars of one row pass within ~0.3 s)
        if (lastRowT !== null) gaps.push([g.raceTime, g.raceTime - lastRowT]);
        lastRowT = g.raceTime;
      }
      lastPassed = g.traffic.passedCount;
    }
  }
  out.push(gaps);
}
const bands = [[5, 20], [20, 44], [44, 80], [80, 124], [124, 150]];
console.log("row-to-row interval (s) vs combo window 2.8 s   [4 seeds]");
for (const [a, b] of bands) {
  const v = out.flat().filter(([t]) => t >= a && t < b).map(([, d]) => d).sort((x, y) => x - y);
  const med = v[v.length >> 1], p90 = v[Math.floor(v.length * 0.9)];
  const over = v.filter((d) => d > 2.8).length / v.length;
  console.log(`  ${String(a).padStart(3)}-${String(b).padEnd(3)}s  rows ${String(v.length).padStart(3)}  median ${med.toFixed(2)}  p90 ${p90.toFixed(2)}  gaps > 2.8s: ${(over * 100).toFixed(0)}%`);
}
