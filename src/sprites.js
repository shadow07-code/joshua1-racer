// Detailed pixel sprites. Top-down view: front of car at TOP of sprite, back at BOTTOM.
// Palette indices defined in config.js. -1 = transparent.

const _ = -1;

// ── Helper: paint-swap a body color triple (dark/main/light) into a sprite ────
// Exported so garage.js can mint car liveries from the base Ferrari with no new art.
export function recolorBody(base, fromDark, fromMain, fromLight, toDark, toMain, toLight) {
  return base.map(row => row.map(c => {
    if (c === fromDark) return toDark;
    if (c === fromMain) return toMain;
    if (c === fromLight) return toLight;
    return c;
  }));
}

// ── Helper: 1px "lean" variants ───────────────────────────────────────────────
// Shifts the nose rows one pixel toward the steer/drift direction (and tail
// rows the opposite way) so a car visibly angles into its lateral movement.
// Only rows with transparent edge cells are shifted, so nothing falls off.
function shiftRow(row, dir) {
  return dir > 0 ? [_, ...row.slice(0, -1)] : [...row.slice(1), _];
}
function leanSprite(spr, noseRows, dir, tailRows = []) {
  return spr.map((r, i) =>
    noseRows.includes(i) ? shiftRow(r, dir) :
    tailRows.includes(i) ? shiftRow(r, -dir) : r);
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

// ─── FORMULA 1 CAR (player + AI rivals) — 12w × 18h, native 1× (crisp). ─────────
// Open-wheel F1 silhouette at the smaller (25%-reduced) size: pointed nose, a
// full-width front + rear wing, four exposed black wheels with grey hubs, and a
// central cockpit with white helmet + yellow visor. The "J" sits on the engine
// cover. Detail pass: consistent top-left lighting (lit left flank 8, shaded
// right 7), light-catch glints on the top wheel hubs, and body-colour wing
// endplates. Body tones (6 main, 7 shadow, 8 highlight) recolour, so AI
// liveries shade the same way.
//   6 body | 7 body-shadow | 8 body-highlight | 0 outline/tyres/wings
//   4 wheel hub | 2 hub glint | 13 cockpit glass | 5 visor | 1 white
const SPR_F1_BASE = [
  [_,_,_,_,_,0,0,_,_,_,_,_],       //  0 nose tip
  [_,_,_,_,0,8,6,0,_,_,_,_],       //  1 nose (lit left)
  [_,0,6,1,1,8,6,1,1,6,0,_],       //  2 front wing — body-colour endplates
  [_,_,_,0,0,8,6,0,0,_,_,_],       //  3 wing root
  [_,_,_,0,8,6,6,7,0,_,_,_],       //  4 chassis
  [0,2,0,0,8,6,6,7,0,0,2,0],       //  5 front wheels (hub glint) + chassis
  [0,4,0,0,8,6,6,7,0,0,4,0],       //  6 front wheels + chassis
  [_,_,_,0,8,6,6,7,0,_,_,_],       //  7 chassis
  [_,_,_,0,8,13,13,6,0,_,_,_],     //  8 cockpit glass
  [_,_,_,0,13,1,1,13,0,_,_,_],     //  9 helmet (white)
  [_,_,_,0,13,5,5,13,0,_,_,_],     // 10 visor (yellow)
  [_,_,_,0,8,6,6,7,0,_,_,_],       // 11 engine cover (J)
  [_,_,_,0,8,6,6,7,0,_,_,_],       // 12 engine cover (J)
  [_,_,_,0,8,6,6,7,0,_,_,_],       // 13 engine cover (J)
  [_,_,_,0,8,6,6,7,0,_,_,_],       // 14 engine cover (J)
  [0,2,0,0,8,6,6,7,0,0,2,0],       // 15 rear wheels (hub glint) + body
  [0,4,0,0,8,6,6,7,0,0,4,0],       // 16 rear wheels + body
  [_,0,6,1,1,1,1,1,1,6,0,_],       // 17 rear wing — body-colour endplates
];

// ─── DRIVER (title-screen mascot) — 6w × 11h, front view ──────────────────────
// The J-car's driver: red helmet (6) with a yellow visor (5), white race suit (1)
// with red sleeves, dark boots (0). Two poses — standing, and a right-arm
// thumbs-up — drawn at the same scale as the hero car for the title animation.
export const SPR_DRIVER_STAND = [
  [_,_,6,6,_,_],   //  0 helmet crown
  [_,6,6,6,6,_],   //  1 helmet
  [_,6,5,5,6,_],   //  2 visor
  [_,0,1,1,0,_],   //  3 collar
  [6,1,1,1,1,6],   //  4 shoulders + sleeves
  [6,1,8,1,1,6],   //  5 chest (highlight) + sleeves
  [6,1,1,1,1,6],   //  6 torso + hands
  [_,1,1,1,1,_],   //  7 hips
  [_,1,0,1,_,_],   //  8 legs
  [_,0,_,0,_,_],   //  9 boots
  [_,0,_,0,_,_],   // 10 boots
];
export const SPR_DRIVER_THUMB = [
  [_,_,6,6,_,1],   //  0 helmet crown + raised fist
  [_,6,6,6,6,6],   //  1 helmet + raised arm
  [_,6,5,5,6,_],   //  2 visor
  [_,0,1,1,0,_],   //  3 collar
  [6,1,1,1,1,_],   //  4 left sleeve + shoulders (right arm raised)
  [_,1,8,1,1,_],   //  5 chest
  [_,1,1,1,1,_],   //  6 torso
  [_,1,1,1,1,_],   //  7 hips
  [_,1,0,1,_,_],   //  8 legs
  [_,0,_,0,_,_],   //  9 boots
  [_,0,_,0,_,_],   // 10 boots
];

// Stamp a white "J" on the engine cover (player only — AI rivals stay plain).
// Spans rows 11..14, cols 4..6: top bar, stem down the right, hook curling left.
function stampJ(sprite) {
  const out = sprite.map(r => r.slice());
  out[11][4] = 1; out[11][5] = 1; out[11][6] = 1; // top bar
  out[12][6] = 1;                                  // stem (right)
  out[13][4] = 1; out[13][6] = 1;                  // left tick + stem
  out[14][5] = 1;                                  // bottom hook
  return out;
}

// ─── PLAYER: OPEN FERRARI CONVERTIBLE (Spider) — 10w × 15h, top-down ──────────
// Drawn at a smaller NATIVE pixel grid (≈15% smaller than the old 12×18) so it
// stays crisp — never fractionally scaled (that muddies the art). A sleek red
// drop-top: pointed nose with inset headlights, a power-domed hood with a badge,
// a raked windscreen, an OPEN cockpit you see into (dark seats + the driver's
// head & shoulders and the roll-hoops), muscular haunches over fat wheels, a
// louvred engine cover, round quad taillights and twin exhaust tips. Consistent
// top-left lighting (lit flank 8 / shaded flank 7); body tones 6/7/8 recolour.
//   6 body | 7 shadow | 8 highlight | 0 outline/tyres/hoops | 4 wheel/louvre/exhaust
//   13 windscreen | 5 headlight/badge | 9 taillight | 23 cockpit | 14 driver | 1 suit
export const SPR_FERRARI_BASE = [
  [_,_,_,0,0,0,0,_,_,_],     //  0 nose tip
  [_,_,0,6,8,8,6,0,_,_],     //  1 nose
  [_,0,5,8,6,6,7,5,0,_],     //  2 headlights + hood
  [0,4,0,8,6,6,7,0,4,0],     //  3 front wheels + hood
  [_,0,8,6,5,5,6,7,0,_],     //  4 hood badge
  [_,0,8,13,13,13,13,7,0,_], //  5 windscreen
  [_,0,8,4,23,23,4,7,0,_],   //  6 open cockpit rim (dark interior)
  [_,0,8,4,14,14,4,7,0,_],   //  7 driver's head
  [_,0,8,1,14,14,1,7,0,_],   //  8 driver's shoulders / seats
  [_,0,8,4,0,0,4,7,0,_],     //  9 roll-hoops behind the seats
  [0,4,0,8,6,6,8,0,4,0],     // 10 rear haunches + rear wheels
  [_,0,8,4,4,4,4,7,0,_],     // 11 louvred engine cover
  [_,0,8,6,4,4,6,7,0,_],     // 12 louvred engine cover
  [_,0,9,9,6,6,9,9,0,_],     // 13 round quad taillights
  [_,_,0,4,0,0,4,0,_,_],     // 14 rear bumper + exhaust
];

// No steering-lean variants — the car stays straight (the 1px yaw read as
// unnatural). Kept as aliases so any stray importer still resolves.
export const SPR_PLAYER   = SPR_FERRARI_BASE;
export const SPR_PLAYER_L = SPR_FERRARI_BASE;
export const SPR_PLAYER_R = SPR_FERRARI_BASE;

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
  [_,_,0,0,0,0,0,_,_],   //  0 front bumper
  [_,0,5,6,6,6,5,0,_],   //  1 headlights
  [_,0,7,6,8,6,7,0,_],   //  2 hood — dark sides, light centre
  [0,0,7,6,6,6,7,0,0],   //  3 hood + front wheels
  [_,0,7,2,3,3,7,0,_],   //  4 windshield (glass glint top-left)
  [_,0,7,6,6,6,7,0,_],   //  5 roof
  [_,0,7,6,6,6,7,0,_],   //  6 roof
  [_,0,7,3,3,3,7,0,_],   //  7 rear window
  [0,0,7,6,6,6,7,0,0],   //  8 trunk + rear wheels
  [_,0,7,6,8,6,7,0,_],   //  9 trunk (light centre)
  [_,0,9,6,6,6,9,0,_],   // 10 taillights
  [_,_,0,0,0,0,0,_,_],   // 11 rear bumper
  [_,_,_,_,_,_,_,_,_],   // 12 blank
  [_,_,_,_,_,_,_,_,_],   // 13 blank
];

