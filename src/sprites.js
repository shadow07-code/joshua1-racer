// Detailed pixel sprites. Top-down view: front of car at TOP of sprite, back at BOTTOM.
// Palette indices defined in config.js. -1 = transparent.

const _ = -1;

// ── Helper: paint-swap a body color triple (dark/main/light) into a sprite ────
function recolorBody(base, fromDark, fromMain, fromLight, toDark, toMain, toLight) {
  return base.map(row => row.map(c => {
    if (c === fromDark) return toDark;
    if (c === fromMain) return toMain;
    if (c === fromLight) return toLight;
    return c;
  }));
}

// ─── SPORTS CAR (player + AI rivals) — 14w × 20h, very detailed ───────────────
// Body uses indices 6(main), 7(dark/shadow), 8(highlight).
// 13 = windshield blue, 5 = headlight yellow, 9 = taillight orange, 0 = outline.
export const SPR_SPORTS = [
  [_,_,_,0,0,0,0,0,0,0,0,_,_,_],
  [_,_,0,5,5,7,6,6,7,5,5,0,_,_],   // front bumper + headlights
  [_,0,8,6,7,7,6,6,7,7,6,8,0,_],   // hood
  [_,0,8,6,13,13,13,13,13,13,6,8,0,_],
  [_,0,8,6,13,1,1,1,1,13,6,8,0,_], // windshield
  [0,4,7,6,6,13,13,13,13,6,6,7,4,0],
  [0,4,7,8,6,6,6,6,6,6,8,7,4,0],
  [0,3,7,6,6,6,7,7,6,6,6,7,3,0],
  [0,3,6,6,6,6,6,6,6,6,6,6,3,0],
  [0,3,6,6,6,6,6,6,6,6,6,6,3,0],
  [0,3,6,8,6,6,6,6,6,6,8,6,3,0],
  [0,3,7,6,6,6,7,7,6,6,6,7,3,0],
  [0,4,7,6,13,13,13,13,13,13,6,7,4,0],
  [_,0,8,6,13,13,13,13,13,13,6,8,0,_],
  [_,0,8,6,6,6,6,6,6,6,6,8,0,_],
  [_,0,9,9,0,6,7,7,6,0,9,9,0,_],   // taillights orange + dark vent
  [_,0,9,9,0,7,6,6,7,0,9,9,0,_],
  [_,_,0,0,0,0,0,0,0,0,0,0,_,_],
  [_,_,_,4,4,_,_,_,_,4,4,_,_,_],   // exhaust tips
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_],
];

// Legacy sports-car skins kept for the title screen / map cards only.
export const SPR_AI_BLUE_LEGACY    = recolorBody(SPR_SPORTS, 7, 6, 8, 4, 16, 13);
export const SPR_AI_GREEN_LEGACY   = recolorBody(SPR_SPORTS, 7, 6, 8, 11, 17, 10);

// ─── RACE CAR (player + AI rivals) — 16w × 24h, drawn at native 1× (crisp). ─────
// Simplified, flat-shaded top-down car: clean silhouette, one body tone, no fake
// gradient shading. Reads sharply at speed instead of muddying when scaled.
//   6 = body (recolourable) | 7 = wheels (recolourable dark) | 0 outline
//   13 light-blue glass | 5 headlight | 9 taillight | 1 white (the "J")
const SPR_F1_BASE = [
  [_,_,_,0,0,0,0,0,0,0,0,0,0,_,_,_],    //  0 front bumper
  [_,_,_,0,5,6,6,6,6,6,6,5,0,_,_,_],    //  1 headlights
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    //  2 hood
  [_,0,0,0,6,13,13,13,13,13,13,6,0,0,0,_], //  3 front wheels + windshield
  [_,0,0,0,6,13,13,13,13,13,13,6,0,0,0,_], //  4 front wheels + windshield
  [_,_,_,0,6,13,13,13,13,13,13,6,0,_,_,_], //  5 windshield base
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    //  6 roof (J row)
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    //  7 roof (J row)
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    //  8 roof (J row)
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    //  9 roof (J row)
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    // 10 roof (J row)
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    // 11 body
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    // 12 body
  [_,_,_,0,6,13,13,13,13,13,13,6,0,_,_,_], // 13 rear window
  [_,_,_,0,6,13,13,13,13,13,13,6,0,_,_,_], // 14 rear window
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    // 15 body
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    // 16 body
  [_,0,0,0,6,6,6,6,6,6,6,6,0,0,0,_],    // 17 rear wheels
  [_,0,0,0,6,6,6,6,6,6,6,6,0,0,0,_],    // 18 rear wheels
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    // 19 body
  [_,_,_,0,6,6,6,6,6,6,6,6,0,_,_,_],    // 20 body
  [_,_,_,0,9,9,6,6,6,6,9,9,0,_,_,_],    // 21 taillights
  [_,_,_,0,0,0,0,0,0,0,0,0,0,_,_,_],    // 22 rear bumper
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],    // 23 blank
];

