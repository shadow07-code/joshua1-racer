// The opening: after GO, how long until the road asks anything of you?
const H = await import("../harness.mjs");
const { g } = H.M;
const { PHYS } = await import("../../src/config.js");
const buckets = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 30], [30, 44], [44, 60], [100, 120]];
const agg = buckets.map(() => ({ pass: 0, onScreen: 0, frames: 0 }));
let firstPass = [], firstBusy = [];
for (const seed of [1, 2, 3, 4, 5, 6]) {
  H.seed(seed); g.state = "TITLE"; H.tick(); H.startRace();
  let lastP = 0, fp = null, fb = null;
  while (g.raceTime < 120) {
    g.player.invuln = 99; g.player.lives = 3;
    H.tick();
    const t = g.raceTime;
    // cars within the near half of the screen (the part you actually weave through)
    const near = g.traffic.list.filter((c) => !c.smashed && c.z > g.player.z && c.z < g.player.z + 45).length;
    if (fb === null && near >= 2) fb = t;
    const d = g.traffic.passedCount - lastP; lastP = g.traffic.passedCount;
    if (d && fp === null) fp = t;
    buckets.forEach(([a, b], i) => { if (t >= a && t < b) { agg[i].pass += d; agg[i].onScreen += near; agg[i].frames++; } });
  }
  firstPass.push(fp); firstBusy.push(fb);
}
console.log("first car passed at:", firstPass.map((x) => x.toFixed(1) + "s").join(" "));
console.log("first time 2+ cars in the near half of the road:", firstBusy.map((x) => x.toFixed(1) + "s").join(" "));
for (const [i, [a, b]] of buckets.entries()) {
  const A = agg[i];
  console.log(`${String(a).padStart(3)}-${String(b).padEnd(3)}s  cars passed/s ${(A.pass / 6 / (b - a)).toFixed(2)}   avg cars in near half ${(A.onScreen / A.frames).toFixed(2)}`);
}
