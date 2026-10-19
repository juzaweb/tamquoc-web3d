import assert from "node:assert/strict";
import test from "node:test";
import { CITIES, CITY_WALL_HALF } from "../src/game/content.js";
import { crossesCityWall } from "../src/game/movement.js";

const shu = CITIES.SHU;
const inner = CITY_WALL_HALF - 4;
const outer = CITY_WALL_HALF + 4;

test("city walls block movement outside gate openings", () => {
  assert.equal(crossesCityWall(shu.x + inner, shu.z + 10, shu.x + outer, shu.z + 10), true);
  assert.equal(crossesCityWall(shu.x - inner, shu.z + 10, shu.x - outer, shu.z + 10), true);
  assert.equal(crossesCityWall(shu.x + 10, shu.z + inner, shu.x + 10, shu.z + outer), true);
  assert.equal(crossesCityWall(shu.x + 10, shu.z - inner, shu.x + 10, shu.z - outer), true);
});

test("players can pass through the four gate openings", () => {
  assert.equal(crossesCityWall(shu.x + inner, shu.z, shu.x + outer, shu.z), false);
  assert.equal(crossesCityWall(shu.x - inner, shu.z, shu.x - outer, shu.z), false);
  assert.equal(crossesCityWall(shu.x, shu.z + inner, shu.x, shu.z + outer), false);
  assert.equal(crossesCityWall(shu.x, shu.z - inner, shu.x, shu.z - outer), false);
});

test("movement away from walls is never blocked", () => {
  assert.equal(crossesCityWall(0, 0, 5, 5), false);
  assert.equal(crossesCityWall(-50, 0, -45, 5), false);
});
