import { existsSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { Server } from "socket.io";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { registerRoutes } from "./routes.js";
import { registerSocketHandlers } from "./socket.js";
import { GameWorld } from "./game/world.js";

const app = Fastify({ logger: { level: "info" } });

await app.register(cors, { origin: true });

app.addHook("onSend", async (_request, reply, payload) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
  return payload;
});

const io = new Server(app.server, {
  cors: { origin: true, credentials: true },
});
const world = new GameWorld(io);
registerSocketHandlers(io, world);
world.start();

await registerRoutes(app);

const clientDist = path.resolve(process.cwd(), "dist/client");
if (existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "Not found" });
  });
}

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down");
  world.stop();
  await world.persistAll();
  io.close();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
