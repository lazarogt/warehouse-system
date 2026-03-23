import type { CategoryAttributeType } from "./category-attribute";

export type ProductAttributeValue = unknown;

export interface ProductAttribute {
  id: number;
  productId: number;
  categoryAttributeId: number;
  key: string;
  label: string;
  type: CategoryAttributeType;
  required: boolean;
  options: string[] | null;
  sortOrder: number;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductAttributeInput {
  categoryAttributeId: number;
  value: ProductAttributeValue;
}
