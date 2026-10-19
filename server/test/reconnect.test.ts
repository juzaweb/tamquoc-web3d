import assert from "node:assert/strict";
import test from "node:test";
import type { Server } from "socket.io";
import { GameWorld } from "../src/game/world.js";
import type { RuntimePlayer } from "../src/game/types.js";

interface Emitted {
  room: string;
  event: string;
  payload: unknown;
}

function createHarness() {
  const emitted: Emitted[] = [];
  const sockets = new Map<string, { emit: (event: string, payload: unknown) => void; disconnect: () => void }>();
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }),
    }),
    sockets: { sockets },
  } as unknown as Server;
  return { world: new GameWorld(io), emitted, sockets };
}

function fakePlayer(overrides: Partial<RuntimePlayer> = {}): RuntimePlayer {
  return {
    socketId: "old-socket",
    userId: "user-1",
    characterId: "character-1",
    name: "Tester",
    sect: "SHAOLIN",
    faction: "HAN",
    gender: "MALE",
    appearance: {},
    level: 1,
    xp: 0,
    gold: 500,
    hp: 90,
    mp: 40,
    stats: {
      maxHp: 100,
      maxMp: 50,
      attack: 10,
      defense: 5,
      moveSpeed: 5,
      strength: 10,
      speed: 8,
      intelligence: 6,
    },
    x: 3,
    y: 0,
    z: 4,
    rotation: 0,
    pvpEnabled: false,
    items: [],
    quests: [],
    dead: false,
    respawnAt: 0,
    lastMoveAt: 0,
    lastAttackAt: 0,
    lastSkillAt: 0,
    lastCombatAt: 0,
    lastChatAt: 0,
    dirty: false,
    ...overrides,
  };
}

function attachPlayer(world: GameWorld, player: RuntimePlayer) {
  (world as unknown as { players: Map<string, RuntimePlayer> }).players.set(player.socketId, player);
}

test("a reconnect takes over the live character and keeps its state", async () => {
  const { world, emitted, sockets } = createHarness();
  const player = fakePlayer();
  attachPlayer(world, player);
  let disconnected = false;
  sockets.set("old-socket", {
    emit: () => {},
    disconnect: () => {
      disconnected = true;
    },
  });

  const result = await world.enter("new-socket", "user-1", "character-1");

  assert.equal(result, player);
  assert.equal(player.socketId, "new-socket");
  assert.equal(world.getPlayer("new-socket"), player);
  assert.equal(world.getPlayer("old-socket"), undefined);
  assert.equal(player.hp, 90);
  assert.equal(player.x, 3);
  assert.equal(disconnected, true);
  assert.ok(emitted.some((entry) => entry.room === "new-socket" && entry.event === "world:init"));
});

test("a reconnect waits for a pending leave save before re-entering", async () => {
  const { world } = createHarness();
  const player = fakePlayer();
  attachPlayer(world, player);
  let finishSave: () => void = () => {};
  const pendingSave = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  (world as unknown as { pendingLeaves: Map<string, Promise<void>> })
    .pendingLeaves.set("character-1", pendingSave);

  const reconnect = world.enter("new-socket", "user-1", "character-1");
  let finished = false;
  void reconnect.then(() => {
    finished = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(finished, false);

  finishSave();
  await reconnect;
  assert.equal(world.getPlayer("new-socket"), player);
});

test("a different account cannot take over an active character", async () => {
  const { world } = createHarness();
  attachPlayer(world, fakePlayer());

  await assert.rejects(
    world.enter("intruder-socket", "user-2", "character-1"),
    /đang được điều khiển/,
  );
  assert.equal(world.getPlayer("intruder-socket"), undefined);
});
