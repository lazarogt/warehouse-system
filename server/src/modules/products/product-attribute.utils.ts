import type { CategoryAttribute } from "../../../../shared/src";
import { AppError } from "../../common/errors";

export const isEmptyAttributeValue = (value: unknown) => {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)
  );
};

const normalizeTextValue = (value: unknown) => {
  if (typeof value !== "string") {
    throw new AppError(400, "Dynamic attribute value must be a string.");
  }

  const normalized = value.trim();
  return normalized || null;
};

const normalizeNumberValue = (value: unknown) => {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsedValue)) {
    throw new AppError(400, "Dynamic attribute value must be numeric.");
  }

  return String(parsedValue);
};

const normalizeBooleanValue = (value: unknown) => {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true" || normalized === "false") {
      return normalized;
    }
  }

  throw new AppError(400, "Dynamic attribute value must be true or false.");
};

const normalizeDateValue = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, "Dynamic attribute value must be a valid date.");
  }

  const normalized = value.trim();
  const parsedValue = new Date(normalized);

  if (Number.isNaN(parsedValue.getTime())) {
    throw new AppError(400, "Dynamic attribute value must be a valid date.");
  }

  return normalized.length <= 10 ? normalized : parsedValue.toISOString();
};

const normalizeSelectValue = (value: unknown, options: string[] | null, multi: boolean) => {
  if (!options || options.length === 0) {
    throw new AppError(400, "Dynamic attribute options are not configured correctly.");
  }

  if (multi) {
    if (!Array.isArray(value)) {
      throw new AppError(400, "Dynamic attribute value must be an array.");
    }

    const normalizedValues = value.map((item) => {
      if (typeof item !== "string" || !item.trim()) {
        throw new AppError(400, "Dynamic attribute value must be an array of strings.");
      }

      return item.trim();
    });

    if (normalizedValues.some((item) => !options.includes(item))) {
      throw new AppError(400, "Dynamic attribute value is not allowed for the selected category.");
    }

    return JSON.stringify(normalizedValues);
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, "Dynamic attribute value must be a string.");
  }

  const normalized = value.trim();

  if (!options.includes(normalized)) {
    throw new AppError(400, "Dynamic attribute value is not allowed for the selected category.");
  }

  return normalized;
};

const normalizeJsonValue = (value: unknown) => {
  if (typeof value === "string") {
    if (!value.trim()) {
      return null;
    }

    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      throw new AppError(400, "Dynamic attribute value must be valid JSON.");
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    throw new AppError(400, "Dynamic attribute value must be valid JSON.");
  }
};

export const parseStoredAttributeValueForValidation = (
  definition: CategoryAttribute,
  value: string,
) => {
  if (definition.type === "multiselect" || definition.type === "json") {
    try {
      return JSON.parse(value);
    } catch {
      throw new AppError(400, `${definition.label} contains stored values that are no longer valid.`);
    }
  }

  return value;
};

export const normalizeDynamicAttributeValue = (
  definition: CategoryAttribute,
  value: unknown,
) => {
  if (isEmptyAttributeValue(value)) {
    if (definition.required) {
      throw new AppError(400, `${definition.label} is required.`);
    }

    return null;
  }

  switch (definition.type) {
    case "text":
      return normalizeTextValue(value);
    case "number":
      return normalizeNumberValue(value);
    case "boolean":
      return normalizeBooleanValue(value);
    case "date":
      return normalizeDateValue(value);
    case "select":
      return normalizeSelectValue(value, definition.options, false);
    case "multiselect":
      return normalizeSelectValue(value, definition.options, true);
    case "json":
      return normalizeJsonValue(value);
    default:
      throw new AppError(400, "Unsupported dynamic attribute type.");
  }
};
