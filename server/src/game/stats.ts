import { ITEMS, MAX_LEVEL, SECTS, type SectId } from "./content.js";
import type { DerivedStats, RuntimeItem } from "./types.js";

export function xpToNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return 120 + (level - 1) * 110;
}

export function applyExperience(level: number, xp: number): { level: number; xp: number; leveled: boolean } {
  let nextLevel = level;
  let nextXp = xp;
  let leveled = false;
  while (nextLevel < MAX_LEVEL && nextXp >= xpToNextLevel(nextLevel)) {
    nextXp -= xpToNextLevel(nextLevel);
    nextLevel += 1;
    leveled = true;
  }
  if (nextLevel >= MAX_LEVEL) nextXp = 0;
  return { level: nextLevel, xp: nextXp, leveled };
}

export function computeStats(level: number, sectId: SectId, items: RuntimeItem[]): DerivedStats {
  const sect = SECTS[sectId];
  const strength = sect.base.strength + sect.growth.strength * (level - 1);
  const speed = sect.base.speed + sect.growth.speed * (level - 1);
  const intelligence = sect.base.intelligence + sect.growth.intelligence * (level - 1);

  let attackBonus = 0;
  let defenseBonus = 0;
  let hpBonus = 0;
  let mpBonus = 0;

  for (const item of items) {
    if (!item.slot) continue;
    const template = ITEMS[item.templateId];
    if (!template) continue;
    attackBonus += template.attack ?? 0;
    defenseBonus += template.defense ?? 0;
    hpBonus += template.hpBonus ?? 0;
    mpBonus += template.mpBonus ?? 0;
  }

  return {
    strength,
    speed,
    intelligence,
    maxHp: Math.round(80 + strength * 7 + level * 14 + hpBonus),
    maxMp: Math.round(40 + intelligence * 5 + level * 6 + mpBonus),
    attack: Math.round(6 + strength * 1.7 + attackBonus),
    defense: Math.round(strength * 0.25 + level * 0.7 + defenseBonus),
    moveSpeed: 7 + speed * 0.14,
  };
}

export function rollDamage(
  attack: number,
  targetDefense: number,
  power: number,
): { damage: number; crit: boolean } {
  const crit = Math.random() < 0.12;
  const variance = 0.85 + Math.random() * 0.3;
  const raw = attack * power * variance * (crit ? 1.6 : 1) - targetDefense * 0.5;
  return { damage: Math.max(1, Math.round(raw)), crit };
}

export function clampPosition(x: number, z: number, radius: number): { x: number; z: number } {
  const distance = Math.hypot(x, z);
  if (distance <= radius) return { x, z };
  const scale = radius / distance;
  return { x: x * scale, z: z * scale };
}
