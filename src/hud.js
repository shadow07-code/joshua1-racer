// HUD — top score strip + bottom icon panel.
// Endless survival: shows TIME elapsed + LIVES instead of LAP + POS.
import { W, H, PHYS, RACE, PLAYER_Y, GRADES } from "./config.js";
import {
  rect, text, textRight, textCentered, drawSprite, drawSpriteScaled,
  disc, ditherRect, groundShadow, textOutlined, textOutlinedCentered,
} from "./render.js";
import {
  SPR_PLAYER, SPR_AI_BLUE, SPR_AI_GREEN, SPR_AI_ORANGE, SPR_PALM, SPR_TREE,
  SPR_SEDAN_BLUE, SPR_SEDAN_RED, SPR_BUS_YELLOW,
  SPR_DRIVER_STAND, SPR_DRIVER_THUMB, SPR_COIN,
  ICN_SPEED, ICN_FLAG, ICN_TROPHY, ICN_PASS,
} from "./sprites.js";
import { selectedSprite } from "./garage.js";

// Small heart icon for the LIVES counter.
const ICN_HEART = [
  [-1, 6, 6, -1, 6, 6, -1],
  [ 6, 8, 8,  6, 8, 8,  6],
  [ 6, 8, 8,  8, 8, 8,  6],
  [-1, 6, 8,  8, 8, 6, -1],
  [-1,-1, 6,  8, 6,-1, -1],
  [-1,-1,-1,  6,-1,-1, -1],
];

function mmss(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
}

function pad(num, len) {
  let s = String(Math.floor(num));
  while (s.length < len) s = "0" + s;
  return s;
}

export function drawHud(ctx, {
  score, speed, passed, mapKind, time, lives, densityMul, coins,
}) {
  // Top thin score strip
  rect(ctx, 0, 0, W, 9, 0);
  rect(ctx, 0, 8, W, 1, 4);
  text(ctx, "SCORE " + pad(score, 6), 4, 2, 5);
  // Coin counter on the right — a small gold coin + running count.
  drawSprite(ctx, SPR_COIN, W - 32, 1);
  text(ctx, pad(coins || 0, 3), W - 23, 2, 5);
  // Density indicator, tucked just left of the coins when traffic is intensified.
  if (densityMul && densityMul > 1.001) {
    const pct = Math.round((densityMul - 1) * 100);
    textRight(ctx, "+" + pct + "%", W - 36, 2, 9);
  }

  // Bottom panel
  const panelTop = H - 22;
  rect(ctx, 0, panelTop, W, 22, 4);
  rect(ctx, 0, panelTop, W, 1, 1);
  rect(ctx, 0, panelTop + 1, W, 1, 2);
  rect(ctx, 0, H - 1, W, 1, 0);
  // Subtle bevelled separators between the four cells (dark line + light edge).
  for (const sx of [48, 88, 126]) {
    rect(ctx, sx, panelTop + 4, 1, 15, 0);
    rect(ctx, sx + 1, panelTop + 4, 1, 15, 3);
  }

  // Cell 1 — speedometer (peaks at PHYS.topSpeedKmh, currently 200). The readout
  // turns gold at the very top end — a quiet "you're flat out" reward.
  drawSprite(ctx, ICN_SPEED, 3, panelTop + 7);
  const topKmh = PHYS.topSpeedKmh || 200;
  const kmh = Math.round(speed / PHYS.maxSpeed * topKmh);
  text(ctx, pad(kmh, 3), 13, panelTop + 9, kmh >= topKmh - 5 ? 5 : 1);
  text(ctx, "KMH", 13, panelTop + 15, 5);

  // Cell 2 — time elapsed
  drawSprite(ctx, ICN_FLAG, 52, panelTop + 7);
  text(ctx, mmss(time || 0), 62, panelTop + 9, 1);
  text(ctx, "TIME", 62, panelTop + 15, 5);

  // Cell 3 — lives (hearts). On the FINAL life the lone heart blinks in time
  // with the danger pulse — the HUD itself says "this is it".
  const livesCount = Math.max(0, lives || 0);
  const lastBeat = livesCount === 1 && Math.floor(performance.now() / 260) % 2 === 0;
  for (let i = 0; i < 3; i++) {
    const x = 92 + i * 8;
    if (i < livesCount && !(i === 0 && lastBeat)) {
      drawSprite(ctx, ICN_HEART, x, panelTop + 8);
    } else {
      // empty heart slot — drawn dim/dark
      rect(ctx, x + 1, panelTop + 9, 5, 4, 0);
    }
  }
  text(ctx, "LIVES", 92, panelTop + 15, 5);

  // Cell 4 — cars passed
  drawSprite(ctx, ICN_PASS, 130, panelTop + 8);
  text(ctx, pad(passed, 3), 140, panelTop + 9, 1);
  text(ctx, "PASS", 138, panelTop + 15, 5);
}

// ─── Title screen — layered synthwave sunset + receding road hero shot ─────────
// ── Title layout ──────────────────────────────────────────────────────────────
// EVERY vertical position on the home screen comes from this block, and ui.js
// centres the HTML control console inside TITLE_BAND. Canvas art and DOM
// controls are therefore laid out from the SAME numbers and cannot drift apart
// at any screen height — which is exactly how the old screen broke (the install
// pill was hard-coded to canvas y67 and landed on top of the daily strip).
const T_LOGO_Y  = 9;                 // "JOSHUA 1" at scale 3
const T_SUB_Y   = 28;                // "RACING" at scale 2
const T_CHIP_Y  = 44;                // best-score chip (2 rows)
const T_CHIP_H  = 21;
const T_DAILY_Y = T_CHIP_Y + T_CHIP_H + 4;   // 69 — daily strip, welded under the chip
const T_DAILY_H = 20;
const T_BAND_TOP = T_DAILY_Y + T_DAILY_H + 4;   // 93 — top of the control console
const TITLE_HORIZON = Math.max(H - 100, T_BAND_TOP + 60);
const T_BAND_BOT = TITLE_HORIZON - 4;
// Shared with ui.js — the band the HTML control console is centred into.
export const TITLE_BAND = { top: T_BAND_TOP, bottom: T_BAND_BOT };
const T_HERO_Y  = TITLE_HORIZON + 6;
const T_START_Y = H - 44;            // TAP TO START banner (16 tall)
const T_HINT1_Y = H - 22;
const T_HINT2_Y = H - 13;

// Sunset gradient bands as FRACTIONS of the sky's height, so the gradient spans
// the whole sky at ANY canvas height. They used to be absolute pixel offsets
// authored for a 140px sky; on a tall phone that left the final band as a flat
// 144px slab of pale yellow instead of a sunset. [fraction, paletteIdx]
const SKY_BANDS = [
  [0.00, 23], [0.09, 16], [0.19, 12], [0.30, 15],
  [0.40, 6],  [0.50, 9],  [0.61, 5],  [0.70, 21],
];

// Deterministic star field (upper sky only).
const TITLE_STARS = (() => {
  let s = 0x1a2b3c;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = [];
  // Spread over the upper 45% of the sky (was a fixed 0-60px band, which bunched
  // them all behind the logo once the sky got taller).
  for (let i = 0; i < 34; i++) {
    out.push({ x: (rnd() * W) | 0, y: Math.round(rnd() * 0.45 * TITLE_HORIZON), ph: (rnd() * 1000) | 0 });
  }
  return out;
})();

