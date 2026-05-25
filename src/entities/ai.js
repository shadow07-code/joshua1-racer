// AI racers — 5 blue F1s on a racing grid with tiered speeds.
//
// Grid layout (player always at the back, z = 0):
//   AI 0 — pole position, front of visible screen   (z = 90, x = -22)
//   AI 1 — P2                                       (z = 72, x = +22)
//   AI 2 — P3                                       (z = 54, x = -22)
//   AI 3 — P4                                       (z = 36, x = +22)
//   AI 4 — P5, just ahead of player                 (z = 18, x = -22)
//
// Speed tiers:
//   - AI 0 & AI 1 (top two): startSpeed = +5% of player, topSpeed cap = 95% of player.maxSpeed
//   - AI 2, 3, 4:           startSpeed = +3% of player, topSpeed cap = 93% of player.maxSpeed
//
// Same start-of-race smoothstep ramp as the player, so the early race has all
// six cars climbing at similar rates. Player's slightly steeper slope (ramps to
// 90 vs AI's 85.5/83.7) means the gap closes over the back half of the race.
//
// Rubber-banding (AI ahead of player slows down) keeps the race close even when
// the player crashes or hits an oil spill.
import { PHYS } from "../config.js";
import { project } from "../road.js";
import { drawSprite } from "../render.js";
import { AI_SKINS } from "../sprites.js";
import { pointInOil } from "./oilspills.js";

const AI_HALF_W = 7;
const AI_HALF_H = 10;

// Grid geometry — chosen so the back AI sits just ahead of the player.
const GRID_SPACING_Z = 18;
const GRID_FRONT_Z = 90;                    // pole position (front of visible screen)
const GRID_LANES = [-22, +22, -22, +22, -22]; // alternating sides

function rubberBandMul(gap) {
  // gap > 0 → AI is ahead of the player. Slow them down. Speed them up when behind.
  const m = 1 - gap * 0.001;
  return Math.max(0.85, Math.min(1.20, m));
}

function rampFraction(raceTime) {
  const t = Math.max(0, Math.min(1, raceTime / PHYS.rampSeconds));
  return t * t * (3 - 2 * t);  // smoothstep — matches player
}

export function makeAI(count, difficulty, startZ, map) {
  const isHard = difficulty === "hard";
  const list = [];

  for (let i = 0; i < count; i++) {
    const isTop2 = i < 2;
    // Top 2: +5% start, 95% cap. Others: +3% start, 93% cap.
    const startMul    = isTop2 ? 1.05 : 1.03;
    const topFrac     = isTop2 ? 0.95 : 0.93;
    const startSpeed  = PHYS.startSpeed * startMul;
    const topSpeed    = PHYS.maxSpeed   * topFrac;

    list.push({
      id: i,
      skin: AI_SKINS[i % AI_SKINS.length],
      z: startZ + GRID_FRONT_Z - i * GRID_SPACING_Z,
      x: GRID_LANES[i] !== undefined ? GRID_LANES[i] : 0,
      startSpeed,
      topSpeed,
      speed: startSpeed,
      laneTarget: GRID_LANES[i] !== undefined ? GRID_LANES[i] : 0,
      reTarget: 0.4,                 // hold grid lane for the first half-second
      reactionDelay: isHard ? 0.10 : 0.30,
      passed: false,
      raceTime: 0,
      oilTimer: 0,
      smoke: [],
      _smokeTimer: 0,
      tier: isTop2 ? "top" : "mid",
    });
  }
  return { list, difficulty };
}

export function updateAI(sys, dt, playerZ, map, hazards, onPassed, oils) {
  for (const a of sys.list) {
    a.raceTime += dt;

    // Oil-spill check.
    if (oils && a.oilTimer <= 0) {
      const hit = pointInOil(oils, a.z, a.x);
      if (hit) a.oilTimer = 1.0;
    }
    if (a.oilTimer > 0) a.oilTimer = Math.max(0, a.oilTimer - dt);

    // Ramp-based target — same smoothstep shape as the player. AI ramps from
    // its own startSpeed up to its own topSpeed cap.
    const ramp = rampFraction(a.raceTime);
    const baseTarget = a.startSpeed + (a.topSpeed - a.startSpeed) * ramp;
    const rb = rubberBandMul(a.z - playerZ);
    let target = baseTarget * rb;
    if (a.oilTimer > 0) target *= 0.45;
    // Hard upper bound: never exceed 98% of player.maxSpeed, even with
    // rubber-band boost. Keeps player's max strictly the fastest in the field.
    target = Math.min(target, PHYS.maxSpeed * 0.98);

    if (a.speed < target) a.speed = Math.min(target, a.speed + 14 * dt);
    else if (a.speed > target) a.speed = Math.max(target, a.speed - 18 * dt);

    a.z += a.speed * dt;

    // Lane targeting — bias away from upcoming hazards and oil spills.
    a.reTarget -= dt;
    if (a.reTarget <= 0) {
      a.reTarget = a.reactionDelay + Math.random() * 0.6;
      let bias = 0;
      const look = 40;
      if (hazards && hazards.list) {
        for (const h of hazards.list) {
          const dz = h.z - a.z;
          if (dz > 0 && dz < look) {
            const dx = h.x - a.x;
            bias += -Math.sign(dx) * (1 - dz / look) * 10;
          }
        }
      }
      if (oils) {
        for (const o of oils.list) {
          if (!o.alive) continue;
          const dz = o.z - a.z;
          if (dz > 0 && dz < look) {
            const dx = o.x - a.x;
            bias += -Math.sign(dx) * (1 - dz / look) * 12;
          }
        }
      }
      const lane = (Math.random() * 2 - 1) * (map.roadHalfWidth - 12);
      a.laneTarget = Math.max(-(map.roadHalfWidth - 10), Math.min(map.roadHalfWidth - 10, lane + bias));
    }
    const lerpSpeed = sys.difficulty === "hard" ? 38 : 24;
    const dx = a.laneTarget - a.x;
    a.x += Math.sign(dx) * Math.min(Math.abs(dx), lerpSpeed * dt);

    if (!a.passed && a.z < playerZ - 4) {
      a.passed = true;
      onPassed?.();
    }
  }
}

export function drawAI(ctx, sys, map, playerZ, playerX) {
  for (const a of sys.list) {
    const p = project(map, playerZ, playerX, a);
    if (!p) continue;
    drawSprite(ctx, a.skin, p.sx - 8, p.sy - 12);
  }
}

export function checkAIHit(sys, box) {
  for (const a of sys.list) {
    const x1 = a.x - AI_HALF_W, x2 = a.x + AI_HALF_W;
    const z1 = a.z - AI_HALF_H * 0.5, z2 = a.z + AI_HALF_H * 0.5;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) return a;
  }
  return null;
}

export function playerPosition(sys, playerZ) {
  let ahead = 0;
  for (const a of sys.list) if (a.z > playerZ) ahead++;
  return ahead + 1;
}
export function totalRacers(sys) { return sys.list.length + 1; }
