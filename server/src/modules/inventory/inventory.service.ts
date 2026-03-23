import type { StockMovementInput, StockMovementResult } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { withTransaction } from "../../config/db";
import {
  applyStockDelta,
  assertLocationBelongsToWarehouse,
  assertProductExists,
  assertWarehouseExists,
  getDetailedStockMovementById,
  getStockLevelByProductWarehouseAndLocation,
  insertStockMovement,
  listStockLevels,
  listDetailedStockMovements,
} from "./stock.service";

export const registerStockMovement = async (
  input: StockMovementInput,
  userId: number,
): Promise<StockMovementResult> => {
  return withTransaction(async (client) => {
    await assertProductExists(input.productId, client);
    await assertWarehouseExists(input.warehouseId, client);

    if (input.warehouseLocationId) {
      await assertLocationBelongsToWarehouse(input.warehouseLocationId, input.warehouseId, client);
    }

    await applyStockDelta(client, {
      warehouseId: input.warehouseId,
      warehouseLocationId: input.warehouseLocationId ?? null,
      productId: input.productId,
      delta: input.type === "entry" ? input.quantity : -input.quantity,
    });

    const movementId = await insertStockMovement(client, input, userId);

    if (!movementId) {
      throw new AppError(500, "Unable to save stock movement.");
    }

    const movement = await getDetailedStockMovementById(movementId, client);
    const currentStock = await getStockLevelByProductWarehouseAndLocation(
      input.productId,
      input.warehouseId,
      input.warehouseLocationId ?? null,
      client,
    );

    if (!currentStock || !movement) {
      throw new AppError(500, "Unable to load stock movement details.");
    }

    return {
      movement,
      currentStock,
    };
  });
};

export const getCurrentStock = async (filters: {
  productId?: number;
  warehouseId?: number;
  warehouseLocationId?: number;
}) => {
  if (filters.productId !== undefined) {
    await assertProductExists(filters.productId);
  }

  if (filters.warehouseId !== undefined) {
    await assertWarehouseExists(filters.warehouseId);
  }

  if (filters.warehouseLocationId !== undefined && filters.warehouseId !== undefined) {
    await assertLocationBelongsToWarehouse(filters.warehouseLocationId, filters.warehouseId);
  }

  if (
    filters.productId !== undefined &&
    filters.warehouseId !== undefined &&
    filters.warehouseLocationId !== undefined
  ) {
    const stock = await getStockLevelByProductWarehouseAndLocation(
      filters.productId,
      filters.warehouseId,
      filters.warehouseLocationId,
    );
    return stock ? [stock] : [];
  }

  if (filters.productId !== undefined && filters.warehouseId !== undefined) {
    const stock = await getStockLevelByProductWarehouseAndLocation(
      filters.productId,
      filters.warehouseId,
    );
    return stock ? [stock] : [];
  }

  return listStockLevels(filters);
};

export const listRecentStockMovements = async (filters: { limit?: number }) => {
  const limit = Math.min(filters.limit ?? 20, 100);
  return listDetailedStockMovements(limit);
};
