import type {
  ChangePasswordInput,
  CreateUserInput,
  LoginInput,
  RegisterUserInput,
  UpdateUserInput,
  UpdateUserRoleInput,
  UserRole,
  UserStatus,
} from "../../../../shared/src";
import { USER_ROLES, USER_STATUSES } from "../../../../shared/src";
import { ensureObject, readString } from "../../common/validation";
import { AppError } from "../../common/errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/;

const readEmail = (value: unknown, fieldName: string) => {
  const email = readString(value, fieldName, { maxLength: 255 }) as string;
  const normalized = email.toLowerCase();

  if (!EMAIL_PATTERN.test(normalized)) {
    throw new AppError(400, `${fieldName} must be a valid email address.`);
  }

  return normalized;
};

const readPassword = (value: unknown, fieldName: string) => {
  const password = readString(value, fieldName, { maxLength: 128 }) as string;

  if (password.length < 8) {
    throw new AppError(400, `${fieldName} must be at least 8 characters long.`);
  }

  return password;
};

const readUsername = (value: unknown, fieldName: string, optional = false) => {
  if (optional && (value === undefined || value === null || value === "")) {
    return undefined;
  }

  const username = readString(value, fieldName, { maxLength: 40 }) as string;
  const normalized = username.toLowerCase();

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new AppError(
      400,
      `${fieldName} must be 3-40 characters and contain only letters, numbers, dot, underscore or hyphen.`,
    );
  }

  return normalized;
};

const readRole = (value: unknown): UserRole => {
  if (typeof value !== "string" || !USER_ROLES.includes(value as UserRole)) {
    throw new AppError(400, "role must be one of admin, manager or operator.");
  }

  return value as UserRole;
};

const readStatus = (value: unknown): UserStatus => {
  if (typeof value !== "string" || !USER_STATUSES.includes(value as UserStatus)) {
    throw new AppError(400, "status must be either active or inactive.");
  }

  return value as UserStatus;
};

export const parseRegisterInput = (payload: unknown): RegisterUserInput => {
  const body = ensureObject(payload);

  return {
    name: readString(body.name, "name", { maxLength: 120 }) as string,
    username: readUsername(body.username, "username", true),
    email: readEmail(body.email, "email"),
    password: readPassword(body.password, "password"),
  };
};

export const parseLoginInput = (payload: unknown): LoginInput => {
  const body = ensureObject(payload);
  const identifier = body.identifier ?? body.email;

  return {
    identifier: readString(identifier, "identifier", { maxLength: 255 }) as string,
    password: readPassword(body.password, "password"),
  };
};

export const parseCreateUserInput = (payload: unknown): CreateUserInput => {
  const body = ensureObject(payload);
  const registerInput = parseRegisterInput(body);

  return {
    ...registerInput,
    role: readRole(body.role),
    status: readStatus(body.status ?? "active"),
  };
};

export const parseUpdateUserRoleInput = (payload: unknown): UpdateUserRoleInput => {
  const body = ensureObject(payload);

  return {
    role: readRole(body.role),
  };
};

export const parseUpdateUserInput = (payload: unknown): UpdateUserInput => {
  const body = ensureObject(payload);

  return {
    name: readString(body.name, "name", { maxLength: 120 }) as string,
    username: readUsername(body.username, "username", true),
    email: readEmail(body.email, "email"),
    role: readRole(body.role),
    status: readStatus(body.status),
  };
};

export const parseChangePasswordInput = (payload: unknown): ChangePasswordInput => {
  const body = ensureObject(payload);
  const currentPassword = readPassword(body.currentPassword, "currentPassword");
  const newPassword = readPassword(body.newPassword, "newPassword");

  if (currentPassword === newPassword) {
    throw new AppError(400, "newPassword must be different from currentPassword.");
  }

  return {
    currentPassword,
    newPassword,
  };
};
