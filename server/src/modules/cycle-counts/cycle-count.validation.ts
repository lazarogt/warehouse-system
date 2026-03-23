import type {
  CreateCycleCountInput,
  CreateCycleCountItemInput,
  UpdateCycleCountItemInput,
} from "../../../../shared/src";
import { AppError } from "../../common/errors";
import {
  ensureObject,
  readNonNegativeInteger,
  readPositiveInteger,
  readString,
} from "../../common/validation";

const readOptionalPositiveId = (value: unknown, fieldName: string) => {
  if (value === undefined || value === null) {
    return null;
  }

  return readPositiveInteger(value, fieldName);
};

const readOptionalBoolean = (value: unknown, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new AppError(400, "Boolean value expected.");
  }

  return value;
};

export const parseCreateCycleCountInput = (payload: unknown): CreateCycleCountInput => {
  const body = ensureObject(payload);

  return {
    warehouseId: readPositiveInteger(body.warehouseId, "warehouseId"),
    warehouseLocationId: readOptionalPositiveId(body.warehouseLocationId, "warehouseLocationId"),
    notes: readString(body.notes, "notes", { optional: true, maxLength: 1000 }),
  };
};

export const parseCreateCycleCountItemInput = (payload: unknown): CreateCycleCountItemInput => {
  const body = ensureObject(payload);

  return {
    productId: readPositiveInteger(body.productId, "productId"),
  };
};

export const parseUpdateCycleCountItemInput = (payload: unknown): UpdateCycleCountItemInput => {
  const body = ensureObject(payload);

  return {
    countedQuantity: readNonNegativeInteger(body.countedQuantity, "countedQuantity"),
    resolved: readOptionalBoolean(body.resolved, false),
  };
};

export const parseCompleteCycleCountInput = (payload: unknown) => {
  const body = ensureObject(payload);

  return {
    applyAdjustments: readOptionalBoolean(body.applyAdjustments, false),
  };
};
