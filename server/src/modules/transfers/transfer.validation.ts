import type { CreateStockTransferInput, StockTransferFilters, StockTransferStatus } from "../../../../shared/src";
import { STOCK_TRANSFER_STATUSES } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import {
  ensureObject,
  readOptionalPositiveInteger,
  readOptionalQueryId,
  readPositiveInteger,
  readString,
} from "../../common/validation";

const readOptionalPositiveId = (value: unknown, fieldName: string) => {
  if (value === undefined || value === null) {
    return null;
  }

  return readPositiveInteger(value, fieldName);
};

const readStatus = (value: unknown) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !STOCK_TRANSFER_STATUSES.includes(value as StockTransferStatus)) {
    throw new AppError(400, "status is invalid.");
  }

  return value as StockTransferStatus;
};

export const parseCreateTransferInput = (payload: unknown): CreateStockTransferInput => {
  const body = ensureObject(payload);

  return {
    fromWarehouseId: readPositiveInteger(body.fromWarehouseId, "fromWarehouseId"),
    toWarehouseId: readPositiveInteger(body.toWarehouseId, "toWarehouseId"),
    fromLocationId: readOptionalPositiveId(body.fromLocationId, "fromLocationId"),
    toLocationId: readOptionalPositiveId(body.toLocationId, "toLocationId"),
    productId: readPositiveInteger(body.productId, "productId"),
    quantity: readPositiveInteger(body.quantity, "quantity"),
    manualDestination: readString(body.manualDestination, "manualDestination", {
      optional: true,
      maxLength: 180,
    }),
    carrierName: readString(body.carrierName, "carrierName", {
      optional: true,
      maxLength: 180,
    }),
    notes: readString(body.notes, "notes", {
      optional: true,
      maxLength: 1000,
    }),
  };
};

export const parseTransferFilters = (query: Record<string, unknown>): StockTransferFilters => {
  return {
    status: readStatus(query.status),
    warehouseId: readOptionalQueryId(query.warehouseId, "warehouseId"),
    limit: readOptionalPositiveInteger(query.limit, "limit"),
  };
};
