import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { verifyToken } from "./lib/auth.js";
import type { GameWorld } from "./game/world.js";

const enterSchema = z.object({ characterId: z.string().min(1) });
const moveSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
  rotation: z.number().finite().optional(),
});
const targetSchema = z.object({
  targetId: z.string().min(1).nullable(),
  targetType: z.enum(["monster", "player"]),
});
const chatSchema = z.object({
  channel: z.enum(["global", "faction"]).default("global"),
  message: z.string().min(1).max(240),
});
const itemSchema = z.object({ itemId: z.string().min(1) });
const slotSchema = z.object({ slot: z.enum(["weapon", "armor", "accessory"]) });
const questSchema = z.object({ questId: z.string().min(1) });
const pvpSchema = z.object({ enabled: z.boolean() });

export function registerSocketHandlers(io: Server, world: GameWorld) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const payload = token ? verifyToken(token) : null;
    if (!payload) return next(new Error("Unauthorized"));
    socket.data.userId = payload.sub;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    const run = (promise: Promise<unknown>, message = "Không thể xử lý yêu cầu.") => {
      void promise.catch((error: Error) => {
        console.error("Socket handler error", error);
        socket.emit("error:game", { message });
      });
    };

    socket.on("world:enter", (payload) => {
      const parsed = enterSchema.safeParse(payload);
      if (!parsed.success) return socket.emit("error:game", { message: "Yêu cầu vào thế giới không hợp lệ." });
      world.enter(socket.id, userId, parsed.data.characterId).catch((error: Error) => {
        socket.emit("error:game", { message: error.message || "Không thể vào thế giới." });
      });
    });

    socket.on("player:move", (payload) => {
      const parsed = moveSchema.safeParse(payload);
      if (!parsed.success) return;
      world.move(socket.id, parsed.data.x, parsed.data.z, parsed.data.rotation ?? 0);
    });

    socket.on("combat:attack", (payload) => {
      const parsed = targetSchema.safeParse(payload);
      if (!parsed.success) return;
      run(world.basicAttack(socket.id, parsed.data.targetId ?? "", parsed.data.targetType));
    });

    socket.on("combat:skill", (payload) => {
      const parsed = targetSchema.safeParse(payload);
      if (!parsed.success) return;
      run(
        world.useSkill(socket.id, parsed.data.targetId, parsed.data.targetType),
        "Không thể sử dụng tuyệt kỹ.",
      );
    });

    socket.on("chat:send", (payload) => {
      const parsed = chatSchema.safeParse(payload);
      if (!parsed.success) return;
      world.chat(socket.id, parsed.data.channel, parsed.data.message);
    });

    socket.on("inventory:equip", (payload) => {
      const parsed = itemSchema.safeParse(payload);
      if (!parsed.success) return;
      run(world.equip(socket.id, parsed.data.itemId), "Không thể trang bị vật phẩm.");
    });

    socket.on("inventory:unequip", (payload) => {
      const parsed = slotSchema.safeParse(payload);
      if (!parsed.success) return;
      run(world.unequip(socket.id, parsed.data.slot), "Không thể tháo trang bị.");
    });

    socket.on("inventory:use", (payload) => {
      const parsed = itemSchema.safeParse(payload);
      if (!parsed.success) return;
      run(world.useItem(socket.id, parsed.data.itemId), "Không thể sử dụng vật phẩm.");
    });

    socket.on("quest:accept", (payload) => {
      const parsed = questSchema.safeParse(payload);
      if (!parsed.success) return;
      world.acceptQuest(socket.id, parsed.data.questId);
    });

    socket.on("quest:complete", (payload) => {
      const parsed = questSchema.safeParse(payload);
      if (!parsed.success) return;
      run(world.completeQuest(socket.id, parsed.data.questId), "Không thể hoàn thành nhiệm vụ.");
    });

    socket.on("pvp:toggle", (payload) => {
      const parsed = pvpSchema.safeParse(payload);
      if (!parsed.success) return;
      world.togglePvp(socket.id, parsed.data.enabled);
    });

    socket.on("disconnect", () => {
      run(world.leave(socket.id));
    });
  });
}