// Stamp a white "J" on the roof (player only — AI rivals stay plain).
// J spans rows 6..10, cols 5..8 — large enough to read at native resolution.
function stampJ(sprite) {
  const out = sprite.map(r => r.slice());
  out[6][5] = 1; out[6][6] = 1; out[6][7] = 1; out[6][8] = 1;   // top bar
  out[7][7] = 1; out[7][8] = 1;                                  // stem
  out[8][7] = 1; out[8][8] = 1;                                  // stem
  out[9][5] = 1; out[9][7] = 1; out[9][8] = 1;                   // hook
  out[10][5] = 1; out[10][6] = 1; out[10][7] = 1;                // base
  return out;
}

// PLAYER — red F1 with "J" on the engine cover.
export const SPR_PLAYER = stampJ(SPR_F1_BASE);

// AI rivals — all the SAME blue F1 (player is the only red car).
export const SPR_AI_BLUE   = recolorBody(SPR_F1_BASE, 7, 6, 8, 4, 16, 13);
// Aliases kept so HUD card art still imports cleanly.
export const SPR_AI_GREEN  = SPR_AI_BLUE;
export const SPR_AI_SILVER = SPR_AI_BLUE;
export const SPR_AI_ORANGE = SPR_AI_BLUE;
export const SPR_AI_PURPLE = SPR_AI_BLUE;
export const AI_SKINS = [SPR_AI_BLUE, SPR_AI_BLUE, SPR_AI_BLUE, SPR_AI_BLUE, SPR_AI_BLUE];

// Backward compatibility — these names are used by HUD card art.
export const SPR_SPORTS_PLAYER_LEGACY = SPR_SPORTS;

// ─── CIVILIAN TRAFFIC — smaller (10w) cars in BLACK / WHITE / ORANGE ────────────
// Body color slots: B = main, L = secondary detail. Windows always use a contrasting
// grey, taillights always orange. Three distinct paint variants per shape.
//
// SEDAN — 10w × 16h. Sleek 3-box saloon: raked windshield, distinct roof,
// rear glass, headlights, taillights and wheels poking at all four corners.
// Body slots 6/7/8 recolour; 3 glass, 5 headlight, 9 taillight, 4 tyre, 1 glint.
const SEDAN_BASE = [
  [_,_,0,0,0,0,0,0,_,_],   //  0 front bumper
  [_,0,5,6,6,6,6,5,0,_],   //  1 headlights
  [_,0,6,6,6,6,6,6,0,_],   //  2 hood
  [0,0,6,6,6,6,6,6,0,0],   //  3 front wheels
  [0,0,6,3,3,3,3,6,0,0],   //  4 front wheels + windshield
  [_,0,6,3,3,3,3,6,0,_],   //  5 windshield
  [_,0,6,6,6,6,6,6,0,_],   //  6 roof
  [_,0,6,6,6,6,6,6,0,_],   //  7 roof
  [_,0,6,6,6,6,6,6,0,_],   //  8 roof
  [_,0,6,3,3,3,3,6,0,_],   //  9 rear window
  [0,0,6,6,6,6,6,6,0,0],   // 10 rear wheels
  [0,0,6,6,6,6,6,6,0,0],   // 11 rear wheels
  [_,0,9,9,6,6,9,9,0,_],   // 12 taillights
  [_,_,0,0,0,0,0,0,_,_],   // 13 rear bumper
  [_,_,_,_,_,_,_,_,_,_],   // 14 blank
  [_,_,_,_,_,_,_,_,_,_],   // 15 blank
];

