export type SectId = "SHAOLIN" | "WUDANG" | "EMEI" | "WUDU";
export type FactionId = "HAN" | "SHU" | "WEI";

export const MAX_LEVEL = 100;
export const WORLD_RADIUS = 112;
export const CITY_SAFE_RADIUS = 24.5;
export const GATE_PK_RADIUS = 9;
export const CITY_WALL_HALF = 24;
export const CITY_GATE_HALF = 4;
export const GATE_PK_INNER_RADIUS = 24.5;
export type Gender = "MALE" | "FEMALE";
export type SkillType = "MELEE" | "RANGED" | "HEAL" | "POISON";

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
    type: SkillType;
    mpCost: number;
    cooldownMs: number;
    power: number;
    range: number;
    color: number;
  };
}

export const SECTS: Record<SectId, SectDefinition> = {
  SHAOLIN: {
    id: "SHAOLIN",
    name: "Thiếu Lâm",
    weaponName: "Chưởng",
    description: "Thiền quyền cương mãnh, cận chiến chịu đòn tốt.",
    allowedGenders: ["MALE"],
    base: { strength: 14, speed: 8, intelligence: 6 },
    growth: { strength: 3, speed: 1, intelligence: 1 },
    skill: {
      id: "arhat_palm",
      name: "La Hán Chưởng",
      description: "Chưởng lực đánh trúng mọi kẻ địch quanh bản thân.",
      type: "MELEE",
      mpCost: 12,
      cooldownMs: 3000,
      power: 1.8,
      range: 6,
      color: 0xffb347,
    },
  },
  WUDANG: {
    id: "WUDANG",
    name: "Võ Đang",
    weaponName: "Kiếm",
    description: "Thái Cực kiếm pháp cân bằng công thủ, đánh xa.",
    allowedGenders: ["MALE", "FEMALE"],
    base: { strength: 9, speed: 11, intelligence: 10 },
    growth: { strength: 2, speed: 2, intelligence: 2 },
    skill: {
      id: "taiji_sword",
      name: "Thái Cực Kiếm Khí",
      description: "Phóng kiếm khí xuyên qua kẻ địch ở xa.",
      type: "RANGED",
      mpCost: 15,
      cooldownMs: 3500,
      power: 1.7,
      range: 22,
      color: 0x7fd4ff,
    },
  },
  EMEI: {
    id: "EMEI",
    name: "Nga My",
    weaponName: "Kiếm",
    description: "Nữ kiếm khách, tinh thông nội công và hồi phục.",
    allowedGenders: ["FEMALE"],
    base: { strength: 7, speed: 11, intelligence: 14 },
    growth: { strength: 1, speed: 2, intelligence: 3 },
    skill: {
      id: "emei_palm",
      name: "Nga Mi Phật Quang",
      description: "Gây sát thương và hồi máu cho bản thân.",
      type: "HEAL",
      mpCost: 18,
      cooldownMs: 4500,
      power: 1.4,
      range: 12,
      color: 0xff9de2,
    },
  },
  WUDU: {
    id: "WUDU",
    name: "Ngũ Độc",
    weaponName: "Chảo",
    description: "Độc sư nhanh nhẹn, gây độc tổn hại theo thời gian.",
    allowedGenders: ["MALE", "FEMALE"],
    base: { strength: 8, speed: 13, intelligence: 12 },
    growth: { strength: 2, speed: 3, intelligence: 2 },
    skill: {
      id: "venom_palm",
      name: "Độc Chưởng",
      description: "Tẩm độc vào đòn đánh, thiêu đốt sinh lực kẻ địch.",
      type: "POISON",
      mpCost: 14,
      cooldownMs: 4000,
      power: 1.1,
      range: 5,
      color: 0x9cff6b,
    },
  },
};

export const FACTIONS: Record<FactionId, { id: FactionId; name: string; color: number }> = {
  HAN: { id: "HAN", name: "Hán", color: 0x5ea8ff },
  SHU: { id: "SHU", name: "Thục", color: 0x5eff9c },
  WEI: { id: "WEI", name: "Ngụy", color: 0xff6b6b },
};

