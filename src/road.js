// Fixed straight multi-lane road, anchored to the screen.
// Calm rendering tuned to avoid high-speed strobe / eye fatigue: solid grass,
// static muted edge strips, and a faint center line that fades out with speed.
import { W, H, PLAYER_Y, PHYS } from "./config.js";
import { rect } from "./render.js";

const VIEW_AHEAD_METERS = 100;

export function roadCenterX(map /* unused */, _z, _x, _d) {
  return W / 2 + map.biasX;
}
export function yToDist(y) { return ((PLAYER_Y - y) / PLAYER_Y) * VIEW_AHEAD_METERS; }
export function distToY(dist) { return PLAYER_Y - (dist / VIEW_AHEAD_METERS) * PLAYER_Y; }

export function drawRoad(ctx, map, playerZ, speed = 0) {
  // Speed-based "calm" factor — ramps 0→1 between 90 and 150 km/h so fast-moving
  // road detail fades out before it can strobe and strain the eyes at speed.
  const kmh = (speed / PHYS.maxSpeed) * (PHYS.topSpeedKmh || 250);
  const calm = Math.min(1, Math.max(0, (kmh - 90) / 60));

  const halfW = map.roadHalfWidth;
  const cx = W / 2 + map.biasX;

  // ── Grass — solid fill (no scrolling bands; those strobed across the whole
  // screen at speed). A static mid-green band hugs each shoulder for subtle
  // depth — z-independent, so it never flickers.
  rect(ctx, 0, 0, W, H, map.bgIdx);
  const shW = 7;
  rect(ctx, (cx - halfW - shW) | 0, 0, shW, H, 20);
  rect(ctx, (cx + halfW) | 0, 0, shW, H, 20);

  // ── Asphalt ──
  rect(ctx, (cx - halfW) | 0, 0, halfW * 2, H, map.roadIdx);
  // Inset edge shadow — static darker columns just inside each edge (depth bevel).
  rect(ctx, (cx - halfW) | 0, 0, 2, H, 4);
  rect(ctx, (cx + halfW - 2) | 0, 0, 2, H, 4);

  // ── Edge strips — solid, muted, STATIC cream shoulder lines. Replaces the old
  // alternating magenta/white rumble that flickered hard at the periphery.
  rect(ctx, (cx - halfW - 3) | 0, 0, 2, H, 25);
  rect(ctx, (cx + halfW + 1) | 0, 0, 2, H, 25);

  // ── Asphalt grain — faint scrolling speckle, thinned out and faded with speed
  // so it stops shimmering at pace; skipped entirely once fully calm.
  if (calm < 1) {
    const grainSkip = Math.round(calm * 8);   // sparser as speed climbs
    for (let y = 0; y < H; y += 1) {
      const zAbs = (playerZ + yToDist(y)) | 0;
      const seed = (zAbs * 7919) & 0xff;
      if ((seed % (13 + grainSkip)) === 0)
        rect(ctx, (cx - halfW + (seed % (halfW * 2 - 4)) + 2) | 0, y, 1, 1, map.roadGrainIdx);
    }
  }

  // ── Center line — faint, low-contrast dashes that shrink to nothing as speed
  // rises. Gone by ~150 km/h (calm = 1), so the high-speed centre stays calm.
  if (calm < 1) {
    const pxPerMeter = PLAYER_Y / VIEW_AHEAD_METERS;
    const scrollPx = playerZ * pxPerMeter;
    const dashLen = 16, dashGap = 12, dashW = 3;
    const effLen = Math.max(1, (dashLen * (1 - calm)) | 0);  // dashes shrink with speed
    const period = dashLen + dashGap;
    const offset = ((scrollPx) % period + period) % period;
    for (let y = -dashLen; y < H; y += period) {
      const top = (y + offset) | 0;
      rect(ctx, (cx - dashW / 2) | 0, top, dashW, effLen, 2);   // light gray, no white/shadow
    }
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
