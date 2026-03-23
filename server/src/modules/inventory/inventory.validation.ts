import type { StockMovementInput } from "../../../../shared/src";
import {
  ensureObject,
  readDateTime,
  readMovementType,
  readOptionalPositiveInteger,
  readOptionalQueryId,
  readPositiveInteger,
  readString,
} from "../../common/validation";

export const parseStockMovementInput = (payload: unknown): StockMovementInput => {
  const body = ensureObject(payload);

  return {
    productId: readPositiveInteger(body.productId, "productId"),
    warehouseId: readPositiveInteger(body.warehouseId, "warehouseId"),
    warehouseLocationId:
      body.warehouseLocationId === undefined || body.warehouseLocationId === null
        ? null
        : readPositiveInteger(body.warehouseLocationId, "warehouseLocationId"),
    type: readMovementType(body.type),
    quantity: readPositiveInteger(body.quantity, "quantity"),
    movementDate: readDateTime(body.movementDate, "movementDate"),
    observation: readString(body.observation, "observation", {
      optional: true,
      maxLength: 1000,
    }),
  };
};

export const parseStockFilters = (query: Record<string, unknown>) => {
  return {
    productId: readOptionalQueryId(query.productId, "productId"),
    warehouseId: readOptionalQueryId(query.warehouseId, "warehouseId"),
    warehouseLocationId: readOptionalQueryId(query.warehouseLocationId, "warehouseLocationId"),
  };
};

export const parseStockMovementFilters = (query: Record<string, unknown>) => {
  return {
    limit: readOptionalPositiveInteger(query.limit, "limit"),
  };
};