export const SPR_SEDAN_SILVER = recolorBody(SEDAN_BASE, 7, 6, 8, 4, 2, 1);   // silver
export const SPR_SEDAN_BLUE   = recolorBody(SEDAN_BASE, 7, 6, 8, 4, 16, 13); // blue
export const SPR_SEDAN_RED    = recolorBody(SEDAN_BASE, 7, 6, 8, 7, 6, 8);   // red
export const SPR_SEDAN_BLACK  = recolorBody(SEDAN_BASE, 7, 6, 8, 0, 4, 3);   // charcoal (not flat black)
export const SPR_SEDAN_WHITE  = recolorBody(SEDAN_BASE, 7, 6, 8, 2, 1, 1);   // white
export const SPR_SEDAN_ORANGE = recolorBody(SEDAN_BASE, 7, 6, 8, 22, 9, 5);  // orange

// SUV — 10w × 18h. Taller, boxier wagon: short hood, big upright greenhouse,
// long roof with roof-rails, wraparound rear glass. Reads clearly apart from the
// lower sedan. Same width as the sedan (no bigger).
const SUV_BASE = [
  [_,_,0,0,0,0,0,0,_,_],   //  0 front bumper
  [_,0,5,6,6,6,6,5,0,_],   //  1 headlights
  [_,0,6,6,6,6,6,6,0,_],   //  2 short hood
  [0,0,6,6,6,6,6,6,0,0],   //  3 front wheels
  [0,0,6,3,3,3,3,6,0,0],   //  4 front wheels + windshield
  [_,0,6,3,3,3,3,6,0,_],   //  5 windshield
  [_,0,6,6,6,6,6,6,0,_],   //  6 tall roof
  [_,0,6,6,6,6,6,6,0,_],   //  7 tall roof
  [_,0,6,6,6,6,6,6,0,_],   //  8 tall roof
  [_,0,6,6,6,6,6,6,0,_],   //  9 tall roof
  [_,0,6,6,6,6,6,6,0,_],   // 10 tall roof
  [_,0,6,3,3,3,3,6,0,_],   // 11 rear window
  [0,0,6,6,6,6,6,6,0,0],   // 12 rear wheels
  [0,0,6,6,6,6,6,6,0,0],   // 13 rear wheels
  [_,0,9,9,6,6,9,9,0,_],   // 14 taillights
  [_,_,0,0,0,0,0,0,_,_],   // 15 rear bumper
  [_,_,_,_,_,_,_,_,_,_],   // 16 blank
  [_,_,_,_,_,_,_,_,_,_],   // 17 blank
];

export const SPR_SUV_WHITE    = recolorBody(SUV_BASE, 7, 6, 8, 2, 1, 1);    // white
export const SPR_SUV_BLACK    = recolorBody(SUV_BASE, 7, 6, 8, 0, 4, 3);    // charcoal
export const SPR_SUV_ORANGE   = recolorBody(SUV_BASE, 7, 6, 8, 22, 9, 5);   // orange
export const SPR_SUV_BLUE     = recolorBody(SUV_BASE, 7, 6, 8, 4, 16, 13);  // blue
// Back-compat names (table + HUD imports referenced the old "truck" sprites).
export const SPR_TRUCK_BLACK  = SPR_SUV_BLACK;
export const SPR_TRUCK_WHITE  = SPR_SUV_WHITE;
export const SPR_TRUCK_ORANGE = SPR_SUV_ORANGE;

