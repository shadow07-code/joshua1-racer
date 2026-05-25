// Player car — auto-accelerate with a start-of-race speed ramp, brake, steer, slip.
import { PHYS, PLAYER_Y, W } from "../config.js";
import { SPR_PLAYER } from "../sprites.js";
import { drawSprite } from "../render.js";
import { roadCenterX } from "../road.js";

export function makePlayer() {
  return {
    z: 0,            // world distance traveled (meters)
    x: 0,            // lateral offset from road center (pixels)
    speed: PHYS.startSpeed,
    boost: 0,        // seconds of nitro remaining
    slip: 0,         // seconds of slip remaining (reverses steering)
    offRoad: false,
    multiplier: 1,
    multTime: 0,
    lastSpeedTier: 0,
    invuln: 0,
    raceTime: 0,     // seconds since race started (drives the speed ramp)
    oilTimer: 0,     // seconds the car is still affected by an oil spill
    _wasBraking: false,
  };
}

// Smoothly ramp the player's target speed from startSpeed to maxSpeed.
// Player tops out at maxSpeed — strictly above any AI's top-speed cap, so a
// clean run wins.
function rampTarget(raceTime) {
  const t = Math.max(0, Math.min(1, raceTime / PHYS.rampSeconds));
  // Smoothstep eases in/out — feels natural.
  const e = t * t * (3 - 2 * t);
  return PHYS.startSpeed + (PHYS.maxSpeed - PHYS.startSpeed) * e;
}

export function updatePlayer(p, dt, input, map, callbacks) {
  p.raceTime += dt;

  // Target speed.
  let target = rampTarget(p.raceTime);
  if (p.boost > 0) {
    target = Math.max(target, PHYS.maxSpeed);
    p.boost = Math.max(0, p.boost - dt);
  }
  if (p.offRoad) target *= 0.55;

  if (input.brake) {
    p.speed -= PHYS.brakeDecel * dt;
  } else if (p.speed < target) {
    p.speed = Math.min(target, p.speed + PHYS.accel * dt);
  } else if (p.speed > target) {
    p.speed = Math.max(target, p.speed - PHYS.drag * dt);
  }
  if (p.speed < 4) p.speed = 4;
  if (p.speed > PHYS.maxSpeed) p.speed = PHYS.maxSpeed;

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
  const speedFrac = p.speed / PHYS.maxSpeed;
  const steerScale = 1 - (1 - PHYS.steerSpeedFactor) * speedFrac;
  p.x += steer * PHYS.steerSpeed * steerScale * dt;

  // Clamp lateral travel to a little past the shoulders (off-road allowed).
  const limit = map.roadHalfWidth + 12;
  if (p.x > limit) p.x = limit;
  if (p.x < -limit) p.x = -limit;

  // Forward distance.
  p.z += p.speed * dt;

  // Off-road check.
  p.offRoad = Math.abs(p.x) > map.roadHalfWidth - PHYS.carHalfWidth;

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
  // F1 sprite is 16w × 24h. Anchor by center.
  drawSprite(ctx, SPR_PLAYER, (cx + p.x - 8 + wobble) | 0, PLAYER_Y - 12);
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
