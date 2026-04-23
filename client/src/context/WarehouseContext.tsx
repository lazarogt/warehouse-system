import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CreateWarehousePayload,
  DeactivateWarehousePayload,
  DeactivateWarehouseResult,
  UpdateWarehousePayload,
  Warehouse,
} from "../../../shared/src/types/desktop-warehouse-ipc";
import { parseStoredWarehouseId, resolveSelectedWarehouseId } from "../lib/warehouse-selection";

const SELECTED_WAREHOUSE_STORAGE_KEY = "warehouse-system:selected-warehouse-id";
const WAREHOUSE_VIEW_MODE_STORAGE_KEY = "warehouse-system:warehouse-view-mode";

export type WarehouseViewMode = "selected" | "all";

type WarehouseContextValue = {
  availableWarehouses: Warehouse[];
  selectedWarehouseId: number | null;
  selectedWarehouse: Warehouse | null;
  warehouseViewMode: WarehouseViewMode;
  loading: boolean;
  error: string | null;
  isDesktopMode: boolean;
  selectWarehouse: (warehouseId: number) => void;
  selectWarehouseViewMode: (mode: WarehouseViewMode) => void;
  refreshWarehouses: () => Promise<Warehouse[]>;
  createWarehouse: (payload: CreateWarehousePayload) => Promise<Warehouse>;
  updateWarehouse: (payload: UpdateWarehousePayload) => Promise<Warehouse>;
  deactivateWarehouse: (
    payload: DeactivateWarehousePayload,
  ) => Promise<DeactivateWarehouseResult>;
};

const WarehouseContext = createContext<WarehouseContextValue | null>(null);

function getStoredWarehouseId(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseStoredWarehouseId(window.localStorage.getItem(SELECTED_WAREHOUSE_STORAGE_KEY));
}

function getStoredWarehouseViewMode(): WarehouseViewMode {
  if (typeof window === "undefined") {
    return "selected";
  }

  return window.localStorage.getItem(WAREHOUSE_VIEW_MODE_STORAGE_KEY) === "all"
    ? "all"
    : "selected";
}

function persistWarehouseId(warehouseId: number | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (warehouseId) {
    window.localStorage.setItem(SELECTED_WAREHOUSE_STORAGE_KEY, String(warehouseId));
    return;
  }

  window.localStorage.removeItem(SELECTED_WAREHOUSE_STORAGE_KEY);
}

