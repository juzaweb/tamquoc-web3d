import assert from "node:assert/strict";
import test from "node:test";
import type { Server } from "socket.io";
import { GameWorld } from "../src/game/world.js";
import type { RuntimeMonster, RuntimePlayer } from "../src/game/types.js";

interface Emitted {
  event: string;
  payload: unknown;
}

function createHarness() {
  const emitted: Emitted[] = [];
  const io = {
    to: () => ({
      emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
    }),
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
  } as unknown as Server;
  return { world: new GameWorld(io), emitted };
}

function fakePlayer(overrides: Partial<RuntimePlayer> = {}): RuntimePlayer {
  return {
    socketId: "p1",
    userId: "u1",
    characterId: "c1",
    name: "Tester",
    sect: "WUDANG",
    faction: "HAN",
    gender: "MALE",
    appearance: {},
    level: 10,
    xp: 0,
    gold: 500,
    hp: 500,
    mp: 200,
    stats: {
      maxHp: 500,
      maxMp: 200,
      attack: 50,
      defense: 20,
      moveSpeed: 5,
      strength: 15,
      speed: 15,
      intelligence: 15,
    },
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    pvpEnabled: false,
    items: [],
    quests: [],
    dead: false,
    respawnAt: 0,
    lastMoveAt: 0,
    lastAttackAt: 0,
    lastSkillAt: 0,
    skillCooldowns: {},
    stunnedUntil: 0,
    buffUntil: 0,
    buffDefense: 0,
    lastCombatAt: 0,
    lastChatAt: 0,
    dirty: false,
    ...overrides,
  };
}

function fakeMonster(overrides: Partial<RuntimeMonster> = {}): RuntimeMonster {
  return {
    id: "m1",
    templateId: "wolf",
    name: "Sói Rừng",
    level: 5,
    hp: 100,
    maxHp: 100,
    attack: 15,
    defense: 5,
    speed: 4,
    aggroRange: 10,
    attackRange: 2,
    attackCooldownMs: 1500,
    xp: 20,
    gold: 10,
    isBoss: false,
    x: 0,
    y: 0,
    z: 5,
    rotation: 0,
    spawnX: 0,
    spawnZ: 5,
    areaRadius: 5,
    targetPlayerId: null,
    lastAttackAt: 0,
    dead: false,
    respawnAt: 0,
    wanderAt: 0,
    wanderTarget: null,
    poisonUntil: 0,
    poisonDamage: 0,
    poisonTickAt: 0,
    poisonSourceId: null,
    stunnedUntil: 0,
    slowUntil: 0,
    ...overrides,
  };
}

test("useSkill without targetId hits monster in front of attacker", async () => {
  const { world } = createHarness();
  const player = fakePlayer({ x: 0, z: 0, rotation: 0 });
  const monsterInFront = fakeMonster({ id: "m_front", x: 0, z: 5, hp: 100, maxHp: 100 });
  const monsterBehind = fakeMonster({ id: "m_behind", x: 0, z: -5, hp: 100, maxHp: 100 });

  const playersMap = (world as unknown as { players: Map<string, RuntimePlayer> }).players;
  const monstersMap = (world as unknown as { monsters: Map<string, RuntimeMonster> }).monsters;

  monstersMap.clear();
  playersMap.set(player.socketId, player);
  monstersMap.set(monsterInFront.id, monsterInFront);
  monstersMap.set(monsterBehind.id, monsterBehind);

  await world.useSkill(player.socketId, "Q", null, "monster");

  assert.ok(monsterInFront.hp < 100, "Monster in front should take damage from skill");
  assert.equal(monsterBehind.hp, 100, "Monster behind should not take damage from forward skill");
});

test("useSkill without targetId rotates skill direction with player rotation", async () => {
  const { world } = createHarness();
  const player = fakePlayer({ x: 0, z: 0, rotation: Math.PI });
  const monsterAtNegativeZ = fakeMonster({ id: "m_neg_z", x: 0, z: -5, hp: 100, maxHp: 100 });
  const monsterAtPositiveZ = fakeMonster({ id: "m_pos_z", x: 0, z: 5, hp: 100, maxHp: 100 });

  const playersMap = (world as unknown as { players: Map<string, RuntimePlayer> }).players;
  const monstersMap = (world as unknown as { monsters: Map<string, RuntimeMonster> }).monsters;

  monstersMap.clear();
  playersMap.set(player.socketId, player);
  monstersMap.set(monsterAtNegativeZ.id, monsterAtNegativeZ);
  monstersMap.set(monsterAtPositiveZ.id, monsterAtPositiveZ);

  await world.useSkill(player.socketId, "Q", null, "monster");

  assert.ok(monsterAtNegativeZ.hp < 100, "Monster at -Z should take damage when facing -Z");
  assert.equal(monsterAtPositiveZ.hp, 100, "Monster at +Z should not take damage when facing -Z");
});

test("basicAttack does not require MP and does not reduce MP", async () => {
  const { world } = createHarness();
  const player = fakePlayer({ x: 0, z: 0, rotation: 0, mp: 0 });
  const monster = fakeMonster({ id: "m1", x: 0, z: 2, hp: 100, maxHp: 100 });

  const playersMap = (world as unknown as { players: Map<string, RuntimePlayer> }).players;
  const monstersMap = (world as unknown as { monsters: Map<string, RuntimeMonster> }).monsters;

  monstersMap.clear();
  playersMap.set(player.socketId, player);
  monstersMap.set(monster.id, monster);

  await world.basicAttack(player.socketId, monster.id, "monster");

  assert.ok(monster.hp < 100, "Monster should take damage from basic attack with 0 MP");
  assert.equal(player.mp, 0, "Player MP should remain 0 after basic attack");
});

test("basicAttack without targetId hits facing monster in range", async () => {
  const { world } = createHarness();
  const player = fakePlayer({ x: 0, z: 0, rotation: 0, mp: 0 });
  const monsterInFront = fakeMonster({ id: "m_front", x: 0, z: 2, hp: 100, maxHp: 100 });
  const monsterBehind = fakeMonster({ id: "m_behind", x: 0, z: -2, hp: 100, maxHp: 100 });

  const playersMap = (world as unknown as { players: Map<string, RuntimePlayer> }).players;
  const monstersMap = (world as unknown as { monsters: Map<string, RuntimeMonster> }).monsters;

  monstersMap.clear();
  playersMap.set(player.socketId, player);
  monstersMap.set(monsterInFront.id, monsterInFront);
  monstersMap.set(monsterBehind.id, monsterBehind);

  await world.basicAttack(player.socketId, null, "monster");

  assert.ok(monsterInFront.hp < 100, "Monster in front should take damage from untargeted basic attack");
  assert.equal(monsterBehind.hp, 100, "Monster behind should not take damage from untargeted basic attack");
});
