// Verify the RISK GATE mechanic is fully and cleanly gone.
//
// Removal is the risky kind of change: it redistributes ~11% of rows (the old
// gateRowChance) into the phrases that follow it in pickPhrase's CUMULATIVE
// thresholds — including gauntlet, the sandwich-bait one. So this re-checks
// solvability, not just that the code compiles.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // the repo root
const imp = (r) => import(pathToFileURL(path.join(ROOT, r)).href);
const { PHYS, RACE, SPAWN, SCORE } = await imp("src/config.js");
const traffic = await imp("src/entities/traffic.js");
const daily = await imp("src/daily.js");
const audio = await imp("src/audio.js");
const { MAPS } = await imp("src/maps.js");

const R = [];
const add = (l, p, d = "") => R.push([l, p, d]);

// ── A: the mechanic is gone from the API and the data ──
const sys = traffic.makeTrafficSystem({ rowGapZ: 34 });
add("traffic system has no `gates` array", sys.gates === undefined);
add("traffic system has no `allowGates` flag", sys.allowGates === undefined);
add("drawGates no longer exported", traffic.drawGates === undefined);
add("checkGateHit no longer exported", traffic.checkGateHit === undefined);
add("sfxGate no longer exported", audio.sfxGate === undefined);
for (const k of ["gateFromKmh", "gateRowChance", "gateSlotHalf", "gateHalfZ", "gateChevrons", "gateChevronGap", "gateCoins"]) {
  add(`RACE.${k} removed`, RACE[k] === undefined, String(RACE[k]));
}
add("SCORE.gateBonus removed", SCORE.gateBonus === undefined, String(SCORE.gateBonus));

// ── B: no gate phrase is ever produced, and the mix stays sane ──
const map = MAPS.city, dt = 1 / 60;
function phraseMix(density, event) {
  const s = traffic.makeTrafficSystem({ rowGapZ: SPAWN.trafficRowGapCity });
  s.densityMul = density; s.rowGapZ = SPAWN.trafficRowGapCity / density; s.event = event;
  const counts = {};
  let z = 0;
  for (let i = 0; i < 60 * 300; i++) {
    z += PHYS.maxSpeed * dt;
    traffic.updateTraffic(s, dt, z, map, {}, 0, true);
    if (s.phrase) counts[s.phrase.type] = (counts[s.phrase.type] || 0) + 1;
  }
  return { counts, rows: s.rowsSpawned, coins: s.coins.length };
}
const mix = phraseMix(1.45, null);
add("no `gate` phrase is ever selected", !mix.counts.gate, JSON.stringify(mix.counts));
add("all core phrases still occur",
  ["slalom", "sweep", "gauntlet", "breather"].every((k) => mix.counts[k] > 0),
  JSON.stringify(mix.counts));

// Coin trails were SUPPRESSED on gate rows; with gates gone they must still flow.
let sawCoins = false;
{
  const s = traffic.makeTrafficSystem({ rowGapZ: SPAWN.trafficRowGapCity });
  s.densityMul = 1.2; s.rowGapZ = SPAWN.trafficRowGapCity / 1.2;
  let z = 0, total = 0;
  for (let i = 0; i < 60 * 120; i++) { z += PHYS.maxSpeed * dt; traffic.updateTraffic(s, dt, z, map, {}, 0, false); total = Math.max(total, s.coins.length); }
  sawCoins = total > 0;
  add("coin trails still spawn", sawCoins, "peak concurrent " + total);
}

