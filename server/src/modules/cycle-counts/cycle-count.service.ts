import type {
  CreateCycleCountInput,
  CreateCycleCountItemInput,
  CycleCount,
  CycleCountItem,
  UpdateCycleCountItemInput,
} from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { query, withTransaction } from "../../config/db";
import {
  applyStockDelta,
  assertLocationBelongsToWarehouse,
  assertProductExists,
  assertWarehouseExists,
  getStockLevelByProductWarehouseAndLocation,
} from "../inventory/stock.service";

type CycleCountRow = Omit<CycleCount, "items">;
type CycleCountItemRow = CycleCountItem;

const cycleCountSelect = `
  SELECT
    cc.id,
    cc.warehouse_id AS "warehouseId",
    w.name AS "warehouseName",
    cc.warehouse_location_id AS "warehouseLocationId",
    wl.name AS "warehouseLocationName",
    cc.status,
    cc.created_by AS "createdBy",
    u.name AS "createdByName",
    cc.started_at AS "startedAt",
    cc.completed_at AS "completedAt",
    cc.notes
  FROM cycle_counts cc
  JOIN warehouses w ON w.id = cc.warehouse_id
  LEFT JOIN warehouse_locations wl ON wl.id = cc.warehouse_location_id
  JOIN users u ON u.id = cc.created_by
`;

const cycleCountItemSelect = `
  SELECT
    cci.id,
    cci.cycle_count_id AS "cycleCountId",
    cci.product_id AS "productId",
    p.name AS "productName",
    p.sku AS "productSku",
    cci.expected_quantity AS "expectedQuantity",
    cci.counted_quantity AS "countedQuantity",
    cci.difference,
    cci.resolved,
    cci.created_at AS "createdAt",
    cci.updated_at AS "updatedAt"
  FROM cycle_count_items cci
  JOIN products p ON p.id = cci.product_id
`;

const getCycleCountItems = async (cycleCountId: number) => {
  return (
    await query<CycleCountItemRow>(
      `
        ${cycleCountItemSelect}
        WHERE cci.cycle_count_id = $1
        ORDER BY cci.id;
      `,
      [cycleCountId],
    )
  ).rows;
};

const hydrateCycleCount = async (row: CycleCountRow): Promise<CycleCount> => {
  return {
    ...row,
    items: await getCycleCountItems(row.id),
  };
};

const getCycleCountRowById = async (id: number) => {
  return (
    await query<CycleCountRow>(
      `
        ${cycleCountSelect}
        WHERE cc.id = $1;
      `,
      [id],
    )
  ).rows[0] ?? null;
};

export const listCycleCounts = async () => {
  const rows = (
    await query<CycleCountRow>(
      `
        ${cycleCountSelect}
        ORDER BY cc.created_at DESC, cc.id DESC;
      `,
    )
  ).rows;

  return Promise.all(rows.map(hydrateCycleCount));
};

export const getCycleCountById = async (id: number) => {
  const row = await getCycleCountRowById(id);
  return row ? hydrateCycleCount(row) : null;
};

export const createCycleCount = async (input: CreateCycleCountInput, createdBy: number) => {
  await assertWarehouseExists(input.warehouseId);

  if (input.warehouseLocationId) {
    await assertLocationBelongsToWarehouse(input.warehouseLocationId, input.warehouseId);
  }

  const result = await query<{ id: number }>(
    `
      INSERT INTO cycle_counts (warehouse_id, warehouse_location_id, status, created_by, notes)
      VALUES ($1, $2, 'draft', $3, $4)
      RETURNING id;
    `,
    [input.warehouseId, input.warehouseLocationId ?? null, createdBy, input.notes ?? null],
  );

  return getCycleCountById(result.rows[0].id);
};

export const addCycleCountItem = async (id: number, input: CreateCycleCountItemInput) => {
  const cycleCount = await getCycleCountRowById(id);

  if (!cycleCount) {
    throw new AppError(404, "Cycle count not found.");
  }

  if (cycleCount.status === "completed" || cycleCount.status === "cancelled") {
    throw new AppError(409, "Cannot add items to a completed or cancelled cycle count.");
  }

  await assertProductExists(input.productId);

  const expectedStock = await getStockLevelByProductWarehouseAndLocation(
    input.productId,
    cycleCount.warehouseId,
    cycleCount.warehouseLocationId,
  );

  const result = await query<{ id: number }>(
    `
      INSERT INTO cycle_count_items (
        cycle_count_id,
        product_id,
        expected_quantity
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (cycle_count_id, product_id)
      DO UPDATE SET
        expected_quantity = EXCLUDED.expected_quantity,
        updated_at = NOW()
      RETURNING id;
    `,
    [id, input.productId, expectedStock?.quantity ?? 0],
  );

  return (
    await query<CycleCountItemRow>(
      `
        ${cycleCountItemSelect}
        WHERE cci.id = $1;
      `,
      [result.rows[0].id],
    )
  ).rows[0];
};

