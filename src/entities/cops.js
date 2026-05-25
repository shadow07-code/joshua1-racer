// Chaser system: cops (city) / tigers + elephants (jungle), driven by a wanted meter.
import { PHYS, WANTED } from "../config.js";
import { project } from "../road.js";
import { drawSprite } from "../render.js";
import { SPR_COP, SPR_TIGER, SPR_ELEPHANT } from "../sprites.js";

const KIND_DEF = {
  cop:      { sprite: SPR_COP,      w: 10, h: 14, halfX: 5, halfZ: 7,  speedBoost: 1.05, leap: 0 },
  tiger:    { sprite: SPR_TIGER,    w: 12, h: 12, halfX: 5, halfZ: 6,  speedBoost: 1.10, leap: 1 },
  elephant: { sprite: SPR_ELEPHANT, w: 16, h: 14, halfX: 8, halfZ: 7,  speedBoost: 0.85, leap: 0, blocker: true },
};

export function makeChasers() {
  return {
    list: [],
    wanted: 0,                // 0..5
    cleanTimer: WANTED.cleanWindowToDecay,
    lastTier: 0,
    everEscaped: false,
    trapActive: false,
  };
}

export function bumpWanted(sys, delta, onSiren) {
  const before = Math.floor(sys.wanted);
  sys.wanted = Math.max(0, Math.min(WANTED.max, sys.wanted + delta));
  sys.cleanTimer = 0;
  const after = Math.floor(sys.wanted);
  if (after > before && onSiren) onSiren();
}

export function updateChasers(sys, dt, playerZ, playerX, map, cbs) {
  // Decay wanted if clean.
  sys.cleanTimer += dt;
  if (sys.cleanTimer > WANTED.cleanWindowToDecay) {
    sys.wanted = Math.max(0, sys.wanted - WANTED.decayPerSecondClean * dt);
    if (sys.wanted === 0 && !sys.everEscaped && Math.floor(sys.lastTier) >= WANTED.max) {
      sys.everEscaped = true;
      cbs?.onEscapeMax?.();
    }
  }

  const stars = Math.floor(sys.wanted);

  // Determine desired counts.
  let desiredTier1 = 0;
  let desiredTier2 = 0;
  if (stars >= 1) desiredTier1 = 1;
  if (stars >= 3) desiredTier1 = 2;
  if (stars >= 5) {
    // Jungle escalates with elephant; city just gets two ram-happy cops (already in tier1=2).
    if (map.chaserKindTier2 === "elephant") desiredTier2 = 1;
  }

  const tier1Kind = map.chaserKindTier1;
  const tier2Kind = map.chaserKindTier2;

  const t1Count = sys.list.filter(c => c.kind === tier1Kind).length;
  const t2Count = sys.list.filter(c => c.kind === tier2Kind && tier2Kind !== tier1Kind).length;

  // Spawn missing tier-1 chasers behind the player.
  for (let i = t1Count; i < desiredTier1; i++) {
    sys.list.push(spawnChaser(tier1Kind, playerZ - 22 - i * 6, (i % 2 ? 1 : -1) * 8));
    if (tier1Kind === "cop") cbs?.onSiren?.();
    if (tier1Kind === "tiger") cbs?.onGrowl?.();
  }

  // Spawn elephant (tier 2 jungle) ahead, blocking lane.
  if (tier2Kind !== tier1Kind) {
    for (let i = t2Count; i < desiredTier2; i++) {
      sys.list.push(spawnChaser(tier2Kind, playerZ + 35, playerX * 0.6));
      cbs?.onTrumpet?.();
      sys.trapActive = true;
    }
  }
  if (desiredTier2 === 0) sys.trapActive = false;

  // Behavior per chaser.
  for (const c of sys.list) {
    const def = KIND_DEF[c.kind];
    // Lateral steer toward player (with delay).
    c.laneRetarget -= dt;
    if (c.laneRetarget <= 0) {
      c.laneRetarget = 0.25 + Math.random() * 0.3;
      // Tier 2 elephant herds: tracks playerX more aggressively.
      const tracking = def.blocker ? 0.9 : (0.6 + 0.1 * stars);
      c.laneTarget = playerX * tracking + (Math.random() * 6 - 3);
    }
    const dx = c.laneTarget - c.x;
    const lerpSpeed = def.blocker ? 18 : (28 + 5 * stars);
    c.x += Math.sign(dx) * Math.min(Math.abs(dx), lerpSpeed * dt);

    // Forward speed.
    let targetSpeed;
    if (def.blocker) {
      // Elephant decelerates into the player's lane; matches player's speed when close.
      const dz = c.z - playerZ;
      if (dz > 12) {
        targetSpeed = PHYS.cruiseSpeed * 0.55;
      } else {
        targetSpeed = Math.max(PHYS.cruiseSpeed * 0.35, PHYS.cruiseSpeed * 0.7 - (12 - dz) * 1.5);
      }
    } else {
      const playerSpeedHint = (cbs?.playerSpeed?.() ?? PHYS.cruiseSpeed);
      targetSpeed = playerSpeedHint * def.speedBoost;
      // While trap is active, tigers ramp up to ensure pincer.
      if (sys.trapActive && c.kind === "tiger") targetSpeed *= 1.15;
    }
    if (c.speed < targetSpeed) c.speed += 16 * dt;
    else if (c.speed > targetSpeed) c.speed -= 8 * dt;
    c.z += c.speed * dt;

    // Tiger leap — periodically burst forward to close gaps.
    if (def.leap && stars >= 2) {
      c.leapCooldown -= dt;
      if (c.leapCooldown <= 0 && c.z < playerZ - 4) {
        c.z += 6 + Math.random() * 3;
        c.leapCooldown = 2.5 + Math.random() * 2;
        cbs?.onGrowl?.();
      }
    }

    // Prune if fallen way behind.
    if (c.z < playerZ - 40) c.dead = true;
  }
  sys.list = sys.list.filter(c => !c.dead);

  sys.lastTier = sys.wanted;
}

function spawnChaser(kind, z, x) {
  return {
    kind,
    z, x,
    speed: PHYS.cruiseSpeed * 0.8,
    laneTarget: x,
    laneRetarget: 0,
    leapCooldown: 1.0 + Math.random() * 2,
    dead: false,
  };
}

export function drawChasers(ctx, sys, map, playerZ, playerX) {
  for (const c of sys.list) {
    const def = KIND_DEF[c.kind];
    const p = project(map, playerZ, playerX, c);
    if (!p) continue;
    drawSprite(ctx, def.sprite, p.sx - def.halfX, p.sy - (def.h / 2 | 0));
  }
}

export function checkChaserHit(sys, box) {
  for (const c of sys.list) {
    const def = KIND_DEF[c.kind];
    const x1 = c.x - def.halfX, x2 = c.x + def.halfX;
    const z1 = c.z - def.halfZ * 0.5, z2 = c.z + def.halfZ * 0.5;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) return c;
  }
  return null;
}
