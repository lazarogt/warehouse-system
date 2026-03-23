import type { CycleCountStatus } from "../constants/inventory";

export interface CycleCountItem {
  id: number;
  cycleCountId: number;
  productId: number;
  productName: string;
  productSku: string | null;
  expectedQuantity: number;
  countedQuantity: number | null;
  difference: number | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CycleCount {
  id: number;
  warehouseId: number;
  warehouseName: string;
  warehouseLocationId: number | null;
  warehouseLocationName: string | null;
  status: CycleCountStatus;
  createdBy: number;
  createdByName: string;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  items: CycleCountItem[];
}

export interface CreateCycleCountInput {
  warehouseId: number;
  warehouseLocationId?: number | null;
  notes?: string | null;
}

export interface CreateCycleCountItemInput {
  productId: number;
}

export interface UpdateCycleCountItemInput {
  countedQuantity: number;
  resolved?: boolean;
}
