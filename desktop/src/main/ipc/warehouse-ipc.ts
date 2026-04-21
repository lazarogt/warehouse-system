import { ipcMain } from "electron";
import type {
  ApiResponse,
  CreateProductPayload,
  CreateStockMovementPayload,
  CreateWarehousePayload,
  GetStockMovementsPayload,
  GetWarehouseStockPayload,
  Product,
  StockMovement,
  UpdateProductStockPayload,
  SetWarehouseStockPayload,
  Warehouse,
  WarehouseStock,
} from "../../../../shared/src/types/desktop-warehouse-ipc";
import type { DatabaseLogger } from "../db/database";
import {
  DatabaseValidationError,
  type ProductRecord,
  type StockMovementRecord,
  type WarehouseDataService,
  type WarehouseRecord,
  type WarehouseStockRecord,
} from "../services/warehouse-data-service";
import { WAREHOUSE_IPC_CHANNELS } from "../../shared/warehouse-ipc-channels";

type IpcHandlerRegistrar = {
  handle(channel: string, listener: (_event: unknown, payload?: unknown) => unknown): void;
};

type ApiErrorCode = "VALIDATION_ERROR" | "CONFLICT" | "INTERNAL_ERROR";

type RegisterWarehouseIpcHandlersOptions = {
  logger?: DatabaseLogger;
  registrar?: IpcHandlerRegistrar;
  warehouseDataService: WarehouseDataService;
};

type SqliteLikeError = Error & {
  code?: string;
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

function assertObjectPayload(
  payload: unknown,
  handlerName: string,
): Record<string, unknown> {
  if (!isPlainObject(payload)) {
    throw new IpcPayloadValidationError(`${handlerName} payload must be an object.`);
  }

  return payload;
}

function assertOptionalObjectPayload(payload: unknown): Record<string, unknown> {
  if (payload === undefined) {
    return {};
  }

  return assertObjectPayload(payload, "IPC");
}

function assertTrimmedString(fieldName: string, value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw new IpcPayloadValidationError(`${fieldName} must be a string.`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new IpcPayloadValidationError(`${fieldName} is required.`);
  }

  if (normalizedValue.length > maxLength) {
    throw new IpcPayloadValidationError(`${fieldName} must be at most ${maxLength} characters.`);
  }

  return normalizedValue;
}

function assertPositiveInteger(fieldName: string, value: unknown): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new IpcPayloadValidationError(`${fieldName} must be a positive integer.`);
  }

  return Number(value);
}

function assertNonNegativeInteger(fieldName: string, value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new IpcPayloadValidationError(`${fieldName} must be a non-negative integer.`);
  }

  return Number(value);
}

function assertFiniteNonNegativeNumber(fieldName: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new IpcPayloadValidationError(`${fieldName} must be a non-negative finite number.`);
  }

  return Number(value);
}

function assertStockMovementType(value: unknown): "in" | "out" {
  if (value !== "in" && value !== "out") {
    throw new IpcPayloadValidationError("type must be either 'in' or 'out'.");
  }

  return value;
}

function assertOptionalIsoDate(fieldName: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new IpcPayloadValidationError(`${fieldName} must be a valid ISO date string.`);
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new IpcPayloadValidationError(`${fieldName} must be a valid ISO date string.`);
  }

  return parsedDate.toISOString();
}

function mapProduct(record: ProductRecord): Product {
  return {
    id: record.id,
    name: record.name,
    sku: record.sku,
    price: record.price,
    stock: record.stock,
    createdAt: record.createdAt,
  };
}

function mapStockMovement(record: StockMovementRecord): StockMovement {
  return {
    id: record.id,
    productId: record.productId,
    warehouseId: record.warehouseId,
    type: record.type,
    quantity: record.quantity,
    date: record.date,
  };
}

function mapWarehouse(record: WarehouseRecord): Warehouse {
  return {
    id: record.id,
    name: record.name,
    location: record.location,
    createdAt: record.createdAt,
  };
}

function mapWarehouseStock(record: WarehouseStockRecord): WarehouseStock {
  return {
    warehouseId: record.warehouseId,
    productId: record.productId,
    quantity: record.quantity,
  };
}

function mapWarehouseError(error: unknown): ApiResponse<never> {
  const sqliteError = error as SqliteLikeError | undefined;

  if (error instanceof IpcPayloadValidationError || error instanceof DatabaseValidationError) {
    return errorResponse("VALIDATION_ERROR", error.message);
  }

  if (sqliteError?.code?.startsWith("SQLITE_CONSTRAINT")) {
    return errorResponse("CONFLICT", "The requested change violates a database constraint.");
  }

  return errorResponse("INTERNAL_ERROR", "An unexpected IPC error occurred.");
}

function wrapHandler<TPayload, TResult>(
  logger: DatabaseLogger,
  handlerName: keyof typeof WAREHOUSE_IPC_CHANNELS,
  handler: (payload: TPayload) => TResult,
): (_event: unknown, payload?: unknown) => ApiResponse<TResult> {
  return (_event, payload) => {
    try {
      return successResponse(handler(payload as TPayload));
    } catch (error) {
      const response = mapWarehouseError(error);

      logger.warn("[desktop:ipc] handler failed", {
        channel: WAREHOUSE_IPC_CHANNELS[handlerName],
        code: response.error?.code,
        message: error instanceof Error ? error.message : "Unknown IPC error",
      });

      return response;
    }
  };
}

function validateCreateProductPayload(payload: unknown): CreateProductPayload {
  const value = assertObjectPayload(payload, "createProduct");

  return {
    name: assertTrimmedString("name", value.name, 120),
    sku: assertTrimmedString("sku", value.sku, 64),
    price: assertFiniteNonNegativeNumber("price", value.price),
    stock:
      value.stock === undefined ? undefined : assertNonNegativeInteger("stock", value.stock),
  };
}

