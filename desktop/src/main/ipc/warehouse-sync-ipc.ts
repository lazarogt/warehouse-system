import { ipcMain } from "electron";
import type { ApiResponse } from "../../../../shared/src/types/desktop-warehouse-ipc";
import type { WarehouseSyncResult } from "../../../../shared/src/types/desktop-warehouse-sync-ipc";
import type { DatabaseLogger } from "../db/database";
import type { WarehouseSyncService } from "../sync/sync-service";
import { WAREHOUSE_SYNC_IPC_CHANNELS } from "../../shared/warehouse-sync-ipc-channels";

type IpcHandlerRegistrar = {
  handle(
    channel: string,
    listener: (_event: unknown, payload?: unknown) => Promise<unknown> | unknown,
  ): void;
};

type RegisterWarehouseSyncIpcHandlersOptions = {
  logger?: DatabaseLogger;
  registrar?: IpcHandlerRegistrar;
  syncService: WarehouseSyncService;
};

const DEFAULT_LOGGER: DatabaseLogger = {
  info(message, metadata) {
    console.info(message, metadata ?? {});
  },
  warn(message, metadata) {
    console.warn(message, metadata ?? {});
  },
  error(message, metadata) {
    console.error(message, metadata ?? {});
  },
};

function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

function errorResponse(message: string): ApiResponse<never> {
  return {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message,
    },
  };
}

export function registerWarehouseSyncIpcHandlers(
  options: RegisterWarehouseSyncIpcHandlersOptions,
): void {
  const registrar = options.registrar ?? ipcMain;
  const logger = options.logger ?? DEFAULT_LOGGER;

  registrar.handle(
    WAREHOUSE_SYNC_IPC_CHANNELS.sync,
    async (): Promise<ApiResponse<WarehouseSyncResult>> => {
      try {
        const result = await options.syncService.syncNow("manual");
        return successResponse(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "An unexpected sync IPC error occurred.";

        logger.error("[desktop:sync-ipc] manual sync failed", {
          message,
        });

        return errorResponse("An unexpected sync error occurred.");
      }
    },
  );

  logger.info("[desktop:sync-ipc] sync handler registered", {
    channel: WAREHOUSE_SYNC_IPC_CHANNELS.sync,
  });
}
