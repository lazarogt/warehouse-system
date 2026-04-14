import type { DatabaseClient } from "../../lib/db";
import type { CreateDispatchInput, Dispatch } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query, transaction } from "../../lib/db";
import {
  assertProductExists,
  consumeProductStock,
  insertStockMovement,
} from "../inventory/stock.service";

type DispatchHeaderRow = {
  id: number;
  manualDestination: string;
  carrierName: string;
  createdAt: string;
  notes: string | null;
  totalAmount: number;
};

type DispatchItemRow = {
  id: number;
  dispatchId: number;
  productId: number;
  productName: string;
  productSku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type DispatchItemsById = Record<number, DispatchItemRow[]>;
type ProductPriceRow = {
  price: number | null;
};

const dispatchSelect = `
  SELECT
    d.id,
    d.manual_destination AS "manualDestination",
    d.carrier_name AS "carrierName",
    d.created_at AS "createdAt",
    d.notes,
    d.total_amount::float8 AS "totalAmount"
  FROM dispatches d
`;

const dispatchItemSelect = `
  SELECT
    di.id,
    di.dispatch_id AS "dispatchId",
    di.product_id AS "productId",
    p.name AS "productName",
    p.sku AS "productSku",
    di.quantity,
    di.unit_price::float8 AS "unitPrice",
    di.line_total::float8 AS "lineTotal"
  FROM dispatch_items di
  JOIN products p ON p.id = di.product_id
`;

export const getDispatchById = (id: number, client?: DatabaseClient): Dispatch | null => {
  const dispatchResult = client
    ? client.query<DispatchHeaderRow>(
        `
          ${dispatchSelect}
          WHERE d.id = $1;
        `,
        [id],
      )
    : query<DispatchHeaderRow>(
        `
          ${dispatchSelect}
          WHERE d.id = $1;
        `,
        [id],
      );

  const dispatch = dispatchResult.rows[0];

  if (!dispatch) {
    return null;
  }

  const itemsResult = client
    ? client.query<DispatchItemRow>(
        `
          ${dispatchItemSelect}
          WHERE di.dispatch_id = $1
          ORDER BY di.id ASC;
        `,
        [id],
      )
    : query<DispatchItemRow>(
        `
          ${dispatchItemSelect}
          WHERE di.dispatch_id = $1
          ORDER BY di.id ASC;
        `,
        [id],
      );

  return {
    ...dispatch,
    items: itemsResult.rows,
  };
};

export const listDispatches = async (client?: DatabaseClient): Promise<Dispatch[]> => {
  const dispatchResult = client
    ? await client.query<DispatchHeaderRow>(
        `
          ${dispatchSelect}
          ORDER BY d.created_at DESC, d.id DESC;
        `,
      )
    : await query<DispatchHeaderRow>(
        `
          ${dispatchSelect}
          ORDER BY d.created_at DESC, d.id DESC;
        `,
      );

  if (dispatchResult.rows.length === 0) {
    return [];
  }

  const dispatchIds = dispatchResult.rows.map((dispatch) => dispatch.id);
  const placeholders = dispatchIds.map(() => "?").join(", ");
  const itemsResult = client
    ? await client.query<DispatchItemRow>(
        `
          ${dispatchItemSelect}
          WHERE di.dispatch_id IN (${placeholders})
          ORDER BY di.dispatch_id DESC, di.id ASC;
        `,
        dispatchIds,
      )
    : await query<DispatchItemRow>(
        `
          ${dispatchItemSelect}
          WHERE di.dispatch_id IN (${placeholders})
          ORDER BY di.dispatch_id DESC, di.id ASC;
        `,
        dispatchIds,
      );

  const itemsByDispatchId = itemsResult.rows.reduce<DispatchItemsById>((accumulator, item) => {
    const currentItems = accumulator[item.dispatchId] ?? [];
    currentItems.push(item);
    accumulator[item.dispatchId] = currentItems;
    return accumulator;
  }, {});

  return dispatchResult.rows.map((dispatch) => ({
    ...dispatch,
    items: itemsByDispatchId[dispatch.id] ?? [],
  }));
};

const assertNoDuplicateProducts = (input: CreateDispatchInput) => {
  const seenProductIds = new Set<number>();

  for (const item of input.items) {
    if (seenProductIds.has(item.productId)) {
      throw new AppError(400, "items cannot contain duplicate productId values.");
    }

    seenProductIds.add(item.productId);
  }
};

const getProductDispatchPrice = (productId: number, client: DatabaseClient) => {
  const result = client.query<ProductPriceRow>(
    `
      SELECT p.price::float8 AS price
      FROM products p
      WHERE p.id = $1
        AND ${activeFilter("p")};
    `,
    [productId],
  );

  const price = result.rows[0]?.price;

  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new AppError(400, "Selected product does not have a valid price.");
  }

  return price;
};

export const createDispatch = async (input: CreateDispatchInput, userId: number) => {
  assertNoDuplicateProducts(input);

  return transaction((client) => {
    const pricedItems: Array<{
      productId: number;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];

    for (const item of input.items) {
      assertProductExists(item.productId, client);
      const unitPrice = getProductDispatchPrice(item.productId, client);
      pricedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        lineTotal: Number((item.quantity * unitPrice).toFixed(2)),
      });
    }

    const totalAmount = Number(
      pricedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );

    const dispatchResult = client.query<{ id: number }>(
      `
        INSERT INTO dispatches (
          manual_destination,
          carrier_name,
          notes,
          total_amount
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `,
      [input.manualDestination, input.carrierName, input.notes ?? null, totalAmount],
    );

    const dispatchId = dispatchResult.rows[0]?.id;

    if (!dispatchId) {
      throw new AppError(500, "Unable to create dispatch.");
    }

    const movementDate = new Date().toISOString();
    const observationPrefix = `Despacho #${dispatchId} · Destino: ${input.manualDestination} · Transportista: ${input.carrierName}`;

    for (const item of pricedItems) {
      const allocations = consumeProductStock(client, {
        productId: item.productId,
        quantity: item.quantity,
      });

      client.query(
        `
          INSERT INTO dispatch_items (
            dispatch_id,
            product_id,
            quantity,
            unit_price,
            line_total
          )
          VALUES ($1, $2, $3, $4, $5);
        `,
        [dispatchId, item.productId, item.quantity, item.unitPrice, item.lineTotal],
      );

      for (const allocation of allocations) {
        insertStockMovement(
          client,
          {
            productId: item.productId,
            warehouseId: allocation.warehouseId,
            warehouseLocationId: allocation.warehouseLocationId,
            type: "exit",
            quantity: allocation.quantity,
            movementDate,
            observation: input.notes?.trim()
              ? `${observationPrefix} · Nota: ${input.notes.trim()}`
              : observationPrefix,
          },
          userId,
        );
      }
    }

    const dispatch = getDispatchById(dispatchId, client);

    if (!dispatch) {
      throw new AppError(500, "Unable to load created dispatch.");
    }

    return dispatch;
  }).immediate();
};
