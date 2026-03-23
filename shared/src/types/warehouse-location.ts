import type { WarehouseLocationType } from "../constants/inventory";

export interface WarehouseLocation {
  id: number;
  warehouseId: number;
  warehouseName: string;
  code: string;
  name: string;
  type: WarehouseLocationType;
  parentLocationId: number | null;
  parentLocationCode: string | null;
  parentLocationName: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseLocationInput {
  warehouseId: number;
  code: string;
  name: string;
  type: WarehouseLocationType;
  parentLocationId?: number | null;
  active?: boolean;
}
