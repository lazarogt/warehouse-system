import type { PoolClient } from "pg";
import type { StockAdjustment, StockAdjustmentInput } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { query, withTransaction } from "../../config/db";
import {
  applyStockDelta,
  assertLocationBelongsToWarehouse,
  assertProductExists,
  assertWarehouseExists,
  getCurrentLocationQuantityForUpdate,
  getCurrentWarehouseQuantityForUpdate,
} from "../inventory/stock.service";

type AdjustmentRow = StockAdjustment;

const adjustmentSelect = `
  SELECT
    sa.id,
    sa.warehouse_id AS "warehouseId",
    w.name AS "warehouseName",
    sa.warehouse_location_id AS "warehouseLocationId",
    wl.name AS "warehouseLocationName",
    sa.product_id AS "productId",
    p.name AS "productName",
    p.sku AS "productSku",
    sa.type,
    sa.previous_quantity AS "previousQuantity",
    sa.adjusted_quantity AS "adjustedQuantity",
    sa.reason,
    sa.created_by AS "createdBy",
    u.name AS "createdByName",
    sa.created_at AS "createdAt"
  FROM stock_adjustments sa
  JOIN warehouses w ON w.id = sa.warehouse_id
  LEFT JOIN warehouse_locations wl ON wl.id = sa.warehouse_location_id
  JOIN products p ON p.id = sa.product_id
  JOIN users u ON u.id = sa.created_by
`;

export const listAdjustments = async () => {
  return (
    await query<AdjustmentRow>(
      `
        ${adjustmentSelect}
        ORDER BY sa.created_at DESC, sa.id DESC;
      `,
    )
  ).rows;
};

export const getAdjustmentById = async (id: number, client?: PoolClient) => {
  const sql = `
    ${adjustmentSelect}
    WHERE sa.id = $1;
  `;
  const result = client
    ? await client.query<AdjustmentRow>(sql, [id])
    : await query<AdjustmentRow>(sql, [id]);

  return result.rows[0] ?? null;
};

export const createAdjustment = async (input: StockAdjustmentInput, createdBy: number) => {
  return withTransaction(async (client) => {
    await assertWarehouseExists(input.warehouseId, client);
    await assertProductExists(input.productId, client);

    if (input.warehouseLocationId) {
      await assertLocationBelongsToWarehouse(input.warehouseLocationId, input.warehouseId, client);
    }

    const previousQuantity = input.warehouseLocationId
      ? await getCurrentLocationQuantityForUpdate(client, input.warehouseLocationId, input.productId)
      : await getCurrentWarehouseQuantityForUpdate(client, input.warehouseId, input.productId);

    let delta = 0;

    if (input.type === "increase") {
      if (input.adjustedQuantity <= previousQuantity) {
        throw new AppError(400, "Increase adjustments must raise the current quantity.");
      }
      delta = input.adjustedQuantity - previousQuantity;
    }

    if (input.type === "decrease") {
      if (input.adjustedQuantity >= previousQuantity) {
        throw new AppError(400, "Decrease adjustments must lower the current quantity.");
      }
      delta = input.adjustedQuantity - previousQuantity;
    }

    if (input.type === "correction") {
      delta = input.adjustedQuantity - previousQuantity;
    }

    await applyStockDelta(client, {
      warehouseId: input.warehouseId,
      warehouseLocationId: input.warehouseLocationId ?? null,
      productId: input.productId,
      delta,
    });

    const result = await client.query<{ id: number }>(
      `
        INSERT INTO stock_adjustments (
          warehouse_id,
          warehouse_location_id,
          product_id,
          type,
          previous_quantity,
          adjusted_quantity,
          reason,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
      `,
      [
        input.warehouseId,
        input.warehouseLocationId ?? null,
        input.productId,
        input.type,
        previousQuantity,
        input.adjustedQuantity,
        input.reason.trim(),
        createdBy,
      ],
    );

    const adjustment = await getAdjustmentById(result.rows[0].id, client);

    if (!adjustment) {
      throw new AppError(500, "Unable to load created adjustment.");
    }

    return adjustment;
  });
};
