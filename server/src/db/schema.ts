import { seedDatabaseIfEmpty } from "./seed";
import { runMigrations as runSqliteMigrations, resetDatabase as resetSqliteDatabase } from "../lib/migrations";
import { ensureDefaultAdminUser } from "../modules/users/user.service";

export const runMigrations = async () => {
  await runSqliteMigrations();
  await ensureDefaultAdminUser();
  await seedDatabaseIfEmpty();
};

export const resetDatabase = async () => {
  await resetSqliteDatabase();
  await ensureDefaultAdminUser();
};
