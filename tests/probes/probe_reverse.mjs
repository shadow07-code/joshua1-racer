// Two-thumb reversal on the half-screen touch zones, in the real game: hold the
// LEFT half, then land the RIGHT thumb and lift the left one `overlap` ms later.
// How long from the right thumb landing until the car has moved 3 px rightward
// from where it was, and what does steer read during the overlap?
const H = await import("../harness.mjs");
const { g } = H.M;
const c = document.getElementById("game");
const fire = (type, id, x) => { const ev = { changedTouches: [{ identifier: id, clientX: x, clientY: 600 }], preventDefault() {} }; for (const fn of c._l[type] || []) fn(ev); };
const { getInput } = await import("../../src/input.js");
H.seed(3); g.state = "TITLE"; H.tick(); H.startRace();
for (let i = 0; i < 900; i++) { g.player.invuln = 99; g.player.lives = 3; H.tick(); }
g.traffic.list = []; g.traffic.nextRowZ = g.player.z + 1e6; g.traffic.nextOncomingZ = g.player.z + 1e6;
for (const overlap of [0, 50, 100, 150]) {
  g.player.x = 10; g.player.steerEased = 0;
  fire("touchstart", 1, 90);                    // left thumb down
  for (let i = 0; i < 20; i++) H.tick();        // steering left at full rate
  const xAt = g.player.x;
  fire("touchstart", 2, 290);                   // right thumb lands
  const steerDuring = getInput().steer;
  let t = 0, liftedAt = null, reached = null;
  for (let f = 1; f <= 60 && reached === null; f++) {
    if (liftedAt === null && f * 16.67 >= overlap) { fire("touchend", 1, 90); liftedAt = f; }
    H.tick(); t = f * 16.67;
    if (g.player.x >= xAt + 3) reached = t;
  }
  fire("touchend", 1, 90); fire("touchend", 2, 290);
  console.log(`overlap ${String(overlap).padStart(3)} ms: steer while both down = ${steerDuring}; car 3 px back rightward after ${reached.toFixed(0)} ms`);
}
