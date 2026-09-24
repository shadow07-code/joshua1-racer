// Fixed straight multi-lane road, anchored to the screen.
// Calm rendering tuned to avoid high-speed strobe / eye fatigue: solid grass,
// static muted edge strips, and a faint center line that fades out with speed.
import { W, H, PLAYER_Y, PHYS, RACE, DAYNIGHT } from "./config.js";
import { rect } from "./render.js";

const VIEW_AHEAD_METERS = 100;
// Lane count used by the painted seams. Must stay in step with LANES in
// entities/traffic.js — the seams are only honest if they sit on the boundaries
// traffic actually spawns against.
const LANES_DRAWN = 5;

// ── Biomes ─────────────────────────────────────────────────────────────────────
// The run cycles through scenes for freshness + landmarks. A biome only changes
// screen-space PALETTE (the off-road fill / shoulders / edge strips / haze) and
// the roadside SCENERY set — the asphalt itself is constant, and the palette
// bands are static (no scroll), so this adds ZERO optic flow (dizzy rule intact).
// The scenery scrolls + thins with speed exactly as before.
//   bg = full-screen fill (sky/ground) | shoulder = the band hugging the road
//   edge = the thin edge strip | haze = the far-horizon atmosphere band
export const BIOMES = [
  { name: "CITY",   bg: 10, shoulder: 20, edge: 25, haze: 13,
    scenery: [ { kind: "building", weight: 4 }, { kind: "building2", weight: 3 },
               { kind: "tree", weight: 4 }, { kind: "pine", weight: 2 },
               { kind: "bush", weight: 2 }, { kind: "lamp", weight: 2 } ] },
  { name: "TUNNEL", bg: 4,  shoulder: 23, edge: 5,  haze: 23,
    scenery: [ { kind: "lamp", weight: 5 }, { kind: "rock", weight: 2 } ] },
  { name: "COAST",  bg: 13, shoulder: 21, edge: 25, haze: 13,
    scenery: [ { kind: "palm", weight: 5 }, { kind: "bush", weight: 2 }, { kind: "rock", weight: 1 } ] },
  { name: "BRIDGE", bg: 16, shoulder: 2,  edge: 1,  haze: 13,
    scenery: [ { kind: "lamp", weight: 4 } ] },
];
export function biomeAt(seconds) {
  const period = RACE.biomePeriodSec || 50;
  const i = Math.floor(Math.max(0, seconds || 0) / period) % BIOMES.length;
  return BIOMES[i];
}

export function roadCenterX(map /* unused */, _z, _x, _d) {
  return W / 2 + map.biasX;
}
export function yToDist(y) { return ((PLAYER_Y - y) / PLAYER_Y) * VIEW_AHEAD_METERS; }
export function distToY(dist) { return PLAYER_Y - (dist / VIEW_AHEAD_METERS) * PLAYER_Y; }

