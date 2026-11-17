import * as H from "../harness.mjs";
const { M } = H;
const { g, STATES } = M;
console.log("state at boot", g.state);
console.log("race started:", H.startRace(), g.state, "t=", g.raceTime.toFixed(2));
H.run(5);
console.log("after 5s: raceTime", g.raceTime.toFixed(2), "z", g.player.z.toFixed(1), "speed", g.player.speed.toFixed(1), "lives", g.player.lives, "traffic", g.traffic.list.length);
// Nitrous: fire one and watch the speed climb past the normal top speed.
g.nitroArmed = true; M.fireNitro();
const v0 = g.player.speed;
g.player.invuln = 99; H.run(3); g.player.invuln = 0;
console.log("nitrous: speed", v0.toFixed(1), "->", g.player.speed.toFixed(1), "boost left", g.player.boost.toFixed(2), "lives", g.player.lives);
