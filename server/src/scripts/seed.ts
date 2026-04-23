import { closeDatabase } from "../lib/db";
import { runSeed } from "../db/seed";

void runSeed()
  .then(() => {
    return undefined;
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
