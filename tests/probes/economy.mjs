// Measure what a clean run actually YIELDS now that RISK GATES are gone.
//
// Gates paid RACE.gateCoins (25) each at roughly one per 15s, and they also
// SUPPRESSED the coin trail on their own row. Removing them cuts a coin source
// and adds back some trails, and the net was never measured — which matters
// because the garage ladder (150 → 3500) and the daily's COLLECT N COINS tiers
// (70/110/160) were both calibrated while gates existed.
//
// Player model: steers toward the nearest uncollected coin ahead. Coin trails
// spawn down the GAP LANE by construction, so a coin-seeking driver is also
// driving the ideal survival line — this is a good-player upper bound, which is
// the right bar for a daily target.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");   // the repo root
const imp = (r) => import(pathToFileURL(path.join(ROOT, r)).href);
const { PHYS, RACE, SPAWN, SCORE, DAILY } = await imp("src/config.js");
const traffic = await imp("src/entities/traffic.js");
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
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const BOUND = map.roadHalfWidth - PHYS.carHalfWidth;

function run(seconds, seed) {
  const saved = Math.random; Math.random = mulberry32(seed);
  try {
    const T = traffic.makeTrafficSystem({ rowGapZ: SPAWN.trafficRowGapCity });
    let z = 0, x = 0, top = 0, coins = 0, eventCoins = 0, eventScore = 0, trailsSpawned = 0;
    let seenCoinZ = new Set();

    for (let i = 0; i < seconds * 60; i++) {
      const t = i * dt;
      const sp = rampTarget(t);
      z += sp * dt;
      const kmh = Math.round((sp / PHYS.maxSpeed) * PHYS.topSpeedKmh);
      if (kmh > top) top = kmh;

      const kneeF = Math.max(0, Math.min(1, (top - PHYS.kneeKmh) / (PHYS.topSpeedKmh - PHYS.kneeKmh)));
      const kneeRamp = top < PHYS.kneeKmh ? 1 : RACE.densityRampFrom + (RACE.densityRampToTop - RACE.densityRampFrom) * kneeF;
      const eff = Math.min(RACE.densityMax, kneeRamp);
      T.densityMul = eff;
      T.rowGapZ = SPAWN.trafficRowGapCity / eff;

      traffic.updateTraffic(T, dt, z, map, { playerX: x }, 0, top >= RACE.oncomingFromKmh);

      // Count distinct trails that appeared (for a spawn-rate figure).
      for (const c of T.coins) { const k = Math.round(c.z * 10); if (!seenCoinZ.has(k)) { seenCoinZ.add(k); trailsSpawned++; } }

      // Steer toward the nearest uncollected coin ahead.
      let target = null, bestD = Infinity;
      for (const c of T.coins) {
        if (c.got) continue;
        const d = c.z - z;
        if (d < -2 || d > 120) continue;
        if (d < bestD) { bestD = d; target = c; }
      }
      if (target) {
        const rate = PHYS.steerSpeed * PHYS.steerSpeedFactor * dt;
        const dx = target.x - x;
        x += Math.max(-rate, Math.min(rate, dx));
      }
      x = Math.max(-BOUND, Math.min(BOUND, x));

      const box = { x1: x - PHYS.carHalfWidth, x2: x + PHYS.carHalfWidth,
                    z1: z - PHYS.carHalfHeight * 0.5, z2: z + PHYS.carHalfHeight * 0.5 };
      coins += traffic.checkCoinGrab(T, box) || 0;
    }
    return { coins, eventCoins, eventScore, distance: Math.round(z), passed: T.passedCount,
             rows: T.rowsSpawned, trailCoinsSpawned: trailsSpawned, top };
  } finally { Math.random = saved; }
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
function avg(secs) {
  const acc = { coins: 0, eventCoins: 0, eventScore: 0, distance: 0, passed: 0, rows: 0, trailCoinsSpawned: 0 };
  for (const s of SEEDS) { const r = run(secs, s); for (const k of Object.keys(acc)) acc[k] += r[k]; }
  for (const k of Object.keys(acc)) acc[k] = Math.round(acc[k] / SEEDS.length);
  return acc;
}

console.log("CLEAN-RUN YIELD after gate removal (avg of 10 seeds, coin-seeking driver)\n");
console.log("   run    coins  +event  TOTAL   distance  passed   rows   trail-coins-spawned");
const rows = {};
for (const secs of [60, 90, 120, 150, 180]) {
  const a = avg(secs);
  rows[secs] = a;
  const total = a.coins + a.eventCoins;
  console.log(`   ${String(secs).padStart(4)}s  ${String(a.coins).padStart(6)}  ${String(a.eventCoins).padStart(6)}  ${String(total).padStart(5)}   ${String(a.distance).padStart(7)}  ${String(a.passed).padStart(6)}  ${String(a.rows).padStart(5)}   ${a.trailCoinsSpawned}`);
}

const two = rows[120];
const twoTotal = two.coins + two.eventCoins;
// What gates used to add: ~1 per 15s of non-event road x RACE.gateCoins (25).
const OLD_GATE_COINS = 25, OLD_GATE_RATE_S = 15;
const gatesPer2min = 120 / OLD_GATE_RATE_S;
const oldGateCoins = Math.round(gatesPer2min * OLD_GATE_COINS);

console.log(`\n── The gate-removal delta, for a 2-minute run ──`);
console.log(`   coins now (trails + events):        ${twoTotal}`);
console.log(`   gates used to add (~${gatesPer2min} x ${OLD_GATE_COINS}):        +${oldGateCoins}  (if every gate was threaded)`);
console.log(`   so a good run lost up to:           ~${oldGateCoins} coins  (~${Math.round(oldGateCoins / (twoTotal + oldGateCoins) * 100)}% of its income)`);

console.log(`\n── Against the DAILY 'COLLECT N COINS' tiers ──`);
for (const target of [70, 110, 160]) {
  const runsNow = (target / twoTotal).toFixed(1);
  const runsBefore = (target / (twoTotal + oldGateCoins)).toFixed(1);
  console.log(`   ${String(target).padStart(3)} coins:  ${String(runsNow).padStart(4)} runs now   (was ~${runsBefore} with gates)`);
}

console.log(`\n── Against the GARAGE ladder ──`);
let cum = 0;
for (const [name, price] of [["MIDNIGHT", 150], ["JADE", 400], ["PHANTOM", 900], ["SUNBURST", 1800], ["CHROME", 3500]]) {
  console.log(`   ${name.padEnd(9)} ${String(price).padStart(4)}  →  ${(price / twoTotal).toFixed(1).padStart(5)} two-minute runs now   (was ${(price / (twoTotal + oldGateCoins)).toFixed(1)})`);
}
console.log(`\n   Daily completion pays ${DAILY.baseCoins}-${DAILY.baseCoins + DAILY.streakBonus * DAILY.streakBonusCap} on top.`);
