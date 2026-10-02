// Crash-heavy run: sit in the centre lane and eat every car. Count frames where
// two live same-direction cars' sprites overlap. Compare knocks on vs off.
const H = await import("../harness.mjs");
const { g } = H.M;
const off = process.argv[2] === "off";
const T = await import("../../src/entities/traffic.js");
let overlapFrames = 0, frames = 0, crashes = 0;
for (const seed of [1, 2, 3, 4, 5]) {
  H.seed(seed); g.state = "TITLE"; H.tick(); H.startRace();
  while (g.raceTime < 90) {
    g.player.lives = 3;
    if (off) for (const c of g.traffic.list) c.knock = 0;
    const l0 = g.player.lives;
    H.tick();
    if (g.player.lives < 3) crashes++;
    frames++;
    const live = g.traffic.list.filter((c) => !c.smashed && !c.oncoming);
    let bad = false;
    for (let i = 0; i < live.length && !bad; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (Math.abs(a.x - b.x) < (a.skin.w + b.skin.w) / 2 && Math.abs(a.z - b.z) < (a.skin.h + b.skin.h) / 2 * 0.95 / 2.35) { bad = true; break; }
    }
    if (bad) overlapFrames++;
  }
}
console.log(`${off ? "knocks OFF" : "knocks ON "}: crashes ${crashes}, frames with overlapping cars ${overlapFrames}/${frames}`);
