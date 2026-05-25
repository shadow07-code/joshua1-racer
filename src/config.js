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
  "#1078E0", // 16 mid blue (sedan body)
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

// Logical canvas — mobile-portrait aspect for the Road Fighter feel.
export const W = 160;
export const H = 240;

export const PHYS = {
  // Slow, gentle ramp — gives the player time to read the traffic before things get fast.
  startSpeed: 14,
  cruiseSpeed: 72,
  maxSpeed: 90,        // no nitro now; brief overshoot if you brake-late, otherwise == cruise
  rampSeconds: 22,
  accel: 18,
  brakeDecel: 70,
  drag: 5,
  steerSpeed: 120,
  steerSpeedFactor: 0.65,
  carHalfWidth: 7,
  carHalfHeight: 10,
};

export const PLAYER_Y = H - 36;

export const RACE = {
  lapLength: 800,
  totalLaps: 3,
  finishZ: 2400,
  countdownSeconds: 3,
};

// Spawn rates and traffic-row spacing.
export const SPAWN = {
  // Traffic is row-based: each row leaves at least one open lane the player
  // can steer through. rowGap is the world distance between rows in meters.
  // Spread rows out so the player has plenty of time to read each pattern.
  trafficRowGapCity: 95,
  trafficRowGapJungle: 78,
  sceneryPerMeter: 0.22,
  aiInitial: 5,
};

export const SCORE = {
  distanceWeight: 1.0,
  passBonus: 250,           // pass a rival
  trafficPassBonus: 25,     // pass a slow traffic car
  nearMissBonus: 100,       // narrowly avoid a traffic car
  cityBonus: 1.0,
  jungleBonus: 1.25,
  mediumBonus: 1.0,
  hardBonus: 1.5,
  placeBonus: [0, 5000, 3000, 2000, 1000, 500, 250],
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
