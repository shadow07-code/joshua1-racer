// Continuous civilian traffic — the player weaves around it.
//
// Spawning is ROW-BASED: each row is a wave of cars across the 5 lanes with one
// designated GAP LANE that's always empty. Adjacent rows' gap lanes shift by at
// most ±1 lane, so the player can ALWAYS thread through with steering alone.
// Rarely (~5%) a "tough row" shifts the gap by 2, forcing the player to brake
// to find the gap.
import { PHYS, RACE } from "../config.js";
import { project } from "../road.js";
import { drawSpriteNN, groundShadow, rect } from "../render.js";
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
    densityMul: 1.0,             // current difficulty density (set by main.js)
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
  // Cars per row grows with the difficulty density: one car early, and as the
  // ramp builds, a rising share of rows get a SECOND car (the guaranteed gap
  // lane is still excluded, so every row stays threadable).
  let carsInRow = 1;
  const dm = sys.densityMul || 1;
  if (!wide && dm > RACE.density2CarFrom) {
    const p2 = Math.min(0.6, (dm - RACE.density2CarFrom) * 1.1);
    if (Math.random() < p2) carsInRow = 2;
  }
  const lanesToFill = candidateLanes.slice(0, Math.min(carsInRow, candidateLanes.length));

  for (const lane of lanesToFill) {
    const skin = pickSkin();
    const x = laneToX(lane, map.roadHalfWidth);
    const jitter = (Math.random() - 0.5) * 4; // small z stagger inside a row
    const speed = PHYS.cruiseSpeed * (skin.speedMul + (Math.random() * 0.08 - 0.02));
    // Lateral drift is decided AT SPAWN and stays constant — no random
    // mid-screen swerves. ~60% drift left or right; the rest hold their lane.
    // A drifting car SIGNALS like a real driver: its amber turn indicator
    // blinks for a short lead-in (signalT) before the drift engages, and keeps
    // blinking the whole time it's tracking across the road.
    const drift = Math.random() < 0.60 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    sys.list.push({
      skin,
      z: sys.nextRowZ + jitter,
      x,
      laneIdx: lane,
      speed,
      cruise: speed,                                   // preferred speed to recover to
      passed: false,
      nearMissed: false,
      driftVx: 0,                                      // engages after the lead-in
      pendingDriftVx: drift * (6 + Math.random() * 5), // px/s lateral once engaged
      signalT: drift ? 0.7 + Math.random() * 0.8 : 0,  // blink-before-merge lead-in (s)
      sigPhase: Math.random() * 560,                   // unsynced blinker phase (ms)
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

// Merge safety check: is another car occupying (or nearly occupying) the space
// this car is drifting toward? Blocked drivers HOLD their lane — blinker still
// going — and resume the merge once the gap is clear. This is what keeps
// traffic from ever steering into each other (no snap-apart correction needed).
function driftBlocked(cars, c) {
  const dir = c.driftVx > 0 ? 1 : -1;
  const cHx = skinHalfX(c.skin), cHz = skinHalfZ(c.skin);
  for (const o of cars) {
    if (o === c || o.smashed) continue;
    if (Math.abs(o.z - c.z) >= cHz + skinHalfZ(o.skin) + 6) continue; // not alongside
    const dx = (o.x - c.x) * dir;                  // lateral distance, drift-signed
    if (dx <= 0) continue;                         // on the other side — irrelevant
    if (dx < cHx + skinHalfX(o.skin) + 8) return true;  // gap's taken — wait
  }
  return false;
}

// Knock a car off the road — used by RAMPAGE smashes and the post-rampage road
// clear. The car flings sideways (away from `fromX`) and tumbles back, stops
// driving, and no longer collides.
export function smashCar(c, fromX = 0) {
  if (c.smashed) return;
  c.smashed = true;
  const dir = c.x >= fromX ? 1 : -1;
  c.vx = dir * (140 + Math.random() * 70);
  c.vz = -(20 + Math.random() * 25);
}

export function updateTraffic(sys, dt, playerZ, map, cbs, clearAheadDist = 0) {
  // Spawn ahead so the road is always populated up to ~220m ahead. During the
  // post-rampage grace window, push the spawn cursor past the cleared zone so no
  // fresh cars appear in the player's path.
  const ahead = playerZ + 220;
  if (clearAheadDist > 0 && sys.nextRowZ < playerZ + clearAheadDist) {
    sys.nextRowZ = playerZ + clearAheadDist;
  }
  while (sys.nextRowZ < ahead) {
    spawnRow(sys, map);
  }

  // Grace window: fling any car that's in the near-ahead corridor off the road so
  // the path in front of the player stays clear for a moment after a rampage.
  if (clearAheadDist > 0) {
    for (const c of sys.list) {
      if (!c.smashed && c.z > playerZ + 2 && c.z < playerZ + clearAheadDist) {
        smashCar(c, 0);   // fling toward the nearest edge
      }
    }
  }

  const halfRoad = map.roadHalfWidth;
  for (const c of sys.list) {
    // Smashed cars are knocked off the road: they tumble sideways/back and no
    // longer drive, change lanes, get "passed", or collide.
    if (c.smashed) {
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      continue;
    }
    c.z += c.speed * dt;

    // Signal lead-in: the indicator blinks for a moment BEFORE the drift
    // engages (telegraphing the merge), then the car starts tracking.
    if (c.signalT > 0) {
      c.signalT -= dt;
      if (c.signalT <= 0) c.driftVx = c.pendingDriftVx;
    }

    // ── Steady lateral drift (assigned at spawn, engaged after the signal) ──
    // The car tracks across the road at a constant rate — predictable and
    // readable. It WAITS (lane held, blinker on) whenever the space it's
    // merging into is occupied, and when it reaches a road edge it straightens
    // out (indicator stops). No random swerves, no steering into anyone.
    if (c.driftVx && !driftBlocked(sys.list, c)) {
      c.x += c.driftVx * dt;
      const lim = halfRoad - 6;
      if (c.x >= lim)       { c.x = lim;  c.driftVx = 0; }
      else if (c.x <= -lim) { c.x = -lim; c.driftVx = 0; }
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

  // Keep cars in the list until they've fully slid off the bottom edge (they used
  // to be culled at -30, popping out of view just below the player). -50 lets them
  // scroll all the way past.
  sys.list = sys.list.filter(c => c.z > playerZ - 50);
}

// Traffic-vs-traffic car-following. Each car watches the nearest in-lane car
// ahead: it BRAKES smoothly (harder the closer it gets) through a follow zone
// so it settles behind the leader without ever touching it — no position
// snapping, no teleports. With the lane clear again it eases back up to its
// preferred cruise speed.
function resolveTrafficSeparation(sys, dt) {
  const cars = sys.list;
  cars.sort((a, b) => a.z - b.z);   // rear → front
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.smashed) continue;                                // off-road, ignore
    let leader = null, gap = 0, minGap = 0;
    for (let j = i + 1; j < cars.length; j++) {
      const o = cars[j];
      if (o.smashed) continue;
      const dz = o.z - c.z;
      if (dz > 45) break;                                   // nothing close ahead
      const latClear = skinHalfX(c.skin) + skinHalfX(o.skin) + 1.5;
      if (Math.abs(o.x - c.x) >= latClear) continue;        // different lane — ignore
      leader = o; gap = dz;
      minGap = (skinHalfZ(c.skin) + skinHalfZ(o.skin)) * 0.95;
      break;                                                // only the nearest matters
    }
    const followGap = minGap + 10;                          // braking starts 10m out
    if (leader && gap < followGap) {
      if (c.speed > leader.speed) {
        // Ease toward the leader's speed, harder the deeper into the zone.
        const urgency = Math.min(1, (followGap - gap) / 10);
        c.speed += (leader.speed - c.speed) * Math.min(1, dt * (2 + 8 * urgency));
      }
      if (gap < minGap) {
        // Contact imminent (e.g. the leader braked hard): match speed and ease
        // apart at a gentle visible rate instead of snapping positions.
        if (c.speed > leader.speed) c.speed = leader.speed;
        c.z -= Math.min(minGap - gap, 18 * dt);
      }
    } else if (c.cruise != null && c.speed < c.cruise) {
      c.speed = Math.min(c.cruise, c.speed + 6 * dt);       // lane clear — pick back up
    }
  }
}

export function drawTraffic(ctx, sys, map, playerZ, playerX) {
  const drawList = sys.list.slice().sort((a, b) => b.z - a.z);
  const tNow = performance.now();
  for (const c of drawList) {
    const p = project(map, playerZ, playerX, c);
    if (!p) continue;
    const hx = skinHalfX(c.skin), hz = skinHalfZ(c.skin);
    // Smashed cars lean into their skid; everyone else draws straight (lateral
    // intent is telegraphed by the turn-signal blinker below, not a lean).
    const spr = c.smashed && c.vx > 0 ? (c.skin.sprR || c.skin.spr)
              : c.smashed && c.vx < 0 ? (c.skin.sprL || c.skin.spr)
              : c.skin.spr;
    // Shadow hugs the car's visible base so it looks grounded, not flying.
    groundShadow(ctx, p.sx, p.sy + hz - 2, hx);
    drawSpriteNN(ctx, spr, p.sx - hx, p.sy - hz, c.skin.scale);
    // Turn-signal indicator — a bright amber corner light over the taillight on
    // the side the car is merging toward, blinking through the lead-in AND the
    // drift itself. Per-car phase offset so the road never flashes in unison.
    // Anchored with the SAME rounding as the sprite blit so it pins exactly to
    // the taillight + outline columns at any fractional screen position.
    if (!c.smashed) {
      const sig = c.signalT > 0 ? Math.sign(c.pendingDriftVx || 0) : Math.sign(c.driftVx || 0);
      if (sig && Math.floor((tNow + (c.sigPhase || 0)) / 280) % 2 === 0) {
        const sx0 = Math.round(p.sx - hx), sy0 = Math.round(p.sy - hz);
        rect(ctx, sx0 + (sig > 0 ? c.skin.w - 3 : 1), sy0 + c.skin.tailRow, 2, 2, 5);
      }
    }
  }
}

// Player-vs-traffic collision is EVASION-FRIENDLY: every vehicle's collidable
// size is 8% smaller than its sprite (HIT_SCALE), and the box factors are snug
// — especially longitudinally (0.34, was 0.42), so a car closing on a vehicle's
// rear bumper has visibly more room to swerve out before the hit registers.
// Clipping a corner reads as a great dodge, not a cheap death.
const HIT_SCALE = 0.92;
export function checkTrafficHit(sys, box) {
  for (const c of sys.list) {
    if (c.smashed) continue;                 // already knocked off the road
    const hx = skinHalfX(c.skin) * HIT_SCALE, hz = skinHalfZ(c.skin) * HIT_SCALE;
    const x1 = c.x - hx * 0.70, x2 = c.x + hx * 0.70;
    const z1 = c.z - hz * 0.34, z2 = c.z + hz * 0.34;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) return c;
  }
  return null;
}
