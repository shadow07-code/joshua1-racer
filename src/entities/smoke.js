// Exhaust trail for player + AI cars.
//
// Each car carries its own particle list (`car.smoke = [{x, z, age, fire}, ...]`).
// Normal: gray smoke puffs fading dark→light. During RAMPAGE: bright fire
// particles (orange→yellow→white) from the twin exhausts — visible nitrous boost.
import { project } from "../road.js";
import { rect } from "../render.js";

const PARTICLE_LIFE = 0.50;     // seconds
const FIRE_LIFE = 0.35;         // fire particles burn out faster
const EMIT_INTERVAL = 0.07;     // seconds between puffs
const FIRE_EMIT_INTERVAL = 0.03; // fire sprays faster for a denser trail
const MIN_EMIT_SPEED = 18;      // car must be moving for smoke to puff

export function updateSmoke(car, dt) {
  car.smoke = car.smoke || [];
  car._smokeTimer = (car._smokeTimer || 0) - dt;
  const rampage = (car.rampage || 0) > 0;
  const interval = rampage ? FIRE_EMIT_INTERVAL : EMIT_INTERVAL;
  if (car._smokeTimer <= 0 && (car.speed || 0) > MIN_EMIT_SPEED) {
    car._smokeTimer = interval;
    const jitter = (Math.random() - 0.5) * 0.6;
    car.smoke.push({ x: car.x - 2 + jitter, z: car.z - 7, age: 0, fire: rampage });
    car.smoke.push({ x: car.x + 2 + jitter, z: car.z - 7, age: 0, fire: rampage });
    const cap = rampage ? 28 : 14;
    while (car.smoke.length > cap) car.smoke.shift();
  }
  for (let i = car.smoke.length - 1; i >= 0; i--) {
    const p = car.smoke[i];
    p.age += dt;
    if (p.age >= (p.fire ? FIRE_LIFE : PARTICLE_LIFE)) car.smoke.splice(i, 1);
  }
}

export function drawSmoke(ctx, map, playerZ, playerX, car) {
  if (!car.smoke || car.smoke.length === 0) return;
  for (const p of car.smoke) {
    const proj = project(map, playerZ, playerX, p);
    if (!proj) continue;
    if (p.fire) {
      const life = FIRE_LIFE;
      const ageFrac = p.age / life;
      const size = Math.max(1, 4 - Math.round(ageFrac * 3));
      // Fire: orange → yellow → white as it ages
      const col = ageFrac < 0.25 ? 9   // orange
                : ageFrac < 0.55 ? 5   // yellow
                : 1;                    // white-hot
      const sx = (proj.sx - size / 2) | 0;
      const sy = (proj.sy - size / 2) | 0;
      rect(ctx, sx, sy, size, size, col);
    } else {
      const ageFrac = p.age / PARTICLE_LIFE;
      const size = Math.max(1, 3 - Math.round(ageFrac * 2));
      const col = ageFrac < 0.30 ? 4 : ageFrac < 0.65 ? 3 : 2;
      const sx = (proj.sx - size / 2) | 0;
      const sy = (proj.sy - size / 2) | 0;
      rect(ctx, sx, sy, size, size, col);
    }
  }
}