export function drawRoad(ctx, map, playerZ, speed = 0, biome = null, rampageOn = false) {
  const bm = biome || BIOMES[0];
  // Speed-based "calm" factor — ramps 0→1 between 70 and 130 km/h so fast-moving
  // road detail fades out before it can strobe and strain the eyes at speed.
  // Brought in earlier (was 90→150) to ease the high-speed dizzy sensation.
  const kmh = (speed / PHYS.maxSpeed) * (PHYS.topSpeedKmh || 200);
  const calm = Math.min(1, Math.max(0, (kmh - 70) / 60));

  const halfW = map.roadHalfWidth;
  const cx = W / 2 + map.biasX;

  // ── Off-road fill — solid (no scrolling bands; those strobed across the whole
  // screen at speed). The colour is the current biome's ground/sky; a static
  // shoulder band hugs each side of the road for depth — z-independent, so it
  // never flickers.
  rect(ctx, 0, 0, W, H, bm.bg);
  const shW = 7;
  rect(ctx, (cx - halfW - shW) | 0, 0, shW, H, bm.shoulder);
  rect(ctx, (cx + halfW) | 0, 0, shW, H, bm.shoulder);

  // ── Asphalt ──
  rect(ctx, (cx - halfW) | 0, 0, halfW * 2, H, map.roadIdx);
  // Inset edge shadow — static darker columns just inside each edge (depth bevel).
  rect(ctx, (cx - halfW) | 0, 0, 2, H, 4);
  rect(ctx, (cx + halfW - 2) | 0, 0, 2, H, 4);

  // ── Edge strips — solid, muted, STATIC lines (biome-coloured: cream shoulder,
  // tunnel warning-yellow, bridge railing-white). Replaces the old alternating
  // magenta/white rumble that flickered hard at the periphery. During a RAMPAGE
  // they turn solid gold — the whole road reads as "power mode" (colour-only
  // swap on static columns; no flicker, no motion).
  const edgeIdx = rampageOn ? 5 : bm.edge;
  rect(ctx, (cx - halfW - 3) | 0, 0, 2, H, edgeIdx);
  rect(ctx, (cx + halfW + 1) | 0, 0, 2, H, edgeIdx);

  // ── Biome set dressing — small STATIC screen-space accents that make each
  // zone read at a glance. All are fixed-position (z-independent, no scroll),
  // so they add zero optic flow — pure scenery paint, dizzy rule intact.
  if (bm.name === "TUNNEL") {
    // A row of ceiling lights glowing through the dark, just under the haze.
    for (let x = 8; x < W; x += 16) {
      rect(ctx, x, 18, 2, 2, 5);          // gold lamp
      rect(ctx, x, 20, 2, 1, 9);          // warm under-glow
    }
  } else if (bm.name === "COAST") {
    // A broken white surf line where the sea meets each sand shoulder.
    const surfL = (cx - halfW - shW - 1) | 0, surfR = (cx + halfW + shW) | 0;
    for (let y = 0; y < H; y += 7) {
      rect(ctx, surfL, y, 1, 4, 1);
      rect(ctx, surfR, y + 3, 1, 4, 1);   // offset so the two sides don't mirror
    }
  } else if (bm.name === "BRIDGE") {
    // Railing posts marching along both edges of the deck, with a thin top rail.
    const railL = (cx - halfW - shW) | 0, railR = (cx + halfW + shW - 1) | 0;
    for (let y = 2; y < H; y += 13) {
      rect(ctx, railL, y, 1, 7, 23);      // dark steel post
      rect(ctx, railR, y, 1, 7, 23);
      rect(ctx, railL, y, 1, 1, 1);       // lit cap
      rect(ctx, railR, y, 1, 1, 1);
    }
  }

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

  // ── LANE SEAMS — the road's actual five-lane structure ──
  // Four SOLID 1px lines on the four real lane boundaries. A continuous line is
  // invariant under forward motion, so unlike a dash it cannot strobe and
  // produces ZERO optic flow at any speed — which is why these can stay on
  // permanently instead of fading out with `calm`. That is the whole point:
  // the asphalt used to become a blank grey slab above ~130 km/h, i.e. for most
  // of a run, and a five-lane weaving game was being played on a road with no
  // visible lanes.
  //
  // They also replace the old centre dash, which ran down the MIDDLE of the
  // centre lane — it looked like a lane marking while sitting exactly where a
  // car drives. These sit on the boundaries traffic is actually spawned
  // against (lane centres are at ±0.5 and ±1.5 lane widths from them), so the
  // gap lane can be read and pre-empted before its cars are even distinct.
  const laneW = (halfW * 2) / LANES_DRAWN;
  for (const k of [-1.5, -0.5, 0.5, 1.5]) {
    rect(ctx, (cx + k * laneW) | 0, 0, 1, H, 2);       // worn-white, not glaring
  }
}

