import type {
  ApiResponse,
  CreateProductPayload,
  CreateStockMovementPayload,
  GetStockMovementsPayload,
  Product,
  StockMovement,
  UpdateProductStockPayload,
} from "../../../shared/src/types/desktop-warehouse-ipc";

declare global {
  interface Window {
    api: {
      warehouse: {
        getProducts(): Promise<ApiResponse<Product[]>>;
        createProduct(payload: CreateProductPayload): Promise<ApiResponse<Product>>;
        updateProductStock(payload: UpdateProductStockPayload): Promise<ApiResponse<Product>>;
        getStockMovements(
          payload?: GetStockMovementsPayload,
        ): Promise<ApiResponse<StockMovement[]>>;
        createStockMovement(
          payload: CreateStockMovementPayload,
        ): Promise<ApiResponse<StockMovement>>;
      };
    };
  }
}

export {};
