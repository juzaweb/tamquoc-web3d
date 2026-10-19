import type { Server } from "socket.io";
import { config } from "../config.js";
import {
  BOSS_INTERVAL_MS,
  BOSS_SPAWN,
  CITIES,
  CITY_SAFE_RADIUS,
  FACTIONS,
  GATE_PK_INNER_RADIUS,
  GATE_PK_RADIUS,
  ITEMS,
  MONSTERS,
  MONSTER_SPAWNS,
  NPCS,
  QUESTS,
  SECTS,
  SPAWN_POINTS,
  SPAWN_POINT,
  WORLD_RADIUS,
  cityGatePosition,
} from "./content.js";
import {
  addItemToInventory,
  loadCharacterWithItems,
  removeItemQuantity,
  savePlayer,
  selfDto,
  setItemSlot,
  toRuntimePlayer,
} from "./persistence.js";
import { crossesCityWall } from "./movement.js";
import { resolvePurchase } from "./shop.js";
import { applyExperience, clampPosition, computeStats, rollDamage } from "./stats.js";
import type {
  CombatEvent,
  MonsterSnapshot,
  PlayerSnapshot,
  RuntimeMonster,
  RuntimePlayer,
  WorldSnapshot,
} from "./types.js";

const BASIC_RANGE = 3.4;
const BASIC_COOLDOWN_MS = 800;
const CHAT_COOLDOWN_MS = 800;

function freshMonster(id: string, monsterId: string, x: number, z: number, areaRadius: number): RuntimeMonster {
  const template = MONSTERS[monsterId];
  if (!template) throw new Error(`Unknown monster template ${monsterId}`);
  return {
    id,
    templateId: template.id,
    name: template.name,
    level: template.level,
    hp: template.hp,
    maxHp: template.hp,
    attack: template.attack,
    defense: template.defense,
    speed: template.speed,
    aggroRange: template.aggroRange,
    attackRange: template.attackRange,
    attackCooldownMs: template.attackCooldownMs,
    xp: template.xp,
    gold: template.gold,
    isBoss: Boolean(template.isBoss),
    x,
    y: 0,
    z,
    rotation: 0,
    spawnX: x,
    spawnZ: z,
    areaRadius,
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
  };
}

export class GameWorld {
  private readonly players = new Map<string, RuntimePlayer>();
  private readonly monsters = new Map<string, RuntimeMonster>();
  private readonly activeCharacters = new Set<string>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private lastTickAt = Date.now();
  private nextBossAt = Date.now() + 60_000;
  private monsterSeq = 0;
  private lastSaveAt = Date.now();

  constructor(private readonly io: Server) {
    this.spawnInitialMonsters();
  }

  private spawnInitialMonsters() {
    for (const spawn of MONSTER_SPAWNS) {
      const id = `m_${++this.monsterSeq}`;
      this.monsters.set(id, freshMonster(id, spawn.monsterId, spawn.x, spawn.z, spawn.areaRadius));
    }
  }

  start() {
    if (this.tickTimer) return;
    this.lastTickAt = Date.now();
    this.tickTimer = setInterval(() => this.runTick(), config.tickRateMs);
    this.saveTimer = setInterval(() => void this.saveAll(), config.saveIntervalMs);
  }

