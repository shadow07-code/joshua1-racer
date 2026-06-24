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
    lastShift: 0,                // last gap-lane shift direction (drives slalom zig-zags)
    phrase: null,                // current traffic PHRASE (set by the pattern director)
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

// PATTERN DIRECTOR — instead of memoryless rows, traffic comes in short PHRASES
// with a deliberate shape, so weaving has RHYTHM (build → drop → release, like a
// good Mick Gordon track): SLALOM (zig-zag the gap — the core flowing carve),
// SWEEP (the gap walks steadily across the road), GAUNTLET (tight back-to-back
// sandwiches — the "drop"), BREATHER (open road — the release), and a rare TOUGH
// ±2 juke. Every phrase shifts the gap ≤1 lane/row (tough aside), so the road
// stays threadable with steering alone.
function pickPhrase(sys) {
  const dm = sys.densityMul || 1;
  const last = sys.phrase ? sys.phrase.type : "breather";
  // A gauntlet ("the drop") always resolves to air — a short breather right after.
  if (last === "gauntlet") return { type: "breather", left: 1 + (Math.random() < 0.5 ? 1 : 0), dir: 1 };
  const wG = Math.min(0.32, 0.08 + (dm - 1) * 0.5);   // gauntlets heat up with density
  const r = Math.random();
  if (r < 0.04)        return { type: "tough",    left: 1, dir: Math.random() < 0.5 ? -2 : 2 };
  if (r < 0.04 + wG)   return { type: "gauntlet", left: 3 + (Math.random() * 3 | 0), dir: 1 };
  if (r < 0.20 + wG)   return { type: "breather", left: 1 + (Math.random() < 0.4 ? 1 : 0), dir: 1 };
  if (r < 0.46 + wG)   return { type: "sweep",    left: 3 + (Math.random() * 3 | 0), dir: Math.random() < 0.5 ? -1 : 1 };
  return { type: "slalom", left: 4 + (Math.random() * 4 | 0), dir: 1 };
}

// Generate one row of cars at sys.nextRowZ, leaving a gap lane (plus a flowing
// corridor) the player can thread, shaped by the current phrase.
function spawnRow(sys, map) {
  const wide = sys.rowsSpawned < 4;
  let ph = sys.phrase;
  if (wide) ph = { type: "breather", left: 1, dir: 1 };          // gentle opening
  else if (!ph || ph.left <= 0) ph = pickPhrase(sys);

  // Per-phrase gap-lane shift.
  let shift, threadRow = false;
  if (ph.type === "slalom")        shift = sys.lastShift > 0 ? -1 : 1;      // zig-zag
  else if (ph.type === "sweep")    shift = ph.dir;                          // steady walk
  else if (ph.type === "gauntlet") { shift = sys.lastShift > 0 ? -1 : 1; threadRow = true; }
  else if (ph.type === "tough")    shift = ph.dir;                          // ±2 juke
  else                             shift = 0;                               // breather: hold

  let gap = sys.lastGapLane + shift;
  if (gap < 0) gap = 1;                        // bounce off the left edge
  else if (gap >= LANES) gap = LANES - 2;      // bounce off the right edge
  if (threadRow) { if (gap <= 0) gap = 1; else if (gap >= LANES - 1) gap = LANES - 2; }
  const effShift = gap - sys.lastGapLane;
  if (ph.type === "sweep" && effShift === 0) ph.dir = -ph.dir;   // reverse a sweep at the wall
  if (effShift !== 0) sys.lastShift = effShift > 0 ? 1 : -1;
  sys.lastGapLane = gap;
  ph.left -= 1;
  sys.phrase = ph;

  // ── Which lanes get cars — the gap + a flowing corridor always stay open ──
  const dm = sys.densityMul || 1;
  let lanesToFill;
  if (threadRow) {
    // GAUNTLET: flank the gap on BOTH sides so threading it is a SANDWICH; a third
    // car two lanes off squeezes harder as density climbs.
    lanesToFill = [gap - 1, gap + 1].filter(l => l >= 0 && l < LANES);
    if (dm > RACE.density2CarFrom + 0.2) {
      const far = gap >= 2 ? gap - 2 : gap + 2;
      if (far >= 0 && far < LANES) lanesToFill.push(far);
    }
  } else if (ph.type === "breather") {
    // Open road — one distant car so it reads as a real exhale, not an empty void.
    const far = [];
    for (let i = 0; i < LANES; i++) if (Math.abs(i - gap) >= 2) far.push(i);
    lanesToFill = far.length ? [far[Math.floor(Math.random() * far.length)]] : [];
  } else {
    // SLALOM / SWEEP / TOUGH: wall off every lane EXCEPT the gap and the lane the
    // weave is flowing into, so the open corridor hugs and moves with the gap — the
    // player has to carve the line, but the line is always open and readable.
    const flowDir = sys.lastShift >= 0 ? 1 : -1;
    const open = new Set([gap, gap + flowDir]);
    if (dm < 1.4) open.add(gap - flowDir);     // an extra open lane while it's still warming up
    lanesToFill = [];
    for (let i = 0; i < LANES; i++) if (!open.has(i)) lanesToFill.push(i);
  }

  // Wall cars hold their lane (clean, readable weave); only the lone breather car
  // is likely to drift. Gauntlet flanks never drift (keeps the split gap open).
  const driftChance = threadRow ? 0 : (ph.type === "breather" ? 0.6 : 0.22);

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
    // Thread-row flank cars never drift — keeps the split gap open + readable.
    let drift = Math.random() < driftChance ? (Math.random() < 0.5 ? -1 : 1) : 0;
    // Keep the threadable GAP wide enough to drive through: a car sitting right
    // beside the open gap lane must never drift INTO it (that would pinch the
    // line). If its random drift points at the gap, zero it — it just holds its
    // lane, so the gap stays a full lane wide for the (now slightly bigger) car.
    if (drift && Math.abs(lane - gap) === 1 && drift === (gap > lane ? 1 : -1)) {
      drift = 0;
    }
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
      // SANDWICH: did the player split a tight 2-car gap? Look for a second live
      // car at nearly the same z, on the OPPOSITE side of the car, within a
      // narrow combined gap. Mark both so the pair only scores the bonus once.
      let sandwich = false;
      if (!c.sandwichCounted) {
        const px = cbs?.playerX ?? 0;
        for (const o of sys.list) {
          if (o === c || o.smashed || o.sandwichCounted) continue;
          if (Math.abs(o.z - c.z) > 12) continue;
          if ((o.x - px) * (c.x - px) < 0 && Math.abs(o.x - c.x) < RACE.sandwichDetectPx) {
            sandwich = true; c.sandwichCounted = true; o.sandwichCounted = true; break;
          }
        }
      }
      cbs?.onPassed?.(sandwich);
    }
    if (!c.nearMissed && c.passed && Math.abs(c.z - playerZ) < 18) {
      const closenessPx = Math.abs(c.x - (cbs?.playerX ?? 0));
      if (closenessPx < 18) {
        c.nearMissed = true;
        // tightness 0..1 (1 = the closest possible shave) drives the precision bonus.
        const tightness = Math.max(0, Math.min(1, 1 - closenessPx / 18));
        cbs?.onNearMiss?.(tightness);
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
// size is 15% smaller than its sprite (HIT_SCALE — sprites stay native-res crisp;
// fractional sprite scaling is the known art-muddying regression), box factors snug
// — especially longitudinally (0.34, was 0.42), so a car closing on a vehicle's
// rear bumper has visibly more room to swerve out before the hit registers.
// Clipping a corner reads as a great dodge, not a cheap death.
const HIT_SCALE = 0.85;
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
