// Garage — the coin economy: a persistent wallet, the car-livery ladder, and
// what's owned / equipped.
//
// WHY COINS MATTER: score dies with you, coins DON'T. Every run banks its coins
// permanently, so even a 15-second disaster run advances you toward the next
// car. That's what turns a failed run from pure loss into visible progress.
//
// Liveries are COSMETIC ONLY — never speed, lives or rampage. The global
// leaderboard is the competitive layer; if coins bought power, a grinder would
// outscore a better driver and the board would stop meaning anything.
//
// The cars themselves cost zero new pixel art: each is a recolorBody() paint
// swap of the same Ferrari sprite (the trick the traffic skins already use).
import { SPR_FERRARI_BASE, recolorBody } from "./sprites.js";

const WALLET_KEY = "joshua1.wallet.v1";
const OWNED_KEY  = "joshua1.cars.v1";
const PICKED_KEY = "joshua1.car.v1";

// The ladder. `price` is tuned against a typical haul of ~40-60 coins a run, so
// the first unlock lands in 2-3 runs (teaches the loop, pays off fast) and the
// last is a long chase. Body tones recolour from the base red (dark 7 / main 6 /
// light 8) into each livery's (dark, main, light).
export const CARS = [
  { id: "rosso",    name: "ROSSO",    price: 0,    tone: null,          swatch: 6  },
  { id: "midnight", name: "MIDNIGHT", price: 150,  tone: [4, 16, 13],   swatch: 16 },
  { id: "jade",     name: "JADE",     price: 400,  tone: [11, 17, 10],  swatch: 17 },
  { id: "phantom",  name: "PHANTOM",  price: 900,  tone: [0, 4, 3],     swatch: 4  },
  { id: "sunburst", name: "SUNBURST", price: 1800, tone: [22, 9, 5],    swatch: 9  },
  { id: "chrome",   name: "CHROME",   price: 3500, tone: [4, 2, 1],     swatch: 2  },
];

// Sprites are built once, lazily — the base red car is used as-is.
const _sprites = new Map();
export function carSprite(id) {
  if (_sprites.has(id)) return _sprites.get(id);
  const car = CARS.find(c => c.id === id) || CARS[0];
  const spr = car.tone
    ? recolorBody(SPR_FERRARI_BASE, 7, 6, 8, car.tone[0], car.tone[1], car.tone[2])
    : SPR_FERRARI_BASE;
  _sprites.set(car.id, spr);
  return spr;
}

// ── Wallet ────────────────────────────────────────────────────────────────────
export function getWallet() {
  try { return Math.max(0, parseInt(localStorage.getItem(WALLET_KEY), 10) || 0); }
  catch { return 0; }
}
function setWallet(n) {
  try { localStorage.setItem(WALLET_KEY, String(Math.max(0, Math.floor(n)))); } catch {}
}
// Bank a run's coins. Returns the new balance.
export function addCoins(n) {
  const total = getWallet() + Math.max(0, Math.floor(n || 0));
  setWallet(total);
  return total;
}

// ── Ownership ─────────────────────────────────────────────────────────────────
export function ownedIds() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(OWNED_KEY) || "[]"); } catch {}
  if (!Array.isArray(list)) list = [];
  if (!list.includes("rosso")) list.push("rosso");    // the starter is always owned
  return list;
}
export function isOwned(id) { return ownedIds().includes(id); }
function setOwned(list) {
  try { localStorage.setItem(OWNED_KEY, JSON.stringify([...new Set(list)])); } catch {}
}

// The cheapest car still locked — the thing the next run is working toward.
// Returns null once everything is owned.
export function nextLocked() {
  const owned = ownedIds();
  for (const c of CARS) if (!owned.includes(c.id)) return c;
  return null;
}

// Buy a car if the wallet covers it. Returns true on success.
export function buyCar(id) {
  const car = CARS.find(c => c.id === id);
  if (!car || isOwned(id)) return false;
  const wallet = getWallet();
  if (wallet < car.price) return false;
  setWallet(wallet - car.price);
  setOwned([...ownedIds(), id]);
  return true;
}

// Auto-unlock every car the (already banked) wallet can afford, cheapest first.
// Called right after a run banks its coins, so crossing a threshold pays off
// immediately with a "NEW CAR UNLOCKED!" beat instead of a trip to a shop.
// Returns the array of cars unlocked by this call.
export function claimUnlocks() {
  const got = [];
  for (;;) {
    const next = nextLocked();
    if (!next || getWallet() < next.price) break;
    if (!buyCar(next.id)) break;
    got.push(next);
  }
  return got;
}

// ── Equipped car ──────────────────────────────────────────────────────────────
// Memoised: drawPlayer asks for the equipped sprite every frame, so the
// localStorage read happens once and the cache is invalidated on a change.
let _selCache = null;
export function getSelectedId() {
  if (_selCache) return _selCache;
  let id = null;
  try { id = localStorage.getItem(PICKED_KEY); } catch {}
  if (!id || !CARS.some(c => c.id === id) || !isOwned(id)) id = "rosso";
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