// Deterministic skyline of buildings sitting on the horizon.
const TITLE_BUILDINGS = (() => {
  let s = 0x77aa33;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = [];
  let x = -3;
  while (x < W + 3) {
    const w = 9 + ((rnd() * 13) | 0);
    const h = 12 + ((rnd() * 24) | 0);
    out.push({ x, w, h, dark: rnd() < 0.5 });
    x += w + 1 + ((rnd() * 2) | 0);
  }
  return out;
})();

// A 25% black speckle — a QUARTER of the pixels in 2x2 blocks, offset row to row
// so it reads as an even tint rather than stripes. (ditherRect() is fixed at 50%
// coverage, which greys the sunset out.) Purely static screen-space fill.
function tintBand(ctx, y0, h) {
  for (let yy = 0; yy < h; yy += 2) {
    const row = (yy / 2) | 0;
    for (let xx = (row & 1) * 4; xx < W; xx += 8) {
      rect(ctx, xx, y0 + yy, 2, Math.min(2, h - yy), 0);
    }
  }
}

function drawTitleSky(ctx) {
  for (let b = 0; b < SKY_BANDS.length; b++) {
    const y0 = Math.round(SKY_BANDS[b][0] * TITLE_HORIZON);
    const y1 = b + 1 < SKY_BANDS.length
      ? Math.round(SKY_BANDS[b + 1][0] * TITLE_HORIZON)
      : TITLE_HORIZON;
    rect(ctx, 0, y0, W, y1 - y0, SKY_BANDS[b][1]);
  }
}

function drawStars(ctx, t) {
  for (const st of TITLE_STARS) {
    const tw = (Math.floor(t / 380) + st.ph) % 5;
    if (tw === 0) continue;                 // blink off occasionally
    rect(ctx, st.x, st.y, 1, 1, tw === 1 ? 13 : 1);
  }
}

function drawSun(ctx, t) {
  // The sun straddles the horizon (setting behind the city) rather than sitting
  // mid-sky: that keeps the whole middle of the screen clear for the control
  // console, and it is where a synthwave sun belongs anyway. The road is drawn
  // afterwards, so its lower half is naturally cut off by the horizon line.
  const cx = 80, cy = TITLE_HORIZON - 6;
  disc(ctx, cx, cy, 20, 9);    // orange glow ring
  disc(ctx, cx, cy, 17, 21);   // light-yellow body
  disc(ctx, cx, cy, 14, 5);    // yellow core
  // Horizontal slats over the lower half, colour matched to the bands behind.
  rect(ctx, cx - 19, cy + 4,  38, 2, 9);
  rect(ctx, cx - 19, cy + 8,  38, 2, 9);
  rect(ctx, cx - 19, cy + 12, 38, 3, 9);
}

function drawSkyline(ctx, t) {
  for (const b of TITLE_BUILDINGS) {
    const top = TITLE_HORIZON - b.h;
    rect(ctx, b.x, top, b.w, b.h, b.dark ? 0 : 23);
    // Lit windows.
    for (let wy = top + 2; wy < TITLE_HORIZON - 1; wy += 4) {
      for (let wx = b.x + 1; wx < b.x + b.w - 1; wx += 3) {
        let lit = (((wx * 31 + wy * 17) >> 1) & 7) < 3;
        if (((wx + wy + ((t / 600) | 0)) % 17) === 0) lit = !lit;  // a few twinkle
        if (lit) rect(ctx, wx, wy, 1, 2, 5);
      }
    }
  }
}

function drawTitleRoad(ctx, t) {
  const cx = 80;
  const top = TITLE_HORIZON, bottom = H;
  const span = bottom - top;
  // Grass + asphalt, scanline by scanline so the road tapers in perspective.
  for (let y = top; y < bottom; y++) {
    const fr = (y - top) / span;
    const halfw = 8 + fr * 72;
    // Scrolling grass bands either side.
    const band = (Math.floor((fr * 26) + t / 90) % 2) === 0;
    rect(ctx, 0, y, W, 1, band ? 10 : 20);
    // Asphalt.
    rect(ctx, (cx - halfw) | 0, y, (halfw * 2) | 0, 1, 3);
    // Rumble strips (alternating red/white) hugging the road edge.
    const rOn = (Math.floor((fr * 26) + t / 90) % 2) === 0;
    const rw = Math.max(1, (2 + fr * 3) | 0);
    rect(ctx, (cx - halfw - rw) | 0, y, rw, 1, rOn ? 6 : 1);
    rect(ctx, (cx + halfw) | 0, y, rw, 1, rOn ? 6 : 1);
  }
  // Centre dashes — perspective-spaced and scrolling toward the viewer.
  const dashPhase = (t / 240) % 1;
  for (let i = 0; i < 10; i++) {
    let f = ((i / 10) + dashPhase) % 1;
    const yy = top + f * f * span;
    const fr = (yy - top) / span;
    const dw = Math.max(2, (7 * fr) | 0);
    const dl = Math.max(2, (12 * fr) | 0);
    rect(ctx, (cx - dw / 2) | 0, yy | 0, dw, dl, 1);
  }
}

function drawHeroCar(ctx, t, topY) {
  const scale = 2;
  const cx = 80;
  const x = (cx - 10) | 0;                 // sprite is 10w → centre at 80, PARKED (no wobble)
  const baseY = topY + 15 * scale;         // sprite is 15h
  groundShadow(ctx, cx, baseY, 11);
  drawSpriteScaled(ctx, selectedSprite(), x, topY, scale);   // your equipped livery
  // Gentle idle exhaust shimmer at the rear (it's parked but running).
  if ((Math.floor(t / 160) % 2) === 0) {
    disc(ctx, 76, baseY + 2, 2, 9);
    disc(ctx, 84, baseY + 2, 1, 5);
  } else {
    disc(ctx, 76, baseY + 2, 1, 5);
    disc(ctx, 84, baseY + 2, 2, 9);
  }
  return baseY;
}

// The driver steps out of the parked J-car and gives a thumbs-up, on a ~6s loop:
//   in-car → climbs out to the left → stands → thumbs-up (with a blinking spark)
//   → climbs back in. Title-screen flourish only (no gameplay motion), so it's
//   free of the high-speed dizziness rule.
function drawTitleDriver(ctx, t, carCx, carBaseY) {
  const L = 6000, p = t % L;
  const scale = 2;
  const standDrawX = carCx - 26;           // standing spot, left of the car
  const tuckDrawX = carCx - 12;            // start/end: tucked at the car's flank
  const feet = carBaseY + 2;               // driver feet just behind the car's base
  const ease = (f) => f * f * (3 - 2 * f); // smoothstep

  let spr, drawX, rise;                     // rise = how "stood up" (0 crouch → 1 full)
  if (p < 700) return;                                          // still in the cockpit
  else if (p < 1700) { const f = ease((p - 700) / 1000); spr = SPR_DRIVER_STAND; drawX = tuckDrawX + (standDrawX - tuckDrawX) * f; rise = f; }
  else if (p < 2500) { spr = SPR_DRIVER_STAND; drawX = standDrawX; rise = 1; }
  else if (p < 5000) { spr = SPR_DRIVER_THUMB; drawX = standDrawX; rise = 1; }
  else { const f = ease((p - 5000) / 1000); spr = SPR_DRIVER_STAND; drawX = standDrawX + (tuckDrawX - standDrawX) * f; rise = 1 - f * 0.5; }

  const h = spr.length * scale;
  const topY = (feet - h * rise) | 0;       // crouch = lower; standing = full height
  const dx = drawX | 0;
  groundShadow(ctx, dx + 6, feet, 7);
  drawSpriteScaled(ctx, spr, dx, topY, scale);
  // Blink a little spark by the raised fist during the thumbs-up.
  if (spr === SPR_DRIVER_THUMB && (Math.floor(t / 180) % 2 === 0)) {
    const fx = dx + 5 * scale, fy = topY - 2;
    rect(ctx, fx, fy, 1, 3, 1); rect(ctx, fx - 1, fy + 1, 3, 1, 1);
  }
}

