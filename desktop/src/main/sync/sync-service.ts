import fs from "node:fs";
import path from "node:path";
import type { DatabaseLogger, DesktopDatabase } from "../db/database";
import type {
  ProductRecord,
  StockMovementRecord,
  WarehouseDataService,
} from "../services/warehouse-data-service";

export const SYNC_STATE_FILENAME = "warehouse-sync-state.json";
export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_SYNC_BATCH_SIZE = 50;
export const DEFAULT_SYNC_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_SYNC_INITIAL_BACKOFF_MS = 5_000;
export const DEFAULT_SYNC_MAX_BACKOFF_MS = 5 * 60 * 1000;
export const DEFAULT_PRODUCT_CONFLICT_STRATEGY = "last-write-wins";

const DEFAULT_STOCK_MOVEMENTS_PATH = "/api/desktop-sync/stock-movements";
const DEFAULT_PRODUCTS_PATH = "/api/desktop-sync/products";

const SELECT_PRODUCT_BY_ID_SQL = `
  SELECT
    id,
    name,
    sku,
    price,
    stock,
    created_at AS createdAt
  FROM products
  WHERE id = ?;
`;

const SELECT_PRODUCT_BY_SKU_SQL = `
  SELECT
    id,
    name,
    sku,
    price,
    stock,
    created_at AS createdAt
  FROM products
  WHERE sku = ?;
`;

const SELECT_STOCK_MOVEMENT_BY_ID_SQL = `
  SELECT
    id,
    product_id AS productId,
    type,
    quantity,
    date
  FROM stock_movements
  WHERE id = ?;
`;

const SELECT_STOCK_MOVEMENTS_AFTER_ID_SQL = `
  SELECT
    id,
    product_id AS productId,
    type,
    quantity,
    date
  FROM stock_movements
  WHERE id > ?
  ORDER BY id ASC
  LIMIT ?;
`;

export type SyncTrigger = "interval" | "manual" | "startup";
export type ProductConflictStrategy =
  | "last-write-wins"
  | "prefer-local"
  | "prefer-remote";
export type SyncStatus = "completed" | "deferred" | "disabled";

export type WarehouseSyncRunResult = {
  finishedAt: string;
  lastError?: string;
  pendingQueueItems: number;
  productsApplied: number;
  productsSkipped: number;
  pushedMovements: number;
  startedAt: string;
  status: SyncStatus;
  trigger: SyncTrigger;
};

export type WarehouseSyncService = {
  enqueueStockMovementPush(movementId: number, occurredAt?: string): void;
  noteProductWrite(productId: number, occurredAt?: string): void;
  start(): void;
  stop(): void;
  syncNow(trigger?: SyncTrigger): Promise<WarehouseSyncRunResult>;
};

type FetchLike = typeof fetch;

type SyncQueueItem = {
  attempts: number;
  createdAt: string;
  id: string;
  lastError?: string;
  movementId: number;
  nextAttemptAt: string;
  type: "push-stock-movement";
};

type SyncCursor = {
  id: string;
  updatedAt: string;
};

type ProductSyncState = {
  lastConflictResolution?: "applied" | "skipped";
  lastLocalWriteAt?: string;
  lastRemoteId?: string;
  lastRemoteWriteAt?: string;
};

type SyncState = {
  checkpoints: {
    lastPushedMovementId: number;
    productCursor?: SyncCursor;
  };
  lastSuccessfulSyncAt?: string;
  products: Record<string, ProductSyncState>;
  queue: SyncQueueItem[];
  version: number;
};

type RemoteProduct = {
  createdAt?: string;
  id: string;
  name: string;
  price: number;
  sku: string;
  stock: number;
  updatedAt: string;
};

type RemoteProductPayload = {
  items?: unknown;
};

type PushStockMovementPayload = {
  date: string;
  localMovementId: number;
  productId: number;
  quantity: number;
  sku: string;
  type: "in" | "out";
};

type CreateWarehouseSyncServiceOptions = {
  config?: Partial<WarehouseSyncConfig>;
  database: DesktopDatabase;
  fetchImpl?: FetchLike;
  logger?: DatabaseLogger;
  userDataPath: string;
};

type WarehouseSyncConfig = {
  baseUrl?: string;
  batchSize: number;
  initialBackoffMs: number;
  intervalMs: number;
  maxBackoffMs: number;
  productConflictStrategy: ProductConflictStrategy;
  productsPath: string;
  requestTimeoutMs: number;
  stockMovementsPath: string;
};

