import type { ProductAttribute, ProductAttributeInput } from "./product-attribute";

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  categoryId: number;
  categoryName: string;
  price: number;
  minimumStock: number;
  currentStock: number;
  attributes: ProductAttribute[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;
  categoryId: number;
  price: number;
  minimumStock: number;
  attributes?: ProductAttributeInput[];
}

export interface ProductFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: number;
  attributeKey?: string;
  attributeValue?: string;
  maximumMinimumStock?: number;
  maximumCurrentStock?: number;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}
