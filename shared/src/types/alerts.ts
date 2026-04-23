import type { Product } from "./product";

export interface LowStockAlert extends Product {
  shortage: number;
  warehouseId?: number | null;
  warehouseName?: string | null;
}