export const SPR_SEDAN_SILVER = recolorBody(SEDAN_BASE, 7, 6, 8, 4, 2, 1);   // silver
export const SPR_SEDAN_BLUE   = recolorBody(SEDAN_BASE, 7, 6, 8, 4, 16, 13); // blue
export const SPR_SEDAN_RED    = recolorBody(SEDAN_BASE, 7, 6, 8, 7, 6, 8);   // red
export const SPR_SEDAN_BLACK  = recolorBody(SEDAN_BASE, 7, 6, 8, 0, 4, 3);   // charcoal (not flat black)
export const SPR_SEDAN_WHITE  = recolorBody(SEDAN_BASE, 7, 6, 8, 2, 1, 1);   // white
export const SPR_SEDAN_ORANGE = recolorBody(SEDAN_BASE, 7, 6, 8, 22, 9, 5);  // orange
export const SPR_SEDAN_GREEN  = recolorBody(SEDAN_BASE, 7, 6, 8, 11, 17, 10); // forest green (replaces the red traffic car — the player is the ONLY red car)

// TAXI — yellow sedan with a rooftop sign block and a black-and-cream checker
// band across the trunk (the side the player actually sees while passing).
export const SPR_TAXI_CAB = (() => {
  const t = recolorBody(SEDAN_BASE, 7, 6, 8, 9, 5, 21);
  t[5][4] = 0;                 // rooftop TAXI sign
  t[9][3] = 0; t[9][5] = 0;    // checker band across the trunk
  return t;
})();

