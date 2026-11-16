// The LOOK pass, asserted against recorded draws: cast shadows that agree with
// the light, wheel-path wear on the asphalt, a horizon haze that fades instead
// of dithering, and exhaust that reads as air rather than debris.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // the repo root
const imp = (r) => import(pathToFileURL(path.join(ROOT, r)).href);

// ── Canvas stubs ─────────────────────────────────────────────────────────────
// The screen records every fill and blit, with the globalAlpha in force. The
// offscreen bake canvases record which cells were filled (and in what), so a
// shadow can be checked against the sprite it was baked from.
let REC = [];
function makeCtx() {
  return { _f: "#000", globalAlpha: 1, imageSmoothingEnabled: false,
    set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; },
    fillRect(x, y, w, h) { REC.push({ x, y, w, h, c: this._f, a: this.globalAlpha }); },
    drawImage(img, x, y, w, h) { REC.push({ x, y, w, h, c: "IMG", a: this.globalAlpha, img }); } };
}
function bakeCanvas() {
  const cv = { width: 0, height: 0, cells: new Set(), fills: new Set() };
  cv.getContext = () => ({ _f: "", imageSmoothingEnabled: false,
    set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; },
    fillRect(x, y) { cv.cells.add(x + "," + y); cv.fills.add(this._f); }, drawImage() {} });
  return cv;
}
globalThis.document = { createElement: () => bakeCanvas() };
let CLOCK = 1000;
globalThis.performance.now = () => CLOCK;

const { W, H, PHYS, PLAYER_Y, PALETTE } = await imp("src/config.js");
const render = await imp("src/render.js");
const road = await imp("src/road.js");
const traffic = await imp("src/entities/traffic.js");
const player = await imp("src/entities/player.js");
const smoke = await imp("src/entities/smoke.js");
const { TRAFFIC_SKINS } = await imp("src/sprites.js");
const { MAPS } = await imp("src/maps.js");
const map = MAPS.city, ctx = makeCtx();
const R = [], add = (l, p, d = "") => R.push([l, !!p, d]);
const reset = () => { REC = []; };
const alphaOf = (c) => { const m = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(c); return m ? +m[1] : 1; };
const cellsOf = (spr) => { const s = new Set(); spr.forEach((row, y) => row.forEach((v, x) => { if (v >= 0) s.add(x + "," + y); })); return s; };
const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

