import type { Warehouse, WarehouseInput } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query, withTransaction } from "../../lib/db";

type WarehouseRow = Warehouse;

export const listWarehouses = async () => {
  const result = await query<WarehouseRow>(`
    SELECT
      id,
      name,
      description,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM warehouses
    WHERE ${activeFilter()}
    ORDER BY id;
  `);

  return result.rows;
};

export const getWarehouseById = async (id: number) => {
  const result = await query<WarehouseRow>(
    `
      SELECT
        id,
        name,
        description,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM warehouses
      WHERE id = $1
        AND ${activeFilter()};
    `,
    [id],
  );

  return result.rows[0] ?? null;
};

export const createWarehouse = async (input: WarehouseInput) => {
  const result = await query<WarehouseRow>(
    `
      INSERT INTO warehouses (name, description)
      VALUES ($1, $2)
      RETURNING
        id,
        name,
        description,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [input.name, input.description ?? null],
  );

  return result.rows[0];
};

export const updateWarehouse = async (id: number, input: WarehouseInput) => {
  const result = await query<WarehouseRow>(
    `
      UPDATE warehouses
      SET
        name = $2,
        description = $3,
        updated_at = NOW()
      WHERE id = $1
        AND ${activeFilter()}
      RETURNING
        id,
        name,
        description,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [id, input.name, input.description ?? null],
  );

  if (!result.rows[0]) {
    throw new AppError(404, "Warehouse not found.");
  }

  return result.rows[0];
};

export const deleteWarehouse = async (id: number) => {
  return withTransaction(async (client) => {
    const existingWarehouse = await client.query<{ id: number; isDeleted: boolean }>(
      `
        SELECT
          id,
          is_deleted AS "isDeleted"
        FROM warehouses
        WHERE id = $1;
      `,
      [id],
    );

    if (!existingWarehouse.rows[0]) {
      throw new AppError(404, "Warehouse not found.");
    }

    if (existingWarehouse.rows[0].isDeleted) {
      throw new AppError(409, "Warehouse is already deleted.");
    }

    await client.query(
      `
        UPDATE warehouses
        SET
          is_deleted = TRUE,
          deleted_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND ${activeFilter()};
      `,
      [id],
    );

    await client.query(
      `
        UPDATE warehouse_locations
        SET
          is_deleted = TRUE,
          deleted_at = NOW(),
          active = FALSE,
          updated_at = NOW()
        WHERE warehouse_id = $1
          AND ${activeFilter()};
      `,
      [id],
    );
  });
};
