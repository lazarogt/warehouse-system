import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeDesktopDatabase } from "../db/init";
import {
  createDesktopBackupService,
  getBackupsDirectory,
  restoreBackupFile,
  runIntegrityCheck,
} from "./backup-service";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

function withTempUserDataPath(run: (userDataPath: string) => Promise<void> | void): Promise<void> | void {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "warehouse-backup-"));
  try {
    const result = run(tempDirectory);

    if (result instanceof Promise) {
      return result.finally(() => {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
      });
    }

    fs.rmSync(tempDirectory, { recursive: true, force: true });
    return undefined;
  } catch (error) {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
    throw error;
  }
}

test("createBackup stores timestamped files and rotates old backups", async () => {
  await withTempUserDataPath(async (userDataPath) => {
    const runtime = initializeDesktopDatabase({
      isDevelopment: false,
      logger: silentLogger,
      userDataPath,
    });

    const backupService = createDesktopBackupService({
      getDatabase: () => runtime.database,
      getDatabasePath: () => runtime.databasePath,
      logger: silentLogger,
      maxBackupFiles: 2,
      userDataPath,
    });

    try {
      const firstBackup = await backupService.createBackup("manual");
      await new Promise((resolve) => setTimeout(resolve, 10));
      const secondBackup = await backupService.createBackup("automatic");
      await new Promise((resolve) => setTimeout(resolve, 10));
      const thirdBackup = await backupService.createBackup("manual");
      const backupFiles = fs.readdirSync(getBackupsDirectory(userDataPath));

      assert.equal(firstBackup.fileName.endsWith(".db"), true);
      assert.equal(secondBackup.fileName.includes("automatic"), true);
      assert.equal(fs.existsSync(thirdBackup.filePath), true);
      assert.equal(backupFiles.length, 2);
    } finally {
      runtime.close();
    }
  });
});

test("restoreBackupFile replaces the active database with the selected backup safely", async () => {
  await withTempUserDataPath(async (userDataPath) => {
    let runtime = initializeDesktopDatabase({
      isDevelopment: false,
      logger: silentLogger,
      userDataPath,
    });

    const backupService = createDesktopBackupService({
      getDatabase: () => runtime.database,
      getDatabasePath: () => runtime.databasePath,
      logger: silentLogger,
      userDataPath,
    });

    try {
      runtime.services.warehouseData.createProduct({
        name: "Saved Product",
        price: 10,
        sku: "SAVE-001",
        stock: 2,
      });

      const backup = await backupService.createBackup("manual");

      runtime.services.warehouseData.createProduct({
        name: "Later Product",
        price: 20,
        sku: "SAVE-002",
        stock: 4,
      });

      runtime.close();

      restoreBackupFile({
        backupFilePath: backup.filePath,
        databasePath: path.join(userDataPath, "warehouse.db"),
        logger: silentLogger,
      });

      runtime = initializeDesktopDatabase({
        isDevelopment: false,
        logger: silentLogger,
        userDataPath,
      });

      const products = runtime.services.warehouseData.listProducts();

      assert.equal(products.some((product) => product.sku === "SAVE-001"), true);
      assert.equal(products.some((product) => product.sku === "SAVE-002"), false);
      assert.deepEqual(runIntegrityCheck(runtime.database), {
        ok: true,
        message: "ok",
      });
    } finally {
      runtime.close();
    }
  });
});
