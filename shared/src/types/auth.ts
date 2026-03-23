import type { User } from "./user";

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AuthResponse {
  user: User;
}
