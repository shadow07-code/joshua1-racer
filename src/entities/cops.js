// Police HELICOPTER chase — replaces the old (ineffective) cop cars.
//
// Once the player crosses 150 km/h a police chopper flies into the upper part
// of the road ahead. Every ~15s it locks onto the player's lane (a blinking
// reticle telegraphs the spot for ~1.1s) and drops a FLAMING BARREL onto the
// road. The barrel is a static hazard that scrolls toward the player — touch it
// and you lose a life, so steer clear. Slow back below ~135 km/h and the
// chopper peels away.
import { W, PHYS, RACE } from "../config.js";
import { project, yToDist } from "../road.js";
import { drawSprite, rect, disc, groundShadow } from "../render.js";
import { SPR_HELI, SPR_BARREL } from "../sprites.js";

const HELI_W = 14, HELI_H = 16;
const HELI_HALF_W = HELI_W / 2, HELI_HALF_H = HELI_H / 2;
const HELI_HOVER_Y = 52;             // hover height once on station
const HELI_OFFSCREEN_Y = -20;        // parked above the top edge (out of frame)
const AIM_TIME = 1.1;                // reticle telegraph before a drop
const ENTER_TIME = 1.7;              // fly-in duration
const EXIT_TIME = 1.7;               // fly-out duration
const RELOAD_TIME = 30;              // seconds off-screen between sorties ("reloading")
const FIRST_DELAY = 3;               // first appearance after the chase engages
const SINGLE_SORTIES = 1;            // first N sorties use one chopper, then a pair
const SECOND_DROP_DELAY = 1.8;       // 2nd chopper drops this much later than the 1st
const BARREL_HALF_X = 4;
const BARREL_HALF_Z = 4;

function triggerSpeed() { return PHYS.maxSpeed * (RACE.copTriggerKmh / PHYS.topSpeedKmh); }
function leaveSpeed()   { return PHYS.maxSpeed * ((RACE.copTriggerKmh - 15) / PHYS.topSpeedKmh); }
function dropDist()     { return yToDist(HELI_HOVER_Y); }
const clampBound = (x, b) => Math.max(-b, Math.min(b, x));

// A chopper holds station around `homeX` and drifts left/right with a smooth,
// slightly irregular sway (two out-of-phase sines) so a pair looks like it's
// patrolling rather than sitting locked in place.
function makeHeli(homeX, dropDelay, swayAmp) {
  return {
    x: homeX, homeX,
    y: HELI_OFFSCREEN_Y,
    dropDelay,            // seconds into the AIM phase before THIS chopper drops
    aiming: false,
    dropped: false,
    lockX: 0,
    swayAmp,                              // px of horizontal roam around homeX
    swayPhase: Math.random() * 6.28,
    swayPhase2: Math.random() * 6.28,
    swayFreq: 0.55 + Math.random() * 0.5, // rad/s — each chopper roams at its own pace
    rotorPhase: Math.random() * 6,
    bobPhase: Math.random() * 6,
    beaconPhase: Math.random() * 6,
  };
}

// Smooth station-keeping target: roam left/right around homeX, clamped on-road.
function swayTargetX(h, bound) {
  const x = h.homeX
    + Math.sin(h.swayPhase) * h.swayAmp
    + Math.sin(h.swayPhase2) * h.swayAmp * 0.35;
  return clampBound(x, bound);
}

export function makeCopsSystem() {
  return {
    active: false,
    phase: "wait",        // wait → enter → aim → exit → wait …
    phaseT: FIRST_DELAY,  // countdown in wait/enter/exit; counts UP in aim
    sortie: 0,            // how many sorties flown (decides single vs double)
    helis: [],
    barrels: [],
  };
}