// BUS — 10w × 22h, long with rows of windows. Windows are mid-gray (never blue).
const BUS_BASE = [
  [_,0,0,0,0,0,0,0,0,_],
  [0,8,6,6,6,6,6,6,8,0],
  [0,6,7,7,7,7,7,7,6,0],
  [0,6,3,3,3,3,3,3,6,0],   // windshield
  [0,6,3,1,3,3,1,3,6,0],
  [0,6,6,3,3,3,3,6,6,0],
  [0,6,6,6,6,6,6,6,6,0],
  [0,6,3,3,6,6,3,3,6,0],   // window row 1
  [0,6,3,3,6,6,3,3,6,0],
  [0,6,6,6,6,6,6,6,6,0],
  [0,6,3,3,6,6,3,3,6,0],   // window row 2
  [0,6,3,3,6,6,3,3,6,0],
  [0,6,6,6,6,6,6,6,6,0],
  [0,6,3,3,6,6,3,3,6,0],   // window row 3
  [0,6,3,3,6,6,3,3,6,0],
  [0,6,6,6,6,6,6,6,6,0],
  [0,6,3,3,3,3,3,3,6,0],   // rear window
  [0,6,3,1,3,3,1,3,6,0],
  [0,6,6,3,3,3,3,6,6,0],
  [0,6,6,6,6,6,6,6,6,0],
  [_,0,9,9,6,6,9,9,0,_],
  [_,_,0,0,0,0,0,0,_,_],
];

export const SPR_BUS_BLACK  = recolorBody(BUS_BASE, 7, 6, 8, 4, 0, 4);
export const SPR_BUS_WHITE  = recolorBody(BUS_BASE, 7, 6, 8, 2, 1, 2);
export const SPR_BUS_ORANGE = recolorBody(BUS_BASE, 7, 6, 8, 22, 9, 5);

// MOTORBIKE (Harley cruiser) — 7w × 14h, top-down. Fat front/rear tyres, wide
// chrome handlebars, teardrop fuel tank (recolourable 6/7/8), V-twin engine with
// chrome pipes poking out, and a rider on the seat.
const MOTO_BASE = [
  [_,_,_,0,_,_,_],   //  0 front fender
  [_,_,0,0,0,_,_],   //  1 front tyre
  [_,_,_,6,_,_,_],   //  2 fork
  [_,1,1,1,1,1,_],   //  3 handlebars
  [_,0,6,6,6,0,_],   //  4 fuel tank
  [_,0,6,6,6,0,_],   //  5 fuel tank
  [_,0,7,7,7,0,_],   //  6 engine
  [_,0,6,6,6,0,_],   //  7 seat front
  [_,0,7,7,7,0,_],   //  8 seat
  [_,_,0,6,0,_,_],   //  9 rider
  [_,_,0,0,0,_,_],   // 10 rear tyre
  [_,_,0,0,0,_,_],   // 11 rear tyre
  [_,_,_,0,_,_,_],   // 12 rear fender
  [_,_,_,_,_,_,_],   // 13 blank
];
export const SPR_MOTO_BLACK  = recolorBody(MOTO_BASE, 7, 6, 8, 0, 4, 3);
export const SPR_MOTO_ORANGE = recolorBody(MOTO_BASE, 7, 6, 8, 22, 9, 5);
export const SPR_MOTO_WHITE  = recolorBody(MOTO_BASE, 7, 6, 8, 2, 1, 1);

