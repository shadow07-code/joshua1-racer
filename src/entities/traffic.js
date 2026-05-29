// Continuous civilian traffic — the player weaves around it.
//
// Spawning is ROW-BASED: each row is a wave of cars across the 5 lanes with one
// designated GAP LANE that's always empty. Adjacent rows' gap lanes shift by at
// most ±1 lane, so the player can ALWAYS thread through with steering alone.
// Rarely (~5%) a "tough row" shifts the gap by 2, forcing the player to brake
// to find the gap.
import { PHYS } from "../config.js";
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

    // ── Slow lane change ──
    // Every 8-16 seconds (varied), pick a new target lane. Lerp toward it slowly
    // (≈5 px/s) so the player has plenty of time to react. The new target stays
    // within the road bounds.
    c.laneChangeTimer -= dt;
    if (c.laneChangeTimer <= 0) {
      c.laneChangeTimer = 8 + Math.random() * 8;
      // 60% chance to actually shift lanes (else hold this lane).
      if (Math.random() < 0.6) {
        const shift = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 14);
        c.targetX = Math.max(-(halfRoad - 6), Math.min(halfRoad - 6, c.x + shift));
      }
    }
    const LANE_CHANGE_SPEED = 5; // px / sec — deliberately slow
    const dx = c.targetX - c.x;
    if (Math.abs(dx) > 0.3) {
      c.x += Math.sign(dx) * Math.min(Math.abs(dx), LANE_CHANGE_SPEED * dt);
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

  sys.list = sys.list.filter(c => c.z > playerZ - 30);
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
    const x1 = c.x - hx, x2 = c.x + hx;
    const z1 = c.z - hz * 0.6, z2 = c.z + hz * 0.6;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) return c;
  }
  return null;
}