// SUV — 10w × 18h. Taller, boxier wagon: short hood, big upright greenhouse,
// long roof with roof-rails, wraparound rear glass. Reads clearly apart from the
// lower sedan. Same width as the sedan (no bigger).
const SUV_BASE = [
  [_,_,0,0,0,0,0,_,_],   //  0 front bumper (boxy nose)
  [_,0,5,6,6,6,5,0,_],   //  1 headlights
  [_,0,7,6,8,6,7,0,_],   //  2 short hood — dark sides, light centre
  [0,0,7,6,6,6,7,0,0],   //  3 hood + front wheels
  [_,0,7,2,3,3,7,0,_],   //  4 windshield (glass glint top-left)
  [_,0,7,6,6,6,7,0,_],   //  5 tall roof
  [_,0,7,6,8,6,7,0,_],   //  6 tall roof (light centre)
  [_,0,7,6,6,6,7,0,_],   //  7 tall roof
  [_,0,7,3,3,3,7,0,_],   //  8 rear window
  [0,0,7,6,6,6,7,0,0],   //  9 trunk + rear wheels
  [_,0,7,6,8,6,7,0,_],   // 10 trunk (light centre)
  [_,0,9,6,6,6,9,0,_],   // 11 taillights
  [_,_,0,0,0,0,0,_,_],   // 12 rear bumper
  [_,_,_,_,_,_,_,_,_],   // 13 blank
  [_,_,_,_,_,_,_,_,_],   // 14 blank
  [_,_,_,_,_,_,_,_,_],   // 15 blank
];

