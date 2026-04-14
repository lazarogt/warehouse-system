import type { DatabaseClient } from "../../lib/db";
import type { StockLevel, StockMovement, StockMovementInput } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query } from "../../lib/db";

type EntityIdRow = { id: number };
type QuantityRow = { quantity: number };
type WarehouseStockRow = { warehouseId: number; quantity: number };
type LocationStockRow = { warehouseLocationId: number; quantity: number };

export const assertWarehouseExists = (warehouseId: number, client?: DatabaseClient) => {
  const result = client
    ? client.query<EntityIdRow>(
        `SELECT id FROM warehouses WHERE id = $1 AND ${activeFilter()};`,
        [warehouseId],
      )
    : query<EntityIdRow>(`SELECT id FROM warehouses WHERE id = $1 AND ${activeFilter()};`, [warehouseId]);

  if (!result.rows[0]) {
    throw new AppError(400, "warehouseId must reference an existing warehouse.");
  }
};

export const assertProductExists = (productId: number, client?: DatabaseClient) => {
  const result = client
    ? client.query<EntityIdRow>(
        `SELECT id FROM products WHERE id = $1 AND ${activeFilter()};`,
        [productId],
      )
    : query<EntityIdRow>(`SELECT id FROM products WHERE id = $1 AND ${activeFilter()};`, [productId]);

  if (!result.rows[0]) {
    throw new AppError(400, "productId must reference an existing product.");
  }
};

export const assertLocationExists = (locationId: number, client?: DatabaseClient) => {
  const result = client
    ? client.query<EntityIdRow>(
        `SELECT id FROM warehouse_locations WHERE id = $1 AND ${activeFilter()};`,
        [locationId],
      )
    : query<EntityIdRow>(
        `SELECT id FROM warehouse_locations WHERE id = $1 AND ${activeFilter()};`,
        [locationId],
      );

  if (!result.rows[0]) {
    throw new AppError(400, "warehouseLocationId must reference an existing location.");
  }
};

