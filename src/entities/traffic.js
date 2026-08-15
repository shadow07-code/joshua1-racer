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
import { TRAFFIC_SKINS, ONCOMING_SKINS, TRUCK_SKINS, oncomingSkin, SPR_COIN } from "../sprites.js";

const LANES = 5;

// Drawn (and collision) half-sizes derived from the sprite size × its scale.
function skinHalfX(skin) { return skin.w * skin.scale / 2; }
function skinHalfZ(skin) { return skin.h * skin.scale / 2; }

export function makeTrafficSystem(opts = {}) {
  return {
    list: [],
    coins: [],                   // gold coins scattered down the open gap lane
    gates: [],                   // optional RISK GATES parked in a walled lane
    allowGates: false,           // set by main.js once the run has enough pace
    nextRowZ: 80,
    lastGapLane: 2,              // start with center lane open
    lastShift: 0,                // last gap-lane shift direction (drives slalom zig-zags)
    phrase: null,                // current traffic PHRASE (set by the pattern director)
    rowGapZ: opts.rowGapZ || 34, // distance between rows in world meters
    densityMul: 1.0,             // current difficulty density (set by main.js)
    passedCount: 0,
    rowsSpawned: 0,
    event: null,                 // active in-run EVENT (set by main.js) — narrows
                                 // the skin pool, forces a phrase, alters oncoming rate
    nextOncomingZ: null,         // z of the next wrong-way car (null until unlocked)
    oncomingNear: 0,             // metres to the nearest wrong-way car inside horn range (0 = none)
  };
}

function laneToX(laneIdx, halfRoad) {
  const laneW = (halfRoad * 2) / LANES;
  return -halfRoad + laneW * (laneIdx + 0.5);
}

// The active event can narrow the vehicle pool (CONVOY = trucks only).
function pickSkin(sys) {
  const pool = (sys && sys.event && sys.event.trucksOnly) ? TRUCK_SKINS : TRAFFIC_SKINS;
  return pool[Math.floor(Math.random() * pool.length)];
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
  // A gauntlet, a squeeze or a gate ("the drop") always resolves to air — a short
  // breather right after, so the pressure has somewhere to release. A gate also
  // needs it: taking the greed line leaves you off the racing line.
  if (last === "gauntlet" || last === "closing" || last === "gate") {
    return { type: "breather", left: 1 + (Math.random() < 0.5 ? 1 : 0), dir: 1 };
  }
  const wG = Math.min(0.32, 0.08 + (dm - 1) * 0.5);   // gauntlets heat up with density
  const wC = RACE.closingRowChance;                   // the one-row squeeze
  // RISK GATES are the quiet-stretch decision: kept OUT of events so a set-piece
  // stays one clean idea (and so a gate can never land inside WRONG WAY's storm).
  const wR = (sys.allowGates && !sys.event) ? RACE.gateRowChance : 0;
  const r = Math.random();
  if (r < 0.04)                  return { type: "tough",    left: 1, dir: Math.random() < 0.5 ? -2 : 2 };
  // CLOSING: a single row where the flankers pinch the gap shut as you arrive —
  // commit early or bail to the escape lane. Always followed by a breather.
  if (r < 0.04 + wC)             return { type: "closing",  left: 1, dir: 1 };
  if (r < 0.04 + wC + wR)        return { type: "gate",     left: 1, dir: 1 };
  if (r < 0.04 + wC + wR + wG)   return { type: "gauntlet", left: 3 + (Math.random() * 3 | 0), dir: 1 };
  if (r < 0.20 + wC + wR + wG)   return { type: "breather", left: 1 + (Math.random() < 0.4 ? 1 : 0), dir: 1 };
  if (r < 0.46 + wC + wR + wG)   return { type: "sweep",    left: 3 + (Math.random() * 3 | 0), dir: Math.random() < 0.5 ? -1 : 1 };
  return { type: "slalom", left: 4 + (Math.random() * 4 | 0), dir: 1 };
}

