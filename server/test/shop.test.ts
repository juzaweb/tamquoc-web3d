import assert from "node:assert/strict";
import test from "node:test";
import { NPCS } from "../src/game/content.js";
import { resolvePurchase } from "../src/game/shop.js";

const merchant = NPCS[0]!;

test("buying stock potions charges the stock price", () => {
  const result = resolvePurchase(merchant, "potion_hp", 2, 100);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.amount, 2);
  assert.equal(result.total, 60);
  assert.equal(result.template.id, "potion_hp");
});

test("purchase quantities are clamped to the allowed range", () => {
  const result = resolvePurchase(merchant, "potion_hp", 500, 100_000);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.amount, 99);
  assert.equal(result.total, 2970);
});

test("purchases reject items the merchant does not stock", () => {
  const result = resolvePurchase(merchant, "weapon_bandit_blade", 1, 100_000);
  assert.deepEqual(result, { ok: false, message: "Thương nhân không bán vật phẩm này." });
});

test("purchases reject unknown items and insufficient gold", () => {
  assert.deepEqual(resolvePurchase(merchant, "missing_item", 1, 100_000), {
    ok: false,
    message: "Thương nhân không bán vật phẩm này.",
  });
  assert.deepEqual(resolvePurchase(merchant, "potion_hp", 1, 29), {
    ok: false,
    message: "Bạn không đủ vàng.",
  });
});
