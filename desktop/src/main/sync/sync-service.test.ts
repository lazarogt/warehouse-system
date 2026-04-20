import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeDesktopDatabase } from "../db/init";
import {
  SYNC_STATE_FILENAME,
  createWarehouseSyncService,
  createSyncAwareWarehouseDataService,
} from "./sync-service";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

function withTempUserDataPath(run: (userDataPath: string) => Promise<void> | void): Promise<void> {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "warehouse-sync-"));

  return Promise.resolve(run(tempDirectory)).finally(() => {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });
}

test("sync service backfills stock movements, persists retries, and eventually pushes them", async () => {
  await withTempUserDataPath(async (userDataPath) => {
    const runtime = initializeDesktopDatabase({
      isDevelopment: false,
      logger: silentLogger,
      userDataPath,
    });

    try {
      const product = runtime.services.warehouseData.createProduct({
        name: "Keyboard",
        sku: "KB-100",
        price: 50,
        stock: 0,
      });
      const movement = runtime.services.warehouseData.recordStockMovement({
        productId: product.id,
        quantity: 3,
        type: "in",
      });

      let pushAttempts = 0;
      const syncService = createWarehouseSyncService({
        database: runtime.database,
        logger: silentLogger,
        userDataPath,
        config: {
          baseUrl: "http://sync.example.test",
          intervalMs: 60_000,
          initialBackoffMs: 1,
          maxBackoffMs: 1,
        },
        fetchImpl: async (input, init) => {
          const url = new URL(typeof input === "string" ? input : input.toString());

          if (url.pathname.endsWith("/stock-movements")) {
            pushAttempts += 1;
            assert.equal(init?.method, "POST");

            if (pushAttempts === 1) {
              throw new TypeError("network unavailable");
            }

            return new Response(null, { status: 204 });
          }

          return Response.json([]);
        },
      });

      const firstRun = await syncService.syncNow("manual");
      assert.equal(firstRun.status, "deferred");
      assert.equal(firstRun.pushedMovements, 0);
      assert.equal(firstRun.pendingQueueItems, 1);
      assert.match(firstRun.lastError ?? "", /network unavailable/i);

      const persistedState = JSON.parse(
        fs.readFileSync(path.join(userDataPath, SYNC_STATE_FILENAME), "utf8"),
      ) as {
        queue: Array<{ movementId: number; attempts: number }>;
      };

      assert.equal(persistedState.queue.length, 1);
      assert.equal(persistedState.queue[0]?.movementId, movement.id);
      assert.equal(persistedState.queue[0]?.attempts, 1);

      await new Promise((resolve) => setTimeout(resolve, 5));
      const secondRun = await syncService.syncNow("manual");
      assert.equal(secondRun.status, "completed");
      assert.equal(secondRun.pushedMovements, 1);
      assert.equal(secondRun.pendingQueueItems, 0);
      assert.equal(pushAttempts, 2);
    } finally {
      runtime.close();
    }
  });
});

test("product pull applies newer remote updates and skips older updates when local writes are newer", async () => {
  await withTempUserDataPath(async (userDataPath) => {
    const runtime = initializeDesktopDatabase({
      isDevelopment: false,
      logger: silentLogger,
      userDataPath,
    });

    try {
      const syncService = createWarehouseSyncService({
        database: runtime.database,
        logger: silentLogger,
        userDataPath,
        config: {
          baseUrl: "http://sync.example.test",
          intervalMs: 60_000,
          productConflictStrategy: "last-write-wins",
        },
        fetchImpl: async (input) => {
          const url = new URL(typeof input === "string" ? input : input.toString());

          if (url.pathname.endsWith("/products")) {
            return Response.json([
              {
                id: "remote-1",
                sku: "KB-100",
                name: "Keyboard Pro",
                price: 75,
                stock: 12,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-03T00:00:00.000Z",
              },
              {
                id: "remote-2",
                sku: "MS-200",
                name: "Wireless Mouse Remote",
                price: 30,
                stock: 18,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-04T00:00:00.000Z",
              },
            ]);
          }

          return new Response(null, { status: 204 });
        },
      });

      const warehouseData = createSyncAwareWarehouseDataService(
        runtime.services.warehouseData,
        syncService,
      );

      const keyboard = warehouseData.createProduct({
        name: "Keyboard",
        sku: "KB-100",
        price: 50,
        stock: 5,
      });
      const mouse = warehouseData.createProduct({
        name: "Wireless Mouse",
        sku: "MS-200",
        price: 25,
        stock: 9,
      });

      syncService.noteProductWrite(keyboard.id, "2026-01-01T00:00:00.000Z");
      syncService.noteProductWrite(mouse.id, "2026-01-05T00:00:00.000Z");

      const result = await syncService.syncNow("manual");

      assert.equal(result.status, "completed");
      assert.equal(result.productsApplied, 1);
      assert.equal(result.productsSkipped, 1);

      const products = runtime.services.warehouseData.listProducts();
      const syncedKeyboard = products.find((product) => product.sku === "KB-100");
      const skippedMouse = products.find((product) => product.sku === "MS-200");

      assert.equal(syncedKeyboard?.name, "Keyboard Pro");
      assert.equal(syncedKeyboard?.price, 75);
      assert.equal(syncedKeyboard?.stock, 12);
      assert.equal(skippedMouse?.name, "Wireless Mouse");
      assert.equal(skippedMouse?.price, 25);
      assert.equal(skippedMouse?.stock, 9);
    } finally {
      runtime.close();
    }
  });
});
