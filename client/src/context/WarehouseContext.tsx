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
  Warehouse,
} from "../../../shared/src/types/desktop-warehouse-ipc";
import { parseStoredWarehouseId, resolveSelectedWarehouseId } from "../lib/warehouse-selection";

const SELECTED_WAREHOUSE_STORAGE_KEY = "warehouse-system:selected-warehouse-id";

type WarehouseContextValue = {
  availableWarehouses: Warehouse[];
  selectedWarehouseId: number | null;
  selectedWarehouse: Warehouse | null;
  loading: boolean;
  error: string | null;
  isDesktopMode: boolean;
  selectWarehouse: (warehouseId: number) => void;
  refreshWarehouses: () => Promise<Warehouse[]>;
  createWarehouse: (payload: CreateWarehousePayload) => Promise<Warehouse>;
};

const WarehouseContext = createContext<WarehouseContextValue | null>(null);

function getStoredWarehouseId(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseStoredWarehouseId(window.localStorage.getItem(SELECTED_WAREHOUSE_STORAGE_KEY));
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

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [availableWarehouses, setAvailableWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedWarehouseIdRef = useRef<number | null>(null);
  const isDesktopMode = typeof window !== "undefined" && Boolean(window.api?.warehouse);

  useEffect(() => {
    selectedWarehouseIdRef.current = selectedWarehouseId;
  }, [selectedWarehouseId]);

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

    setAvailableWarehouses(response.data);

    const nextSelectedWarehouseId = resolveSelectedWarehouseId({
      availableWarehouses: response.data,
      currentSelectedWarehouseId: selectedWarehouseIdRef.current,
      storedWarehouseId: getStoredWarehouseId(),
    });

    setSelectedWarehouseId(nextSelectedWarehouseId);
    persistWarehouseId(nextSelectedWarehouseId);
    setLoading(false);

    return response.data;
  }, []);

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

  const createWarehouse = useCallback(async (payload: CreateWarehousePayload) => {
    const warehouseApi = window.api?.warehouse;

    if (!warehouseApi) {
      throw new Error("Esta accion solo esta disponible en la app de escritorio.");
    }

    const response = await warehouseApi.createWarehouse(payload);

    if (!response.success) {
      throw new Error(response.error.message || "No se pudo crear el almacen.");
    }

    setAvailableWarehouses((current) => [...current, response.data]);
    setSelectedWarehouseId(response.data.id);
    persistWarehouseId(response.data.id);
    setError(null);

    return response.data;
  }, []);

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
      loading,
      error,
      isDesktopMode,
      selectWarehouse,
      refreshWarehouses,
      createWarehouse,
    }),
    [
      availableWarehouses,
      createWarehouse,
      error,
      isDesktopMode,
      loading,
      refreshWarehouses,
      selectWarehouse,
      selectedWarehouse,
      selectedWarehouseId,
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
