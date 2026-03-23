export const STOCK_MOVEMENT_TYPES = ["entry", "exit"] as const;
export const WAREHOUSE_LOCATION_TYPES = [
  "zone",
  "aisle",
  "rack",
  "shelf",
  "bin",
  "staging",
  "other",
] as const;
export const STOCK_TRANSFER_STATUSES = ["pending", "approved", "completed", "cancelled"] as const;
export const STOCK_ADJUSTMENT_TYPES = ["increase", "decrease", "correction"] as const;
export const CYCLE_COUNT_STATUSES = ["draft", "in_progress", "completed", "cancelled"] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];
export type WarehouseLocationType = (typeof WAREHOUSE_LOCATION_TYPES)[number];
export type StockTransferStatus = (typeof STOCK_TRANSFER_STATUSES)[number];
export type StockAdjustmentType = (typeof STOCK_ADJUSTMENT_TYPES)[number];
export type CycleCountStatus = (typeof CYCLE_COUNT_STATUSES)[number];
