import type { StockMovementType } from "../constants/inventory";

export interface StockMovement {
  id: number;
  productId: number;
  productName: string;
  productSku?: string | null;
  warehouseId: number;
  warehouseName: string;
  warehouseLocationId?: number | null;
  warehouseLocationName?: string | null;
  userId: number;
  userName: string;
  type: StockMovementType;
  quantity: number;
  movementDate: string;
  observation: string | null;
  createdAt: string;
}

export interface StockMovementInput {
  productId: number;
  warehouseId: number;
  warehouseLocationId?: number | null;
  type: StockMovementType;
  quantity: number;
  movementDate: string;
  observation?: string | null;
}

export interface StockLevel {
  productId: number;
  productName: string;
  productSku?: string | null;
  warehouseId: number;
  warehouseName: string;
  warehouseLocationId?: number | null;
  warehouseLocationName?: string | null;
  quantity: number;
}

export interface StockMovementResult {
  movement: StockMovement;
  currentStock: StockLevel;
}

export interface StockMovementFilters {
  limit?: number;
}