export type ItemType = "weapon" | "armor" | "accessory" | "consumable" | "material";
export type EquipSlot = "weapon" | "armor" | "accessory";

export interface ItemTemplate {
  id: string;
  name: string;
  type: ItemType;
  slot?: EquipSlot;
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

export const ITEMS: Record<string, ItemTemplate> = {
  weapon_shaolin_fist: {
    id: "weapon_shaolin_fist",
    name: "Thiết Quyền Hộ Thủ",
    type: "weapon",
    slot: "weapon",
    rarity: "common",
    description: "Hộ thủ da trâu của đệ tử Thiếu Lâm.",
    attack: 8,
    sellPrice: 40,
  },
  weapon_wudang_sword: {
    id: "weapon_wudang_sword",
    name: "Võ Đang Trường Kiếm",
    type: "weapon",
    slot: "weapon",
    rarity: "common",
    description: "Kiếm dài nhẹ, cân bằng công thủ.",
    attack: 9,
    sellPrice: 45,
  },
  weapon_emei_sword: {
    id: "weapon_emei_sword",
    name: "Nga My Nhuyễn Kiếm",
    type: "weapon",
    slot: "weapon",
    rarity: "common",
    description: "Nhuyễn kiếm thanh thoát của nữ hiệp.",
    attack: 8,
    mpBonus: 10,
    sellPrice: 45,
  },
  weapon_wudu_pan: {
    id: "weapon_wudu_pan",
    name: "Độc Xà Thiết Chảo",
    type: "weapon",
    slot: "weapon",
    rarity: "common",
    description: "Chảo sắt ám độc của Ngũ Độc giáo.",
    attack: 7,
    defense: 2,
    sellPrice: 45,
  },
  armor_cloth: {
    id: "armor_cloth",
    name: "Bố Y",
    type: "armor",
    slot: "armor",
    rarity: "common",
    description: "Áo vải thô bền chắc.",
    defense: 4,
    hpBonus: 20,
    sellPrice: 25,
  },
  armor_leather: {
    id: "armor_leather",
    name: "Da Thú Giáp",
    type: "armor",
    slot: "armor",
    rarity: "uncommon",
    description: "Giáp da thuộc, nhẹ và bền.",
    defense: 9,
    hpBonus: 45,
    sellPrice: 90,
  },
  accessory_jade: {
    id: "accessory_jade",
    name: "Bích Ngọc Bội",
    type: "accessory",
    slot: "accessory",
    rarity: "uncommon",
    description: "Ngọc bội thanh khiết tăng nội lực.",
    mpBonus: 20,
    hpBonus: 10,
    sellPrice: 80,
  },
  potion_hp: {
    id: "potion_hp",
    name: "Hồi Huyết Đan",
    type: "consumable",
    rarity: "common",
    description: "Hồi 60 điểm sinh lực.",
    restoreHp: 60,
    stackable: true,
    sellPrice: 10,
  },
  potion_mp: {
    id: "potion_mp",
    name: "Hồi Khí Đan",
    type: "consumable",
    rarity: "common",
    description: "Hồi 40 điểm nội lực.",
    restoreMp: 40,
    stackable: true,
    sellPrice: 12,
  },
  material_wolf_pelt: {
    id: "material_wolf_pelt",
    name: "Da Sói",
    type: "material",
    rarity: "common",
    description: "Da sói còn nguyên vẹn, có thể bán lấy tiền.",
    stackable: true,
    sellPrice: 18,
  },
  material_venom_sac: {
    id: "material_venom_sac",
    name: "Độc Túi",
    type: "material",
    rarity: "uncommon",
    description: "Túi độc của yêu xà.",
    stackable: true,
    sellPrice: 30,
  },
  weapon_bandit_blade: {
    id: "weapon_bandit_blade",
    name: "Sơn Tặc Đao",
    type: "weapon",
    slot: "weapon",
    rarity: "uncommon",
    description: "Đao rỉ sét cướp được từ sơn tặc.",
    attack: 14,
    sellPrice: 120,
  },
  armor_black_dragon: {
    id: "armor_black_dragon",
    name: "Hắc Long Giáp",
    type: "armor",
    slot: "armor",
    rarity: "epic",
    description: "Giáp vảy rồng đen, bảo vật của Hắc Long Vương.",
    defense: 22,
    hpBonus: 150,
    sellPrice: 800,
  },
};

export const STARTER_ITEMS: Record<SectId, string[]> = {
  SHAOLIN: ["weapon_shaolin_fist", "armor_cloth", "potion_hp", "potion_hp", "potion_hp"],
  WUDANG: ["weapon_wudang_sword", "armor_cloth", "potion_hp", "potion_hp", "potion_hp"],
  EMEI: ["weapon_emei_sword", "armor_cloth", "potion_hp", "potion_hp", "potion_hp"],
  WUDU: ["weapon_wudu_pan", "armor_cloth", "potion_hp", "potion_hp", "potion_hp"],
};

export interface MonsterTemplate {
  id: string;
  name: string;
  level: number;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldownMs: number;
  xp: number;
  gold: number;
  isBoss?: boolean;
  scale: number;
  color: number;
  drops: { templateId: string; chance: number; min: number; max: number }[];
}

export const MONSTERS: Record<string, MonsterTemplate> = {
  wolf: {
    id: "wolf",
    name: "Sói Hoang",
    level: 1,
    hp: 90,
    attack: 9,
    defense: 2,
    speed: 3.6,
    aggroRange: 12,
    attackRange: 2.6,
    attackCooldownMs: 1500,
    xp: 34,
    gold: 16,
    scale: 0.8,
    color: 0x8a8f98,
    drops: [{ templateId: "material_wolf_pelt", chance: 0.55, min: 1, max: 2 }],
  },
  bandit: {
    id: "bandit",
    name: "Sơn Tặc",
    level: 3,
    hp: 150,
    attack: 15,
    defense: 5,
    speed: 2.8,
    aggroRange: 11,
    attackRange: 2.8,
    attackCooldownMs: 1700,
    xp: 62,
    gold: 34,
    scale: 1,
    color: 0xb5533c,
    drops: [
      { templateId: "weapon_bandit_blade", chance: 0.12, min: 1, max: 1 },
      { templateId: "potion_mp", chance: 0.3, min: 1, max: 1 },
    ],
  },
  snake: {
    id: "snake",
    name: "Yêu Xà",
    level: 2,
    hp: 110,
    attack: 12,
    defense: 3,
    speed: 3.2,
    aggroRange: 10,
    attackRange: 2.4,
    attackCooldownMs: 1600,
    xp: 46,
    gold: 22,
    scale: 0.9,
    color: 0x6fbf5a,
    drops: [
      { templateId: "material_venom_sac", chance: 0.4, min: 1, max: 1 },
      { templateId: "armor_leather", chance: 0.08, min: 1, max: 1 },
    ],
  },
  tiger: {
    id: "tiger",
    name: "Mãnh Hổ",
    level: 15,
    hp: 420,
    attack: 28,
    defense: 9,
    speed: 3.8,
    aggroRange: 13,
    attackRange: 2.8,
    attackCooldownMs: 1500,
    xp: 220,
    gold: 110,
    scale: 1.15,
    color: 0xd08a3c,
    drops: [
      { templateId: "armor_leather", chance: 0.18, min: 1, max: 1 },
      { templateId: "potion_hp", chance: 0.5, min: 1, max: 2 },
    ],
  },
  demon: {
    id: "demon",
    name: "U Minh Sứ Giả",
    level: 30,
    hp: 1150,
    attack: 52,
    defense: 18,
    speed: 3.4,
    aggroRange: 14,
    attackRange: 3.2,
    attackCooldownMs: 1400,
    xp: 900,
    gold: 430,
    scale: 1.2,
    color: 0x6b4a8f,
    drops: [
      { templateId: "accessory_jade", chance: 0.2, min: 1, max: 1 },
      { templateId: "potion_mp", chance: 0.6, min: 1, max: 2 },
    ],
  },
  warlord: {
    id: "warlord",
    name: "Chiến Tướng Ma Giới",
    level: 50,
    hp: 2600,
    attack: 95,
    defense: 30,
    speed: 3.2,
    aggroRange: 16,
    attackRange: 3.4,
    attackCooldownMs: 1300,
    xp: 2200,
    gold: 900,
    scale: 1.45,
    color: 0x8f2e2e,
    drops: [
      { templateId: "weapon_bandit_blade", chance: 0.25, min: 1, max: 1 },
      { templateId: "armor_leather", chance: 0.3, min: 1, max: 1 },
      { templateId: "potion_hp", chance: 0.8, min: 1, max: 3 },
    ],
  },
  black_dragon: {
    id: "black_dragon",
    name: "Hắc Long Vương",
    level: 80,
    hp: 9000,
    attack: 160,
    defense: 55,
    speed: 3.2,
    aggroRange: 26,
    attackRange: 4.5,
    attackCooldownMs: 1300,
    xp: 9000,
    gold: 3000,
    isBoss: true,
    scale: 2.6,
    color: 0x2b2540,
    drops: [
      { templateId: "armor_black_dragon", chance: 0.65, min: 1, max: 1 },
      { templateId: "accessory_jade", chance: 0.8, min: 1, max: 1 },
      { templateId: "potion_hp", chance: 1, min: 3, max: 6 },
    ],
  },
};

export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  objective: { type: "kill"; monsterId: string; count: number };
  rewards: { xp: number; gold: number; items: { templateId: string; quantity: number }[] };
}

