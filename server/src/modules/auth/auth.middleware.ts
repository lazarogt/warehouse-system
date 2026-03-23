import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { readSessionCookie } from "./auth.cookies";
import { getAuthenticatedUserByToken } from "./auth.service";

export const requireAuthentication = (request: Request, _response: Response, next: NextFunction) => {
  void (async () => {
    const sessionToken = readSessionCookie(request);

    if (!sessionToken) {
      throw new AppError(401, "Authentication required.");
    }

    const user = await getAuthenticatedUserByToken(sessionToken);

    if (!user) {
      throw new AppError(401, "Authentication required.");
    }

    request.authenticatedUser = user;
    request.sessionToken = sessionToken;
    next();
  })().catch(next);
};

export const requireRoles = (...roles: UserRole[]) => {
  return (request: Request, _response: Response, next: NextFunction) => {
    const user = request.authenticatedUser;

    if (!user) {
      next(new AppError(401, "Authentication required."));
      return;
    }

    if (!roles.includes(user.role)) {
      next(new AppError(403, "You do not have permission to perform this action."));
      return;
    }

    next();
  };
};

export const requirePasswordChangeComplete = (
  request: Request,
  _response: Response,
  next: NextFunction,
) => {
  const user = request.authenticatedUser;

  if (!user) {
    next(new AppError(401, "Authentication required."));
    return;
  }

  if (user.mustChangePassword) {
    next(new AppError(403, "Password change required before accessing the application."));
    return;
  }

  next();
};
