import { closeDatabase } from "../lib/db";
import { runSeed } from "../db/seed";

void runSeed()
  .then((result) => {
    console.log("Seed result:", result);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
