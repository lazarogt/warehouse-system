import type { Request, Response } from "express";
import { env } from "../../config/env";

const parseCookieHeader = (headerValue: string | undefined) => {
  if (!headerValue) {
    return {};
  }

  return headerValue.split(";").reduce<Record<string, string>>((cookies, chunk) => {
    const [rawName, ...rest] = chunk.trim().split("=");

    if (!rawName || rest.length === 0) {
      return cookies;
    }

    cookies[rawName] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
};

export const readSessionCookie = (request: Request) => {
  const cookies = parseCookieHeader(request.headers.cookie);
  return cookies[env.session.cookieName];
};

export const setSessionCookie = (response: Response, token: string, expiresAt: Date) => {
  response.cookie(env.session.cookieName, token, {
    httpOnly: true,
    sameSite: env.session.cookieSameSite,
    secure: env.session.cookieSecure,
    domain: env.session.cookieDomain,
    expires: expiresAt,
  });
};

export const clearSessionCookie = (response: Response) => {
  response.clearCookie(env.session.cookieName, {
    httpOnly: true,
    sameSite: env.session.cookieSameSite,
    secure: env.session.cookieSecure,
    domain: env.session.cookieDomain,
  });
};
