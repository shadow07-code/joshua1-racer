// Fixed straight multi-lane road, anchored to the screen.
// Adds subtle asphalt grain and rumble strips beside the road for richness.
import { W, H, PLAYER_Y } from "./config.js";
import { rect } from "./render.js";

const VIEW_AHEAD_METERS = 100;

export function roadCenterX(map /* unused */, _z, _x, _d) {
  return W / 2 + map.biasX;
}
export function yToDist(y) { return ((PLAYER_Y - y) / PLAYER_Y) * VIEW_AHEAD_METERS; }
export function distToY(dist) { return PLAYER_Y - (dist / VIEW_AHEAD_METERS) * PLAYER_Y; }

export function drawRoad(ctx, map, playerZ) {
  // Background — grass with banding for forward motion cue
  for (let y = 0; y < H; y++) {
    const dist = yToDist(y);
    const zAbs = playerZ + dist;
    const stripe = (Math.floor(zAbs / 6) % 2) === 0;
    rect(ctx, 0, y, W, 1, stripe ? map.bgIdx : map.bgAltIdx);
  }

  const halfW = map.roadHalfWidth;
  const cx = W / 2 + map.biasX;

  // Asphalt
  rect(ctx, (cx - halfW) | 0, 0, halfW * 2, H, map.roadIdx);

  // Subtle asphalt grain — faint darker speckles that scroll with z, evokes texture
  // without distracting from the cars.
  for (let y = 0; y < H; y += 1) {
    const zAbs = (playerZ + yToDist(y)) | 0;
    // Pseudo-random hash from zAbs — same speckles every frame at the same z so they
    // appear to scroll uniformly rather than flicker.
    const seed = (zAbs * 7919) & 0xff;
    if (seed % 13 === 0) rect(ctx, (cx - halfW + (seed % (halfW * 2 - 4)) + 2) | 0, y, 1, 1, map.roadGrainIdx);
    if (seed % 17 === 0) rect(ctx, (cx - halfW + ((seed * 5) % (halfW * 2 - 4)) + 2) | 0, y, 1, 1, map.roadGrainIdx);
  }

  // Rumble strips — thin colored bars right outside the road edge
  for (let y = 0; y < H; y++) {
    const dist = yToDist(y);
    const zAbs = playerZ + dist;
    const rumbleOn = (Math.floor(zAbs / 4) % 2) === 0;
    const rIdx = rumbleOn ? map.rumbleAIdx : map.rumbleBIdx;
    rect(ctx, (cx - halfW - 3) | 0, y, 2, 1, rIdx);
    rect(ctx, (cx + halfW + 1) | 0, y, 2, 1, rIdx);
  }

  // ── Lane markings ──
  // Just ONE thicker white center dashed line — no edge lines, no side dividers.
  // The asphalt vs grass color contrast is enough to read the road boundary.
  const pxPerMeter = PLAYER_Y / VIEW_AHEAD_METERS;
  const scrollPx = playerZ * pxPerMeter;

  const dashLen = 16;      // longer dashes since it's the only one
  const dashGap = 12;
  const dashW = 4;         // thicker than the previous 2px
  const period = dashLen + dashGap;
  const offset = ((scrollPx) % period + period) % period;
  for (let y = -dashLen; y < H; y += period) {
    const top = (y + offset) | 0;
    rect(ctx, (cx - dashW / 2) | 0, top, dashW, dashLen, 1);
  }
}

export function project(map, playerZ, _x, entity) {
  const dist = entity.z - playerZ;
  if (dist < -4 || dist > VIEW_AHEAD_METERS) return null;
  const sy = distToY(dist);
  const cx = W / 2 + map.biasX;
  return { sx: (cx + entity.x) | 0, sy: sy | 0 };
}

export const VIEW_AHEAD = VIEW_AHEAD_METERS;
