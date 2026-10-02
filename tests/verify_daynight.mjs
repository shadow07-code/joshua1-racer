// Verify the rebuilt day/night against the user's own words:
//   "start up in daytime, run for at least 40 seconds, then switch to night.
//    When you switch to night there should be a noticeable difference in
//    darkness overall, and THEN the headlight should turn on. Nights only
//    20 seconds, then back to day."
// Plus the drawing: the beam must reveal the road rather than paint over it,
// must never paint the wrong side of a row, and lamps must switch per car.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // the repo root
const imp = (r) => import(pathToFileURL(path.join(ROOT, r)).href);

let REC = [];
function makeCtx() {
  return { _f: "#000", set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; },
    imageSmoothingEnabled: false,
    fillRect(x, y, w, h) { REC.push({ x, y, w, h, c: this._f }); },
    drawImage(i, x, y, w, h) { REC.push({ x, y, w, h, c: "IMG" }); } };
}
function silent() { return { fillStyle: "", imageSmoothingEnabled: false, fillRect() {}, drawImage() {}, getContext: silent }; }
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => silent() }) };
let CLOCK = 1000;
globalThis.performance.now = () => CLOCK;

const { W, H, PHYS, PLAYER_Y, DAYNIGHT: D, PALETTE } = await imp("src/config.js");
const road = await imp("src/road.js");
const player = await imp("src/entities/player.js");
const traffic = await imp("src/entities/traffic.js");
const { MAPS } = await imp("src/maps.js");
const map = MAPS.city, ctx = makeCtx();
const R = [], add = (l, p, d = "") => R.push([l, p, d]);
const reset = () => { REC = []; };

// ── A. THE TIMELINE ─────────────────────────────────────────────────────────
const dt = 0.01, N = 20000;
const S = Array.from({ length: N + 1 }, (_, i) => ({ t: +(i * dt).toFixed(2), ...road.dayNight(i * dt) }));
add("the run opens in full daylight", S[0].dark === 0 && !S[0].on);
add("at least 40 s of UNTOUCHED daylight before anything dims",
  S.filter(s => s.t < 40).every(s => s.dark === 0 && !s.on));
const firstDim = S.find(s => s.dark > 0).t;
add("darkness starts falling right after 40 s", firstDim >= 40 && firstDim < 40.1, `${firstDim}s`);
const firstOn = S.find(s => s.on);
add("the headlights come on only once it is FULLY dark",
  firstOn.dark === 1, `on at ${firstOn.t}s with dark=${firstOn.dark}`);
const fullDarkAt = S.find(s => s.dark === 1).t;
add("...and a beat AFTER the dark arrives, not at the same instant",
  firstOn.t - fullDarkAt >= 0.4, `${(firstOn.t - fullDarkAt).toFixed(2)}s after full dark`);
// Night length = the continuous run of dark===1.
let run = 0, best = 0;
for (const s of S.filter(s => s.t < 90)) { run = s.dark === 1 ? run + dt : 0; best = Math.max(best, run); }
add("night lasts 20 s", Math.abs(best - 20) < 0.05, `${best.toFixed(2)}s`);
const backToDay = S.find(s => s.t > fullDarkAt && s.dark === 0).t;
add("then it is day again", backToDay > 60 && backToDay < 70, `day again at ${backToDay}s`);
const cycle = D.daySeconds + D.duskSeconds + D.nightSeconds + D.dawnSeconds;
add("every later day is also 40 s",
  S.filter(s => s.t >= backToDay && s.t < backToDay + 39.9).every(s => s.dark === 0), `cycle ${cycle}s`);
add("it repeats: second night at 109-129 s",
  road.dayNight(110).dark === 1 && road.dayNight(128.9).dark === 1 && road.dayNight(106.5).dark < 1);
add("lights are NEVER on in daylight", S.every(s => !(s.on && s.dark === 0)));
add("lights never switch on while it is still getting dark",
  S.every((s, i) => i === 0 || !(s.on && !S[i - 1].on) || s.dark === 1));
add("dark is always inside 0..1", S.every(s => s.dark >= 0 && s.dark <= 1));
// "noticeable difference in darkness": the overlay itself.
add("full night is properly dark (overlay >= 0.55; the old one peaked at 0.32)",
  D.shadeAlpha >= 0.55, String(D.shadeAlpha));
