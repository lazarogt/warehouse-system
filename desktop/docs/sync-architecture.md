# Desktop Sync Architecture

## Goal

`desktop/src/main/sync/sync-service.ts` adds an optional synchronization layer on top of the existing offline-first Electron app.

Core warehouse workflows still write to the local SQLite database first.
If the backend is unavailable, the desktop app keeps working in standalone mode.

## Design Principles

- Existing IPC handlers and SQLite services remain the source of truth for local operations.
- Sync is a sidecar, not a replacement for local persistence.
- Local writes are never blocked by network availability.
- Pending outbound sync work survives app restarts.
- Remote product updates are applied incrementally with conflict handling.

## Main Components

### 1. Local-first data path

The existing `warehouse-data-service.ts` still performs all local reads and writes.

The sync layer wraps that service in the Electron main process and only observes successful writes:

- `createProduct` records a local product write timestamp
- `updateProductStock` records a local product write timestamp
- `recordStockMovement` records a local product write timestamp and queues the movement for push sync

This means sync metadata is only updated after SQLite has committed the local operation.

### 2. Durable sync state

Sync state is stored in:

`app.getPath("userData")/warehouse-sync-state.json`

The file contains:

- pending push queue items
- the last pushed local stock movement id
- the product pull cursor (`updatedAt` + `id`)
- per-product conflict metadata (`lastLocalWriteAt`, `lastRemoteWriteAt`, `lastRemoteId`)

This keeps the sync queue durable without changing the existing database schema.

### 3. Push flow: local `stock_movements` to backend

Push sync is append-only and incremental by local movement id.

Flow:

1. New local stock movements are enqueued after the SQLite insert succeeds.
2. On sync, the service also backfills any movements with `id > lastPushedMovementId` that are not already queued.
3. Queue items are pushed in ascending movement id order.
4. Successful pushes advance `lastPushedMovementId`.
5. Failures stay in the queue and receive exponential backoff.

No local stock movement is deleted or rewritten by sync.

### 4. Pull flow: backend products to desktop

Product pull is incremental by a cursor:

- `updatedAfter=<ISO timestamp>`
- `afterId=<remote product id>`
- `limit=<batch size>`

The sync client expects the backend to return products ordered by:

1. `updatedAt ASC`
2. `id ASC`

Accepted response shapes:

- raw array: `RemoteProduct[]`
- object wrapper: `{ items: RemoteProduct[] }`

Expected `RemoteProduct` shape:

```ts
type RemoteProduct = {
  id: string | number;
  sku: string;
  name: string;
  price: number;
  stock: number;
  createdAt?: string;
  updatedAt: string;
};
```

Desktop matches remote products primarily by `sku`, and secondarily by previously seen `remote id`.

## Conflict Strategy

Config env:

`WAREHOUSE_SYNC_PRODUCT_CONFLICT_STRATEGY`

Supported values:

- `last-write-wins` (default)
- `prefer-local`
- `prefer-remote`

Behavior:

- `last-write-wins`: apply the remote product when `remote.updatedAt >= lastLocalWriteAt`
- `prefer-local`: keep the local product unless the remote update is strictly newer
- `prefer-remote`: always apply the remote product

Per-product local write timestamps are updated when desktop users create products, adjust product stock directly, or create stock movements that change local stock.

## Retry Model

Failed push operations stay queued and are retried with exponential backoff.

Config envs:

- `WAREHOUSE_SYNC_INITIAL_BACKOFF_MS` default `5000`
- `WAREHOUSE_SYNC_MAX_BACKOFF_MS` default `300000`
- `WAREHOUSE_SYNC_REQUEST_TIMEOUT_MS` default `10000`

Retryable failures include:

- network errors
- timeouts
- HTTP `408`
- HTTP `429`
- HTTP `5xx`

The queue is never cleared on transient failures.

## Manual and Background Sync

### Manual trigger

The preload bridge exposes:

```ts
window.api.warehouse.sync();
```

This invokes the main-process IPC handler `warehouse:sync`.

### Background sync

Background sync runs on a configurable interval when `WAREHOUSE_SYNC_BASE_URL` is set.

Config env:

`WAREHOUSE_SYNC_INTERVAL_MS`

Default:

`300000` (5 minutes)

If the base URL is missing, background sync is not started and manual sync returns a `disabled` status instead of breaking the app.

## Backend Contract

The desktop sync client targets dedicated optional sync endpoints rather than the existing full server CRUD routes.

Expected endpoints:

- `POST /api/desktop-sync/stock-movements`
- `GET /api/desktop-sync/products`

Expected outbound stock movement payload:

```ts
type PushStockMovementPayload = {
  localMovementId: number;
  productId: number;
  sku: string;
  type: "in" | "out";
  quantity: number;
  date: string;
};
```

This contract keeps the Electron sync layer decoupled from the server's richer warehouse, auth, and inventory schemas.

## Environment Variables

- `WAREHOUSE_SYNC_BASE_URL`
- `WAREHOUSE_SYNC_INTERVAL_MS`
- `WAREHOUSE_SYNC_BATCH_SIZE`
- `WAREHOUSE_SYNC_REQUEST_TIMEOUT_MS`
- `WAREHOUSE_SYNC_INITIAL_BACKOFF_MS`
- `WAREHOUSE_SYNC_MAX_BACKOFF_MS`
- `WAREHOUSE_SYNC_PRODUCT_CONFLICT_STRATEGY`

## Logging

Main process logs include:

- sync startup and shutdown
- queue backfill events
- push successes
- pull apply/skip decisions
- deferred retries and next attempt times
- final sync summaries

## Operational Notes

- If `WAREHOUSE_SYNC_BASE_URL` is unset, sync is effectively disabled and the desktop app behaves as pure standalone mode.
- If the backend exists later, previously queued local stock movements can still be pushed.
- The sync state file can be deleted to rebuild queue metadata from local movement ids, but that should be treated as an operational recovery action.
