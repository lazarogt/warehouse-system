import type { StockTransferStatus } from "../constants/inventory";

export interface StockTransfer {
  id: number;
  fromWarehouseId: number;
  fromWarehouseName: string;
  toWarehouseId: number;
  toWarehouseName: string;
  fromLocationId: number | null;
  fromLocationName: string | null;
  toLocationId: number | null;
  toLocationName: string | null;
  productId: number;
  productName: string;
  productSku: string | null;
  quantity: number;
  status: StockTransferStatus;
  requestedBy: number;
  requestedByName: string;
  approvedBy: number | null;
  approvedByName: string | null;
  completedBy: number | null;
  completedByName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockTransferInput {
  fromWarehouseId: number;
  toWarehouseId: number;
  fromLocationId?: number | null;
  toLocationId?: number | null;
  productId: number;
  quantity: number;
  notes?: string | null;
}

export interface StockTransferFilters {
  status?: StockTransferStatus;
  warehouseId?: number;
  limit?: number;
}
