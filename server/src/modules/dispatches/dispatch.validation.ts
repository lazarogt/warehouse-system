import type { CreateDispatchInput, CreateDispatchItemInput } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import {
  ensureObject,
  readNonNegativeNumber,
  readPositiveInteger,
  readString,
} from "../../common/validation";

const parseDispatchItemInput = (value: unknown, index: number): CreateDispatchItemInput => {
  const item = ensureObject(value);

  return {
    productId: readPositiveInteger(item.productId, `items[${index}].productId`),
    quantity: readPositiveInteger(item.quantity, `items[${index}].quantity`),
    unitPrice: readNonNegativeNumber(item.unitPrice, `items[${index}].unitPrice`),
  };
};

export const parseCreateDispatchInput = (payload: unknown): CreateDispatchInput => {
  const body = ensureObject(payload);

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new AppError(400, "items must contain at least one dispatch item.");
  }

  return {
    manualDestination: readString(body.manualDestination, "manualDestination", {
      maxLength: 180,
    }) ?? "",
    carrierName: readString(body.carrierName, "carrierName", {
      maxLength: 180,
    }) ?? "",
    notes: readString(body.notes, "notes", {
      optional: true,
      maxLength: 1000,
    }),
    items: body.items.map((item, index) => parseDispatchItemInput(item, index)),
  };
};
