import {
  createElement,
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
  LowStockAlert,
  Product,
  ProductListResponse,
  StockLevel,
  StockMovement,
  StockMovementInput,
  Warehouse,
  WarehouseLocation,
} from "../../../shared/src";
import type {
  Product as DesktopProduct,
  StockMovement as DesktopStockMovement,
  Warehouse as DesktopWarehouse,
} from "../../../shared/src/types/desktop-warehouse-ipc";
import { useWarehouseContext } from "../context/WarehouseContext";
import { ApiError, createApiClient } from "../lib/api";

export const OFFLINE_MODE_MESSAGE = "Modo sin conexión activo";

export type WarehouseScopedProduct = Product & {
  warehouseId?: number | null;
  warehouseName?: string | null;
};

type WarehouseScopedProductListResponse = Omit<ProductListResponse, "items"> & {
  items: WarehouseScopedProduct[];
};

type DownloadResult = Awaited<ReturnType<ReturnType<typeof createApiClient>["download"]>>;

type HttpClient = {
  get: <T,>(path: string) => Promise<T>;
  post: <T,>(path: string, body?: unknown) => Promise<T>;
  put: <T,>(path: string, body: unknown) => Promise<T>;
  patch: <T,>(path: string, body: unknown) => Promise<T>;
  delete: (path: string) => Promise<void>;
  download: (path: string) => Promise<DownloadResult>;
};

type InventorySnapshot = {
  lowStockAlerts: LowStockAlert[];
  locations: WarehouseLocation[];
  movements: StockMovement[];
  products: WarehouseScopedProduct[];
  stock: StockLevel[];
  warehouses: Warehouse[];
};

type RawInventorySnapshot = Omit<InventorySnapshot, "lowStockAlerts" | "products"> & {
  products: Product[];
};

type DataProviderContextValue = {
  apiBaseUrl: string;
  hasDesktopFallback: boolean;
  http: HttpClient;
  isOffline: boolean;
  setOfflineFromFailure: () => void;
  recheckBackendAvailability: () => Promise<boolean>;
  getDashboardSnapshot: (role?: string) => Promise<{
    lowStockAlerts: LowStockAlert[];
    recentMovements: StockMovement[];
    totalProducts: number;
    totalUsers: number;
  }>;
  getInventorySnapshot: (options?: { warehouseId?: number }) => Promise<InventorySnapshot>;
  getLowStockAlerts: (options?: { warehouseId?: number }) => Promise<LowStockAlert[]>;
  getLowStockCount: (options?: { warehouseId?: number }) => Promise<number>;
  listProducts: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    warehouseId?: number;
  }) => Promise<WarehouseScopedProductListResponse>;
  lookupProduct: (query: string) => Promise<Product>;
  postInventoryMovement: (payload: StockMovementInput) => Promise<void>;
};

type DataProviderRootProps = {
  apiBaseUrl: string;
  children: ReactNode;
};

const BACKEND_PING_INTERVAL_MS = 30_000;
const LOCAL_MINIMUM_STOCK = 10;

const DataProviderContext = createContext<DataProviderContextValue | null>(null);

function buildOfflineUserFacingError(): Error {
  return new Error(OFFLINE_MODE_MESSAGE);
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function mapDesktopProductToShared(product: DesktopProduct): Product {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: null,
    description: null,
    categoryId: 0,
    categoryName: "Catalogo local",
    price: product.price,
    minimumStock: LOCAL_MINIMUM_STOCK,
    currentStock: product.stock,
    attributes: [],
    createdAt: product.createdAt,
    updatedAt: product.createdAt,
  };
}

function mapDesktopWarehouseToShared(warehouse: DesktopWarehouse): Warehouse {
  return {
    id: warehouse.id,
    name: warehouse.name,
    description: warehouse.location,
    createdAt: warehouse.createdAt,
    updatedAt: warehouse.createdAt,
  };
}

function mapDesktopMovementToShared(
  movement: DesktopStockMovement,
  products: Product[],
  warehouses: Warehouse[],
): StockMovement {
  const product = products.find((item) => item.id === movement.productId);
  const warehouse = warehouses.find((item) => item.id === movement.warehouseId);
  const observationParts = [
    movement.metadata?.customer ? `Cliente: ${movement.metadata.customer}` : null,
    movement.metadata?.notes ?? null,
  ].filter(Boolean);

  return {
    id: movement.id,
    productId: movement.productId,
    productName: product?.name ?? "Producto local",
    productSku: product?.sku ?? null,
    warehouseId: movement.warehouseId,
    warehouseName: warehouse?.name ?? "Almacen local",
    warehouseLocationId: null,
    warehouseLocationName: null,
    userId: 0,
    userName: "Operacion local",
    type: movement.type === "in" ? "entry" : "exit",
    quantity: movement.quantity,
    movementDate: movement.date,
    observation: observationParts.length > 0 ? observationParts.join(" · ") : null,
    createdAt: movement.date,
  };
}

