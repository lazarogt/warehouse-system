import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeDesktopDatabase } from "./init";
import { DATABASE_SCHEMA_VERSION } from "./schema";
import { DatabaseValidationError } from "../services/warehouse-data-service";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

function withTempUserDataPath(run: (userDataPath: string) => void): void {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "warehouse-desktop-db-"));

  try {
    run(tempDirectory);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

test("initializeDesktopDatabase applies schema and seeds development data", () => {
  withTempUserDataPath((userDataPath) => {
    const runtime = initializeDesktopDatabase({
      isDevelopment: true,
      logger: silentLogger,
      userDataPath,
    });

    try {
      assert.equal(runtime.databasePath, path.join(userDataPath, "warehouse.db"));
      assert.equal(fs.existsSync(runtime.databasePath), true);
      assert.equal(
        runtime.database.pragma<number>("user_version", { simple: true }),
        DATABASE_SCHEMA_VERSION,
      );
      assert.deepEqual(runtime.services.warehouseData.getSummaryCounts(), {
        products: 3,
        stockMovements: 3,
        users: 3,
      });
    } finally {
      runtime.close();
    }
  });
});

test("initializeDesktopDatabase skips seed data in production mode", () => {
  withTempUserDataPath((userDataPath) => {
    const runtime = initializeDesktopDatabase({
      isDevelopment: false,
      logger: silentLogger,
      userDataPath,
    });

    try {
      assert.deepEqual(runtime.services.warehouseData.getSummaryCounts(), {
        products: 0,
        stockMovements: 0,
        users: 0,
      });
    } finally {
      runtime.close();
    }
  });
});

test("recordStockMovement prevents negative stock", () => {
  withTempUserDataPath((userDataPath) => {
    const runtime = initializeDesktopDatabase({
      isDevelopment: false,
      logger: silentLogger,
      userDataPath,
    });

    try {
      const product = runtime.services.warehouseData.createProduct({
        name: "Test Product",
        price: 12.5,
        sku: "TEST-001",
        stock: 0,
      });

      assert.throws(
        () =>
          runtime.services.warehouseData.recordStockMovement({
            productId: product.id,
            quantity: 1,
            type: "out",
          }),
        (error) => {
          assert.equal(error instanceof DatabaseValidationError, true);
          assert.match((error as Error).message, /Stock cannot become negative/);
          return true;
        },
      );
    } finally {
      runtime.close();
    }
  });
});
