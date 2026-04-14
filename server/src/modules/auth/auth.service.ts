import type { ChangePasswordInput, LoginInput, User } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query } from "../../lib/db";
import { env } from "../../config/env";
import { getUserById, getUserByIdentifierWithPassword, registerUser } from "../users/user.service";
import { recordCriticalEvent } from "../logging/logging.service";
import { generateSessionToken, hashPassword, hashSessionToken, verifyPassword } from "./auth.security";

type SessionLookupRow = {
  sessionId: number;
  userId: number;
  expiresAt: string;
};

const deleteExpiredSessions = async () => {
  await query("DELETE FROM auth_sessions WHERE expires_at <= NOW();");
};

const createSession = async (userId: number) => {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + env.session.ttlHours * 60 * 60 * 1000);

  await query(
    `
      INSERT INTO auth_sessions (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3);
    `,
    [userId, tokenHash, expiresAt.toISOString()],
  );

  return {
    token,
    expiresAt,
  };
};

export const registerAndCreateSession = async (input: {
  name: string;
  username?: string;
  email: string;
  password: string;
}) => {
  const user = await registerUser(input);
  const session = await createSession(user.id);

  return {
    user,
    session,
  };
};

export const loginAndCreateSession = async (input: LoginInput) => {
  await deleteExpiredSessions();

  const userWithPassword = await getUserByIdentifierWithPassword(input.identifier);

  if (!userWithPassword) {
    recordCriticalEvent({
      eventType: "auth.login_failed",
      metadata: {
        identifier: input.identifier.trim().toLowerCase(),
        reason: "user_not_found",
      },
    });
    throw new AppError(401, "Invalid username/email or password.");
  }

  if (userWithPassword.status !== "active") {
    recordCriticalEvent({
      eventType: "auth.login_failed",
      targetUserId: userWithPassword.id,
      metadata: {
        identifier: input.identifier.trim().toLowerCase(),
        reason: "inactive_user",
      },
    });
    throw new AppError(403, "Your account is inactive.");
  }

  const validPassword = await verifyPassword(input.password, userWithPassword.passwordHash);

  if (!validPassword) {
    recordCriticalEvent({
      eventType: "auth.login_failed",
      targetUserId: userWithPassword.id,
      metadata: {
        identifier: input.identifier.trim().toLowerCase(),
        reason: "invalid_password",
      },
    });
    throw new AppError(401, "Invalid username/email or password.");
  }

  const user: User = {
    id: userWithPassword.id,
    name: userWithPassword.name,
    username: userWithPassword.username,
    email: userWithPassword.email,
    role: userWithPassword.role,
    status: userWithPassword.status,
    mustChangePassword: userWithPassword.mustChangePassword,
    passwordResetAt: userWithPassword.passwordResetAt,
    createdAt: userWithPassword.createdAt,
    updatedAt: userWithPassword.updatedAt,
  };

  const session = await createSession(user.id);

  recordCriticalEvent({
    eventType: "auth.login_succeeded",
    actorUserId: user.id,
    targetUserId: user.id,
    metadata: {
      mustChangePassword: user.mustChangePassword,
    },
  });

  return {
    user,
    session,
  };
};

export const changeOwnPassword = async (userId: number, input: ChangePasswordInput) => {
  const currentUser = await getUserById(userId);

  if (!currentUser) {
    throw new AppError(404, "User not found.");
  }

  const passwordLookupResult = await query<{ passwordHash: string }>(
    `
      SELECT password_hash AS "passwordHash"
      FROM users
      WHERE id = $1
        AND ${activeFilter()};
    `,
    [userId],
  );

  const storedPasswordHash = passwordLookupResult.rows[0]?.passwordHash;

  if (!storedPasswordHash) {
    throw new AppError(404, "User not found.");
  }

  const validCurrentPassword = await verifyPassword(input.currentPassword, storedPasswordHash);

  if (!validCurrentPassword) {
    throw new AppError(400, "Current password is invalid.");
  }

  const nextPasswordHash = await hashPassword(input.newPassword);

  await query(
    `
      UPDATE users
      SET
        password_hash = $2,
        must_change_password = FALSE,
        password_reset_at = NULL,
        password_reset_by = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND ${activeFilter()};
    `,
    [userId, nextPasswordHash],
  );

  const updatedUser = await getUserById(userId);

  if (!updatedUser) {
    throw new AppError(500, "Unable to load updated user.");
  }

  recordCriticalEvent({
    eventType: "auth.password_changed",
    actorUserId: userId,
    targetUserId: userId,
  });

  return updatedUser;
};

export const getAuthenticatedUserByToken = async (token: string) => {
  await deleteExpiredSessions();

  const sessionResult = await query<SessionLookupRow>(
    `
      SELECT
        id AS "sessionId",
        user_id AS "userId",
        expires_at AS "expiresAt"
      FROM auth_sessions
      WHERE token_hash = $1
        AND expires_at > NOW();
    `,
    [hashSessionToken(token)],
  );

  const session = sessionResult.rows[0];

  if (!session) {
    return null;
  }

  const user = await getUserById(session.userId);

  if (!user) {
    await query("DELETE FROM auth_sessions WHERE id = $1;", [session.sessionId]);
    return null;
  }

  if (user.status !== "active") {
    await query("DELETE FROM auth_sessions WHERE id = $1;", [session.sessionId]);
    return null;
  }

  return user;
};

export const logoutByToken = async (token: string | undefined) => {
  if (!token) {
    return;
  }

  await query("DELETE FROM auth_sessions WHERE token_hash = $1;", [hashSessionToken(token)]);
};
