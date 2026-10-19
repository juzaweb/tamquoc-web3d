import assert from "node:assert/strict";
import test from "node:test";
import { CITIES } from "../src/game/content.js";
import { crossesCityWall } from "../src/game/movement.js";

const shu = CITIES.SHU;

test("city walls block movement outside gate openings", () => {
  assert.equal(crossesCityWall(shu.x + 16, shu.z + 10, shu.x + 20, shu.z + 10), true);
  assert.equal(crossesCityWall(shu.x - 16, shu.z + 10, shu.x - 20, shu.z + 10), true);
  assert.equal(crossesCityWall(shu.x + 10, shu.z + 16, shu.x + 10, shu.z + 20), true);
  assert.equal(crossesCityWall(shu.x + 10, shu.z - 16, shu.x + 10, shu.z - 20), true);
});

test("players can pass through the four gate openings", () => {
  assert.equal(crossesCityWall(shu.x + 16, shu.z, shu.x + 20, shu.z), false);
  assert.equal(crossesCityWall(shu.x - 16, shu.z, shu.x - 20, shu.z), false);
  assert.equal(crossesCityWall(shu.x, shu.z + 16, shu.x, shu.z + 20), false);
  assert.equal(crossesCityWall(shu.x, shu.z - 16, shu.x, shu.z - 20), false);
});

test("movement away from walls is never blocked", () => {
  assert.equal(crossesCityWall(0, 0, 5, 5), false);
  assert.equal(crossesCityWall(-50, 0, -45, 5), false);
});
