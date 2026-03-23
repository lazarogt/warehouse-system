import {
  CATEGORY_ATTRIBUTE_TYPES,
  type CategoryAttributeInput,
  type CategoryAttributeType,
} from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { ensureObject, readString } from "../../common/validation";

const readBoolean = (value: unknown, fieldName: string, fallback?: boolean) => {
  if (value === undefined) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new AppError(400, `${fieldName} is required.`);
  }

  if (typeof value !== "boolean") {
    throw new AppError(400, `${fieldName} must be a boolean.`);
  }

  return value;
};

const readCategoryAttributeType = (value: unknown): CategoryAttributeType => {
  if (
    typeof value !== "string" ||
    !CATEGORY_ATTRIBUTE_TYPES.includes(value as CategoryAttributeType)
  ) {
    throw new AppError(400, "type is invalid.");
  }

  return value as CategoryAttributeType;
};

const readOptions = (value: unknown) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new AppError(400, "options must be an array of non-empty strings.");
  }

  return value.map((item) => item.trim());
};

const readSortOrder = (value: unknown) => {
  if (value === undefined) {
    return 0;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AppError(400, "sortOrder must be an integer.");
  }

  return value;
};

export const parseCategoryAttributeInput = (payload: unknown): CategoryAttributeInput => {
  const body = ensureObject(payload);

  return {
    key: readString(body.key, "key", { maxLength: 100 }) as string,
    label: readString(body.label, "label", { maxLength: 160 }) as string,
    type: readCategoryAttributeType(body.type),
    required: readBoolean(body.required, "required", false),
    options: readOptions(body.options),
    sortOrder: readSortOrder(body.sortOrder),
    active: readBoolean(body.active, "active", true),
  };
};