// AUTO-RICKSHAW (tuk-tuk) — 9w × 14h, top-down. The 3-wheeler silhouette reads
// at a glance: ONE small front wheel up the centre, a domed canopy with open
// sides, and TWO rear wheels poking at the back corners. Body slots 6/7/8.
const AUTO_BASE = [
  [_,_,_,_,0,_,_,_,_],   //  0 pointed nose
  [_,_,_,0,6,0,_,_,_],   //  1 narrow front cowl
  [_,_,0,6,5,6,0,_,_],   //  2 headlight
  [_,_,_,0,0,0,_,_,_],   //  3 single front wheel
  [_,0,6,6,6,6,6,0,_],   //  4 body flares to cabin
  [0,6,3,3,3,3,3,6,0],   //  5 windscreen
  [0,6,6,6,6,6,6,6,0],   //  6 canopy
  [0,6,6,6,6,6,6,6,0],   //  7 canopy roof
  [0,7,6,6,6,6,6,7,0],   //  8 open sides (dark posts)
  [0,6,6,6,6,6,6,6,0],   //  9 rear body
  [0,0,9,6,6,6,9,0,0],   // 10 rear wheels + taillights
  [_,0,0,0,0,0,0,0,_],   // 11 rear bumper
  [_,_,_,_,_,_,_,_,_],   // 12 blank
  [_,_,_,_,_,_,_,_,_],   // 13 blank
];
export const SPR_AUTO_YELLOW = recolorBody(AUTO_BASE, 7, 6, 8, 22, 21, 1);  // classic yellow
export const SPR_AUTO_GREEN  = recolorBody(AUTO_BASE, 7, 6, 8, 11, 17, 20); // CNG green

// POLICE HELICOPTER — 14w × 16h, top-down (nose up). Deep-gray body (23),
// cockpit glass (13), red beacon (6), white tail rotor (1). The spinning main
// rotor is drawn on top procedurally in cops.js.
export const SPR_HELI = [
  [_,_,_,_,_,0,0,0,0,_,_,_,_,_],
  [_,_,_,_,0,13,13,13,13,0,_,_,_,_],
  [_,_,_,0,13,13,13,13,13,13,0,_,_,_],
  [_,_,0,24,13,13,13,13,13,13,24,0,_,_],
  [_,0,24,23,23,23,23,23,23,23,23,24,0,_],
  [0,24,23,23,23,6,6,23,23,23,23,23,24,0],
  [0,23,23,23,23,23,23,23,23,23,23,23,23,0],
  [0,24,23,23,23,23,23,23,23,23,23,23,24,0],
  [_,0,24,23,23,23,23,23,23,23,23,24,0,_],
  [_,_,0,23,23,23,23,23,23,23,23,0,_,_],
  [_,_,_,0,23,23,23,23,23,23,0,_,_,_],
  [_,_,_,_,0,23,23,23,23,0,_,_,_,_],
  [_,_,_,_,_,0,23,23,0,_,_,_,_,_],
  [_,_,_,_,_,0,23,23,0,_,_,_,_,_],
  [_,_,_,_,0,4,23,23,4,0,_,_,_,_],
  [_,_,_,1,1,4,4,4,4,1,1,_,_,_],
];

// FLAMING BARREL payload — 8w × 9h drum (rust body, dark rings). The fire is
// drawn flickering on top in cops.js.
export const SPR_BARREL = [
  [_,0,0,0,0,0,0,_],
  [0,2,22,22,22,22,2,0],
  [0,22,22,9,9,22,22,0],
  [0,4,4,22,22,4,4,0],
  [0,22,22,22,22,22,22,0],
  [0,4,4,22,22,4,4,0],
  [0,22,22,9,9,22,22,0],
  [0,2,22,22,22,22,2,0],
  [_,0,0,0,0,0,0,_],
];

// Legacy aliases (so any stale HUD/import keeps building). SPR_SEDAN_BLUE/RED
// are now real colours defined with the sedan above, so they're not re-aliased.
export const SPR_SEDAN_GREEN  = SPR_SEDAN_SILVER;
export const SPR_SEDAN_PURPLE = SPR_SEDAN_BLUE;
export const SPR_TAXI         = SPR_SEDAN_ORANGE;
export const SPR_TRUCK_RUST   = SPR_SUV_ORANGE;
export const SPR_TRUCK_BLUE   = SPR_SUV_BLUE;
export const SPR_BUS_GREEN    = SPR_BUS_BLACK;
export const SPR_BUS_YELLOW   = SPR_BUS_ORANGE;
export const SPR_BUS_GRAY     = SPR_BUS_BLACK;
export const SPR_VAN_WHITE    = SPR_SEDAN_WHITE;
export const SPR_VAN_BROWN    = SPR_SEDAN_BLACK;

