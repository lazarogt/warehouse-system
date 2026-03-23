import type { PoolClient } from "pg";
import type { StockLevel, StockMovement, StockMovementInput } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query } from "../../config/db";

type EntityIdRow = { id: number };
type QuantityRow = { quantity: number };

export const assertWarehouseExists = async (warehouseId: number, client?: PoolClient) => {
  const result = client
    ? await client.query<EntityIdRow>(
        `SELECT id FROM warehouses WHERE id = $1 AND ${activeFilter()};`,
        [warehouseId],
      )
    : await query<EntityIdRow>(`SELECT id FROM warehouses WHERE id = $1 AND ${activeFilter()};`, [warehouseId]);

  if (!result.rows[0]) {
    throw new AppError(400, "warehouseId must reference an existing warehouse.");
  }
};

export const assertProductExists = async (productId: number, client?: PoolClient) => {
  const result = client
    ? await client.query<EntityIdRow>(
        `SELECT id FROM products WHERE id = $1 AND ${activeFilter()};`,
        [productId],
      )
    : await query<EntityIdRow>(`SELECT id FROM products WHERE id = $1 AND ${activeFilter()};`, [productId]);

  if (!result.rows[0]) {
    throw new AppError(400, "productId must reference an existing product.");
  }
};

export const assertLocationExists = async (locationId: number, client?: PoolClient) => {
  const result = client
    ? await client.query<EntityIdRow>(
        `SELECT id FROM warehouse_locations WHERE id = $1 AND ${activeFilter()};`,
        [locationId],
      )
    : await query<EntityIdRow>(
        `SELECT id FROM warehouse_locations WHERE id = $1 AND ${activeFilter()};`,
        [locationId],
      );

  if (!result.rows[0]) {
    throw new AppError(400, "warehouseLocationId must reference an existing location.");
  }
};

export const assertLocationBelongsToWarehouse = async (
  locationId: number,
  warehouseId: number,
  client?: PoolClient,
) => {
  const result = client
    ? await client.query<EntityIdRow>(
        `
          SELECT id
          FROM warehouse_locations
          WHERE id = $1
            AND warehouse_id = $2
            AND ${activeFilter()}
            AND active = TRUE;
        `,
        [locationId, warehouseId],
      )
    : await query<EntityIdRow>(
        `
          SELECT id
          FROM warehouse_locations
          WHERE id = $1
            AND warehouse_id = $2
            AND ${activeFilter()}
            AND active = TRUE;
        `,
        [locationId, warehouseId],
      );

  if (!result.rows[0]) {
    throw new AppError(400, "warehouseLocationId must belong to the selected active warehouse.");
  }
};

const ensureWarehouseStockRow = async (
  client: PoolClient,
  warehouseId: number,
  productId: number,
) => {
  await client.query(
    `
      INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
      VALUES ($1, $2, 0)
      ON CONFLICT (warehouse_id, product_id) DO NOTHING;
    `,
    [warehouseId, productId],
  );
};

const ensureLocationStockRow = async (
  client: PoolClient,
  warehouseLocationId: number,
  productId: number,
) => {
  await client.query(
    `
      INSERT INTO warehouse_location_stock (warehouse_location_id, product_id, quantity)
      VALUES ($1, $2, 0)
      ON CONFLICT (warehouse_location_id, product_id) DO NOTHING;
    `,
    [warehouseLocationId, productId],
  );
};

export const getCurrentWarehouseQuantityForUpdate = async (
  client: PoolClient,
  warehouseId: number,
  productId: number,
) => {
  await ensureWarehouseStockRow(client, warehouseId, productId);
  const result = await client.query<QuantityRow>(
    `
      SELECT quantity
      FROM warehouse_stock
      WHERE warehouse_id = $1
        AND product_id = $2
      FOR UPDATE;
    `,
    [warehouseId, productId],
  );

  return result.rows[0]?.quantity ?? 0;
};

export const getCurrentLocationQuantityForUpdate = async (
  client: PoolClient,
  warehouseLocationId: number,
  productId: number,
) => {
  await ensureLocationStockRow(client, warehouseLocationId, productId);
  const result = await client.query<QuantityRow>(
    `
      SELECT quantity
      FROM warehouse_location_stock
      WHERE warehouse_location_id = $1
        AND product_id = $2
      FOR UPDATE;
    `,
    [warehouseLocationId, productId],
  );

  return result.rows[0]?.quantity ?? 0;
};

