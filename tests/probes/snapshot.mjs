// Headless SCREENSHOTS of the real game: renders gameplay frames to PNG with no
// browser, so a look change can be judged pixel by pixel and compared
// before/after. (The browser pane serves stale modules and renders black when
// hidden; this does neither.)
//
//   node tests/probes/snapshot.mjs now                  shots of the working tree
//   node tests/probes/snapshot.mjs now day8,night       just some scenes
//   node tests/probes/snapshot.mjs --compare old now    side-by-side sheet
//
// To shoot an older commit, extract it and point J1_ROOT at it:
//   git archive 04df0c3 src tests/harness.mjs | tar -x -C ../old
//   J1_ROOT=../old node tests/probes/snapshot.mjs old
//
// Output: tests/.gen/shots/<label>/<scene>.png (4x), sheet.png (2x), and .raw
// frames for --compare. How it works: a patched copy of tests/harness.mjs whose
// sprite-bake canvases are software rasters and whose screen record keeps each
// blit's source and globalAlpha; a recorded frame is then replayed into RGBA.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const ROOT = path.resolve(process.env.J1_ROOT || REPO);
const GEN = path.join(REPO, "tests/.gen");
const SHOTS = path.join(GEN, "shots");

// ── software raster ──
class Soft {
  constructor() { this._w = 0; this._h = 0; this.buf = new Uint8ClampedArray(0); }
  get width() { return this._w; } set width(v) { this._w = v | 0; this.buf = new Uint8ClampedArray(this._w * this._h * 4); }
  get height() { return this._h; } set height(v) { this._h = v | 0; this.buf = new Uint8ClampedArray(this._w * this._h * 4); }
  getContext() {
    const cv = this;
    return new Proxy({
      _fill: "#000000", globalAlpha: 1, imageSmoothingEnabled: false,
      set fillStyle(v) { this._fill = v; }, get fillStyle() { return this._fill; },
      fillRect(x, y, w, h) { paint(cv.buf, cv._w, cv._h, x, y, w, h, this._fill); },
      drawImage(img, x, y, w, h) { blit(cv.buf, cv._w, cv._h, img, x, y, w, h, this.globalAlpha); },
    }, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
}
function parseColor(c) {
  if (typeof c !== "string") return [255, 0, 255, 1];
  if (c[0] === "#") { const n = parseInt(c.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(",").map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  return [255, 0, 255, 1];
}
function paint(buf, W, H, x, y, w, h, col) {
  if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
  const [r, g, b, a] = parseColor(col);
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
    const i = (yy * W + xx) * 4;
    buf[i] = buf[i] * (1 - a) + r * a; buf[i + 1] = buf[i + 1] * (1 - a) + g * a; buf[i + 2] = buf[i + 2] * (1 - a) + b * a;
    buf[i + 3] = Math.max(buf[i + 3], Math.round(a * 255));
  }
}
function blit(buf, W, H, img, x, y, w, h, alpha = 1) {
  if (!img || !img.buf) return;
  const sw = img.width, sh = img.height;
  if (w == null) { w = sw; h = sh; }
  const dx0 = Math.round(x), dy0 = Math.round(y), dw = Math.round(w), dh = Math.round(h);
  const ga = typeof alpha === "number" ? alpha : 1;
  for (let yy = 0; yy < dh; yy++) for (let xx = 0; xx < dw; xx++) {
    const tx = dx0 + xx, ty = dy0 + yy;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
    const sx = Math.min(sw - 1, Math.floor((xx + 0.5) * sw / dw)), sy = Math.min(sh - 1, Math.floor((yy + 0.5) * sh / dh));
    const si = (sy * sw + sx) * 4;
    if (img.buf[si + 3] < 8) continue;
    const a = ga * img.buf[si + 3] / 255, di = (ty * W + tx) * 4;
    buf[di] = buf[di] * (1 - a) + img.buf[si] * a; buf[di + 1] = buf[di + 1] * (1 - a) + img.buf[si + 1] * a;
    buf[di + 2] = buf[di + 2] * (1 - a) + img.buf[si + 2] * a; buf[di + 3] = 255;
  }
}

// ── PNG ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePNG(file, buf, W, H, scale) {
  const OW = W * scale, OH = H * scale, raw = Buffer.alloc((OW * 3 + 1) * OH);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const si = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4, di = y * (OW * 3 + 1) + 1 + x * 3;
    raw[di] = buf[si]; raw[di + 1] = buf[si + 1]; raw[di + 2] = buf[si + 2];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(OW, 0); ihdr.writeUInt32BE(OH, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
// Frames side by side with a white gutter.
function sheet(file, frames, W, H, scale) {
  const GAP = 4, SW = frames.length * (W + GAP) - GAP, out = new Uint8ClampedArray(SW * H * 4).fill(255);
  frames.forEach((f, k) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 4, di = (y * SW + k * (W + GAP) + x) * 4;
      out[di] = f[si]; out[di + 1] = f[si + 1]; out[di + 2] = f[si + 2]; out[di + 3] = 255;
    }
  });
  writePNG(file, out, SW, H, scale);
}

const args = process.argv.slice(2);
const W = 160, H = 346;   // the harness's 375x812 viewport

// ── --compare a b ──
if (args[0] === "--compare") {
  const [a, b] = args.slice(1);
  const scenes = fs.readdirSync(path.join(SHOTS, a)).filter((f) => f.endsWith(".raw") && fs.existsSync(path.join(SHOTS, b, f)));
  const frames = [];
  for (const f of scenes) for (const l of [a, b]) frames.push(new Uint8ClampedArray(fs.readFileSync(path.join(SHOTS, l, f))));
  const out = path.join(SHOTS, `compare_${a}_${b}.png`);
  sheet(out, frames, W, H, 2);
  console.log(`${scenes.map((s) => s.replace(".raw", "")).join(", ")}: ${a} | ${b} pairs → ${out}`);
  process.exit(0);
}

// ── render scenes ──
const label = args[0] || "now";
const wanted = (args[1] || "day8,day30,night,tunnel,coast,bridge").split(",");
const OUT = path.join(SHOTS, label);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(GEN, "snap"), { recursive: true });

let h = fs.readFileSync(path.join(ROOT, "tests/harness.mjs"), "utf8").replace(/\r\n/g, "\n");
const patch = (a, b) => { if (!h.includes(a)) throw new Error("harness changed; update snapshot.mjs: " + a.slice(0, 60)); h = h.replace(a, b); };
patch(`const ROOT = path.resolve(HERE, "..");`, `const ROOT = ${JSON.stringify(ROOT)};`);
patch(`const GEN = path.join(HERE, ".gen");`, `const GEN = ${JSON.stringify(path.join(GEN, "snap"))};`);
patch(`drawImage(img, x, y, w, h) { if (record && REC.on) REC.list.push({ x, y, w, h, c: "IMG" }); }`,
      `drawImage(img, x, y, w, h) { if (record && REC.on) REC.list.push({ x, y, w, h, c: "IMG", img, a: (typeof this.globalAlpha === "number" ? this.globalAlpha : 1) }); }`);
patch(`    e.width = 0; e.height = 0;\n    e.getContext = () => makeCtx(false);`,
      `    const s = new globalThis.__Soft();\n    Object.defineProperty(e, "width", { get: () => s.width, set: (v) => { s.width = v; } });\n    Object.defineProperty(e, "height", { get: () => s.height, set: (v) => { s.height = v; } });\n    Object.defineProperty(e, "buf", { get: () => s.buf });\n    e.getContext = () => s.getContext();`);
globalThis.__Soft = Soft;
const hf = path.join(GEN, "snap", "harness_snap.mjs");
fs.writeFileSync(hf, h);
const HN = await import(pathToFileURL(hf).href + "?t=" + Date.now());
const { M, REC } = HN, { g, STATES } = M;

function frame() {
  REC.on = true; REC.list = []; HN.tick(); REC.on = false;
  const buf = new Uint8ClampedArray(W * H * 4);
  for (const r of REC.list) r.c === "IMG" ? blit(buf, W, H, r.img, r.x, r.y, r.w, r.h, r.a ?? 1) : paint(buf, W, H, r.x, r.y, r.w, r.h, r.c);
  return buf;
}
// Drive a seeded race to `t` s, invulnerable (a blind car crashes), then shoot a
// frame on a beat where the invulnerability blink shows the car.
function raceTo(t, seedN) {
  HN.seed(seedN);
  if (g.state !== STATES.TITLE) g.state = STATES.TITLE;
  HN.tick(); HN.startRace();
  for (let i = 0; g.raceTime < t && i < 60 * (t + 30); i++) { g.player.invuln = 99; g.player.lives = 3; HN.tick(); }
  Object.assign(g, { crashFlash: 0, crashFx: 0, hitStop: 0 });
  HN.tick();
  HN.CLOCK.t = (Math.floor(HN.CLOCK.t / 120) + 1) * 120 + 61 - 1000 / 60;
}
const SCENES = { day8: [8, 7], day30: [30, 11], night: [54, 5], tunnel: [72, 3], coast: [140, 9], bridge: [165, 4] };
const frames = [];
for (const s of wanted) {
  if (!SCENES[s]) { console.log("unknown scene " + s + " (have: " + Object.keys(SCENES).join(", ") + ")"); continue; }
  raceTo(...SCENES[s]);
  const buf = frame();
  writePNG(path.join(OUT, s + ".png"), buf, W, H, 4);
  fs.writeFileSync(path.join(OUT, s + ".raw"), Buffer.from(buf.buffer));
  frames.push(buf);
}
if (frames.length) sheet(path.join(OUT, "sheet.png"), frames, W, H, 2);
console.log(`${wanted.join(", ")} → ${OUT}`);
