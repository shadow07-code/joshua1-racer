// Player car — auto-accelerate with a start-of-race speed ramp, brake, steer, slip.
import { PHYS, PLAYER_Y, W } from "../config.js";
import { SPR_PLAYER, SPR_PLAYER_L, SPR_PLAYER_R } from "../sprites.js";
import { drawSpriteNN, groundShadow, ring, disc, rect } from "../render.js";
import { roadCenterX } from "../road.js";

// Player car drawn at native 1× so the pixels stay crisp (the old 0.8 downscale
// is what made it look blurry).
const PLAYER_SCALE = 1.0;

export function makePlayer() {
  return {
    z: 0,            // world distance traveled (meters)
    x: 0,            // lateral offset from road center (pixels)
    speed: PHYS.startSpeed,
    boost: 0,        // seconds of nitro remaining
    slip: 0,         // seconds of slip remaining (reverses steering)
    edgeContact: 0,  // which fence the car is currently against (-1/0/+1)
    bounce: 0,       // remaining inward rubber-fence rebound (px)
    multiplier: 1,
    multTime: 0,
    lastSpeedTier: 0,
    invuln: 0,
    raceTime: 0,     // seconds since race started (drives the speed ramp)
    oilTimer: 0,     // seconds the car is still affected by an oil spill
    lives: 3,        // endless survival — 3 hits and you're out
    rampage: 0,      // seconds of NITROUS RAMPAGE remaining (smash through traffic)
    rampageClear: 0, // seconds of cleared-road grace after a rampage ends
    steerVis: 0,     // effective steer this frame (drives the lean sprite)
    _wasBraking: false,
  };
}

// Two-phase target ramp:
//   Phase 1: punchy linear climb to ~100 km/h equivalent in `rampPhase1Seconds`.
//   Phase 2: slow smoothstep grind from there up to maxSpeed (200 km/h).
function rampTarget(raceTime) {
  const p1End = PHYS.rampPhase1Seconds;
  const p2End = p1End + PHYS.rampPhase2Seconds;
  // Internal m/s value corresponding to the phase-1 ceiling (100 km/h).
  const phase1Top = PHYS.maxSpeed * (PHYS.phase1Kmh / PHYS.topSpeedKmh);

  if (raceTime <= p1End) {
    const t = raceTime / p1End;
    return PHYS.startSpeed + (phase1Top - PHYS.startSpeed) * t;
  }
  if (raceTime >= p2End) return PHYS.maxSpeed;
  const t = (raceTime - p1End) / (p2End - p1End);
  const e = t * t * (3 - 2 * t);
  return phase1Top + (PHYS.maxSpeed - phase1Top) * e;
}

export function updatePlayer(p, dt, input, map, callbacks) {
  p.raceTime += dt;

  // Target speed. Nitrous (boost) lifts both the target and the hard cap to
  // maxSpeed * boostFactor, so a rampage genuinely surges past normal top speed.
  const boostCap = PHYS.maxSpeed * (PHYS.boostFactor || 1);
  let target = rampTarget(p.raceTime);
  if (p.boost > 0) {
    target = boostCap;
    p.boost = Math.max(0, p.boost - dt);
  }

  if (p.speed < target) {
    p.speed = Math.min(target, p.speed + PHYS.accel * dt);
  } else if (p.speed > target) {
    p.speed = Math.max(target, p.speed - PHYS.drag * dt);
  }
  if (p.speed < 4) p.speed = 4;     // never fully stop — always a slow crawl minimum
  const cap = p.boost > 0 ? boostCap : PHYS.maxSpeed;
  if (p.speed > cap) p.speed = cap;

  // Threshold-crossing accent.
  const tier =
    p.speed >= PHYS.cruiseSpeed * 1.3 ? 2 :
    p.speed >= PHYS.cruiseSpeed * 0.85 ? 1 : 0;
  if (tier > p.lastSpeedTier && callbacks?.onAccelAccent) callbacks.onAccelAccent();
  p.lastSpeedTier = tier;

  // Steering — speed-scaled so high-speed turns are less twitchy.
  let steer = input.steer;
  if (p.slip > 0) {
    steer = -steer;
    p.slip = Math.max(0, p.slip - dt);
  }
  p.steerVis = steer;   // remember effective direction for the lean sprite
  const speedFrac = p.speed / PHYS.maxSpeed;
  const steerScale = 1 - (1 - PHYS.steerSpeedFactor) * speedFrac;
  p.x += steer * PHYS.steerSpeed * steerScale * dt;

  // Rubber-fence boundaries — the car can't leave the asphalt. Driving into an
  // edge pins it there and shaves a little speed (a one-time bump), then a rubber
  // spring pushes it back onto the road the moment the player eases off. The bump
  // (sound + speed loss) is edge-triggered so holding into the fence can't spam it.
  const bound = map.roadHalfWidth - PHYS.carHalfWidth;
  const holdingIntoFence =
    (p.edgeContact > 0 && steer > 0) || (p.edgeContact < 0 && steer < 0);
  if (Math.abs(p.x) >= bound) {
    const side = p.x > 0 ? 1 : -1;
    p.x = side * bound;
    if (p.edgeContact !== side) {                 // fresh contact with this edge
      p.edgeContact = side;
      p.speed = Math.max(PHYS.startSpeed * 0.6, p.speed * PHYS.fenceSpeedKeep);
      if (callbacks?.onFenceBump) callbacks.onFenceBump();
    }
    p.bounce = -side * PHYS.fenceBounce;           // arm the inward rebound
  }

  // Release the spring only when the player isn't actively pressing into the
  // fence, so the car bounces back onto the road as soon as they let off.
  if (p.bounce && !holdingIntoFence) {
    const step = p.bounce * Math.min(1, dt * 12);
    p.x += step;
    p.bounce -= step;
    if (Math.abs(p.bounce) < 0.1) p.bounce = 0;
  }

  // Re-arm the bump once the car is clear of the fence and not holding into it.
  if (Math.abs(p.x) < bound - 2 && !holdingIntoFence) p.edgeContact = 0;

  // Forward distance.
  p.z += p.speed * dt;

  if (p.multTime > 0) {
    p.multTime = Math.max(0, p.multTime - dt);
    if (p.multTime === 0) p.multiplier = 1;
  }
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
}

