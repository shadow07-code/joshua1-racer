// Rear-end one car on an otherwise EMPTY road; does anything get awarded for it?
const H = await import("../harness.mjs");
const { g } = H.M;
let awarded = 0, trials = 0, perfects = 0;
for (const seed of [1, 2, 3, 4, 5, 6]) {
  H.seed(seed); g.state = "TITLE"; H.tick(); H.startRace(); H.run(12);
  for (let k = 0; k < 8; k++) {
    const car = g.traffic.list.find((c) => !c.smashed && !c.oncoming);
    g.traffic.list = [car]; g.traffic.coins = [];
    g.traffic.nextRowZ = g.player.z + 1e6; g.traffic.nextOncomingZ = g.player.z + 1e6;
    Object.assign(car, { z: g.player.z + 1, x: g.player.x + 3, nearMissed: false, minDx: null, passed: false, smashed: false });
    g.player.invuln = 0; g.player.lives = 3;
    H.tick();                                   // crash frame (resets the combo)
    trials++;
    const c0 = H.audioCalls("sfxCombo").length + H.audioCalls("sfxPickup").length, p0 = H.audioCalls("sfxPerfect").length;
    H.run(2);
    if (H.audioCalls("sfxCombo").length + H.audioCalls("sfxPickup").length > c0 || g.combo > 0) awarded++;
    perfects += H.audioCalls("sfxPerfect").length - p0;
  }
}
console.log(`crashed-into car ALSO scored as a near miss: ${awarded}/${trials}`);
console.log(`PERFECT! pops after those crashes: ${perfects}`);