export const SPR_SUV_WHITE    = recolorBody(SUV_BASE, 7, 6, 8, 2, 1, 1);    // white
export const SPR_SUV_BLACK    = recolorBody(SUV_BASE, 7, 6, 8, 0, 4, 3);    // charcoal
export const SPR_SUV_ORANGE   = recolorBody(SUV_BASE, 7, 6, 8, 22, 9, 5);   // orange
export const SPR_SUV_BLUE     = recolorBody(SUV_BASE, 7, 6, 8, 4, 16, 13);  // blue

// TRUCK — 9w × 18h box truck: short cab up front, then a long cargo box riding
// over three wheel sets. Bigger + slower than cars. Body slots 6/7/8 recolour.
const TRUCK_BASE = [
  [_,_,0,0,0,0,0,_,_],   //  0 front bumper
  [_,0,5,6,6,6,5,0,_],   //  1 headlights
  [_,0,7,6,8,6,7,0,_],   //  2 cab hood (light centre)
  [0,0,7,6,6,6,7,0,0],   //  3 cab + front wheels
  [_,0,7,2,3,3,7,0,_],   //  4 cab windshield (glass glint)
  [_,0,4,4,4,4,4,0,_],   //  5 cab / box divider
  [_,0,7,6,6,6,7,0,_],   //  6 cargo box
  [_,0,7,6,8,6,7,0,_],   //  7 cargo box (light centre)
  [_,0,7,6,6,6,7,0,_],   //  8 cargo box
  [0,0,7,6,6,6,7,0,0],   //  9 cargo box + mid wheels
  [_,0,7,6,6,6,7,0,_],   // 10 cargo box
  [_,0,7,25,25,25,7,0,_],// 11 cargo box — cream livery band
  [_,0,7,6,6,6,7,0,_],   // 12 cargo box
  [0,0,7,6,6,6,7,0,0],   // 13 cargo box + rear wheels
  [_,0,7,6,6,6,7,0,_],   // 14 cargo box
  [_,0,9,6,6,6,9,0,_],   // 15 taillights
  [_,0,0,0,0,0,0,0,_],   // 16 rear bumper
  [_,_,_,_,_,_,_,_,_],   // 17 blank
];
export const SPR_TRUCK_BLUE   = recolorBody(TRUCK_BASE, 7, 6, 8, 4, 16, 13);  // blue
export const SPR_TRUCK_WHITE  = recolorBody(TRUCK_BASE, 7, 6, 8, 2, 1, 1);    // white
export const SPR_TRUCK_ORANGE = recolorBody(TRUCK_BASE, 7, 6, 8, 22, 9, 5);   // orange

