import { contextBridge, ipcRenderer } from "electron";
import type {
  CreateBackupResult,
  RestoreBackupPayload,
  RestoreBackupResult,
} from "../shared/src/types/desktop-backup-ipc";
import type {
  DesktopExportPayload,
  DesktopExportResult,
} from "../shared/src/types/desktop-export-ipc";
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
} from "../shared/src/types/desktop-warehouse-ipc";
import type { WarehouseSyncResult } from "../shared/src/types/desktop-warehouse-sync-ipc";
import { BACKUP_IPC_CHANNELS } from "./src/shared/backup-ipc-channels";
import { EXPORT_IPC_CHANNELS } from "./src/shared/export-ipc-channels";
import { WAREHOUSE_IPC_CHANNELS } from "./src/shared/warehouse-ipc-channels";
import { WAREHOUSE_SYNC_IPC_CHANNELS } from "./src/shared/warehouse-sync-ipc-channels";

const warehouseApi = {
  getProducts(payload?: GetProductsPayload): Promise<ApiResponse<Product[]>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.getProducts, payload);
  },
  createProduct(payload: CreateProductPayload): Promise<ApiResponse<Product>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.createProduct, payload);
  },
  dispatchProduct(payload: DispatchProductPayload): Promise<ApiResponse<StockMovement>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.dispatchProduct, payload);
  },
  createWarehouse(payload: CreateWarehousePayload): Promise<ApiResponse<Warehouse>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.createWarehouse, payload);
  },
  updateWarehouse(payload: UpdateWarehousePayload): Promise<ApiResponse<Warehouse>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.updateWarehouse, payload);
  },
  deactivateWarehouse(
    payload: DeactivateWarehousePayload,
  ): Promise<ApiResponse<DeactivateWarehouseResult>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.deactivateWarehouse, payload);
  },
  updateProductStock(payload: UpdateProductStockPayload): Promise<ApiResponse<Product>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.updateProductStock, payload);
  },
  getStockMovements(payload?: GetStockMovementsPayload): Promise<ApiResponse<StockMovement[]>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.getStockMovements, payload);
  },
  getWarehouses(): Promise<ApiResponse<Warehouse[]>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.getWarehouses);
  },
  listWarehouses(): Promise<ApiResponse<Warehouse[]>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.getWarehouses);
  },
  getWarehouseStock(payload: GetWarehouseStockPayload): Promise<ApiResponse<WarehouseStock>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.getWarehouseStock, payload);
  },
  createStockMovement(
    payload: CreateStockMovementPayload,
  ): Promise<ApiResponse<StockMovement>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.createStockMovement, payload);
  },
  setWarehouseStock(payload: SetWarehouseStockPayload): Promise<ApiResponse<WarehouseStock>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.setWarehouseStock, payload);
  },
  transferStock(payload: TransferStockPayload): Promise<ApiResponse<TransferStockResult>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.transferStock, payload);
  },
  sync(): Promise<ApiResponse<WarehouseSyncResult>> {
    return ipcRenderer.invoke(WAREHOUSE_SYNC_IPC_CHANNELS.sync);
  },
};

const backupApi = {
  createBackup(): Promise<ApiResponse<CreateBackupResult>> {
    return ipcRenderer.invoke(BACKUP_IPC_CHANNELS.create);
  },
  restoreBackup(payload?: RestoreBackupPayload): Promise<ApiResponse<RestoreBackupResult>> {
    return ipcRenderer.invoke(BACKUP_IPC_CHANNELS.restore, payload);
  },
};

const exportApi = {
  pdf(payload: DesktopExportPayload): Promise<ApiResponse<DesktopExportResult>> {
    return ipcRenderer.invoke(EXPORT_IPC_CHANNELS.pdf, payload);
  },
  excel(payload: DesktopExportPayload): Promise<ApiResponse<DesktopExportResult>> {
    return ipcRenderer.invoke(EXPORT_IPC_CHANNELS.excel, payload);
  },
};

contextBridge.exposeInMainWorld("api", {
  backup: backupApi,
  export: exportApi,
  warehouse: warehouseApi,
});
