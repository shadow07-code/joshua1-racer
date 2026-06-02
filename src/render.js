// Canvas helpers — draws are constrained to the DMG palette indices 0..3.
import { PALETTE, W, H } from "./config.js";

export function getCtx(canvas) {
  // Size the backing store to the computed logical resolution (height adapts to
  // the device aspect — see config.js). CSS then scales this up crisply.
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export function clear(ctx, paletteIdx = 3) {
  ctx.fillStyle = PALETTE[paletteIdx];
  ctx.fillRect(0, 0, W, H);
}

export function rect(ctx, x, y, w, h, paletteIdx) {
  ctx.fillStyle = PALETTE[paletteIdx];
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}

// Draw a sprite (2D array of palette indices, where -1 = transparent).
// Sprite cell size is 1×1 logical pixel.
export function drawSprite(ctx, sprite, x, y, flipX = false) {
  const rows = sprite.length;
  for (let r = 0; r < rows; r++) {
    const row = sprite[r];
    for (let c = 0; c < row.length; c++) {
      const idx = row[c];
      if (idx < 0) continue;
      ctx.fillStyle = PALETTE[idx];
      const cx = flipX ? (row.length - 1 - c) : c;
      ctx.fillRect((x + cx) | 0, (y + r) | 0, 1, 1);
    }
  }
}

// Sprite drawn with each logical pixel scaled up by an integer factor — used for
// the big "hero" car on the title screen so the art reads at a glance.
export function drawSpriteScaled(ctx, sprite, x, y, scale = 1, flipX = false) {
  const rows = sprite.length;
  for (let r = 0; r < rows; r++) {
    const row = sprite[r];
    for (let c = 0; c < row.length; c++) {
      const idx = row[c];
      if (idx < 0) continue;
      ctx.fillStyle = PALETTE[idx];
      const cx = flipX ? (row.length - 1 - c) : c;
      ctx.fillRect((x + cx * scale) | 0, (y + r * scale) | 0, scale, scale);
    }
  }
}

// Nearest-neighbour scaled sprite blit. Caches each sprite to an offscreen
// canvas once, then draws it at an arbitrary (incl. fractional) scale with
// smoothing off — lets us render the player/traffic a bit smaller while keeping
// crisp pixels. Transparent (-1) cells stay transparent.
const _nnCache = new Map();
function spriteToCanvas(sprite) {
  let cv = _nnCache.get(sprite);
  if (cv) return cv;
  let w = 0;
  for (const row of sprite) if (row.length > w) w = row.length;
  const h = sprite.length;
  cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  for (let r = 0; r < h; r++) {
    const row = sprite[r];
    for (let x = 0; x < row.length; x++) {
      const idx = row[x];
      if (idx < 0) continue;
      c.fillStyle = PALETTE[idx];
      c.fillRect(x, r, 1, 1);
    }
  }
  _nnCache.set(sprite, cv);
  return cv;
}
export function drawSpriteNN(ctx, sprite, dx, dy, factor = 1) {
  const cv = spriteToCanvas(sprite);
  const w = Math.max(1, Math.round(cv.width * factor));
  const h = Math.max(1, Math.round(cv.height * factor));
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, Math.round(dx), Math.round(dy), w, h);
  ctx.imageSmoothingEnabled = prev;
}

// Filled disc (Bresenham-ish span fill) — for suns, glows, wheels, dots.
export function disc(ctx, cx, cy, r, paletteIdx) {
  ctx.fillStyle = PALETTE[paletteIdx];
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
    ctx.fillRect((cx - dx) | 0, (cy + dy) | 0, dx * 2 + 1, 1);
  }
}

// Checkerboard ("dither") fill — fills cell-sized blocks in an every-other
// pattern so an overlay colour reads as ~50% transparent without real alpha
// (keeps the 8-bit look; lets the road show through the steer-zone highlight).
// `parity` (0/1) shifts the pattern so it can shimmer when animated.
export function ditherRect(ctx, x, y, w, h, paletteIdx, parity = 0, cell = 2) {
  ctx.fillStyle = PALETTE[paletteIdx];
  x = x | 0; y = y | 0; w = w | 0; h = h | 0;
  for (let yy = 0; yy < h; yy += cell) {
    const row = (yy / cell) | 0;
    for (let xx = (((row + parity) & 1) * cell); xx < w; xx += cell * 2) {
      ctx.fillRect(x + xx, y + yy, Math.min(cell, w - xx), Math.min(cell, h - yy));
    }
  }
}

// Hollow circle outline (1px) via the midpoint-circle algorithm — used for the
// pulsing "tap here" ripples in the steering tutorial.
export function ring(ctx, cx, cy, r, paletteIdx) {
  if (r < 1) return;
  ctx.fillStyle = PALETTE[paletteIdx];
  let x = r, y = 0, err = 1 - r;
  const p = (px, py) => ctx.fillRect(px | 0, py | 0, 1, 1);
  while (x >= y) {
    p(cx + x, cy + y); p(cx - x, cy + y); p(cx + x, cy - y); p(cx - x, cy - y);
    p(cx + y, cy + x); p(cx - y, cy + x); p(cx + y, cy - x); p(cx - y, cy - x);
    y++;
    if (err < 0) { err += 2 * y + 1; }
    else { x--; err += 2 * (y - x) + 1; }
  }
}

