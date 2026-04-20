import { contextBridge, ipcRenderer } from "electron";
import type {
  ApiResponse,
  CreateProductPayload,
  CreateStockMovementPayload,
  GetStockMovementsPayload,
  Product,
  StockMovement,
  UpdateProductStockPayload,
} from "../shared/src/types/desktop-warehouse-ipc";
import type { WarehouseSyncResult } from "../shared/src/types/desktop-warehouse-sync-ipc";
import { WAREHOUSE_IPC_CHANNELS } from "./src/shared/warehouse-ipc-channels";
import { WAREHOUSE_SYNC_IPC_CHANNELS } from "./src/shared/warehouse-sync-ipc-channels";

const warehouseApi = {
  getProducts(): Promise<ApiResponse<Product[]>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.getProducts);
  },
  createProduct(payload: CreateProductPayload): Promise<ApiResponse<Product>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.createProduct, payload);
  },
  updateProductStock(payload: UpdateProductStockPayload): Promise<ApiResponse<Product>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.updateProductStock, payload);
  },
  getStockMovements(payload?: GetStockMovementsPayload): Promise<ApiResponse<StockMovement[]>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.getStockMovements, payload);
  },
  createStockMovement(
    payload: CreateStockMovementPayload,
  ): Promise<ApiResponse<StockMovement>> {
    return ipcRenderer.invoke(WAREHOUSE_IPC_CHANNELS.createStockMovement, payload);
  },
  sync(): Promise<ApiResponse<WarehouseSyncResult>> {
    return ipcRenderer.invoke(WAREHOUSE_SYNC_IPC_CHANNELS.sync);
  },
};

contextBridge.exposeInMainWorld("api", {
  warehouse: warehouseApi,
});
