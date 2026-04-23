import { ipcMain } from "electron";
import type { DatabaseLogger } from "../db/database";
import type { DesktopExportService } from "../services/export-service";
import { DatabaseValidationError } from "../services/warehouse-data-service";
import { EXPORT_IPC_CHANNELS } from "../../shared/export-ipc-channels";
import type {
  ApiResponse,
} from "../../../../shared/src/types/desktop-warehouse-ipc";
import type {
  DesktopExportPayload,
  DesktopExportReportType,
  DesktopExportResult,
} from "../../../../shared/src/types/desktop-export-ipc";

type IpcHandlerRegistrar = {
  handle(channel: string, listener: (_event: unknown, payload?: unknown) => unknown): void;
};

type RegisterExportIpcHandlersOptions = {
  exportService: DesktopExportService;
  logger?: DatabaseLogger;
  registrar?: IpcHandlerRegistrar;
};

type ApiErrorCode = "VALIDATION_ERROR" | "CONFLICT" | "INTERNAL_ERROR";

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

class IpcPayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IpcPayloadValidationError";
  }
}

function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

function errorResponse(code: ApiErrorCode, message: string): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPositiveInteger(fieldName: string, value: unknown): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new IpcPayloadValidationError(`${fieldName} must be a positive integer.`);
  }

  return Number(value);
}

function assertReportType(value: unknown): DesktopExportReportType {
  if (value !== "dispatches" && value !== "inventory" && value !== "movements") {
    throw new IpcPayloadValidationError(
      "reportType must be one of: dispatches, inventory, movements.",
    );
  }

  return value;
}

function validateExportPayload(payload: unknown): DesktopExportPayload {
  if (!isPlainObject(payload)) {
    throw new IpcPayloadValidationError("export payload must be an object.");
  }

  return {
    reportType: assertReportType(payload.reportType),
    warehouseId:
      payload.warehouseId === undefined
        ? undefined
        : assertPositiveInteger("warehouseId", payload.warehouseId),
  };
}

function mapExportError(error: unknown): ApiResponse<never> {
  if (error instanceof IpcPayloadValidationError || error instanceof DatabaseValidationError) {
    return errorResponse("VALIDATION_ERROR", error.message);
  }

  return errorResponse("INTERNAL_ERROR", "Ocurrio un error inesperado.");
}

function wrapHandler(
  logger: DatabaseLogger,
  channel: string,
  handler: (payload: DesktopExportPayload) => Promise<DesktopExportResult>,
): (_event: unknown, payload?: unknown) => Promise<ApiResponse<DesktopExportResult>> {
  return async (_event, payload) => {
    try {
      return successResponse(await handler(validateExportPayload(payload)));
    } catch (error) {
      const response = mapExportError(error);

      logger.warn("[desktop:ipc] export handler failed", {
        channel,
        code: response.error?.code,
        message: error instanceof Error ? error.message : "Unknown IPC error",
      });

      return response;
    }
  };
}

export function registerExportIpcHandlers(options: RegisterExportIpcHandlersOptions): void {
  const registrar = options.registrar ?? ipcMain;
  const logger = options.logger ?? DEFAULT_LOGGER;
  const { exportService } = options;

  registrar.handle(
    EXPORT_IPC_CHANNELS.pdf,
    wrapHandler(logger, EXPORT_IPC_CHANNELS.pdf, (payload) => exportService.exportPdf(payload)),
  );
  registrar.handle(
    EXPORT_IPC_CHANNELS.excel,
    wrapHandler(logger, EXPORT_IPC_CHANNELS.excel, (payload) =>
      exportService.exportExcel(payload),
    ),
  );

  logger.info("[desktop:ipc] export handlers registered", {
    channels: Object.values(EXPORT_IPC_CHANNELS),
  });
}