export const QUESTS: Record<string, QuestDefinition> = {
  q_wolves: {
    id: "q_wolves",
    name: "Sói Hoang Quấy Phá",
    description: "Dẹp yên 5 con Sói Hoang quanh thành để bảo vệ dân chúng.",
    requiredLevel: 1,
    objective: { type: "kill", monsterId: "wolf", count: 5 },
    rewards: { xp: 220, gold: 180, items: [{ templateId: "potion_hp", quantity: 3 }] },
  },
  q_bandits: {
    id: "q_bandits",
    name: "Trấn Áp Sơn Tặc",
    description: "Tiêu diệt 6 Sơn Tặc đang cướp bóc trên đường ra chiến trường.",
    requiredLevel: 2,
    objective: { type: "kill", monsterId: "bandit", count: 6 },
    rewards: { xp: 520, gold: 420, items: [{ templateId: "armor_leather", quantity: 1 }] },
  },
  q_snakes: {
    id: "q_snakes",
    name: "Độc Xà Trong Rừng",
    description: "Loại bỏ 4 Yêu Xà để lấy lại bình yên cho khu rừng ngoại thành.",
    requiredLevel: 1,
    objective: { type: "kill", monsterId: "snake", count: 4 },
    rewards: { xp: 300, gold: 260, items: [{ templateId: "accessory_jade", quantity: 1 }] },
  },
};

