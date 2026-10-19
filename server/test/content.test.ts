import assert from "node:assert/strict";
import test from "node:test";
import {
  CITIES,
  CITY_SAFE_RADIUS,
  CITY_WALL_HALF,
  ITEMS,
  MAX_LEVEL,
  MONSTERS,
  MONSTER_SPAWNS,
  NPCS,
  QUESTS,
  SECTS,
  SPAWN_POINTS,
  STARTER_ITEMS,
} from "../src/game/content.js";

test("world has three faction cities and a safe spawn per faction", () => {
  assert.equal(Object.keys(CITIES).length, 3);
  for (const faction of ["HAN", "SHU", "WEI"] as const) {
    const city = CITIES[faction];
    const spawn = SPAWN_POINTS[faction];
    assert.equal(city.faction, faction);
    assert.ok(Math.hypot(spawn.x - city.x, spawn.z - city.z) < CITY_SAFE_RADIUS);
  }
});

test("all content references point to existing definitions", () => {
  for (const spawn of MONSTER_SPAWNS) {
    assert.ok(MONSTERS[spawn.monsterId], `missing monster ${spawn.monsterId}`);
  }
  for (const template of Object.values(MONSTERS)) {
    for (const drop of template.drops) {
      assert.ok(ITEMS[drop.templateId], `missing drop item ${drop.templateId}`);
    }
  }
  for (const quest of Object.values(QUESTS)) {
    assert.ok(MONSTERS[quest.objective.monsterId], `missing quest monster ${quest.objective.monsterId}`);
    assert.ok(quest.requiredLevel <= MAX_LEVEL);
    for (const reward of quest.rewards.items) {
      assert.ok(ITEMS[reward.templateId], `missing reward item ${reward.templateId}`);
    }
  }
  for (const faction of Object.keys(SECTS) as (keyof typeof SECTS)[]) {
    for (const itemId of STARTER_ITEMS[faction]) {
      assert.ok(ITEMS[itemId], `missing starter item ${itemId}`);
    }
  }
});

test("monster farms are outside city safe zones", () => {
  for (const spawn of MONSTER_SPAWNS) {
    for (const city of Object.values(CITIES)) {
      const distance = Math.hypot(spawn.x - city.x, spawn.z - city.z);
      assert.ok(distance > CITY_SAFE_RADIUS, `${spawn.monsterId} spawns inside ${city.name}`);
    }
  }
});

test("each city has a shop npc inside the walls selling potions", () => {
  for (const faction of ["HAN", "SHU", "WEI"] as const) {
    const city = CITIES[faction];
    const npc = NPCS.find((entry) => entry.faction === faction);
    assert.ok(npc, `missing shop npc for ${faction}`);
    assert.ok(Math.abs(npc.x - city.x) < CITY_WALL_HALF, `npc outside ${city.name}`);
    assert.ok(Math.abs(npc.z - city.z) < CITY_WALL_HALF, `npc outside ${city.name}`);
    const spawn = SPAWN_POINTS[faction];
    assert.ok(
      Math.hypot(spawn.x - npc.x, spawn.z - npc.z) > npc.interactRadius,
      `player starts within shop range in ${city.name}`,
    );
    const stockIds = npc.stock.map((entry) => entry.templateId);
    assert.ok(stockIds.includes("potion_hp"));
    assert.ok(stockIds.includes("potion_mp"));
    for (const entry of npc.stock) {
      assert.ok(ITEMS[entry.templateId], `missing shop item ${entry.templateId}`);
      assert.ok(entry.price > 0);
    }
  }
});

test("boss is flagged and higher level than regular monsters", () => {
  const boss = MONSTERS.black_dragon;
  assert.equal(boss?.isBoss, true);
  const highestRegular = Math.max(
    ...Object.values(MONSTERS).filter((monster) => !monster.isBoss).map((monster) => monster.level),
  );
  assert.ok((boss?.level ?? 0) > highestRegular);
});
