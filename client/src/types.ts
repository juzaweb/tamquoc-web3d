export type SectId = "SHAOLIN" | "WUDANG" | "EMEI" | "WUDU";
export type FactionId = "HAN" | "SHU" | "WEI";
export type Gender = "MALE" | "FEMALE";

export interface SectDefinition {
  id: SectId;
  name: string;
  weaponName: string;
  description: string;
  allowedGenders: Gender[];
  base: { strength: number; speed: number; intelligence: number };
  growth: { strength: number; speed: number; intelligence: number };
  skill: {
    id: string;
    name: string;
    description: string;
    type: "MELEE" | "RANGED" | "HEAL" | "POISON";
    mpCost: number;
    cooldownMs: number;
    power: number;
    range: number;
    color: number;
  };
}

export interface ItemTemplate {
  id: string;
  name: string;
  type: "weapon" | "armor" | "accessory" | "consumable" | "material";
  slot?: "weapon" | "armor" | "accessory";
  rarity: "common" | "uncommon" | "rare" | "epic";
  description: string;
  attack?: number;
  defense?: number;
  hpBonus?: number;
  mpBonus?: number;
  restoreHp?: number;
  restoreMp?: number;
  stackable?: boolean;
  sellPrice: number;
}

export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  objective: { type: "kill"; monsterId: string; count: number };
  rewards: { xp: number; gold: number; items: { templateId: string; quantity: number }[] };
}

export interface MonsterTemplate {
  id: string;
  name: string;
  level: number;
  hp: number;
  isBoss?: boolean;
  scale: number;
  color: number;
}

export interface CityInfo {
  faction: FactionId;
  name: string;
  x: number;
  z: number;
  color: number;
  mainGate: "NORTH" | "SOUTH" | "EAST" | "WEST";
  gate: { x: number; z: number };
}

export interface WorldInfo {
  radius: number;
  safeRadius: number;
  maxLevel: number;
  gatePkRadius: number;
  gatePkInnerRadius: number;
  wallHalf: number;
  gateHalf: number;
  cities: CityInfo[];
  spawnPoints: Record<FactionId, { x: number; z: number }>;
}

export interface Content {
  sects: Record<SectId, SectDefinition>;
  factions: Record<FactionId, { id: FactionId; name: string; color: number }>;
  items: Record<string, ItemTemplate>;
  quests: Record<string, QuestDefinition>;
  monsters: Record<string, MonsterTemplate>;
  world: WorldInfo;
}

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

export interface InventoryItem {
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

export interface SelfState {
  characterId: string;
  name: string;
  sect: SectId;
  faction: FactionId;
  gender?: Gender;
  level: number;
  xp: number;
  xpNext: number;
  gold: number;
  hp: number;
  mp: number;
  stats: DerivedStats;
  items: InventoryItem[];
  quests: QuestProgress[];
  pvpEnabled: boolean;
  x: number;
  y: number;
  z: number;
  dead: boolean;
  appearance?: { color?: string; hair?: string; height?: number };
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  sect: SectId;
  faction: FactionId;
  gender: Gender;
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
  appearance?: { color?: string; hair?: string; height?: number };
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
}

export interface WorldState {
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

export interface CharacterSummary {
  id: string;
  name: string;
  sect: SectId;
  faction: FactionId;
  gender: Gender;
  level: number;
  xp: number;
  xpNext: number;
  gold: number;
  hp: number;
  mp: number;
  stats: DerivedStats;
  items: InventoryItem[];
  quests: QuestProgress[];
  appearance: { color?: string; hair?: string; height?: number };
}
