// Baseline for probe_rampend: the SAME moments, same lanes, but no rampage —
// how often does holding a lane for 1 s crash anyway?
const H = await import("../harness.mjs");
const { g } = H.M;
let n = 0, crashes = 0, laneCar = 0;
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  for (const T of [77, 107, 137]) {
    H.seed(seed); g.state = "TITLE"; H.tick(); H.startRace();
    const lanes = [-44.8, -22.4, 0, 22.4, 44.8];
    while (g.raceTime < T) { g.player.invuln = 99; g.player.lives = 3; H.tick(); }
    g.player.x = lanes[(seed + T - 7) % 5]; g.player.bounce = 0;
    g.player.invuln = 0; g.player.lives = 3; n++;
    if (g.traffic.list.some((c) => !c.smashed && !c.oncoming && c.z > g.player.z && c.z < g.player.z + 45 && Math.abs(c.x - g.player.x) < 8.5)) laneCar++;
    for (let i = 0; i < 60; i++) H.tick();
    if (g.player.lives < 3) crashes++;
  }
}
console.log(`BASELINE ${n} random moments, holding a lane: car in path ${laneCar}x; crashed within 1 s ${crashes}x (${(crashes / n * 100).toFixed(0)}%)`);