// One sortie = choppers fly in, drop, fly out. After SINGLE_SORTIES single runs,
// every run sends TWO choppers whose drops are staggered. Between runs they sit
// off-screen for RELOAD_TIME (they're "reloading"), so barrels aren't unlimited.
export function updateCops(sys, dt, playerZ, playerX, playerSpeed, map, cbs) {
  // Barrels are static world hazards — always advance their flame + cull. Kept
  // until they've scrolled well past the player (-50) so they slide off-screen
  // instead of vanishing just below the car.
  for (const b of sys.barrels) b.flame += dt;
  sys.barrels = sys.barrels.filter(b => !b.hit && b.z > playerZ - 50);

  // Engage / disengage the chase by speed (with hysteresis). The sortie count is
  // NOT reset here — it persists for the whole run, so once the first single
  // sortie is flown every later sortie is a pair, even if the player drops below
  // the trigger speed and re-engages later (progression is independent of whether
  // high speed was sustained).
  if (!sys.active && playerSpeed >= triggerSpeed()) {
    sys.active = true;
    sys.phase = "wait";
    sys.phaseT = FIRST_DELAY;
    sys.helis = [];
  } else if (sys.active && playerSpeed < leaveSpeed()) {
    sys.active = false;
    sys.helis = [];               // they peel away (existing barrels remain)
  }
  if (!sys.active) return;

  const bound = map.roadHalfWidth - 8;
  for (const h of sys.helis) {
    h.rotorPhase += dt; h.bobPhase += dt; h.beaconPhase += dt;
    h.swayPhase += h.swayFreq * dt;
    h.swayPhase2 += h.swayFreq * 0.41 * dt;
  }

  if (sys.phase === "wait") {
    sys.phaseT -= dt;
    if (sys.phaseT <= 0) {
      const dbl = sys.sortie >= SINGLE_SORTIES;
      // Single chopper roams across the centre; a pair takes the left/right halves
      // and patrols its own side. Drops are staggered (dropDelay).
      sys.helis = dbl
        ? [makeHeli(-bound * 0.5, 0, bound * 0.26),
           makeHeli( bound * 0.5, SECOND_DROP_DELAY, bound * 0.26)]
        : [makeHeli(0, 0, bound * 0.5)];
      sys.phase = "enter";
      sys.phaseT = ENTER_TIME;
    }
  } else if (sys.phase === "enter") {
    sys.phaseT -= dt;
    const f = 1 - Math.max(0, sys.phaseT) / ENTER_TIME;        // 0 → 1
    for (const h of sys.helis) {
      h.y = HELI_OFFSCREEN_Y + (HELI_HOVER_Y - HELI_OFFSCREEN_Y) * f;
      h.x += (h.homeX - h.x) * Math.min(1, dt * 2);            // settle onto station
    }
    if (sys.phaseT <= 0) { sys.phase = "aim"; sys.phaseT = 0; }
  } else if (sys.phase === "aim") {
    sys.phaseT += dt;                                          // counts up
    let allDropped = true;
    for (const h of sys.helis) {
      h.y = HELI_HOVER_Y + Math.sin(h.bobPhase * 2) * 1.5;    // hover bob
      const localT = sys.phaseT - h.dropDelay;
      // Before its turn (and after it has dropped) a chopper just sways on station.
      if (h.dropped || localT < 0) {
        const tx = swayTargetX(h, bound);
        h.x += (tx - h.x) * Math.min(1, dt * 2.2);
        if (!h.dropped) allDropped = false;
        continue;
      }
      allDropped = false;
      // Its drop window: lock onto the player's lane, telegraph, then drop there.
      if (!h.aiming) { h.aiming = true; h.lockX = clampBound(playerX, bound); }
      h.x += Math.sign(h.lockX - h.x) * Math.min(Math.abs(h.lockX - h.x), 50 * dt);
      if (localT >= AIM_TIME) {
        sys.barrels.push({ x: h.lockX, z: playerZ + dropDist(), flame: Math.random() * 6.28, hit: false });
        h.dropped = true;
        h.aiming = false;                                      // reticle off, resume sway
        cbs?.onDrop?.();
      }
    }
    // Both choppers leave together — exit only once every chopper has dropped.
    if (allDropped) { sys.phase = "exit"; sys.phaseT = EXIT_TIME; }
  } else if (sys.phase === "exit") {
    sys.phaseT -= dt;
    const f = 1 - Math.max(0, sys.phaseT) / EXIT_TIME;        // 0 → 1
    for (const h of sys.helis) {
      h.y = HELI_HOVER_Y + (HELI_OFFSCREEN_Y - HELI_HOVER_Y) * f;   // climb out of frame
    }
    if (sys.phaseT <= 0) {
      sys.helis = [];
      sys.sortie++;
      sys.phase = "wait";
      sys.phaseT = RELOAD_TIME;                                // 30s reload
    }
  }
}

