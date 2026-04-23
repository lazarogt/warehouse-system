import type {
  CreateBackupResult,
  RestoreBackupPayload,
  RestoreBackupResult,
} from "../../../shared/src/types/desktop-backup-ipc";
import type {
  DesktopExportPayload,
  DesktopExportResult,
} from "../../../shared/src/types/desktop-export-ipc";
import type {
  ApiResponse,
  CreateProductPayload,
  CreateStockMovementPayload,
  CreateWarehousePayload,
  DeactivateWarehousePayload,
  DeactivateWarehouseResult,
  DispatchProductPayload,
  GetProductsPayload,
  GetStockMovementsPayload,
  GetWarehouseStockPayload,
  Product,
  StockMovement,
  TransferStockPayload,
  TransferStockResult,
  UpdateWarehousePayload,
  UpdateProductStockPayload,
  SetWarehouseStockPayload,
  Warehouse,
  WarehouseStock,
} from "../../../shared/src/types/desktop-warehouse-ipc";
import type { WarehouseSyncResult } from "../../../shared/src/types/desktop-warehouse-sync-ipc";

declare global {
  interface Window {
    api: {
      backup: {
        createBackup(): Promise<ApiResponse<CreateBackupResult>>;
        restoreBackup(payload?: RestoreBackupPayload): Promise<ApiResponse<RestoreBackupResult>>;
      };
      export: {
        pdf(payload: DesktopExportPayload): Promise<ApiResponse<DesktopExportResult>>;
        excel(payload: DesktopExportPayload): Promise<ApiResponse<DesktopExportResult>>;
      };
      warehouse: {
        getProducts(payload?: GetProductsPayload): Promise<ApiResponse<Product[]>>;
        createProduct(payload: CreateProductPayload): Promise<ApiResponse<Product>>;
        dispatchProduct(payload: DispatchProductPayload): Promise<ApiResponse<StockMovement>>;
        createWarehouse(payload: CreateWarehousePayload): Promise<ApiResponse<Warehouse>>;
        updateWarehouse(payload: UpdateWarehousePayload): Promise<ApiResponse<Warehouse>>;
        deactivateWarehouse(
          payload: DeactivateWarehousePayload,
        ): Promise<ApiResponse<DeactivateWarehouseResult>>;
        updateProductStock(payload: UpdateProductStockPayload): Promise<ApiResponse<Product>>;
        getStockMovements(
          payload?: GetStockMovementsPayload,
        ): Promise<ApiResponse<StockMovement[]>>;
        getWarehouses(): Promise<ApiResponse<Warehouse[]>>;
        listWarehouses(): Promise<ApiResponse<Warehouse[]>>;
        getWarehouseStock(payload: GetWarehouseStockPayload): Promise<ApiResponse<WarehouseStock>>;
        createStockMovement(
          payload: CreateStockMovementPayload,
        ): Promise<ApiResponse<StockMovement>>;
        setWarehouseStock(payload: SetWarehouseStockPayload): Promise<ApiResponse<WarehouseStock>>;
        transferStock(payload: TransferStockPayload): Promise<ApiResponse<TransferStockResult>>;
        sync(): Promise<ApiResponse<WarehouseSyncResult>>;
      };
    };
  }
}

export {};