function persistWarehouseViewMode(mode: WarehouseViewMode) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(WAREHOUSE_VIEW_MODE_STORAGE_KEY, mode);
}

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [availableWarehouses, setAvailableWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [warehouseViewMode, setWarehouseViewMode] = useState<WarehouseViewMode>(() =>
    getStoredWarehouseViewMode(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedWarehouseIdRef = useRef<number | null>(null);
  const isDesktopMode = typeof window !== "undefined" && Boolean(window.api?.warehouse);

  useEffect(() => {
    selectedWarehouseIdRef.current = selectedWarehouseId;
  }, [selectedWarehouseId]);

  const sortWarehouses = useCallback((warehouses: Warehouse[]) => {
    return [...warehouses].sort((left, right) => {
      return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
    });
  }, []);

  const applyWarehouseSelection = useCallback(
    (
      nextWarehouses: Warehouse[],
      currentSelectedWarehouseId: number | null = selectedWarehouseIdRef.current,
      storedWarehouseId: number | null = getStoredWarehouseId(),
    ) => {
      const sortedWarehouses = sortWarehouses(nextWarehouses);
      setAvailableWarehouses(sortedWarehouses);
      const nextSelectedWarehouseId = resolveSelectedWarehouseId({
        availableWarehouses: sortedWarehouses,
        currentSelectedWarehouseId,
        storedWarehouseId,
      });
      setSelectedWarehouseId(nextSelectedWarehouseId);
      persistWarehouseId(nextSelectedWarehouseId);
      setError(null);
      return nextSelectedWarehouseId;
    },
    [sortWarehouses],
  );

  const refreshWarehouses = useCallback(async () => {
    const warehouseApi = window.api?.warehouse;

    if (!warehouseApi) {
      setAvailableWarehouses([]);
      setSelectedWarehouseId(null);
      setError(null);
      setLoading(false);
      return [];
    }

    setLoading(true);
    setError(null);

    const response = await warehouseApi.listWarehouses();

    if (!response.success) {
      const message = response.error.message || "No se pudieron cargar los almacenes.";

      setAvailableWarehouses([]);
      setSelectedWarehouseId(null);
      setError(message);
      setLoading(false);
      throw new Error(message);
    }

    applyWarehouseSelection(response.data);
    setLoading(false);

    return response.data;
  }, [applyWarehouseSelection]);

  useEffect(() => {
    void refreshWarehouses().catch(() => {
      return undefined;
    });
  }, [refreshWarehouses]);

  const selectWarehouse = useCallback(
    (warehouseId: number) => {
      if (!availableWarehouses.some((warehouse) => warehouse.id === warehouseId)) {
        return;
      }

      setSelectedWarehouseId(warehouseId);
      persistWarehouseId(warehouseId);
    },
    [availableWarehouses],
  );

  const selectWarehouseViewMode = useCallback((mode: WarehouseViewMode) => {
    setWarehouseViewMode(mode);
    persistWarehouseViewMode(mode);
  }, []);

  const createWarehouse = useCallback(
    async (payload: CreateWarehousePayload) => {
      const warehouseApi = window.api?.warehouse;

      if (!warehouseApi) {
        throw new Error("Esta accion solo esta disponible en la app de escritorio.");
      }

      const response = await warehouseApi.createWarehouse(payload);

      if (!response.success) {
        throw new Error(response.error.message || "No se pudo crear el almacen.");
      }

      applyWarehouseSelection(
        [...availableWarehouses, response.data],
        response.data.id,
        response.data.id,
      );

      return response.data;
    },
    [applyWarehouseSelection, availableWarehouses],
  );

  const updateWarehouse = useCallback(
    async (payload: UpdateWarehousePayload) => {
      const warehouseApi = window.api?.warehouse;

      if (!warehouseApi) {
        throw new Error("Esta accion solo esta disponible en la app de escritorio.");
      }

      const response = await warehouseApi.updateWarehouse(payload);

      if (!response.success) {
        throw new Error(response.error.message || "No se pudo guardar el almacen.");
      }

      applyWarehouseSelection(
        availableWarehouses.map((warehouse) =>
          warehouse.id === response.data.id ? response.data : warehouse,
        ),
      );

      return response.data;
    },
    [applyWarehouseSelection, availableWarehouses],
  );

  const deactivateWarehouse = useCallback(
    async (payload: DeactivateWarehousePayload) => {
      const warehouseApi = window.api?.warehouse;

      if (!warehouseApi) {
        throw new Error("Esta accion solo esta disponible en la app de escritorio.");
      }

      const response = await warehouseApi.deactivateWarehouse(payload);

      if (!response.success) {
        throw new Error(response.error.message || "No se pudo desactivar el almacen.");
      }

      const storedWarehouseId = getStoredWarehouseId();
      const nextSelectedWarehouseId =
        selectedWarehouseIdRef.current === payload.warehouseId
          ? null
          : selectedWarehouseIdRef.current;

      applyWarehouseSelection(
        availableWarehouses.filter((warehouse) => warehouse.id !== payload.warehouseId),
        nextSelectedWarehouseId,
        storedWarehouseId === payload.warehouseId ? null : storedWarehouseId,
      );

      return response.data;
    },
    [applyWarehouseSelection, availableWarehouses],
  );

  const selectedWarehouse = useMemo(() => {
    return (
      availableWarehouses.find((warehouse) => warehouse.id === selectedWarehouseId) ?? null
    );
  }, [availableWarehouses, selectedWarehouseId]);

  const value = useMemo<WarehouseContextValue>(
    () => ({
      availableWarehouses,
      selectedWarehouseId,
      selectedWarehouse,
      warehouseViewMode,
      loading,
      error,
      isDesktopMode,
      selectWarehouse,
      selectWarehouseViewMode,
      refreshWarehouses,
      createWarehouse,
      updateWarehouse,
      deactivateWarehouse,
    }),
    [
      availableWarehouses,
      createWarehouse,
      deactivateWarehouse,
      error,
      isDesktopMode,
      loading,
      refreshWarehouses,
      selectWarehouse,
      selectWarehouseViewMode,
      selectedWarehouse,
      selectedWarehouseId,
      warehouseViewMode,
      updateWarehouse,
    ],
  );

  return <WarehouseContext.Provider value={value}>{children}</WarehouseContext.Provider>;
}

export function useWarehouseContext() {
  const context = useContext(WarehouseContext);

  if (!context) {
    throw new Error("useWarehouseContext must be used within a WarehouseProvider.");
  }

  return context;
}
