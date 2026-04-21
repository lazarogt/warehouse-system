import type { Warehouse } from "../../../shared/src/types/desktop-warehouse-ipc";

type ResolveSelectedWarehouseIdOptions = {
  availableWarehouses: Warehouse[];
  currentSelectedWarehouseId?: number | null;
  storedWarehouseId?: number | null;
};

function includesWarehouseId(availableWarehouses: Warehouse[], warehouseId: number | null | undefined) {
  if (!warehouseId) {
    return false;
  }

  return availableWarehouses.some((warehouse) => warehouse.id === warehouseId);
}

export function resolveSelectedWarehouseId({
  availableWarehouses,
  currentSelectedWarehouseId,
  storedWarehouseId,
}: ResolveSelectedWarehouseIdOptions): number | null {
  if (includesWarehouseId(availableWarehouses, currentSelectedWarehouseId)) {
    return currentSelectedWarehouseId ?? null;
  }

  if (includesWarehouseId(availableWarehouses, storedWarehouseId)) {
    return storedWarehouseId ?? null;
  }

  return availableWarehouses[0]?.id ?? null;
}

export function parseStoredWarehouseId(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}