// Dusk is a transition, not a cut — no single frame jumps the darkness.
let maxStep = 0;
for (let i = 1; i < S.length; i++) maxStep = Math.max(maxStep, Math.abs(S[i].dark - S[i - 1].dark));
add("dusk/dawn is a fade, never a hard cut (max step per 10 ms)", maxStep < 0.02, maxStep.toFixed(4));

// The click-on flicker: on, off, on — then steady.
const on0 = firstOn.t, flick = [];
for (let t = on0; t < on0 + 0.3; t += 0.01) flick.push(road.headlightsLit(road.dayNight(t)) ? 1 : 0);
const edges = flick.reduce((n, v, i) => n + (i && v !== flick[i - 1] ? 1 : 0), 0);
add("headlights click on with ONE flicker (on-off-on), then stay on",
  flick[0] === 1 && edges === 2 && flick.slice(-10).every(v => v === 1), flick.join(""));
add("headlightsLit is false in daylight and while dark but not yet switched",
  !road.headlightsLit(road.dayNight(20)) && !road.headlightsLit(road.dayNight(43.2)));

// ── B. THE SHADE ────────────────────────────────────────────────────────────
reset(); road.drawNightShade(ctx, road.dayNight(20), null);
add("daylight draws NOTHING (no hidden wash)", REC.length === 0, `${REC.length} rects`);

reset(); road.drawNightShade(ctx, road.dayNight(50), null);
add("night without lights = one full-screen shade", REC.length === 1 && REC[0].w === W && REC[0].h === H);

const beamAt = (x) => { const p = player.makePlayer(); p.x = x; return player.beamAnchor(p, map, road.dayNight(50)); };
add("beamAnchor is null before the lights are on", player.beamAnchor(player.makePlayer(), map, road.dayNight(43.2)) === null);
add("beamAnchor exists at night", !!beamAt(0));

for (const px of [-51, 0, 51]) {
  const beam = beamAt(px);
  reset(); road.drawNightShade(ctx, road.dayNight(50), beam);
  add(`shade never paints a negative-size rect (car at x=${px})`, REC.every(r => r.w > 0 && r.h > 0),
    JSON.stringify(REC.find(r => !(r.w > 0 && r.h > 0))));
  add(`shade stays on the canvas (car at x=${px})`, REC.every(r => r.x >= 0 && r.x + r.w <= W && r.y >= 0 && r.y + r.h <= H));
  // Coverage: every screen pixel is darkened EXACTLY once by the navy shade
  // (the warm wash is an extra layer on top inside the beam).
  const navy = REC.filter(r => r.c.startsWith(`rgba(${D.shade.join(",")},`));
  const cover = new Uint8Array(W * H);
  for (const r of navy) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cover[y * W + x]++;
  const bad = cover.reduce((n, v) => n + (v !== 1 ? 1 : 0), 0);
  add(`every pixel is shaded exactly once — no gaps, no double-dark seams (car at x=${px})`, bad === 0, `${bad} px wrong`);
}

