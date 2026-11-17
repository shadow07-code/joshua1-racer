// Traffic lane changes, asserted against the real traffic module: ONE lane,
// eased in and out like a real driver, signalled until settled, and held while
// the player is alongside in the lane it wants (the mirror check).
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // the repo root
const imp = (r) => import(pathToFileURL(path.join(ROOT, r)).href);
{ let a = 20261117; Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let REC = [];
function makeCtx() {
  return { _f: "#000", globalAlpha: 1, imageSmoothingEnabled: false,
    set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; },
    fillRect(x, y, w, h) { REC.push({ x, y, w, h, c: this._f }); }, drawImage() {} };
}
function silent() { return { fillStyle: "", imageSmoothingEnabled: false, fillRect() {}, drawImage() {}, getContext: silent }; }
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => silent() }) };
let CLOCK = 1000;
globalThis.performance.now = () => CLOCK;

const { PHYS, PALETTE, RACE } = await imp("src/config.js");
const traffic = await imp("src/entities/traffic.js");
const { TRAFFIC_SKINS } = await imp("src/sprites.js");
const { MAPS } = await imp("src/maps.js");
const map = MAPS.city, ctx = makeCtx();
const R = [], add = (l, p, d = "") => R.push([l, !!p, d]);
const LANES = 5, half = map.roadHalfWidth, laneW = half * 2 / LANES;
const laneX = (i) => -half + laneW * (i + 0.5);
const dt = 1 / 60, SPEED = 20;

// One car on an otherwise empty road, cruising at the player's speed so the
// two hold station (dz stays put) unless a test moves the player.
function road(lane, dir, opts = {}) {
  const sys = traffic.makeTrafficSystem();
  sys.nextRowZ = 1e9;                                  // no spawning: only what we place
  const car = { skin: TRAFFIC_SKINS[0], z: 500, x: laneX(lane), laneIdx: lane, laneTo: lane + dir, lcT: 0,
    speed: SPEED, cruise: SPEED, passed: false, nearMissed: false, driftVx: 0,
    pendingDriftVx: dir * (opts.rate || 8), signalT: opts.signal ?? 0.5, sigPhase: 0, closingVx: 0 };
  sys.list = [car];
  return { sys, car };
}
function drive(sys, car, secs, player = null) {
  const xs = [];
  let pz = player ? player.z : car.z - 60;
  for (let i = 0; i < Math.round(secs * 60); i++) {
    pz += SPEED * dt;
    traffic.updateTraffic(sys, dt, pz, map, player ? { playerX: player.x } : {}, 0, false);
    if (player && player.track) player.z = pz;
    xs.push(car.x);
  }
  return xs;
}

// ══ A. ONE LANE, EASED, SIGNALLED ════════════════════════════════════════════
{
  const { sys, car } = road(1, +1, { rate: 8, signal: 0.5 });
  const x0 = car.x, target = laneX(2);
  const xs = drive(sys, car, 6);
  const moved = xs.map((x) => x - x0);
  const lead = Math.round(0.5 * 60);
  add("A1 nothing moves during the signal lead-in", moved.slice(0, lead - 1).every((m) => m === 0), moved.slice(0, lead).map((m) => m.toFixed(2)).join(","));
  add("A2 it ends EXACTLY on the next lane's centre", Math.abs(car.x - target) < 1e-6, `${car.x} vs ${target}`);
  add("A3 ...and never goes past it (one lane, no overshoot)", xs.every((x) => x <= target + 1e-6));
  add("A4 settled: indicator off, lane updated", car.driftVx === 0 && car.laneIdx === 2 && car.lcT === 0);
  const steps = xs.slice(1).map((x, i) => x - xs[i]).filter((s, i) => i >= lead - 1);
  const moving = steps.filter((s) => s > 1e-9);
  const dur = moving.length / 60, want = laneW / 8;
  add("A5 a change takes a lane width at the car's rate", Math.abs(dur - want) <= 2 / 60, `${dur.toFixed(3)} s vs ${want.toFixed(3)} s`);
  const peak = Math.max(...moving), avg = laneW / want / 60;
  add("A6 eased: it starts and ends gently...", moving[0] < avg * 0.1 && moving[moving.length - 1] < avg * 0.1,
    `first ${moving[0].toFixed(4)} last ${moving[moving.length - 1].toFixed(4)} avg ${avg.toFixed(4)}`);
  const iPeak = moving.indexOf(peak);
  add("A7 ...peaking mid-change, at a smoothstep's 1.5x the average", Math.abs(iPeak / moving.length - 0.5) < 0.1 && peak < avg * 1.55,
    `peak ${peak.toFixed(4)} at ${(iPeak / moving.length).toFixed(2)}`);
}

// ══ B. THE INDICATOR TRACKS THE CHANGE ═══════════════════════════════════════
{
  const { sys, car } = road(2, -1, { rate: 8, signal: 0.3 });
  const amber = (z) => { let lit = false; for (const t of [0, 280]) { CLOCK = t; REC = []; traffic.drawTraffic(ctx, sys, map, z, 0); if (REC.some((r) => r.c === PALETTE[5])) lit = true; } return lit; };
  let pz = car.z - 40;
  const step = (n) => { for (let i = 0; i < n; i++) { pz += SPEED * dt; traffic.updateTraffic(sys, dt, pz, map, {}, 0, false); } };
  const during = [];
  step(5); during.push(amber(pz));           // lead-in
  step(60); during.push(amber(pz));          // mid-change
  add("B1 the indicator blinks through the lead-in and the change", during.every(Boolean));
  step(400);
  add("B2 ...and goes off once the car has settled", car.driftVx === 0 && !amber(pz));
}

