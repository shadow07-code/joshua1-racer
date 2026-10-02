import * as H from "../harness.mjs";
const { M } = H;
const { g, STATES } = M;
console.log("state at boot", g.state);
console.log("race started:", H.startRace(), g.state, "t=", g.raceTime.toFixed(2));
H.run(5);
console.log("after 5s: raceTime", g.raceTime.toFixed(2), "z", g.player.z.toFixed(1), "speed", g.player.speed.toFixed(1), "lives", g.player.lives, "traffic", g.traffic.list.length);
// Rampage smash test: arm a rampage and drop a car right on the player's nose.
g.player.rampage = 7; g.player.boost = 7;
const before = g.smashTotal, calls0 = H.audioCalls("sfxSmash").length;
const car = g.traffic.list.find(c => !c.smashed && !c.oncoming);
car.z = g.player.z + 2; car.x = g.player.x;
H.tick();
console.log("smashTotal", before, "->", g.smashTotal, "sfxSmash calls", H.audioCalls("sfxSmash").length - calls0, "smashFx", JSON.stringify(g.smashFx));
H.run(0.5);
console.log("after 0.5s smashFx left:", g.smashFx.length);