// The beam must actually LIGHT the road ahead: darkness right in front of the
// car must be far below the darkness off to the side on the same row.
{
  const beam = beamAt(0);
  reset(); road.drawNightShade(ctx, road.dayNight(50), beam);
  const alphaAt = (x, y) => {
    const r = REC.find(r => r.c.startsWith(`rgba(${D.shade.join(",")},`) && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    return r ? parseFloat(r.c.split(",")[3]) : NaN;
  };
  const y = beam.noseY - 6;
  const inBeam = alphaAt(beam.cx, y), beside = alphaAt(beam.cx + 40, y);
  add("the beam lifts the dark right in front of the car", inBeam < beside * 0.3, `${inBeam} vs ${beside}`);
  const far = alphaAt(beam.cx, beam.noseY - Math.round(PLAYER_Y * D.beamReach) + 1);
  add("...and fades back to full dark at the end of its throw", far > beside * 0.85, `${far} vs ${beside}`);
  add("the beam points FORWARD (ahead of the car, not behind)",
    alphaAt(beam.cx, beam.rearY + 12) === beside);
  add("the car itself sits in its own light", alphaAt(beam.cx, PLAYER_Y) < beside * 0.3);
  const warm = REC.filter(r => r.c.startsWith("rgba(255,226,150"));
  add("a warm wash sits inside the beam only", warm.length > 0 &&
    warm.every(r => Math.abs(r.x + r.w / 2 - beam.cx) < 22 && r.y < beam.rearY + 6));
  add("the beam never reaches into the top HUD strip", REC.filter(r => r.c.startsWith("rgba(255,226,150")).every(r => r.y > 9));
}

// ── C. LAMPS SWITCH ON CAR BY CAR ───────────────────────────────────────────
{
  const s = traffic.makeTrafficSystem({ rowGapZ: 30 }); s.densityMul = 1.4;
  let z = 0;
  for (let i = 0; i < 300; i++) { z += PHYS.maxSpeed / 60; traffic.updateTraffic(s, 1 / 60, z, map, {}, 0, true); }
  for (const c of s.list) if (c.cruise != null) c.speed = c.cruise;   // nobody braking
  const litAt = (since, on = true) => { reset(); traffic.drawNightLights(ctx, s, map, z, 0, { dark: 1, on, since }); return REC.length; };
  const counts = [0, 0.1, 0.3, 0.6, 0.9, 1.2, 3].map(t => litAt(t));
  add("no lamp is lit the instant the switch flips", counts[0] === 0, JSON.stringify(counts));
  add("lamps come on progressively, car by car", counts.every((v, i) => !i || v >= counts[i - 1]) && counts[2] > 0 && counts[2] < counts[6],
    JSON.stringify(counts));
  add("...all of them within ~1.1 s", counts[5] === counts[6], JSON.stringify(counts));
  const offCounts = [0, 0.5, 1.2].map(t => litAt(t, false));
  add("and they go off the same way at dawn", offCounts[0] === counts[6] && offCounts[2] === 0, JSON.stringify(offCounts));
  add("no lamps drawn when it isn't dark", (reset(), traffic.drawNightLights(ctx, s, map, z, 0, { dark: 0.1, on: true, since: 5 }), REC.length === 0));
  // Brake lights are not headlights: they show at night even before the lamps switch on.
  const b = s.list.find(c => c.cruise != null && !c.smashed && c.z - z > 5 && c.z - z < 90);
  b.speed = b.cruise * 0.5;
  reset(); traffic.drawNightLights(ctx, s, map, z, 0, { dark: 1, on: false, since: 99 });
  add("brake lights show at night even with the lamps still off",
    REC.filter(r => r.c === PALETTE[6]).length === 2, `${REC.filter(r => r.c === PALETTE[6]).length}`);
}

// ── D. THE PLAYER'S OWN LAMPS ──────────────────────────────────────────────
{
  const p = player.makePlayer();
  const count = (t) => { reset(); player.drawPlayerLights(ctx, p, map, road.dayNight(t)); return REC.length; };
  add("player lamps off in daylight", count(20) === 0);
  add("player lamps off while dark but not yet switched on", count(43.2) === 0);
  add("player lamps on at night", count(50) > 0);
  p.invuln = 1;
  CLOCK = 0;  const hid = count(50);
  CLOCK = 60; const shown = count(50);
  add("player lamps blink with the invulnerability flicker", hid === 0 && shown > 0, `${hid}/${shown}`);
  // ...but the BEAM must not strobe with it.
  CLOCK = 0;  const b0 = player.beamAnchor(p, map, road.dayNight(50));
  CLOCK = 60; const b1 = player.beamAnchor(p, map, road.dayNight(50));
  add("the headlight beam stays steady through the invulnerability blink", !!b0 && !!b1);
}

console.log("");
let ok = true;
for (const [l, p, d] of R) { if (!p) ok = false; console.log(`   ${p ? "PASS" : "FAIL"}  ${l}${p || !d ? "" : "   [" + d + "]"}`); }
console.log("\n" + (ok ? "=== DAY/NIGHT CLEAN ===" : "=== PROBLEMS ==="));
process.exit(ok ? 0 : 1);
