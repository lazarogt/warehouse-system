import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
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

test("listProducts can scope stock to a single warehouse without mutating aggregate totals", () => {
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

    service.setWarehouseStock({
      warehouseId: overflowWarehouse.id,
      productId: product.id,
      quantity: 6,
    });

    const aggregateProduct = service.listProducts().find((candidate) => candidate.id === product.id);
    const scopedProduct = service
      .listProducts({ warehouseId: overflowWarehouse.id })
      .find((candidate) => candidate.id === product.id);

    assert.equal(aggregateProduct?.stock, 10);
    assert.equal(scopedProduct?.stock, 6);
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
    assert.equal(movement.reason, "adjustment");
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
        assert.match((error as Error).message, /stock no puede quedar negativo/i);
        return true;
      },
    );
  });
});

test("transferStock moves stock atomically and creates both movements", () => {
  withTempDatabase((service) => {
    const sourceWarehouse = service.createWarehouse({
      name: "Central",
      location: "Bogota",
    });
    const targetWarehouse = service.createWarehouse({
      name: "Norte",
      location: "Medellin",
    });
    const product = service.createProduct({
      name: "Router",
      sku: "RT-100",
      price: 120,
      stock: 0,
    });

    service.recordStockMovement({
      warehouseId: sourceWarehouse.id,
      productId: product.id,
      quantity: 9,
      type: "in",
    });

    const transfer = service.transferStock({
      sourceId: sourceWarehouse.id,
      targetId: targetWarehouse.id,
      productId: product.id,
      quantity: 4,
    });

    assert.equal(transfer.sourceId, sourceWarehouse.id);
    assert.equal(transfer.targetId, targetWarehouse.id);
    assert.equal(transfer.movementIds.length, 2);
    assert.equal(
      service.getWarehouseStock({
        warehouseId: sourceWarehouse.id,
        productId: product.id,
      }).quantity,
      5,
    );
    assert.equal(
      service.getWarehouseStock({
        warehouseId: targetWarehouse.id,
        productId: product.id,
      }).quantity,
      4,
    );

    const transferMovements = service
      .listStockMovements({ productId: product.id })
      .filter((movement) => movement.date === transfer.movedAt);

    assert.equal(transferMovements.length, 2);
    assert.equal(
      transferMovements.some(
        (movement) =>
          movement.warehouseId === sourceWarehouse.id &&
          movement.reason === "transfer" &&
          movement.type === "out" &&
          movement.quantity === 4,
      ),
      true,
    );
    assert.equal(
      transferMovements.some(
        (movement) =>
          movement.warehouseId === targetWarehouse.id &&
          movement.reason === "transfer" &&
          movement.type === "in" &&
          movement.quantity === 4,
      ),
      true,
    );
  });
});