// ══ A. CAST SHADOWS ══════════════════════════════════════════════════════════
{
  const day = road.sunShadow(road.BIOMES[0], { dark: 0 });
  const night = road.sunShadow(road.BIOMES[0], { dark: 1 });
  const tunnel = road.sunShadow(road.BIOMES[1], { dark: 0 });
  add("A1 by day the shadow falls right and back (light top-left, like the paintwork)",
    day.ox > 0 && day.oy > 0 && day.alpha > 0 && day.alpha < 0.5, JSON.stringify(day));
  add("A2 night fades it without moving it (no jump at dusk)",
    night.ox === day.ox && night.oy === day.oy && night.alpha < day.alpha && night.alpha > 0, JSON.stringify(night));
  let mono = true, prev = 9;
  for (let d = 0; d <= 1.0001; d += 0.05) { const a = road.sunShadow(road.BIOMES[0], { dark: d }).alpha; if (a > prev + 1e-9) mono = false; prev = a; }
  add("A3 ...and fades steadily as it darkens", mono);
  add("A4 in the tunnel (ceiling lights) it tucks under the car as a contact shadow",
    tunnel.ox === 0 && tunnel.oy >= 1 && tunnel.oy < day.oy && tunnel.alpha > 0, JSON.stringify(tunnel));

  // A road of hand-placed cars, one per lane, plus a wrong-way car.
  Object.assign(render.SUN, day);
  const sys = traffic.makeTrafficSystem();
  const z0 = 1000;
  sys.list = [0, 1, 2, 3, 4].map((lane, i) => ({
    skin: TRAFFIC_SKINS[(i * 3) % TRAFFIC_SKINS.length], z: z0 + 20 + i * 9,
    x: -map.roadHalfWidth + (map.roadHalfWidth * 2 / 5) * (lane + 0.5), laneIdx: lane,
    speed: 15, cruise: 15, passed: false, nearMissed: false, driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0,
  }));
  reset(); traffic.drawTraffic(ctx, sys, map, z0, 0);
  const imgs = REC.filter((r) => r.c === "IMG");
  const shadows = imgs.filter((r) => r.a < 1), bodies = imgs.filter((r) => r.a === 1);
  add("A5 every car casts exactly one shadow", shadows.length === sys.list.length && bodies.length === sys.list.length,
    `${shadows.length} shadows, ${bodies.length} bodies, ${sys.list.length} cars`);
  let paired = 0, order = true, silhouette = true, black = true;
  for (const b of bodies) {
    const s = shadows.find((q) => q.x === b.x + day.ox && q.y === b.y + day.oy && q.w === b.w && q.h === b.h);
    if (s) paired++;
    if (s && REC.indexOf(s) > REC.indexOf(b)) order = false;
    if (s && !sameSet(s.img.cells, cellsOf(sys.list.find((c) => c.skin.spr && sameSet(cellsOf(c.skin.spr), s.img.cells))?.skin.spr || [[]]))) silhouette = false;
    if (s && !(s.img.fills.size === 1 && s.img.fills.has("#000000"))) black = false;
  }
  add("A6 each shadow is offset from its own car by exactly SUN, same size", paired === bodies.length, `${paired}/${bodies.length}`);
  add("A7 ...and drawn BEFORE the car, so the car sits on it", order);
  add("A8 ...and is the car's own silhouette, baked in black", silhouette && black);
  add("A9 drawn at the SUN's translucency", shadows.every((s) => Math.abs(s.a - day.alpha) < 1e-9), shadows.map((s) => s.a).join(","));
  add("A10 the old opaque ground patch is gone", REC.filter((r) => r.c === PALETTE[4]).length === 0);
  add("A11 globalAlpha is restored after drawing traffic", ctx.globalAlpha === 1, String(ctx.globalAlpha));

  // Tunnel offset is honoured too (the offset comes from SUN, not a constant).
  Object.assign(render.SUN, tunnel);
  reset(); traffic.drawTraffic(ctx, sys, map, z0, 0);
  const ti = REC.filter((r) => r.c === "IMG"), ts = ti.filter((r) => r.a < 1), tb = ti.filter((r) => r.a === 1);
  add("A12 the tunnel's contact offset is what gets drawn", tb.every((b) => ts.some((s) => s.x === b.x + tunnel.ox && s.y === b.y + tunnel.oy)));

  // The player gets the same treatment, at the player's own blit size.
  Object.assign(render.SUN, day);
  const p = player.makePlayer(); p.x = 0; p.speed = PHYS.maxSpeed * 0.5;
  reset(); player.drawPlayer(ctx, p, map);
  const pi = REC.filter((r) => r.c === "IMG"), ps = pi.filter((r) => r.a < 1), pb = pi.filter((r) => r.a === 1);
  add("A13 the player casts a shadow too, offset by SUN at the sprite's size",
    ps.length === 1 && pb.length === 1 && ps[0].x === pb[0].x + day.ox && ps[0].y === pb[0].y + day.oy
      && ps[0].w === pb[0].w && ps[0].h === pb[0].h && REC.indexOf(ps[0]) < REC.indexOf(pb[0]),
    JSON.stringify({ s: ps.map(({ x, y, w, h }) => [x, y, w, h]), b: pb.map(({ x, y, w, h }) => [x, y, w, h]) }));
  add("A14 globalAlpha is restored after drawing the player", ctx.globalAlpha === 1);
  render.SUN.alpha = 0;
  reset(); player.drawPlayer(ctx, p, map);
  add("A15 a zero-strength sun draws no shadow at all", REC.filter((r) => r.c === "IMG").length === 1);
  Object.assign(render.SUN, day);
}