export const assertLocationBelongsToWarehouse = (
  locationId: number,
  warehouseId: number,
  client?: DatabaseClient,
) => {
  const result = client
    ? client.query<EntityIdRow>(
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
    : query<EntityIdRow>(
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

const ensureWarehouseStockRow = (
  client: DatabaseClient,
  warehouseId: number,
  productId: number,
) => {
  client.query(
    `
      INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
      VALUES ($1, $2, 0)
      ON CONFLICT (warehouse_id, product_id) DO NOTHING;
    `,
    [warehouseId, productId],
  );
};

const ensureLocationStockRow = (
  client: DatabaseClient,
  warehouseLocationId: number,
  productId: number,
) => {
  client.query(
    `
      INSERT INTO warehouse_location_stock (warehouse_location_id, product_id, quantity)
      VALUES ($1, $2, 0)
      ON CONFLICT (warehouse_location_id, product_id) DO NOTHING;
    `,
    [warehouseLocationId, productId],
  );
};

export const getCurrentWarehouseQuantityForUpdate = (
  client: DatabaseClient,
  warehouseId: number,
  productId: number,
) => {
  ensureWarehouseStockRow(client, warehouseId, productId);
  const result = client.query<QuantityRow>(
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

export const getCurrentLocationQuantityForUpdate = (
  client: DatabaseClient,
  warehouseLocationId: number,
  productId: number,
) => {
  ensureLocationStockRow(client, warehouseLocationId, productId);
  const result = client.query<QuantityRow>(
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

export const applyStockDelta = (
  client: DatabaseClient,
  input: {
    warehouseId: number;
    warehouseLocationId?: number | null;
    productId: number;
    delta: number;
  },
) => {
  const currentWarehouseQuantity = getCurrentWarehouseQuantityForUpdate(
    client,
    input.warehouseId,
    input.productId,
  );
  const nextWarehouseQuantity = currentWarehouseQuantity + input.delta;

  if (nextWarehouseQuantity < 0) {
    throw new AppError(400, "Stock cannot become negative.");
  }

  client.query(
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
    const currentLocationQuantity = getCurrentLocationQuantityForUpdate(
      client,
      input.warehouseLocationId,
      input.productId,
    );
    nextLocationQuantity = currentLocationQuantity + input.delta;

    if (nextLocationQuantity < 0) {
      throw new AppError(400, "Location stock cannot become negative.");
    }

    client.query(
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

export const consumeProductStock = (
  client: DatabaseClient,
  input: {
    productId: number;
    quantity: number;
  },
) => {
  const allocations: Array<{
    warehouseId: number;
    warehouseLocationId: number | null;
    quantity: number;
  }> = [];
  const warehouseStockRows = client.query<WarehouseStockRow>(
    `
      SELECT
        ws.warehouse_id AS "warehouseId",
        ws.quantity
      FROM warehouse_stock ws
      JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE ws.product_id = $1
        AND ws.quantity > 0
        AND ${activeFilter("w")}
      ORDER BY ws.quantity DESC, ws.warehouse_id ASC
      FOR UPDATE OF ws;
    `,
    [input.productId],
  );

  const totalAvailable = warehouseStockRows.rows.reduce((sum, row) => sum + row.quantity, 0);

  if (totalAvailable < input.quantity) {
    throw new AppError(400, "Stock cannot become negative.");
  }

  let remaining = input.quantity;

  for (const warehouseRow of warehouseStockRows.rows) {
    if (remaining <= 0) {
      break;
    }

    let warehouseRemaining = Math.min(warehouseRow.quantity, remaining);
    const locationStockRows = client.query<LocationStockRow>(
      `
        SELECT
          wls.warehouse_location_id AS "warehouseLocationId",
          wls.quantity
        FROM warehouse_location_stock wls
        JOIN warehouse_locations wl ON wl.id = wls.warehouse_location_id
        WHERE wls.product_id = $1
          AND wl.warehouse_id = $2
          AND wls.quantity > 0
          AND ${activeFilter("wl")}
        ORDER BY wls.quantity DESC, wls.warehouse_location_id ASC
        FOR UPDATE OF wls;
      `,
      [input.productId, warehouseRow.warehouseId],
    );

    for (const locationRow of locationStockRows.rows) {
      if (warehouseRemaining <= 0) {
        break;
      }

      const locationTake = Math.min(locationRow.quantity, warehouseRemaining);

      applyStockDelta(client, {
        warehouseId: warehouseRow.warehouseId,
        warehouseLocationId: locationRow.warehouseLocationId,
        productId: input.productId,
        delta: -locationTake,
      });
      allocations.push({
        warehouseId: warehouseRow.warehouseId,
        warehouseLocationId: locationRow.warehouseLocationId,
        quantity: locationTake,
      });

      warehouseRemaining -= locationTake;
      remaining -= locationTake;
    }

    if (warehouseRemaining > 0) {
      applyStockDelta(client, {
        warehouseId: warehouseRow.warehouseId,
        productId: input.productId,
        delta: -warehouseRemaining,
      });
      allocations.push({
        warehouseId: warehouseRow.warehouseId,
        warehouseLocationId: null,
        quantity: warehouseRemaining,
      });

      remaining -= warehouseRemaining;
    }
  }

  if (remaining > 0) {
    throw new AppError(400, "Stock cannot become negative.");
  }

  return allocations;
};

export const insertStockMovement = (
  client: DatabaseClient,
  input: StockMovementInput,
  userId: number,
) => {
  const result = client.query<{ id: number }>(
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

export const insertStockMovementForDelta = (
  client: DatabaseClient,
  input: {
    warehouseId: number;
    warehouseLocationId?: number | null;
    productId: number;
    delta: number;
    userId: number;
    movementDate?: string;
    observation?: string | null;
  },
) => {
  if (input.delta === 0) {
    return null;
  }

  const movementId = insertStockMovement(
    client,
    {
      productId: input.productId,
      warehouseId: input.warehouseId,
      warehouseLocationId: input.warehouseLocationId ?? null,
      type: input.delta > 0 ? "entry" : "exit",
      quantity: Math.abs(input.delta),
      movementDate: input.movementDate ?? new Date().toISOString(),
      observation: input.observation ?? null,
    },
    input.userId,
  );

  if (!movementId) {
    throw new AppError(500, "Unable to save stock movement.");
  }

  return movementId;
};

export const getStockLevelByProductWarehouseAndLocation = (
  productId: number,
  warehouseId: number,
  warehouseLocationId?: number | null,
  client?: DatabaseClient,
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
      ? client.query<StockLevel>(sql, [productId, warehouseId, warehouseLocationId])
      : query<StockLevel>(sql, [productId, warehouseId, warehouseLocationId]);

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
    ? client.query<StockLevel>(sql, [productId, warehouseId])
    : query<StockLevel>(sql, [productId, warehouseId]);

  return result.rows[0] ?? null;
};

export const listStockLevels = (filters: {
  productId?: number;
  warehouseId?: number;
  warehouseLocationId?: number;
}) => {
  if (filters.warehouseLocationId !== undefined) {
    return (
      query<StockLevel>(
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
    query<StockLevel>(
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

export const listDetailedStockMovements = (limit: number) => {
  return (
    query<StockMovement>(
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

export const getDetailedStockMovementById = (id: number, client?: DatabaseClient) => {
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
    ? client.query<StockMovement>(sql, [id])
    : query<StockMovement>(sql, [id]);

  return result.rows[0] ?? null;
};
