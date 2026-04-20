export type ProductConflictStrategy =
  | "last-write-wins"
  | "prefer-local"
  | "prefer-remote";

export type WarehouseSyncStatus = "completed" | "deferred" | "disabled";

export interface WarehouseSyncResult {
  finishedAt: string;
  lastError?: string;
  pendingQueueItems: number;
  productsApplied: number;
  productsSkipped: number;
  pushedMovements: number;
  startedAt: string;
  status: WarehouseSyncStatus;
  trigger: "interval" | "manual" | "startup";
}
