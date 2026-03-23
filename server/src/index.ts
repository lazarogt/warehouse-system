import { APP_NAME } from "../../shared/src";
import { createApp } from "./app";
import { env } from "./config/env";
import { runMigrations } from "./db/schema";

const bootstrap = async () => {
  await runMigrations();

  const app = createApp();

  app.listen(env.serverPort, () => {
    console.log(`${APP_NAME} API listening on port ${env.serverPort}`);
  });
};

void bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
