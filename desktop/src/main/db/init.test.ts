import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDesktopDatabase } from "./database";
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
      assert.equal(runtime.services.warehouseData.listWarehouses().length, 2);
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

test("initializeDesktopDatabase migrates v1 data into the default warehouse safely", () => {
  withTempUserDataPath((userDataPath) => {
    const databasePath = path.join(userDataPath, "warehouse.db");
    const legacyDatabase = createDesktopDatabase({
      databasePath,
      logger: silentLogger,
    });

    try {
      legacyDatabase.exec(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          sku TEXT NOT NULL UNIQUE,
          price REAL NOT NULL CHECK (price >= 0),
          stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
          created_at TEXT NOT NULL
        );

        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'operator'))
        );

        CREATE TABLE stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('in', 'out')),
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          date TEXT NOT NULL,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
        );
      `);

      legacyDatabase.run(
        `
          INSERT INTO products (name, sku, price, stock, created_at)
          VALUES (?, ?, ?, ?, ?);
        `,
        ["Legacy Keyboard", "LEG-001", 25, 7, "2026-01-01T00:00:00.000Z"],
      );
      legacyDatabase.run(
        `
          INSERT INTO stock_movements (product_id, type, quantity, date)
          VALUES (?, ?, ?, ?);
        `,
        [1, "in", 7, "2026-01-02T00:00:00.000Z"],
      );
      legacyDatabase.pragma("user_version = 1");
    } finally {
      legacyDatabase.close();
    }

    const runtime = initializeDesktopDatabase({
      isDevelopment: false,
      logger: silentLogger,
      userDataPath,
    });

    try {
      assert.equal(runtime.database.pragma<number>("user_version", { simple: true }), 2);
      const warehouses = runtime.services.warehouseData.listWarehouses();
      assert.equal(warehouses.length, 1);

      const defaultWarehouse = warehouses[0];
      assert.ok(defaultWarehouse);

      const migratedStock = runtime.services.warehouseData.getWarehouseStock({
        warehouseId: defaultWarehouse.id,
        productId: 1,
      });
      assert.equal(migratedStock.quantity, 7);

      const movements = runtime.services.warehouseData.listStockMovements();
      assert.equal(movements.length, 1);
      assert.equal(movements[0]?.warehouseId, defaultWarehouse.id);

      const product = runtime.services.warehouseData.listProducts()[0];
      assert.equal(product?.stock, 7);
    } finally {
      runtime.close();
    }
  });
});
