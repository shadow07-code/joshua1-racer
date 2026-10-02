// Full-game headless harness: runs the LITERAL shipped main.js in Node.
//
// main.js is a side-effecting entry module whose state (`g`) is private, so it is
// normally only reachable through a browser. This rewrites its relative imports
// to absolute file URLs, routes audio.js through a spy that logs every call, and
// appends one export line — then imports that. Nothing else about the code
// changes: every frame below runs the real update()/render()/frame().
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

// Everything is found relative to this file (tests/ sits in the repo root), so the
// kit runs from any checkout or worktree. The two modules generated below go in
// tests/.gen/, which is gitignored.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const GEN = path.join(HERE, ".gen");
fs.mkdirSync(GEN, { recursive: true });
const srcUrl = (rel) => pathToFileURL(path.join(ROOT, "src", rel)).href;

// ── deterministic Math.random ──
export function seed(n) {
  let a = n >>> 0;
  Math.random = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
seed(1);

// ── clock ──
export const CLOCK = { t: 1000 };
globalThis.performance.now = () => CLOCK.t;

// ── canvas: records fillRects when REC.on ──
export const REC = { on: false, list: [] };
function makeCtx(record) {
  // Unknown canvas methods (paths, gradients...) are harmless no-ops.
  return new Proxy(makeCtxBase(record), { get: (t, k) => (k in t ? t[k] : () => {}) });
}
function makeCtxBase(record) {
  return {
    _fill: "#000000",
    set fillStyle(v) { this._fill = v; }, get fillStyle() { return this._fill; },
    imageSmoothingEnabled: false,
    fillRect(x, y, w, h) { if (record && REC.on) REC.list.push({ x, y, w, h, c: this._fill }); },
    drawImage(img, x, y, w, h) { if (record && REC.on) REC.list.push({ x, y, w, h, c: "IMG" }); },
    clearRect() {}, save() {}, restore() {}, fillText() {}, measureText: () => ({ width: 0 }),
  };
}

// ── DOM ──
const listeners = { window: {}, document: {} };
const on = (bag) => (type, fn) => { (bag[type] = bag[type] || []).push(fn); };
function makeEl(id) {
  const store = { id, style: {}, dataset: {}, children: [], textContent: "", value: "" };
  const cls = new Set();
  store.classList = {
    add: (c) => cls.add(c), remove: (c) => cls.delete(c),
    toggle: (c, f) => { const v = f === undefined ? !cls.has(c) : !!f; v ? cls.add(c) : cls.delete(c); return v; },
    contains: (c) => cls.has(c),
  };
  store._l = {};
  store.addEventListener = on(store._l);
  store.removeEventListener = () => {};
  store.querySelectorAll = () => [];
  store.querySelector = () => null;
  store.appendChild = (c) => { store.children.push(c); return c; };
  store.append = () => {};
  store.remove = () => {};
  store.setAttribute = () => {};
  store.focus = () => {}; store.blur = () => {}; store.click = () => {};
  store.getBoundingClientRect = () => ({ top: 0, left: 0, width: 375, height: 812, right: 375, bottom: 812 });
  store.setPointerCapture = () => {};
  store.closest = () => null;
  Object.defineProperty(store, "innerHTML", { set() {}, get() { return ""; } });
  return store;
}
const els = {};
const gameCanvas = makeEl("game");
gameCanvas.getContext = () => makeCtx(true);
els.game = gameCanvas;
globalThis.document = {
  getElementById: (id) => (els[id] = els[id] || makeEl(id)),
  createElement: (tag) => {
    const e = makeEl(tag);
    e.width = 0; e.height = 0;
    e.getContext = () => makeCtx(false);
    e.toBlob = (cb) => cb(null);
    return e;
  },
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener: on(listeners.document),
  body: makeEl("body"), hidden: false, documentElement: makeEl("html"),
};

// ── storage ──
const LS = new Map();
globalThis.localStorage = {
  getItem: (k) => (LS.has(k) ? LS.get(k) : null),
  setItem: (k, v) => LS.set(k, String(v)),
  removeItem: (k) => LS.delete(k),
  clear: () => LS.clear(),
};
export { LS };
LS.set("joshua1.tutorialSeen", "1");
LS.set("joshua1.installSplashSeen", "1");

// ── Web Audio stub: every automation call is logged ──
export const AUDIO_LOG = [];
export const PANNERS = [];
let _audioTime = 0;
function param(owner, name, v = 0) {
  const p = { value: v };
  for (const m of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime", "setTargetAtTime", "cancelScheduledValues"]) {
    p[m] = (...a) => { AUDIO_LOG.push({ node: owner, param: name, m, a }); if (m === "setValueAtTime") p.value = a[0]; return p; };
  }
  return p;
}
function node(kind, extra = {}) {
  const n = { kind, connect() { return n; }, disconnect() {}, start() {}, stop() {}, ...extra };
  return n;
}
class FakeAC {
  constructor() { this.sampleRate = 44100; this.destination = node("dest"); this.state = "running"; }
  get currentTime() { return _audioTime; }
  createGain() { const n = node("gain"); n.gain = param(n, "gain", 1); return n; }
  createOscillator() { const n = node("osc"); n.frequency = param(n, "frequency", 440); n.detune = param(n, "detune", 0); n.type = "sine"; return n; }
  createBiquadFilter() { const n = node("filter"); n.frequency = param(n, "frequency", 350); n.Q = param(n, "Q", 1); n.type = "lowpass"; return n; }
  createStereoPanner() { const n = node("panner"); n.pan = param(n, "pan", 0); PANNERS.push(n); return n; }
  createBufferSource() { const n = node("buffersrc"); n.playbackRate = param(n, "playbackRate", 1); n.loop = false; n.buffer = null; return n; }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len), duration: len / 44100 }; }
  decodeAudioData(data, ok) { const b = { duration: 120 }; if (ok) ok(b); return Promise.resolve(b); }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
}