export function drawTitleScreen(ctx, allTimeBest, world, playerName, daily) {
  const t = performance.now();

  // ── Scene ──
  drawTitleSky(ctx);
  drawStars(ctx, t);
  drawSun(ctx, t);
  drawSkyline(ctx, t);
  drawTitleRoad(ctx, t);
  const carBaseY = drawHeroCar(ctx, t, T_HERO_Y);
  drawTitleDriver(ctx, t, 80, carBaseY);

  // ── Control console backdrop ──
  // A light tint over the band ui.js drops the HTML controls into, so the
  // console reads as a deliberate panel and the buttons always have contrast,
  // while the sunset still shows through it.
  tintBand(ctx, T_BAND_TOP, T_BAND_BOT - T_BAND_TOP);
  rect(ctx, 0, T_BAND_TOP, W, 1, 4);
  rect(ctx, 0, T_BAND_BOT - 1, W, 1, 4);

  // ── Logo ──
  textOutlinedCentered(ctx, "JOSHUA 1", T_LOGO_Y, 5, 0, 3, 7);   // yellow on black, dk-red shadow
  textOutlinedCentered(ctx, "RACING",   T_SUB_Y,  6, 0, 2, 7);   // red on black
  // Gloss sweep — every ~3.5s a narrow angled band of white slides across the
  // logo (the classic "premium metal" shine). Clipped redraw, so it costs
  // nothing while idle and never touches the rest of the frame.
  const sweep = (t % 3500) / 3500;
  if (sweep < 0.24) {
    const sx = -24 + (sweep / 0.24) * (W + 48);
    ctx.save();
    ctx.beginPath();
    ctx.transform(1, 0, -0.35, 1, 0, 0);          // slight italic slant
    ctx.rect(sx, T_LOGO_Y - 4, 9, 44);
    ctx.clip();
    textOutlinedCentered(ctx, "JOSHUA 1", T_LOGO_Y, 1, 0, 3);   // white where the band passes
    textOutlinedCentered(ctx, "RACING",   T_SUB_Y,  1, 0, 2);
    ctx.restore();
  }

  // ── Best-score chip — YOU vs WORLD, so there is always a target on screen ──
  const chipW = 132, chipX = ((W - chipW) / 2) | 0, rowH = 10;
  rect(ctx, chipX, T_CHIP_Y, chipW, T_CHIP_H, 0);            // dark plate
  rect(ctx, chipX, T_CHIP_Y, chipW, 1, 5);                   // gold top edge
  rect(ctx, chipX, T_CHIP_Y + rowH, chipW, 1, 4);            // mid divider
  rect(ctx, chipX, T_CHIP_Y + T_CHIP_H - 1, chipW, 1, 9);    // orange base
  // Row 1 — YOUR handle + personal best.
  drawSprite(ctx, ICN_TROPHY, chipX + 3, T_CHIP_Y + 2);
  text(ctx, (playerName || "PLAYER1").slice(0, 10), chipX + 13, T_CHIP_Y + 3, 5, 1);
  textRight(ctx, pad(allTimeBest, 6), chipX + chipW - 4, T_CHIP_Y + 3, 1, 1);
  // Row 2 — WORLD #1 (name + score, from the cached leaderboard).
  const wy = T_CHIP_Y + rowH + 2;
  disc(ctx, chipX + 6, wy + 3, 3, 16);                       // blue globe
  rect(ctx, chipX + 3, wy + 3, 7, 1, 17);                    // green equator
  rect(ctx, chipX + 6, wy, 1, 7, 17);                        // green meridian
  text(ctx, "WORLD", chipX + 13, wy + 1, 5, 1);
  if (world && world.score > 0) {
    text(ctx, (world.name || "???").slice(0, 7), chipX + 37, wy + 1, 13, 1);
    textRight(ctx, pad(world.score, 6), chipX + chipW - 4, wy + 1, 5, 1);
  } else {
    textRight(ctx, "------", chipX + chipW - 4, wy + 1, 4, 1);
  }

  // ── DAILY CHALLENGE strip — welded to the underside of the chip so the two
  // read as one info stack. Header + goal + progress bar. ──
  if (daily) {
    const dY = T_DAILY_Y, dH = T_DAILY_H;
    rect(ctx, chipX, dY, chipW, dH, 0);
    rect(ctx, chipX, dY, chipW, 1, daily.done ? 17 : 5);
    rect(ctx, chipX, dY + dH - 1, chipW, 1, 4);
    text(ctx, "DAILY", chipX + 4, dY + 3, daily.done ? 17 : 5, 1);
    if (daily.streak > 0) textRight(ctx, "STREAK " + daily.streak, chipX + chipW - 4, dY + 3, 9, 1);
    if (daily.done) {
      text(ctx, "COMPLETE", chipX + 4, dY + 10, 17, 1);
      textRight(ctx, "+" + daily.reward, chipX + chipW - 4, dY + 10, 17, 1);
    } else {
      text(ctx, daily.label.slice(0, 28), chipX + 4, dY + 10, 1, 1);
    }
    const frac = daily.target > 0 ? Math.min(1, daily.prog / daily.target) : 1;
    const barW = chipW - 8;
    rect(ctx, chipX + 4, dY + dH - 4, barW, 2, 4);
    rect(ctx, chipX + 4, dY + dH - 4, Math.max(1, (barW * frac) | 0), 2, daily.done ? 17 : 5);
  }

  // ── "TAP TO START" — the primary action, pinned above the control hints ──
  rect(ctx, 8, T_START_Y, W - 16, 16, 0);
  rect(ctx, 8, T_START_Y, W - 16, 1, 5);
  rect(ctx, 8, T_START_Y + 15, W - 16, 1, 9);
  const promptIdx = (Math.floor(t / 400) % 2 === 0) ? 5 : 1;
  textOutlinedCentered(ctx, "TAP TO START", T_START_Y + 4, promptIdx, 0, 2);

  // ── Control hints — two tight lines (was three; the screen needed the room) ──
  textCentered(ctx, "TAP SIDES OR ARROWS TO STEER", T_HINT1_Y, 1, 1);
  textCentered(ctx, "AUTO GAS - NO BRAKE - 3 LIVES", T_HINT2_Y, 5, 1);
}

