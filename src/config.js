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
  maxSpeed: 135,
  cruiseSpeed: 135,
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
  // Display: top speed shows as 250 KMH; 100 km/h marker used for ramp phase split.
  topSpeedKmh: 250,
  phase1Kmh: 100,
};

export const PLAYER_Y = H - 36;

// Endless survival mode.
export const RACE = {
  startLives: 3,
  countdownSeconds: 3,
  // After player reaches maxSpeed, traffic density scales up by this fraction
  // every densityStepSeconds, compounding — capped so the road never becomes
  // unwinnable.
  densityStepSeconds: 60,
  densityStepIncrement: 0.10,   // traffic gets +10% denser each interval (was +5%)
  densityMax: 1.8,              // allow the steeper ramp to keep biting
  trafficSidewaysChance: 0.8,   // chance a car actually changes lane on its timer (was 0.6)
  topSpeedThreshold: 0.95,
  // Cop chase: 2 cop cars spawn behind the player when they cross this KMH.
  // Cops cruise slightly slower than the player's max, so a clean run outruns them.
  copTriggerKmh: 250,
  copTopSpeedFrac: 0.92,    // cops max out at 92% of player's max speed
  copRamSlowdown: 0.35,     // multiplier on player speed when a cop rams from behind
  copSpawnGapZ: 30,         // initial distance behind the player
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
  cityBonus: 1.0,
  jungleBonus: 1.25,
  mediumBonus: 1.0,
  hardBonus: 1.5,
  survivalSecondBonus: 10, // per second alive
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