// ══ B. WHEEL PATHS ═══════════════════════════════════════════════════════════
{
  const WEAR = PALETTE[26];
  const halfW = map.roadHalfWidth, cx = W / 2 + map.biasX, laneW = halfW * 2 / 5;
  const snap = (z, kmh) => { reset(); road.drawRoad(ctx, map, z, PHYS.maxSpeed * kmh / PHYS.topSpeedKmh, road.BIOMES[0], false); return REC.slice(); };
  const wearCols = (rec) => rec.filter((r) => r.c === WEAR && r.y === 0 && r.h === H).map((r) => [r.x, r.x + r.w]);
  const rec = snap(1234.5, 150);
  const cols = wearCols(rec);
  add("B1 two wheel paths in each of the five lanes", cols.length === 10 && cols.every(([a, b]) => b - a === 2), JSON.stringify(cols));
  // Where a real traffic car's wheels land: the outermost sprite columns of a
  // car blitted exactly as drawTraffic does, in every lane.
  let covered = 0;
  for (let lane = 0; lane < 5; lane++) {
    const x = -halfW + laneW * (lane + 0.5);
    const sx = (cx + x) | 0, w = TRAFFIC_SKINS[0].w;
    const left = Math.round(sx - w / 2), right = left + w - 1;
    if (cols.some(([a, b]) => left >= a && left < b) && cols.some(([a, b]) => right >= a && right < b)) covered++;
  }
  add("B2 they run exactly under the traffic's tyres", covered === 5, `${covered}/5 lanes`);
  const seams = rec.filter((r) => r.c === PALETTE[2] && r.w === 1 && r.h === H).map((r) => r.x);
  add("B3 a wheel path never touches a lane seam", cols.every(([a, b]) => seams.every((s) => s < a || s >= b)), JSON.stringify(seams));
  const firstSeam = rec.findIndex((r) => r.c === PALETTE[2] && r.w === 1 && r.h === H);
  const lastWear = rec.map((r) => r.c).lastIndexOf(WEAR);
  add("B4 seams are painted after the wear (never overpainted)", firstSeam > lastWear, `${lastWear} < ${firstSeam}`);
  add("B5 inside the asphalt, clear of the edge inset", cols.every(([a, b]) => a >= cx - halfW + 2 && b <= cx + halfW - 2));
  const sig = (r) => JSON.stringify(wearCols(r));
  add("B6 z- and speed-invariant (zero optic flow)",
    [snap(0, 40), snap(37.3, 100), snap(9999.7, 200)].every((r) => sig(r) === sig(rec)));
  const v = (hex) => parseInt(hex.slice(1, 3), 16);
  add("B7 one shade under the asphalt, not a line", v(WEAR) < v(PALETTE[map.roadIdx]) && v(PALETTE[map.roadIdx]) - v(WEAR) <= 16,
    `${WEAR} vs ${PALETTE[map.roadIdx]}`);
}

// ══ C. HORIZON HAZE ══════════════════════════════════════════════════════════
{
  for (const bm of [road.BIOMES[0], road.BIOMES[1]]) {
    reset(); road.drawDistanceHaze(ctx, bm);
    const hex = PALETTE[bm.haze], rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
    const solid = REC.filter((r) => r.c === hex);
    const fade = REC.filter((r) => r.c.startsWith("rgba("));
    add(`C1 ${bm.name}: no dither left (nothing narrower than the screen)`, REC.every((r) => r.w === W), `${REC.filter((r) => r.w !== W).length} narrow fills`);
    add(`C2 ${bm.name}: solid under the HUD strip`, solid.length === 1 && solid[0].y === 0 && solid[0].h >= 9);
    let ok = fade.length >= 8, prevA = 1, prevY = solid[0] ? solid[0].y + solid[0].h - 1 : 0;
    for (const r of fade) {
      const a = alphaOf(r.c);
      if (!(a < prevA && r.y === prevY + 1 && r.h === 1 && r.c.includes(`rgba(${rgb},`))) ok = false;
      prevA = a; prevY = r.y;
    }
    add(`C3 ${bm.name}: then fades out row by row in its own colour`, ok && prevA < 0.1, `${fade.length} rows, last alpha ${prevA}`);
  }
}

// ══ D. EXHAUST ═══════════════════════════════════════════════════════════════
{
  const car = { x: 0, z: 500, speed: 40, smoke: [] };
  for (let k = 0; k < 10; k++) car.smoke.push({ x: 0, z: 500 - 7 - k, age: 0.5 * k / 10, fire: false });
  reset(); smoke.drawSmoke(ctx, map, 500, 0, car);
  const alphas = REC.map((r) => alphaOf(r.c));
  add("D1 exhaust puffs are translucent, never an opaque block", REC.length === 10 && REC.every((r) => r.c.startsWith("rgba(")) && alphas.every((a) => a < 0.5),
    REC.map((r) => r.c).join(" "));
  add("D2 ...and thin out as they age", alphas.every((a, i) => i === 0 || a < alphas[i - 1]));
  car.smoke = [{ x: 0, z: 493, age: 0.05, fire: true }];
  reset(); smoke.drawSmoke(ctx, map, 500, 0, car);
  add("D3 rampage fire is untouched (bright, opaque)", REC.length === 1 && REC[0].c === PALETTE[9]);
}

console.log("");
let ok = true;
for (const [l, p, d] of R) { if (!p) ok = false; console.log(`   ${p ? "PASS" : "FAIL"}  ${l}${p || !d ? "" : "  [" + d + "]"}`); }
console.log("\n" + (ok ? "=== LOOK PASS CLEAN ===" : "=== PROBLEMS ==="));
process.exit(ok ? 0 : 1);