// Generate one row of cars at sys.nextRowZ, leaving a gap lane (plus a flowing
// corridor) the player can thread, shaped by the current phrase.
function spawnRow(sys, map) {
  const wide = sys.rowsSpawned < 4;
  const forced = sys.event && sys.event.phrase;                  // e.g. CONVOY = pure slalom
  let ph = sys.phrase;
  if (wide) ph = { type: "breather", left: 1, dir: 1 };          // gentle opening
  else if (forced) ph = { type: forced, left: 1, dir: sys.lastShift > 0 ? 1 : -1 };
  else if (!ph || ph.left <= 0) ph = pickPhrase(sys);

  // Per-phrase gap-lane shift.
  let shift, threadRow = false, closingRow = false, gateRow = false;
  if (ph.type === "slalom")        shift = sys.lastShift > 0 ? -1 : 1;      // zig-zag
  else if (ph.type === "sweep")    shift = ph.dir;                          // steady walk
  else if (ph.type === "gauntlet") { shift = sys.lastShift > 0 ? -1 : 1; threadRow = true; }
  else if (ph.type === "closing")  { shift = 0; closingRow = true; }        // squeeze in place
  else if (ph.type === "gate")     { shift = 0; gateRow = true; }           // hold the safe line steady while you decide
  else if (ph.type === "tough")    shift = ph.dir;                          // ±2 juke
  else                             shift = 0;                               // breather: hold

  let gap = sys.lastGapLane + shift;
  if (gap < 0) gap = 1;                        // bounce off the left edge
  else if (gap >= LANES) gap = LANES - 2;      // bounce off the right edge
  // Both squeeze types need a lane on EACH side of the gap to do the pinching.
  if (threadRow || closingRow) { if (gap <= 0) gap = 1; else if (gap >= LANES - 1) gap = LANES - 2; }
  const effShift = gap - sys.lastGapLane;
  if (ph.type === "sweep" && effShift === 0) ph.dir = -ph.dir;   // reverse a sweep at the wall
  if (effShift !== 0) sys.lastShift = effShift > 0 ? 1 : -1;
  sys.lastGapLane = gap;
  ph.left -= 1;
  sys.phrase = ph;

  // A GATE goes in a lane directly BESIDE the guaranteed gap, so the choice is one
  // lane of steering away and both options are on screen together: free safe line,
  // or the gold slot. Picked before the lane fill so that lane gets no car.
  let gateLane = -1;
  if (gateRow) {
    const sides = [gap - 1, gap + 1].filter(l => l >= 0 && l < LANES);
    gateLane = sides[Math.floor(Math.random() * sides.length)];
  }

  // ── Which lanes get cars — the gap + a flowing corridor always stay open ──
  const dm = sys.densityMul || 1;
  let lanesToFill;
  if (gateRow) {
    // The row is WALLED: every lane gets a car except the guaranteed gap and the
    // gate's own lane. That's what makes the gate a real fork rather than an
    // ornament — there are exactly two ways through, one free and one paid for.
    lanesToFill = [];
    for (let i = 0; i < LANES; i++) if (i !== gap && i !== gateLane) lanesToFill.push(i);
  } else if (threadRow) {
    // GAUNTLET: flank the gap on BOTH sides so threading it is a SANDWICH; a third
    // car two lanes off squeezes harder as density climbs.
    lanesToFill = [gap - 1, gap + 1].filter(l => l >= 0 && l < LANES);
    if (dm > RACE.density2CarFrom + 0.2) {
      const far = gap >= 2 ? gap - 2 : gap + 2;
      if (far >= 0 && far < LANES) lanesToFill.push(far);
    }
  } else if (closingRow) {
    // CLOSING: exactly the two flankers — they'll squeeze the gap shut when the
    // player gets close. Nothing else is placed, so the lanes beyond them stay
    // open as the bail-out (this is a timing test, never a dead end).
    lanesToFill = [gap - 1, gap + 1].filter(l => l >= 0 && l < LANES);
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
  // is likely to drift. Gauntlet + closing flanks never take a RANDOM drift
  // (closing cars get their scripted squeeze below instead).
  // A gate row's walls hold their lanes too — a car merging across the gate lane
  // would turn an optional dare into a coin flip.
  const driftChance = (threadRow || closingRow || gateRow) ? 0 : (ph.type === "breather" ? 0.6 : 0.22);
  const gapX = laneToX(gap, map.roadHalfWidth);

  for (const lane of lanesToFill) {
    const skin = pickSkin(sys);
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
      // CLOSING flankers: hold station, then squeeze toward the gap once the
      // player is inside RACE.closingTriggerZ (see updateTraffic). Blinkers run
      // the whole time so the intent is telegraphed from a long way out.
      closingVx: closingRow ? (x < gapX ? RACE.closingRate : -RACE.closingRate) : 0,
      // Stop a half-car short of the lane centre, so a fully-shut squeeze reads
      // as two cars edge-to-edge (never overlapping sprites). The remaining gap
      // is narrower than the player, so arriving late genuinely means bailing.
      closingLimit: closingRow ? gapX + (x < gapX ? -skinHalfX(skin) : skinHalfX(skin)) : gapX,
    });
  }

  // ── RISK GATE ── Two barrier posts walling the lane, with a gold slot between
  // them wide enough for a straight, committed car and nothing else. Threading it
  // pays the coin stack; clipping a post costs a life. Nothing here touches the
  // guaranteed gap, so the row stays solvable for a player who simply says no.
  if (gateRow) {
    sys.gates.push({
      z: sys.nextRowZ,
      x: laneToX(gateLane, map.roadHalfWidth),
      laneHalf: (map.roadHalfWidth * 2) / LANES / 2,   // posts fill the lane out to its edges
      passed: false,
      cleared: false,
      hit: false,
    });
  }

  // ── Occasional COIN TRAIL down the open gap lane — the ideal weaving line ──
  // Skipped on a gate row: free coins on the safe line would undercut the dare.
  // The coins sit exactly where the safe path is, so grabbing them rewards
  // precise driving and adds a grab-or-play-safe decision. Skipped during the
  // gentle opening rows. The gap shifts ≤1 lane/row, so successive trails form a
  // dotted line that follows the weave.
  if (!wide && !gateRow && Math.random() < RACE.coinRowChance) {
    const cxCoin = laneToX(gap, map.roadHalfWidth);
    const n = RACE.coinsPerTrail || 3;
    for (let i = 0; i < n; i++) {
      sys.coins.push({ x: cxCoin, z: sys.nextRowZ - i * (sys.rowGapZ / n), got: false });
    }
  }

  // Advance to next row position with a small spacing jitter.
  sys.nextRowZ += sys.rowGapZ + (Math.random() * 6 - 3);
  sys.rowsSpawned++;
}