type HttpLikeError = Error & {
  statusCode?: number;
};

const DEFAULT_LOGGER: DatabaseLogger = {
  info(message, metadata) {
    console.info(message, metadata ?? {});
  },
  warn(message, metadata) {
    console.warn(message, metadata ?? {});
  },
  error(message, metadata) {
    console.error(message, metadata ?? {});
  },
};

class SyncRequestError extends Error {
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(message: string, options?: { retryable?: boolean; statusCode?: number }) {
    super(message);
    this.name = "SyncRequestError";
    this.retryable = options?.retryable ?? true;
    this.statusCode = options?.statusCode;
  }
}

function createDefaultSyncState(): SyncState {
  return {
    version: 1,
    queue: [],
    checkpoints: {
      lastPushedMovementId: 0,
    },
    products: {},
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeIsoDate(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a valid ISO date string.`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date string.`);
  }

  return parsed.toISOString();
}

function normalizePositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return Number(value);
}

function normalizeNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return Number(value);
}

function normalizeSyncQueueItem(value: unknown): SyncQueueItem | null {
  if (!isPlainObject(value)) {
    return null;
  }

  if (value.type !== "push-stock-movement") {
    return null;
  }

  try {
    return {
      id: typeof value.id === "string" ? value.id : `movement-${normalizePositiveInteger(value.movementId, "movementId")}`,
      type: "push-stock-movement",
      movementId: normalizePositiveInteger(value.movementId, "movementId"),
      attempts: normalizeNonNegativeInteger(value.attempts ?? 0, "attempts"),
      createdAt: normalizeIsoDate(value.createdAt, "createdAt"),
      nextAttemptAt: normalizeIsoDate(value.nextAttemptAt, "nextAttemptAt"),
      lastError: typeof value.lastError === "string" ? value.lastError : undefined,
    };
  } catch {
    return null;
  }
}

function normalizeSyncCursor(value: unknown): SyncCursor | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  if (typeof value.id !== "string") {
    return undefined;
  }

  try {
    return {
      id: value.id,
      updatedAt: normalizeIsoDate(value.updatedAt, "updatedAt"),
    };
  } catch {
    return undefined;
  }
}

function normalizeSyncState(raw: unknown): SyncState {
  if (!isPlainObject(raw)) {
    return createDefaultSyncState();
  }

  const queue = Array.isArray(raw.queue)
    ? raw.queue.map((item) => normalizeSyncQueueItem(item)).filter((item): item is SyncQueueItem => item !== null)
    : [];
  const checkpoints = isPlainObject(raw.checkpoints) ? raw.checkpoints : {};
  const productsRecord = isPlainObject(raw.products) ? raw.products : {};
  const products = Object.fromEntries(
    Object.entries(productsRecord).map(([sku, state]) => {
      if (!isPlainObject(state)) {
        return [sku, {} satisfies ProductSyncState];
      }

      const normalizedState: ProductSyncState = {
        lastConflictResolution:
          state.lastConflictResolution === "applied" || state.lastConflictResolution === "skipped"
            ? state.lastConflictResolution
            : undefined,
        lastLocalWriteAt:
          typeof state.lastLocalWriteAt === "string"
            ? normalizeIsoDate(state.lastLocalWriteAt, "lastLocalWriteAt")
            : undefined,
        lastRemoteId: typeof state.lastRemoteId === "string" ? state.lastRemoteId : undefined,
        lastRemoteWriteAt:
          typeof state.lastRemoteWriteAt === "string"
            ? normalizeIsoDate(state.lastRemoteWriteAt, "lastRemoteWriteAt")
            : undefined,
      };

      return [sku, normalizedState];
    }),
  );

  return {
    version: raw.version === 1 ? 1 : 1,
    queue,
    checkpoints: {
      lastPushedMovementId: normalizeNonNegativeInteger(
        checkpoints.lastPushedMovementId ?? 0,
        "lastPushedMovementId",
      ),
      productCursor: normalizeSyncCursor(checkpoints.productCursor),
    },
    products,
    lastSuccessfulSyncAt:
      typeof raw.lastSuccessfulSyncAt === "string"
        ? normalizeIsoDate(raw.lastSuccessfulSyncAt, "lastSuccessfulSyncAt")
        : undefined,
  };
}

function clampPositiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.replace(/\/+$/, "") : undefined;
}

