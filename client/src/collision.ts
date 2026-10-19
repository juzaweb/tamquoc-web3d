import type { WorldInfo } from "./types";

export function crossesCityWall(
  world: WorldInfo,
  oldX: number,
  oldZ: number,
  newX: number,
  newZ: number,
): boolean {
  for (const city of world.cities) {
    const oldRx = oldX - city.x;
    const oldRz = oldZ - city.z;
    const newRx = newX - city.x;
    const newRz = newZ - city.z;
    for (const line of [world.wallHalf, -world.wallHalf]) {
      if ((oldRx - line) * (newRx - line) < 0 && newRx !== oldRx) {
        const t = (line - oldRx) / (newRx - oldRx);
        const crossingZ = oldRz + (newRz - oldRz) * t;
        if (Math.abs(crossingZ) < world.wallHalf && Math.abs(crossingZ) > world.gateHalf) return true;
      }
      if ((oldRz - line) * (newRz - line) < 0 && newRz !== oldRz) {
        const t = (line - oldRz) / (newRz - oldRz);
        const crossingX = oldRx + (newRx - oldRx) * t;
        if (Math.abs(crossingX) < world.wallHalf && Math.abs(crossingX) > world.gateHalf) return true;
      }
    }
  }
  return false;
}
