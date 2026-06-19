// Global config — palette, dimensions, tunables.

// Expanded palette with shading tones for richer sprite work.
export const PALETTE = [
  "#000000", //  0 black (outlines)
  "#FFFFFF", //  1 white (highlights, dashes, road edges)
  "#D8D8D8", //  2 light gray (asphalt highlight)
  "#7C7C7C", //  3 mid gray (asphalt)
  "#404040", //  4 dark gray (asphalt shadow)
  "#FCC418", //  5 yellow (lane dashes, headlights, taxi)
  "#E40058", //  6 player red
  "#8C1810", //  7 dark red (player shadow)
  "#FC7460", //  8 light red (player highlight)
  "#E45C10", //  9 orange (taillights, hazard stripes)
  "#22B814", // 10 grass green
  "#0F6E0C", // 11 dark green (jungle bg, tree leaves)
  "#5C94FC", // 12 sky blue (UI panels)
  "#80D0FC", // 13 light blue (windshield)
  "#FCBCB0", // 14 pink (skin / blossom)
  "#A05CFC", // 15 purple
  "#1078E0", // 16 mid blue (kept for cockpit visor)
  "#04A058", // 17 emerald green
  "#B07028", // 18 brown (palm trunk)
  "#6E4814", // 19 dark brown (shadow)
  "#3CB046", // 20 mid green (bush)
  "#FCE070", // 21 light yellow (sand / accent)
  "#A04020", // 22 truck rust orange
  "#202830", // 23 deep gray (bus)
  "#6488A0", // 24 muted blue gray (sedan)
  "#E0D8C0", // 25 cream (van / road shoulder dust)
];

// Logical canvas. Width is fixed (gameplay is tuned around a 160-wide field);
// height adapts to the device's portrait aspect ratio so the canvas fills the
// screen edge-to-edge with no letterbox bars and no pixel distortion. A taller
// screen simply shows more road ahead — the view-ahead distance (metres) is
// unchanged, so difficulty stays the same. Clamped to a sane band, with a 2:3
// fallback when there's no window (e.g. off-DOM / tests).
export const W = 160;
function computeH() {
  if (typeof window === "undefined") return 240;
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  if (!vw || !vh) return 240;
  return Math.max(240, Math.min(380, Math.round(W * (vh / vw))));
}
export const H = computeH();

export const PHYS = {
  startSpeed: 14,
  // Internal max-speed; HUD displays km/h via topSpeedKmh / maxSpeed ratio.
  // Lowered from 135 → 108 (and topSpeedKmh 250 → 200) so the actual road-scroll
  // speed at the top is ~20% slower — the km/h ratio is preserved (200/108 ==
  // 250/135), so the speedometer reads the same per unit; only the ceiling drops.
  // This is the main lever against the high-speed "dizzy" feeling.
  maxSpeed: 108,
  cruiseSpeed: 108,
  // Nitrous overspeed during RAMPAGE — speed is allowed up to maxSpeed*boostFactor
  // while the player.boost timer is running, for a real "kick" out of the boost.
  boostFactor: 1.10,
  // Two-phase ramp:
  //   0 → phase1 (≈100 km/h equivalent) over `rampPhase1Seconds` — punchy launch.
  //   phase1 → maxSpeed over `rampPhase2Seconds` — slow grind to the top.
  rampPhase1Seconds: 4,
  rampPhase2Seconds: 80,
  accel: 14,
  drag: 5,
  fenceBounce: 7,          // px the car springs back inward after hitting an edge
  fenceSpeedKeep: 0.88,    // speed retained on a fence bump (slight reduction)
  steerSpeed: 120,
  steerSpeedFactor: 0.65,
  carHalfWidth: 6,    // -20% with the smaller player sprite
  carHalfHeight: 8,
  // Display: top speed shows as 200 KMH; 100 km/h marker used for ramp phase split.
  topSpeedKmh: 200,
  phase1Kmh: 100,
};

// Player car sits in the lower third (not jammed against the bottom edge) so
// there's foreground road below it and more breathing room to read traffic.
// Raised from 0.74 → 0.68 to clear the floating steering joystick at the bottom.
export const PLAYER_Y = Math.round(H * 0.68);

