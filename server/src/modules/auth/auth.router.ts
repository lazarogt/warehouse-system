import { Router } from "express";
import { AppError } from "../../common/errors";
import { asyncHandler } from "../../common/http";
import { createRateLimit } from "../../common/rate-limit";
import { clearSessionCookie, setSessionCookie } from "./auth.cookies";
import { requireAuthentication } from "./auth.middleware";
import {
  changeOwnPassword,
  loginAndCreateSession,
  logoutByToken,
} from "./auth.service";
import { parseChangePasswordInput, parseLoginInput } from "./auth.validation";

const router = Router();
const sensitiveAuthRateLimit = createRateLimit({
  key: "auth-sensitive",
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
  message: "Too many authentication attempts. Please try again later.",
});

router.post(
  "/register",
  sensitiveAuthRateLimit,
  asyncHandler(async (request, response) => {
    void request;
    void response;
    throw new AppError(403, "Public user registration is disabled.");
  }),
);

router.post(
  "/login",
  sensitiveAuthRateLimit,
  asyncHandler(async (request, response) => {
    const result = await loginAndCreateSession(parseLoginInput(request.body));
    setSessionCookie(response, result.session.token, result.session.expiresAt);
    response.json({
      user: result.user,
    });
  }),
);

router.post(
  "/logout",
  requireAuthentication,
  asyncHandler(async (request, response) => {
    await logoutByToken(request.sessionToken);
    clearSessionCookie(response);
    response.status(204).send();
  }),
);

router.get(
  "/me",
  requireAuthentication,
  asyncHandler(async (request, response) => {
    response.json({
      user: request.authenticatedUser,
    });
  }),
);

router.post(
  "/change-password",
  requireAuthentication,
  sensitiveAuthRateLimit,
  asyncHandler(async (request, response) => {
    const userId = request.authenticatedUser?.id;

    if (!userId) {
      throw new AppError(401, "Authentication required.");
    }

    const user = await changeOwnPassword(userId, parseChangePasswordInput(request.body));
    response.json({
      user,
    });
  }),
);

export default router;
