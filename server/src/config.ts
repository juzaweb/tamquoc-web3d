import "dotenv/config";

const defaultSecret = "tamquoc-dev-secret-change-me";
const jwtSecret = process.env.JWT_SECRET ?? defaultSecret;

if (process.env.NODE_ENV === "production" && jwtSecret === defaultSecret) {
  throw new Error("JWT_SECRET must be set to a strong value in production.");
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret,
  jwtExpiresIn: "7d" as const,
  tickRateMs: 100,
  saveIntervalMs: 10_000,
};
