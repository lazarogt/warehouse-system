import type { WarehouseInput } from "../../../../shared/src";
import { ensureObject, readString } from "../../common/validation";

export const parseWarehouseInput = (payload: unknown): WarehouseInput => {
  const body = ensureObject(payload);

  return {
    name: readString(body.name, "name", { maxLength: 120 }) as string,
    description: readString(body.description, "description", {
      optional: true,
      maxLength: 500,
    }),
  };
};

