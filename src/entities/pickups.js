// Rampage booster pickups — an occasional nitrous canister sitting on the road.
// Grabbing one instantly fires a RAMPAGE (the caller handles the effect). They
// spawn endlessly at a configurable spacing and are culled once past the player.
import { RACE } from "../config.js";
import { project, VIEW_AHEAD } from "../road.js";
import { drawSpriteNN, ring } from "../render.js";
import { SPR_BOOST } from "../sprites.js";

const BOOST = { sprite: SPR_BOOST, halfX: 5, halfZ: 7 };

function gap() {
  return RACE.boosterSpacingMin + Math.random() * (RACE.boosterSpacingMax - RACE.boosterSpacingMin);
}

export function makePickupSystem() {
  // nextZ stays null until boosters UNLOCK (the player hits 150 km/h), so the
  // first one is scheduled ahead of wherever the player is at that moment —
  // no backlog spawns from the start of the run.
  return { list: [], nextZ: null };
}

// `allowSpawn` gates new boosters (true once the player has reached 150 km/h).
export function updatePickups(sys, playerZ, map, dt, allowSpawn) {
  if (allowSpawn) {
    if (sys.nextZ == null) sys.nextZ = playerZ + gap();
    const ahead = playerZ + VIEW_AHEAD + 40;
    while (sys.nextZ < ahead) {
      const halfRoad = map.roadHalfWidth;
      const x = (Math.random() * 2 - 1) * (halfRoad * 0.7);   // kept off the very edges
      sys.list.push({ z: sys.nextZ, x, alive: true, bob: Math.random() * Math.PI * 2 });
      sys.nextZ += gap();
    }
  }
  sys.list = sys.list.filter(p => p.alive && p.z > playerZ - 12);
  for (const p of sys.list) p.bob += dt * 5;
}

export function drawPickups(ctx, sys, map, playerZ, playerX) {
  for (const p of sys.list) {
    if (!p.alive) continue;
    const sp = project(map, playerZ, playerX, p);
    if (!sp) continue;
    const yOff = Math.round(Math.sin(p.bob) * 1);
    // Pulsing glow ring so it reads as a grab-me power-up.
    const pulse = Math.floor(p.bob / 0.5) % 2 === 0;
    ring(ctx, sp.sx, sp.sy - 4 + yOff, pulse ? 7 : 6, pulse ? 5 : 9);
    drawSpriteNN(ctx, BOOST.sprite, sp.sx - BOOST.halfX, sp.sy - BOOST.halfZ + yOff, 1);
  }
}

export function checkPickup(sys, box) {
  for (const p of sys.list) {
    if (!p.alive) continue;
    const x1 = p.x - BOOST.halfX - 1, x2 = p.x + BOOST.halfX + 1;   // generous grab box
    const z1 = p.z - BOOST.halfZ, z2 = p.z + BOOST.halfZ;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) {
      p.alive = false;
      return p;
    }
  }
  return null;
}
