import { CITIES, CITY_GATE_HALF, CITY_WALL_HALF } from "./content.js";

export function crossesCityWall(
  oldX: number,
  oldZ: number,
  newX: number,
  newZ: number,
): boolean {
  for (const city of Object.values(CITIES)) {
    const oldRx = oldX - city.x;
    const oldRz = oldZ - city.z;
    const newRx = newX - city.x;
    const newRz = newZ - city.z;
    for (const line of [CITY_WALL_HALF, -CITY_WALL_HALF]) {
      if ((oldRx - line) * (newRx - line) < 0 && newRx !== oldRx) {
        const t = (line - oldRx) / (newRx - oldRx);
        const crossingZ = oldRz + (newRz - oldRz) * t;
        if (Math.abs(crossingZ) < CITY_WALL_HALF && Math.abs(crossingZ) > CITY_GATE_HALF) return true;
      }
      if ((oldRz - line) * (newRz - line) < 0 && newRz !== oldRz) {
        const t = (line - oldRz) / (newRz - oldRz);
        const crossingX = oldRx + (newRx - oldRx) * t;
        if (Math.abs(crossingX) < CITY_WALL_HALF && Math.abs(crossingX) > CITY_GATE_HALF) return true;
      }
    }
  }
  return false;
}
