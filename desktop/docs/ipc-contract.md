# IPC Contract

The renderer is treated as untrusted. It does not receive Node.js, filesystem, or SQLite access.

## Exposure

Only the preload script exposes the API:

```ts
window.api.warehouse.getProducts()
window.api.warehouse.createProduct(payload)
window.api.warehouse.createWarehouse(payload)
window.api.warehouse.updateProductStock(payload)
window.api.warehouse.getStockMovements(payload?)
window.api.warehouse.getWarehouses()
window.api.warehouse.getWarehouseStock(payload)
window.api.warehouse.createStockMovement(payload)
window.api.warehouse.setWarehouseStock(payload)
```

## Response Format

Every IPC call resolves to:

```ts
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
```

Error codes currently used:

- `VALIDATION_ERROR`
- `CONFLICT`
- `INTERNAL_ERROR`

## Channels

| Method | Channel | Payload | Response |
| --- | --- | --- | --- |
| `getProducts` | `warehouse:getProducts` | none | `ApiResponse<Product[]>` |
| `createProduct` | `warehouse:createProduct` | `{ name, sku, price, stock? }` | `ApiResponse<Product>` |
| `createWarehouse` | `warehouse:createWarehouse` | `{ name, location }` | `ApiResponse<Warehouse>` |
| `updateProductStock` | `warehouse:updateProductStock` | `{ productId, stock, warehouseId? }` | `ApiResponse<Product>` |
| `getStockMovements` | `warehouse:getStockMovements` | `{ productId?, warehouseId? }` | `ApiResponse<StockMovement[]>` |
| `getWarehouses` | `warehouse:getWarehouses` | none | `ApiResponse<Warehouse[]>` |
| `getWarehouseStock` | `warehouse:getWarehouseStock` | `{ warehouseId, productId }` | `ApiResponse<WarehouseStock>` |
| `createStockMovement` | `warehouse:createStockMovement` | `{ productId, warehouseId?, type, quantity, date? }` | `ApiResponse<StockMovement>` |
| `setWarehouseStock` | `warehouse:setWarehouseStock` | `{ warehouseId, productId, quantity }` | `ApiResponse<WarehouseStock>` |

## Validation Rules

- `name`: string, trimmed, required, max 120 chars
- `sku`: string, trimmed, required, max 64 chars
- `location`: string, trimmed, required, max 200 chars
- `price`: finite number, non-negative
- `stock`: integer, non-negative
- `productId`: integer, positive
- `warehouseId`: integer, positive
- `quantity`: integer, positive
- `type`: `"in"` or `"out"`
- `date`: optional valid ISO-compatible date string

## Security Notes

- IPC handlers call `warehouse-data-service.ts` only
- The IPC layer never executes SQL directly
- SQL statements remain static and parameterized in the service/database layer
- Invalid payloads are rejected before reaching the database layer
- SQLite remains isolated in the Electron main process
- Legacy payloads without `warehouseId` continue to target the default warehouse for compatibility