function createStockLevelLookup(stock: StockLevel[]) {
  return new Map(stock.map((item) => [`${item.warehouseId}:${item.productId}`, item.quantity]));
}

function buildScopedProducts(
  products: Product[],
  warehouses: Warehouse[],
  stock: StockLevel[],
  warehouseId?: number,
): WarehouseScopedProduct[] {
  const stockLookup = createStockLevelLookup(stock);

  if (warehouseId !== undefined) {
    const scopedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null;

    return products.map((product) => ({
      ...product,
      currentStock: stockLookup.get(`${warehouseId}:${product.id}`) ?? 0,
      warehouseId,
      warehouseName: scopedWarehouse?.name ?? null,
    }));
  }

  if (warehouses.length === 0) {
    return products.map((product) => ({
      ...product,
      warehouseId: null,
      warehouseName: null,
    }));
  }

  return warehouses.flatMap((warehouse) =>
    products.map((product) => ({
      ...product,
      currentStock: stockLookup.get(`${warehouse.id}:${product.id}`) ?? 0,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
    })),
  );
}

function buildLowStockAlerts(products: Product[]): LowStockAlert[] {
  return products
    .filter((product) => product.currentStock <= product.minimumStock)
    .map((product) => ({
      ...product,
      shortage: Math.max(product.minimumStock - product.currentStock, 0),
    }));
}

function buildScopedInventorySnapshot(
  rawSnapshot: RawInventorySnapshot,
  warehouseId?: number,
): InventorySnapshot {
  const warehouses =
    warehouseId === undefined
      ? rawSnapshot.warehouses
      : rawSnapshot.warehouses.filter((warehouse) => warehouse.id === warehouseId);
  const locations =
    warehouseId === undefined
      ? rawSnapshot.locations
      : rawSnapshot.locations.filter((location) => location.warehouseId === warehouseId);
  const stock =
    warehouseId === undefined
      ? rawSnapshot.stock
      : rawSnapshot.stock.filter((item) => item.warehouseId === warehouseId);
  const movements =
    warehouseId === undefined
      ? rawSnapshot.movements
      : rawSnapshot.movements.filter((movement) => movement.warehouseId === warehouseId);
  const products = buildScopedProducts(rawSnapshot.products, warehouses, rawSnapshot.stock, warehouseId);

  return {
    lowStockAlerts: buildLowStockAlerts(
      warehouseId === undefined ? rawSnapshot.products : products,
    ),
    locations,
    movements,
    products,
    stock,
    warehouses,
  };
}

async function buildLocalInventorySnapshot(): Promise<RawInventorySnapshot> {
  const warehouseApi = window.api?.warehouse;

  if (!warehouseApi) {
    throw new Error("La capa local no esta disponible en esta sesion.");
  }

  const [productsResponse, warehousesResponse, movementsResponse] = await Promise.all([
    warehouseApi.getProducts(),
    warehouseApi.listWarehouses(),
    warehouseApi.getStockMovements(),
  ]);

  if (!productsResponse.success || !warehousesResponse.success || !movementsResponse.success) {
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  const products = productsResponse.data.map(mapDesktopProductToShared);
  const warehouses = warehousesResponse.data.map(mapDesktopWarehouseToShared);
  const stock = await Promise.all(
    warehouses.flatMap((warehouse) =>
      products.map(async (product) => {
        const stockResponse = await warehouseApi.getWarehouseStock({
          warehouseId: warehouse.id,
          productId: product.id,
        });

        if (!stockResponse.success) {
          throw new Error(OFFLINE_MODE_MESSAGE);
        }

        return {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          quantity: stockResponse.data.quantity,
          warehouseId: warehouse.id,
          warehouseLocationId: null,
          warehouseLocationName: null,
          warehouseName: warehouse.name,
        } satisfies StockLevel;
      }),
    ),
  );
  const movements = movementsResponse.data
    .map((movement) => mapDesktopMovementToShared(movement, products, warehouses))
    .sort((left, right) => right.movementDate.localeCompare(left.movementDate))
    .slice(0, 12);

  return {
    locations: [],
    movements,
    products,
    stock,
    warehouses,
  };
}

function filterProducts(
  products: WarehouseScopedProduct[],
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
  } = {},
): WarehouseScopedProductListResponse {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? (products.length || 1);
  const search = params.search?.trim().toLowerCase() ?? "";
  const filteredProducts = search
    ? products.filter((product) => {
        const warehouseName = product.warehouseName?.toLowerCase() ?? "";

        return (
          product.name.toLowerCase().includes(search) ||
          (product.sku ?? "").toLowerCase().includes(search) ||
          (product.barcode ?? "").toLowerCase().includes(search) ||
          product.categoryName.toLowerCase().includes(search) ||
          warehouseName.includes(search)
        );
      })
    : products;
  const pageStart = Math.max(page - 1, 0) * pageSize;

  return {
    items: filteredProducts.slice(pageStart, pageStart + pageSize),
    page,
    pageSize,
    total: filteredProducts.length,
  };
}

