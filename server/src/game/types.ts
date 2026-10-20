import type { FactionId, Gender, SectId } from "./content.js";

export interface DerivedStats {
  maxHp: number;
  maxMp: number;
  attack: number;
  defense: number;
  moveSpeed: number;
  strength: number;
  speed: number;
  intelligence: number;
}

export interface RuntimeItem {
  id: string;
  templateId: string;
  quantity: number;
  slot: string | null;
}

export interface QuestProgress {
  id: string;
  status: "ACTIVE" | "COMPLETED";
  progress: number;
}

export interface RuntimePlayer {
  socketId: string;
  userId: string;
  characterId: string;
  name: string;
  sect: SectId;
  faction: FactionId;
  gender: Gender;
  appearance: { color?: string; hair?: string; height?: number };
  level: number;
  xp: number;
  gold: number;
  hp: number;
  mp: number;
  stats: DerivedStats;
  x: number;
  y: number;
  z: number;
  rotation: number;
  pvpEnabled: boolean;
  items: RuntimeItem[];
  quests: QuestProgress[];
  dead: boolean;
  respawnAt: number;
  lastMoveAt: number;
  lastAttackAt: number;
  lastSkillAt: number;
  skillCooldowns: Record<string, number>;
  stunnedUntil: number;
  buffUntil: number;
  buffDefense: number;
  lastCombatAt: number;
  lastChatAt: number;
  dirty: boolean;
}

export interface RuntimeMonster {
  id: string;
  templateId: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldownMs: number;
  xp: number;
  gold: number;
  isBoss: boolean;
  x: number;
  y: number;
  z: number;
  rotation: number;
  spawnX: number;
  spawnZ: number;
  areaRadius: number;
  targetPlayerId: string | null;
  lastAttackAt: number;
  dead: boolean;
  respawnAt: number;
  wanderAt: number;
  wanderTarget: { x: number; z: number } | null;
  poisonUntil: number;
  poisonDamage: number;
  poisonTickAt: number;
  poisonSourceId: string | null;
  stunnedUntil: number;
  slowUntil: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  sect: SectId;
  faction: FactionId;
  gender: Gender;
  appearance: { color?: string; hair?: string; height?: number };
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  x: number;
  y: number;
  z: number;
  rotation: number;
  pvpEnabled: boolean;
  dead: boolean;
  stunnedUntil?: number;
}

export interface MonsterSnapshot {
  id: string;
  templateId: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  z: number;
  rotation: number;
  isBoss: boolean;
  dead: boolean;
  stunnedUntil?: number;
}

export interface WorldSnapshot {
  tick: number;
  serverTime: number;
  players: PlayerSnapshot[];
  monsters: MonsterSnapshot[];
  bossActive: boolean;
  nextBossAt: number;
}

export interface CombatEvent {
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetType: "monster" | "player";
  targetName: string;
  damage: number;
  crit: boolean;
  skill: boolean;
  targetHp: number;
  targetMaxHp: number;
  killed: boolean;
}
