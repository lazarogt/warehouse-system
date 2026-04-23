# IPC Contract

The renderer is treated as untrusted. It does not receive Node.js, filesystem, or SQLite access.

## Exposure

Only the preload script exposes the API:

```ts
window.api.backup.createBackup()
window.api.backup.restoreBackup(payload?)
window.api.export.pdf(payload)
window.api.export.excel(payload)
window.api.warehouse.getProducts()
window.api.warehouse.createProduct(payload)
window.api.warehouse.dispatchProduct(payload)
window.api.warehouse.createWarehouse(payload)
window.api.warehouse.updateWarehouse(payload)
window.api.warehouse.deactivateWarehouse(payload)
window.api.warehouse.updateProductStock(payload)
window.api.warehouse.getStockMovements(payload?)
window.api.warehouse.getWarehouses()
window.api.warehouse.listWarehouses()
window.api.warehouse.getWarehouseStock(payload)
window.api.warehouse.createStockMovement(payload)
window.api.warehouse.setWarehouseStock(payload)
window.api.warehouse.transferStock(payload)
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
| `dispatchProduct` | `warehouse:dispatch` | `{ warehouseId, productId, quantity, customer, notes? }` | `ApiResponse<StockMovement>` |
| `createWarehouse` | `warehouse:createWarehouse` | `{ name, location }` | `ApiResponse<Warehouse>` |
| `updateWarehouse` | `warehouse:update` | `{ warehouseId, name, location }` | `ApiResponse<Warehouse>` |
| `deactivateWarehouse` | `warehouse:deactivate` | `{ warehouseId }` | `ApiResponse<{ warehouseId: number }>` |
| `createBackup` | `backup:create` | none | `ApiResponse<CreateBackupResult>` |
| `restoreBackup` | `backup:restore` | `{ filePath? }` | `ApiResponse<RestoreBackupResult>` |
| `updateProductStock` | `warehouse:updateProductStock` | `{ productId, stock, warehouseId? }` | `ApiResponse<Product>` |
| `getStockMovements` | `warehouse:getStockMovements` | `{ productId?, warehouseId? }` | `ApiResponse<StockMovement[]>` |
| `getWarehouses` | `warehouse:getWarehouses` | none | `ApiResponse<Warehouse[]>` |
| `listWarehouses` | `warehouse:getWarehouses` | none | `ApiResponse<Warehouse[]>` |
| `getWarehouseStock` | `warehouse:getWarehouseStock` | `{ warehouseId, productId }` | `ApiResponse<WarehouseStock>` |
| `createStockMovement` | `warehouse:createStockMovement` | `{ productId, warehouseId?, type, quantity, date? }` | `ApiResponse<StockMovement>` |
| `setWarehouseStock` | `warehouse:setWarehouseStock` | `{ warehouseId, productId, quantity }` | `ApiResponse<WarehouseStock>` |
| `transferStock` | `warehouse:transferStock` | `{ sourceId, targetId, productId, quantity }` | `ApiResponse<TransferStockResult>` |
| `export.pdf` | `export:pdf` | `{ reportType: 'dispatches' | 'inventory' | 'movements', warehouseId? }` | `ApiResponse<{ canceled, filePath, reportType }>` |
| `export.excel` | `export:excel` | `{ reportType: 'dispatches' | 'inventory' | 'movements', warehouseId? }` | `ApiResponse<{ canceled, filePath, reportType }>` |

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
- `reason`: optional for generic movements, one of `"adjustment" | "dispatch" | "transfer"`
- `date`: optional valid ISO-compatible date string
- `sourceId` and `targetId`: positive integers and must be different
- `customer`: trimmed string, required for `warehouse:dispatch`, max 160 chars
- `notes`: optional trimmed string, max 500 chars
- `reportType`: one of `dispatches`, `inventory`, `movements`
- `warehouseId` in inventory exports is required because the report is contextual to the active warehouse

## Security Notes

- Backup and restore stay in the Electron main process and never expose filesystem access directly to the renderer
- IPC handlers call `warehouse-data-service.ts` only
- Export generation stays in the Electron main process and uses `dialog.showSaveDialog`
- The IPC layer never executes SQL directly
- SQL statements remain static and parameterized in the service/database layer
- Invalid payloads are rejected before reaching the database layer
- SQLite remains isolated in the Electron main process
- Legacy payloads without `warehouseId` continue to target the default warehouse for compatibility
- `warehouse:deactivate` keeps historical data and hides inactive warehouses from normal lists
- `warehouse:deactivate` is blocked when the warehouse still has stock or when it would leave the app without an active warehouse
- `warehouse:transferStock` runs inside a SQLite transaction and always creates both `out` and `in` movements
- `warehouse:dispatch` always creates one `OUT` movement with `reason = dispatch` and JSON `metadata`
