// Per-map config: road geometry, palette indices, scenery mix, music.
// No more in-road obstacles — the road is for cars only.
import { ROAD } from "./config.js";

export const MAPS = {
  city: {
    key: "city",
    name: "CITY",
    description: "WIDE HIGHWAY",
    roadHalfWidth: ROAD.cityHalfWidth,
    biasX: 0,
    bgIdx: 10,           // bright grass
    bgAltIdx: 11,        // darker grass band
    roadIdx: 3,          // mid gray asphalt
    roadGrainIdx: 4,     // darker speckle
    shoulderIdx: 4,
    dashIdx: 5,
    rumbleAIdx: 6,
    rumbleBIdx: 1,
    scenery: [
      { kind: "tree", weight: 5 },
      { kind: "pine", weight: 3 },
      { kind: "bush", weight: 3 },
      { kind: "lamp", weight: 2 },
    ],
    music: "city",
  },

  jungle: {
    key: "jungle",
    name: "JUNGLE",
    description: "DIRT TRACK",
    roadHalfWidth: ROAD.jungleHalfWidth,
    biasX: -2,
    bgIdx: 11,
    bgAltIdx: 17,
    roadIdx: 18,         // brown dirt
    roadGrainIdx: 19,    // darker brown speckle
    shoulderIdx: 19,
    dashIdx: 5,
    rumbleAIdx: 9,
    rumbleBIdx: 1,
    scenery: [
      { kind: "palm", weight: 6 },
      { kind: "bush", weight: 3 },
      { kind: "rock", weight: 2 },
      { kind: "tree", weight: 2 },
    ],
    music: "jungle",
  },
};

export const MAP_LIST = ["city", "jungle"];
export const DIFFICULTY_LIST = ["medium", "hard"];
