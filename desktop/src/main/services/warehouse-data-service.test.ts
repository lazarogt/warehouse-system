import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDesktopDatabase } from "../db/database";
import { DATABASE_MIGRATIONS } from "../db/schema";
import {
  DatabaseValidationError,
  createWarehouseDataService,
} from "./warehouse-data-service";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

function withTempDatabase(
  run: (service: ReturnType<typeof createWarehouseDataService>) => void,
): void {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "warehouse-desktop-service-"));
  const database = createDesktopDatabase({
    databasePath: path.join(tempDirectory, "warehouse.db"),
    logger: silentLogger,
  });

  try {
    for (const migration of DATABASE_MIGRATIONS) {
      database.transaction((transactionDatabase) => {
        for (const statement of migration.statements) {
          transactionDatabase.exec(statement);
        }

        transactionDatabase.pragma(`user_version = ${migration.version}`);
      }, "immediate");
    }

    run(
      createWarehouseDataService({
        database,
        logger: silentLogger,
      }),
    );
  } finally {
    database.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

test("setWarehouseStock updates warehouse-specific stock and keeps aggregate product stock in sync", () => {
  withTempDatabase((service) => {
    const overflowWarehouse = service.createWarehouse({
      name: "Overflow Warehouse",
      location: "Santiago Hub",
    });
    const product = service.createProduct({
      name: "Keyboard",
      sku: "KB-100",
      price: 50,
      stock: 4,
    });

    const updatedWarehouseStock = service.setWarehouseStock({
      warehouseId: overflowWarehouse.id,
      productId: product.id,
      quantity: 6,
    });

    assert.equal(updatedWarehouseStock.quantity, 6);
    assert.equal(
      service.getWarehouseStock({
        warehouseId: overflowWarehouse.id,
        productId: product.id,
      }).quantity,
      6,
    );

    const refreshedProduct = service.listProducts().find((candidate) => candidate.id === product.id);
    assert.equal(refreshedProduct?.stock, 10);
  });
});

test("recordStockMovement applies stock changes per warehouse and prevents negative warehouse stock", () => {
  withTempDatabase((service) => {
    const secondaryWarehouse = service.createWarehouse({
      name: "Secondary Warehouse",
      location: "Camaguey",
    });
    const product = service.createProduct({
      name: "Mouse",
      sku: "MS-200",
      price: 25,
      stock: 5,
    });

    const movement = service.recordStockMovement({
      warehouseId: secondaryWarehouse.id,
      productId: product.id,
      quantity: 3,
      type: "in",
    });

    assert.equal(movement.warehouseId, secondaryWarehouse.id);
    assert.equal(
      service.getWarehouseStock({
        warehouseId: secondaryWarehouse.id,
        productId: product.id,
      }).quantity,
      3,
    );

    assert.throws(
      () =>
        service.recordStockMovement({
          warehouseId: secondaryWarehouse.id,
          productId: product.id,
          quantity: 4,
          type: "out",
        }),
      (error) => {
        assert.equal(error instanceof DatabaseValidationError, true);
        assert.match((error as Error).message, /Stock cannot become negative/);
        return true;
      },
    );
  });
});

test("updateProductStock without warehouseId preserves aggregate semantics via the default warehouse", () => {
  withTempDatabase((service) => {
    const branchWarehouse = service.createWarehouse({
      name: "Branch Warehouse",
      location: "Holguin",
    });
    const product = service.createProduct({
      name: "Monitor",
      sku: "MN-300",
      price: 100,
      stock: 8,
    });

    service.setWarehouseStock({
      warehouseId: branchWarehouse.id,
      productId: product.id,
      quantity: 5,
    });

    const updatedProduct = service.updateProductStock({
      productId: product.id,
      stock: 12,
    });

    const warehouses = service.listWarehouses();
    const defaultWarehouse = warehouses[0];
    assert.ok(defaultWarehouse);
    assert.equal(updatedProduct.stock, 12);
    assert.equal(
      service.getWarehouseStock({
        warehouseId: defaultWarehouse.id,
        productId: product.id,
      }).quantity,
      7,
    );
    assert.equal(
      service.getWarehouseStock({
        warehouseId: branchWarehouse.id,
        productId: product.id,
      }).quantity,
      5,
    );
  });
});
