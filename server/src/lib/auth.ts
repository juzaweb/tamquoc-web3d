import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { FastifyRequest } from "fastify";
import { config } from "../config.js";

export interface TokenPayload {
  sub: string;
  username: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === "string" || !decoded.sub || typeof decoded.sub !== "string") return null;
    return { sub: decoded.sub, username: String(decoded.username ?? "") };
  } catch {
    return null;
  }
}

export function tokenFromRequest(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export function authenticate(request: FastifyRequest): TokenPayload | null {
  const token = tokenFromRequest(request);
  return token ? verifyToken(token) : null;
}
