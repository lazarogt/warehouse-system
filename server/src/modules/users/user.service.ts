import { randomBytes } from "node:crypto";
import type {
  CreateUserInput,
  RegisterUserInput,
  ResetPasswordResponse,
  UpdateUserInput,
  UpdateUserRoleInput,
  User,
  UserRole,
  UserStatus,
} from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query, withTransaction } from "../../config/db";
import { env } from "../../config/env";
import { hashPassword } from "../auth/auth.security";
import { recordCriticalEvent } from "../logging/logging.service";

type UserRow = User & {
  passwordHash?: string;
};

const userSelect = `
  SELECT
    id,
    name,
    username,
    email,
    role,
    status,
    must_change_password AS "mustChangePassword",
    password_reset_at AS "passwordResetAt",
    created_at AS "createdAt",
    updated_at AS "updatedAt"
`;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeUsername = (username: string) => username.trim().toLowerCase();

const buildUsernameCandidate = (input: { username?: string; email: string; name: string }) => {
  const source =
    input.username?.trim() ||
    input.email.trim().split("@")[0] ||
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-");

  const normalized = source.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "user";
};

const ensureUniqueUsername = async (baseUsername: string, excludeId?: number) => {
  let suffix = 0;
  let candidate = normalizeUsername(baseUsername);

  while (true) {
    const result = await query<{ id: number }>(
      `
        SELECT id
        FROM users
        WHERE username = $1
          AND ${activeFilter()}
          AND ($2::bigint IS NULL OR id <> $2)
        LIMIT 1;
      `,
      [candidate, excludeId ?? null],
    );

    if (!result.rows[0]) {
      return candidate;
    }

    suffix += 1;
    candidate = `${baseUsername}-${suffix}`;
  }
};

const mapConflictError = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    throw new AppError(409, "A user with that email or username already exists.");
  }

  throw error;
};

export const listUsers = async () => {
  const result = await query<UserRow>(`
    ${userSelect}
    FROM users
    WHERE ${activeFilter()}
    ORDER BY id;
  `);

  return result.rows;
};

export const getUserById = async (id: number) => {
  const result = await query<UserRow>(
    `
      ${userSelect}
      FROM users
      WHERE id = $1
        AND ${activeFilter()};
    `,
    [id],
  );

  return result.rows[0] ?? null;
};

export const getUserByIdentifierWithPassword = async (identifier: string) => {
  const normalizedIdentifier = identifier.trim().toLowerCase();

  const result = await query<UserRow & { passwordHash: string }>(
    `
      ${userSelect},
      password_hash AS "passwordHash"
      FROM users
      WHERE ${activeFilter()}
        AND (email = $1 OR username = $1);
    `,
    [normalizedIdentifier],
  );

  return result.rows[0] ?? null;
};

export const getUserByEmailWithPassword = async (email: string) => {
  return getUserByIdentifierWithPassword(email);
};

const insertUser = async (input: {
  name: string;
  username?: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
}) => {
  const passwordHash = await hashPassword(input.password);
  const username = await ensureUniqueUsername(
    buildUsernameCandidate({
      username: input.username,
      email: input.email,
      name: input.name,
    }),
  );

  try {
    const result = await query<UserRow>(
      `
        INSERT INTO users (name, username, email, password_hash, role, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          name,
          username,
          email,
          role,
          status,
          must_change_password AS "mustChangePassword",
          password_reset_at AS "passwordResetAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt";
      `,
      [input.name, username, normalizeEmail(input.email), passwordHash, input.role, input.status],
    );

    return result.rows[0];
  } catch (error) {
    mapConflictError(error);
    throw error;
  }
};

export const registerUser = async (input: RegisterUserInput) => {
  return insertUser({
    ...input,
    role: "operator",
    status: "active",
  });
};

export const createUser = async (input: CreateUserInput, actorUserId?: number | null) => {
  const user = await insertUser(input);
  recordCriticalEvent({
    eventType: "user.created",
    actorUserId: actorUserId ?? null,
    targetUserId: user.id,
    targetEntityId: user.id,
    targetEntityType: "user",
    metadata: {
      username: user.username,
      role: user.role,
    },
  });
  return user;
};

export const updateUser = async (id: number, input: UpdateUserInput, actorUserId?: number | null) => {
  const username = await ensureUniqueUsername(
    buildUsernameCandidate({
      username: input.username,
      email: input.email,
      name: input.name,
    }),
    id,
  );

  try {
    const result = await query<UserRow>(
      `
        UPDATE users
        SET
          name = $2,
          username = $3,
          email = $4,
          role = $5,
          status = $6,
          updated_at = NOW()
        WHERE id = $1
          AND ${activeFilter()}
        RETURNING
          id,
          name,
          username,
          email,
          role,
          status,
          must_change_password AS "mustChangePassword",
          password_reset_at AS "passwordResetAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt";
      `,
      [id, input.name, username, normalizeEmail(input.email), input.role, input.status],
    );

    if (!result.rows[0]) {
      throw new AppError(404, "User not found.");
    }

    recordCriticalEvent({
      eventType: "user.updated",
      actorUserId: actorUserId ?? null,
      targetUserId: result.rows[0].id,
      targetEntityId: result.rows[0].id,
      targetEntityType: "user",
      metadata: {
        username: result.rows[0].username,
        role: result.rows[0].role,
        status: result.rows[0].status,
      },
    });

    return result.rows[0];
  } catch (error) {
    mapConflictError(error);
    throw error;
  }
};

