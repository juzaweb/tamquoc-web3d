import type { Character } from "@prisma/client";
import { prisma } from "../db.js";
import { computeStats, xpToNextLevel } from "./stats.js";
import type { RuntimeItem, RuntimePlayer } from "./types.js";
import { ITEMS, type FactionId, type Gender, type SectId } from "./content.js";
import type { QuestProgress } from "./types.js";

export function parseQuests(json: string): QuestProgress[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is QuestProgress =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as QuestProgress).id === "string" &&
        typeof (entry as QuestProgress).progress === "number" &&
        ((entry as QuestProgress).status === "ACTIVE" ||
          (entry as QuestProgress).status === "COMPLETED"),
    );
  } catch {
    return [];
  }
}

export async function loadCharacterWithItems(characterId: string, userId: string) {
  return prisma.character.findFirst({
    where: { id: characterId, userId },
    include: { items: true },
  });
}

export function toRuntimePlayer(
  socketId: string,
  character: Character & { items: { id: string; templateId: string; quantity: number; slot: string | null }[] },
): RuntimePlayer {
  const sect = character.sect as SectId;
  const items: RuntimeItem[] = character.items.map((item) => ({
    id: item.id,
    templateId: item.templateId,
    quantity: item.quantity,
    slot: item.slot,
  }));
  const stats = computeStats(character.level, sect, items);
  let appearance: { color?: string; hair?: string; height?: number } = {};
  try {
    appearance = JSON.parse(character.appearance) as { color?: string; hair?: string; height?: number };
  } catch {
    appearance = {};
  }
  return {
    socketId,
    userId: character.userId,
    characterId: character.id,
    name: character.name,
    sect,
    faction: character.faction as FactionId,
    gender: character.gender as Gender,
    appearance,
    level: character.level,
    xp: character.xp,
    gold: character.gold,
    hp: Math.min(character.hp, stats.maxHp),
    mp: Math.min(character.mp, stats.maxMp),
    stats,
    x: character.x,
    y: character.y,
    z: character.z,
    rotation: character.rotation,
    pvpEnabled: character.pvpEnabled,
    items,
    quests: parseQuests(character.questsJson),
    dead: false,
    respawnAt: 0,
    lastMoveAt: 0,
    lastAttackAt: 0,
    lastSkillAt: 0,
    lastCombatAt: 0,
    lastChatAt: 0,
    dirty: false,
  };
}

export async function savePlayer(player: RuntimePlayer): Promise<void> {
  await prisma.character.update({
    where: { id: player.characterId },
    data: {
      level: player.level,
      xp: player.xp,
      gold: player.gold,
      hp: player.hp,
      mp: player.mp,
      x: player.x,
      y: player.y,
      z: player.z,
      rotation: player.rotation,
      pvpEnabled: player.pvpEnabled,
      questsJson: JSON.stringify(player.quests),
    },
  });
  player.dirty = false;
}

export function selfDto(player: RuntimePlayer) {
  return {
    characterId: player.characterId,
    name: player.name,
    sect: player.sect,
    faction: player.faction,
    gender: player.gender,
    appearance: player.appearance,
    level: player.level,
    xp: player.xp,
    xpNext: xpToNextLevel(player.level),
    gold: player.gold,
    hp: player.hp,
    mp: player.mp,
    stats: player.stats,
    items: player.items,
    quests: player.quests,
    pvpEnabled: player.pvpEnabled,
    x: player.x,
    y: player.y,
    z: player.z,
    dead: player.dead,
  };
}

export async function addItemToInventory(
  player: RuntimePlayer,
  templateId: string,
  quantity: number,
  stackable: boolean,
): Promise<RuntimeItem> {
  if (stackable) {
    const existing = player.items.find((item) => item.templateId === templateId && !item.slot);
    if (existing) {
      existing.quantity += quantity;
      await prisma.item.update({ where: { id: existing.id }, data: { quantity: existing.quantity } });
      return existing;
    }
  }
  const created = await prisma.item.create({
    data: { characterId: player.characterId, templateId, quantity },
  });
  const item: RuntimeItem = {
    id: created.id,
    templateId: created.templateId,
    quantity: created.quantity,
    slot: created.slot,
  };
  player.items.push(item);
  return item;
}

export async function removeItemQuantity(player: RuntimePlayer, itemId: string, quantity: number) {
  const item = player.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.quantity -= quantity;
  if (item.quantity <= 0) {
    player.items = player.items.filter((entry) => entry.id !== itemId);
    await prisma.item.delete({ where: { id: itemId } });
  } else {
    await prisma.item.update({ where: { id: itemId }, data: { quantity: item.quantity } });
  }
}

export async function setItemSlot(player: RuntimePlayer, itemId: string, slot: string | null) {
  const item = player.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.slot = slot;
  await prisma.item.update({ where: { id: itemId }, data: { slot } });
}

export async function createCharacter(data: {
  userId: string;
  name: string;
  sect: SectId;
  faction: FactionId;
  gender: Gender;
  appearance: Record<string, unknown>;
  starterItems: string[];
  x: number;
  z: number;
}) {
  const grouped = new Map<string, number>();
  for (const templateId of data.starterItems) {
    grouped.set(templateId, (grouped.get(templateId) ?? 0) + 1);
  }
  const items = [...grouped].map(([templateId, quantity]) => {
    const template = ITEMS[templateId];
    const slot = template?.slot === "weapon" || template?.slot === "armor" || template?.slot === "accessory"
      ? template.slot
      : null;
    return { templateId, quantity, slot };
  });
  const stats = computeStats(
    1,
    data.sect,
    items.map((item, index) => ({ id: String(index), ...item })),
  );

  return prisma.character.create({
    data: {
      userId: data.userId,
      name: data.name,
      sect: data.sect,
      faction: data.faction,
      gender: data.gender,
      appearance: JSON.stringify(data.appearance),
      hp: stats.maxHp,
      mp: stats.maxMp,
      x: data.x,
      z: data.z,
      items: { create: items },
    },
    include: { items: true },
  });
}
