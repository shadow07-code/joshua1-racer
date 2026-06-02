// Continuous civilian traffic — the player weaves around it.
//
// Spawning is ROW-BASED: each row is a wave of cars across the 5 lanes with one
// designated GAP LANE that's always empty. Adjacent rows' gap lanes shift by at
// most ±1 lane, so the player can ALWAYS thread through with steering alone.
// Rarely (~5%) a "tough row" shifts the gap by 2, forcing the player to brake
// to find the gap.
import { PHYS, RACE } from "../config.js";
import { project } from "../road.js";
import { drawSpriteNN, groundShadow } from "../render.js";
import { TRAFFIC_SKINS } from "../sprites.js";

const LANES = 5;

// Drawn (and collision) half-sizes derived from the sprite size × its scale.
function skinHalfX(skin) { return skin.w * skin.scale / 2; }
function skinHalfZ(skin) { return skin.h * skin.scale / 2; }

export function makeTrafficSystem(opts = {}) {
  return {
    list: [],
    nextRowZ: 80,
    lastGapLane: 2,              // start with center lane open
    rowGapZ: opts.rowGapZ || 34, // distance between rows in world meters
    passedCount: 0,
    rowsSpawned: 0,
  };
}

function laneToX(laneIdx, halfRoad) {
  const laneW = (halfRoad * 2) / LANES;
  return -halfRoad + laneW * (laneIdx + 0.5);
}

function pickSkin() {
  return TRAFFIC_SKINS[Math.floor(Math.random() * TRAFFIC_SKINS.length)];
}

// Generate one row of cars at sys.nextRowZ, leaving a gap lane the player can use.
function spawnRow(sys, map) {
  // Decide the gap-lane shift from the previous row.
  const r = Math.random();
  let shift;
  if (r < 0.05) {
    // Rare "tough row" — gap moves by 2 lanes, requiring a brake to reach.
    shift = Math.random() < 0.5 ? -2 : 2;
  } else if (r < 0.35) {
    shift = -1;
  } else if (r < 0.65) {
    shift = 0;
  } else {
    shift = 1;
  }
  let gap = sys.lastGapLane + shift;
  // Clamp into [0, LANES-1] — if clamped, the player still finds a gap, just on an edge.
  if (gap < 0) gap = 0;
  if (gap >= LANES) gap = LANES - 1;
  sys.lastGapLane = gap;

  // Optionally widen the gap to 2 adjacent lanes early in the race so it's gentle.
  // (Player has time to learn before density rises.)
  const wide = sys.rowsSpawned < 4;
  const gap2 = wide
    ? (gap + (Math.random() < 0.5 ? -1 : 1))
    : -99;

  // How many non-gap lanes to fill — usually 2-3 cars per row (out of 4 candidates).
  const candidateLanes = [];
  for (let i = 0; i < LANES; i++) {
    if (i === gap) continue;
    if (i === gap2) continue;
    candidateLanes.push(i);
  }
  // Shuffle.
  for (let i = candidateLanes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidateLanes[i], candidateLanes[j]] = [candidateLanes[j], candidateLanes[i]];
  }
  // Always exactly 1 car per row — keeps the road breathable and never wall-like.
  // Combined with the wide row spacing this gives plenty of room to weave.
  const carsInRow = 1;
  const lanesToFill = candidateLanes.slice(0, Math.min(carsInRow, candidateLanes.length));

  for (const lane of lanesToFill) {
    const skin = pickSkin();
    const x = laneToX(lane, map.roadHalfWidth);
    const jitter = (Math.random() - 0.5) * 4; // small z stagger inside a row
    const speed = PHYS.cruiseSpeed * (skin.speedMul + (Math.random() * 0.08 - 0.02));
    sys.list.push({
      skin,
      z: sys.nextRowZ + jitter,
      x,
      targetX: x,            // lane-change target — same lane initially
      laneIdx: lane,
      speed,
      passed: false,
      nearMissed: false,
      driftPhase: Math.random() * Math.PI * 2,
      // Slow occasional lane changes start after a random delay so cars don't all swap at once.
      laneChangeTimer: 4 + Math.random() * 9,
    });
  }

  // Advance to next row position with a small spacing jitter.
  sys.nextRowZ += sys.rowGapZ + (Math.random() * 6 - 3);
  sys.rowsSpawned++;
}

// Initial wave so the road is busy at race start. Does NOT mark anything as passed.
export function prepopulateTraffic(sys, map, distance = 600) {
  while (sys.nextRowZ < distance) {
    spawnRow(sys, map);
  }
}