function validateCreateWarehousePayload(payload: unknown): CreateWarehousePayload {
  const value = assertObjectPayload(payload, "createWarehouse");

  return {
    name: assertTrimmedString("name", value.name, 120),
    location: assertTrimmedString("location", value.location, 200),
  };
}

function validateUpdateProductStockPayload(payload: unknown): UpdateProductStockPayload {
  const value = assertObjectPayload(payload, "updateProductStock");

  return {
    productId: assertPositiveInteger("productId", value.productId),
    stock: assertNonNegativeInteger("stock", value.stock),
    warehouseId:
      value.warehouseId === undefined
        ? undefined
        : assertPositiveInteger("warehouseId", value.warehouseId),
  };
}

function validateGetStockMovementsPayload(payload: unknown): GetStockMovementsPayload {
  const value = assertOptionalObjectPayload(payload);

  return {
    productId:
      value.productId === undefined
        ? undefined
        : assertPositiveInteger("productId", value.productId),
    warehouseId:
      value.warehouseId === undefined
        ? undefined
        : assertPositiveInteger("warehouseId", value.warehouseId),
  };
}

function validateGetWarehouseStockPayload(payload: unknown): GetWarehouseStockPayload {
  const value = assertObjectPayload(payload, "getWarehouseStock");

  return {
    warehouseId: assertPositiveInteger("warehouseId", value.warehouseId),
    productId: assertPositiveInteger("productId", value.productId),
  };
}

function validateSetWarehouseStockPayload(payload: unknown): SetWarehouseStockPayload {
  const value = assertObjectPayload(payload, "setWarehouseStock");

  return {
    warehouseId: assertPositiveInteger("warehouseId", value.warehouseId),
    productId: assertPositiveInteger("productId", value.productId),
    quantity: assertNonNegativeInteger("quantity", value.quantity),
  };
}

function validateCreateStockMovementPayload(payload: unknown): CreateStockMovementPayload {
  const value = assertObjectPayload(payload, "createStockMovement");

  return {
    productId: assertPositiveInteger("productId", value.productId),
    warehouseId:
      value.warehouseId === undefined
        ? undefined
        : assertPositiveInteger("warehouseId", value.warehouseId),
    type: assertStockMovementType(value.type),
    quantity: assertPositiveInteger("quantity", value.quantity),
    date: assertOptionalIsoDate("date", value.date),
  };
}

export function registerWarehouseIpcHandlers(
  options: RegisterWarehouseIpcHandlersOptions,
): void {
  const registrar = options.registrar ?? ipcMain;
  const logger = options.logger ?? DEFAULT_LOGGER;
  const { warehouseDataService } = options;

  registrar.handle(
    WAREHOUSE_IPC_CHANNELS.getProducts,
    wrapHandler(logger, "getProducts", () => {
      return warehouseDataService.listProducts().map(mapProduct);
    }),
  );

  registrar.handle(
    WAREHOUSE_IPC_CHANNELS.createProduct,
    wrapHandler(logger, "createProduct", (payload) => {
      const validatedPayload = validateCreateProductPayload(payload);
      return mapProduct(warehouseDataService.createProduct(validatedPayload));
    }),
  );

  registrar.handle(
    WAREHOUSE_IPC_CHANNELS.createWarehouse,
    wrapHandler(logger, "createWarehouse", (payload) => {
      const validatedPayload = validateCreateWarehousePayload(payload);
      return mapWarehouse(warehouseDataService.createWarehouse(validatedPayload));
    }),
  );

  registrar.handle(
    WAREHOUSE_IPC_CHANNELS.updateProductStock,
    wrapHandler(logger, "updateProductStock", (payload) => {
      const validatedPayload = validateUpdateProductStockPayload(payload);
      return mapProduct(warehouseDataService.updateProductStock(validatedPayload));
    }),
  );

  registrar.handle(
    WAREHOUSE_IPC_CHANNELS.getStockMovements,
    wrapHandler(logger, "getStockMovements", (payload) => {
      const validatedPayload = validateGetStockMovementsPayload(payload);
      return warehouseDataService
        .listStockMovements(validatedPayload)
        .map(mapStockMovement);
    }),
  );

  registrar.handle(
    WAREHOUSE_IPC_CHANNELS.getWarehouses,
    wrapHandler(logger, "getWarehouses", () => {
      return warehouseDataService.listWarehouses().map(mapWarehouse);
    }),
  );

  registrar.handle(
    WAREHOUSE_IPC_CHANNELS.getWarehouseStock,
    wrapHandler(logger, "getWarehouseStock", (payload) => {
      const validatedPayload = validateGetWarehouseStockPayload(payload);
      return mapWarehouseStock(warehouseDataService.getWarehouseStock(validatedPayload));
    }),
  );

  registrar.handle(
    WAREHOUSE_IPC_CHANNELS.createStockMovement,
    wrapHandler(logger, "createStockMovement", (payload) => {
      const validatedPayload = validateCreateStockMovementPayload(payload);
      return mapStockMovement(warehouseDataService.recordStockMovement(validatedPayload));
    }),
  );

  registrar.handle(
    WAREHOUSE_IPC_CHANNELS.setWarehouseStock,
    wrapHandler(logger, "setWarehouseStock", (payload) => {
      const validatedPayload = validateSetWarehouseStockPayload(payload);
      return mapWarehouseStock(warehouseDataService.setWarehouseStock(validatedPayload));
    }),
  );

  logger.info("[desktop:ipc] warehouse handlers registered", {
    channels: Object.values(WAREHOUSE_IPC_CHANNELS),
  });
}