export function drawMapSelect(ctx, selected) {
  rect(ctx, 0, 0, W, H, 12);
  text(ctx, "SELECT MAP", 38, 10, 1, 1);
  drawMapCard(ctx, 8,  28, 70, 160, "CITY",   "WIDE",  "HIGHWAY",   selected === 0, "city");
  drawMapCard(ctx, 82, 28, 70, 160, "JUNGLE", "DIRT",  "TRACK",     selected === 1, "jungle");
  text(ctx, "ARROWS - SELECT", 22, H - 22, 1);
  text(ctx, "ENTER/TAP - GO",  26, H - 12, 5);
}

function drawMapCard(ctx, x, y, w, h, title, sub1, sub2, selected, kind) {
  rect(ctx, x, y, w, h, selected ? 5 : 4);
  rect(ctx, x + 2, y + 2, w - 4, h - 4, 12);
  rect(ctx, x + 2, y + 2, w - 4, 14, selected ? 6 : 11);
  text(ctx, title, x + (w - title.length * 4 + 1) / 2, y + 6, 1, 1);
  const sy = y + 20;
  const sh = h - 50;
  if (kind === "city") {
    rect(ctx, x + 4, sy, w - 8, sh, 10);
    const rx = x + (w - 28) / 2;
    rect(ctx, rx, sy, 28, sh, 3);
    rect(ctx, rx, sy, 1, sh, 1);
    rect(ctx, rx + 27, sy, 1, sh, 1);
    for (let i = 0; i < Math.floor(sh / 14); i++) rect(ctx, rx + 13, sy + 4 + i * 14, 2, 6, 5);
    drawSprite(ctx, SPR_TREE, x + 6, sy + 4);
    drawSprite(ctx, SPR_TREE, x + w - 20, sy + sh - 18);
    drawSprite(ctx, SPR_PLAYER, rx + 7, sy + sh - 24);
    drawSprite(ctx, SPR_SEDAN_BLUE, rx + 7, sy + 10);
  } else {
    rect(ctx, x + 4, sy, w - 8, sh, 11);
    const rx = x + (w - 30) / 2;
    rect(ctx, rx, sy, 30, sh, 18);
    rect(ctx, rx, sy, 1, sh, 1);
    rect(ctx, rx + 29, sy, 1, sh, 1);
    for (let i = 0; i < Math.floor(sh / 14); i++) rect(ctx, rx + 14, sy + 4 + i * 14, 2, 6, 5);
    drawSprite(ctx, SPR_PALM, x + 4, sy + 2);
    drawSprite(ctx, SPR_PALM, x + w - 18, sy + sh - 22);
    drawSprite(ctx, SPR_PLAYER, rx + 8, sy + sh - 24);
    drawSprite(ctx, SPR_AI_GREEN, rx + 8, sy + 10);
  }
  rect(ctx, x + 2, y + h - 28, w - 4, 26, selected ? 6 : 11);
  text(ctx, sub1, x + (w - sub1.length * 4 + 1) / 2, y + h - 22, 1, 1);
  text(ctx, sub2, x + (w - sub2.length * 4 + 1) / 2, y + h - 12, 5, 1);
  if (selected) {
    rect(ctx, x + w / 2 - 2, y + h + 2, 4, 1, 5);
    rect(ctx, x + w / 2 - 1, y + h + 3, 2, 1, 5);
  }
}

export function drawDifficultySelect(ctx, selected) {
  rect(ctx, 0, 0, W, H, 12);
  text(ctx, "DIFFICULTY", 38, 14, 1, 1);
  drawDiffCard(ctx, 8,  40, 70, 120, "MEDIUM", "FAIR",   selected === 0, false);
  drawDiffCard(ctx, 82, 40, 70, 120, "HARD",   "BRUTAL", selected === 1, true);
  text(ctx, "ARROWS - SELECT", 22, H - 22, 1);
  text(ctx, "ENTER/TAP - GO",  26, H - 12, 5);
}

function drawDiffCard(ctx, x, y, w, h, title, sub, selected, isHard) {
  rect(ctx, x, y, w, h, selected ? 5 : 4);
  rect(ctx, x + 2, y + 2, w - 4, h - 4, isHard ? 7 : 10);
  rect(ctx, x + 2, y + 2, w - 4, 14, selected ? 6 : (isHard ? 0 : 11));
  text(ctx, title, x + (w - title.length * 4 + 1) / 2, y + 6, 1, 1);
  drawSprite(ctx, isHard ? SPR_AI_BLUE : SPR_PLAYER, x + (w - 14) / 2, y + 36);
  text(ctx, sub, x + (w - sub.length * 4 + 1) / 2, y + h - 18, 1, 1);
  if (selected) {
    rect(ctx, x + w / 2 - 2, y + h + 2, 4, 1, 5);
    rect(ctx, x + w / 2 - 1, y + h + 3, 2, 1, 5);
  }
}

export function drawCountdown(ctx, label) {
  const cy = (H / 2) | 0;
  const go = label === "GO!";
  // Dark banner across the middle — world stays visible above and below.
  rect(ctx, 0, cy - 30, W, 60, 0);
  rect(ctx, 0, cy - 30, W, 2, 5);
  rect(ctx, 0, cy + 28, W, 2, 5);
  // Glow disc behind the glyph (green burst on GO!, warm on the count).
  disc(ctx, W / 2, cy - 1, 23, go ? 11 : 7);
  disc(ctx, W / 2, cy - 1, 18, go ? 17 : 9);
  textOutlinedCentered(ctx, label, cy - 13, go ? 1 : 5, 0, 5, 7);
}

// Big filled-triangle arrow. dir -1 = points left, +1 = points right.
// Optional 1px keyline drawn as a slightly larger triangle behind the fill.
// Built from horizontal spans via rect() so it stays within the palette API.
export function drawBigArrow(ctx, cx, cy, dir, w, h, fillIdx, outlineIdx = null) {
  const tri = (ww, hh, idx) => {
    const half = hh / 2;
    const baseX = cx - dir * (ww / 2);
    for (let dy = -half; dy <= half; dy++) {
      const f = 1 - Math.abs(dy) / half;             // 1 at the centre row → 0 at the tips
      const len = Math.max(1, (ww * f) | 0);
      const xa = dir > 0 ? baseX : baseX - len;
      rect(ctx, xa, cy + dy, len, 1, idx);
    }
  };
  if (outlineIdx != null) tri(w + 2, h + 2, outlineIdx);
  tri(w, h, fillIdx);
}

// Text centred on an arbitrary x with a 1px dark drop-shadow (reads on the
// dithered orange zones). Used for LEFT/RIGHT labels.
function labelCentered(ctx, str, cx, y, fillIdx = 1) {
  const w = String(str).length * 4 - 1;
  const x = (cx - w / 2) | 0;
  text(ctx, str, x + 1, y + 1, 0, 1);
  text(ctx, str, x, y, fillIdx, 1);
}

// Small green checkmark (✓) built from 2px blocks — marks a completed step.
function drawCheck(ctx, cx, cy, idx = 17) {
  const pts = [[-5, 0], [-3, 2], [-1, 4], [1, 2], [3, -1], [5, -4], [7, -7]];
  for (const [dx, dy] of pts) {
    rect(ctx, cx + dx + 1, cy + dy + 1, 3, 3, 0);   // shadow
    rect(ctx, cx + dx, cy + dy, 3, 3, idx);
  }
}

