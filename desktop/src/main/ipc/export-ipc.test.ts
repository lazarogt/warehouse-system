import assert from "node:assert/strict";
import { test } from "vitest";
import type { DesktopExportResult } from "../../../../shared/src/types/desktop-export-ipc";
import { EXPORT_IPC_CHANNELS } from "../../shared/export-ipc-channels";
import { registerExportIpcHandlers } from "./export-ipc";

type HandlerMap = Map<string, (_event: unknown, payload?: unknown) => unknown>;

function createMockRegistrar() {
  const handlers: HandlerMap = new Map();

  return {
    handlers,
    registrar: {
      handle(channel: string, listener: (_event: unknown, payload?: unknown) => unknown) {
        handlers.set(channel, listener);
      },
    },
  };
}

const logger = {
  info() {},
  warn() {},
  error() {},
};

test("registerExportIpcHandlers exposes PDF and Excel channels", () => {
  const { handlers, registrar } = createMockRegistrar();

  registerExportIpcHandlers({
    exportService: {
      exportPdf: async () => ({ canceled: false, filePath: "/tmp/report.pdf", reportType: "movements" }),
      exportExcel: async () => ({ canceled: false, filePath: "/tmp/report.xlsx", reportType: "movements" }),
    },
    logger,
    registrar,
  });

  assert.deepEqual([...handlers.keys()].sort(), Object.values(EXPORT_IPC_CHANNELS).sort());
});

test("export PDF handler validates payload and returns standardized success response", async () => {
  const { handlers, registrar } = createMockRegistrar();
  let capturedWarehouseId: number | undefined;

  registerExportIpcHandlers({
    exportService: {
      async exportPdf(payload) {
        capturedWarehouseId = payload.warehouseId;
        return {
          canceled: false,
          filePath: "/tmp/despacho.pdf",
          reportType: payload.reportType,
        };
      },
      async exportExcel() {
        throw new Error("Not used");
      },
    },
    logger,
    registrar,
  });

  const response = (await handlers.get(EXPORT_IPC_CHANNELS.pdf)?.(null, {
    reportType: "dispatches",
    warehouseId: 9,
  })) as {
    success: boolean;
    data?: DesktopExportResult;
    error?: { code: string; message: string };
  };

  assert.equal(response.success, true);
  assert.equal(capturedWarehouseId, 9);
  assert.equal(response.data?.reportType, "dispatches");
});

test("export Excel handler rejects invalid payloads with validation errors", async () => {
  const { handlers, registrar } = createMockRegistrar();

  registerExportIpcHandlers({
    exportService: {
      async exportPdf() {
        throw new Error("Not used");
      },
      async exportExcel() {
        return {
          canceled: false,
          filePath: "/tmp/report.xlsx",
          reportType: "inventory",
        };
      },
    },
    logger,
    registrar,
  });

  const response = (await handlers.get(EXPORT_IPC_CHANNELS.excel)?.(null, {
    reportType: "invalid",
  })) as { success: boolean; error?: { code: string; message: string } };

  assert.equal(response.success, false);
  assert.equal(response.error?.code, "VALIDATION_ERROR");
});
