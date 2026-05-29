// Cop chase — two cop cars spawn behind the player when they cross 250 km/h.
//
// Cops cap out at copTopSpeedFrac × player.maxSpeed (slightly below the player's
// top speed), so a perfectly-clean run outpaces them. Every traffic crash drops
// the player's speed and the cops gain ground. Cop contact from behind kicks the
// player forward and drops their speed; cops never take a life (lives only come
// from civilian crashes).
import { PHYS, RACE } from "../config.js";
import { project } from "../road.js";
import { drawSprite, rect, groundShadow } from "../render.js";

// Cop car sprite (built inline). 10w × 16h sedan with a 6w × 2h light bar on
// top. The light-bar colors flip every ~0.12s for a blinking-siren effect — the
// flip happens in drawCops by overriding two cells per frame, so the base sprite
// stores black light-bar pixels that get recoloured at draw time.
const _ = -1;
const COP_SPRITE = [
  [_,_,0,5,5,5,5,5,_,_],   // 0 — roof front
  [_,_,0,6,6,6,12,12,0,_], // 1 — light bar (palette idx 6=red, 12=blue) - placeholder
  [_,_,0,6,12,6,12,6,0,_], // 2 — light bar continues
  [_,0,1,1,1,1,1,1,1,0],   // 3 — windshield band
  [_,0,1,3,3,3,3,3,1,0],   // 4 — windshield (mid gray)
  [0,1,1,3,1,1,1,3,1,1,0], // 5 — cabin
  [0,1,1,1,1,1,1,1,1,1,0], // 6 — body
  [0,1,0,1,1,1,1,1,0,1,0], // 7 — body w/ door seam
  [0,1,1,1,1,1,1,1,1,1,0], // 8 — body
  [0,1,1,1,1,1,1,1,1,1,0], // 9 — body
  [0,1,0,1,1,1,1,1,0,1,0], // 10 — door seam
  [_,0,1,1,3,3,3,3,1,0],   // 11 — rear cabin
  [_,0,1,3,3,3,3,3,1,0],   // 12 — rear window
  [_,0,1,1,1,1,1,1,1,0],   // 13 — trunk
  [_,_,0,9,9,0,0,9,9,0],   // 14 — taillights
  [_,_,_,0,0,0,0,0,0,_],   // 15 — rear bumper
];
// Re-trim row 5/6 to 10 wide (the array above has a couple of 11-wide rows by mistake).
for (const r of COP_SPRITE) while (r.length > 10) r.pop();

const COP_HALF_W = 5;
const COP_HALF_Z = 8;

export function makeCopsSystem() {
  return {
    spawned: false,
    list: [],
    blinkPhase: 0,
  };
}

function copThresholdSpeed() {
  return PHYS.maxSpeed * (RACE.copTriggerKmh / PHYS.topSpeedKmh);
}

function copTopSpeed() {
  return PHYS.maxSpeed * RACE.copTopSpeedFrac;
}

export function updateCops(sys, dt, playerZ, playerX, playerSpeed, map, cbs) {
  sys.blinkPhase += dt;

  // Spawn the chase the first time the player crosses 250 km/h.
  if (!sys.spawned && playerSpeed >= copThresholdSpeed()) {
    sys.spawned = true;
    const halfRoad = map.roadHalfWidth;
    sys.list.push({
      z: playerZ - RACE.copSpawnGapZ,
      x: -halfRoad * 0.35,
      speed: playerSpeed * 0.7,
      targetX: -halfRoad * 0.35,
      laneRetarget: 0.6,
      ramCooldown: 0,
    });
    sys.list.push({
      z: playerZ - RACE.copSpawnGapZ - 12,
      x: halfRoad * 0.35,
      speed: playerSpeed * 0.7,
      targetX: halfRoad * 0.35,
      laneRetarget: 0.4,
      ramCooldown: 0,
    });
    cbs?.onSpawn?.();
  }

  if (!sys.spawned) return;

  const top = copTopSpeed();
  for (const c of sys.list) {
    // Speed: target = min(playerSpeed * 1.03, copTopSpeed). They try to gain ~3%
    // on the player but are hard-capped below the player's max. Result: a clean
    // 300 km/h player runs away; a slowed player gets caught.
    const target = Math.min(top, playerSpeed * 1.03);
    if (c.speed < target) c.speed = Math.min(target, c.speed + 16 * dt);
    else if (c.speed > target) c.speed = Math.max(target, c.speed - 12 * dt);
    c.z += c.speed * dt;

    // Lateral targeting — try to align with the player's x, with a slight side
    // offset so the two cops flank rather than overlap.
    c.laneRetarget -= dt;
    if (c.laneRetarget <= 0) {
      c.laneRetarget = 0.5 + Math.random() * 0.6;
      const offset = (c === sys.list[0]) ? -6 : 6;
      c.targetX = playerX + offset;
    }
    const dx = c.targetX - c.x;
    const lerp = 40;
    c.x += Math.sign(dx) * Math.min(Math.abs(dx), lerp * dt);

    // Ram detection: if cop is right behind player and overlapping laterally,
    // they push the player forward (apply slowdown) on a cooldown.
    c.ramCooldown = Math.max(0, c.ramCooldown - dt);
    const dz = playerZ - c.z;   // positive when cop is BEHIND player
    if (c.ramCooldown <= 0 && dz > 0 && dz < 12 && Math.abs(c.x - playerX) < 12) {
      c.ramCooldown = 0.9;
      cbs?.onRam?.(c);
    }
  }
}

export function drawCops(ctx, sys, map, playerZ, playerX) {
  if (!sys.spawned) return;
  // Blink colors: alternate light-bar tint every ~0.12s. We swap palette indices
  // 6 (red) and 12 (blue) by drawing a recolored top band over the sprite.
  const blinkOn = Math.floor(sys.blinkPhase / 0.12) % 2 === 0;
  for (const c of sys.list) {
    const p = project(map, playerZ, playerX, c);
    if (!p) continue;
    groundShadow(ctx, p.sx, p.sy + COP_HALF_Z - 1, COP_HALF_W);
    drawSprite(ctx, COP_SPRITE, p.sx - COP_HALF_W, p.sy - COP_HALF_Z);
    // Override light-bar pixels with the blink pattern.
    const left = blinkOn ? 12 : 6;
    const right = blinkOn ? 6 : 12;
    const bx = p.sx - COP_HALF_W;
    const by = p.sy - COP_HALF_Z;
    rect(ctx, bx + 3, by + 1, 2, 1, left);
    rect(ctx, bx + 5, by + 1, 2, 1, right);
    rect(ctx, bx + 3, by + 2, 2, 1, right);
    rect(ctx, bx + 5, by + 2, 2, 1, left);
  }
}

export function checkCopRam(sys, box) {
  // Already handled via the onRam callback inside updateCops; this is a no-op
  // exposed for symmetry with other entity systems.
  return null;
}