// Player hit test against armed barrels. Returns the barrel (caller marks .hit).
export function checkBarrelHit(sys, box) {
  for (const b of sys.barrels) {
    const x1 = b.x - BARREL_HALF_X, x2 = b.x + BARREL_HALF_X;
    const z1 = b.z - BARREL_HALF_Z, z2 = b.z + BARREL_HALF_Z;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) return b;
  }
  return null;
}

// ── Drawing ─────────────────────────────────────────────────────────────────
function drawFlame(ctx, cx, topY, t) {
  const flick = (Math.sin(t * 18) + Math.sin(t * 7.3)) * 0.5;     // -1..1
  const h = 4 + flick;
  disc(ctx, cx, topY - 1, 3, 9);                 // orange base
  disc(ctx, cx, topY - 2, 2, 5);                 // yellow core
  rect(ctx, (cx - 1 + (flick > 0 ? 1 : 0)) | 0, (topY - 2 - h) | 0, 1, (h | 0), 9);
  rect(ctx, cx | 0, (topY - 1 - h) | 0, 1, ((h * 0.7) | 0), 5);   // flicker tip
}

function drawReticle(ctx, sx, sy, t) {
  const on = Math.floor(t * 6) % 2 === 0;
  const c = on ? 6 : 5;                           // blink red / yellow
  rect(ctx, sx - 6, sy - 6, 12, 1, c); rect(ctx, sx - 6, sy + 5, 12, 1, c);
  rect(ctx, sx - 6, sy - 6, 1, 12, c); rect(ctx, sx + 5, sy - 6, 1, 12, c);
  rect(ctx, sx - 1, sy, 2, 1, c);                 // centre tick
  rect(ctx, sx, sy - 1, 1, 2, c);
}

function drawRotor(ctx, cx, cy, t) {
  const ang = t * 26;                             // fast spin
  const blade = (a, len, idx) => {
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let i = -len; i <= len; i++) rect(ctx, (cx + dx * i) | 0, (cy + dy * i) | 0, 1, 1, idx);
  };
  blade(ang, 11, 2);                              // light-gray blade
  blade(ang + Math.PI / 2, 11, 1);                // white blade
  disc(ctx, cx, cy, 2, 4);                        // dark hub
}

export function drawCops(ctx, sys, map, playerZ, playerX) {
  // Barrels (on the road), back-to-front.
  const sorted = sys.barrels.slice().sort((a, b) => b.z - a.z);
  for (const b of sorted) {
    const p = project(map, playerZ, playerX, b);
    if (!p) continue;
    groundShadow(ctx, p.sx, p.sy + BARREL_HALF_Z, BARREL_HALF_X);
    drawSprite(ctx, SPR_BARREL, p.sx - 4, p.sy - 4);
    drawFlame(ctx, p.sx, p.sy - 4, b.flame);
  }

  if (!sys.active || sys.helis.length === 0) return;
  const screenCx = W / 2 + map.biasX;

  // Aiming reticles on the road, one per chopper currently lining up a drop.
  for (const h of sys.helis) {
    if (h.aiming && !h.dropped) {
      const rp = project(map, playerZ, playerX, { x: h.lockX, z: playerZ + dropDist() });
      if (rp) drawReticle(ctx, rp.sx, rp.sy, h.beaconPhase);
    }
  }

  // Choppers (each at its own animated screen position — flies in/out of frame).
  for (const h of sys.helis) {
    const hx = (screenCx + h.x) | 0;
    const hy = h.y | 0;
    drawSprite(ctx, SPR_HELI, hx - HELI_HALF_W, hy - HELI_HALF_H);
    if (Math.floor(h.beaconPhase / 0.18) % 2 === 0) rect(ctx, hx - 1, hy - HELI_HALF_H + 5, 2, 1, 1);
    drawRotor(ctx, hx, hy - 1, h.rotorPhase);
  }
}