// Blinking border around a zone — draws attention to the active step.
function zoneBorder(ctx, x, y, w, h, idx, t) {
  if (Math.floor(t / 250) % 2 === 0) return;
  rect(ctx, x, y, w, 2, idx); rect(ctx, x, y + h - 2, w, 2, idx);
  rect(ctx, x, y, 2, h, idx); rect(ctx, x + w - 2, y, 2, h, idx);
}

// Orange "steer zone" highlights painted over the ACTUAL bottom quadrants of
// the play area: bottom-left = steer left, bottom-right = steer right. Shared by
// the per-race hint and the first-run tutorial overlay.
const STEER_ZONE_TOP_FRAC = 0.5;
function steerZoneRect() {
  const top = (H * STEER_ZONE_TOP_FRAC) | 0;
  const bottom = H - 22;                 // stop just above the HUD panel
  return { top, h: Math.max(0, bottom - top), midX: (W / 2) | 0 };
}

export function drawSteerZones(ctx, { leftLit = true, rightLit = true, pulse = true, vis = 1, arrows = true } = {}) {
  if (vis <= 0) return;
  const t = performance.now();
  if (vis < 0.4 && (Math.floor(t / 110) % 2 === 0)) return;   // blink out as it fades
  const { top, h, midX } = steerZoneRect();
  if (h <= 4) return;
  const parity = pulse ? (Math.floor(t / 180) & 1) : 0;
  const cyZone = top + (h / 2 | 0);
  const arrowIdx = (!pulse || Math.floor(t / 350) % 2 === 0) ? 5 : 1;  // yellow / white pulse
  const aw = 30, ah = 34;

  const paint = (x, w, dir, label) => {
    ditherRect(ctx, x, top, w, h, 9, parity);     // orange checkerboard
    rect(ctx, x, top, w, 1, 9);                    // bright top edge
    if (arrows) {
      drawBigArrow(ctx, x + (w / 2 | 0), cyZone - 6, dir, aw, ah, arrowIdx, 0);
    }
  };
  if (leftLit) paint(0, midX, -1, "LEFT");
  if (rightLit) paint(midX, W - midX, +1, "RIGHT");
  if (leftLit && rightLit) rect(ctx, midX, top, 1, h, 0);   // divider
}

// Per-race steering reminder (every race): both zones lit + pulsing, faded by
// `vis` at race start. Bold orange, big arrows.
export function drawSteerHints(ctx, vis = 1) {
  drawSteerZones(ctx, { leftLit: true, rightLit: true, pulse: true, vis });
}

// First-run interactive tutorial overlay, drawn over a live road backdrop (the
// backdrop + car are rendered by main.js). `tut` = { phase, demoSide,
// rightDone, leftDone }. phases: "demo" → "practice" → "done".
export function drawTutorialOverlay(ctx, tut) {
  const t = performance.now();
  const { top, h, midX } = steerZoneRect();
  const cyZone = top + (h / 2 | 0);
  const phase = tut.phase;

  if (phase === "demo") {
    // Light only the side the car is currently drifting toward.
    drawSteerZones(ctx, { leftLit: tut.demoSide < 0, rightLit: tut.demoSide > 0, pulse: true, vis: 1 });
  } else {
    // Practice / done: both zones always visible (steady) so the mechanic reads;
    // the active step gets a blinking border, completed steps get a ✓.
    drawSteerZones(ctx, { leftLit: true, rightLit: true, pulse: false, vis: 1 });
    if (phase === "practice") {
      if (!tut.rightDone) zoneBorder(ctx, midX, top, W - midX, h, 1, t);
      else if (!tut.leftDone) zoneBorder(ctx, 0, top, midX, h, 1, t);
    }
    if (tut.rightDone) drawCheck(ctx, (W * 0.75) | 0, cyZone - 6, 17);
    if (tut.leftDone)  drawCheck(ctx, (W * 0.25) | 0, cyZone - 6, 17);
  }

  // Title (top) + prompt (just below).
  textOutlinedCentered(ctx, "HOW TO STEER", 12, 5, 0, 2, 7);
  let prompt;
  if (phase === "demo") prompt = "WATCH THE CAR";
  else if (phase === "practice") prompt = tut.rightDone ? "NOW TAP LEFT SIDE" : "TAP RIGHT SIDE";
  else prompt = "GREAT!  TAP TO RACE";
  const blink = Math.floor(t / 400) % 2 === 0;
  textOutlinedCentered(ctx, prompt, 30, (phase === "done" && !blink) ? 1 : 5, 0, 1);
}

// COMBO banner — appears at the top once the multiplier is ≥2, pulses
// hotter as it climbs, with a draining timer bar. Pure "juice" for close dodges.
export function drawCombo(ctx, combo, comboTimer, comboWindow) {
  if (!combo || combo < 2) return;
  const t = performance.now();
  const y = 13;
  const hot = combo >= 5;
  const blink = Math.floor(t / 110) % 2 === 0;
  const idx = hot ? (blink ? 5 : 9) : 5;            // yellow, flickering orange when hot
  const label = "COMBO x" + combo;
  const w = label.length * 4 - 1;
  const x = ((W - w) / 2) | 0;
  rect(ctx, x - 4, y - 2, w + 8, 11, 0);            // dark plate
  rect(ctx, x - 4, y - 2, w + 8, 1, hot ? 9 : 5);   // top accent
  rect(ctx, x - 4, y + 8, w + 8, 1, hot ? 9 : 5);   // bottom accent
  textCentered(ctx, label, y + 1, idx);             // (scale defaults to 1 — was 0 = invisible!)
  const frac = Math.max(0, Math.min(1, comboTimer / (comboWindow || 1)));
  rect(ctx, x - 4, y + 9, w + 8, 1, 4);
  rect(ctx, x - 4, y + 9, ((w + 8) * frac) | 0, 1, hot ? 9 : 17);
}

// SANDWICH combo — a TRANSIENT line just below the COMBO banner. Shows for ~1.6s
// on each sandwich pass then blinks off; the count keeps climbing and only resets
// when the main combo breaks. Emerald, to set it apart from the gold combo.
export function drawSandwichCombo(ctx, count, timer) {
  if (timer <= 0 || count <= 0) return;
  if (timer < 0.4 && Math.floor(performance.now() / 90) % 2 === 0) return;   // blink off
  const label = "SANDWICH COMBO x" + count;
  const w = label.length * 4 - 1;
  const x = ((W - w) / 2) | 0, y = 24;
  rect(ctx, x - 3, y - 1, w + 6, 8, 0);     // dark plate
  textCentered(ctx, label, y, 17);          // emerald
}