function normalizeProductConflictStrategy(value: string | undefined): ProductConflictStrategy {
  if (
    value === "last-write-wins" ||
    value === "prefer-local" ||
    value === "prefer-remote"
  ) {
    return value;
  }

  return DEFAULT_PRODUCT_CONFLICT_STRATEGY;
}

function createSyncConfig(config?: Partial<WarehouseSyncConfig>): WarehouseSyncConfig {
  return {
    baseUrl: normalizeBaseUrl(config?.baseUrl ?? process.env.WAREHOUSE_SYNC_BASE_URL),
    intervalMs: clampPositiveInteger(
      Number(config?.intervalMs ?? process.env.WAREHOUSE_SYNC_INTERVAL_MS),
      DEFAULT_SYNC_INTERVAL_MS,
    ),
    batchSize: clampPositiveInteger(
      Number(config?.batchSize ?? process.env.WAREHOUSE_SYNC_BATCH_SIZE),
      DEFAULT_SYNC_BATCH_SIZE,
    ),
    requestTimeoutMs: clampPositiveInteger(
      Number(config?.requestTimeoutMs ?? process.env.WAREHOUSE_SYNC_REQUEST_TIMEOUT_MS),
      DEFAULT_SYNC_REQUEST_TIMEOUT_MS,
    ),
    initialBackoffMs: clampPositiveInteger(
      Number(config?.initialBackoffMs ?? process.env.WAREHOUSE_SYNC_INITIAL_BACKOFF_MS),
      DEFAULT_SYNC_INITIAL_BACKOFF_MS,
    ),
    maxBackoffMs: clampPositiveInteger(
      Number(config?.maxBackoffMs ?? process.env.WAREHOUSE_SYNC_MAX_BACKOFF_MS),
      DEFAULT_SYNC_MAX_BACKOFF_MS,
    ),
    productsPath: config?.productsPath ?? DEFAULT_PRODUCTS_PATH,
    stockMovementsPath: config?.stockMovementsPath ?? DEFAULT_STOCK_MOVEMENTS_PATH,
    productConflictStrategy: normalizeProductConflictStrategy(
      config?.productConflictStrategy ?? process.env.WAREHOUSE_SYNC_PRODUCT_CONFLICT_STRATEGY,
    ),
  };
}

function buildStateFilePath(userDataPath: string): string {
  return path.join(userDataPath, SYNC_STATE_FILENAME);
}

function createQueueItem(movementId: number, occurredAt: string): SyncQueueItem {
  return {
    id: `movement-${movementId}`,
    type: "push-stock-movement",
    movementId,
    attempts: 0,
    createdAt: occurredAt,
    nextAttemptAt: occurredAt,
  };
}

function compareCursor(a: SyncCursor, b: SyncCursor): number {
  if (a.updatedAt < b.updatedAt) {
    return -1;
  }

  if (a.updatedAt > b.updatedAt) {
    return 1;
  }

  return a.id.localeCompare(b.id, "en");
}

function isCursorAfter(cursor: SyncCursor, reference?: SyncCursor): boolean {
  if (!reference) {
    return true;
  }

  return compareCursor(cursor, reference) > 0;
}

function compareDateStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function getRetryDelayMs(
  attempts: number,
  initialBackoffMs: number,
  maxBackoffMs: number,
): number {
  return Math.min(initialBackoffMs * 2 ** Math.max(attempts - 1, 0), maxBackoffMs);
}

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return raw.trim().length === 0 ? undefined : JSON.parse(raw);
}

function writeJsonFileAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFilePath = `${filePath}.tmp`;
  fs.writeFileSync(tempFilePath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tempFilePath, filePath);
}

function normalizeRemoteProduct(value: unknown): RemoteProduct {
  if (!isPlainObject(value)) {
    throw new Error("Remote product payload must be an object.");
  }

  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    throw new Error("Remote product name is required.");
  }

  if (typeof value.sku !== "string" || value.sku.trim().length === 0) {
    throw new Error("Remote product sku is required.");
  }

  if (typeof value.price !== "number" || !Number.isFinite(value.price) || value.price < 0) {
    throw new Error("Remote product price must be a non-negative number.");
  }

  if (!Number.isInteger(value.stock) || Number(value.stock) < 0) {
    throw new Error("Remote product stock must be a non-negative integer.");
  }

  if (typeof value.id !== "string" && typeof value.id !== "number") {
    throw new Error("Remote product id is required.");
  }

  return {
    id: String(value.id),
    name: value.name.trim(),
    sku: value.sku.trim(),
    price: Number(value.price.toFixed(2)),
    stock: Number(value.stock),
    createdAt:
      typeof value.createdAt === "string"
        ? normalizeIsoDate(value.createdAt, "createdAt")
        : undefined,
    updatedAt: normalizeIsoDate(value.updatedAt, "updatedAt"),
  };
}

