const P = await import("../../src/entities/player.js");
const { PHYS } = await import("../../src/config.js");
const { MAPS } = await import("../../src/maps.js");
const map = MAPS.city, dt = 1 / 60, laneW = map.roadHalfWidth * 2 / 5;
function sim(kmh, pressFrames, totalFrames, dir = 1) {
  const p = P.makePlayer(); p.raceTime = 999; p.speed = PHYS.maxSpeed * kmh / 200;
  const xs = [];
  for (let i = 0; i < totalFrames; i++) {
    P.updatePlayer(p, dt, { steer: i < pressFrames ? dir : 0 }, map, {});
    p.speed = PHYS.maxSpeed * kmh / 200;   // hold speed constant for the probe
    xs.push(p.x);
  }
  return xs;
}
console.log("lane width", laneW.toFixed(1), "px; player half-width", PHYS.carHalfWidth);
for (const kmh of [100, 150, 200]) {
  const hold = sim(kmh, 120, 120);
  const lane = hold.findIndex((x) => x >= laneW) + 1;
  const first2 = hold.findIndex((x) => x >= 2) + 1;
  const tap6 = sim(kmh, 6, 60), tap3 = sim(kmh, 3, 60);
  // stopping: hold 30 frames then release — how far does it keep sliding?
  const rel = sim(kmh, 30, 60);
  console.log(`${kmh} km/h: first 2px after ${(first2 * 16.7).toFixed(0)} ms | one lane in ${(lane * 16.7).toFixed(0)} ms | 100ms tap moves ${tap6[59].toFixed(1)} px, 50ms tap ${tap3[59].toFixed(1)} px | coast after release ${(rel[59] - rel[29]).toFixed(2)} px`);
}
