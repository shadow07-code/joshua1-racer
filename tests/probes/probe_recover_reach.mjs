// Forward reachability with a crash-recovery pull every 7 s (as takeHit does),
// at mid and peak density. If the reachable set ever empties, the road trapped them.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");   // the repo root
const imp = (r) => import(pathToFileURL(path.join(ROOT, r)).href);
const { PHYS, SPAWN, RACE } = await imp("src/config.js");
const traffic = await imp("src/entities/traffic.js");
const { MAPS } = await imp("src/maps.js");
const map = MAPS.city, dt = 1 / 60, HIT = 0.85, LAT = 0.70, LONG = 0.34;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PW = PHYS.carHalfWidth, PH = PHYS.carHalfHeight * 0.5, BOUND = map.roadHalfWidth - PW;
const clampSet = (s) => s.map(([a, b]) => [Math.max(-BOUND, a), Math.min(BOUND, b)]).filter(([a, b]) => b > a);
function merge(s) { if (!s.length) return s; s.sort((p, q) => p[0] - q[0]); const o = [s[0].slice()]; for (let i = 1; i < s.length; i++) { const l = o[o.length - 1]; if (s[i][0] <= l[1]) l[1] = Math.max(l[1], s[i][1]); else o.push(s[i].slice()); } return o; }
function subtract(s, lo, hi) { const o = []; for (const [a, b] of s) { if (hi <= a || lo >= b) { o.push([a, b]); continue; } if (lo > a) o.push([a, lo]); if (hi < b) o.push([hi, b]); } return o.filter(([a, b]) => b > a); }
let total = 0, pulls = 0;
for (const density of [1.45, 1.9]) for (const hc of [1, 0.7]) {
  let trapped = 0;
  for (let seed = 1; seed <= 12; seed++) {
    Math.random = mulberry32(seed);
    const s = traffic.makeTrafficSystem({ rowGapZ: SPAWN.trafficRowGapCity });
    s.densityMul = density; s.rowGapZ = SPAWN.trafficRowGapCity / density;
    const rate = PHYS.steerSpeed * PHYS.steerSpeedFactor * hc;
    let z = 0, set = [[-BOUND, BOUND]];
    for (let i = 0; i < 150 * 60; i++) {
      z += PHYS.maxSpeed * dt;
      if (i % (7 * 60) === 0 && i > 0) { traffic.pullSpawnToHorizon(s, z); s.phrase = { type: "breather", left: RACE.crashBreatherRows, dir: 1 }; pulls++; }
      traffic.updateTraffic(s, dt, z, map, {}, 0, true);
      set = merge(clampSet(set.map(([a, b]) => [a - rate * dt, b + rate * dt])));
      for (const c of s.list) {
        if (c.smashed) continue;
        const hx = ((c.skin.w * c.skin.scale) / 2) * HIT * LAT, hz = ((c.skin.h * c.skin.scale) / 2) * HIT * LONG;
        if (Math.abs(c.z - z) < hz + PH) set = subtract(set, c.x - hx - PW, c.x + hx + PW);
      }
      if (!set.length) { trapped++; set = [[-BOUND, BOUND]]; }
    }
  }
  total += trapped;
  console.log(`density ${density}, steering ${hc * 100}%: trapped frames ${trapped}`);
}
console.log(`${pulls} recovery pulls exercised; total trapped ${total}`);
