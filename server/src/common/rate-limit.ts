import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errors";

type RateLimitOptions = {
  key: string;
  maxRequests: number;
  windowMs: number;
  message?: string;
};

type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

const store = new Map<string, RateLimitEntry>();
const isRateLimitEnabled = process.env.NODE_ENV === "production";

const getClientIdentifier = (request: Request) => {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || request.ip || "unknown";
  }

  return request.ip || "unknown";
};

const cleanupExpiredEntries = (now: number) => {
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
};

export const createRateLimit = (options: RateLimitOptions) => {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!isRateLimitEnabled) {
      next();
      return;
    }

    const now = Date.now();
    cleanupExpiredEntries(now);

    const clientKey = `${options.key}:${getClientIdentifier(request)}`;
    const currentEntry = store.get(clientKey);

    if (!currentEntry || currentEntry.expiresAt <= now) {
      store.set(clientKey, {
        count: 1,
        expiresAt: now + options.windowMs,
      });
      next();
      return;
    }

    if (currentEntry.count >= options.maxRequests) {
      next(new AppError(429, options.message ?? "Too many requests. Please try again later."));
      return;
    }

    currentEntry.count += 1;
    store.set(clientKey, currentEntry);
    next();
  };
};