export const applyStockDelta = async (
  client: PoolClient,
  input: {
    warehouseId: number;
    warehouseLocationId?: number | null;
    productId: number;
    delta: number;
  },
) => {
  const currentWarehouseQuantity = await getCurrentWarehouseQuantityForUpdate(
    client,
    input.warehouseId,
    input.productId,
  );
  const nextWarehouseQuantity = currentWarehouseQuantity + input.delta;

  if (nextWarehouseQuantity < 0) {
    throw new AppError(400, "Stock cannot become negative.");
  }

  await client.query(
    `
      UPDATE warehouse_stock
      SET quantity = $3, updated_at = NOW()
      WHERE warehouse_id = $1
        AND product_id = $2;
    `,
    [input.warehouseId, input.productId, nextWarehouseQuantity],
  );

  let nextLocationQuantity: number | null = null;

  if (input.warehouseLocationId) {
    const currentLocationQuantity = await getCurrentLocationQuantityForUpdate(
      client,
      input.warehouseLocationId,
      input.productId,
    );
    nextLocationQuantity = currentLocationQuantity + input.delta;

    if (nextLocationQuantity < 0) {
      throw new AppError(400, "Location stock cannot become negative.");
    }

    await client.query(
      `
        UPDATE warehouse_location_stock
        SET quantity = $3, updated_at = NOW()
        WHERE warehouse_location_id = $1
          AND product_id = $2;
      `,
      [input.warehouseLocationId, input.productId, nextLocationQuantity],
    );
  }

  return {
    warehouseQuantity: nextWarehouseQuantity,
    locationQuantity: nextLocationQuantity,
  };
};

export const insertStockMovement = async (
  client: PoolClient,
  input: StockMovementInput,
  userId: number,
) => {
  const result = await client.query<{ id: number }>(
    `
      INSERT INTO stock_movements (
        product_id,
        warehouse_id,
        warehouse_location_id,
        user_id,
        type,
        quantity,
        movement_date,
        observation
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id;
    `,
    [
      input.productId,
      input.warehouseId,
      input.warehouseLocationId ?? null,
      userId,
      input.type,
      input.quantity,
      input.movementDate,
      input.observation ?? null,
    ],
  );

  return result.rows[0]?.id;
};

export const getStockLevelByProductWarehouseAndLocation = async (
  productId: number,
  warehouseId: number,
  warehouseLocationId?: number | null,
  client?: PoolClient,
) => {
  if (warehouseLocationId) {
    const sql = `
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        p.sku AS "productSku",
        w.id AS "warehouseId",
        w.name AS "warehouseName",
        wl.id AS "warehouseLocationId",
        wl.name AS "warehouseLocationName",
        COALESCE(wls.quantity, 0) AS quantity
      FROM products p
      JOIN warehouses w ON w.id = $2
      JOIN warehouse_locations wl ON wl.id = $3
      LEFT JOIN warehouse_location_stock wls
        ON wls.product_id = p.id
       AND wls.warehouse_location_id = wl.id
      WHERE p.id = $1
        AND ${activeFilter("w")}
        AND ${activeFilter("wl")}
        AND ${activeFilter("p")};
    `;

    const result = client
      ? await client.query<StockLevel>(sql, [productId, warehouseId, warehouseLocationId])
      : await query<StockLevel>(sql, [productId, warehouseId, warehouseLocationId]);

    return result.rows[0] ?? null;
  }

  const sql = `
    SELECT
      p.id AS "productId",
      p.name AS "productName",
      p.sku AS "productSku",
      w.id AS "warehouseId",
      w.name AS "warehouseName",
      NULL::bigint AS "warehouseLocationId",
      NULL::text AS "warehouseLocationName",
      COALESCE(ws.quantity, 0) AS quantity
    FROM products p
    JOIN warehouses w ON w.id = $2
    LEFT JOIN warehouse_stock ws
      ON ws.product_id = p.id
     AND ws.warehouse_id = w.id
    WHERE p.id = $1
      AND ${activeFilter("w")}
      AND ${activeFilter("p")};
  `;

  const result = client
    ? await client.query<StockLevel>(sql, [productId, warehouseId])
    : await query<StockLevel>(sql, [productId, warehouseId]);

  return result.rows[0] ?? null;
};

