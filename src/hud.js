// HUD — top score strip + bottom icon panel.
// Endless survival: shows TIME elapsed + LIVES instead of LAP + POS.
import { W, H, PHYS, RACE } from "./config.js";
import {
  rect, text, textRight, textCentered, drawSprite, drawSpriteScaled,
  disc, ditherRect, groundShadow, textOutlined, textOutlinedCentered,
} from "./render.js";
import {
  SPR_PLAYER, SPR_AI_BLUE, SPR_AI_GREEN, SPR_AI_ORANGE, SPR_PALM, SPR_TREE,
  SPR_SEDAN_BLUE, SPR_SEDAN_RED, SPR_BUS_YELLOW,
  ICN_SPEED, ICN_FLAG, ICN_TROPHY, ICN_PASS,
} from "./sprites.js";

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
  score, speed, passed, mapKind, time, lives, densityMul,
}) {
  // Top thin score strip
  rect(ctx, 0, 0, W, 9, 0);
  rect(ctx, 0, 8, W, 1, 4);
  text(ctx, "SCORE " + pad(score, 6), 4, 2, 5);
  // Density indicator on the right when traffic is intensified.
  if (densityMul && densityMul > 1.001) {
    const pct = Math.round((densityMul - 1) * 100);
    textRight(ctx, "+" + pct + "%", W - 4, 2, 9);
  }

  // Bottom panel
  const panelTop = H - 22;
  rect(ctx, 0, panelTop, W, 22, 4);
  rect(ctx, 0, panelTop, W, 1, 1);
  rect(ctx, 0, panelTop + 1, W, 1, 2);
  rect(ctx, 0, H - 1, W, 1, 0);

  // Cell 1 — speedometer (peaks at PHYS.topSpeedKmh, currently 250)
  drawSprite(ctx, ICN_SPEED, 3, panelTop + 7);
  const kmh = Math.round(speed / PHYS.maxSpeed * (PHYS.topSpeedKmh || 250));
  text(ctx, pad(kmh, 3), 13, panelTop + 9, 1);
  text(ctx, "KMH", 13, panelTop + 15, 5);

  // Cell 2 — time elapsed
  drawSprite(ctx, ICN_FLAG, 52, panelTop + 7);
  text(ctx, mmss(time || 0), 62, panelTop + 9, 1);
  text(ctx, "TIME", 62, panelTop + 15, 5);

  // Cell 3 — lives (hearts)
  const livesCount = Math.max(0, lives || 0);
  for (let i = 0; i < 3; i++) {
    const x = 92 + i * 8;
    if (i < livesCount) {
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
const TITLE_HORIZON = 104;

// Sunset gradient bands, top → horizon. [yStart, paletteIdx]
const SKY_BANDS = [
  [0, 23], [13, 16], [27, 12], [42, 15], [56, 6], [70, 9], [86, 5], [98, 21],
];

// Deterministic star field (upper sky only).
const TITLE_STARS = (() => {
  let s = 0x1a2b3c;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = [];
  for (let i = 0; i < 30; i++) out.push({ x: (rnd() * W) | 0, y: (rnd() * 60) | 0, ph: (rnd() * 1000) | 0 });
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

function drawTitleSky(ctx) {
  for (let b = 0; b < SKY_BANDS.length; b++) {
    const y0 = SKY_BANDS[b][0];
    const y1 = b + 1 < SKY_BANDS.length ? SKY_BANDS[b + 1][0] : TITLE_HORIZON;
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
  const cx = 80, cy = 84;
  // Outer halo + body (classic slatted synthwave sun).
  disc(ctx, cx, cy, 19, 9);    // orange glow ring
  disc(ctx, cx, cy, 16, 21);   // light-yellow body
  disc(ctx, cx, cy, 13, 5);    // yellow core
  // Horizontal slats over the lower half, colour matched to the bands behind.
  rect(ctx, cx - 18, cy + 4,  36, 2, 9);
  rect(ctx, cx - 18, cy + 8,  36, 2, 9);
  rect(ctx, cx - 18, cy + 12, 36, 3, 9);
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
  const wob = Math.sin(t / 420) * 1.2;
  const x = (80 - 16 + wob) | 0;          // sprite is 16w → centre at 80
  groundShadow(ctx, 80, topY + 24 * scale, 18);
  drawSpriteScaled(ctx, SPR_PLAYER, x, topY, scale);
  // Flickering exhaust glow at the rear (bottom) of the car.
  if ((Math.floor(t / 90) % 2) === 0) {
    disc(ctx, 74, topY + 24 * scale + 2, 2, 9);
    disc(ctx, 86, topY + 24 * scale + 2, 2, 5);
  } else {
    disc(ctx, 74, topY + 24 * scale + 2, 1, 5);
    disc(ctx, 86, topY + 24 * scale + 2, 2, 9);
  }
}

export function drawTitleScreen(ctx, allTimeBest) {
  const t = performance.now();

  // Layout anchored to the bottom so the hero shot fills any screen height.
  const heroTopY = H - 90;
  const bannerY = heroTopY - 28;

  // ── Scene ──
  drawTitleSky(ctx);
  drawStars(ctx, t);
  drawSun(ctx, t);
  drawSkyline(ctx, t);
  drawTitleRoad(ctx, t);
  drawHeroCar(ctx, t, heroTopY);

  // ── Logo ──
  textOutlinedCentered(ctx, "JOSHUA 1", 12, 5, 0, 3, 7);   // yellow on black, dk-red shadow
  textOutlinedCentered(ctx, "RACING",   32, 6, 0, 2, 7);   // red on black

  // ── Best-score chip ──
  const chipW = 96, chipX = (W - chipW) / 2 | 0, chipY = 48;
  rect(ctx, chipX, chipY, chipW, 13, 0);
  rect(ctx, chipX, chipY, chipW, 1, 5);
  rect(ctx, chipX, chipY + 12, chipW, 1, 9);
  drawSprite(ctx, ICN_TROPHY, chipX + 4, chipY + 3);
  text(ctx, "BEST", chipX + 14, chipY + 4, 5, 1);
  text(ctx, pad(allTimeBest, 6), chipX + 38, chipY + 4, 1, 1);

  // ── "TAP TO START" banner (floating above the hero car) ──
  rect(ctx, 8, bannerY, W - 16, 18, 0);
  rect(ctx, 8, bannerY, W - 16, 1, 1);
  rect(ctx, 8, bannerY + 17, W - 16, 1, 0);
  const promptIdx = (Math.floor(t / 400) % 2 === 0) ? 5 : 1;
  textOutlinedCentered(ctx, "TAP TO START", bannerY + 4, promptIdx, 0, 2);

  // ── Control hints (pinned to the bottom edge) ──
  textCentered(ctx, "TAP SIDES OR ARROWS", H - 26, 1, 1);
  textCentered(ctx, "AUTO GAS  NO BRAKE", H - 16, 21, 1);
  textCentered(ctx, "3 LIVES  DODGE TRAFFIC", H - 8, 14, 1);
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
      labelCentered(ctx, label, x + (w / 2 | 0), cyZone + 14, 1);
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

export function drawGameOver(ctx, { score, hi, isNew, reason, passed, time }) {
  // Dark backdrop with a bright accent banner.
  rect(ctx, 0, 0, W, H, 0);
  // Top banner
  rect(ctx, 0, 24, W, 30, 6);
  rect(ctx, 0, 22, W, 2, 7);
  rect(ctx, 0, 54, W, 2, 7);
  textOutlinedCentered(ctx, reason, 32, 1, 0, 2, 7);

  // Stats panel — vertically centred in the space between the banner and the
  // footer so taller screens don't leave a big empty gap.
  const panelTop = Math.max(72, ((H - 80) / 2) | 0);

  // "RESULTS" sub-label
  text(ctx, "RESULTS", ((W - 7 * 4) / 2) | 0, panelTop - 12, 5);

  rect(ctx, 8, panelTop, W - 16, 80, 4);
  rect(ctx, 8, panelTop, W - 16, 1, 1);
  rect(ctx, 8, panelTop + 79, W - 16, 1, 0);

  text(ctx, "TIME",  14, panelTop + 8,  13);
  text(ctx, mmss(time || 0), W - 14 - 5 * 4, panelTop + 8, 1);

  text(ctx, "SCORE", 14, panelTop + 22, 13);
  text(ctx, pad(score, 6), W - 14 - 6 * 4, panelTop + 22, 1);

  text(ctx, "HI",    14, panelTop + 36, 13);
  text(ctx, pad(hi, 6), W - 14 - 6 * 4, panelTop + 36, 5);

  text(ctx, "PASSED", 14, panelTop + 50, 13);
  text(ctx, pad(passed != null ? passed : 0, 3), W - 14 - 3 * 4, panelTop + 50, 1);

  if (isNew) {
    if (Math.floor(performance.now() / 350) % 2 === 0) {
      text(ctx, "NEW HI SCORE!", ((W - 13 * 4) / 2) | 0, panelTop + 66, 5);
    } else {
      text(ctx, "NEW HI SCORE!", ((W - 13 * 4) / 2) | 0, panelTop + 66, 9);
    }
  }

  // Footer prompt
  text(ctx, "TAP OR PRESS START",  ((W - 18 * 4) / 2) | 0, H - 36, 1);
  text(ctx, "TO PLAY AGAIN",       ((W - 13 * 4) / 2) | 0, H - 24, 13);
  text(ctx, "ESC FOR MENU",        ((W - 12 * 4) / 2) | 0, H - 12, 14);
}

export function drawPaused(ctx) {
  const cy = (H / 2) | 0;
  rect(ctx, 16, cy - 24, W - 32, 48, 0);
  rect(ctx, 16, cy - 24, W - 32, 2, 5);
  rect(ctx, 16, cy + 22, W - 32, 2, 5);
  textOutlinedCentered(ctx, "PAUSED", cy - 14, 5, 0, 2, 7);
  if (Math.floor(performance.now() / 450) % 2 === 0) {
    textCentered(ctx, "TAP TO RESUME", cy + 8, 1, 1);
  }
}