// Soft contact shadow centred on baseY — a 3-row patch (tapered top/bottom) that
// hugs the underside of a vehicle so it reads as sitting ON the road, not above
// it. Callers pass baseY at the car's visible base (no gap = no "flying" look).
export function groundShadow(ctx, cx, baseY, halfW, paletteIdx = 4) {
  ctx.fillStyle = PALETTE[paletteIdx];
  const w = (halfW * 2) | 0;
  ctx.fillRect((cx - halfW + 1) | 0, (baseY - 1) | 0, (w - 2) | 0, 1);
  ctx.fillRect((cx - halfW) | 0, baseY | 0, w | 0, 1);
  ctx.fillRect((cx - halfW + 1) | 0, (baseY + 1) | 0, (w - 2) | 0, 1);
}

// 3x5 pixel font — uppercase A-Z, 0-9, plus a few symbols.
// Each glyph is a 3-wide, 5-tall array of 0/1.
const FONT_3x5 = (() => {
  const G = {};
  const def = (ch, rows) => {
    G[ch] = rows.map(s => [...s].map(c => (c === "1" ? 1 : 0)));
  };
  def(" ", ["000","000","000","000","000"]);
  def("A", ["010","101","111","101","101"]);
  def("B", ["110","101","110","101","110"]);
  def("C", ["011","100","100","100","011"]);
  def("D", ["110","101","101","101","110"]);
  def("E", ["111","100","110","100","111"]);
  def("F", ["111","100","110","100","100"]);
  def("G", ["011","100","101","101","011"]);
  def("H", ["101","101","111","101","101"]);
  def("I", ["111","010","010","010","111"]);
  def("J", ["001","001","001","101","010"]);
  def("K", ["101","110","100","110","101"]);
  def("L", ["100","100","100","100","111"]);
  def("M", ["101","111","111","101","101"]);
  def("N", ["101","111","111","111","101"]);
  def("O", ["010","101","101","101","010"]);
  def("P", ["110","101","110","100","100"]);
  def("Q", ["010","101","101","111","011"]);
  def("R", ["110","101","110","101","101"]);
  def("S", ["011","100","010","001","110"]);
  def("T", ["111","010","010","010","010"]);
  def("U", ["101","101","101","101","011"]);
  def("V", ["101","101","101","010","010"]);
  def("W", ["101","101","111","111","101"]);
  def("X", ["101","101","010","101","101"]);
  def("Y", ["101","101","010","010","010"]);
  def("Z", ["111","001","010","100","111"]);
  def("0", ["010","101","101","101","010"]);
  def("1", ["010","110","010","010","111"]);
  def("2", ["110","001","010","100","111"]);
  def("3", ["110","001","010","001","110"]);
  def("4", ["101","101","111","001","001"]);
  def("5", ["111","100","110","001","110"]);
  def("6", ["011","100","110","101","010"]);
  def("7", ["111","001","010","010","010"]);
  def("8", ["010","101","010","101","010"]);
  def("9", ["010","101","011","001","110"]);
  def("!", ["010","010","010","000","010"]);
  def(":", ["000","010","000","010","000"]);
  def(".", ["000","000","000","000","010"]);
  def("-", ["000","000","111","000","000"]);
  def("/", ["001","001","010","100","100"]);
  def("X", ["101","101","010","101","101"]); // alias
  def("+", ["000","010","111","010","000"]);
  def("*", ["000","101","010","101","000"]);
  def("?", ["110","001","010","000","010"]);
  def("%", ["100","001","010","100","001"]);
  return G;
})();

export function text(ctx, str, x, y, paletteIdx = 0, scale = 1) {
  const upper = String(str).toUpperCase();
  let cx = x;
  for (let i = 0; i < upper.length; i++) {
    const g = FONT_3x5[upper[i]] || FONT_3x5["?"];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (g[r][c]) {
          ctx.fillStyle = PALETTE[paletteIdx];
          ctx.fillRect((cx + c * scale) | 0, (y + r * scale) | 0, scale, scale);
        }
      }
    }
    cx += (3 + 1) * scale; // 1px tracking
  }
  return cx; // returns next x
}

// Text with a 1px outline + optional drop shadow — gives logo/headline text the
// chunky arcade-marquee look that reads cleanly over a busy background.
export function textOutlined(ctx, str, x, y, fillIdx, outlineIdx, scale = 1, shadowIdx = null) {
  if (shadowIdx != null) text(ctx, str, x + scale, y + scale * 2, shadowIdx, scale);
  // Crisp 1px keyline in all 8 directions (kept at 1px regardless of glyph scale
  // so neighbouring characters don't merge).
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      if (ox === 0 && oy === 0) continue;
      text(ctx, str, x + ox, y + oy, outlineIdx, scale);
    }
  }
  text(ctx, str, x, y, fillIdx, scale);
}

export function textOutlinedCentered(ctx, str, y, fillIdx, outlineIdx, scale = 1, shadowIdx = null) {
  const w = String(str).length * 4 * scale - scale;
  textOutlined(ctx, str, ((W - w) / 2) | 0, y, fillIdx, outlineIdx, scale, shadowIdx);
}

export function textCentered(ctx, str, y, paletteIdx = 0, scale = 1) {
  const w = String(str).length * 4 * scale - scale;
  text(ctx, str, ((W - w) / 2) | 0, y, paletteIdx, scale);
}

export function textRight(ctx, str, x, y, paletteIdx = 0, scale = 1) {
  const w = String(str).length * 4 * scale - scale;
  text(ctx, str, x - w, y, paletteIdx, scale);
}
