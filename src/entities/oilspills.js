// Oil spills — small slicks placed at fixed lap positions. Driving over one
// (player or AI) briefly drops the car's speed. Two spills per lap.
import { RACE } from "../config.js";
import { project, VIEW_AHEAD } from "../road.js";
import { drawSprite } from "../render.js";
import { SPR_OIL_SPILL } from "../sprites.js";

const OIL = { sprite: SPR_OIL_SPILL, w: 12, h: 8, halfX: 6, halfZ: 4 };

// Two oil spills per lap at deterministic z offsets so all racers see the same
// hazards. Lateral position randomized per race for variety.
const SPILLS_PER_LAP = 2;

export function makeOilSystem(map) {
  const list = [];
  for (let lap = 0; lap < RACE.totalLaps; lap++) {
    for (let i = 0; i < SPILLS_PER_LAP; i++) {
      const z = lap * RACE.lapLength + (RACE.lapLength * (i + 1)) / (SPILLS_PER_LAP + 1);
      const halfRoad = map.roadHalfWidth;
      // Place inside the road but away from dead center so player can steer clear.
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (4 + Math.random() * (halfRoad - 14));
      list.push({ z, x, alive: true });
    }
  }
  return { list, hitsPlayer: 0 };
}

export function drawOilSpills(ctx, sys, map, playerZ, playerX) {
  for (const o of sys.list) {
    if (!o.alive) continue;
    const dist = o.z - playerZ;
    if (dist < -4 || dist > VIEW_AHEAD) continue;
    const p = project(map, playerZ, playerX, o);
    if (!p) continue;
    drawSprite(ctx, OIL.sprite, p.sx - OIL.halfX, p.sy - OIL.halfZ);
  }
}

// Returns the spill hit, or null. NOT consumed — spills persist so AI can
// also hit them. Caller is expected to gate on its own cooldown.
export function checkOilHit(sys, box) {
  for (const o of sys.list) {
    if (!o.alive) continue;
    const x1 = o.x - OIL.halfX, x2 = o.x + OIL.halfX;
    const z1 = o.z - OIL.halfZ, z2 = o.z + OIL.halfZ;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) return o;
  }
  return null;
}

// AI uses a point-in-spill test against (z, x).
export function pointInOil(sys, z, x) {
  for (const o of sys.list) {
    if (!o.alive) continue;
    if (Math.abs(z - o.z) <= OIL.halfZ && Math.abs(x - o.x) <= OIL.halfX) return o;
  }
  return null;
}