export const updateCycleCountItem = async (
  cycleCountId: number,
  itemId: number,
  input: UpdateCycleCountItemInput,
) => {
  const cycleCount = await getCycleCountRowById(cycleCountId);

  if (!cycleCount) {
    throw new AppError(404, "Cycle count not found.");
  }

  if (cycleCount.status !== "draft" && cycleCount.status !== "in_progress") {
    throw new AppError(409, "Cycle count item can only be updated while the count is open.");
  }

  const result = await query<CycleCountItemRow>(
    `
      UPDATE cycle_count_items
      SET
        counted_quantity = $3,
        difference = $3 - expected_quantity,
        resolved = $4,
        updated_at = NOW()
      WHERE id = $1
        AND cycle_count_id = $2
      RETURNING
        id,
        cycle_count_id AS "cycleCountId",
        product_id AS "productId",
        NULL::text AS "productName",
        NULL::text AS "productSku",
        expected_quantity AS "expectedQuantity",
        counted_quantity AS "countedQuantity",
        difference,
        resolved,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [itemId, cycleCountId, input.countedQuantity, input.resolved ?? false],
  );

  if (!result.rows[0]) {
    throw new AppError(404, "Cycle count item not found.");
  }

  const item = (
    await query<CycleCountItemRow>(
      `
        ${cycleCountItemSelect}
        WHERE cci.id = $1;
      `,
      [itemId],
    )
  ).rows[0];

  return item;
};

export const startCycleCount = async (id: number) => {
  const result = await query<{ id: number }>(
    `
      UPDATE cycle_counts
      SET
        status = 'in_progress',
        updated_at = NOW()
      WHERE id = $1
        AND status = 'draft'
      RETURNING id;
    `,
    [id],
  );

  if (!result.rows[0]) {
    throw new AppError(409, "Only draft cycle counts can be started.");
  }

  return getCycleCountById(id);
};

export const completeCycleCount = async (
  id: number,
  options: { applyAdjustments: boolean },
  actorUserId: number,
) => {
  await withTransaction(async (client) => {
    const cycleCountResult = await client.query<{
      id: number;
      warehouseId: number;
      warehouseLocationId: number | null;
      status: CycleCount["status"];
    }>(
      `
        SELECT
          id,
          warehouse_id AS "warehouseId",
          warehouse_location_id AS "warehouseLocationId",
          status
        FROM cycle_counts
        WHERE id = $1
        FOR UPDATE;
      `,
      [id],
    );

    const cycleCount = cycleCountResult.rows[0];

    if (!cycleCount) {
      throw new AppError(404, "Cycle count not found.");
    }

    if (cycleCount.status !== "draft" && cycleCount.status !== "in_progress") {
      throw new AppError(409, "Only open cycle counts can be completed.");
    }

    const items = (
      await client.query<CycleCountItemRow>(
        `
          ${cycleCountItemSelect}
          WHERE cci.cycle_count_id = $1
          ORDER BY cci.id;
        `,
        [id],
      )
    ).rows;

    for (const item of items) {
      if (item.countedQuantity === null) {
        throw new AppError(400, "All cycle count items must be counted before completion.");
      }

      if (options.applyAdjustments && item.difference) {
        await applyStockDelta(client, {
          warehouseId: cycleCount.warehouseId,
          warehouseLocationId: cycleCount.warehouseLocationId,
          productId: item.productId,
          delta: item.difference,
        });

        await client.query(
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
            VALUES ($1, $2, $3, 'correction', $4, $5, $6, $7);
          `,
          [
            cycleCount.warehouseId,
            cycleCount.warehouseLocationId ?? null,
            item.productId,
            item.expectedQuantity,
            item.countedQuantity,
            `Cycle count ${id} reconciliation`,
            actorUserId,
          ],
        );
      }
    }

    await client.query(
      `
        UPDATE cycle_counts
        SET
          status = 'completed',
          completed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1;
      `,
      [id],
    );
  });

  return getCycleCountById(id);
};

export const cancelCycleCount = async (id: number) => {
  const result = await query<{ id: number }>(
    `
      UPDATE cycle_counts
      SET
        status = 'cancelled',
        updated_at = NOW()
      WHERE id = $1
        AND status IN ('draft', 'in_progress')
      RETURNING id;
    `,
    [id],
  );

  if (!result.rows[0]) {
    throw new AppError(409, "Only draft or in-progress cycle counts can be cancelled.");
  }

  return getCycleCountById(id);
};
