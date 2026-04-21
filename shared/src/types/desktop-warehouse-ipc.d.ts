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
  quantity: number;
  date: string;
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

export interface UpdateProductStockPayload {
  productId: number;
  stock: number;
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
}