// NITRO RAMPAGE meter — a slim row of pips just under the combo banner.
// Gold pips fill one per combo-tier near miss; a full row fires RAMPAGE.
// After a rampage the row goes muted blue-gray and refills as the cooldown
// cars are passed — once spent, gold building resumes. Hidden while a rampage
// is running and when there's nothing to show (clean screen by default).
export function drawRampageMeter(ctx, { meter, max, cooldown, cooldownMax, active, armed }) {
  if (active) return;
  if (!armed && meter <= 0 && cooldown <= 0) return;
  const cellW = 3, cellH = 2, gap = 1;
  const wTot = max * (cellW + gap) - gap;
  const x0 = ((W - wTot) / 2) | 0;
  const y = 34;   // sits below the COMBO banner + the transient SANDWICH line
  rect(ctx, x0 - 2, y - 2, wTot + 4, cellH + 4, 0);          // dark plate
  // ARMED — the whole row strobes white/gold: it's full and waiting on YOUR tap.
  if (armed) {
    const hot = Math.floor(performance.now() / 80) % 2 === 0;
    for (let i = 0; i < max; i++) {
      rect(ctx, x0 + i * (cellW + gap), y, cellW, cellH, hot ? 1 : 5);
    }
    return;
  }
  const cooling = cooldown > 0;
  const fillN = cooling ? Math.max(0, cooldownMax - cooldown) : meter;
  // Build-up (J3): the last 3 pips pulse before RAMPAGE, faster the closer it gets.
  const near = !cooling && meter >= max - 3 && meter < max;
  const period = meter >= max - 1 ? 90 : 150;
  const pulse = near && (Math.floor(performance.now() / period) % 2 === 0);
  const fillIdx = cooling ? 24 : (pulse ? 1 : 5);           // blue-gray / yellow (white pulse)
  for (let i = 0; i < max; i++) {
    rect(ctx, x0 + i * (cellW + gap), y, cellW, cellH, i < fillN ? fillIdx : 4);
  }
}

// (The armed-rampage prompt is now the hovering HTML "PRESS FOR RAMPAGE"
// button — see #btn-rampage in index.html, shown/hidden per-frame by main.js.)


// Deterministic full-screen starfield for the game-over backdrop (separate from
// the title's upper-sky stars — these scatter across the whole height).
const GO_STARS = (() => {
  let s = 0x5eed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = [];
  for (let i = 0; i < 26; i++) out.push({ x: (rnd() * W) | 0, y: (rnd() * H) | 0, ph: (rnd() * 1000) | 0 });
  return out;
})();

// The final-score letter grade — the instant verdict. Returns the matching
// [minScore, letter, qualifier, paletteIdx] entry from config.GRADES.
export function gradeFor(score) {
  for (const g of GRADES) if (score >= g[0]) return g;
  return GRADES[GRADES.length - 1];
}

export function drawGameOver(ctx, { name, score, hi, isNew, bestDelta, rankInfo, reason, passed, time, topSpeed, combo, smashed, rampages, coins, wallet, unlocked, nextCar, daily }) {
  const t = performance.now();
  const flash = Math.floor(t / 300) % 2 === 0;
  // Dark backdrop with a quiet twinkling starfield — ties the screen to the
  // title's night-sky look instead of dead flat black.
  rect(ctx, 0, 0, W, H, 0);
  for (const st of GO_STARS) {
    const tw = (Math.floor(t / 420) + st.ph) % 6;
    if (tw < 2) continue;                          // most stars rest dim/off
    rect(ctx, st.x, st.y, 1, 1, tw === 2 ? 4 : 23);
  }

  const gr = gradeFor(score);        // [min, letter, qualifier, idx]

  // The action buttons live in an HTML bar pinned to the viewport bottom, so the
  // canvas draws the banner + verdict + a trimmed ledger, centred in the upper
  // ~66% so they never sit behind that bar.
  const rowH = 12;
  const N = 8;                       // ledger rows (score/best live in the verdict)
  const panelH = rowH * N + 10;
  const heroH = 22;
  const bankH = 16;                  // the coin-bank strip under the ledger
  const totalH = 26 + 2 + heroH + 10 + 10 + panelH + bankH;
  const avail = H * 0.66;
  const baseY = Math.max(4, ((avail - totalH) / 2) | 0);

  // ── Top banner — "GAME OVER" with premium trim ──
  const bannerY = baseY;
  rect(ctx, 0, bannerY, W, 26, 6);
  rect(ctx, 0, bannerY, W, 2, 7);
  rect(ctx, 0, bannerY + 24, W, 2, 7);
  rect(ctx, 0, bannerY + 2, W, 1, 5);              // thin gold trim inside
  rect(ctx, 0, bannerY + 23, W, 1, 5);
  textOutlinedCentered(ctx, reason, bannerY + 6, 1, 0, 2, 7);

  // ── GRADE HERO — the big letter + the final score, the verdict at a glance ──
  let cursor = bannerY + 28;
  const heroY = cursor;
  rect(ctx, 6, heroY, W - 12, heroH, 23);          // dark plate
  rect(ctx, 6, heroY, W - 12, 1, gr[3]);           // top/bottom accent in the grade colour
  rect(ctx, 6, heroY + heroH - 1, W - 12, 1, gr[3]);
  textOutlined(ctx, gr[1], 12, heroY + 3, gr[3], 0, 3);          // grade letter, scale 3
  textRight(ctx, pad(score, 6), W - 10, heroY + 7, 1, 2);        // final score, scale 2
  cursor += heroH + 1;

  // ── Verdict line — qualifier (left) + best delta (right) ──
  text(ctx, gr[2], 12, cursor, gr[3], 1);
  if (isNew && bestDelta > 0) {
    textRight(ctx, "NEW BEST +" + bestDelta, W - 10, cursor, flash ? 5 : 9, 1);
  } else if (isNew) {
    textRight(ctx, "FIRST SCORE!", W - 10, cursor, flash ? 5 : 9, 1);
  } else {
    textRight(ctx, "BEST " + pad(hi, 6), W - 10, cursor, 5, 1);
  }
  cursor += 10;

  // ── Rank / percentile line — how this run stacks up on the live board ──
  if (rankInfo && rankInfo.rank && rankInfo.total) {
    const line = rankInfo.total >= 20
      ? "TOP " + Math.max(1, Math.ceil(rankInfo.rank / rankInfo.total * 100)) + "%   RANK " + rankInfo.rank + "/" + rankInfo.total
      : "RANK " + rankInfo.rank + " OF " + rankInfo.total;
    textCentered(ctx, line, cursor, 13, 1);
  } else if (rankInfo && rankInfo.offline) {
    textCentered(ctx, "OFFLINE", cursor, 4, 1);
  } else {
    textCentered(ctx, "RANKING...", cursor, 4, 1);      // pending submit
  }
  cursor += 10;

  // ── Trimmed ledger ──
  const statsTop = cursor;
  rect(ctx, 6, statsTop, W - 12, panelH, 4);
  rect(ctx, 6, statsTop, W - 12, 1, 1);
  rect(ctx, 6, statsTop + panelH - 1, W - 12, 1, 0);
  rect(ctx, 7, statsTop + 1, W - 14, 10, 23);
  textCentered(ctx, "RESULTS", statsTop + 4, 5, 1);

  const col1 = 12, col2 = W - 12;
  let y = statsTop + 14, rowN = 0;
  const statRow = (label, value, valIdx) => {
    if (rowN % 2 === 1) rect(ctx, 7, y - 2, W - 14, rowH - 1, 23);
    text(ctx, label, col1, y, 13);
    textRight(ctx, value, col2, y, valIdx);
    y += rowH;
    rowN++;
  };

  statRow("NAME",       (name || "AAA").slice(0, 10),          5);
  statRow("TIME",       mmss(time || 0),                       1);
  statRow("PASSED",     pad(passed != null ? passed : 0, 3),   1);
  statRow("COINS",      pad(coins != null ? coins : 0, 3),     5);
  statRow("TOP SPEED",  (topSpeed || 0) + " KMH",              9);
  statRow("BEST COMBO", "X" + (combo || 0),                    17);
  statRow("SMASHED",    pad(smashed != null ? smashed : 0, 3), 9);
  statRow("RAMPAGES",   "X" + (rampages || 0),                 5);

  // ── COIN BANK ── The payoff that survives death: this run's coins are added
  // to a permanent wallet, and the bar shows how close the next car now is. Even
  // a terrible run moves it, so no attempt is ever wasted.
  let bankY = statsTop + panelH + 3;
  if (unlocked && unlocked.length) {
    // Celebration beat — a new livery just paid off.
    const car = unlocked[unlocked.length - 1];
    rect(ctx, 6, bankY, W - 12, 13, flash ? 5 : 9);          // strobing gold plate
    textOutlinedCentered(ctx, "NEW CAR: " + car.name, bankY + 4, 1, 0, 1);
  } else {
    drawSprite(ctx, SPR_COIN, 8, bankY);
    text(ctx, "+" + (coins || 0), 17, bankY + 1, 5);
    textRight(ctx, "BANK " + (wallet || 0), W - 8, bankY + 1, 1);
    if (nextCar) {
      // Progress toward the cheapest locked car.
      const have = Math.max(0, Math.min(nextCar.price, wallet || 0));
      const frac = nextCar.price > 0 ? have / nextCar.price : 1;
      const barY = bankY + 9, barW = W - 16;
      rect(ctx, 8, barY, barW, 3, 4);                         // track
      rect(ctx, 8, barY, Math.max(1, (barW * frac) | 0), 3, 5); // fill
      text(ctx, nextCar.name, 8, barY + 5, 13);
      textRight(ctx, have + "/" + nextCar.price, W - 8, barY + 5, 13);
    }
  }
  bankY += (unlocked && unlocked.length) ? 15 : 20;

  // ── DAILY CHALLENGE ── Most retries never pass through the title screen, so
  // the day's goal has to report here or the player forgets it exists. Drawn
  // only when there's room for it AND the retry prompt: it's deliberately
  // outside the centred layout above, so on a cramped viewport it degrades away
  // instead of pushing TAP TO RETRY off the bottom.
  if (daily && bankY + 11 < H - 26) {
    const doneNow = daily.done;
    if (daily.completedThisRun) {
      // The moment it lands — a celebration plate, same weight as a new car.
      rect(ctx, 6, bankY, W - 12, 10, flash ? 17 : 10);
      textOutlinedCentered(ctx, "DAILY DONE  +" + daily.reward, bankY + 2, 1, 0, 1);
    } else {
      text(ctx, "DAILY", 8, bankY, doneNow ? 17 : 5);
      textRight(ctx, doneNow ? "COMPLETE" : (daily.prog + "/" + daily.target), W - 8, bankY, doneNow ? 17 : 13);
      const frac = daily.target > 0 ? Math.min(1, daily.prog / daily.target) : 1;
      const barW = W - 16;
      rect(ctx, 8, bankY + 7, barW, 2, 4);
      rect(ctx, 8, bankY + 7, Math.max(1, (barW * frac) | 0), 2, doneNow ? 17 : 5);
    }
    bankY += 13;
  }

  // One-tap retry prompt — a blinking hint under the bank strip (the whole
  // canvas is tappable to restart; the HTML PLAY AGAIN button does the same).
  if (bankY < H - 26) textOutlinedCentered(ctx, "TAP TO RETRY", bankY, flash ? 5 : 1, 0, 1);
}

