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
  // Speed-based "calm" factor — ramps 0→1 between 70 and 130 km/h so fast-moving
  // road detail fades out before it can strobe and strain the eyes at speed.
  // Brought in earlier (was 90→150) to ease the high-speed dizzy sensation.
  const kmh = (speed / PHYS.maxSpeed) * (PHYS.topSpeedKmh || 200);
  const calm = Math.min(1, Math.max(0, (kmh - 70) / 60));

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
  // rises. Gone by ~130 km/h (calm = 1), so the high-speed centre stays calm.
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

// ── Distance haze — a STATIC pale band fading down from the top edge (the
// 100 m horizon). Drawn AFTER traffic/scenery so far objects emerge "out of
// the haze", which reads as real atmospheric depth. Completely motionless
// (screen-space, z-independent), so it adds zero optic flow — if anything it
// softens the most distant, fastest-converging part of the view. Sized so a
// soft fade is still visible below the race HUD strip (which covers rows 0-8).
export function drawDistanceHaze(ctx) {
  hazeBand(ctx, 0, 4, 13, 1.0);     // solid pale blue at the horizon
  hazeBand(ctx, 4, 6, 13, 0.5);     // 50% checker
  hazeBand(ctx, 10, 6, 13, 0.25);   // 25% sparse tail
}

// Screen-space haze helper: density 1 = solid, 0.5 = checkerboard,
// 0.25 = every 4th pixel (offset per row so it doesn't form columns).
function hazeBand(ctx, y0, rows, idx, density) {
  if (density >= 1) { rect(ctx, 0, y0, W, rows, idx); return; }
  const step = density >= 0.5 ? 2 : 4;
  for (let y = y0; y < y0 + rows; y++) {
    const off = (y * (step === 2 ? 1 : 3)) % step;   // stagger rows
    for (let x = off; x < W; x += step) rect(ctx, x, y, 1, 1, idx);
  }
}

// ── Time-of-day cycle ─────────────────────────────────────────────────────────
// A slow colour wash over the WHOLE scene that cycles day → dusk → night → dawn
// → day as the run goes on. It's a single flat translucent fill in screen space —
// pure hue + brightness, with ZERO spatial motion — so it adds no optic flow and
// fully respects the high-speed "no dizziness" rule (if anything, the darker
// night phase calms the periphery further). Driven by race time so it pauses with
// the game and is independent of speed.
const TOD_CYCLE_SEC = 120;          // seconds for one full day→…→day loop
// [cyclePos 0..1, r, g, b, alpha]
const TOD_KEYS = [
  [0.00,   0,   0,   0, 0.00],      // day — clear
  [0.22, 255, 120,  24, 0.16],      // dusk — warm amber
  [0.44,  16,  24,  92, 0.32],      // night — deep blue (peak)
  [0.66,  16,  24,  92, 0.30],      // night — hold
  [0.82, 150,  72, 132, 0.16],      // dawn — soft violet
  [1.00,   0,   0,   0, 0.00],      // back to day
];
function todColor(seconds) {
  let pos = (seconds % TOD_CYCLE_SEC) / TOD_CYCLE_SEC;
  if (pos < 0) pos += 1;
  let a = TOD_KEYS[0], b = TOD_KEYS[TOD_KEYS.length - 1];
  for (let i = 0; i < TOD_KEYS.length - 1; i++) {
    if (pos >= TOD_KEYS[i][0] && pos <= TOD_KEYS[i + 1][0]) { a = TOD_KEYS[i]; b = TOD_KEYS[i + 1]; break; }
  }
  const span = (b[0] - a[0]) || 1;
  const f = (pos - a[0]) / span;
  return {
    r: a[1] + (b[1] - a[1]) * f,
    g: a[2] + (b[2] - a[2]) * f,
    bl: a[3] + (b[3] - a[3]) * f,
    al: a[4] + (b[4] - a[4]) * f,
  };
}
// Wash the play scene with the current time-of-day tint. Call LAST in drawWorld
// (after the player) so the world is tinted but the HUD / combo banners — drawn
// afterwards — stay full-brightness and readable. Uses a real translucent fill
// (the one place we step outside the flat palette): a deliberate atmospheric
// layer, still completely static.
export function drawTimeOfDayTint(ctx, seconds) {
  const c = todColor(seconds || 0);
  if (c.al <= 0.003) return;            // day — nothing to draw
  ctx.fillStyle = `rgba(${c.r | 0},${c.g | 0},${c.bl | 0},${c.al.toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
}

export function project(map, playerZ, _x, entity) {
  const dist = entity.z - playerZ;
  if (dist > VIEW_AHEAD_METERS) return null;     // beyond the horizon
  const sy = distToY(dist);
  if (sy > H + 24) return null;                   // fully slid off the bottom edge
  const cx = W / 2 + map.biasX;
  return { sx: (cx + entity.x) | 0, sy: sy | 0 };
}

export const VIEW_AHEAD = VIEW_AHEAD_METERS;