// ── WRONG-WAY CAR ── A lone vehicle coming the other way. It closes at roughly
// double the rate of overtaken traffic, so it has to be spotted and planned for
// EARLY — the one threat that can genuinely corner a good driver. Kept fair by
// construction: it spawns at least 2 lanes clear of the current racing line, it
// never drifts, and it's a single car in one lane out of five.
function spawnOncoming(sys, map, playerZ) {
  // Pick a lane well away from the line the player is currently threading.
  const cands = [];
  for (let l = 0; l < LANES; l++) if (Math.abs(l - sys.lastGapLane) >= 2) cands.push(l);
  if (!cands.length) return;                       // nowhere safe — skip this one
  const lane = cands[Math.floor(Math.random() * cands.length)];
  const skin = ONCOMING_SKINS[Math.floor(Math.random() * ONCOMING_SKINS.length)];
  sys.list.push({
    skin: oncomingSkin(skin),
    z: sys.nextOncomingZ,
    x: laneToX(lane, map.roadHalfWidth),
    laneIdx: lane,
    speed: -PHYS.cruiseSpeed * RACE.oncomingSpeedMul,   // NEGATIVE = toward the player
    cruise: null,                                        // never eases back up
    oncoming: true,
    passed: false,
    nearMissed: false,
    driftVx: 0,
    pendingDriftVx: 0,
    signalT: 0,
    sigPhase: Math.random() * 560,
    closingVx: 0,
  });
  // The WRONG WAY event tightens the spacing so they come thick and fast.
  const spacingMul = (sys.event && sys.event.oncomingMul) || 1;
  sys.nextOncomingZ += (RACE.oncomingSpacingMin +
    Math.random() * (RACE.oncomingSpacingMax - RACE.oncomingSpacingMin)) * spacingMul;
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
    if (o === c || o.smashed || o.oncoming) continue;   // wrong-way cars flash past — don't wait on them
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

export function updateTraffic(sys, dt, playerZ, map, cbs, clearAheadDist = 0, allowOncoming = false) {
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

  // ── Wrong-way traffic ── Unlocked once the run has real pace (main.js gates on
  // km/h). The first one is scheduled a comfortable distance out so it never
  // ambushes the player the instant it unlocks.
  if (allowOncoming) {
    if (sys.nextOncomingZ == null) {
      sys.nextOncomingZ = playerZ + 260 + Math.random() * 200;
    }
    while (sys.nextOncomingZ < ahead) {
      if (clearAheadDist > 0 && sys.nextOncomingZ < playerZ + clearAheadDist) {
        sys.nextOncomingZ = playerZ + clearAheadDist;   // respect the rampage grace
      }
      spawnOncoming(sys, map, playerZ);
    }
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
  let nearDist = 0;                   // nearest wrong-way car inside horn range (metres)
  for (const c of sys.list) {
    // Smashed cars are knocked off the road: they tumble sideways/back and no
    // longer drive, change lanes, get "passed", or collide.
    if (c.smashed) {
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      continue;
    }
    c.z += c.speed * dt;

    // Wrong-way car: note the nearest one still ahead and inside horn range, so
    // main.js can blare the horn once as it bears down (no HUD warning at all —
    // it's meant to ambush).
    if (c.oncoming) {
      const d = c.z - playerZ;
      if (d > 0 && d < RACE.oncomingHornDist && (nearDist === 0 || d < nearDist)) nearDist = d;
    }

    // ── CLOSING squeeze ── The flankers hold station until the player is inside
    // the trigger distance, then pinch toward the gap. Because it only engages
    // late, the player can always SEE it start and choose: commit through, or
    // bail to the open lane beyond. Stops at the lane centre so the pair can
    // never overlap each other.
    if (c.closingVx) {
      const d = c.z - playerZ;
      if (d > 0 && d < RACE.closingTriggerZ) {
        const nx = c.x + c.closingVx * dt;
        const past = c.closingVx > 0 ? (nx >= c.closingLimit) : (nx <= c.closingLimit);
        c.x = past ? c.closingLimit : nx;
        if (past) c.closingVx = 0;
      }
    }

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

  sys.oncomingNear = nearDist;

  // ── RISK GATE resolution ── The moment a gate slides behind the player, it pays
  // out IF they were actually inside the slot as they crossed it. Driving past in
  // the safe lane is a legitimate choice, not a failure — it just pays nothing.
  // A gate whose post was struck (or smashed mid-rampage) never pays.
  const pX = cbs?.playerX ?? 0;
  for (const gt of sys.gates) {
    if (gt.passed || gt.z > playerZ) continue;
    gt.passed = true;
    if (!gt.hit && Math.abs(pX - gt.x) <= RACE.gateSlotHalf) {
      gt.cleared = true;
      cbs?.onGate?.();
    }
  }
  // Kept a little past the player so a cleared gate's green caps stay visible.
  sys.gates = sys.gates.filter(gt => gt.z > playerZ - 20);

  // Keep traffic from stacking: cars follow (slow for) the car ahead in their
  // lane and never overlap it — except for a rare bump.
  resolveTrafficSeparation(sys, dt);

  // Keep cars in the list until they've fully slid off the bottom edge (they used
  // to be culled at -30, popping out of view just below the player). -50 lets them
  // scroll all the way past.
  sys.list = sys.list.filter(c => c.z > playerZ - 50);
  // Drop coins once they've scrolled past (grabbed or missed).
  sys.coins = sys.coins.filter(c => !c.got && c.z > playerZ - 20);
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
    if (c.smashed || c.oncoming) continue;                  // off-road / wrong-way: ignore
    let leader = null, gap = 0, minGap = 0;
    for (let j = i + 1; j < cars.length; j++) {
      const o = cars[j];
      if (o.smashed || o.oncoming) continue;                // never "follow" a wrong-way car
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
    // WRONG-WAY: twin headlights blazing at the camera + a blinking hazard bar,
    // so an approaching car is unmistakable long before it arrives. The sprite is
    // already flipped, so its lights lead — this just makes them glow.
    if (c.oncoming && !c.smashed) {
      const sx0 = Math.round(p.sx - hx), sy0 = Math.round(p.sy + hz) - 2;
      rect(ctx, sx0 + 1, sy0, 2, 2, 1);                     // white headlights
      rect(ctx, sx0 + c.skin.w - 3, sy0, 2, 2, 1);
      if (Math.floor((tNow + (c.sigPhase || 0)) / 200) % 2 === 0) {
        rect(ctx, sx0 + 1, sy0 - 2, c.skin.w - 2, 1, 9);    // orange hazard flash
      }
    }
    // Turn-signal indicator — a bright amber corner light over the taillight on
    // the side the car is merging toward, blinking through the lead-in AND the
    // drift itself. Per-car phase offset so the road never flashes in unison.
    // Anchored with the SAME rounding as the sprite blit so it pins exactly to
    // the taillight + outline columns at any fractional screen position.
    if (!c.smashed) {
      // A CLOSING flanker signals from spawn (its squeeze is scripted), so the
      // pinch is telegraphed the whole way in — the timing test stays fair.
      const sig = c.closingVx ? Math.sign(c.closingVx)
                : c.signalT > 0 ? Math.sign(c.pendingDriftVx || 0)
                : Math.sign(c.driftVx || 0);
      if (sig && Math.floor((tNow + (c.sigPhase || 0)) / 280) % 2 === 0) {
        const sx0 = Math.round(p.sx - hx), sy0 = Math.round(p.sy - hz);
        rect(ctx, sx0 + (sig > 0 ? c.skin.w - 3 : 1), sy0 + c.skin.tailRow, 2, 2, 5);
      }
    }
  }
}

// Draw the gold coins scattered down the gap lane, with a small shifting glint
// so they sparkle in place (screen-space on the coin — no added optic flow).
export function drawCoins(ctx, sys, map, playerZ, playerX) {
  const glint = Math.floor(performance.now() / 140) % 3;   // 0,1,2 — moves the spark
  for (const c of sys.coins) {
    if (c.got) continue;
    const p = project(map, playerZ, playerX, c);
    if (!p) continue;
    drawSpriteNN(ctx, SPR_COIN, p.sx - 3, p.sy - 3, 1);    // 7×7 centred on the coin
    rect(ctx, p.sx - 1 + glint, p.sy - 2, 1, 1, 1);        // white glint travels across
  }
}

// ── RISK GATES ── Draw the approach chevrons first, then the gate itself.
//
// The chevrons are the TELEGRAPH: they're painted up the gate lane behind the
// gate, so they cross the 100 m view horizon roughly two rows before the gate
// does — the player sees "there's a decision in this lane" while they still have
// room to set up for it, instead of being asked to react.
//
// Everything blinks by swapping a palette index on a fixed rect (gold ⇄ amber),
// which is a colour change in place — no motion, no scaling, dizzy rule intact.
export function drawGates(ctx, sys, map, playerZ, playerX) {
  const pulse = Math.floor(performance.now() / 160) % 2 === 0;
  const slot = RACE.gateSlotHalf;
  for (const gt of sys.gates) {
    const markIdx = gt.cleared ? 17 : gt.hit ? 4 : (pulse ? 5 : 21);
    for (let i = 1; i <= RACE.gateChevrons; i++) {
      const cp = project(map, playerZ, playerX, { z: gt.z - i * RACE.gateChevronGap, x: gt.x });
      if (!cp) continue;
      rect(ctx, cp.sx - 3, cp.sy + 1, 7, 1, markIdx);   // a flat arrowhead pointing up-screen
      rect(ctx, cp.sx - 2, cp.sy,     5, 1, markIdx);
      rect(ctx, cp.sx - 1, cp.sy - 1, 3, 1, markIdx);
    }

    const p = project(map, playerZ, playerX, gt);
    if (!p) continue;
    const postW = Math.max(2, Math.round(gt.laneHalf - slot));
    const hz = 9;                                   // post height in px
    const topY = p.sy - hz;
    const lx = Math.round(p.sx - gt.laneHalf), rx = Math.round(p.sx + slot);
    const bodyIdx = gt.hit ? 4 : 22;                // rust barrier; dark once wrecked
    const capIdx  = gt.hit ? 4 : gt.cleared ? 17 : (pulse ? 5 : 9);
    for (const px of [lx, rx]) {
      rect(ctx, px, topY, postW, hz, bodyIdx);
      rect(ctx, px, topY, postW, 2, capIdx);        // lit cap — reads as "gate", not "traffic"
      for (let y = topY + 3; y < topY + hz; y += 2) rect(ctx, px, y, postW, 1, 1);  // hazard stripes
    }
    if (!gt.hit) {
      // The threshold you have to cross, and the prize sitting on it.
      rect(ctx, Math.round(p.sx - slot), p.sy, slot * 2, 1, gt.cleared ? 17 : (pulse ? 5 : 21));
      if (!gt.cleared) drawSpriteNN(ctx, SPR_COIN, p.sx - 3, p.sy - 8, 1);
    }
  }
}

// Player-vs-gate-post collision. The slot itself is deliberately empty: a car
// that lines up straight goes through, a car still carving does not. Posts run
// from the slot edge out to the lane edge, so the gate genuinely walls its lane.
export function checkGateHit(sys, box) {
  const slot = RACE.gateSlotHalf, hz = RACE.gateHalfZ;
  for (const gt of sys.gates) {
    if (gt.hit) continue;
    if (box.z1 >= gt.z + hz || box.z2 <= gt.z - hz) continue;
    const inLeft  = box.x1 < gt.x - slot && box.x2 > gt.x - gt.laneHalf;
    const inRight = box.x1 < gt.x + gt.laneHalf && box.x2 > gt.x + slot;
    if (inLeft || inRight) return gt;
  }
  return null;
}

// Grab any coins the player is overlapping this frame — returns how many. The
// hit window is generous (coins are a reward), so following the ideal line
// sweeps them up. Coins are collectible always (even mid-rampage / invuln).
export function checkCoinGrab(sys, box) {
  let got = 0;
  for (const c of sys.coins) {
    if (c.got) continue;
    if (box.x1 < c.x + 5 && box.x2 > c.x - 5 && box.z1 < c.z + 6 && box.z2 > c.z - 6) {
      c.got = true;
      got++;
    }
  }
  return got;
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
