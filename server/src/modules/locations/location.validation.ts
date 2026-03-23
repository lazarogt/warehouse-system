import { WAREHOUSE_LOCATION_TYPES, type WarehouseLocationInput, type WarehouseLocationType } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import {
  ensureObject,
  readPositiveInteger,
  readString,
} from "../../common/validation";

const readBoolean = (value: unknown, fieldName: string, fallback = true) => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new AppError(400, `${fieldName} must be a boolean.`);
  }

  return value;
};

const readOptionalPositiveId = (value: unknown, fieldName: string) => {
  if (value === undefined || value === null) {
    return null;
  }

  return readPositiveInteger(value, fieldName);
};

const readLocationType = (value: unknown): WarehouseLocationType => {
  if (typeof value !== "string" || !WAREHOUSE_LOCATION_TYPES.includes(value as WarehouseLocationType)) {
    throw new AppError(400, "type is invalid.");
  }

  return value as WarehouseLocationType;
};

export const parseWarehouseLocationInput = (payload: unknown): WarehouseLocationInput => {
  const body = ensureObject(payload);

  return {
    warehouseId: readPositiveInteger(body.warehouseId, "warehouseId"),
    code: readString(body.code, "code", { maxLength: 80 }) as string,
    name: readString(body.name, "name", { maxLength: 160 }) as string,
    type: readLocationType(body.type),
    parentLocationId: readOptionalPositiveId(body.parentLocationId, "parentLocationId"),
    active: readBoolean(body.active, "active", true),
  };
};
