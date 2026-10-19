import { ITEMS, type ItemTemplate, type NpcDefinition } from "./content.js";

export type PurchaseResult =
  | { ok: true; template: ItemTemplate; amount: number; total: number }
  | { ok: false; message: string };

export function resolvePurchase(
  npc: NpcDefinition,
  templateId: string,
  quantity: number,
  gold: number,
): PurchaseResult {
  const stock = npc.stock.find((entry) => entry.templateId === templateId);
  const template = ITEMS[templateId];
  if (!stock || !template) return { ok: false, message: "Thương nhân không bán vật phẩm này." };

  const amount = Math.max(1, Math.min(99, Math.floor(quantity)));
  const total = stock.price * amount;
  if (gold < total) return { ok: false, message: "Bạn không đủ vàng." };

  return { ok: true, template, amount, total };
}
