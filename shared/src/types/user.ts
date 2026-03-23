import type { UserRole, UserStatus } from "../constants/auth";

export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  passwordResetAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterUserInput {
  name: string;
  username?: string;
  email: string;
  password: string;
}

export interface CreateUserInput extends RegisterUserInput {
  role: UserRole;
  status: UserStatus;
}

export interface UpdateUserRoleInput {
  role: UserRole;
}

export interface UpdateUserInput {
  name: string;
  username?: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface ResetPasswordResponse {
  userId: number;
  username: string;
  temporaryPassword?: string;
  message: string;
}
