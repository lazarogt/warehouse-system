import type { StockAdjustmentType } from "../constants/inventory";

export interface StockAdjustment {
  id: number;
  warehouseId: number;
  warehouseName: string;
  warehouseLocationId: number | null;
  warehouseLocationName: string | null;
  productId: number;
  productName: string;
  productSku: string | null;
  type: StockAdjustmentType;
  previousQuantity: number;
  adjustedQuantity: number;
  reason: string;
  createdBy: number;
  createdByName: string;
  createdAt: string;
}

export interface StockAdjustmentInput {
  warehouseId: number;
  warehouseLocationId?: number | null;
  productId: number;
  type: StockAdjustmentType;
  adjustedQuantity: number;
  reason: string;
}