export const listStockLevels = async (filters: {
  productId?: number;
  warehouseId?: number;
  warehouseLocationId?: number;
}) => {
  if (filters.warehouseLocationId !== undefined) {
    return (
      await query<StockLevel>(
        `
          SELECT
            wls.product_id AS "productId",
            p.name AS "productName",
            p.sku AS "productSku",
            wl.warehouse_id AS "warehouseId",
            w.name AS "warehouseName",
            wls.warehouse_location_id AS "warehouseLocationId",
            wl.name AS "warehouseLocationName",
            wls.quantity
          FROM warehouse_location_stock wls
          JOIN products p ON p.id = wls.product_id
          JOIN warehouse_locations wl ON wl.id = wls.warehouse_location_id
          JOIN warehouses w ON w.id = wl.warehouse_id
          WHERE ($1::bigint IS NULL OR wls.product_id = $1)
            AND ($2::bigint IS NULL OR wl.warehouse_id = $2)
            AND ($3::bigint IS NULL OR wls.warehouse_location_id = $3)
            AND ${activeFilter("wl")}
            AND ${activeFilter("w")}
            AND ${activeFilter("p")}
          ORDER BY wls.product_id, wl.warehouse_id, wls.warehouse_location_id;
        `,
        [
          filters.productId ?? null,
          filters.warehouseId ?? null,
          filters.warehouseLocationId ?? null,
        ],
      )
    ).rows;
  }

  return (
    await query<StockLevel>(
      `
        SELECT
          ws.product_id AS "productId",
          p.name AS "productName",
          p.sku AS "productSku",
          ws.warehouse_id AS "warehouseId",
          w.name AS "warehouseName",
          NULL::bigint AS "warehouseLocationId",
          NULL::text AS "warehouseLocationName",
          ws.quantity
        FROM warehouse_stock ws
        JOIN products p ON p.id = ws.product_id
        JOIN warehouses w ON w.id = ws.warehouse_id
        WHERE ($1::bigint IS NULL OR ws.product_id = $1)
          AND ($2::bigint IS NULL OR ws.warehouse_id = $2)
          AND ${activeFilter("w")}
          AND ${activeFilter("p")}
        ORDER BY ws.product_id, ws.warehouse_id;
      `,
      [filters.productId ?? null, filters.warehouseId ?? null],
    )
  ).rows;
};

export const listDetailedStockMovements = async (limit: number) => {
  return (
    await query<StockMovement>(
      `
        SELECT
          sm.id,
          sm.product_id AS "productId",
          p.name AS "productName",
          p.sku AS "productSku",
          sm.warehouse_id AS "warehouseId",
          w.name AS "warehouseName",
          sm.warehouse_location_id AS "warehouseLocationId",
          wl.name AS "warehouseLocationName",
          sm.user_id AS "userId",
          u.name AS "userName",
          sm.type,
          sm.quantity,
          sm.movement_date AS "movementDate",
          sm.observation,
          sm.created_at AS "createdAt"
        FROM stock_movements sm
        JOIN products p ON p.id = sm.product_id
        JOIN warehouses w ON w.id = sm.warehouse_id
        LEFT JOIN warehouse_locations wl ON wl.id = sm.warehouse_location_id
        JOIN users u ON u.id = sm.user_id
        ORDER BY sm.movement_date DESC, sm.id DESC
        LIMIT $1;
      `,
      [limit],
    )
  ).rows;
};

export const getDetailedStockMovementById = async (id: number, client?: PoolClient) => {
  const sql = `
    SELECT
      sm.id,
      sm.product_id AS "productId",
      p.name AS "productName",
      p.sku AS "productSku",
      sm.warehouse_id AS "warehouseId",
      w.name AS "warehouseName",
      sm.warehouse_location_id AS "warehouseLocationId",
      wl.name AS "warehouseLocationName",
      sm.user_id AS "userId",
      u.name AS "userName",
      sm.type,
      sm.quantity,
      sm.movement_date AS "movementDate",
      sm.observation,
      sm.created_at AS "createdAt"
    FROM stock_movements sm
    JOIN products p ON p.id = sm.product_id
    JOIN warehouses w ON w.id = sm.warehouse_id
    LEFT JOIN warehouse_locations wl ON wl.id = sm.warehouse_location_id
    JOIN users u ON u.id = sm.user_id
    WHERE sm.id = $1;
  `;

  const result = client
    ? await client.query<StockMovement>(sql, [id])
    : await query<StockMovement>(sql, [id]);

  return result.rows[0] ?? null;
};
