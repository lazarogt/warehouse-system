export type ApiError = {
  code: string;
  message: string;
};

export type ApiResponse<T> =
  | {
      success: true;
      data: T;
      error?: never;
    }
  | {
      success: false;
      data?: never;
      error: ApiError;
    };

export type StockMovementType = "in" | "out";
export type StockMovementReason = "adjustment" | "dispatch" | "transfer";

export interface StockMovementMetadata {
  customer?: string;
  notes?: string;
  sourceWarehouseId?: number;
  targetWarehouseId?: number;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock: number;
  createdAt: string;
}

export interface Warehouse {
  id: number;
  name: string;
  location: string;
  isActive: boolean;
  createdAt: string;
}

export interface WarehouseStock {
  warehouseId: number;
  productId: number;
  quantity: number;
}

export interface StockMovement {
  id: number;
  productId: number;
  warehouseId: number;
  type: StockMovementType;
  reason: StockMovementReason;
  quantity: number;
  date: string;
  metadata: StockMovementMetadata | null;
  productName?: string;
  productSku?: string;
  warehouseName?: string;
}

export interface CreateProductPayload {
  name: string;
  sku: string;
  price: number;
  stock?: number;
}

export interface CreateWarehousePayload {
  name: string;
  location: string;
}

export interface UpdateWarehousePayload {
  warehouseId: number;
  name: string;
  location: string;
}

export interface DeactivateWarehousePayload {
  warehouseId: number;
}

export interface DeactivateWarehouseResult {
  warehouseId: number;
}

export interface TransferStockPayload {
  sourceId: number;
  targetId: number;
  productId: number;
  quantity: number;
}

export interface TransferStockResult {
  sourceId: number;
  targetId: number;
  productId: number;
  quantity: number;
  movedAt: string;
  movementIds: [number, number];
}

export interface UpdateProductStockPayload {
  productId: number;
  stock: number;
  warehouseId?: number;
}

export interface GetProductsPayload {
  warehouseId?: number;
}

export interface GetStockMovementsPayload {
  productId?: number;
  warehouseId?: number;
}

export interface GetWarehouseStockPayload {
  warehouseId: number;
  productId: number;
}

export interface SetWarehouseStockPayload {
  warehouseId: number;
  productId: number;
  quantity: number;
}

export interface CreateStockMovementPayload {
  productId: number;
  warehouseId?: number;
  type: StockMovementType;
  quantity: number;
  date?: string;
  reason?: StockMovementReason;
  metadata?: StockMovementMetadata | null;
}

export interface DispatchProductPayload {
  warehouseId: number;
  productId: number;
  quantity: number;
  customer: string;
  notes?: string;
}
