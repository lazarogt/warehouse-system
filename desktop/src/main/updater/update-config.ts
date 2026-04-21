export const AUTO_UPDATE_DISABLE_ENV_NAME = "WAREHOUSE_DISABLE_AUTO_UPDATE";

const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export function isAutoUpdateEnabled(options?: {
  env?: NodeJS.ProcessEnv;
  isPackaged?: boolean;
}): boolean {
  const env = options?.env ?? process.env;
  const isPackaged = options?.isPackaged ?? false;

  if (!isPackaged) {
    return false;
  }

  const rawValue = env[AUTO_UPDATE_DISABLE_ENV_NAME];

  if (typeof rawValue !== "string") {
    return true;
  }

  return !TRUTHY_ENV_VALUES.has(rawValue.trim().toLowerCase());
}