function normalizeRemoteProductsResponse(payload: unknown): RemoteProduct[] {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeRemoteProduct(item));
  }

  if (isPlainObject(payload)) {
    const response = payload as RemoteProductPayload;

    if (Array.isArray(response.items)) {
      return response.items.map((item) => normalizeRemoteProduct(item));
    }
  }

  throw new Error("Remote product sync response must be an array or { items } object.");
}

function getRemoteProductCursor(product: RemoteProduct): SyncCursor {
  return {
    id: product.id,
    updatedAt: product.updatedAt,
  };
}

function createDisabledSyncResult(
  trigger: SyncTrigger,
  startedAt: string,
  pendingQueueItems: number,
): WarehouseSyncRunResult {
  return {
    trigger,
    status: "disabled",
    startedAt,
    finishedAt: new Date().toISOString(),
    pushedMovements: 0,
    productsApplied: 0,
    productsSkipped: 0,
    pendingQueueItems,
    lastError: "WAREHOUSE_SYNC_BASE_URL is not configured.",
  };
}

function isRetryableStatus(statusCode: number): boolean {
  return statusCode >= 500 || statusCode === 408 || statusCode === 429;
}

class DefaultWarehouseSyncService implements WarehouseSyncService {
  private readonly config: WarehouseSyncConfig;
  private readonly database: DesktopDatabase;
  private readonly fetchImpl: FetchLike;
  private readonly logger: DatabaseLogger;
  private readonly stateFilePath: string;
  private currentRun?: Promise<WarehouseSyncRunResult>;
  private intervalHandle?: NodeJS.Timeout;
  private state: SyncState;

  constructor(options: CreateWarehouseSyncServiceOptions) {
    this.config = createSyncConfig(options.config);
    this.database = options.database;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger ?? DEFAULT_LOGGER;
    this.stateFilePath = buildStateFilePath(options.userDataPath);
    this.state = normalizeSyncState(readJsonFile(this.stateFilePath));
  }

  start(): void {
    if (this.intervalHandle || !this.config.baseUrl) {
      return;
    }

    this.intervalHandle = setInterval(() => {
      void this.syncNow("interval");
    }, this.config.intervalMs);
    this.intervalHandle.unref();

    this.logger.info("[desktop:sync] background sync started", {
      baseUrl: this.config.baseUrl,
      intervalMs: this.config.intervalMs,
      conflictStrategy: this.config.productConflictStrategy,
    });

    void this.syncNow("startup");
  }

