export interface Warehouse {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseInput {
  name: string;
  description?: string | null;
}

