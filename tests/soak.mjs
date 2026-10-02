// Long-run SOAK: drive every simulation system for 10 simulated minutes and
// assert nothing leaks, drifts to NaN, or escapes its bounds. Late-run glitches
// in an endless game live here — a leak or a NaN only shows after minutes, which
// is exactly what nobody play-tests.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // the repo root
const imp = (r) => import(pathToFileURL(path.join(ROOT, r)).href);

const { PHYS, RACE, SPAWN } = await imp("src/config.js");
const traffic = await imp("src/entities/traffic.js");
const cops = await imp("src/entities/cops.js");
const pickups = await imp("src/entities/pickups.js");
const scenery = await imp("src/scenery.js");
const road = await imp("src/road.js");
const { MAPS } = await imp("src/maps.js");

const map = MAPS.city, dt = 1 / 60;
const kmhToSpeed = (k) => PHYS.maxSpeed * (k / PHYS.topSpeedKmh);
function rampTarget(t) {
  const p1 = kmhToSpeed(PHYS.phase1Kmh), knee = kmhToSpeed(PHYS.kneeKmh);
  const a = PHYS.rampPhase1Seconds, b = a + PHYS.rampPhase2Seconds;
  const d3 = PHYS.rampPhase2Seconds / (PHYS.rampUpperRateFactor || 1), c = b + d3;
  if (t <= a) return PHYS.startSpeed + (p1 - PHYS.startSpeed) * (t / a);
  if (t <= b) return p1 + (knee - p1) * ((t - a) / PHYS.rampPhase2Seconds);
  if (t >= c) return PHYS.maxSpeed;
  return knee + (PHYS.maxSpeed - knee) * ((t - b) / d3);
}

const T = traffic.makeTrafficSystem({ rowGapZ: SPAWN.trafficRowGapCity });
const C = cops.makeCopsSystem();
const P = pickups.makePickupSystem();
const S = scenery.makeScenerySystem();

let z = 0, top = 0, raceTime = 0;
const peak = { traffic: 0, coins: 0, barrels: 0, pickups: 0, scenery: 0, helis: 0 };
const at = {};                       // array sizes sampled per minute
let nanHits = [];
const MINUTES = 10;

const bad = (v) => typeof v === "number" && !Number.isFinite(v);
function scanNaN(label, obj, depth = 0) {
  if (depth > 3 || obj == null) return;
  if (Array.isArray(obj)) { for (const o of obj) scanNaN(label, o, depth + 1); return; }
  if (typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    if (bad(v)) { if (nanHits.length < 12) nanHits.push(`${label}.${k} = ${v}`); }
    else if (v && typeof v === "object") scanNaN(label + "." + k, v, depth + 1);
  }
}

for (let i = 0; i < MINUTES * 60 * 60; i++) {
  raceTime = i * dt;
  const sp = rampTarget(raceTime);
  z += sp * dt;
  const kmh = Math.round((sp / PHYS.maxSpeed) * PHYS.topSpeedKmh);
  if (kmh > top) top = kmh;

  // Mirror main.js's density model so spacing is realistic across the whole run.
  const kneeF = Math.max(0, Math.min(1, (top - PHYS.kneeKmh) / (PHYS.topSpeedKmh - PHYS.kneeKmh)));
  const kneeRamp = top < PHYS.kneeKmh ? 1 : RACE.densityRampFrom + (RACE.densityRampToTop - RACE.densityRampFrom) * kneeF;
  const eff = Math.min(RACE.densityMax, kneeRamp);
  T.densityMul = eff;
  T.rowGapZ = SPAWN.trafficRowGapCity / eff;

  traffic.updateTraffic(T, dt, z, map, {}, 0, top >= RACE.oncomingFromKmh);
  cops.updateCops(C, dt, z, 0, sp, map, {});
  pickups.updatePickups(P, z, map, dt, top >= PHYS.kneeKmh);
  scenery.updateScenery(S, z, map, dt, SPAWN.sceneryPerMeter, sp / PHYS.maxSpeed);

  peak.traffic = Math.max(peak.traffic, T.list.length);
  peak.coins = Math.max(peak.coins, T.coins.length);

  peak.barrels = Math.max(peak.barrels, C.barrels.length);
  peak.pickups = Math.max(peak.pickups, P.list.length);
  peak.scenery = Math.max(peak.scenery, S.list.length);
  peak.helis = Math.max(peak.helis, C.helis.length);

  if (i % (60 * 60) === 0) {
    const m = i / 3600;
    at[m + "min"] = { traffic: T.list.length, coins: T.coins.length, 
                      barrels: C.barrels.length, pickups: P.list.length, scenery: S.list.length };
  }
}
scanNaN("traffic", T); scanNaN("cops", C); scanNaN("pickups", P); scanNaN("scenery", S);

console.log(`SOAK — ${MINUTES} simulated minutes (${MINUTES * 3600} ticks)\n`);
console.log("Array sizes per minute (must plateau, not climb):");
for (const [k, v] of Object.entries(at)) {
  console.log(`   ${k.padStart(6)}  traffic ${String(v.traffic).padStart(3)}  coins ${String(v.coins).padStart(3)}  barrels ${String(v.barrels).padStart(2)}  pickups ${String(v.pickups).padStart(2)}  scenery ${String(v.scenery).padStart(3)}`);
}
console.log("\nPeaks:", JSON.stringify(peak));
console.log(`Distance covered: ${Math.round(z)}   rows spawned: ${T.rowsSpawned}   passed: ${T.passedCount}`);

const results = [];
const add = (l, p, d = "") => results.push([l, p, d]);
// A leak shows as the last minute being far above the mid-run steady state.
const mins = Object.values(at);
const midT = mins[Math.floor(mins.length / 2)].traffic, endT = mins[mins.length - 1].traffic;
add("traffic list plateaus (no leak)", endT <= midT * 2 + 10, `mid ${midT} end ${endT}`);
const midS = mins[Math.floor(mins.length / 2)].scenery, endS = mins[mins.length - 1].scenery;
add("scenery list plateaus (no leak)", endS <= midS * 2 + 10, `mid ${midS} end ${endS}`);
add("coins list bounded", peak.coins < 200, "peak " + peak.coins);

add("barrels bounded", peak.barrels < 60, "peak " + peak.barrels);
add("pickups bounded", peak.pickups < 20, "peak " + peak.pickups);
add("helis never exceed 2", peak.helis <= 2, "peak " + peak.helis);
add("no NaN/Infinity anywhere in system state", nanHits.length === 0, nanHits.join(" | "));
add("distance is finite", Number.isFinite(z));

console.log("");
let ok = true;
for (const [l, p, d] of results) { if (!p) ok = false; console.log(`   ${p ? "PASS" : "FAIL"}  ${l}${p || !d ? "" : "  [" + d + "]"}`); }
console.log("\n" + (ok ? "=== SOAK CLEAN ===" : "=== SOAK FOUND PROBLEMS ==="));
process.exit(ok ? 0 : 1);
