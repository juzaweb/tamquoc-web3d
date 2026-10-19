import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./db.js";
import { authenticate, hashPassword, signToken, verifyPassword } from "./lib/auth.js";
import {
  CITIES,
  CITY_GATE_HALF,
  CITY_SAFE_RADIUS,
  CITY_WALL_HALF,
  FACTIONS,
  GATE_PK_INNER_RADIUS,
  GATE_PK_RADIUS,
  ITEMS,
  MAX_LEVEL,
  MONSTERS,
  QUESTS,
  SECTS,
  SPAWN_POINTS,
  STARTER_ITEMS,
  WORLD_RADIUS,
  cityGatePosition,
  type FactionId,
  type Gender,
  type SectId,
} from "./game/content.js";
import { computeStats, xpToNextLevel } from "./game/stats.js";
import { createCharacter, parseQuests } from "./game/persistence.js";

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Tên tài khoản phải có ít nhất 3 ký tự.")
    .max(24, "Tên tài khoản tối đa 24 ký tự.")
    .regex(/^[a-zA-Z0-9_]+$/, "Tên tài khoản chỉ gồm chữ cái, số và dấu gạch dưới."),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự.").max(72),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const characterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Tên nhân vật phải có ít nhất 3 ký tự.")
    .max(16, "Tên nhân vật tối đa 16 ký tự.")
    .regex(/^[\p{L}\p{N}_]+$/u, "Tên nhân vật chỉ gồm chữ, số và dấu gạch dưới."),
  sect: z.enum(["SHAOLIN", "WUDANG", "EMEI", "WUDU"]),
  faction: z.enum(["HAN", "SHU", "WEI"]),
  gender: z.enum(["MALE", "FEMALE"]).default("MALE"),
  appearance: z
    .object({
      hair: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Màu tóc không hợp lệ.").optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Màu y phục không hợp lệ.").optional(),
      height: z.number().min(0.8).max(1.2).optional(),
    })
    .default({}),
});

const authAttempts = new Map<string, { count: number; resetAt: number }>();

function isAuthRateLimited(request: FastifyRequest): boolean {
  const now = Date.now();
  if (authAttempts.size > 5000) authAttempts.clear();
  const entry = authAttempts.get(request.ip);
  if (!entry || entry.resetAt <= now) {
    authAttempts.set(request.ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function requireUser(request: FastifyRequest, reply: FastifyReply): { id: string; username: string } | null {
  const payload = authenticate(request);
  if (!payload) {
    void reply.code(401).send({ error: "Chưa đăng nhập hoặc phiên đã hết hạn." });
    return null;
  }
  return { id: payload.sub, username: payload.username };
}

function characterDto(character: {
  id: string;
  name: string;
  sect: string;
  faction: string;
  gender: string;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  mp: number;
  appearance: string;
  questsJson: string;
  items: { id: string; templateId: string; quantity: number; slot: string | null }[];
}) {
  const sect = character.sect as SectId;
  const items = character.items.map((item) => ({
    id: item.id,
    templateId: item.templateId,
    quantity: item.quantity,
    slot: item.slot,
  }));
  const stats = computeStats(character.level, sect, items);
  let appearance: Record<string, unknown> = {};
  try {
    appearance = JSON.parse(character.appearance) as Record<string, unknown>;
  } catch {
    appearance = {};
  }
  return {
    id: character.id,
    name: character.name,
    sect,
    faction: character.faction as FactionId,
    gender: character.gender as Gender,
    level: character.level,
    xp: character.xp,
    xpNext: xpToNextLevel(character.level),
    gold: character.gold,
    hp: Math.min(character.hp, stats.maxHp),
    mp: Math.min(character.mp, stats.maxMp),
    stats,
    items,
    quests: parseQuests(character.questsJson),
    appearance,
  };
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true, time: Date.now() }));

  app.get("/api/content", async () => ({
    sects: SECTS,
    factions: FACTIONS,
    items: ITEMS,
    quests: QUESTS,
    monsters: MONSTERS,
    world: {
      radius: WORLD_RADIUS,
      safeRadius: CITY_SAFE_RADIUS,
      maxLevel: MAX_LEVEL,
      gatePkRadius: GATE_PK_RADIUS,
      gatePkInnerRadius: GATE_PK_INNER_RADIUS,
      wallHalf: CITY_WALL_HALF,
      gateHalf: CITY_GATE_HALF,
      cities: Object.values(CITIES).map((city) => ({ ...city, gate: cityGatePosition(city) })),
      spawnPoints: SPAWN_POINTS,
    },
  }));

  app.post("/api/auth/register", async (request, reply) => {
    if (isAuthRateLimited(request)) return reply.code(429).send({ error: "Thử lại sau ít phút." });
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." });
    }
    const username = parsed.data.username.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return reply.code(409).send({ error: "Tên tài khoản đã tồn tại." });

    try {
      const user = await prisma.user.create({
        data: { username, passwordHash: await hashPassword(parsed.data.password) },
      });
      return {
        token: signToken({ sub: user.id, username: user.username }),
        user: { id: user.id, username: user.username },
      };
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(409).send({ error: "Tên tài khoản đã tồn tại." });
      throw error;
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    if (isAuthRateLimited(request)) return reply.code(429).send({ error: "Thử lại sau ít phút." });
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dữ liệu không hợp lệ." });
    const username = parsed.data.username.toLowerCase();
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: "Sai tên tài khoản hoặc mật khẩu." });
    }
    return {
      token: signToken({ sub: user.id, username: user.username }),
      user: { id: user.id, username: user.username },
    };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return { user };
  });

  app.get("/api/characters", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const characters = await prisma.character.findMany({
      where: { userId: user.id },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });
    return { characters: characters.map((character) => characterDto(character)) };
  });

  app.post("/api/characters", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const parsed = characterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." });
    }
    const { name, sect, faction, gender, appearance } = parsed.data;
    const sectDefinition = SECTS[sect];
    if (!sectDefinition.allowedGenders.includes(gender)) {
      return reply.code(400).send({
        error:
          sect === "SHAOLIN"
            ? "Thiếu Lâm chỉ nhận nhân vật nam."
            : "Nga My chỉ nhận nhân vật nữ.",
      });
    }

    const count = await prisma.character.count({ where: { userId: user.id } });
    if (count >= 4) return reply.code(400).send({ error: "Mỗi tài khoản tối đa 4 nhân vật." });

    const existing = await prisma.character.findUnique({ where: { name } });
    if (existing) return reply.code(409).send({ error: "Tên nhân vật đã được sử dụng." });

    try {
      const character = await createCharacter({
        userId: user.id,
        name,
        sect,
        faction,
        gender,
        appearance,
        starterItems: STARTER_ITEMS[sect],
        x: SPAWN_POINTS[faction].x,
        z: SPAWN_POINTS[faction].z,
      });
      return reply.code(201).send({ character: characterDto(character) });
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(409).send({ error: "Tên nhân vật đã được sử dụng." });
      throw error;
    }
  });

  app.get("/api/characters/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const params = z.object({ id: z.string() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Thiếu mã nhân vật." });
    const character = await prisma.character.findFirst({
      where: { id: params.data.id, userId: user.id },
      include: { items: true },
    });
    if (!character) return reply.code(404).send({ error: "Không tìm thấy nhân vật." });
    return { character: characterDto(character) };
  });
}
