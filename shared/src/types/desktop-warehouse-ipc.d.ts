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

export interface StockMovement {
  id: number;
  productId: number;
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

export interface UpdateProductStockPayload {
  productId: number;
  stock: number;
}

export interface GetStockMovementsPayload {
  productId?: number;
}

export interface CreateStockMovementPayload {
  productId: number;
  type: StockMovementType;
  quantity: number;
  date?: string;
}
