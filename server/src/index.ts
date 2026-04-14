import { APP_NAME } from "../../shared/src";
import { createApp } from "./app";
import { env } from "./config/env";
import { closeDatabase, runOptimize } from "./lib/db";
import { runMigrations } from "./lib/migrations";
import { seedDatabaseIfEmpty } from "./db/seed";
import { ensureDefaultAdminUser } from "./modules/users/user.service";

const registerShutdownHandler = (signal: NodeJS.Signals) => {
  process.on(signal, () => {
    void closeDatabase().finally(() => {
      process.exit(0);
    });
  });
};

const bootstrap = async () => {
  await runMigrations();
  await ensureDefaultAdminUser();
  await seedDatabaseIfEmpty();
  runOptimize();

  const app = createApp();

  app.listen(env.serverPort, () => {
    console.log(`${APP_NAME} API listening on port ${env.serverPort}`);
  });
};

registerShutdownHandler("SIGINT");
registerShutdownHandler("SIGTERM");

void bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
