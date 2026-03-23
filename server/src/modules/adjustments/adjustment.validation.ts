import { STOCK_ADJUSTMENT_TYPES, type StockAdjustmentInput, type StockAdjustmentType } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { ensureObject, readNonNegativeInteger, readPositiveInteger, readString } from "../../common/validation";

const readOptionalPositiveId = (value: unknown, fieldName: string) => {
  if (value === undefined || value === null) {
    return null;
  }

  return readPositiveInteger(value, fieldName);
};

const readAdjustmentType = (value: unknown) => {
  if (typeof value !== "string" || !STOCK_ADJUSTMENT_TYPES.includes(value as StockAdjustmentType)) {
    throw new AppError(400, "type is invalid.");
  }

  return value as StockAdjustmentType;
};

export const parseStockAdjustmentInput = (payload: unknown): StockAdjustmentInput => {
  const body = ensureObject(payload);

  return {
    warehouseId: readPositiveInteger(body.warehouseId, "warehouseId"),
    warehouseLocationId: readOptionalPositiveId(body.warehouseLocationId, "warehouseLocationId"),
    productId: readPositiveInteger(body.productId, "productId"),
    type: readAdjustmentType(body.type),
    adjustedQuantity: readNonNegativeInteger(body.adjustedQuantity, "adjustedQuantity"),
    reason: readString(body.reason, "reason", { maxLength: 1000 }) as string,
  };
};