// Impact EXPLOSION — a brief expanding fireball + shrapnel sparks + a quick
// flash, drawn at the car when a chopper barrel detonates on it. A discrete
// one-shot (like the combo/rampage flashes), so it adds no continuous optic flow.
// prog: 0 at detonation → 1 at the end.
export function drawExplosion(ctx, prog, cx, cy) {
  const r = (3 + prog * 22) | 0;
  // Quick screen-space flash on the first frames — an impact pop, not blinding.
  if (prog < 0.12) ditherRect(ctx, 0, 9, W, H - 31, 1, (Math.floor(performance.now() / 30) & 1), 2);
  // Fireball — white-hot core fading out to orange as it expands.
  if (prog < 0.9) {
    disc(ctx, cx, cy, r, 9);                                 // orange
    disc(ctx, cx, cy, (r * 0.68) | 0, 5);                    // yellow
    if (prog < 0.45) disc(ctx, cx, cy, (r * 0.38) | 0, 1);   // white-hot core
  }
  // Smoke takes over near the end.
  if (prog > 0.55) {
    disc(ctx, cx, cy, (r * 0.75) | 0, 4);
    disc(ctx, cx - 4, cy - 3, (r * 0.45) | 0, 3);
    disc(ctx, cx + 4, cy + 2, (r * 0.45) | 0, 3);
  }
  // Shrapnel sparks flung outward in 8 directions.
  if (prog < 0.85) {
    const spread = 4 + prog * 26;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.4;
      rect(ctx, (cx + Math.cos(a) * spread) | 0, (cy + Math.sin(a) * spread) | 0, 2, 2, (i & 1) ? 5 : 9);
    }
  }
}

// "PERFECT!" micro-pop — a small blinking word just above the car on a
// pixel-close shave. Rises 3px over its half-second life (a tiny, bounded
// screen-space drift — not a floater stream) then vanishes. cx = the car's
// screen x, so the pop hugs the moment it rewards.
export function drawPerfect(ctx, timer, cx) {
  if (timer <= 0) return;
  const f = 1 - Math.max(0, Math.min(1, timer / 0.5));       // 0 → 1 over its life
  const label = "PERFECT!";
  const w = label.length * 4 - 1;
  const x = Math.max(2, Math.min(W - w - 2, (cx - w / 2) | 0));
  const y = (PLAYER_Y - 16 - f * 3) | 0;
  const blink = Math.floor(performance.now() / 70) % 2 === 0;
  textOutlined(ctx, label, x, y, blink ? 1 : 5, 0, 1);
}

// (No wrong-way HUD warning by design — a wrong-way car should AMBUSH you. The
// only tells are the car itself: blazing headlights, a blinking hazard bar, and
// its horn once it's nearly on top of you.)

// EVENT announcement — a big centred call-out when a set-piece starts, and the
// payout line when you clear one. Blinks, sits well clear of the top HUD, and is
// gone in ~2s. Static screen-space text (colour + blink only).
export function drawEventBanner(ctx, label, timer, idx) {
  if (timer <= 0 || !label) return;
  const blink = Math.floor(performance.now() / 110) % 2 === 0;
  const y = (H * 0.30) | 0;
  const w = label.length * 8 - 2;                    // scale-2 text width
  const x = ((W - w) / 2) | 0;
  rect(ctx, x - 6, y - 4, w + 12, 18, 0);            // dark plate
  rect(ctx, x - 6, y - 4, w + 12, 1, idx);           // trim in the event's colour
  rect(ctx, x - 6, y + 13, w + 12, 1, idx);
  textOutlinedCentered(ctx, label, y, blink ? 1 : idx, 0, 2);
}

