// Road-blocking barricades — the ONLY in-road obstacle.
import { project, VIEW_AHEAD } from "../road.js";
import { drawSprite } from "../render.js";
import { SPR_BARRICADE } from "../sprites.js";

const BARR = { sprite: SPR_BARRICADE, w: 32, h: 12, halfX: 16, halfZ: 6 };

export function makeHazardSystem() {
  return { list: [], nextSpawnZ: 100 };
}

export function updateHazards(sys, playerZ, map, dt, spawnPerMeter) {
  while (sys.nextSpawnZ < playerZ + VIEW_AHEAD + 40) {
    // Random lane bias — place near one side of the road so the player has clear room
    // on the other side. Barricades don't fully block the road.
    const side = Math.random() < 0.5 ? -1 : 1;
    const halfRoad = map.roadHalfWidth;
    const x = side * (halfRoad - BARR.halfX - 2);
    sys.list.push({ z: sys.nextSpawnZ, x, alive: true });
    const gap = (1 / spawnPerMeter) * (0.7 + Math.random() * 0.9);
    sys.nextSpawnZ += gap;
  }
  sys.list = sys.list.filter(h => h.z > playerZ - 8 && h.alive);
}

export function drawHazards(ctx, sys, map, playerZ, playerX) {
  for (const h of sys.list) {
    const p = project(map, playerZ, playerX, h);
    if (!p) continue;
    drawSprite(ctx, BARR.sprite, p.sx - BARR.halfX, p.sy - (BARR.h / 2 | 0));
  }
}

export function checkHazardHit(sys, box) {
  for (const h of sys.list) {
    if (!h.alive) continue;
    const hx1 = h.x - BARR.halfX, hx2 = h.x + BARR.halfX;
    const hz1 = h.z - BARR.halfZ, hz2 = h.z + BARR.halfZ;
    if (box.x1 < hx2 && box.x2 > hx1 && box.z1 < hz2 && box.z2 > hz1) {
      h.alive = false;
      return { kind: "barricade", effect: "crash" };
    }
  }
  return null;
}
