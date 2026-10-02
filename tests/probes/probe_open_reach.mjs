// Forward reachability through THE OPENING: real prepopulated traffic, the real
// speed ramp, the real speed-scaled steering rate (and a 70% handicapped one).
// If the set of x the player could still occupy ever empties, the road trapped them.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");   // the repo root
const imp = (r) => import(pathToFileURL(path.join(ROOT, r)).href);
const { PHYS, SPAWN } = await imp("src/config.js");
const traffic = await imp("src/entities/traffic.js");
const P = await imp("src/entities/player.js");
const { MAPS } = await imp("src/maps.js");
const map = MAPS.city, dt = 1 / 60, HIT = 0.85, LAT = 0.70, LONG = 0.34;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PW = PHYS.carHalfWidth, PH = PHYS.carHalfHeight * 0.5, BOUND = map.roadHalfWidth - PW;
const clampSet = (s) => s.map(([a, b]) => [Math.max(-BOUND, a), Math.min(BOUND, b)]).filter(([a, b]) => b > a);
function merge(s) { if (!s.length) return s; s.sort((p, q) => p[0] - q[0]); const o = [s[0].slice()]; for (let i = 1; i < s.length; i++) { const l = o[o.length - 1]; if (s[i][0] <= l[1]) l[1] = Math.max(l[1], s[i][1]); else o.push(s[i].slice()); } return o; }
function subtract(s, lo, hi) { const o = []; for (const [a, b] of s) { if (hi <= a || lo >= b) { o.push([a, b]); continue; } if (lo > a) o.push([a, lo]); if (hi < b) o.push([hi, b]); } return o.filter(([a, b]) => b > a); }
function reach(seed, handicap, secs = 30) {
  const saved = Math.random; Math.random = mulberry32(seed);
  try {
    const s = traffic.makeTrafficSystem({ rowGapZ: SPAWN.trafficRowGapCity });
    traffic.prepopulateTraffic(s, map, 500);
    const p = P.makePlayer();
    let set = [[-2, 2]], trapped = 0, minW = Infinity;       // starts in the centre
    for (let i = 0; i < secs * 60; i++) {
      P.updatePlayer(p, dt, { steer: 0 }, map, {});           // real speed ramp
      traffic.updateTraffic(s, dt, p.z, map, {}, 0, false);
      const rate = PHYS.steerSpeed * (1 - (1 - PHYS.steerSpeedFactor) * p.speed / PHYS.maxSpeed) * handicap;
      set = merge(clampSet(set.map(([a, b]) => [a - rate * dt, b + rate * dt])));
      for (const c of s.list) {
        if (c.smashed) continue;
        const hx = ((c.skin.w * c.skin.scale) / 2) * HIT * LAT, hz = ((c.skin.h * c.skin.scale) / 2) * HIT * LONG;
        if (Math.abs(c.z - p.z) < hz + PH) set = subtract(set, c.x - hx - PW, c.x + hx + PW);
      }
      if (!set.length) { trapped++; set = [[-BOUND, BOUND]]; }
      else minW = Math.min(minW, set.reduce((t, [a, b]) => t + (b - a), 0));
    }
    return { trapped, minW };
  } finally { Math.random = saved; }
}
for (const hc of [1, 0.7]) {
  let trapped = 0, minW = Infinity;
  for (let seed = 1; seed <= 40; seed++) { const r = reach(seed, hc); trapped += r.trapped; minW = Math.min(minW, r.minW); }
  console.log(`opening, 40 seeds x 30 s, steering at ${hc * 100}%: trapped frames ${trapped}, narrowest reachable width ${minW.toFixed(1)} px`);
}