  stop(): void {
    if (!this.intervalHandle) {
      return;
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = undefined;
    this.logger.info("[desktop:sync] background sync stopped");
  }

  noteProductWrite(productId: number, occurredAt = new Date().toISOString()): void {
    const product = this.database.get<ProductRecord>(SELECT_PRODUCT_BY_ID_SQL, [productId]);

    if (!product) {
      this.logger.warn("[desktop:sync] product write observed for missing product", {
        productId,
      });
      return;
    }

    const state = this.state.products[product.sku] ?? {};
    this.state.products[product.sku] = {
      ...state,
      lastLocalWriteAt: normalizeIsoDate(occurredAt, "occurredAt"),
    };
    this.persistState();
  }

  enqueueStockMovementPush(movementId: number, occurredAt = new Date().toISOString()): void {
    if (this.state.checkpoints.lastPushedMovementId >= movementId) {
      return;
    }

    if (this.state.queue.some((item) => item.movementId === movementId)) {
      return;
    }

    const queueItem = createQueueItem(movementId, normalizeIsoDate(occurredAt, "occurredAt"));
    this.state.queue.push(queueItem);
    this.sortQueue();
    this.persistState();

    this.logger.info("[desktop:sync] stock movement queued", {
      movementId,
      pendingQueueItems: this.state.queue.length,
    });
  }

  async syncNow(trigger: SyncTrigger = "manual"): Promise<WarehouseSyncRunResult> {
    if (this.currentRun) {
      return this.currentRun;
    }

    this.currentRun = this.runSync(trigger).finally(() => {
      this.currentRun = undefined;
    });

    return this.currentRun;
  }

  private async runSync(trigger: SyncTrigger): Promise<WarehouseSyncRunResult> {
    const startedAt = new Date().toISOString();

    this.backfillPendingMovements();

    if (!this.config.baseUrl) {
      return createDisabledSyncResult(trigger, startedAt, this.state.queue.length);
    }

    this.logger.info("[desktop:sync] sync started", {
      trigger,
      pendingQueueItems: this.state.queue.length,
    });

    let pushedMovements = 0;
    let productsApplied = 0;
    let productsSkipped = 0;
    let lastError: string | undefined;
    let status: SyncStatus = "completed";

    const pushResult = await this.processPendingStockMovements();
    pushedMovements += pushResult.pushed;

    if (pushResult.lastError) {
      lastError = pushResult.lastError;
      status = "deferred";
    }

    if (!pushResult.halted) {
      const pullResult = await this.pullRemoteProducts();
      productsApplied += pullResult.applied;
      productsSkipped += pullResult.skipped;

      if (pullResult.lastError) {
        lastError = pullResult.lastError;
        status = "deferred";
      }
    }

    if (status === "completed") {
      this.state.lastSuccessfulSyncAt = new Date().toISOString();
      this.persistState();
    }

    const result: WarehouseSyncRunResult = {
      trigger,
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      pushedMovements,
      productsApplied,
      productsSkipped,
      pendingQueueItems: this.state.queue.length,
      lastError,
    };

    this.logger.info("[desktop:sync] sync finished", result);
    return result;
  }

  private persistState(): void {
    writeJsonFileAtomic(this.stateFilePath, this.state);
  }

  private sortQueue(): void {
    this.state.queue.sort((left, right) => {
      if (left.movementId !== right.movementId) {
        return left.movementId - right.movementId;
      }

      return compareDateStrings(left.createdAt, right.createdAt);
    });
  }

  private backfillPendingMovements(): void {
    const queuedIds = new Set(this.state.queue.map((item) => item.movementId));
    const rows = this.database.all<StockMovementRecord>(SELECT_STOCK_MOVEMENTS_AFTER_ID_SQL, [
      this.state.checkpoints.lastPushedMovementId,
      this.config.batchSize,
    ]);

    let added = 0;

    for (const movement of rows) {
      if (queuedIds.has(movement.id)) {
        continue;
      }

      this.state.queue.push(createQueueItem(movement.id, movement.date));
      added += 1;
    }

    if (added > 0) {
      this.sortQueue();
      this.persistState();

      this.logger.info("[desktop:sync] backfilled stock movements into sync queue", {
        added,
        pendingQueueItems: this.state.queue.length,
      });
    }
  }

  private getMovementPayload(movementId: number): PushStockMovementPayload {
    const movement = this.database.get<StockMovementRecord>(SELECT_STOCK_MOVEMENT_BY_ID_SQL, [
      movementId,
    ]);

    if (!movement) {
      throw new SyncRequestError(`Local stock movement ${movementId} is missing.`, {
        retryable: false,
      });
    }

    const product = this.database.get<ProductRecord>(SELECT_PRODUCT_BY_ID_SQL, [movement.productId]);

    if (!product) {
      throw new SyncRequestError(
        `Product ${movement.productId} for stock movement ${movementId} is missing.`,
        { retryable: false },
      );
    }

    return {
      localMovementId: movement.id,
      productId: movement.productId,
      sku: product.sku,
      type: movement.type,
      quantity: movement.quantity,
      date: movement.date,
    };
  }

  private async processPendingStockMovements(): Promise<{
    halted: boolean;
    lastError?: string;
    pushed: number;
  }> {
    let pushed = 0;
    let halted = false;
    let lastError: string | undefined;
    const now = new Date().toISOString();
    const dueItems = this.state.queue.filter((item) => item.nextAttemptAt <= now);

    for (const item of dueItems) {
      try {
        const payload = this.getMovementPayload(item.movementId);
        await this.postJson(this.config.stockMovementsPath, payload);
        this.state.queue = this.state.queue.filter((candidate) => candidate.id !== item.id);
        this.state.checkpoints.lastPushedMovementId = Math.max(
          this.state.checkpoints.lastPushedMovementId,
          item.movementId,
        );
        this.persistState();
        pushed += 1;

        this.logger.info("[desktop:sync] stock movement pushed", {
          movementId: item.movementId,
          pendingQueueItems: this.state.queue.length,
        });
      } catch (error) {
        const syncError = error instanceof SyncRequestError
          ? error
          : new SyncRequestError(
              error instanceof Error ? error.message : "Unknown push sync error.",
            );
        const queueItem = this.state.queue.find((candidate) => candidate.id === item.id);

        if (queueItem) {
          queueItem.attempts += 1;
          queueItem.lastError = syncError.message;
          queueItem.nextAttemptAt = new Date(
            Date.now() +
              getRetryDelayMs(
                queueItem.attempts,
                this.config.initialBackoffMs,
                this.config.maxBackoffMs,
              ),
          ).toISOString();
          this.persistState();
        }

        lastError = syncError.message;
        halted = true;

        this.logger.warn("[desktop:sync] stock movement push deferred", {
          movementId: item.movementId,
          retryable: syncError.retryable,
          statusCode: syncError.statusCode,
          nextAttemptAt: queueItem?.nextAttemptAt,
          message: syncError.message,
        });

        break;
      }
    }

    return {
      pushed,
      halted,
      lastError,
    };
  }

  private async pullRemoteProducts(): Promise<{
    applied: number;
    lastError?: string;
    skipped: number;
  }> {
    let applied = 0;
    let skipped = 0;
    let lastError: string | undefined;
    let cursor = this.state.checkpoints.productCursor;

    while (true) {
      try {
        const remoteProducts = await this.fetchRemoteProducts(cursor);

        if (remoteProducts.length === 0) {
          break;
        }

        const newProducts = remoteProducts.filter((product) =>
          isCursorAfter(getRemoteProductCursor(product), cursor),
        );

        if (newProducts.length === 0) {
          break;
        }

        for (const remoteProduct of newProducts) {
          if (this.shouldApplyRemoteProduct(remoteProduct)) {
            this.applyRemoteProduct(remoteProduct);
            applied += 1;
          } else {
            this.markRemoteProductSkipped(remoteProduct);
            skipped += 1;
          }

          cursor = getRemoteProductCursor(remoteProduct);
          this.state.checkpoints.productCursor = cursor;
          this.persistState();
        }

        if (newProducts.length < this.config.batchSize) {
          break;
        }
      } catch (error) {
        const syncError = error instanceof SyncRequestError
          ? error
          : new SyncRequestError(
              error instanceof Error ? error.message : "Unknown product sync error.",
            );
        lastError = syncError.message;

        this.logger.warn("[desktop:sync] product pull deferred", {
          retryable: syncError.retryable,
          statusCode: syncError.statusCode,
          message: syncError.message,
        });

        break;
      }
    }

    return {
      applied,
      skipped,
      lastError,
    };
  }

  private async fetchRemoteProducts(cursor?: SyncCursor): Promise<RemoteProduct[]> {
    const searchParams = new URLSearchParams();
    searchParams.set("limit", String(this.config.batchSize));

    if (cursor) {
      searchParams.set("updatedAfter", cursor.updatedAt);
      searchParams.set("afterId", cursor.id);
    }

    const payload = await this.requestJson<unknown>(
      `${this.config.productsPath}?${searchParams.toString()}`,
      {
        method: "GET",
      },
    );

    return normalizeRemoteProductsResponse(payload);
  }

  private getProductSyncStateByRemoteId(remoteId: string): [string, ProductSyncState] | undefined {
    for (const [sku, state] of Object.entries(this.state.products)) {
      if (state.lastRemoteId === remoteId) {
        return [sku, state];
      }
    }

    return undefined;
  }

  private shouldApplyRemoteProduct(remoteProduct: RemoteProduct): boolean {
    if (this.config.productConflictStrategy === "prefer-remote") {
      return true;
    }

    const matchedState =
      this.state.products[remoteProduct.sku] ?? this.getProductSyncStateByRemoteId(remoteProduct.id)?.[1];

    if (!matchedState?.lastLocalWriteAt) {
      return true;
    }

    if (this.config.productConflictStrategy === "prefer-local") {
      return compareDateStrings(remoteProduct.updatedAt, matchedState.lastLocalWriteAt) > 0;
    }

    return compareDateStrings(remoteProduct.updatedAt, matchedState.lastLocalWriteAt) >= 0;
  }

  private markRemoteProductSkipped(remoteProduct: RemoteProduct): void {
    const matchedEntry = this.getProductSyncStateByRemoteId(remoteProduct.id);
    const stateKey = matchedEntry?.[0] ?? remoteProduct.sku;
    const previousState = this.state.products[stateKey] ?? {};

    this.state.products[stateKey] = {
      ...previousState,
      lastConflictResolution: "skipped",
      lastRemoteId: remoteProduct.id,
      lastRemoteWriteAt: remoteProduct.updatedAt,
    };
  }

  private applyRemoteProduct(remoteProduct: RemoteProduct): void {
    const matchedEntry = this.getProductSyncStateByRemoteId(remoteProduct.id);
    const matchedSku = matchedEntry?.[0];
    const existingProduct =
      (matchedSku ? this.database.get<ProductRecord>(SELECT_PRODUCT_BY_SKU_SQL, [matchedSku]) : undefined) ??
      this.database.get<ProductRecord>(SELECT_PRODUCT_BY_SKU_SQL, [remoteProduct.sku]);

    this.database.transaction((transactionDatabase) => {
      if (existingProduct) {
        transactionDatabase.run(
          `
            UPDATE products
            SET name = ?, sku = ?, price = ?, stock = ?
            WHERE id = ?;
          `,
          [
            remoteProduct.name,
            remoteProduct.sku,
            remoteProduct.price,
            remoteProduct.stock,
            existingProduct.id,
          ],
        );
      } else {
        transactionDatabase.run(
          `
            INSERT INTO products (name, sku, price, stock, created_at)
            VALUES (?, ?, ?, ?, ?);
          `,
          [
            remoteProduct.name,
            remoteProduct.sku,
            remoteProduct.price,
            remoteProduct.stock,
            remoteProduct.createdAt ?? remoteProduct.updatedAt,
          ],
        );
      }
    }, "immediate");

    if (matchedSku && matchedSku !== remoteProduct.sku) {
      delete this.state.products[matchedSku];
    }

    const previousState = this.state.products[remoteProduct.sku] ?? {};
    this.state.products[remoteProduct.sku] = {
      ...previousState,
      lastConflictResolution: "applied",
      lastRemoteId: remoteProduct.id,
      lastRemoteWriteAt: remoteProduct.updatedAt,
    };

    this.logger.info("[desktop:sync] product applied from backend", {
      sku: remoteProduct.sku,
      remoteId: remoteProduct.id,
      updatedAt: remoteProduct.updatedAt,
    });
  }

  private async postJson(pathname: string, payload: unknown): Promise<void> {
    await this.requestJson(pathname, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  private async requestJson<T>(pathname: string, init: RequestInit): Promise<T> {
    const baseUrl = this.config.baseUrl;

    if (!baseUrl) {
      throw new SyncRequestError("Sync base URL is not configured.", { retryable: false });
    }

    const url = new URL(pathname, `${baseUrl}/`);

    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      throw new SyncRequestError(
        error instanceof Error ? error.message : "Unable to reach sync backend.",
      );
    }

    if (!response.ok) {
      const message = await this.readErrorMessage(response);
      throw new SyncRequestError(message, {
        retryable: isRetryableStatus(response.status),
        statusCode: response.status,
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new SyncRequestError(
        error instanceof Error ? error.message : "Invalid sync JSON response.",
      );
    }
  }

  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as unknown;

      if (isPlainObject(payload) && typeof payload.message === "string") {
        return payload.message;
      }
    } catch {}

    return `Sync request failed with status ${response.status}.`;
  }
}

export function createWarehouseSyncService(
  options: CreateWarehouseSyncServiceOptions,
): WarehouseSyncService {
  return new DefaultWarehouseSyncService(options);
}

export function createSyncAwareWarehouseDataService(
  warehouseDataService: WarehouseDataService,
  syncService: WarehouseSyncService,
): WarehouseDataService {
  return {
    ...warehouseDataService,
    createProduct(input) {
      const product = warehouseDataService.createProduct(input);
      syncService.noteProductWrite(product.id, product.createdAt);
      return product;
    },
    updateProductStock(input) {
      const product = warehouseDataService.updateProductStock(input);
      syncService.noteProductWrite(product.id);
      return product;
    },
    recordStockMovement(input) {
      const movement = warehouseDataService.recordStockMovement(input);
      syncService.noteProductWrite(movement.productId, movement.date);
      syncService.enqueueStockMovementPush(movement.id, movement.date);
      return movement;
    },
  };
}
