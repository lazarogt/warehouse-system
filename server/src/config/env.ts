import dotenv from "dotenv";
import path from "node:path";
import type { CookieOptions } from "express";
import type { UserRole } from "../../../shared/src";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const getNumber = (value: string | undefined, fallback: number) => {
  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) ? fallback : parsedValue;
};

const getBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) {
    return fallback;
  }

  return value.trim().toLowerCase() === "true";
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  serverPort: getNumber(process.env.SERVER_PORT, 3000),
  jwtSecret: process.env.JWT_SECRET ?? "warehouse-system-dev-secret",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  session: {
    cookieName: process.env.SESSION_COOKIE_NAME ?? "warehouse_session",
    ttlHours: getNumber(process.env.SESSION_TTL_HOURS, 168),
    cookieSameSite: ((process.env.SESSION_COOKIE_SAME_SITE ?? "lax").trim().toLowerCase() ===
    "none"
      ? "none"
      : (process.env.SESSION_COOKIE_SAME_SITE ?? "lax").trim().toLowerCase() === "strict"
        ? "strict"
        : "lax") as CookieOptions["sameSite"],
    cookieSecure:
      process.env.SESSION_COOKIE_SECURE !== undefined
        ? getBoolean(process.env.SESSION_COOKIE_SECURE, false)
        : process.env.NODE_ENV === "production",
    cookieDomain: process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined,
  },
  defaultAdmin: {
    name: process.env.DEFAULT_ADMIN_NAME ?? "Administrador",
    username: (process.env.DEFAULT_ADMIN_USERNAME ?? "administrador").trim().toLowerCase(),
    email: (process.env.DEFAULT_ADMIN_EMAIL ?? "admin@warehouse.local").trim().toLowerCase(),
    password: process.env.DEFAULT_ADMIN_PASSWORD ?? "admin123",
    role: "admin" as UserRole,
  },
  database: {
    host: process.env.DB_HOST ?? "localhost",
    port: getNumber(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME ?? "warehouse_system",
    user: process.env.DB_USER ?? "warehouse_user",
    password: process.env.DB_PASSWORD ?? "warehouse_password",
  },
};
