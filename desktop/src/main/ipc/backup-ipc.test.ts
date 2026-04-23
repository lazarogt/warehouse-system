import assert from "node:assert/strict";
import { test } from "vitest";
import { BACKUP_IPC_CHANNELS } from "../../shared/backup-ipc-channels";
import { registerBackupIpcHandlers } from "./backup-ipc";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

type Handler = (_event: unknown, payload?: unknown) => Promise<unknown> | unknown;

function createRegistrar() {
  const handlers = new Map<string, Handler>();

  return {
    handlers,
    registrar: {
      handle(channel: string, listener: Handler) {
        handlers.set(channel, listener);
      },
    },
  };
}

test("registerBackupIpcHandlers exposes manual backup creation", async () => {
  const { handlers, registrar } = createRegistrar();

  registerBackupIpcHandlers({
    backupService: {
      async createBackup() {
        return {
          createdAt: "2026-04-20T00:00:00.000Z",
          fileName: "warehouse-manual-2026-04-20.db",
          filePath: "/tmp/warehouse-manual-2026-04-20.db",
          reason: "manual",
          size: 1234,
        };
      },
      getBackupsDirectory() {
        return "/tmp";
      },
      async restoreBackup() {
        throw new Error("not used");
      },
      start() {},
      stop() {},
    },
    logger: silentLogger,
    registrar,
  });

  const handler = handlers.get(BACKUP_IPC_CHANNELS.create);
  assert.ok(handler);

  const response = await handler?.(null);

  assert.deepEqual(response, {
    success: true,
    data: {
      createdAt: "2026-04-20T00:00:00.000Z",
      fileName: "warehouse-manual-2026-04-20.db",
      filePath: "/tmp/warehouse-manual-2026-04-20.db",
      reason: "manual",
      size: 1234,
    },
  });
});

test("registerBackupIpcHandlers restores a selected backup and schedules restart", async () => {
  const { handlers, registrar } = createRegistrar();
  let restartScheduled = false;

  registerBackupIpcHandlers({
    backupService: {
      async createBackup() {
        throw new Error("not used");
      },
      getBackupsDirectory() {
        return "/tmp";
      },
      async restoreBackup(filePath: string) {
        return {
          preRestoreBackupPath: "/tmp/restore-point.db",
          restartRequired: true,
          restored: true,
          restoredFrom: filePath,
        };
      },
      start() {},
      stop() {},
    },
    logger: silentLogger,
    promptForRestorePath: async () => "/tmp/warehouse.db",
    registrar,
    scheduleRestart() {
      restartScheduled = true;
    },
  });

  const handler = handlers.get(BACKUP_IPC_CHANNELS.restore);
  assert.ok(handler);

  const response = await handler?.(null, {});

  assert.equal(restartScheduled, true);
  assert.deepEqual(response, {
    success: true,
    data: {
      preRestoreBackupPath: "/tmp/restore-point.db",
      restartRequired: true,
      restored: true,
      restoredFrom: "/tmp/warehouse.db",
    },
  });
});
