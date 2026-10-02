const S = await import("../../src/sprites.js");
const { PHYS } = await import("../../src/config.js");
const HIT = 0.85;
console.log("player half", PHYS.carHalfWidth, "x", PHYS.carHalfHeight*0.5);
for (const [name, list] of [["TRAFFIC", S.TRAFFIC_SKINS], ["ONCOMING", S.ONCOMING_SKINS]]) {
  for (const k of list) {
    const w = k.w ?? k.spr[0].length, h = k.h ?? k.spr.length;
    const hx = w * k.scale / 2 * HIT * 0.70, hz = h * k.scale / 2 * HIT * 0.34;
    const collideDx = PHYS.carHalfWidth + hx;
    console.log(name, (k.name||"").padEnd(8), "w", w, "h", h, "scale", k.scale, "speedMul", k.speedMul,
      "| collide if |dx|<", collideDx.toFixed(2), " |dz|<", (PHYS.carHalfHeight*0.5 + hz).toFixed(2),
      "| max tightness w/o crash", (1 - collideDx/18).toFixed(3));
  }
}
