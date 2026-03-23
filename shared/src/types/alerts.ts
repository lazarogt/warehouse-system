import type { Product } from "./product";

export interface LowStockAlert extends Product {
  shortage: number;
}