// ══ C. THE MIRROR CHECK ══════════════════════════════════════════════════════
{
  // You alongside, in the lane it wants: it holds, blinker on.
  let { sys, car } = road(1, +1, { signal: 1e-3 });
  const x0 = car.x;
  const you = { x: laneX(2), z: car.z, track: true };
  drive(sys, car, 4.0, you);                       // longer than a whole change takes
  add("C1 with you alongside in its target lane, it never leaves its own lane", car.x + TRAFFIC_SKINS[0].w / 2 <= x0 + laneW / 2,
    `moved ${(car.x - x0).toFixed(2)} px`);
  add("C2 ...it holds with the blinker still on", car.driftVx !== 0 && car.laneIdx === 1);
  // You pull away (traffic is always slower than you): it goes.
  you.track = false; you.z = car.z + 30;          // (past the mirror, still on screen)
  drive(sys, car, 6, you);
  add("C3 once you're past, it completes the change", Math.abs(car.x - laneX(2)) < 1e-6 && car.laneIdx === 2);

  // You alongside on the OTHER side, hugging its seam: none of its business.
  ({ sys, car } = road(1, +1, { signal: 1e-3 }));
  drive(sys, car, 6, { x: laneX(1) - 12, z: car.z, track: true });
  add("C4 you alongside on the far side don't stop it", Math.abs(car.x - laneX(2)) < 1e-6);

  // You well behind in the target lane: it still pulls in ahead of you, so a
  // signalling car stays a threat you have to plan for.
  ({ sys, car } = road(1, +1, { signal: 1e-3 }));
  const you2 = { x: laneX(2), z: car.z - 40, track: true };
  drive(sys, car, 4.0, you2);
  add("C5 you well behind don't stop it (cars still cut in ahead of you)", Math.abs(car.x - laneX(2)) < 1e-6, `at ${(car.x - laneX(1)).toFixed(3)} px`);

  // No player at all (probes, the reachability check): unchanged.
  ({ sys, car } = road(3, -1, { signal: 1e-3 }));
  drive(sys, car, 6);
  add("C6 with no player it simply changes lanes", Math.abs(car.x - laneX(2)) < 1e-6);

  // Another car alongside in the target lane: still waits (unchanged rule).
  ({ sys, car } = road(1, +1, { signal: 1e-3 }));
  sys.list.push({ skin: TRAFFIC_SKINS[0], z: car.z, x: laneX(2), laneIdx: 2, laneTo: 2, lcT: 0, speed: SPEED, cruise: SPEED,
    passed: false, nearMissed: false, driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0 });
  drive(sys, car, 2.0);
  add("C7 another car alongside still blocks it", car.laneIdx === 1 && car.x - laneX(1) < laneW / 2);
}

// ══ D. SPAWNED TRAFFIC ═══════════════════════════════════════════════════════
// Real rows from the real director, one row per call so each row's gap lane is
// known: no car signals off the road, no change is more than one lane, and no
// car beside the gap changes INTO it.
{
  const sys = traffic.makeTrafficSystem({ rowGapZ: 34 });
  sys.densityMul = 1.45;
  traffic.updateTraffic(sys, 0, 0, map, {}, 0, false);      // the first look ahead fills ~4 rows at once
  const seen = new Set(sys.list);
  let offRoad = 0, multi = 0, intoGap = 0, changers = 0, rows = 0;
  for (let pz = 1; rows < 600; pz += 1) {
    const before = sys.rowsSpawned;
    traffic.updateTraffic(sys, 0, pz, map, {}, 0, false);
    if (sys.rowsSpawned === before) continue;
    rows += sys.rowsSpawned - before;
    if (sys.rowsSpawned - before !== 1) { multi++; continue; }   // 1 m steps: rows are 31+ m apart
    const gap = sys.lastGapLane;
    for (const c of sys.list) {
      if (seen.has(c)) continue;
      seen.add(c);
      if (!c.pendingDriftVx || c.oncoming) continue;
      changers++;
      if (c.laneTo < 0 || c.laneTo >= LANES) offRoad++;
      if (Math.abs(c.laneTo - c.laneIdx) !== 1 || Math.sign(c.laneTo - c.laneIdx) !== Math.sign(c.pendingDriftVx)) multi++;
      if (c.laneTo === gap) intoGap++;
    }
  }
  add("D1 the director still spawns lane changers", changers > 50, `${changers}`);
  add("D2 none of them signals off the road", offRoad === 0, `${offRoad}`);
  add("D3 every change is exactly one lane, the way it signals", multi === 0, `${multi}`);
  add("D4 none changes into its row's open gap lane", intoGap === 0, `${intoGap}`);
}

console.log("");
let ok = true;
for (const [l, p, d] of R) { if (!p) ok = false; console.log(`   ${p ? "PASS" : "FAIL"}  ${l}${p || !d ? "" : "  [" + d + "]"}`); }
console.log("\n" + (ok ? "=== LANE CHANGES CLEAN ===" : "=== PROBLEMS ==="));
process.exit(ok ? 0 : 1);
