// HUD — top score strip + bottom icon panel.
// Endless survival: shows TIME elapsed + LIVES instead of LAP + POS.
import { W, H, PHYS, RACE } from "./config.js";
import { rect, text, textRight, drawSprite } from "./render.js";
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

export function drawTitleScreen(ctx, allTimeBest) {
  // Sky gradient
  rect(ctx, 0, 0, W, H, 12);
  rect(ctx, 0, 60, W, 30, 13);
  // Sun
  rect(ctx, 100, 40, 16, 16, 5);
  rect(ctx, 102, 38, 12, 20, 5);
  rect(ctx, 98, 42, 20, 12, 5);
  // Road strip
  rect(ctx, 0, 90, W, 70, 10);
  rect(ctx, 32, 90, W - 64, 70, 3);
  rect(ctx, 32, 90, 2, 70, 1);
  rect(ctx, W - 34, 90, 2, 70, 1);
  for (let i = 0; i < 6; i++) rect(ctx, W/2 - 1, 96 + i * 12, 2, 6, 5);
  // Roadside
  drawSprite(ctx, SPR_TREE, 4, 100);
  drawSprite(ctx, SPR_TREE, 4, 130);
  drawSprite(ctx, SPR_TREE, W - 18, 100);
  drawSprite(ctx, SPR_TREE, W - 18, 130);
  // Cars on road
  const bob = Math.floor(performance.now() / 200) % 2;
  drawSprite(ctx, SPR_PLAYER, W/2 - 7, 130 + bob);
  drawSprite(ctx, SPR_SEDAN_BLUE, W/2 - 22, 100 - bob);
  drawSprite(ctx, SPR_BUS_YELLOW, W/2 + 8, 96 + bob);

  // Title band
  rect(ctx, 0, 14, W, 18, 6);
  rect(ctx, 0, 12, W, 2, 7);
  rect(ctx, 0, 32, W, 2, 7);
  text(ctx, "JOSHUA 1", 36, 18, 1, 2);
  text(ctx, "RACING", 56, 32, 7, 1);

  // Bottom info panel
  rect(ctx, 0, H - 64, W, 64, 4);
  rect(ctx, 0, H - 64, W, 1, 1);
  text(ctx, "TAP OR PRESS START", 14, H - 56, 1, 1);
  text(ctx, "BEST  " + pad(allTimeBest, 6), 30, H - 38, 5, 1);
  text(ctx, "ARROWS - STEER", 26, H - 24, 13, 1);
  text(ctx, "DOWN - BRAKE", 32, H - 12, 13, 1);
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
  rect(ctx, 0, H/2 - 28, W, 56, 0);
  rect(ctx, 0, H/2 - 26, W, 52, 6);
  const sz = 5;
  const txtW = label.length * 4 * sz - sz;
  text(ctx, label, ((W - txtW) / 2) | 0, (H/2 - 12) | 0, 1, sz);
}

export function drawGameOver(ctx, { score, hi, isNew, reason, passed, time }) {
  rect(ctx, 0, 0, W, H, 0);
  rect(ctx, 0, 30, W, 22, 6);
  text(ctx, reason, ((W - reason.length * 8) / 2) | 0, 36, 1, 2);

  text(ctx, "SURVIVED " + mmss(time || 0), ((W - 14 * 4) / 2) | 0, 76, 1);
  text(ctx, "SCORE " + pad(score, 6), ((W - 12 * 4) / 2) | 0, 100, 1);
  text(ctx, "HI    " + pad(hi, 6), ((W - 12 * 4) / 2) | 0, 114, 5);
  if (passed != null) {
    text(ctx, "CARS PASSED " + pad(passed, 3), ((W - 15 * 4) / 2) | 0, 128, 13);
  }
  if (isNew) {
    if (Math.floor(performance.now() / 400) % 2 === 0) {
      text(ctx, "NEW HI SCORE!", ((W - 13 * 4) / 2) | 0, 148, 5);
    }
  }
  text(ctx, "TAP OR PRESS START", ((W - 18 * 4) / 2) | 0, H - 36, 1);
  text(ctx, "ESC FOR MENU", ((W - 12 * 4) / 2) | 0, H - 22, 14);
}

export function drawPaused(ctx) {
  rect(ctx, 0, H/2 - 10, W, 20, 0);
  text(ctx, "PAUSED", (W - 24) / 2, H/2 - 3, 1, 1);
}