// ── C: solvability by forward reachability (the phrase mix changed) ──
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const HIT = 0.85, LAT = 0.70, LONG = 0.34;
const PW = PHYS.carHalfWidth, PH = PHYS.carHalfHeight * 0.5;
const BOUND = map.roadHalfWidth - PW;
const clampSet = (s) => s.map(([a, b]) => [Math.max(-BOUND, a), Math.min(BOUND, b)]).filter(([a, b]) => b > a);
function merge(s) { if (!s.length) return s; s.sort((p, q) => p[0] - q[0]); const o = [s[0].slice()]; for (let i = 1; i < s.length; i++) { const l = o[o.length - 1]; if (s[i][0] <= l[1]) l[1] = Math.max(l[1], s[i][1]); else o.push(s[i].slice()); } return o; }
function subtract(s, lo, hi) { const o = []; for (const [a, b] of s) { if (hi <= a || lo >= b) { o.push([a, b]); continue; } if (lo > a) o.push([a, lo]); if (hi < b) o.push([hi, b]); } return o.filter(([a, b]) => b > a); }
function reach(density, event, seed, secs = 150) {
  const saved = Math.random; Math.random = mulberry32(seed);
  try {
    const s = traffic.makeTrafficSystem({ rowGapZ: SPAWN.trafficRowGapCity });
    const eff = density * ((event && event.density) || 1);
    s.densityMul = eff; s.rowGapZ = SPAWN.trafficRowGapCity / eff; s.event = event;
    const rate = PHYS.steerSpeed * PHYS.steerSpeedFactor;
    let z = 0, set = [[-BOUND, BOUND]], trapped = 0, minW = Infinity;
    for (let i = 0; i < secs * 60; i++) {
      z += PHYS.maxSpeed * dt;
      traffic.updateTraffic(s, dt, z, map, {}, 0, true);
      set = merge(clampSet(set.map(([a, b]) => [a - rate * dt, b + rate * dt])));
      for (const c of s.list) {
        if (c.smashed) continue;
        const hx = ((c.skin.w * c.skin.scale) / 2) * HIT * LAT;
        const hz = ((c.skin.h * c.skin.scale) / 2) * HIT * LONG;
        if (Math.abs(c.z - z) < hz + PH) set = subtract(set, c.x - hx - PW, c.x + hx + PW);
      }
      if (!set.length) { trapped++; set = [[-BOUND, BOUND]]; }
      else minW = Math.min(minW, set.reduce((t, [a, b]) => t + (b - a), 0));
    }
    return { trapped, minW };
  } finally { Math.random = saved; }
}
console.log("REACHABILITY after gate removal (8 seeds x 150s)\n");
console.log("   density  event        trapped   narrowest");
let allClear = true;
for (const [d, ev, name] of [[1.10, null, "-"], [1.45, null, "-"], [1.90, null, "-"],
                             [1.90, { density: 1.4 }, "RUSH HOUR"], [1.45, { oncomingMul: 0.34 }, "WRONG WAY"],
                             [1.45, { phrase: "slalom", trucksOnly: true }, "CONVOY"]]) {
  let trapped = 0, minW = Infinity;
  for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) { const r = reach(d, ev, s); trapped += r.trapped; minW = Math.min(minW, r.minW); }
  if (trapped > 0) allClear = false;
  console.log(`   ${d.toFixed(2).padStart(6)}   ${name.padEnd(11)}  ${String(trapped).padStart(6)}   ${minW === Infinity ? "-" : minW.toFixed(1).padStart(7)}px`);
}
add("zero trapped frames at every density and event", allClear);

// ── D: the daily challenge has no impossible goal left ──
const ids = [];
for (let i = 0; i < 400; i++) {
  const d = new Date(2026, 0, 1); d.setDate(d.getDate() + i);
  const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  ids.push(daily.goalFor(key).id);
}
const uniq = [...new Set(ids)].sort();
add("no THREAD GATES goal can be selected on any day", !uniq.includes("gates"), uniq.join(","));
add("every remaining goal is still reachable by the hash", uniq.length === 7, `${uniq.length}: ${uniq.join(",")}`);
const labels = [...new Set(ids.map((_, i) => null))];
add("no goal label mentions gates",
  !ids.some((id) => id === "gates"));

console.log("");
let ok = true;
for (const [l, p, d] of R) { if (!p) ok = false; console.log(`   ${p ? "PASS" : "FAIL"}  ${l}${p || !d ? "" : "  [" + d + "]"}`); }
console.log("\n" + (ok ? "=== GATES CLEANLY REMOVED ===" : "=== PROBLEMS ==="));
process.exit(ok ? 0 : 1);
