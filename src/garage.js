// Garage — the car collection. Every car is yours from the first run, so the
// garage is purely about CHOOSING what you drive. (It was a coin-priced ladder
// until coins were removed on 2026-11-17.)
//
// Cars are COSMETIC ONLY — never speed or lives. The global leaderboard is the
// competitive layer, so what you drive must never change how you score.
//
// Most cars cost zero new pixel art: each is a recolorBody() paint swap of the
// same Ferrari sprite (the trick the traffic skins already use). A car with its
// own `sprite` (the ELEVATE) uses that instead.
import { SPR_FERRARI_BASE, SPR_ELEVATE, recolorBody } from "./sprites.js";

const PICKED_KEY = "joshua1.car.v1";

// The collection, in garage order. Body tones recolour from the base red
// (dark 7 / main 6 / light 8) into each livery's (dark, main, light).
export const CARS = [
  { id: "rosso",    name: "ROSSO",    tone: null,          swatch: 6  },
  { id: "elevate",  name: "ELEVATE",  sprite: SPR_ELEVATE, swatch: 2  },
  { id: "midnight", name: "MIDNIGHT", tone: [4, 16, 13],   swatch: 16 },
  { id: "jade",     name: "JADE",     tone: [11, 17, 10],  swatch: 17 },
  { id: "phantom",  name: "PHANTOM",  tone: [0, 4, 3],     swatch: 4  },
  { id: "sunburst", name: "SUNBURST", tone: [22, 9, 5],    swatch: 9  },
  { id: "chrome",   name: "CHROME",   tone: [4, 2, 1],     swatch: 2  },
];

// Sprites are built once, lazily — the base red car is used as-is.
const _sprites = new Map();
export function carSprite(id) {
  if (_sprites.has(id)) return _sprites.get(id);
  const car = CARS.find(c => c.id === id) || CARS[0];
  const spr = car.sprite
    ? car.sprite
    : car.tone
      ? recolorBody(SPR_FERRARI_BASE, 7, 6, 8, car.tone[0], car.tone[1], car.tone[2])
      : SPR_FERRARI_BASE;
  _sprites.set(car.id, spr);
  return spr;
}

// ── Ownership ─────────────────────────────────────────────────────────────────
// Every car is owned from the first run. (Old saves may still hold the retired
// wallet and owned-list keys; nothing reads them.)
export function ownedIds() { return CARS.map(c => c.id); }
export function isOwned(id) { return CARS.some(c => c.id === id); }

// ── Equipped car ──────────────────────────────────────────────────────────────
// Memoised: drawPlayer asks for the equipped sprite every frame, so the
// localStorage read happens once and the cache is invalidated on a change.
let _selCache = null;
export function getSelectedId() {
  if (_selCache) return _selCache;
  let id = null;
  try { id = localStorage.getItem(PICKED_KEY); } catch {}
  if (!id || !isOwned(id)) id = "rosso";
  _selCache = id;
  return id;
}
export function setSelectedId(id) {
  if (!isOwned(id)) return false;
  _selCache = id;
  try { localStorage.setItem(PICKED_KEY, id); } catch {}
  return true;
}
export function selectedSprite() { return carSprite(getSelectedId()); }
