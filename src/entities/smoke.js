// Exhaust smoke trail for player + AI cars.
//
// Each car carries its own particle list (`car.smoke = [{x, z, age}, ...]`).
// Particles are emitted at ~14 Hz behind the car (just past its tail in world z)
// and live ~0.5s, fading from dark → mid → light gray as they age.
import { project } from "../road.js";
import { rect } from "../render.js";

const PARTICLE_LIFE = 0.50;     // seconds
const EMIT_INTERVAL = 0.07;     // seconds between puffs
const MIN_EMIT_SPEED = 18;      // car must be moving for smoke to puff

export function updateSmoke(car, dt) {
  car.smoke = car.smoke || [];
  car._smokeTimer = (car._smokeTimer || 0) - dt;
  if (car._smokeTimer <= 0 && (car.speed || 0) > MIN_EMIT_SPEED) {
    car._smokeTimer = EMIT_INTERVAL;
    // Two side puffs, mimicking twin tailpipes on an F1.
    const jitter = (Math.random() - 0.5) * 0.6;
    car.smoke.push({ x: car.x - 2 + jitter, z: car.z - 7, age: 0 });
    car.smoke.push({ x: car.x + 2 + jitter, z: car.z - 7, age: 0 });
    // Keep particles bounded so we never accumulate too many.
    while (car.smoke.length > 14) car.smoke.shift();
  }
  for (let i = car.smoke.length - 1; i >= 0; i--) {
    const p = car.smoke[i];
    p.age += dt;
    if (p.age >= PARTICLE_LIFE) car.smoke.splice(i, 1);
  }
}

export function drawSmoke(ctx, map, playerZ, playerX, car) {
  if (!car.smoke || car.smoke.length === 0) return;
  for (const p of car.smoke) {
    const proj = project(map, playerZ, playerX, p);
    if (!proj) continue;
    const ageFrac = p.age / PARTICLE_LIFE;
    // Size shrinks slightly as smoke ages; color fades dark → mid → light.
    const size = Math.max(1, 3 - Math.round(ageFrac * 2));
    const col = ageFrac < 0.30 ? 4
              : ageFrac < 0.65 ? 3
              : 2;
    const sx = (proj.sx - size / 2) | 0;
    const sy = (proj.sy - size / 2) | 0;
    rect(ctx, sx, sy, size, size, col);
  }
}