// ── window / navigator / rAF / fetch ──
let _raf = null;
globalThis.window = {
  innerWidth: 375, innerHeight: 812,
  addEventListener: on(listeners.window),
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  location: { reload() {}, href: "http://localhost/" },
  AudioContext: FakeAC,
  navigator: { standalone: false },
};
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node", standalone: false }, configurable: true, writable: true });
globalThis.requestAnimationFrame = (fn) => { _raf = fn; return 1; };
globalThis.fetch = async (url) => {
  if (String(url).endsWith(".mp3")) return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  throw new Error("offline (harness)");
};

// ── audio spy module ──
const audioSrc = fs.readFileSync(path.join(ROOT, "src/audio.js"), "utf8");
const audioNames = [...audioSrc.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
export const CALLS = (globalThis.__AUDIO_CALLS = []);
let spy = `import * as A from ${JSON.stringify(srcUrl("audio.js"))};\n`;
for (const n of audioNames) spy += `export function ${n}(...a) { globalThis.__AUDIO_CALLS.push([${JSON.stringify(n)}, ...a]); return A.${n}(...a); }\n`;
fs.writeFileSync(path.join(GEN, "audio_spy.mjs"), spy);

// ── main.js under test ──
let main = fs.readFileSync(path.join(ROOT, "src/main.js"), "utf8");
main = main.replace(/from "\.\/([^"]+)"/g, (m, rel) =>
  rel === "audio.js" ? `from ${JSON.stringify(pathToFileURL(path.join(GEN, "audio_spy.mjs")).href)}`
                     : `from ${JSON.stringify(srcUrl(rel))}`);
const exportNames = ["g", "STATES", "update", "render", "frame", "takeHit", "unleashRampage",
  "newRaceSetup", "beginCountdown", "beginRace", "endRace", "playAgain", "registerSmash", "comboMult"];
const present = exportNames.filter((n) => new RegExp(`(const|function|let) ${n}\\b`).test(main));
main += `\nexport { ${present.join(", ")} };\n`;
for (const extra of (globalThis.__EXTRA_EXPORTS || [])) {
  if (new RegExp(`(const|function|let) ${extra}\\b`).test(main) && !present.includes(extra)) main += `export { ${extra} };\n`;
}
fs.writeFileSync(path.join(GEN, "main_ut.mjs"), main);

export const M = await import(pathToFileURL(path.join(GEN, "main_ut.mjs")).href + "?t=" + Date.now());

// ── drivers ──
export function key(k, type = "keydown") {
  for (const fn of listeners.window[type] || []) fn({ key: k, preventDefault() {} });
}
// One rendered frame of `ms` through the REAL frame() (hit-stop included).
export function tick(ms = 1000 / 60) {
  CLOCK.t += ms; _audioTime += ms / 1000;
  const fn = _raf; _raf = null;
  if (fn) fn(CLOCK.t);
}
export function run(seconds) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) tick(); }
// Start a race from the title and run the countdown out.
export function startRace() {
  const { g, STATES } = M;
  if (g.state !== STATES.TITLE) { g.state = STATES.TITLE; tick(); }
  key("Enter"); key("Enter", "keyup");
  tick();
  let guard = 0;
  while (g.state !== STATES.RACE && guard++ < 600) tick();
  return g.state === STATES.RACE;
}
export const audioCalls = (name) => CALLS.filter((c) => c[0] === name);

// A tap on the game canvas (lower half, so it also steers — like a real thumb).
export function touch(x = 300, y = 600) {
  const c = document.getElementById("game");
  const ev = { changedTouches: [{ identifier: 7, clientX: x, clientY: y }], preventDefault() {} };
  for (const fn of c._l.touchstart || []) fn(ev);
  for (const fn of c._l.touchend || []) fn(ev);
}