export function DataProviderRoot({ apiBaseUrl, children }: DataProviderRootProps) {
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const { selectedWarehouseId, warehouseViewMode } = useWarehouseContext();
  const hasDesktopFallback = typeof window !== "undefined" && Boolean(window.api?.warehouse);
  const [isOffline, setIsOffline] = useState(() => hasDesktopFallback && isBrowserOffline());
  const statusRequestRef = useRef<Promise<boolean> | null>(null);

  const resolveWarehouseId = useCallback(
    (warehouseId?: number) => {
      if (warehouseId !== undefined) {
        return warehouseId;
      }

      return warehouseViewMode === "selected" ? selectedWarehouseId ?? undefined : undefined;
    },
    [selectedWarehouseId, warehouseViewMode],
  );

  const runHttpRequest = useCallback(
    async <T,>(request: () => Promise<T>) => {
      if (hasDesktopFallback && (isOffline || isBrowserOffline())) {
        setIsOffline(true);
        throw buildOfflineUserFacingError();
      }

      try {
        const response = await request();
        setIsOffline(false);
        return response;
      } catch (error) {
        if (hasDesktopFallback && error instanceof ApiError && error.status === 0) {
          setIsOffline(true);
          throw buildOfflineUserFacingError();
        }

        throw error;
      }
    },
    [hasDesktopFallback, isOffline],
  );

  const http = useMemo<HttpClient>(
    () => ({
      get: (path) => runHttpRequest(() => api.get(path)),
      post: (path, body) => runHttpRequest(() => api.post(path, body)),
      put: (path, body) => runHttpRequest(() => api.put(path, body)),
      patch: (path, body) => runHttpRequest(() => api.patch(path, body)),
      delete: (path) => runHttpRequest(() => api.delete(path)),
      download: (path) => runHttpRequest(() => api.download(path)),
    }),
    [api, runHttpRequest],
  );

  const recheckBackendAvailability = useCallback(async () => {
    if (statusRequestRef.current) {
      return statusRequestRef.current;
    }

    const request = (async () => {
      if (hasDesktopFallback && isBrowserOffline()) {
        setIsOffline(true);
        return false;
      }

      try {
        await api.get("/health");
        setIsOffline(false);
        return true;
      } catch {
        if (hasDesktopFallback) {
          setIsOffline(true);
        }

        return false;
      } finally {
        statusRequestRef.current = null;
      }
    })();

    statusRequestRef.current = request;
    return request;
  }, [api, hasDesktopFallback]);

  useEffect(() => {
    if (!hasDesktopFallback) {
      return;
    }

    void recheckBackendAvailability();

    const intervalHandle = window.setInterval(() => {
      void recheckBackendAvailability();
    }, BACKEND_PING_INTERVAL_MS);

    const handleOnline = () => {
      void recheckBackendAvailability();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(intervalHandle);
      window.removeEventListener("online", handleOnline);
    };
  }, [hasDesktopFallback, recheckBackendAvailability]);

  const getRawInventorySnapshot = useCallback(async (): Promise<RawInventorySnapshot> => {
    if (hasDesktopFallback) {
      return buildLocalInventorySnapshot();
    }

    const [productsResponse, warehouses, locations, movements, stock] = await Promise.all([
      http.get<ProductListResponse>("/products?page=1&pageSize=100"),
      http.get<Warehouse[]>("/warehouses"),
      http.get<WarehouseLocation[]>("/locations"),
      http.get<StockMovement[]>("/inventory/movements?limit=12"),
      http.get<StockLevel[]>("/inventory/stock"),
    ]);

    return {
      locations,
      movements,
      products: productsResponse.items,
      stock,
      warehouses,
    };
  }, [hasDesktopFallback, http]);

  const getInventorySnapshot = useCallback(
    async (options?: { warehouseId?: number }) => {
      const rawSnapshot = await getRawInventorySnapshot();
      return buildScopedInventorySnapshot(rawSnapshot, resolveWarehouseId(options?.warehouseId));
    },
    [getRawInventorySnapshot, resolveWarehouseId],
  );

  const lookupOfflineProduct = useCallback(async (query: string) => {
    const snapshot = await getRawInventorySnapshot();
    const normalizedQuery = query.trim().toLowerCase();
    const match = snapshot.products.find((product) => {
      return (
        product.name.toLowerCase().includes(normalizedQuery) ||
        (product.sku ?? "").toLowerCase() === normalizedQuery ||
        (product.barcode ?? "").toLowerCase() === normalizedQuery
      );
    });

    if (!match) {
      throw new Error("No se encontro coincidencia en el catalogo local.");
    }

    return match;
  }, [getRawInventorySnapshot]);

  const postOfflineInventoryMovement = useCallback(async (payload: StockMovementInput) => {
    const warehouseApi = window.api?.warehouse;

    if (!warehouseApi) {
      throw new Error(OFFLINE_MODE_MESSAGE);
    }

    const response = await warehouseApi.createStockMovement({
      productId: payload.productId,
      warehouseId: payload.warehouseId,
      type: payload.type === "entry" ? "in" : "out",
      quantity: payload.quantity,
      date: payload.movementDate,
    });

    if (!response.success) {
      throw new Error(response.error.message || OFFLINE_MODE_MESSAGE);
    }
  }, []);

  const listProducts = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      warehouseId?: number;
    }) => {
      const snapshot = await getInventorySnapshot({
        warehouseId: params?.warehouseId,
      });
      return filterProducts(snapshot.products, params);
    },
    [getInventorySnapshot],
  );

  const lookupProduct = useCallback(
    async (query: string) => {
      const trimmedQuery = query.trim();

      if (hasDesktopFallback) {
        return lookupOfflineProduct(trimmedQuery);
      }

      const isBarcode = /^\d+$/.test(trimmedQuery);
      return http.get<Product>(
        `/products/lookup?${isBarcode ? `barcode=${encodeURIComponent(trimmedQuery)}` : `sku=${encodeURIComponent(trimmedQuery)}`}`,
      );
    },
    [hasDesktopFallback, http, lookupOfflineProduct],
  );

  const postInventoryMovement = useCallback(
    async (payload: StockMovementInput) => {
      if (hasDesktopFallback) {
        return postOfflineInventoryMovement(payload);
      }

      await http.post("/inventory/movements", payload);
    },
    [hasDesktopFallback, http, postOfflineInventoryMovement],
  );

  const getLowStockAlerts = useCallback(
    async (options?: { warehouseId?: number }) => {
      const snapshot = await getInventorySnapshot(options);
      return snapshot.lowStockAlerts;
    },
    [getInventorySnapshot],
  );

  const getLowStockCount = useCallback(
    async (options?: { warehouseId?: number }) => {
      const alerts = await getLowStockAlerts(options);
      return alerts.length;
    },
    [getLowStockAlerts],
  );

  const getDashboardSnapshot = useCallback(
    async (role?: string) => {
      const snapshot = await getInventorySnapshot();

      return {
        lowStockAlerts: snapshot.lowStockAlerts,
        recentMovements: snapshot.movements,
        totalProducts:
          warehouseViewMode === "selected"
            ? snapshot.products.length
            : new Set(snapshot.products.map((product) => product.id)).size,
        totalUsers:
          hasDesktopFallback || role !== "admin"
            ? role === "admin"
              ? 1
              : 0
            : (await http.get<unknown[]>("/users")).length,
      };
    },
    [getInventorySnapshot, hasDesktopFallback, http, warehouseViewMode],
  );

  const value = useMemo<DataProviderContextValue>(
    () => ({
      apiBaseUrl,
      getDashboardSnapshot,
      getInventorySnapshot,
      getLowStockAlerts,
      getLowStockCount,
      hasDesktopFallback,
      http,
      isOffline,
      listProducts,
      lookupProduct,
      postInventoryMovement,
      recheckBackendAvailability,
      setOfflineFromFailure() {
        if (hasDesktopFallback) {
          setIsOffline(true);
        }
      },
    }),
    [
      apiBaseUrl,
      getDashboardSnapshot,
      getInventorySnapshot,
      getLowStockAlerts,
      getLowStockCount,
      hasDesktopFallback,
      http,
      isOffline,
      listProducts,
      lookupProduct,
      postInventoryMovement,
      recheckBackendAvailability,
    ],
  );

  return createElement(DataProviderContext.Provider, {
    value,
    children,
  });
}

export function useDataProvider() {
  const context = useContext(DataProviderContext);

  if (!context) {
    throw new Error("useDataProvider must be used within a DataProviderRoot.");
  }

  return context;
}
