import type { CreateStockTransferInput, StockTransfer, StockTransferFilters } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { query, withTransaction } from "../../config/db";
import {
  applyStockDelta,
  assertLocationBelongsToWarehouse,
  assertProductExists,
  assertWarehouseExists,
} from "../inventory/stock.service";

type TransferRow = StockTransfer;

const transferSelect = `
  SELECT
    st.id,
    st.from_warehouse_id AS "fromWarehouseId",
    from_w.name AS "fromWarehouseName",
    st.to_warehouse_id AS "toWarehouseId",
    to_w.name AS "toWarehouseName",
    st.from_location_id AS "fromLocationId",
    from_l.name AS "fromLocationName",
    st.to_location_id AS "toLocationId",
    to_l.name AS "toLocationName",
    st.product_id AS "productId",
    p.name AS "productName",
    p.sku AS "productSku",
    st.quantity,
    st.status,
    st.requested_by AS "requestedBy",
    req_user.name AS "requestedByName",
    st.approved_by AS "approvedBy",
    app_user.name AS "approvedByName",
    st.completed_by AS "completedBy",
    comp_user.name AS "completedByName",
    st.notes,
    st.created_at AS "createdAt",
    st.updated_at AS "updatedAt"
  FROM stock_transfers st
  JOIN warehouses from_w ON from_w.id = st.from_warehouse_id
  JOIN warehouses to_w ON to_w.id = st.to_warehouse_id
  LEFT JOIN warehouse_locations from_l ON from_l.id = st.from_location_id
  LEFT JOIN warehouse_locations to_l ON to_l.id = st.to_location_id
  JOIN products p ON p.id = st.product_id
  JOIN users req_user ON req_user.id = st.requested_by
  LEFT JOIN users app_user ON app_user.id = st.approved_by
  LEFT JOIN users comp_user ON comp_user.id = st.completed_by
`;

const validateTransferEndpoints = async (input: CreateStockTransferInput) => {
  await assertWarehouseExists(input.fromWarehouseId);
  await assertWarehouseExists(input.toWarehouseId);
  await assertProductExists(input.productId);

  if (input.fromLocationId) {
    await assertLocationBelongsToWarehouse(input.fromLocationId, input.fromWarehouseId);
  }

  if (input.toLocationId) {
    await assertLocationBelongsToWarehouse(input.toLocationId, input.toWarehouseId);
  }

  if (
    input.fromWarehouseId === input.toWarehouseId &&
    (input.fromLocationId ?? null) === (input.toLocationId ?? null)
  ) {
    throw new AppError(400, "Transfer source and destination cannot be identical.");
  }
};

export const listTransfers = async (filters: StockTransferFilters) => {
  const limit = Math.min(filters.limit ?? 100, 200);

  return (
    await query<TransferRow>(
      `
        ${transferSelect}
        WHERE ($1::text IS NULL OR st.status = $1)
          AND (
            $2::bigint IS NULL
            OR st.from_warehouse_id = $2
            OR st.to_warehouse_id = $2
          )
        ORDER BY st.created_at DESC, st.id DESC
        LIMIT $3;
      `,
      [filters.status ?? null, filters.warehouseId ?? null, limit],
    )
  ).rows;
};

export const getTransferById = async (id: number) => {
  return (
    await query<TransferRow>(
      `
        ${transferSelect}
        WHERE st.id = $1;
      `,
      [id],
    )
  ).rows[0] ?? null;
};

export const createTransfer = async (input: CreateStockTransferInput, requestedBy: number) => {
  await validateTransferEndpoints(input);

  const result = await query<{ id: number }>(
    `
      INSERT INTO stock_transfers (
        from_warehouse_id,
        to_warehouse_id,
        from_location_id,
        to_location_id,
        product_id,
        quantity,
        status,
        requested_by,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
      RETURNING id;
    `,
    [
      input.fromWarehouseId,
      input.toWarehouseId,
      input.fromLocationId ?? null,
      input.toLocationId ?? null,
      input.productId,
      input.quantity,
      requestedBy,
      input.notes ?? null,
    ],
  );

  const transfer = await getTransferById(result.rows[0].id);

  if (!transfer) {
    throw new AppError(500, "Unable to load created transfer.");
  }

  return transfer;
};

export const approveTransfer = async (id: number, approvedBy: number) => {
  const result = await query<{ id: number }>(
    `
      UPDATE stock_transfers
      SET
        status = 'approved',
        approved_by = $2,
        updated_at = NOW()
      WHERE id = $1
        AND status = 'pending'
      RETURNING id;
    `,
    [id, approvedBy],
  );

  if (!result.rows[0]) {
    throw new AppError(409, "Only pending transfers can be approved.");
  }

  return getTransferById(id);
};

export const completeTransfer = async (id: number, completedBy: number) => {
  await withTransaction(async (client) => {
    const transferResult = await client.query<{
      id: number;
      fromWarehouseId: number;
      toWarehouseId: number;
      fromLocationId: number | null;
      toLocationId: number | null;
      productId: number;
      quantity: number;
      status: string;
    }>(
      `
        SELECT
          id,
          from_warehouse_id AS "fromWarehouseId",
          to_warehouse_id AS "toWarehouseId",
          from_location_id AS "fromLocationId",
          to_location_id AS "toLocationId",
          product_id AS "productId",
          quantity,
          status
        FROM stock_transfers
        WHERE id = $1
        FOR UPDATE;
      `,
      [id],
    );

    const transfer = transferResult.rows[0];

    if (!transfer) {
      throw new AppError(404, "Transfer not found.");
    }

    if (transfer.status !== "approved") {
      throw new AppError(409, "Only approved transfers can be completed.");
    }

    await applyStockDelta(client, {
      warehouseId: transfer.fromWarehouseId,
      warehouseLocationId: transfer.fromLocationId,
      productId: transfer.productId,
      delta: -transfer.quantity,
    });

    await applyStockDelta(client, {
      warehouseId: transfer.toWarehouseId,
      warehouseLocationId: transfer.toLocationId,
      productId: transfer.productId,
      delta: transfer.quantity,
    });

    await client.query(
      `
        UPDATE stock_transfers
        SET
          status = 'completed',
          completed_by = $2,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [id, completedBy],
    );
  });

  return getTransferById(id);
};

export const cancelTransfer = async (id: number) => {
  const result = await query<{ id: number }>(
    `
      UPDATE stock_transfers
      SET
        status = 'cancelled',
        updated_at = NOW()
      WHERE id = $1
        AND status IN ('pending', 'approved')
      RETURNING id;
    `,
    [id],
  );

  if (!result.rows[0]) {
    throw new AppError(409, "Only pending or approved transfers can be cancelled.");
  }

  return getTransferById(id);
};
