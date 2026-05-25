// Pickups — nitrous only (clearly visible blue can with yellow flame).
import { project, VIEW_AHEAD } from "../road.js";
import { drawSprite } from "../render.js";
import { SPR_NITRO } from "../sprites.js";

const NITRO = { sprite: SPR_NITRO, w: 10, h: 16, halfX: 5, halfZ: 8 };

export function makePickupSystem() {
  return { list: [], nextSpawnZ: 160 };
}

export function updatePickups(sys, playerZ, map, dt, spawnPerMeter) {
  while (sys.nextSpawnZ < playerZ + VIEW_AHEAD + 40) {
    const halfRoad = map.roadHalfWidth;
    // Place inside the road, slightly biased toward center lane so they're easy to grab.
    const x = (Math.random() * 2 - 1) * (halfRoad * 0.7);
    sys.list.push({ kind: "nitro", z: sys.nextSpawnZ, x, alive: true, bob: Math.random() * Math.PI * 2 });
    const gap = (1 / spawnPerMeter) * (0.7 + Math.random() * 0.9);
    sys.nextSpawnZ += gap;
  }
  sys.list = sys.list.filter(p => p.z > playerZ - 8 && p.alive);
  for (const p of sys.list) p.bob += dt * 6;
}

export function drawPickups(ctx, sys, map, playerZ, playerX) {
  for (const pick of sys.list) {
    const sp = project(map, playerZ, playerX, pick);
    if (!sp) continue;
    const yOff = Math.round(Math.sin(pick.bob) * 1);
    drawSprite(ctx, NITRO.sprite, sp.sx - NITRO.halfX, sp.sy - NITRO.halfZ + yOff);
  }
}

export function checkPickup(sys, box) {
  for (const pick of sys.list) {
    if (!pick.alive) continue;
    // Generous hit box on pickups so they're easy to grab.
    const hx1 = pick.x - NITRO.halfX - 1, hx2 = pick.x + NITRO.halfX + 1;
    const hz1 = pick.z - NITRO.halfZ, hz2 = pick.z + NITRO.halfZ;
    if (box.x1 < hx2 && box.x2 > hx1 && box.z1 < hz2 && box.z2 > hz1) {
      pick.alive = false;
      return pick.kind;
    }
  }
  return null;
}