  stop() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.tickTimer = null;
    this.saveTimer = null;
  }

  private runTick() {
    const now = Date.now();
    const dt = Math.min(0.5, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;
    this.tick += 1;

    this.updateMonsters(now, dt);
    this.updatePlayers(now, dt);
    this.updateBoss(now);

    this.io.emit("world:state", this.snapshot(now));
  }

  private updateBoss(now: number) {
    if (now < this.nextBossAt) return;
    const bossAlive = [...this.monsters.values()].some((monster) => monster.isBoss && !monster.dead);
    if (bossAlive) {
      this.nextBossAt = now + 60_000;
      return;
    }
    const id = `boss_${++this.monsterSeq}`;
    const boss = freshMonster(id, BOSS_SPAWN.monsterId, BOSS_SPAWN.x, BOSS_SPAWN.z, 18);
    this.monsters.set(id, boss);
    this.nextBossAt = now + BOSS_INTERVAL_MS;
    this.io.emit("boss:spawn", {
      id: boss.id,
      name: boss.name,
      message: `${boss.name} đã xuất hiện tại Chiến Trường Trung Nguyên!`,
    });
    this.systemChat(`${boss.name} đã xuất hiện tại Chiến Trường Trung Nguyên!`);
  }

  private updatePlayers(now: number, dt: number) {
    for (const player of this.players.values()) {
      if (player.dead) {
        if (now >= player.respawnAt) this.respawnPlayer(player);
        continue;
      }
      if (now - player.lastCombatAt > 5000) {
        const nextHp = Math.min(player.stats.maxHp, player.hp + player.stats.maxHp * 0.02 * dt);
        const nextMp = Math.min(player.stats.maxMp, player.mp + player.stats.maxMp * 0.025 * dt);
        if (nextHp !== player.hp || nextMp !== player.mp) {
          player.hp = Math.round(nextHp);
          player.mp = Math.round(nextMp);
          player.dirty = true;
        }
      }
    }
  }

  private respawnPlayer(player: RuntimePlayer) {
    player.dead = false;
    player.hp = Math.round(player.stats.maxHp * 0.6);
    player.mp = Math.round(player.stats.maxMp * 0.5);
    const spawn = SPAWN_POINTS[player.faction] ?? SPAWN_POINT;
    player.x = spawn.x;
    player.z = spawn.z;
    player.dirty = true;
    this.emitSelf(player);
    this.io.to(player.socketId).emit("notification", {
      kind: "info",
      message: "Bạn đã hồi sinh tại cổng thành.",
    });
  }

  private updateMonsters(now: number, dt: number) {
    for (const [id, monster] of this.monsters) {
      if (monster.dead) {
        if (monster.isBoss) {
          this.monsters.delete(id);
          continue;
        }
        if (now >= monster.respawnAt) {
          monster.dead = false;
          monster.hp = monster.maxHp;
          monster.targetPlayerId = null;
          monster.x = monster.spawnX + (Math.random() - 0.5) * monster.areaRadius;
          monster.z = monster.spawnZ + (Math.random() - 0.5) * monster.areaRadius;
        }
        continue;
      }

      if (now < monster.poisonUntil && now >= monster.poisonTickAt && monster.poisonSourceId) {
        monster.poisonTickAt = now + 1000;
        const source = this.players.get(monster.poisonSourceId);
        if (source) {
          void this.damageMonster(source, monster, Math.max(1, Math.round(monster.poisonDamage)), true);
          if (monster.dead) continue;
        }
      }

      let target = monster.targetPlayerId ? this.players.get(monster.targetPlayerId) : undefined;
      if (
        !target ||
        target.dead ||
        this.inSafeZone(target) ||
        this.distance(monster, target) > monster.aggroRange * 1.8
      ) {
        target = this.nearestPlayer(monster.x, monster.z, monster.aggroRange);
        monster.targetPlayerId = target?.socketId ?? null;
      }

      if (target) {
        const dist = this.distance(monster, target);
        if (dist > monster.attackRange) {
          this.moveToward(monster, target.x, target.z, monster.speed * dt);
        } else if (now - monster.lastAttackAt >= monster.attackCooldownMs) {
          monster.lastAttackAt = now;
          this.monsterAttack(monster, target);
        }
        continue;
      }

      if (now >= monster.wanderAt) {
        monster.wanderAt = now + 3000 + Math.random() * 4000;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * monster.areaRadius;
        monster.wanderTarget = {
          x: monster.spawnX + Math.cos(angle) * radius,
          z: monster.spawnZ + Math.sin(angle) * radius,
        };
      }
      if (monster.wanderTarget) {
        const reached = this.moveToward(monster, monster.wanderTarget.x, monster.wanderTarget.z, monster.speed * 0.35 * dt);
        if (reached) monster.wanderTarget = null;
      }
    }
  }

  private monsterAttack(monster: RuntimeMonster, target: RuntimePlayer) {
    const { damage, crit } = rollDamage(monster.attack, target.stats.defense, monster.isBoss ? 1.2 : 1);
    target.hp = Math.max(0, target.hp - damage);
    target.lastCombatAt = Date.now();
    target.dirty = true;
    const killed = target.hp <= 0;
    const event: CombatEvent = {
      attackerId: monster.id,
      attackerName: monster.name,
      targetId: target.socketId,
      targetType: "player",
      targetName: target.name,
      damage,
      crit,
      skill: monster.isBoss,
      targetHp: target.hp,
      targetMaxHp: target.stats.maxHp,
      killed,
    };
    this.io.emit("combat:event", event);
    if (killed) this.killPlayer(target, monster.name);
  }

  private killPlayer(player: RuntimePlayer, killerName: string) {
    player.dead = true;
    player.hp = 0;
    player.respawnAt = Date.now() + 5000;
    player.pvpEnabled = false;
    this.emitSelf(player);
    this.io.to(player.socketId).emit("notification", {
      kind: "danger",
      message: `Bạn đã bị ${killerName} hạ gục. Hồi sinh sau 5 giây.`,
    });
    this.io.to(player.socketId).emit("player:died", { respawnInMs: 5000 });
  }

  private moveToward(entity: { x: number; z: number; rotation: number }, x: number, z: number, step: number): boolean {
    const dx = x - entity.x;
    const dz = z - entity.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= step || dist < 0.01) {
      entity.x = x;
      entity.z = z;
      return true;
    }
    entity.x += (dx / dist) * step;
    entity.z += (dz / dist) * step;
    entity.rotation = Math.atan2(dx, dz);
    return false;
  }

  private nearestPlayer(x: number, z: number, range: number): RuntimePlayer | undefined {
    let best: RuntimePlayer | undefined;
    let bestDist = range;
    for (const player of this.players.values()) {
      if (player.dead || this.inSafeZone(player)) continue;
      const dist = Math.hypot(player.x - x, player.z - z);
      if (dist <= bestDist) {
        best = player;
        bestDist = dist;
      }
    }
    return best;
  }

  private distance(a: { x: number; z: number }, b: { x: number; z: number }) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  private inSafeZone(player: { x: number; z: number }): boolean {
    return Object.values(CITIES).some(
      (city) => Math.hypot(player.x - city.x, player.z - city.z) < CITY_SAFE_RADIUS,
    );
  }

  private maybeEnableGatePvp(player: RuntimePlayer) {
    if (player.pvpEnabled) return;
    for (const city of Object.values(CITIES)) {
      const gate = cityGatePosition(city);
      const distToGate = Math.hypot(player.x - gate.x, player.z - gate.z);
      const distToCity = Math.hypot(player.x - city.x, player.z - city.z);
      if (distToGate < GATE_PK_RADIUS && distToCity > GATE_PK_INNER_RADIUS) {
        player.pvpEnabled = true;
        player.dirty = true;
        this.emitSelf(player);
        this.io.to(player.socketId).emit("notification", {
          kind: "danger",
          message: "Bạn đã qua cổng chính ra chiến trường. PK tự động bật với 2 phe còn lại.",
        });
        return;
      }
    }
  }

  async enter(socketId: string, userId: string, characterId: string): Promise<RuntimePlayer> {
    const existing = this.players.get(socketId);
    if (existing && existing.characterId === characterId) {
      this.io.to(socketId).emit("world:init", {
        self: selfDto(existing),
        world: this.snapshot(Date.now()),
      });
      return existing;
    }
    if (existing) await this.leave(socketId);
    if (this.activeCharacters.has(characterId)) {
      throw new Error("Nhân vật đang được điều khiển ở một phiên khác.");
    }

    this.activeCharacters.add(characterId);
    try {
      const character = await loadCharacterWithItems(characterId, userId);
      if (!character) throw new Error("Nhân vật không tồn tại hoặc không thuộc về bạn.");

      const player = toRuntimePlayer(socketId, character);
      this.players.set(socketId, player);
      this.emitSelf(player);
      this.io.to(socketId).emit("world:init", {
        self: selfDto(player),
        world: this.snapshot(Date.now()),
      });
      this.io.to(socketId).emit("notification", {
        kind: "success",
        message: `Chào mừng ${player.name} đến với Tam Quốc Online!`,
      });
      this.systemChat(`${player.name} (${FACTIONS[player.faction].name}) đã gia nhập thế giới.`);
      return player;
    } catch (error) {
      this.activeCharacters.delete(characterId);
      throw error;
    }
  }

  async leave(socketId: string) {
    const player = this.players.get(socketId);
    if (!player) return;
    this.players.delete(socketId);
    this.activeCharacters.delete(player.characterId);
    try {
      await savePlayer(player);
    } catch (error) {
      console.error("Failed to save player on leave", error);
    }
    this.systemChat(`${player.name} đã rời khỏi thế giới.`);
  }

  getPlayer(socketId: string): RuntimePlayer | undefined {
    return this.players.get(socketId);
  }

  move(socketId: string, x: number, z: number, rotation: number) {
    const player = this.players.get(socketId);
    if (!player || player.dead || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const now = Date.now();
    const elapsed = Math.max(0.05, (now - player.lastMoveAt) / 1000);
    const clamped = clampPosition(x, z, WORLD_RADIUS);
    const dx = clamped.x - player.x;
    const dz = clamped.z - player.z;
    const distance = Math.hypot(dx, dz);
    const maxDistance = player.stats.moveSpeed * Math.min(elapsed, 0.35) + 1.5;
    let nextX = clamped.x;
    let nextZ = clamped.z;
    if (distance > maxDistance) {
      const scale = maxDistance / distance;
      nextX = player.x + dx * scale;
      nextZ = player.z + dz * scale;
    }
    player.lastMoveAt = now;
    if (crossesCityWall(player.x, player.z, nextX, nextZ)) return;
    player.x = nextX;
    player.z = nextZ;
    if (Number.isFinite(rotation)) player.rotation = rotation;
    player.dirty = true;
    this.maybeEnableGatePvp(player);
  }

  async basicAttack(socketId: string, targetId: string, targetType: "monster" | "player") {
    const attacker = this.players.get(socketId);
    if (!attacker || attacker.dead) return;
    const now = Date.now();
    if (now - attacker.lastAttackAt < BASIC_COOLDOWN_MS) return;
    attacker.lastAttackAt = now;
    attacker.lastCombatAt = now;

    if (targetType === "monster") {
      const monster = this.monsters.get(targetId);
      if (!monster || monster.dead) return this.error(socketId, "Mục tiêu không còn tồn tại.");
      if (this.distance(attacker, monster) > BASIC_RANGE) return this.error(socketId, "Mục tiêu quá xa.");
      const { damage, crit } = rollDamage(attacker.stats.attack, monster.defense, 1);
      await this.damageMonster(attacker, monster, damage, false, 1, crit);
      return;
    }

    const target = this.players.get(targetId);
    if (!target || target.dead || target.socketId === socketId) return this.error(socketId, "Mục tiêu không hợp lệ.");
    if (!attacker.pvpEnabled) return this.error(socketId, "Bật PvP trước khi tấn công người chơi khác.");
    if (target.faction === attacker.faction) return this.error(socketId, "Không thể tấn công người cùng phe.");
    if (this.inSafeZone(attacker) || this.inSafeZone(target)) {
      return this.error(socketId, "Không thể giao chiến trong khu vực an toàn của thành.");
    }
    if (this.distance(attacker, target) > BASIC_RANGE) return this.error(socketId, "Mục tiêu quá xa.");
    const { damage, crit } = rollDamage(attacker.stats.attack, target.stats.defense, 1);
    this.damagePlayer(attacker, target, damage, false, crit);
  }

  async useSkill(socketId: string, targetId: string | null, targetType: "monster" | "player") {
    const attacker = this.players.get(socketId);
    if (!attacker || attacker.dead) return;
    const sect = SECTS[attacker.sect];
    const skill = sect.skill;
    const now = Date.now();
    if (now - attacker.lastSkillAt < skill.cooldownMs) return;
    if (attacker.mp < skill.mpCost) return this.error(socketId, "Không đủ nội lực.");
    if (!targetId && skill.type !== "MELEE") return this.error(socketId, "Cần chọn mục tiêu.");

    const applyToMonster = async (monster: RuntimeMonster) => {
      if (monster.dead) return;
      const { damage, crit } = rollDamage(attacker.stats.attack, monster.defense, skill.power);
      await this.damageMonster(attacker, monster, damage, true, skill.power, crit);
      if (skill.type === "POISON" && !monster.dead) {
        monster.poisonUntil = now + 5000;
        monster.poisonTickAt = now + 1000;
        monster.poisonDamage = Math.round(attacker.stats.attack * 0.22);
        monster.poisonSourceId = socketId;
      }
    };

    if (skill.type === "MELEE") {
      const targets = [...this.monsters.values()].filter(
        (monster) => !monster.dead && this.distance(attacker, monster) <= skill.range,
      );
      if (targets.length === 0) return this.error(socketId, "Không có mục tiêu trong tầm.");
      attacker.mp -= skill.mpCost;
      attacker.lastSkillAt = now;
      attacker.lastCombatAt = now;
      for (const monster of targets) await applyToMonster(monster);
      if (attacker.pvpEnabled) {
        for (const player of this.players.values()) {
          if (player.socketId === socketId || player.dead) continue;
          if (player.faction === attacker.faction) continue;
          if (this.distance(attacker, player) > skill.range) continue;
          if (this.inSafeZone(attacker) || this.inSafeZone(player)) continue;
          const { damage, crit } = rollDamage(attacker.stats.attack, player.stats.defense, skill.power);
          this.damagePlayer(attacker, player, damage, true, crit);
        }
      }
      this.emitSelf(attacker);
      return;
    }

    if (!targetId) return;
    if (targetType === "monster") {
      const monster = this.monsters.get(targetId);
      if (!monster || monster.dead || this.distance(attacker, monster) > skill.range) {
        return this.error(socketId, "Mục tiêu không hợp lệ hoặc ngoài tầm.");
      }
      attacker.mp -= skill.mpCost;
      attacker.lastSkillAt = now;
      attacker.lastCombatAt = now;
      await applyToMonster(monster);
      if (skill.type === "HEAL") {
        attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + Math.round(attacker.stats.maxHp * 0.18));
        this.io.emit("combat:event", {
          attackerId: attacker.socketId,
          attackerName: attacker.name,
          targetId: attacker.socketId,
          targetType: "player",
          targetName: attacker.name,
          damage: -Math.round(attacker.stats.maxHp * 0.18),
          crit: false,
          skill: true,
          targetHp: attacker.hp,
          targetMaxHp: attacker.stats.maxHp,
          killed: false,
        });
      }
      this.emitSelf(attacker);
      return;
    }

    const target = this.players.get(targetId);
    if (!target || target.dead || target.socketId === socketId) return this.error(socketId, "Mục tiêu không hợp lệ.");
    if (!attacker.pvpEnabled) return this.error(socketId, "Bật PvP trước khi tấn công người chơi khác.");
    if (target.faction === attacker.faction) return this.error(socketId, "Không thể tấn công người cùng phe.");
    if (this.inSafeZone(attacker) || this.inSafeZone(target)) {
      return this.error(socketId, "Không thể giao chiến trong khu vực an toàn của thành.");
    }
    if (this.distance(attacker, target) > skill.range) return this.error(socketId, "Mục tiêu quá xa.");
    attacker.mp -= skill.mpCost;
    attacker.lastSkillAt = now;
    attacker.lastCombatAt = now;
    const { damage, crit } = rollDamage(attacker.stats.attack, target.stats.defense, skill.power);
    this.damagePlayer(attacker, target, damage, true, crit);
    if (skill.type === "HEAL") {
      attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + Math.round(attacker.stats.maxHp * 0.18));
    }
    this.emitSelf(attacker);
  }

  private damagePlayer(
    attacker: RuntimePlayer,
    target: RuntimePlayer,
    damage: number,
    skill: boolean,
    crit: boolean,
  ) {
    target.hp = Math.max(0, target.hp - damage);
    target.lastCombatAt = Date.now();
    target.dirty = true;
    const killed = target.hp <= 0;
    const event: CombatEvent = {
      attackerId: attacker.socketId,
      attackerName: attacker.name,
      targetId: target.socketId,
      targetType: "player",
      targetName: target.name,
      damage,
      crit,
      skill,
      targetHp: target.hp,
      targetMaxHp: target.stats.maxHp,
      killed,
    };
    this.io.emit("combat:event", event);
    if (killed) {
      this.killPlayer(target, attacker.name);
      this.systemChat(`${attacker.name} đã hạ gục ${target.name} trong giao chiến.`);
    }
  }

  private async damageMonster(
    attacker: RuntimePlayer,
    monster: RuntimeMonster,
    damage: number,
    skill: boolean,
    power = 1,
    crit = false,
  ) {
    monster.hp = Math.max(0, monster.hp - damage);
    monster.targetPlayerId = attacker.socketId;
    attacker.lastCombatAt = Date.now();
    const killed = monster.hp <= 0;
    const event: CombatEvent = {
      attackerId: attacker.socketId,
      attackerName: attacker.name,
      targetId: monster.id,
      targetType: "monster",
      targetName: monster.name,
      damage,
      crit,
      skill,
      targetHp: monster.hp,
      targetMaxHp: monster.maxHp,
      killed,
    };
    this.io.emit("combat:event", event);
    if (killed) await this.killMonster(attacker, monster, power);
  }

  private async killMonster(attacker: RuntimePlayer, monster: RuntimeMonster, power: number) {
    monster.dead = true;
    monster.targetPlayerId = null;

    const xp = Math.round(monster.xp * (1 + (power - 1) * 0.2));
    attacker.xp += xp;
    attacker.gold += monster.gold;
    attacker.dirty = true;

    const looted: { templateId: string; name: string; quantity: number }[] = [];
    const template = MONSTERS[monster.templateId];
    if (template) {
      for (const drop of template.drops) {
        if (Math.random() > drop.chance) continue;
        const quantity = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
        const itemTemplate = ITEMS[drop.templateId];
        if (!itemTemplate) continue;
        await addItemToInventory(attacker, drop.templateId, quantity, Boolean(itemTemplate.stackable));
        looted.push({ templateId: drop.templateId, name: itemTemplate.name, quantity });
      }
    }

    this.io.to(attacker.socketId).emit("loot", { xp, gold: monster.gold, items: looted });
    this.progressQuests(attacker, monster.templateId);
    this.applyLevelUps(attacker);
    this.emitSelf(attacker);

    if (monster.isBoss) {
      this.systemChat(`${attacker.name} đã hạ gục ${monster.name}!`);
      this.nextBossAt = Date.now() + BOSS_INTERVAL_MS;
    } else {
      monster.respawnAt = Date.now() + 12_000;
    }
  }

  private progressQuests(player: RuntimePlayer, monsterId: string) {
    for (const quest of player.quests) {
      if (quest.status !== "ACTIVE") continue;
      const definition = QUESTS[quest.id];
      if (!definition || definition.objective.monsterId !== monsterId) continue;
      if (quest.progress >= definition.objective.count) continue;
      quest.progress += 1;
      if (quest.progress >= definition.objective.count) {
        this.io.to(player.socketId).emit("notification", {
          kind: "success",
          message: `Nhiệm vụ "${definition.name}" đã hoàn thành mục tiêu! Hãy trở về báo công.`,
        });
      }
    }
  }

  private applyLevelUps(player: RuntimePlayer) {
    const result = applyExperience(player.level, player.xp);
    player.level = result.level;
    player.xp = result.xp;
    if (!result.leveled) return;
    player.stats = computeStats(player.level, player.sect, player.items);
    player.hp = player.stats.maxHp;
    player.mp = player.stats.maxMp;
    this.io.to(player.socketId).emit("level:up", { level: player.level });
    this.io.to(player.socketId).emit("notification", {
      kind: "success",
      message: `Chúc mừng! Bạn đã đạt cấp ${player.level}.`,
    });
    this.systemChat(`${player.name} đã đạt cấp ${player.level}!`);
  }

  async equip(socketId: string, itemId: string) {
    const player = this.players.get(socketId);
    if (!player) return;
    const item = player.items.find((entry) => entry.id === itemId);
    if (!item) return this.error(socketId, "Vật phẩm không tồn tại.");
    const template = ITEMS[item.templateId];
    if (!template?.slot) return this.error(socketId, "Vật phẩm này không thể trang bị.");
    const current = player.items.find((entry) => entry.slot === template.slot);
    if (current) await setItemSlot(player, current.id, null);
    await setItemSlot(player, item.id, template.slot);
    this.recalculate(player);
    this.emitSelf(player);
  }

  async unequip(socketId: string, slot: string) {
    const player = this.players.get(socketId);
    if (!player) return;
    const item = player.items.find((entry) => entry.slot === slot);
    if (!item) return;
    await setItemSlot(player, item.id, null);
    this.recalculate(player);
    this.emitSelf(player);
  }

  private recalculate(player: RuntimePlayer) {
    const previousMaxHp = player.stats.maxHp;
    const previousMaxMp = player.stats.maxMp;
    player.stats = computeStats(player.level, player.sect, player.items);
    if (player.stats.maxHp > previousMaxHp) player.hp += player.stats.maxHp - previousMaxHp;
    if (player.stats.maxMp > previousMaxMp) player.mp += player.stats.maxMp - previousMaxMp;
    player.hp = Math.min(player.hp, player.stats.maxHp);
    player.mp = Math.min(player.mp, player.stats.maxMp);
    player.dirty = true;
  }

  async useItem(socketId: string, itemId: string) {
    const player = this.players.get(socketId);
    if (!player) return;
    const item = player.items.find((entry) => entry.id === itemId);
    if (!item) return;
    const template = ITEMS[item.templateId];
    if (!template || template.type !== "consumable") return this.error(socketId, "Không thể sử dụng vật phẩm này.");
    if (template.restoreHp) player.hp = Math.min(player.stats.maxHp, player.hp + template.restoreHp);
    if (template.restoreMp) player.mp = Math.min(player.stats.maxMp, player.mp + template.restoreMp);
    await removeItemQuantity(player, itemId, 1);
    player.dirty = true;
    this.emitSelf(player);
    this.io.to(socketId).emit("notification", { kind: "success", message: `Đã dùng ${template.name}.` });
  }

  async buyItem(socketId: string, npcId: string, templateId: string, quantity: number) {
    const player = this.players.get(socketId);
    if (!player) return;
    const npc = NPCS.find((entry) => entry.id === npcId);
    if (!npc) return this.error(socketId, "Thương nhân không tồn tại.");
    if (this.distance(player, npc) > npc.interactRadius) {
      return this.error(socketId, "Bạn cần đến gần thương nhân để mua hàng.");
    }
    const purchase = resolvePurchase(npc, templateId, quantity, player.gold);
    if (!purchase.ok) return this.error(socketId, purchase.message);
    const { template, amount, total } = purchase;
    player.gold -= total;
    try {
      await addItemToInventory(player, templateId, amount, Boolean(template.stackable));
    } catch (error) {
      player.gold += total;
      throw error;
    }
    player.dirty = true;
    this.emitSelf(player);
    this.io.to(socketId).emit("notification", {
      kind: "success",
      message: `Đã mua ${template.name} x${amount} (-${total} vàng).`,
    });
  }

  acceptQuest(socketId: string, questId: string) {
    const player = this.players.get(socketId);
    if (!player) return;
    const definition = QUESTS[questId];
    if (!definition) return this.error(socketId, "Nhiệm vụ không tồn tại.");
    if (player.level < definition.requiredLevel) {
      return this.error(socketId, `Cần đạt cấp ${definition.requiredLevel} để nhận nhiệm vụ này.`);
    }
    if (player.quests.some((quest) => quest.id === questId && quest.status === "ACTIVE")) return;
    const finished = player.quests.find((quest) => quest.id === questId && quest.status === "COMPLETED");
    if (finished) return this.error(socketId, "Bạn đã hoàn thành nhiệm vụ này rồi.");
    player.quests.push({ id: questId, status: "ACTIVE", progress: 0 });
    player.dirty = true;
    this.emitSelf(player);
    this.io.to(socketId).emit("notification", { kind: "info", message: `Đã nhận nhiệm vụ: ${definition.name}.` });
  }

  async completeQuest(socketId: string, questId: string) {
    const player = this.players.get(socketId);
    if (!player) return;
    const definition = QUESTS[questId];
    const quest = player.quests.find((entry) => entry.id === questId);
    if (!definition || !quest) return this.error(socketId, "Bạn chưa nhận nhiệm vụ này.");
    if (quest.status !== "ACTIVE") return this.error(socketId, "Nhiệm vụ đã được hoàn thành.");
    if (quest.progress < definition.objective.count) {
      return this.error(socketId, `Chưa đủ mục tiêu (${quest.progress}/${definition.objective.count}).`);
    }
    quest.status = "COMPLETED";
    player.xp += definition.rewards.xp;
    player.gold += definition.rewards.gold;
    const items: { templateId: string; name: string; quantity: number }[] = [];
    for (const reward of definition.rewards.items) {
      const template = ITEMS[reward.templateId];
      if (!template) continue;
      await addItemToInventory(player, reward.templateId, reward.quantity, Boolean(template.stackable));
      items.push({ templateId: reward.templateId, name: template.name, quantity: reward.quantity });
    }
    this.applyLevelUps(player);
    player.dirty = true;
    this.emitSelf(player);
    this.io.to(socketId).emit("loot", { xp: definition.rewards.xp, gold: definition.rewards.gold, items });
    this.io.to(socketId).emit("notification", {
      kind: "success",
      message: `Hoàn thành nhiệm vụ "${definition.name}"!`,
    });
  }

  togglePvp(socketId: string, enabled: boolean) {
    const player = this.players.get(socketId);
    if (!player) return;
    player.pvpEnabled = enabled;
    player.dirty = true;
    this.emitSelf(player);
    this.io.to(socketId).emit("notification", {
      kind: enabled ? "danger" : "info",
      message: enabled ? "Đã bật chế độ PvP. Bạn có thể tấn công người chơi khác." : "Đã tắt chế độ PvP.",
    });
  }

  chat(socketId: string, channel: string, message: string) {
    const player = this.players.get(socketId);
    if (!player) return;
    const now = Date.now();
    if (now - player.lastChatAt < CHAT_COOLDOWN_MS) {
      return this.error(socketId, "Bạn đang gửi tin nhắn quá nhanh.");
    }
    player.lastChatAt = now;
    const trimmed = message.trim().slice(0, 240);
    if (!trimmed) return;
    const payload = {
      channel: channel === "faction" ? "faction" : "global",
      from: player.name,
      faction: player.faction,
      message: trimmed,
      at: Date.now(),
      system: false,
    };
    if (payload.channel === "faction") {
      for (const other of this.players.values()) {
        if (other.faction === player.faction) this.io.to(other.socketId).emit("chat:message", payload);
      }
      return;
    }
    this.io.emit("chat:message", payload);
  }

  private systemChat(message: string) {
    this.io.emit("chat:message", {
      channel: "system",
      from: "Hệ thống",
      faction: null,
      message,
      at: Date.now(),
      system: true,
    });
  }

  private error(socketId: string, message: string) {
    this.io.to(socketId).emit("error:game", { message });
  }

  private emitSelf(player: RuntimePlayer) {
    this.io.to(player.socketId).emit("self:update", selfDto(player));
  }

  private snapshot(now: number): WorldSnapshot {
    const players: PlayerSnapshot[] = [];
    for (const player of this.players.values()) {
      players.push({
        id: player.socketId,
        name: player.name,
        sect: player.sect,
        faction: player.faction,
        gender: player.gender,
        appearance: player.appearance,
        level: player.level,
        hp: player.hp,
        maxHp: player.stats.maxHp,
        mp: player.mp,
        maxMp: player.stats.maxMp,
        x: player.x,
        y: player.y,
        z: player.z,
        rotation: player.rotation,
        pvpEnabled: player.pvpEnabled,
        dead: player.dead,
      });
    }
    const monsters: MonsterSnapshot[] = [];
    for (const monster of this.monsters.values()) {
      monsters.push({
        id: monster.id,
        templateId: monster.templateId,
        name: monster.name,
        level: monster.level,
        hp: monster.hp,
        maxHp: monster.maxHp,
        x: monster.x,
        y: monster.y,
        z: monster.z,
        rotation: monster.rotation,
        isBoss: monster.isBoss,
        dead: monster.dead,
      });
    }
    return {
      tick: this.tick,
      serverTime: now,
      players,
      monsters,
      bossActive: monsters.some((monster) => monster.isBoss && !monster.dead),
      nextBossAt: this.nextBossAt,
    };
  }

  private async saveAll() {
    const now = Date.now();
    if (now - this.lastSaveAt < config.saveIntervalMs - 100) return;
    this.lastSaveAt = now;
    await this.persistAll();
  }

  async persistAll() {
    for (const player of this.players.values()) {
      if (!player.dirty) continue;
      try {
        await savePlayer(player);
      } catch (error) {
        console.error(`Failed to persist ${player.name}`, error);
      }
    }
  }
}
