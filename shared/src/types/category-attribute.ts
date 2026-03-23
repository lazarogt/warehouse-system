import type { CATEGORY_ATTRIBUTE_TYPES } from "../constants/category-attributes";

export type CategoryAttributeType = (typeof CATEGORY_ATTRIBUTE_TYPES)[number];

export interface CategoryAttribute {
  id: number;
  categoryId: number;
  key: string;
  label: string;
  type: CategoryAttributeType;
  required: boolean;
  options: string[] | null;
  sortOrder: number;
  active: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryAttributeInput {
  key: string;
  label: string;
  type: CategoryAttributeType;
  required: boolean;
  options?: string[] | null;
  sortOrder?: number;
  active?: boolean;
}