export const MONSTER_SPAWNS: { monsterId: string; x: number; z: number; areaRadius: number }[] = [
  { monsterId: "wolf", x: 0, z: -44, areaRadius: 9 },
  { monsterId: "wolf", x: -20, z: -50, areaRadius: 8 },
  { monsterId: "wolf", x: 20, z: -50, areaRadius: 8 },
  { monsterId: "wolf", x: -44, z: 26, areaRadius: 7 },
  { monsterId: "wolf", x: 44, z: 26, areaRadius: 7 },
  { monsterId: "snake", x: -46, z: 16, areaRadius: 9 },
  { monsterId: "snake", x: -46, z: 46, areaRadius: 8 },
  { monsterId: "snake", x: -34, z: 54, areaRadius: 7 },
  { monsterId: "snake", x: 46, z: 16, areaRadius: 9 },
  { monsterId: "snake", x: 46, z: 46, areaRadius: 8 },
  { monsterId: "snake", x: 34, z: 54, areaRadius: 7 },
  { monsterId: "bandit", x: 0, z: -32, areaRadius: 9 },
  { monsterId: "bandit", x: -32, z: -18, areaRadius: 9 },
  { monsterId: "bandit", x: 32, z: -18, areaRadius: 9 },
  { monsterId: "tiger", x: -32, z: 0, areaRadius: 9 },
  { monsterId: "tiger", x: 32, z: 0, areaRadius: 9 },
  { monsterId: "tiger", x: 0, z: 32, areaRadius: 9 },
  { monsterId: "demon", x: -56, z: -34, areaRadius: 9 },
  { monsterId: "demon", x: 56, z: -34, areaRadius: 9 },
  { monsterId: "demon", x: -62, z: 68, areaRadius: 8 },
  { monsterId: "demon", x: 62, z: 68, areaRadius: 8 },
  { monsterId: "warlord", x: -17, z: -15, areaRadius: 7 },
  { monsterId: "warlord", x: 17, z: -15, areaRadius: 7 },
  { monsterId: "warlord", x: 0, z: 19, areaRadius: 7 },
];