// ── Distance haze — a STATIC pale band fading down from the top edge (the
// 100 m horizon). Drawn AFTER traffic/scenery so far objects emerge "out of
// the haze", which reads as real atmospheric depth. Completely motionless
// (screen-space, z-independent), so it adds zero optic flow — if anything it
// softens the most distant, fastest-converging part of the view. Sized so a
// soft fade is still visible below the race HUD strip (which covers rows 0-8).
export function drawDistanceHaze(ctx, biome = null) {
  const idx = (biome && biome.haze != null) ? biome.haze : 13;   // biome atmosphere
  hazeBand(ctx, 0, 4, idx, 1.0);     // solid band at the horizon
  hazeBand(ctx, 4, 6, idx, 0.5);     // 50% checker
  hazeBand(ctx, 10, 6, idx, 0.25);   // 25% sparse tail
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

// ── DAY / NIGHT ───────────────────────────────────────────────────────────────
// Timings live in config.DAYNIGHT. Everything here is screen-space colour — no
// motion — so it cannot add optic flow. Driven by race time, so it pauses with
// the game and a run always opens in daylight.
const smoothstep = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

// Where in the cycle are we?
//   dark  — 0 (day) .. 1 (full night); eased through dusk and dawn
//   on    — are vehicle lights switched on right now
//   since — seconds since the lights last switched (either way). Drives the
//           flicker as the headlights click on, and the per-car stagger.
export function dayNight(seconds) {
  const D = DAYNIGHT;
  const duskAt = D.daySeconds;
  const nightAt = duskAt + D.duskSeconds;
  const dawnAt = nightAt + D.nightSeconds;
  const cycle = dawnAt + D.dawnSeconds;
  const t = Math.max(0, seconds || 0) % cycle;
  let dark;
  if (t < duskAt) dark = 0;
  else if (t < nightAt) dark = smoothstep((t - duskAt) / D.duskSeconds);
  else if (t < dawnAt) dark = 1;
  else dark = 1 - smoothstep((t - dawnAt) / D.dawnSeconds);
  // The lights come on only once it is ALREADY dark (plus a beat), and go off
  // part-way through dawn. Before the first switch-on of a run, the previous
  // switch-off is treated as a full cycle ago, so every lamp starts dark.
  const onAt = nightAt + D.lightsOnDelay;
  const offAt = dawnAt + D.dawnSeconds * D.lightsOffAt;
  const on = t >= onAt && t < offAt;
  const since = on ? t - onAt : (t >= offAt ? t - offAt : t + cycle - offAt);
  return { dark, on, since };
}

// The player's headlights: on with the lights, but they CLICK on with a quick
// flicker (on, off, on) so the moment night properly arrives is unmistakable.
export function headlightsLit(ns) {
  return !!ns && ns.on && (ns.since < 0.05 || ns.since >= 0.13);
}

// Night darkness, with the player's headlight beam CARVED OUT of it.
//
// The beam is not painted on top of the scene — it is a region where the
// darkness is lifted (plus a faint warm wash), so the road and every car in it
// show in their true colours: your headlights genuinely light the traffic ahead.
// Built from 1px rows, so its edge is a clean pixel-art stair-step with a 1px
// soft rim. Anchored to the car, so it adds no optic flow.
//
// `beam` = { cx, noseY, rearY } in screen px, or null when the lights are off.
const _rgba = new Map();
function rgba(r, g, b, a) {
  const q = Math.round(Math.max(0, Math.min(1, a)) * 255);
  const k = (r << 24) ^ (g << 16) ^ (b << 8) ^ q;
  let s = _rgba.get(k);
  if (!s) { s = `rgba(${r},${g},${b},${(q / 255).toFixed(3)})`; _rgba.set(k, s); }
  return s;
}
function shadeRect(ctx, x, y, w, h, style) {
  if (w <= 0 || h <= 0) return;            // a negative width would paint the WRONG side
  ctx.fillStyle = style;
  ctx.fillRect(x, y, w, h);
}
export function drawNightShade(ctx, ns, beam) {
  if (!ns || !(ns.dark > 0.002)) return;   // daylight — draw nothing at all
  const D = DAYNIGHT;
  const [r, g, b] = D.shade;
  const full = D.shadeAlpha * ns.dark;
  const dark = rgba(r, g, b, full);
  if (!beam) { shadeRect(ctx, 0, 0, W, H, dark); return; }

  const reach = Math.round(PLAYER_Y * D.beamReach);
  const top = Math.max(0, beam.noseY - reach);
  const spill = beam.rearY + 5 - beam.noseY;          // rows of light around the car
  const bottom = Math.min(H, beam.noseY + spill);
  shadeRect(ctx, 0, 0, W, top, dark);                 // everything beyond the throw
  shadeRect(ctx, 0, bottom, W, H - bottom, dark);     // everything behind the car
  for (let y = top; y < bottom; y++) {
    let half, lit;
    if (y >= beam.noseY) {
      // Light spilling round the car: a soft teardrop that narrows and fades
      // toward the rear. A constant-width block here read as a hard lit BOX
      // with a flat bottom edge — a selection rectangle, not a glow.
      const g = (y - beam.noseY) / spill;            // 0 at the bumper -> 1 behind the car
      half = Math.round(7 - g * 2.5);
      lit = 1 - 0.85 * Math.pow(g, 1.5);
    } else {
      const f = (beam.noseY - y) / reach;            // 0 at the bumper -> 1 at full throw
      half = Math.round(6 + f * 13);                 // the cone widens as it throws...
      lit = Math.pow(1 - f, 1.4);                    // ...and fades out to full dark
    }
    const x0 = beam.cx - half, x1 = beam.cx + half + 1;
    const inA = full * (1 - 0.9 * lit);              // darkness left inside the beam
    const rim = rgba(r, g, b, (inA + full) / 2);     // 1px soft edge
    shadeRect(ctx, 0, y, x0 - 1, 1, dark);
    shadeRect(ctx, x0 - 1, y, 1, 1, rim);
    shadeRect(ctx, x0, y, x1 - x0, 1, rgba(r, g, b, inA));
    shadeRect(ctx, x1, y, 1, 1, rim);
    shadeRect(ctx, x1 + 1, y, W - x1 - 1, 1, dark);
    if (lit > 0.05) shadeRect(ctx, x0, y, x1 - x0, 1, rgba(255, 226, 150, D.beamWarm * lit * ns.dark));
  }
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
