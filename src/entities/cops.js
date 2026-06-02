// Police HELICOPTER chase — replaces the old (ineffective) cop cars.
//
// Once the player crosses 250 km/h a police chopper flies into the upper part
// of the road ahead. Every ~15s it locks onto the player's lane (a blinking
// reticle telegraphs the spot for ~1.1s) and drops a FLAMING BARREL onto the
// road. The barrel is a static hazard that scrolls toward the player — touch it
// and you lose a life, so steer clear. Slow back below ~235 km/h and the
// chopper peels away.
import { W, PHYS, RACE } from "../config.js";
import { project, yToDist } from "../road.js";
import { drawSprite, rect, disc, groundShadow } from "../render.js";
import { SPR_HELI, SPR_BARREL } from "../sprites.js";

const HELI_W = 14, HELI_H = 16;
const HELI_HALF_W = HELI_W / 2, HELI_HALF_H = HELI_H / 2;
const HELI_SCREEN_Y = 52;            // hovers in the upper road (the "marked area")
const DROP_INTERVAL = 15;            // seconds between payloads
const AIM_TIME = 1.1;                // reticle telegraph before each drop
const BARREL_HALF_X = 4;
const BARREL_HALF_Z = 4;

function triggerSpeed() { return PHYS.maxSpeed * (RACE.copTriggerKmh / PHYS.topSpeedKmh); }
function leaveSpeed()   { return PHYS.maxSpeed * ((RACE.copTriggerKmh - 15) / PHYS.topSpeedKmh); }
function dropDist()     { return yToDist(HELI_SCREEN_Y); }

export function makeCopsSystem() {
  return {
    active: false,
    x: 0,                 // chopper lateral offset (road px), like an entity x
    dropTimer: 4,         // first payload ~4s after it appears
    aiming: false,
    lockX: 0,
    barrels: [],
    rotorPhase: 0,
    bobPhase: 0,
    beaconPhase: 0,
  };
}

export function updateCops(sys, dt, playerZ, playerX, playerSpeed, map, cbs) {
  sys.rotorPhase += dt;
  sys.bobPhase += dt;
  sys.beaconPhase += dt;

  // Activate / deactivate with a little hysteresis.
  if (!sys.active && playerSpeed >= triggerSpeed()) {
    sys.active = true;
    sys.dropTimer = 4;
    sys.aiming = false;
    sys.x = playerX;
  } else if (sys.active && playerSpeed < leaveSpeed()) {
    sys.active = false;
  }

  const halfRoad = map.roadHalfWidth;
  const bound = halfRoad - 8;

  if (sys.active) {
    sys.dropTimer -= dt;

    // Aiming: lock onto the player's current lane and telegraph the drop spot.
    if (!sys.aiming && sys.dropTimer <= AIM_TIME) {
      sys.aiming = true;
      sys.lockX = Math.max(-bound, Math.min(bound, playerX));
    }

    // Steer the chopper: drift toward the player's column, plus a gentle sweep.
    // While aiming it homes onto the locked x so the drop reads as deliberate.
    const sweep = Math.sin(sys.bobPhase * 0.8) * halfRoad * 0.25;
    const targetX = sys.aiming ? sys.lockX : Math.max(-bound, Math.min(bound, playerX * 0.6 + sweep));
    const dx = targetX - sys.x;
    sys.x += Math.sign(dx) * Math.min(Math.abs(dx), 45 * dt);

    // Drop the payload.
    if (sys.dropTimer <= 0) {
      sys.barrels.push({ x: sys.lockX, z: playerZ + dropDist(), flame: Math.random() * 6.28, hit: false });
      sys.dropTimer = DROP_INTERVAL;
      sys.aiming = false;
      cbs?.onDrop?.();
    }
  }

  // Barrels are static world hazards — advance their flame anim, cull when passed.
  for (const b of sys.barrels) b.flame += dt;
  sys.barrels = sys.barrels.filter(b => !b.hit && b.z > playerZ - 16);
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

  if (!sys.active) return;

  // Aiming reticle on the road at the locked drop spot.
  if (sys.aiming) {
    const rp = project(map, playerZ, playerX, { x: sys.lockX, z: playerZ + dropDist() });
    if (rp) drawReticle(ctx, rp.sx, rp.sy, sys.beaconPhase);
  }

  // Chopper overlay in the upper road.
  const screenCx = W / 2 + map.biasX;
  const hx = (screenCx + sys.x) | 0;
  const hy = (HELI_SCREEN_Y + Math.sin(sys.bobPhase * 2) * 1.5) | 0;
  drawSprite(ctx, SPR_HELI, hx - HELI_HALF_W, hy - HELI_HALF_H);
  // Blinking siren beacon over the body.
  if (Math.floor(sys.beaconPhase / 0.18) % 2 === 0) rect(ctx, hx - 1, hy - HELI_HALF_H + 5, 2, 1, 1);
  // Spinning main rotor over the body centre.
  drawRotor(ctx, hx, hy - 1, sys.rotorPhase);
}
