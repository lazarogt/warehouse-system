import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { createDesktopDatabase } from "../db/database";
import { DATABASE_MIGRATIONS } from "../db/schema";
import { createDesktopExportService } from "./export-service";
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
  run: (options: {
    outputDirectory: string;
    warehouseDataService: ReturnType<typeof createWarehouseDataService>;
  }) => Promise<void> | void,
): Promise<void> {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "warehouse-desktop-export-"));
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

    return Promise.resolve(
      run({
        outputDirectory: tempDirectory,
        warehouseDataService: createWarehouseDataService({
          database,
          logger: silentLogger,
        }),
      }),
    ).finally(() => {
      database.close();
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    });
  } catch (error) {
    database.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
    throw error;
  }
}

test("export service writes PDF and Excel files for dispatches", async () => {
  await withTempDatabase(async ({ outputDirectory, warehouseDataService }) => {
    const warehouse = warehouseDataService.createWarehouse({
      name: "Centro",
      location: "Quito",
    });
    const product = warehouseDataService.createProduct({
      name: "Caja chica",
      sku: "CJ-001",
      price: 2,
      stock: 0,
    });

    warehouseDataService.recordStockMovement({
      warehouseId: warehouse.id,
      productId: product.id,
      quantity: 5,
      type: "in",
    });
    warehouseDataService.dispatchProduct({
      warehouseId: warehouse.id,
      productId: product.id,
      quantity: 2,
      customer: "Cliente Export",
      notes: "Entrega mostrador",
    });

    const pdfPath = path.join(outputDirectory, "despacho-test.pdf");
    const excelPath = path.join(outputDirectory, "despacho-test.xlsx");
    let requestedExtension: string | null = null;

    const exportService = createDesktopExportService({
      warehouseDataService,
      saveDialog: async (options) => {
        requestedExtension = options.filters?.[0]?.extensions?.[0] ?? null;
        return {
          canceled: false,
          filePath: requestedExtension === "pdf" ? pdfPath : excelPath,
        };
      },
    });

    const pdfResult = await exportService.exportPdf({
      reportType: "dispatches",
      warehouseId: warehouse.id,
    });
    const excelResult = await exportService.exportExcel({
      reportType: "dispatches",
      warehouseId: warehouse.id,
    });

    assert.equal(pdfResult.canceled, false);
    assert.equal(excelResult.canceled, false);
    assert.equal(fs.existsSync(pdfPath), true);
    assert.equal(fs.existsSync(excelPath), true);
    assert.ok(fs.statSync(pdfPath).size > 0);
    assert.ok(fs.statSync(excelPath).size > 0);
  });
});

test("export service rejects empty datasets with a clear validation error", async () => {
  await withTempDatabase(async ({ warehouseDataService }) => {
    const exportService = createDesktopExportService({
      warehouseDataService,
      saveDialog: async () => ({
        canceled: false,
        filePath: "/tmp/unused.pdf",
      }),
    });

    await assert.rejects(
      () =>
        exportService.exportPdf({
          reportType: "movements",
        }),
      (error) => {
        assert.equal(error instanceof DatabaseValidationError, true);
        assert.match((error as Error).message, /no hay datos para exportar/i);
        return true;
      },
    );
  });
});
