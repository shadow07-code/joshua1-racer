// Single map (city). Difficulty selection removed — always Hard.
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
    dashIdx: 1,          // white center dash (was yellow)
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
};

export const MAP_LIST = ["city"];
export const DIFFICULTY_LIST = ["hard"];
