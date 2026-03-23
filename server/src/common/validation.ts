import { STOCK_MOVEMENT_TYPES, type StockMovementType } from "../../../shared/src";
import { AppError } from "./errors";

type UnknownRecord = Record<string, unknown>;

export const ensureObject = (value: unknown): UnknownRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError(400, "Request body must be a JSON object.");
  }

  return value as UnknownRecord;
};

export const readString = (
  value: unknown,
  fieldName: string,
  options?: { optional?: boolean; maxLength?: number },
) => {
  if (value === undefined || value === null) {
    if (options?.optional) {
      return null;
    }

    throw new AppError(400, `${fieldName} is required.`);
  }

  if (typeof value !== "string") {
    throw new AppError(400, `${fieldName} must be a string.`);
  }

  const normalized = value.trim();

  if (!normalized && !options?.optional) {
    throw new AppError(400, `${fieldName} cannot be empty.`);
  }

  if (options?.maxLength && normalized.length > options.maxLength) {
    throw new AppError(400, `${fieldName} exceeds the maximum length.`);
  }

  return normalized || null;
};

export const readPositiveInteger = (value: unknown, fieldName: string) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new AppError(400, `${fieldName} must be a positive integer.`);
  }

  return value;
};

export const readNonNegativeInteger = (value: unknown, fieldName: string) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AppError(400, `${fieldName} must be a non-negative integer.`);
  }

  return value;
};

export const readNonNegativeNumber = (value: unknown, fieldName: string) => {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new AppError(400, `${fieldName} must be a non-negative number.`);
  }

  return value;
};

export const readId = (value: unknown, fieldName: string) => {
  if (typeof value !== "string") {
    throw new AppError(400, `${fieldName} must be a positive integer.`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AppError(400, `${fieldName} must be a positive integer.`);
  }

  return parsedValue;
};

export const readOptionalQueryId = (value: unknown, fieldName: string) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AppError(400, `${fieldName} must be a positive integer.`);
  }

  return readId(value, fieldName);
};

export const readOptionalPositiveInteger = (value: unknown, fieldName: string) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AppError(400, `${fieldName} must be a positive integer.`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AppError(400, `${fieldName} must be a positive integer.`);
  }

  return parsedValue;
};

export const readOptionalNonNegativeInteger = (value: unknown, fieldName: string) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AppError(400, `${fieldName} must be a non-negative integer.`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new AppError(400, `${fieldName} must be a non-negative integer.`);
  }

  return parsedValue;
};

export const readDateTime = (value: unknown, fieldName: string) => {
  if (typeof value !== "string") {
    throw new AppError(400, `${fieldName} must be a valid ISO date string.`);
  }

  const parsedValue = new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    throw new AppError(400, `${fieldName} must be a valid ISO date string.`);
  }

  return parsedValue.toISOString();
};

export const readMovementType = (value: unknown): StockMovementType => {
  if (typeof value !== "string" || !STOCK_MOVEMENT_TYPES.includes(value as StockMovementType)) {
    throw new AppError(400, "type must be either entry or exit.");
  }

  return value as StockMovementType;
};
