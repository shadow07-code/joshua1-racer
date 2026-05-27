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

// Logical canvas — mobile-portrait aspect.
export const W = 160;
export const H = 240;

export const PHYS = {
  startSpeed: 14,
  // Internal max-speed value chosen so HUD displays 250 KMH at top
  // (KMH = speed * (250 / maxSpeed)).
  maxSpeed: 135,
  cruiseSpeed: 135,        // legacy — same as max in endless
  rampSeconds: 50,         // gentle 50s climb to top speed
  accel: 9,
  brakeDecel: 80,
  drag: 5,
  offRoadDecel: 180,       // rapid stop when off the asphalt (135 m/s → 0 in <1s)
  steerSpeed: 120,
  steerSpeedFactor: 0.65,
  carHalfWidth: 7,
  carHalfHeight: 10,
  // Display: top speed shows as ~250 KMH.
  topSpeedKmh: 250,
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
  densityStepIncrement: 0.05,
  densityMax: 1.6,           // hard ceiling on the density multiplier
  topSpeedThreshold: 0.95,
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

export const KEYS = {
  left:  ["ArrowLeft", "a", "A"],
  right: ["ArrowRight", "d", "D"],
  brake: ["ArrowDown", "s", "S"],
  mute:  ["m", "M"],
  pause: ["p", "P", " "],
  back:  ["Escape"],
  enter: ["Enter", " "],
};