export const BOSS_SPAWN = { monsterId: "black_dragon", x: 0, z: 0 };
export const BOSS_INTERVAL_MS = 180_000;

export const SPAWN_POINT = { x: 0, z: -54 };

export interface CityDefinition {
  faction: FactionId;
  name: string;
  x: number;
  z: number;
  color: number;
  mainGate: "NORTH" | "SOUTH" | "EAST" | "WEST";
  merchant: { x: number; z: number };
}

export const CITIES: Record<FactionId, CityDefinition> = {
  HAN: {
    faction: "HAN",
    name: "Hán Thành",
    x: 0,
    z: -76,
    color: 0x5ea8ff,
    mainGate: "NORTH",
    merchant: { x: 0, z: -8 },
  },
  SHU: {
    faction: "SHU",
    name: "Thục Thành",
    x: -76,
    z: 30,
    color: 0x5eff9c,
    mainGate: "EAST",
    merchant: { x: -8, z: 0 },
  },
  WEI: {
    faction: "WEI",
    name: "Ngụy Thành",
    x: 76,
    z: 30,
    color: 0xff6b6b,
    mainGate: "WEST",
    merchant: { x: 8, z: 0 },
  },
};

export interface NpcStockEntry {
  templateId: string;
  price: number;
}

export interface NpcDefinition {
  id: string;
  name: string;
  faction: FactionId;
  x: number;
  z: number;
  interactRadius: number;
  stock: NpcStockEntry[];
}

export const NPC_STOCK: NpcStockEntry[] = [
  { templateId: "potion_hp", price: 30 },
  { templateId: "potion_mp", price: 35 },
];

export const NPCS: NpcDefinition[] = Object.values(CITIES).map((city) => ({
  id: `merchant_${city.faction.toLowerCase()}`,
  name: "Tạp Hóa Lão Bản",
  faction: city.faction,
  x: city.x + city.merchant.x,
  z: city.z + city.merchant.z,
  interactRadius: 6,
  stock: NPC_STOCK,
}));

export const SPAWN_POINTS: Record<FactionId, { x: number; z: number }> = {
  HAN: { x: 0, z: -66 },
  SHU: { x: -66, z: 30 },
  WEI: { x: 66, z: 30 },
};

export function cityGatePosition(city: CityDefinition): { x: number; z: number } {
  if (city.mainGate === "NORTH") return { x: city.x, z: city.z + CITY_WALL_HALF };
  if (city.mainGate === "SOUTH") return { x: city.x, z: city.z - CITY_WALL_HALF };
  if (city.mainGate === "EAST") return { x: city.x + CITY_WALL_HALF, z: city.z };
  return { x: city.x - CITY_WALL_HALF, z: city.z };
}
