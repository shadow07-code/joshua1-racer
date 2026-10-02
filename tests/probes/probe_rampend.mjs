// A rampage ends mid-traffic. Holding your line (no steering), do you crash in
// the next second — i.e. did the exit shockwave leave the car IN YOUR PATH standing?
const H = await import("../harness.mjs");
const { g } = H.M;
let ends = 0, crashes = 0, laneCarLeft = 0;
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  for (const T of [70, 100, 130]) {
    H.seed(seed); g.state = "TITLE"; H.tick(); H.startRace();
    while (g.raceTime < T) { g.player.invuln = 99; g.player.lives = 3; H.tick(); }
    const lanes = [-44.8, -22.4, 0, 22.4, 44.8];
    g.player.x = lanes[(seed + T) % 5];
    g.player.invuln = 0; g.player.lives = 3;
    g.rampageArmed = true; H.M.unleashRampage();
    while (g.player.rampage > 0) { g.player.lives = 3; H.tick(); }
    ends++;
    if (g.traffic.list.some((c) => !c.smashed && !c.oncoming && c.z > g.player.z && c.z < g.player.z + 45 && Math.abs(c.x - g.player.x) < 8.5)) laneCarLeft++;
    const l0 = g.player.lives;
    for (let i = 0; i < 60; i++) H.tick();
    if (g.player.lives < l0) crashes++;
  }
}
console.log(`${ends} rampage endings, holding the line: car left standing in your path ${laneCarLeft}x; crashed within 1 s ${crashes}x (${(crashes / ends * 100).toFixed(0)}%)`);
