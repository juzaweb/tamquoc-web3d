import assert from "node:assert/strict";
import test from "node:test";
import {
  applyExperience,
  clampPosition,
  computeStats,
  rollDamage,
  xpToNextLevel,
} from "../src/game/stats.js";

test("xpToNextLevel caps at level 100", () => {
  assert.equal(xpToNextLevel(1), 120);
  assert.equal(xpToNextLevel(2), 230);
  assert.equal(xpToNextLevel(99), 10900);
  assert.equal(xpToNextLevel(100), 0);
  assert.equal(xpToNextLevel(120), 0);
});

test("applyExperience levels up and stops at 100", () => {
  assert.deepEqual(applyExperience(1, 130), { level: 2, xp: 10, leveled: true });
  assert.deepEqual(applyExperience(1, 119), { level: 1, xp: 119, leveled: false });
  const capped = applyExperience(99, 999_999_999);
  assert.equal(capped.level, 100);
  assert.equal(capped.xp, 0);
  assert.deepEqual(applyExperience(100, 500), { level: 100, xp: 0, leveled: false });
});

test("computeStats grows with level and equipment", () => {
  const base = computeStats(1, "SHAOLIN", []);
  const leveled = computeStats(10, "SHAOLIN", []);
  const geared = computeStats(1, "SHAOLIN", [
    { id: "1", templateId: "weapon_shaolin_fist", quantity: 1, slot: "weapon" },
    { id: "2", templateId: "armor_cloth", quantity: 1, slot: "armor" },
  ]);

  assert.ok(leveled.maxHp > base.maxHp);
  assert.ok(leveled.attack > base.attack);
  assert.ok(geared.attack > base.attack);
  assert.ok(geared.defense > base.defense);
  assert.ok(geared.maxHp > base.maxHp);
});

test("computeStats only applies equipped items", () => {
  const loose = computeStats(1, "WUDANG", [
    { id: "1", templateId: "weapon_wudang_sword", quantity: 1, slot: null },
  ]);
  const equipped = computeStats(1, "WUDANG", [
    { id: "1", templateId: "weapon_wudang_sword", quantity: 1, slot: "weapon" },
  ]);
  assert.ok(equipped.attack > loose.attack);
});

test("clampPosition keeps entities inside the world radius", () => {
  assert.deepEqual(clampPosition(5, -5, 10), { x: 5, z: -5 });
  const clamped = clampPosition(100, 0, 10);
  assert.equal(clamped.x, 10);
  assert.equal(clamped.z, 0);
  const diagonal = clampPosition(100, 100, 10);
  assert.ok(Math.hypot(diagonal.x, diagonal.z) <= 10.000001);
});

test("rollDamage always deals at least one damage", () => {
  for (let i = 0; i < 200; i += 1) {
    const { damage, crit } = rollDamage(1, 500, 1);
    assert.ok(damage >= 1);
    assert.equal(typeof crit, "boolean");
  }
});