// Apply a proportional speed loss for a collision. severity 0..1 (1 = drop to 0).
// e.g., small obstacle severity 0.35; tiger/elephant severity 0.7.
export function applyCollisionLoss(p, severity, invulnSeconds = 0.6) {
  p.speed = Math.max(PHYS.startSpeed * 0.5, p.speed * (1 - severity));
  p.invuln = Math.max(p.invuln, invulnSeconds);
}

export function drawPlayer(ctx, p, map) {
  if (p.invuln > 0 && (Math.floor(performance.now() / 60) % 2 === 0)) return;
  const cx = roadCenterX(map, p.z, p.x, 0);
  // Slight wobble when slipping on oil or in legacy slip state.
  const slipping = p.oilTimer > 0 || p.slip > 0;
  const wobble = slipping ? Math.sin(performance.now() / 28) * 1 : 0;
  // Drawn size of the 16×24 sprite at PLAYER_SCALE (centre-anchored on the car).
  const halfW = 12 * PLAYER_SCALE / 2;   // 6 — smaller player sprite (12×18)
  const halfH = 18 * PLAYER_SCALE / 2;   // 9
  const cxp = (cx + p.x) | 0;
  // RAMPAGE nitrous flames blasting from the twin exhausts (behind the car).
  if (p.rampage > 0) drawNitroFlames(ctx, cxp, (PLAYER_Y + halfH) | 0);
  // Grounding shadow under the car, then the F1 sprite — leaned into the turn
  // while steering (input-driven feedback only; the car sits still otherwise).
  const spr = p.steerVis > 0.3 ? SPR_PLAYER_R : p.steerVis < -0.3 ? SPR_PLAYER_L : SPR_PLAYER;
  groundShadow(ctx, (cx + p.x) | 0, PLAYER_Y + halfH - 3, 6);
  drawSpriteNN(ctx, spr, cx + p.x - halfW + wobble, PLAYER_Y - halfH, PLAYER_SCALE);
  // RAMPAGE aura — a pulsing fiery ring around the car while nitrous is active.
  if (p.rampage > 0) {
    const cyp = (PLAYER_Y) | 0;
    const blink = Math.floor(performance.now() / 70) % 2 === 0;
    ring(ctx, cxp, cyp, 12, blink ? 5 : 9);    // yellow / orange
    ring(ctx, cxp, cyp, 13, blink ? 9 : 5);
  }
}

// Twin nitrous flames out the back of the car — flickering orange/yellow tongues.
function drawNitroFlames(ctx, cx, baseY, t = performance.now()) {
  const flick = (Math.sin(t / 40) + Math.sin(t / 17)) * 0.5;  // -1..1
  for (const ox of [-3, 3]) {
    const len = 6 + Math.round(flick * 2 + 2);
    disc(ctx, cx + ox, baseY + 2, 2, 9);                      // orange root
    rect(ctx, (cx + ox) | 0, baseY + 1, 1, len, 9);           // orange tongue
    rect(ctx, (cx + ox) | 0, baseY + 1, 1, Math.max(1, len - 3), 5); // yellow core
    if (flick > 0.4) rect(ctx, (cx + ox) | 0, baseY + len, 1, 2, 9); // spit tip
  }
}

// Hit box in (z, x) world coords.
export function playerBox(p) {
  return {
    x1: p.x - PHYS.carHalfWidth,
    x2: p.x + PHYS.carHalfWidth,
    z1: p.z - PHYS.carHalfHeight * 0.5,
    z2: p.z + PHYS.carHalfHeight * 0.5,
  };
}