export const updateUserRole = async (
  id: number,
  input: UpdateUserRoleInput,
  actorUserId?: number | null,
) => {
  const result = await query<UserRow>(
    `
      UPDATE users
      SET
        role = $2,
        updated_at = NOW()
      WHERE id = $1
        AND ${activeFilter()}
      RETURNING
        id,
        name,
        username,
        email,
        role,
        status,
        must_change_password AS "mustChangePassword",
        password_reset_at AS "passwordResetAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [id, input.role],
  );

  if (!result.rows[0]) {
    throw new AppError(404, "User not found.");
  }

  recordCriticalEvent({
    eventType: "user.role_updated",
    actorUserId: actorUserId ?? null,
    targetUserId: result.rows[0].id,
    targetEntityId: result.rows[0].id,
    targetEntityType: "user",
    metadata: {
      role: result.rows[0].role,
    },
  });

  return result.rows[0];
};

export const deleteUser = async (id: number, actorUserId?: number | null) => {
  await withTransaction(async (client) => {
    const existingUser = await client.query<{ id: number; isDeleted: boolean }>(
      `
        SELECT
          id,
          is_deleted AS "isDeleted"
        FROM users
        WHERE id = $1
        FOR UPDATE;
      `,
      [id],
    );

    if (!existingUser.rows[0]) {
      throw new AppError(404, "User not found.");
    }

    if (existingUser.rows[0].isDeleted) {
      throw new AppError(409, "User is already deleted.");
    }

    await client.query(
      `
        UPDATE users
        SET
          is_deleted = TRUE,
          deleted_at = NOW(),
          status = 'inactive',
          updated_at = NOW()
        WHERE id = $1
          AND ${activeFilter()};
      `,
      [id],
    );

    await client.query("DELETE FROM auth_sessions WHERE user_id = $1;", [id]);
  });

  recordCriticalEvent({
    eventType: "user.deleted",
    actorUserId: actorUserId ?? null,
    targetUserId: id,
    targetEntityId: id,
    targetEntityType: "user",
  });
};

const generateTemporaryPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(8);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

export const resetUserPassword = async (
  id: number,
  actorUserId: number,
): Promise<ResetPasswordResponse> => {
  return withTransaction(async (client) => {
    const userResult = await client.query<UserRow>(
      `
        ${userSelect}
        FROM users
        WHERE id = $1
          AND ${activeFilter()};
      `,
      [id],
    );

    const user = userResult.rows[0];

    if (!user) {
      throw new AppError(404, "User not found.");
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    await client.query(
      `
        UPDATE users
        SET
          password_hash = $2,
          must_change_password = TRUE,
          password_reset_at = NOW(),
          password_reset_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND ${activeFilter()};
      `,
      [id, passwordHash, actorUserId],
    );

    await client.query("DELETE FROM auth_sessions WHERE user_id = $1;", [id]);

    recordCriticalEvent({
      eventType: "user.password_reset",
      actorUserId,
      targetUserId: user.id,
      targetEntityId: user.id,
      targetEntityType: "user",
      metadata: {
        username: user.username,
      },
    });

    return {
      userId: user.id,
      username: user.username,
      temporaryPassword: env.nodeEnv === "production" ? undefined : temporaryPassword,
      message: "Password reset successfully",
    };
  });
};

export const ensureDefaultAdminUser = async () => {
  const existingUser = await getUserByIdentifierWithPassword(env.defaultAdmin.username);

  if (existingUser) {
    const nextUsername =
      existingUser.username === env.defaultAdmin.username
        ? existingUser.username
        : await ensureUniqueUsername(env.defaultAdmin.username, existingUser.id);

    await query(
      `
        UPDATE users
        SET
          name = $2,
          username = $3,
          email = $4,
          role = 'admin',
          status = 'active',
          must_change_password = FALSE,
          password_reset_at = NULL,
          password_reset_by = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND ${activeFilter()};
      `,
      [existingUser.id, env.defaultAdmin.name, nextUsername, env.defaultAdmin.email],
    );

    return;
  }

  const existingAdminByEmail = await getUserByIdentifierWithPassword(env.defaultAdmin.email);

  if (existingAdminByEmail) {
    const nextUsername = await ensureUniqueUsername(env.defaultAdmin.username, existingAdminByEmail.id);

    await query(
      `
        UPDATE users
        SET
          name = $2,
          username = $3,
          email = $4,
          role = 'admin',
          status = 'active',
          must_change_password = FALSE,
          password_reset_at = NULL,
          password_reset_by = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND ${activeFilter()};
      `,
      [existingAdminByEmail.id, env.defaultAdmin.name, nextUsername, env.defaultAdmin.email],
    );

    return;
  }

  await insertUser({
    name: env.defaultAdmin.name,
    username: env.defaultAdmin.username,
    email: env.defaultAdmin.email,
    password: env.defaultAdmin.password,
    role: env.defaultAdmin.role,
    status: "active",
  });
};
