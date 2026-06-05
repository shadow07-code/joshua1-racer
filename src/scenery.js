// Roadside scenery — trees / palms / rocks / lamps. Decorative only.
import { drawSprite } from "./render.js";
import { distToY } from "./road.js";
import {
  SPR_TREE, SPR_PINE, SPR_PALM, SPR_BUSH, SPR_ROCK_SCEN, SPR_LAMP,
  SPR_BUILDING, SPR_BUILDING2,
} from "./sprites.js";
import { W } from "./config.js";

const SPRITES = {
  tree: { sprite: SPR_TREE,      w: 14, h: 16, halfX: 7, halfZ: 8 },
  pine: { sprite: SPR_PINE,      w: 14, h: 16, halfX: 7, halfZ: 8 },
  palm: { sprite: SPR_PALM,      w: 14, h: 22, halfX: 7, halfZ: 11 },
  bush: { sprite: SPR_BUSH,      w: 8,  h: 6,  halfX: 4, halfZ: 3 },
  rock: { sprite: SPR_ROCK_SCEN, w: 9,  h: 5,  halfX: 4, halfZ: 2 },
  lamp: { sprite: SPR_LAMP,      w: 8,  h: 15, halfX: 4, halfZ: 7 },
  building:  { sprite: SPR_BUILDING,  w: 14, h: 30, halfX: 7, halfZ: 15 },
  building2: { sprite: SPR_BUILDING2, w: 11, h: 22, halfX: 5, halfZ: 11 },
};

export function makeScenerySystem() {
  return { list: [], nextSpawnZ: -10 };
}

function pickKind(map) {
  const total = map.scenery.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of map.scenery) {
    r -= e.weight;
    if (r <= 0) return e.kind;
  }
  return map.scenery[0].kind;
}

export function updateScenery(sys, playerZ, map, dt, spawnPerMeter, speed01 = 0) {
  // Thin the roadside out as speed climbs: fewer objects whip past the camera at
  // pace, which cuts the peripheral "optic flow" that drives the high-speed dizzy
  // feeling. At top speed the spacing roughly doubles. Smooth — only new spawns
  // are affected, so the roadside eases from dense (slow start) to open (at pace)
  // instead of anything popping in or out.
  const sparse = 1 + Math.max(0, Math.min(1, speed01));
  while (sys.nextSpawnZ < playerZ + 110) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const minOff = map.roadHalfWidth + 8;
    const maxOff = minOff + 28;
    const x = side * (minOff + Math.random() * (maxOff - minOff));
    sys.list.push({ kind: pickKind(map), z: sys.nextSpawnZ, x });
    sys.nextSpawnZ += (1 / spawnPerMeter) * (0.5 + Math.random() * 1.2) * sparse;
  }
  sys.list = sys.list.filter(s => s.z > playerZ - 12);
}

export function drawScenery(ctx, sys, map, playerZ) {
  // Back-to-front
  for (let i = sys.list.length - 1; i >= 0; i--) {
    const s = sys.list[i];
    const dist = s.z - playerZ;
    if (dist < -8 || dist > 110) continue;
    const sy = distToY(dist);
    const def = SPRITES[s.kind];
    if (!def) continue;
    const screenCx = W / 2 + map.biasX;
    drawSprite(ctx, def.sprite, (screenCx + s.x - def.halfX) | 0, (sy - def.halfZ) | 0);
  }
}
