export const USER_ROLES = ["admin", "manager", "operator"] as const;
export const USER_STATUSES = ["active", "inactive"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
