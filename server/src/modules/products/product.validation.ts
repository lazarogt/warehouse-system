import type { ProductAttributeInput, ProductFilters, ProductInput } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import {
  ensureObject,
  readNonNegativeInteger,
  readNonNegativeNumber,
  readOptionalNonNegativeInteger,
  readOptionalPositiveInteger,
  readOptionalQueryId,
  readPositiveInteger,
  readString,
} from "../../common/validation";

const parseProductAttributes = (value: unknown): ProductAttributeInput[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new AppError(400, "attributes must be an array.");
  }

  return value.map((item, index) => {
    const attribute = ensureObject(item);

    return {
      categoryAttributeId: readPositiveInteger(
        attribute.categoryAttributeId,
        `attributes[${index}].categoryAttributeId`,
      ),
      value: attribute.value ?? null,
    };
  });
};

export const parseProductInput = (payload: unknown): ProductInput => {
  const body = ensureObject(payload);

  return {
    name: readString(body.name, "name", { maxLength: 160 }) as string,
    sku: readString(body.sku, "sku", {
      optional: true,
      maxLength: 80,
    }),
    barcode: readString(body.barcode, "barcode", {
      optional: true,
      maxLength: 120,
    }),
    description: readString(body.description, "description", {
      optional: true,
      maxLength: 1000,
    }),
    categoryId: readPositiveInteger(body.categoryId, "categoryId"),
    price: readNonNegativeNumber(body.price, "price"),
    minimumStock: readNonNegativeInteger(body.minimumStock, "minimumStock"),
    attributes: parseProductAttributes(body.attributes),
  };
};

export const parseProductLookup = (query: Record<string, unknown>) => {
  const sku = typeof query.sku === "string" && query.sku.trim() ? query.sku.trim() : undefined;
  const barcode =
    typeof query.barcode === "string" && query.barcode.trim() ? query.barcode.trim() : undefined;

  if (!sku && !barcode) {
    throw new AppError(400, "Provide either sku or barcode.");
  }

  return {
    sku,
    barcode,
  };
};

export const parseProductFilters = (query: Record<string, unknown>): ProductFilters => {
  const searchValue = query.search;
  const attributeKeyValue = query.attributeKey;
  const attributeValueValue = query.attributeValue;

  return {
    page: readOptionalPositiveInteger(query.page, "page"),
    pageSize: readOptionalPositiveInteger(query.pageSize, "pageSize"),
    search: typeof searchValue === "string" && searchValue.trim() ? searchValue.trim() : undefined,
    categoryId: readOptionalQueryId(query.categoryId, "categoryId"),
    attributeKey:
      typeof attributeKeyValue === "string" && attributeKeyValue.trim()
        ? attributeKeyValue.trim()
        : undefined,
    attributeValue:
      typeof attributeValueValue === "string" && attributeValueValue.trim()
        ? attributeValueValue.trim()
        : undefined,
    maximumMinimumStock: readOptionalNonNegativeInteger(
      query.maximumMinimumStock,
      "maximumMinimumStock",
    ),
    maximumCurrentStock: readOptionalNonNegativeInteger(
      query.maximumCurrentStock,
      "maximumCurrentStock",
    ),
  };
};
