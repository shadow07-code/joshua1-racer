// Oil spills — small slicks placed at fixed lap positions. Driving over one
// (player or AI) briefly drops the car's speed. Two spills per lap.
import { RACE } from "../config.js";
import { project, VIEW_AHEAD } from "../road.js";
import { drawSprite } from "../render.js";
import { SPR_OIL_SPILL } from "../sprites.js";

const OIL = { sprite: SPR_OIL_SPILL, w: 12, h: 8, halfX: 6, halfZ: 4 };

// ENDLESS spawning: a slick is placed every [oilSpacingMin..Max] metres of road
// at a random lane offset (never dead-centre, so it's always dodgeable). The old
// lap-based generator produced ZERO spills in endless mode (RACE.totalLaps was
// removed), so oil was a dead feature — this restores it as occasional spice.
export function makeOilSystem(map) {
  return { list: [], nextSpillZ: 320, hitsPlayer: 0 };
}

function oilGap() {
  return RACE.oilSpacingMin + Math.random() * (RACE.oilSpacingMax - RACE.oilSpacingMin);
}

// Spawn ahead of the player and cull behind. Call once per frame in the race loop.
export function updateOil(sys, playerZ, map) {
  const ahead = playerZ + VIEW_AHEAD + 40;
  while (sys.nextSpillZ < ahead) {
    const halfRoad = map.roadHalfWidth;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (4 + Math.random() * (halfRoad - 14));
    sys.list.push({ z: sys.nextSpillZ, x, alive: true });
    sys.nextSpillZ += oilGap();
  }
  sys.list = sys.list.filter(o => o.z > playerZ - 20);
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