test("transferStock rejects same warehouse or insufficient stock", () => {
  withTempDatabase((service) => {
    const sourceWarehouse = service.createWarehouse({
      name: "Central",
      location: "Bogota",
    });
    const targetWarehouse = service.createWarehouse({
      name: "Sur",
      location: "Cali",
    });
    const product = service.createProduct({
      name: "Hub",
      sku: "HB-200",
      price: 45,
      stock: 0,
    });

    service.recordStockMovement({
      warehouseId: sourceWarehouse.id,
      productId: product.id,
      quantity: 2,
      type: "in",
    });

    assert.throws(
      () =>
        service.transferStock({
          sourceId: sourceWarehouse.id,
          targetId: sourceWarehouse.id,
          productId: product.id,
          quantity: 1,
        }),
      (error) => {
        assert.equal(error instanceof DatabaseValidationError, true);
        assert.match((error as Error).message, /origen y el destino/i);
        return true;
      },
    );

    assert.throws(
      () =>
        service.transferStock({
          sourceId: sourceWarehouse.id,
          targetId: targetWarehouse.id,
          productId: product.id,
          quantity: 5,
        }),
      (error) => {
        assert.equal(error instanceof DatabaseValidationError, true);
        assert.match((error as Error).message, /stock insuficiente/i);
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

    const defaultWarehouse = service
      .listWarehouses()
      .find((warehouse) => warehouse.name === "Primary Warehouse");
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

test("dispatchProduct creates a dispatch OUT movement with metadata and updates stock atomically", () => {
  withTempDatabase((service) => {
    const warehouse = service.createWarehouse({
      name: "Despacho Centro",
      location: "Lima",
    });
    const product = service.createProduct({
      name: "Cinta",
      sku: "CNT-100",
      price: 8,
      stock: 0,
    });

    service.recordStockMovement({
      warehouseId: warehouse.id,
      productId: product.id,
      quantity: 7,
      type: "in",
    });

    const movement = service.dispatchProduct({
      warehouseId: warehouse.id,
      productId: product.id,
      quantity: 3,
      customer: "Cliente Demo",
      notes: "Entrega parcial",
    });

    assert.equal(movement.type, "out");
    assert.equal(movement.reason, "dispatch");
    assert.equal(movement.metadata?.customer, "Cliente Demo");
    assert.equal(movement.metadata?.notes, "Entrega parcial");
    assert.equal(
      service.getWarehouseStock({
        warehouseId: warehouse.id,
        productId: product.id,
      }).quantity,
      4,
    );
  });
});

test("dispatchProduct rejects invalid product or insufficient stock", () => {
  withTempDatabase((service) => {
    const warehouse = service.createWarehouse({
      name: "Despacho Norte",
      location: "Monterrey",
    });
    const product = service.createProduct({
      name: "Caja",
      sku: "CJ-100",
      price: 4,
      stock: 0,
    });

    service.recordStockMovement({
      warehouseId: warehouse.id,
      productId: product.id,
      quantity: 2,
      type: "in",
    });

    assert.throws(
      () =>
        service.dispatchProduct({
          warehouseId: warehouse.id,
          productId: product.id,
          quantity: 3,
          customer: "Cliente X",
        }),
      (error) => {
        assert.equal(error instanceof DatabaseValidationError, true);
        assert.match((error as Error).message, /stock insuficiente/i);
        return true;
      },
    );

    assert.throws(
      () =>
        service.dispatchProduct({
          warehouseId: warehouse.id,
          productId: 9999,
          quantity: 1,
          customer: "Cliente X",
        }),
      (error) => {
        assert.equal(error instanceof DatabaseValidationError, true);
        assert.match((error as Error).message, /productId/i);
        return true;
      },
    );
  });
});

test("updateWarehouse persists the new name and location", () => {
  withTempDatabase((service) => {
    const warehouse = service.createWarehouse({
      name: "Almacen Norte",
      location: "Bogota",
    });

    const updatedWarehouse = service.updateWarehouse({
      warehouseId: warehouse.id,
      name: "Almacen Principal",
      location: "Bogota Centro",
    });

    assert.equal(updatedWarehouse.id, warehouse.id);
    assert.equal(updatedWarehouse.name, "Almacen Principal");
    assert.equal(updatedWarehouse.location, "Bogota Centro");

    const warehouses = service.listWarehouses();
    assert.equal(
      warehouses.some(
        (candidate) =>
          candidate.id === warehouse.id &&
          candidate.name === "Almacen Principal" &&
          candidate.location === "Bogota Centro",
      ),
      true,
    );
  });
});

test("deactivateWarehouse hides an empty warehouse from active lists", () => {
  withTempDatabase((service) => {
    const warehouse = service.createWarehouse({
      name: "Temporal",
      location: "Valencia",
    });

    const response = service.deactivateWarehouse(warehouse.id);

    assert.equal(response.warehouseId, warehouse.id);
    assert.equal(
      service.listWarehouses().some((candidate) => candidate.id === warehouse.id),
      false,
    );
  });
});

test("deactivateWarehouse rejects warehouses with stock or when it is the last active warehouse", () => {
  withTempDatabase((service) => {
    const stockWarehouse = service.createWarehouse({
      name: "Con stock",
      location: "Quito",
    });
    const product = service.createProduct({
      name: "Teclado",
      sku: "TCL-100",
      price: 10,
      stock: 0,
    });

    service.setWarehouseStock({
      warehouseId: stockWarehouse.id,
      productId: product.id,
      quantity: 2,
    });

    assert.throws(
      () => service.deactivateWarehouse(stockWarehouse.id),
      (error) => {
        assert.equal(error instanceof DatabaseValidationError, true);
        assert.match(
          (error as Error).message,
          /todavia tiene unidades guardadas/,
        );
        return true;
      },
    );
  });
});

test("deactivateWarehouse allows history but prevents leaving the app without active warehouses", () => {
  withTempDatabase((service) => {
    const warehouseA = service.createWarehouse({
      name: "A",
      location: "Uno",
    });
    const product = service.createProduct({
      name: "Escaner",
      sku: "ESC-10",
      price: 30,
      stock: 0,
    });

    service.recordStockMovement({
      warehouseId: warehouseA.id,
      productId: product.id,
      quantity: 1,
      type: "in",
    });

    service.recordStockMovement({
      warehouseId: warehouseA.id,
      productId: product.id,
      quantity: 1,
      type: "out",
    });

    const response = service.deactivateWarehouse(warehouseA.id);
    assert.equal(response.warehouseId, warehouseA.id);

    const defaultWarehouse = service
      .listWarehouses()
      .find((warehouse) => warehouse.name === "Primary Warehouse");
    assert.ok(defaultWarehouse);

    assert.throws(
      () => service.deactivateWarehouse(defaultWarehouse.id),
      (error) => {
        assert.equal(error instanceof DatabaseValidationError, true);
        assert.match((error as Error).message, /al menos un almacen activo/i);
        return true;
      },
    );
  });
});