// EVENT progress — a slim bar tucked directly under the score strip that drains
// over the event's life, so you always know one is running and roughly how much
// is left. No words (the announcement already named it), so the screen stays clean.
export function drawEventTimer(ctx, frac, idx) {
  const f = Math.max(0, Math.min(1, frac));
  rect(ctx, 0, 9, W, 2, 4);                          // track
  rect(ctx, 0, 9, (W * f) | 0, 2, idx);              // remaining
}

// BIOME landmark banner — a transient "▷ TUNNEL ◁" announcement when the scene
// changes, so each new zone reads as a "how far did I get" milestone. Fades over
// its ~2s life; drawn just under the top HUD strip so it clears the play focus.
export function drawBiomeBanner(ctx, name, timer) {
  if (timer <= 0 || !name) return;
  const f = Math.max(0, Math.min(1, timer / 2));
  // Blink out over the last third instead of a true alpha fade (flat palette).
  if (f < 0.35 && Math.floor(performance.now() / 90) % 2 === 0) return;
  const label = "- " + name + " -";      // font-safe (no arrow glyphs in FONT_3x5)
  const y = 16;
  const w = label.length * 4 - 1;
  const x = ((W - w) / 2) | 0;
  rect(ctx, x - 5, y - 2, w + 10, 11, 0);            // dark plate
  rect(ctx, x - 5, y - 2, w + 10, 1, 5);             // gold top/bottom trim
  rect(ctx, x - 5, y + 8, w + 10, 1, 9);
  textOutlinedCentered(ctx, label, y + 1, 5, 0, 1);
}

// Brief ZONE-CHANGE flash — a quick screen-space dither pop over the play area
// that masks the biome's hard palette cut and sells it as a deliberate "new
// zone" beat. One-shot (like the combo/explosion flashes), so no optic flow.
export function drawZoneFlash(ctx, prog) {
  if (prog <= 0 || prog >= 1) return;
  ditherRect(ctx, 0, 9, W, H - 33, 1, (Math.floor(performance.now() / 30) & 1), 2);
}

// LAST-LIFE PULSE — a red frame hugging the play area that breathes in and out
// (~1s, matching the heartbeat cadence): thicker + brighter at the peak, thin +
// dark between. It's a screen-space colour/thickness pulse at the edges only —
// no spatial motion, no optic flow — so it heightens the danger without breaking
// the high-speed comfort rule (same family as the combo/rampage edge flashes).
export function drawLastLifePulse(ctx) {
  const p = Math.sin(performance.now() / 168) * 0.5 + 0.5;   // 0..1, ~1.05s period
  const th = 1 + Math.round(p * 2);                           // 1..3 px
  const idx = p > 0.55 ? 6 : 7;                               // bright red at peak, dark red between
  const top = 9, bot = H - 24, h = bot - top;
  rect(ctx, 0, top, W, th, idx);
  rect(ctx, 0, bot - th, W, th, idx);
  rect(ctx, 0, top, th, h, idx);
  rect(ctx, W - th, top, th, h, idx);
}

// Big transient popup (SHIELD! / SAVED!) centred over the action — blinks.
export function drawShieldMsg(ctx, msg) {
  const t = performance.now();
  const blink = Math.floor(t / 90) % 2 === 0;
  textOutlinedCentered(ctx, msg, (H * 0.40) | 0, blink ? 17 : 13, 0, 2, 7);
}

export function drawPaused(ctx) {
  // Dim the frozen world (fine 8-bit checker — static, calm). The HTML pause
  // menu (PAUSED title + RESUME / RESTART / QUIT) sits on top of this.
  ditherRect(ctx, 0, 0, W, H, 0, 0, 1);
}

// ─── Shareable score card ──────────────────────────────────────────────────────
// A self-contained results image (NOT the live game-over screen). Drawn at a
// fixed 160-wide canvas using the same pixel font/sprites, then scaled up to a
// crisp PNG by the caller. Its own width/height so it never depends on the
// device's screen aspect.
export const SHARE_CARD_W = 160;
export const SHARE_CARD_H = 200;

export function drawShareCard(ctx, { name, score, isNew, time, topSpeed, passed, combo, smashed, rampages, coins, world }) {
  const Wc = SHARE_CARD_W, Hc = SHARE_CARD_H;
  // Backdrop — black with a quiet starfield and a gold double frame.
  rect(ctx, 0, 0, Wc, Hc, 0);
  for (const st of GO_STARS) {
    if (((st.x * 7 + st.y) % 5) < 2) continue;            // sparse, deterministic
    rect(ctx, st.x % Wc, st.y % Hc, 1, 1, (st.x % 3 === 0) ? 23 : 4);
  }
  rect(ctx, 0, 0, Wc, 2, 5); rect(ctx, 0, Hc - 2, Wc, 2, 5);
  rect(ctx, 0, 0, 2, Hc, 5); rect(ctx, Wc - 2, 0, 2, Hc, 5);
  rect(ctx, 3, 3, Wc - 6, 1, 9); rect(ctx, 3, Hc - 4, Wc - 6, 1, 9);

  // Corner cars for flair (player red left, rival blue right).
  drawSprite(ctx, SPR_PLAYER, 8, 8);
  drawSprite(ctx, SPR_AI_BLUE, Wc - 20, 8, true);

  // Title.
  textOutlinedCentered(ctx, "JOSHUA 1", 8, 5, 0, 2, 7);
  textOutlinedCentered(ctx, "RACING", 26, 6, 0, 1, 7);

  // Score hero + letter grade badge.
  const gr = gradeFor(score);
  textCentered(ctx, "FINAL SCORE", 42, 5);
  textOutlinedCentered(ctx, pad(score, 6), 50, 1, 0, 2);
  textCentered(ctx, "GRADE " + gr[1] + "  " + gr[2], isNew ? 64 : 66, gr[3]);
  if (isNew) textCentered(ctx, "NEW HI SCORE!", 74, 17);

  // Driver.
  textCentered(ctx, "DRIVER  " + (name || "AAA").slice(0, 10), isNew ? 82 : 76, 13);

  // Stat ledger — alternating shaded rows.
  let y = 96, rowN = 0;
  const row = (label, value, vi) => {
    if (rowN % 2 === 0) rect(ctx, 6, y - 2, Wc - 12, 11, 23);
    text(ctx, label, 10, y, 13);
    textRight(ctx, value, Wc - 10, y, vi);
    y += 12; rowN++;
  };
  row("TIME", mmss(time || 0), 1);
  row("TOP SPEED", (topSpeed || 0) + " KMH", 9);
  row("PASSED", pad(passed || 0, 3), 1);
  row("COINS", pad(coins || 0, 3), 5);
  row("SMASHED", pad(smashed || 0, 3), 9);
  row("BEST COMBO", "X" + (combo || 0), 17);
  row("RAMPAGES", "X" + (rampages || 0), 5);

  // World-record challenge line.
  if (world && world.score > 0) {
    rect(ctx, 6, y, Wc - 12, 1, 4); y += 3;
    text(ctx, "WORLD", 10, y, 5);
    text(ctx, (world.name || "???").slice(0, 8), 44, y, 13);
    textRight(ctx, pad(world.score, 6), Wc - 10, y, 5);
  }

  // Footer.
  textCentered(ctx, "JOSHUA1-RACER.VERCEL.APP", Hc - 11, 5);
}