// ── Traffic skin table — cars (sedans + pickups) and Harley motorbikes; no buses.
// `scale` is the draw factor. Kept at 1.0 (native pixels) so sprites stay crisp —
// fractional scaling was what muddied the art. Collision half-sizes derive from
// w/h * scale.
const TS = 1.0;
export const TRAFFIC_SKINS = [
  // Sedans (5 colours)
  { spr: SPR_SEDAN_SILVER, w: 10, h: 16, scale: TS, speedMul: 0.30 },
  { spr: SPR_SEDAN_BLUE,   w: 10, h: 16, scale: TS, speedMul: 0.30 },
  { spr: SPR_SEDAN_RED,    w: 10, h: 16, scale: TS, speedMul: 0.32 },
  { spr: SPR_SEDAN_BLACK,  w: 10, h: 16, scale: TS, speedMul: 0.28 },
  { spr: SPR_SEDAN_WHITE,  w: 10, h: 16, scale: TS, speedMul: 0.30 },
  // SUVs (4 colours) — taller, slower
  { spr: SPR_SUV_WHITE,    w: 10, h: 18, scale: TS, speedMul: 0.24 },
  { spr: SPR_SUV_BLACK,    w: 10, h: 18, scale: TS, speedMul: 0.22 },
  { spr: SPR_SUV_BLUE,     w: 10, h: 18, scale: TS, speedMul: 0.24 },
  { spr: SPR_SUV_ORANGE,   w: 10, h: 18, scale: TS, speedMul: 0.24 },
  // Harleys (3 colours) — nimble, weave between lanes more often (bike: true)
  { spr: SPR_MOTO_BLACK,   w: 7,  h: 14, scale: TS, speedMul: 0.34, bike: true },
  { spr: SPR_MOTO_ORANGE,  w: 7,  h: 14, scale: TS, speedMul: 0.36, bike: true },
  { spr: SPR_MOTO_WHITE,   w: 7,  h: 14, scale: TS, speedMul: 0.34, bike: true },
  // Auto-rickshaws (2 colours) — small, slow, putter along
  { spr: SPR_AUTO_YELLOW,  w: 9,  h: 14, scale: TS, speedMul: 0.18 },
  { spr: SPR_AUTO_GREEN,   w: 9,  h: 14, scale: TS, speedMul: 0.18 },
];

// ─── Scenery ──────────────────────────────────────────────────────────────────
export const SPR_TREE = [
  [_,_,_,_,11,11,11,11,_,_,_,_,_,_],
  [_,_,_,11,20,20,20,20,11,_,_,_,_,_],
  [_,_,11,20,20,10,20,20,20,11,_,_,_,_],
  [_,11,20,20,10,10,10,20,20,20,11,_,_,_],
  [_,11,20,10,10,20,20,10,20,20,11,_,_,_],
  [11,20,20,10,20,20,20,20,10,20,20,11,_,_],
  [11,20,10,20,20,20,20,20,20,10,20,11,_,_],
  [11,20,20,20,20,20,20,20,20,20,20,11,_,_],
  [_,11,20,20,20,20,20,20,20,20,11,_,_,_],
  [_,_,11,20,20,20,20,20,20,11,_,_,_,_],
  [_,_,_,11,11,20,20,11,11,_,_,_,_,_],
  [_,_,_,_,_,18,18,_,_,_,_,_,_,_],
  [_,_,_,_,_,18,19,_,_,_,_,_,_,_],
  [_,_,_,_,19,18,18,19,_,_,_,_,_,_],
  [_,_,_,19,19,18,18,19,19,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_],
];