// Endless survival mode.
export const RACE = {
  startLives: 3,
  countdownSeconds: 3,
  // After player reaches maxSpeed, traffic density scales up by this fraction
  // every densityStepSeconds, compounding — capped so the road never becomes
  // unwinnable.
  densityStepSeconds: 50,       // ramp bites a bit sooner
  densityStepIncrement: 0.10,   // traffic gets +10% denser each interval
  densityMax: 1.9,
  density2CarFrom: 1.12,        // above this density, some rows spawn a 2nd car
  trafficSidewaysChance: 0.8,   // chance a car actually changes lane on its timer (was 0.6)
  topSpeedThreshold: 0.95,
  // Police helicopter chase: a chopper flies in once the player crosses this KMH
  // and starts dropping flaming barrels. Re-tuned 250 → 150 so the air threat
  // shows up mid-run rather than only at the (now lower) 200 km/h top speed.
  copTriggerKmh: 150,
  copTopSpeedFrac: 0.92,    // cops max out at 92% of player's max speed
  copRamSlowdown: 0.35,     // multiplier on player speed when a cop rams from behind
  copSpawnGapZ: 30,         // initial distance behind the player
  // Near-miss rewards, two tiers:
  //   below comboKmh — every close shave pays a flat, discreet bonus (no combo);
  //   at comboKmh+   — NEAR MISS COMBO territory: each shave bumps the
  //   multiplier, resetting after comboWindow seconds without another, and
  //   fills the rampage meter (see below).
  comboKmh: 100,
  comboWindow: 2.8,
  // RAMPAGE pacing: an unbroken chain of `rampageNearMisses` combo-tier near
  // misses fills the nitro meter and fires NITROUS RAMPAGE. When a rampage
  // ends the meter is LOCKED until `rampageCooldownPasses` cars have been
  // passed — no back-to-back rampages.
  rampageNearMisses: 10,
  rampageCooldownPasses: 10,
  // RAMPAGE: a nitrous boost where the car smashes through traffic (each smash
  // adds to the combo). When it ends, an instantaneous shockwave from the car
  // kicks out just the next 2 vehicles ahead — room to maneuver, no long clear.
  rampageDuration: 7,      // seconds of nitrous smashing
  rampageClearTime: 0,     // no clear-road grace — the exit shockwave is instantaneous
  rampageClearDist: 120,   // search range for the exit shockwave (next 2 cars within this)
  // Tension/release pacing: traffic spacing breathes ±densityWaveAmp around the
  // ramped base on a densityWavePeriod-second cycle (surge → breather → surge).
  densityWaveAmp: 0.18,
  densityWavePeriod: 22,
  // Endless non-lethal oil slicks — one every [min..max] metres of road.
  oilSpacingMin: 260,
  oilSpacingMax: 440,
  // Distance milestone banner cadence (metres). Speed milestones are fixed.
  milestoneEveryM: 1000,
  // RAMPAGE booster pickups — VERY rare, and only after the player has reached
  // 150 km/h (the unlock is gated in main.js). Once unlocked, one spawns every
  // [min..max] metres of road — a long way apart so they're a treat, not a crutch.
  boosterSpacingMin: 1800,
  boosterSpacingMax: 3400,
};

// Spawn rates and traffic-row spacing.
export const SPAWN = {
  // Slightly denser baseline so there's always meaningful weaving to do.
  // Row-based — each row leaves one open lane the player can steer to.
  trafficRowGapCity: 72,
  trafficRowGapJungle: 70,  // unused (jungle removed) — kept for safety
  sceneryPerMeter: 0.22,
  aiInitial: 0,
};

export const SCORE = {
  distanceWeight: 1.0,
  passBonus: 25,           // per traffic car passed
  nearMissBonus: 100,
  smashBonus: 150,         // per traffic car smashed during a rampage (× combo)
  cityBonus: 1.0,
  jungleBonus: 1.25,
  mediumBonus: 1.0,
  hardBonus: 1.5,
  survivalSecondBonus: 10, // per second alive
  // Skill-depth multipliers (combo-tier near misses + passes):
  //   speedBonusMax — extra fraction at top speed (0 at comboKmh → this at top).
  //   precisionMax  — extra fraction for a pixel-perfect shave (tightness 0→1).
  //   precisionPx   — gap (px) at/under which a shave counts as PERFECT.
  //   sandwichBonus — flat bonus for splitting a tight 2-car gap (a "sandwich").
  speedBonusMax: 1.0,
  precisionMax: 1.5,
  precisionPx: 8,
  sandwichBonus: 200,
};

export const MUSIC = {
  cityBPM: 150,
  jungleBPM: 132,
  bpmSwingPct: 0.10,
};

// Wide multi-lane road.
export const ROAD = {
  cityHalfWidth: 56,
  jungleHalfWidth: 52,
};

// No brake key — game auto-accelerates throughout. Down arrow is unused.
export const KEYS = {
  left:  ["ArrowLeft", "a", "A"],
  right: ["ArrowRight", "d", "D"],
  mute:  ["m", "M"],
  pause: ["p", "P", " "],
  back:  ["Escape"],
  enter: ["Enter", " "],
};
