import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseLogger } from "../db/database";
import { WAREHOUSE_SYNC_IPC_CHANNELS } from "../../shared/warehouse-sync-ipc-channels";
import { registerWarehouseSyncIpcHandlers } from "./warehouse-sync-ipc";

type HandlerMap = Map<string, (_event: unknown, payload?: unknown) => Promise<unknown> | unknown>;

function createMockRegistrar() {
  const handlers: HandlerMap = new Map();

  return {
    handlers,
    registrar: {
      handle(channel: string, listener: (_event: unknown, payload?: unknown) => Promise<unknown> | unknown) {
        handlers.set(channel, listener);
      },
    },
  };
}

function createMockLogger(): DatabaseLogger {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

test("registerWarehouseSyncIpcHandlers exposes the manual sync channel", async () => {
  const { handlers, registrar } = createMockRegistrar();

  registerWarehouseSyncIpcHandlers({
    logger: createMockLogger(),
    registrar,
    syncService: {
      enqueueStockMovementPush() {},
      noteProductWrite() {},
      start() {},
      stop() {},
      async syncNow() {
        return {
          trigger: "manual",
          status: "completed",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:00:01.000Z",
          pushedMovements: 2,
          productsApplied: 1,
          productsSkipped: 0,
          pendingQueueItems: 0,
        };
      },
    },
  });

  const handler = handlers.get(WAREHOUSE_SYNC_IPC_CHANNELS.sync);

  assert.ok(handler);

  const response = (await handler(null)) as {
    success: boolean;
    data?: { pushedMovements: number; productsApplied: number };
  };

  assert.equal(response.success, true);
  assert.equal(response.data?.pushedMovements, 2);
  assert.equal(response.data?.productsApplied, 1);
});