// Tall pine (city alt)
export const SPR_PINE = [
  [_,_,_,_,11,_,_,_,_,_,_,_,_,_],
  [_,_,_,11,20,11,_,_,_,_,_,_,_,_],
  [_,_,11,20,20,20,11,_,_,_,_,_,_,_],
  [_,11,20,20,10,20,20,11,_,_,_,_,_,_],
  [_,_,_,11,20,11,_,_,_,_,_,_,_,_],
  [_,_,11,20,20,20,11,_,_,_,_,_,_,_],
  [_,11,20,10,10,20,20,11,_,_,_,_,_,_],
  [11,20,20,10,20,10,20,20,11,_,_,_,_,_],
  [_,_,_,11,20,11,_,_,_,_,_,_,_,_],
  [_,11,20,20,20,20,20,11,_,_,_,_,_,_],
  [11,20,10,20,20,20,10,20,11,_,_,_,_,_],
  [11,20,20,20,20,20,20,20,11,_,_,_,_,_],
  [_,11,11,20,20,20,11,11,_,_,_,_,_,_],
  [_,_,_,18,19,18,_,_,_,_,_,_,_,_],
  [_,_,_,18,18,18,_,_,_,_,_,_,_,_],
  [_,_,_,18,19,18,_,_,_,_,_,_,_,_],
];

export const SPR_PALM = [
  [_,_,_,_,11,11,_,_,_,_,_,_,_,_],
  [_,_,11,11,20,11,11,11,_,_,_,_,_,_],
  [_,11,20,20,10,20,20,11,_,_,_,_,_,_],
  [11,20,20,10,10,10,20,11,11,_,_,_,_,_],
  [11,20,10,10,5,10,10,20,20,11,_,_,_,_],
  [_,11,20,10,10,10,20,20,11,_,_,_,_,_],
  [_,_,11,20,10,18,18,11,_,_,_,_,_,_],
  [_,_,_,_,18,18,18,_,_,_,_,_,_,_],
  [_,_,_,_,18,19,18,_,_,_,_,_,_,_],
  [_,_,_,_,18,18,19,_,_,_,_,_,_,_],
  [_,_,_,_,18,18,19,_,_,_,_,_,_,_],
  [_,_,_,_,19,18,18,_,_,_,_,_,_,_],
  [_,_,_,_,18,19,18,_,_,_,_,_,_,_],
  [_,_,_,_,18,18,19,_,_,_,_,_,_,_],
  [_,_,_,_,19,18,18,_,_,_,_,_,_,_],
  [_,_,_,_,18,18,19,_,_,_,_,_,_,_],
  [_,_,_,_,18,19,18,_,_,_,_,_,_,_],
  [_,_,_,_,18,18,18,_,_,_,_,_,_,_],
  [_,_,_,19,18,19,18,19,_,_,_,_,_,_],
  [_,_,19,19,18,18,18,19,19,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_],
];

// City buildings — generated office towers with lit/unlit window grids. Used as
// roadside scenery so the highway reads as an actual city skyline.
function makeBuilding(w, h, bodyIdx, litIdx) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      let v = bodyIdx;
      if (x === 0 || x === w - 1) v = 0;        // side outlines
      else if (y === 0) v = 0;                  // roof line
      else if (y === 1) v = 4;                  // roof cap
      else if (x > 1 && x < w - 2 && y > 2 && (y % 3 !== 0) && (x % 2 === 0)) {
        // Window cells — pseudo-random lit pattern.
        v = (((x * 7 + y * 13) % 5) < 3) ? litIdx : 3;
      }
      row.push(v);
    }
    rows.push(row);
  }
  return rows;
}
export const SPR_BUILDING  = makeBuilding(14, 30, 23, 5);   // tall, deep-gray, gold windows
export const SPR_BUILDING2 = makeBuilding(11, 22, 4, 13);   // shorter, gray, cool windows

// Lamp post (city)
export const SPR_LAMP = [
  [_,_,5,5,5,_,_,_],
  [_,5,5,1,5,5,_,_],
  [_,5,1,1,1,5,_,_],
  [_,_,5,1,5,_,_,_],
  [_,_,4,4,4,_,_,_],
  [_,_,_,4,_,_,_,_],
  [_,_,_,4,_,_,_,_],
  [_,_,_,4,_,_,_,_],
  [_,_,_,4,_,_,_,_],
  [_,_,_,4,_,_,_,_],
  [_,_,_,4,_,_,_,_],
  [_,_,_,4,_,_,_,_],
  [_,_,_,4,_,_,_,_],
  [_,_,_,4,_,_,_,_],
  [_,_,0,0,0,_,_,_],
];