// BUS — 10w × 22h, long with rows of windows. Windows are mid-gray (never blue).
const BUS_BASE = [
  [_,0,0,0,0,0,0,0,0,_],
  [0,8,6,6,6,6,6,6,8,0],
  [0,6,7,7,7,7,7,7,6,0],
  [0,6,2,3,3,3,3,3,6,0],   // windshield (glass glint)
  [0,6,3,1,3,3,1,3,6,0],
  [0,6,6,3,3,3,3,6,6,0],
  [0,6,6,6,6,6,6,6,6,0],
  [0,6,23,3,6,6,3,3,6,0],  // window row 1 (passenger silhouette)
  [0,6,3,3,6,6,3,3,6,0],
  [0,6,6,6,6,6,6,6,6,0],
  [0,6,3,3,6,6,3,23,6,0],  // window row 2 (passenger silhouette)
  [0,6,3,3,6,6,3,3,6,0],
  [0,6,6,6,6,6,6,6,6,0],
  [0,6,3,23,6,6,3,3,6,0],  // window row 3 (passenger silhouette)
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
  [_,1,1,1,1,1,_],   //  3 chrome handlebars
  [_,0,7,8,7,0,_],   //  4 fuel tank (light centre)
  [_,0,7,6,7,0,_],   //  5 fuel tank
  [_,0,4,4,4,0,_],   //  6 engine block
  [_,0,7,6,7,0,_],   //  7 seat front
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
  [_,0,7,6,6,6,7,0,_],   //  4 body flares to cabin (dark sides)
  [0,7,3,3,3,3,3,7,0],   //  5 windscreen (dark posts)
  [0,7,6,8,8,8,6,7,0],   //  6 canopy (light centre)
  [0,7,6,6,6,6,6,7,0],   //  7 canopy roof
  [0,7,4,6,6,6,4,7,0],   //  8 open sides (dark interior)
  [0,7,6,6,6,6,6,7,0],   //  9 rear body
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
export const SPR_SEDAN_PURPLE = SPR_SEDAN_BLUE;
export const SPR_TAXI         = SPR_SEDAN_ORANGE;
export const SPR_BUS_GREEN    = SPR_BUS_BLACK;
export const SPR_BUS_YELLOW   = SPR_BUS_ORANGE;
export const SPR_BUS_GRAY     = SPR_BUS_BLACK;
export const SPR_VAN_WHITE    = SPR_SEDAN_WHITE;
export const SPR_VAN_BROWN    = SPR_SEDAN_BLACK;

// ── Traffic skin table — small cars (sedans + SUVs) plus big slow trucks + buses.
// `scale` is the draw factor. Kept at 1.0 (native pixels) so sprites stay crisp —
// fractional scaling was what muddied the art. Collision half-sizes derive from
// w/h * scale, so the smaller sprites also have smaller hitboxes.
// Each skin carries lean variants (sprL/sprR — used for the smashed-car skid
// look) and `tailRow`, the sprite row of its taillights: the turn-signal
// blinker overdraws an amber corner light there when the car is about to
// merge or actively drifting.
const TS = 1.0;
function mkSkin(spr, w, h, speedMul, tailRow, leanRows = [0, 1, 2]) {
  return {
    spr, w, h, scale: TS, speedMul, tailRow,
    sprL: leanRows.length ? leanSprite(spr, leanRows, -1) : spr,
    sprR: leanRows.length ? leanSprite(spr, leanRows, +1) : spr,
  };
}
export const TRAFFIC_SKINS = [
  // Sedans (5 colours + taxi) — small + nippy
  mkSkin(SPR_SEDAN_SILVER, 9, 14, 0.30, 10),
  mkSkin(SPR_SEDAN_BLUE,   9, 14, 0.30, 10),
  mkSkin(SPR_SEDAN_GREEN,  9, 14, 0.31, 10),   // was RED — only the player is red now
  mkSkin(SPR_SEDAN_BLACK,  9, 14, 0.28, 10),
  mkSkin(SPR_SEDAN_WHITE,  9, 14, 0.30, 10),
  mkSkin(SPR_TAXI_CAB,     9, 14, 0.32, 10),
  // SUVs (3 colours) — a touch taller, slower
  mkSkin(SPR_SUV_WHITE,    9, 16, 0.24, 11),
  mkSkin(SPR_SUV_BLACK,    9, 16, 0.22, 11),
  mkSkin(SPR_SUV_BLUE,     9, 16, 0.24, 11),
  // Trucks (3 colours) — long box trucks, big + slow
  mkSkin(SPR_TRUCK_BLUE,   9, 18, 0.18, 15),
  mkSkin(SPR_TRUCK_WHITE,  9, 18, 0.18, 15),
  mkSkin(SPR_TRUCK_ORANGE, 9, 18, 0.20, 15),
  // Buses (2 colours) — biggest + slowest; too long to lean visibly
  mkSkin(SPR_BUS_WHITE,    10, 22, 0.16, 20, []),
  mkSkin(SPR_BUS_ORANGE,   10, 22, 0.16, 20, []),
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

// COIN — a small shiny gold coin (7×7) scattered along the ideal weaving line.
// Top-left highlight (21 light-yellow), gold body (5), bottom-right shadow (9),
// black rim (0). Reads as round + metallic at a glance.
export const SPR_COIN = [
  [_,_,0,0,0,_,_],
  [_,0,21,21,5,0,_],
  [0,21,21,5,5,9,0],
  [0,21,5,5,5,9,0],
  [0,5,5,5,9,9,0],
  [_,0,9,9,9,0,_],
  [_,_,0,0,0,_,_],
];

// RAMPAGE BOOSTER pickup — a blue nitrous canister topped with a flame, with a
// yellow label band. Collecting it instantly fires a RAMPAGE. 7w × 11h.
export const SPR_BOOST = [
  [_,_,_,5,_,_,_],     //  0 flame tip
  [_,_,9,5,9,_,_],     //  1 flame
  [_,_,0,0,0,_,_],     //  2 cap
  [_,0,13,16,13,0,_],  //  3 neck
  [0,13,1,16,16,13,0], //  4 body (white glint)
  [0,16,16,16,16,16,0],
  [0,16,16,16,16,16,0],
  [0,16,5,5,5,16,0],   //  7 yellow label band
  [0,16,16,16,16,16,0],
  [_,0,16,16,16,0,_],  //  9 base taper
  [_,_,0,0,0,_,_],     // 10 base
];
// Old icons kept just to satisfy any stale import.
export const ICN_NITRO = ICN_FLAG;
