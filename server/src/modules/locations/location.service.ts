import type { WarehouseLocation, WarehouseLocationInput } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query, withTransaction } from "../../config/db";

type LocationRow = WarehouseLocation;
type EntityIdRow = { id: number };

const locationSelect = `
  SELECT
    wl.id,
    wl.warehouse_id AS "warehouseId",
    w.name AS "warehouseName",
    wl.code,
    wl.name,
    wl.type,
    wl.parent_location_id AS "parentLocationId",
    parent.code AS "parentLocationCode",
    parent.name AS "parentLocationName",
    wl.active,
    wl.created_at AS "createdAt",
    wl.updated_at AS "updatedAt"
  FROM warehouse_locations wl
  JOIN warehouses w ON w.id = wl.warehouse_id
  LEFT JOIN warehouse_locations parent ON parent.id = wl.parent_location_id
`;

const ensureWarehouseExists = async (warehouseId: number) => {
  const result = await query<EntityIdRow>(
    `SELECT id FROM warehouses WHERE id = $1 AND ${activeFilter()};`,
    [warehouseId],
  );

  if (!result.rows[0]) {
    throw new AppError(400, "warehouseId must reference an existing warehouse.");
  }
};

const ensureParentLocationIsValid = async (
  warehouseId: number,
  parentLocationId: number | null | undefined,
  excludeLocationId?: number,
) => {
  if (!parentLocationId) {
    return;
  }

  if (excludeLocationId && parentLocationId === excludeLocationId) {
    throw new AppError(400, "parentLocationId cannot reference the same location.");
  }

  const result = await query<EntityIdRow>(
    `
      SELECT id
      FROM warehouse_locations
      WHERE id = $1
        AND warehouse_id = $2
        AND ${activeFilter()};
    `,
    [parentLocationId, warehouseId],
  );

  if (!result.rows[0]) {
    throw new AppError(400, "parentLocationId must belong to the same warehouse.");
  }
};

export const listLocations = async () => {
  return (
    await query<LocationRow>(
      `
        ${locationSelect}
        WHERE ${activeFilter("wl")}
          AND ${activeFilter("w")}
        ORDER BY wl.warehouse_id, wl.parent_location_id NULLS FIRST, wl.code, wl.id;
      `,
    )
  ).rows;
};

export const getLocationById = async (id: number) => {
  return (
    await query<LocationRow>(
      `
        ${locationSelect}
        WHERE wl.id = $1
          AND ${activeFilter("wl")}
          AND ${activeFilter("w")};
      `,
      [id],
    )
  ).rows[0] ?? null;
};

export const createLocation = async (input: WarehouseLocationInput) => {
  await ensureWarehouseExists(input.warehouseId);
  await ensureParentLocationIsValid(input.warehouseId, input.parentLocationId);

  const result = await query<{ id: number }>(
    `
      INSERT INTO warehouse_locations (warehouse_id, code, name, type, parent_location_id, active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `,
    [
      input.warehouseId,
      input.code.trim(),
      input.name.trim(),
      input.type,
      input.parentLocationId ?? null,
      input.active ?? true,
    ],
  );

  const location = await getLocationById(result.rows[0].id);

  if (!location) {
    throw new AppError(500, "Unable to load created location.");
  }

  return location;
};

export const updateLocation = async (id: number, input: WarehouseLocationInput) => {
  await ensureWarehouseExists(input.warehouseId);
  await ensureParentLocationIsValid(input.warehouseId, input.parentLocationId, id);

  const result = await query(
    `
      UPDATE warehouse_locations
      SET
        warehouse_id = $2,
        code = $3,
        name = $4,
        type = $5,
        parent_location_id = $6,
        active = $7,
        updated_at = NOW()
      WHERE id = $1
        AND ${activeFilter()}
      RETURNING id;
    `,
    [
      id,
      input.warehouseId,
      input.code.trim(),
      input.name.trim(),
      input.type,
      input.parentLocationId ?? null,
      input.active ?? true,
    ],
  );

  if (!result.rows[0]) {
    throw new AppError(404, "Location not found.");
  }

  const location = await getLocationById(id);

  if (!location) {
    throw new AppError(500, "Unable to load updated location.");
  }

  return location;
};

export const deleteLocation = async (id: number) => {
  await withTransaction(async (client) => {
    const existingLocation = await client.query<{ id: number; isDeleted: boolean }>(
      `
        SELECT
          id,
          is_deleted AS "isDeleted"
        FROM warehouse_locations
        WHERE id = $1
        FOR UPDATE;
      `,
      [id],
    );

    if (!existingLocation.rows[0]) {
      throw new AppError(404, "Location not found.");
    }

    if (existingLocation.rows[0].isDeleted) {
      throw new AppError(409, "Location is already deleted.");
    }

    // active is only an operational flag; a soft-deleted location must also be inactive.
    await client.query(
      `
        UPDATE warehouse_locations
        SET
          is_deleted = TRUE,
          deleted_at = NOW(),
          active = FALSE,
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
          parent_location_id = NULL,
          updated_at = NOW()
        WHERE parent_location_id = $1
          AND ${activeFilter()};
      `,
      [id],
    );
  });
};
