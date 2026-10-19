import assert from "node:assert/strict";
import test from "node:test";
import {
  CITIES,
  CITY_SAFE_RADIUS,
  CITY_WALL_HALF,
  GATE_DIRECTIONS,
  GATE_FARMS,
  ITEMS,
  MAX_LEVEL,
  MONSTERS,
  MONSTER_SPAWNS,
  MONSTER_ZONES,
  NPCS,
  QUESTS,
  SECTS,
  SPAWN_POINTS,
  STARTER_ITEMS,
  WORLD_RADIUS,
  cityGatePosition,
  gatePosition,
} from "../src/game/content.js";

function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

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

test("main gate positions match the city wall sides", () => {
  assert.deepEqual(gatePosition(CITIES.HAN, "NORTH"), { x: 0, z: -52 });
  assert.deepEqual(gatePosition(CITIES.SHU, "EAST"), { x: -52, z: 30 });
  assert.deepEqual(gatePosition(CITIES.WEI, "WEST"), { x: 52, z: 30 });
});

test("monsters live in one dedicated zone at each non-main gate", () => {
  for (const faction of ["HAN", "SHU", "WEI"] as const) {
    const city = CITIES[faction];
    const farms = GATE_FARMS[faction];
    assert.equal(farms.length, 3);
    assert.equal(new Set(farms.map((farm) => farm.gate)).size, 3);
    assert.ok(!farms.some((farm) => farm.gate === city.mainGate));

    for (const gate of GATE_DIRECTIONS) {
      if (gate === city.mainGate) {
        assert.ok(!MONSTER_ZONES.some((zone) => zone.city === faction && zone.gate === gate));
        continue;
      }
      const farm = farms.find((entry) => entry.gate === gate);
      assert.ok(farm, `missing farm at ${gate} of ${city.name}`);
      const zone = MONSTER_ZONES.find((entry) => entry.city === faction && entry.gate === gate);
      assert.ok(zone, `missing zone at ${gate} of ${city.name}`);
      assert.equal(zone.monsterId, farm.monsterId);

      const gatePoint = gatePosition(city, gate);
      const cross = (zone.x - city.x) * (gatePoint.z - city.z) - (zone.z - city.z) * (gatePoint.x - city.x);
      assert.ok(Math.abs(cross) < 1e-9, `${zone.name} is not aligned with its gate`);
      assert.ok(
        Math.hypot(zone.x - city.x, zone.z - city.z) > Math.hypot(gatePoint.x - city.x, gatePoint.z - city.z),
        `${zone.name} is not outside its gate`,
      );

      const spawns = MONSTER_SPAWNS.filter(
        (spawn) => Math.hypot(spawn.x - zone.x, spawn.z - zone.z) <= zone.radius,
      );
      assert.ok(spawns.length > 0, `missing spawns at ${gate} of ${city.name}`);
      for (const spawn of spawns) {
        assert.equal(spawn.monsterId, zone.monsterId);
        assert.ok(
          Math.hypot(spawn.x - zone.x, spawn.z - zone.z) + spawn.areaRadius <= zone.radius + 0.01,
          `spawn wanders outside ${zone.name}`,
        );
      }
    }
  }
});

test("monster zones do not overlap", () => {
  for (let i = 0; i < MONSTER_ZONES.length; i += 1) {
    for (let j = i + 1; j < MONSTER_ZONES.length; j += 1) {
      const a = MONSTER_ZONES[i]!;
      const b = MONSTER_ZONES[j]!;
      assert.ok(
        Math.hypot(a.x - b.x, a.z - b.z) >= a.radius + b.radius,
        `${a.name} overlaps ${b.name}`,
      );
    }
  }
});

test("main gate routes to the battlefield stay clear of monster spawns", () => {
  for (const city of Object.values(CITIES)) {
    const gate = cityGatePosition(city);
    for (const spawn of MONSTER_SPAWNS) {
      assert.ok(
        segmentDistance(spawn.x, spawn.z, gate.x, gate.z, 0, 0) > 20,
        `${spawn.monsterId} near the main gate route of ${city.name}`,
      );
      assert.ok(Math.abs(spawn.x) <= WORLD_RADIUS && Math.abs(spawn.z) <= WORLD_RADIUS);
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
