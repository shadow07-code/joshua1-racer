// After a crash: when does the promised breather actually reach the player?
// Invulnerable except for the one staged crash, so only traffic flow is measured.
const H = await import("../harness.mjs");
const { g } = H.M;
const W = [[0, 1.5], [1.5, 3], [3, 4.5], [4.5, 6], [6, 8]];
const acc = W.map(() => 0); let n = 0;
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  for (const T of [50, 80, 110]) {
    H.seed(seed); g.state = "TITLE"; H.tick(); H.startRace();
    while (g.raceTime < T) { g.player.invuln = 99; g.player.lives = 3; H.tick(); }
    H.run(0.3); g.player.invuln = 0; g.player.bounce = 0;
    const car = g.traffic.list.find((c) => !c.smashed && !c.oncoming && c.z > g.player.z + 2);
    car.z = g.player.z + 1; car.x = g.player.x;
    const t0 = g.raceTime;
    H.tick();
    if (g.player.lives !== 2) continue;
    n++;
    let last = g.traffic.passedCount;
    while (g.raceTime < t0 + 8) {
      g.player.invuln = Math.max(g.player.invuln, 0.01) ; g.player.lives = 2;
      H.tick();
      const d = g.traffic.passedCount - last; last = g.traffic.passedCount;
      const dt = g.raceTime - t0;
      W.forEach(([a, b], i) => { if (dt >= a && dt < b) acc[i] += d; });
    }
  }
}
console.log(`${n} staged crashes. Cars reaching the player after the crash (per crash):`);
W.forEach(([a, b], i) => console.log(`  ${a.toFixed(1)}-${b.toFixed(1)} s ${i === 0 ? "(invulnerable)" : "              "}  ${(acc[i] / n).toFixed(2)} cars  = ${(acc[i] / n / (b - a)).toFixed(2)}/s`));
