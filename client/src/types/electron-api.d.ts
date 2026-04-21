import type {
  ApiResponse,
  CreateProductPayload,
  CreateStockMovementPayload,
  CreateWarehousePayload,
  GetStockMovementsPayload,
  GetWarehouseStockPayload,
  Product,
  StockMovement,
  UpdateProductStockPayload,
  SetWarehouseStockPayload,
  Warehouse,
  WarehouseStock,
} from "../../../shared/src/types/desktop-warehouse-ipc";
import type { WarehouseSyncResult } from "../../../shared/src/types/desktop-warehouse-sync-ipc";

declare global {
  interface Window {
    api: {
      warehouse: {
        getProducts(): Promise<ApiResponse<Product[]>>;
        createProduct(payload: CreateProductPayload): Promise<ApiResponse<Product>>;
        createWarehouse(payload: CreateWarehousePayload): Promise<ApiResponse<Warehouse>>;
        updateProductStock(payload: UpdateProductStockPayload): Promise<ApiResponse<Product>>;
        getStockMovements(
          payload?: GetStockMovementsPayload,
        ): Promise<ApiResponse<StockMovement[]>>;
        getWarehouses(): Promise<ApiResponse<Warehouse[]>>;
        getWarehouseStock(payload: GetWarehouseStockPayload): Promise<ApiResponse<WarehouseStock>>;
        createStockMovement(
          payload: CreateStockMovementPayload,
        ): Promise<ApiResponse<StockMovement>>;
        setWarehouseStock(payload: SetWarehouseStockPayload): Promise<ApiResponse<WarehouseStock>>;
        sync(): Promise<ApiResponse<WarehouseSyncResult>>;
      };
    };
  }
}

export {};