export const SPR_BUSH = [
  [_,_,11,11,11,11,_,_],
  [_,11,20,20,20,20,11,_],
  [11,20,10,20,20,10,20,11],
  [11,20,20,20,20,20,20,11],
  [_,11,20,20,20,20,11,_],
  [_,_,11,11,11,11,_,_],
];

export const SPR_ROCK_SCEN = [
  [_,_,4,4,4,4,_,_,_],
  [_,4,3,3,2,3,4,_,_],
  [4,3,3,2,2,2,3,4,_],
  [4,3,2,2,3,2,3,4,_],
  [0,4,4,4,4,4,4,0,_],
];

// ─── Oil spill — slick black puddle on road ───────────────────────────────────
export const SPR_OIL_SPILL = [
  [_,_,_,0,0,0,0,0,_,_,_,_],
  [_,_,0,0,4,4,4,0,0,_,_,_],
  [_,0,0,4,4,0,0,4,4,0,0,_],
  [0,0,4,4,0,0,15,0,4,4,0,0],
  [0,4,4,0,15,15,0,4,4,4,4,0],
  [0,0,4,4,0,0,4,4,4,0,0,_],
  [_,0,0,4,4,4,4,4,0,0,_,_],
  [_,_,0,0,0,0,0,0,0,_,_,_],
];

// ─── HUD icons ────────────────────────────────────────────────────────────────
export const ICN_SPEED = [
  [_,_,0,0,0,0,_,_],
  [_,0,1,1,1,1,0,_],
  [0,1,1,0,0,1,1,0],
  [0,1,0,4,4,0,1,0],
  [0,1,0,0,4,4,1,0],
  [0,1,1,1,1,1,1,0],
  [_,0,1,1,1,1,0,_],
  [_,_,0,0,0,0,_,_],
];

export const ICN_FLAG = [
  [0,0,0,0,0,_,_,_],
  [0,1,0,1,0,_,_,_],
  [0,0,1,0,1,0,_,_],
  [0,1,0,1,0,1,_,_],
  [0,0,1,0,1,0,_,_],
  [0,_,_,_,_,_,_,_],
  [0,_,_,_,_,_,_,_],
  [0,_,_,_,_,_,_,_],
];

export const ICN_TROPHY = [
  [_,5,5,5,5,5,_,_],
  [5,21,21,21,21,21,5,_],
  [5,21,5,21,5,21,5,_],
  [_,5,21,21,21,5,_,_],
  [_,_,5,21,5,_,_,_],
  [_,9,9,5,9,9,_,_],
  [9,9,9,9,9,9,9,_],
];

// "Cars passed" icon — small car-from-behind silhouette
export const ICN_PASS = [
  [_,0,0,0,0,0,0,_],
  [0,1,1,5,5,1,1,0],
  [0,1,13,13,13,13,1,0],
  [0,1,1,1,1,1,1,0],
  [0,9,9,1,1,9,9,0],
  [_,0,0,0,0,0,0,_],
];

export const SPR_FINISH = [
  [0,1,0,1,0,1,0,1,0,1],
  [1,0,1,0,1,0,1,0,1,0],
  [0,1,0,1,0,1,0,1,0,1],
  [1,0,1,0,1,0,1,0,1,0],
];

// Stub: kept for backwards compatibility with legacy imports.
export const SPR_BARRICADE = SPR_FINISH;
export const SPR_NITRO     = SPR_FINISH;
export const SPR_STAR = [
  [_,_,5,_,_],
  [_,5,5,5,_],
  [5,5,1,5,5],
  [_,5,5,5,_],
  [5,_,_,_,5],
];
// Old icons kept just to satisfy any stale import.
export const ICN_NITRO = ICN_FLAG;