export function updateTraffic(sys, dt, playerZ, map, cbs) {
  // Spawn ahead so the road is always populated up to ~220m ahead.
  const ahead = playerZ + 220;
  while (sys.nextRowZ < ahead) {
    spawnRow(sys, map);
  }

  const halfRoad = map.roadHalfWidth;
  for (const c of sys.list) {
    c.z += c.speed * dt;
    c.driftPhase += dt * 1.2;

    // ── Lane change ──
    // Bikes weave far more often and more sharply than cars; cars amble between
    // lanes. New targets avoid merging into an already-occupied space (a driver
    // checking their blind spot) — but rarely they don't, and a bump can result.
    const isBike = !!c.skin.bike;
    c.laneChangeTimer -= dt;
    if (c.laneChangeTimer <= 0) {
      c.laneChangeTimer = isBike ? (2.5 + Math.random() * 3.5) : (8 + Math.random() * 8);
      const chance = isBike ? Math.min(0.95, RACE.trafficSidewaysChance + 0.25) : RACE.trafficSidewaysChance;
      if (Math.random() < chance) {
        const mag = isBike ? (12 + Math.random() * 18) : (10 + Math.random() * 14);
        const newX = Math.max(-(halfRoad - 6), Math.min(halfRoad - 6, c.x + (Math.random() < 0.5 ? -1 : 1) * mag));
        const blocked = sys.list.some(o =>
          o !== c && Math.abs(o.z - c.z) < 14 &&
          Math.abs(o.x - newX) < skinHalfX(o.skin) + skinHalfX(c.skin) + 3);
        if (!blocked || Math.random() < 0.07) c.targetX = newX;   // 7% ignore → may bump
      }
    }
    const laneSpeed = isBike ? 13 : 5; // px/sec — bikes flick across, cars ease
    const dx = c.targetX - c.x;
    if (Math.abs(dx) > 0.3) {
      c.x += Math.sign(dx) * Math.min(Math.abs(dx), laneSpeed * dt);
    }

    if (!c.passed && c.z < playerZ - 4) {
      c.passed = true;
      sys.passedCount++;
      cbs?.onPassed?.();
    }
    if (!c.nearMissed && c.passed && Math.abs(c.z - playerZ) < 18) {
      const closenessPx = Math.abs(c.x - (cbs?.playerX ?? 0));
      if (closenessPx < 18) {
        c.nearMissed = true;
        cbs?.onNearMiss?.();
      }
    }
  }

  // Keep traffic from stacking: cars follow (slow for) the car ahead in their
  // lane and never overlap it — except for a rare bump.
  resolveTrafficSeparation(sys, dt);

  sys.list = sys.list.filter(c => c.z > playerZ - 30);
}

// Traffic-vs-traffic separation. Cars overlapping laterally keep a minimum
// longitudinal gap from the car ahead and match its speed (car-following), so
// they never stack. A small random chance lets a follower briefly fail and bump.
function resolveTrafficSeparation(sys, dt) {
  const cars = sys.list;
  cars.sort((a, b) => a.z - b.z);   // rear → front
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const o = cars[j];
      const gap = o.z - c.z;
      if (gap > 45) break;                                  // nothing close ahead
      const latClear = skinHalfX(c.skin) + skinHalfX(o.skin) + 1.5;
      if (Math.abs(o.x - c.x) >= latClear) continue;        // different lane — ignore
      const minGap = (skinHalfZ(c.skin) + skinHalfZ(o.skin)) * 0.95;
      if (gap < minGap) {
        if (c.bumpT == null) c.bumpT = 0;
        if (c.bumpT <= 0 && Math.random() < 0.0008) c.bumpT = 0.4;  // rare bump window
        if (c.bumpT > 0) {
          c.bumpT -= dt;                                    // allow brief contact
        } else {
          c.z = o.z - minGap;                               // no stacking
          if (c.speed > o.speed) c.speed = o.speed;         // ease off behind it
        }
      }
      break;                                                // only the nearest matters
    }
  }
}

export function drawTraffic(ctx, sys, map, playerZ, playerX) {
  const drawList = sys.list.slice().sort((a, b) => b.z - a.z);
  for (const c of drawList) {
    const p = project(map, playerZ, playerX, c);
    if (!p) continue;
    const hx = skinHalfX(c.skin), hz = skinHalfZ(c.skin);
    groundShadow(ctx, p.sx, p.sy + hz - 1, hx);
    drawSpriteNN(ctx, c.skin.spr, p.sx - hx, p.sy - hz, c.skin.scale);
  }
}

export function checkTrafficHit(sys, box) {
  for (const c of sys.list) {
    const hx = skinHalfX(c.skin), hz = skinHalfZ(c.skin);
    // Snug hitbox on ALL sides — collide only on real visual contact, not with a
    // phantom margin. Lateral 0.72, longitudinal 0.42 (matched to the sprites).
    const x1 = c.x - hx * 0.72, x2 = c.x + hx * 0.72;
    const z1 = c.z - hz * 0.42, z2 = c.z + hz * 0.42;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) return c;
  }
  return null;
}
