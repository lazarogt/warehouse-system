import {
  createElement,
  createContext,
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
import { ApiError, createApiClient } from "../lib/api";

type DataProviderContextValue = {
  apiBaseUrl: string;
  hasDesktopFallback: boolean;
  isOffline: boolean;
  setOfflineFromFailure: () => void;
  recheckBackendAvailability: () => Promise<boolean>;
  getDashboardSnapshot: (role?: string) => Promise<{
    lowStockAlerts: LowStockAlert[];
    recentMovements: StockMovement[];
    totalProducts: number;
    totalUsers: number;
  }>;
  getInventorySnapshot: () => Promise<{
    lowStockAlerts: LowStockAlert[];
    locations: WarehouseLocation[];
    movements: StockMovement[];
    products: Product[];
    stock: StockLevel[];
    warehouses: Warehouse[];
  }>;
  getLowStockAlerts: () => Promise<LowStockAlert[]>;
  getLowStockCount: () => Promise<number>;
  listProducts: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }) => Promise<ProductListResponse>;
  lookupProduct: (query: string) => Promise<Product>;
  postInventoryMovement: (payload: StockMovementInput) => Promise<void>;
};

type DataProviderRootProps = {
  apiBaseUrl: string;
  children: ReactNode;
};

const OFFLINE_LOW_STOCK_THRESHOLD = 10;
const BACKEND_PING_INTERVAL_MS = 30_000;

const DataProviderContext = createContext<DataProviderContextValue | null>(null);

function buildOfflineUserFacingError(fallbackMessage: string, error: unknown): Error {
  return new Error(error instanceof Error ? error.message : fallbackMessage);
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
    minimumStock: 0,
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
    observation: null,
    createdAt: movement.date,
  };
}

function buildOfflineLowStockAlerts(products: Product[]): LowStockAlert[] {
  return products
    .filter((product) => product.currentStock <= OFFLINE_LOW_STOCK_THRESHOLD)
    .map((product) => ({
      ...product,
      shortage: Math.max(OFFLINE_LOW_STOCK_THRESHOLD - product.currentStock, 0),
    }));
}

async function buildOfflineInventorySnapshot(): Promise<{
  lowStockAlerts: LowStockAlert[];
  locations: WarehouseLocation[];
  movements: StockMovement[];
  products: Product[];
  stock: StockLevel[];
  warehouses: Warehouse[];
}> {
  const warehouseApi = window.api?.warehouse;

  if (!warehouseApi) {
    throw new Error("La capa local no esta disponible en esta sesion.");
  }

  const [productsResponse, warehousesResponse, movementsResponse] = await Promise.all([
    warehouseApi.getProducts(),
    warehouseApi.listWarehouses(),
    warehouseApi.getStockMovements(),
  ]);

  if (!productsResponse.success) {
    throw new Error(productsResponse.error.message || "No se pudieron cargar productos locales.");
  }

  if (!warehousesResponse.success) {
    throw new Error(warehousesResponse.error.message || "No se pudieron cargar almacenes locales.");
  }

  if (!movementsResponse.success) {
    throw new Error(movementsResponse.error.message || "No se pudieron cargar movimientos locales.");
  }

  const products = productsResponse.data.map(mapDesktopProductToShared);
  const warehouses = warehousesResponse.data.map(mapDesktopWarehouseToShared);
  const stockMatrix = await Promise.all(
    warehouses.flatMap((warehouse) =>
      products.map(async (product) => {
        const stockResponse = await warehouseApi.getWarehouseStock({
          warehouseId: warehouse.id,
          productId: product.id,
        });

        if (!stockResponse.success) {
          throw new Error(stockResponse.error.message || "No se pudo cargar stock local.");
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
    products,
    warehouses,
    locations: [],
    movements,
    stock: stockMatrix,
    lowStockAlerts: buildOfflineLowStockAlerts(products),
  };
}

function filterOfflineProducts(
  products: Product[],
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
  } = {},
): ProductListResponse {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? (products.length || 1);
  const search = params.search?.trim().toLowerCase() ?? "";

  const filteredProducts = search
    ? products.filter((product) => {
        return (
          product.name.toLowerCase().includes(search) ||
          (product.sku ?? "").toLowerCase().includes(search) ||
          (product.barcode ?? "").toLowerCase().includes(search)
        );
      })
    : products;

  const pageStart = Math.max(page - 1, 0) * pageSize;
  const items = filteredProducts.slice(pageStart, pageStart + pageSize);

  return {
    items,
    page,
    pageSize,
    total: filteredProducts.length,
  };
}

export function DataProviderRoot({ apiBaseUrl, children }: DataProviderRootProps) {
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const [isOffline, setIsOffline] = useState(false);
  const hasDesktopFallback = typeof window !== "undefined" && Boolean(window.api?.warehouse);
  const statusRequestRef = useRef<Promise<boolean> | null>(null);

  const recheckBackendAvailability = async () => {
    if (statusRequestRef.current) {
      return statusRequestRef.current;
    }

    const request = (async () => {
      try {
        await api.get("/health");
        setIsOffline(false);
        return true;
      } catch (error) {
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
  };

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
  }, [hasDesktopFallback]);

  const getOfflineInventorySnapshot = async () => {
    try {
      return await buildOfflineInventorySnapshot();
    } catch (error) {
      throw buildOfflineUserFacingError("No se pudieron cargar los datos locales.", error);
    }
  };

  const lookupOfflineProduct = async (query: string) => {
    const snapshot = await getOfflineInventorySnapshot();
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
  };

  const postOfflineInventoryMovement = async (payload: StockMovementInput) => {
    const warehouseApi = window.api?.warehouse;

    if (!warehouseApi) {
      throw new Error("La capa local no esta disponible para registrar el movimiento.");
    }

    const response = await warehouseApi.createStockMovement({
      productId: payload.productId,
      warehouseId: payload.warehouseId,
      type: payload.type === "entry" ? "in" : "out",
      quantity: payload.quantity,
      date: payload.movementDate,
    });

    if (!response.success) {
      throw new Error(response.error.message || "No se pudo registrar el movimiento local.");
    }
  };

  const getInventorySnapshot = async () => {
    if (isOffline && hasDesktopFallback) {
      return getOfflineInventorySnapshot();
    }

    try {
      const [productsResponse, warehouses, locations, movements, stock, lowStockAlerts] =
        await Promise.all([
          api.get<ProductListResponse>("/products?page=1&pageSize=100"),
          api.get<Warehouse[]>("/warehouses"),
          api.get<WarehouseLocation[]>("/locations"),
          api.get<StockMovement[]>("/inventory/movements?limit=12"),
          api.get<StockLevel[]>("/inventory/stock"),
          api.get<LowStockAlert[]>("/alerts/low-stock"),
        ]);

      setIsOffline(false);

      return {
        lowStockAlerts,
        locations,
        movements,
        products: productsResponse.items,
        stock,
        warehouses,
      };
    } catch (error) {
      if (hasDesktopFallback && error instanceof ApiError && error.status === 0) {
        setIsOffline(true);
        return getOfflineInventorySnapshot();
      }

      throw buildOfflineUserFacingError("No se pudieron cargar los datos de inventario.", error);
    }
  };

  const listProducts = async (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }) => {
    if (isOffline && hasDesktopFallback) {
      const snapshot = await getOfflineInventorySnapshot();
      return filterOfflineProducts(snapshot.products, params);
    }

    const searchParams = new URLSearchParams();

    if (params?.page) {
      searchParams.set("page", String(params.page));
    }

    if (params?.pageSize) {
      searchParams.set("pageSize", String(params.pageSize));
    }

    if (params?.search?.trim()) {
      searchParams.set("search", params.search.trim());
    }

    try {
      const response = await api.get<ProductListResponse>(
        `/products${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
      );
      setIsOffline(false);
      return response;
    } catch (error) {
      if (hasDesktopFallback && error instanceof ApiError && error.status === 0) {
        setIsOffline(true);
        const snapshot = await getOfflineInventorySnapshot();
        return filterOfflineProducts(snapshot.products, params);
      }

      throw buildOfflineUserFacingError("No se pudieron cargar los productos.", error);
    }
  };

  const lookupProduct = async (query: string) => {
    const trimmedQuery = query.trim();

    if (isOffline && hasDesktopFallback) {
      return lookupOfflineProduct(trimmedQuery);
    }

    try {
      const isBarcode = /^\d+$/.test(trimmedQuery);
      const response = await api.get<Product>(
        `/products/lookup?${isBarcode ? `barcode=${encodeURIComponent(trimmedQuery)}` : `sku=${encodeURIComponent(trimmedQuery)}`}`,
      );
      setIsOffline(false);
      return response;
    } catch (error) {
      if (hasDesktopFallback && error instanceof ApiError && error.status === 0) {
        setIsOffline(true);
        return lookupOfflineProduct(trimmedQuery);
      }

      throw buildOfflineUserFacingError("No se encontro el producto.", error);
    }
  };

  const postInventoryMovement = async (payload: StockMovementInput) => {
    if (isOffline && hasDesktopFallback) {
      return postOfflineInventoryMovement(payload);
    }

    try {
      await api.post("/inventory/movements", payload);
      setIsOffline(false);
    } catch (error) {
      if (hasDesktopFallback && error instanceof ApiError && error.status === 0) {
        setIsOffline(true);
        return postOfflineInventoryMovement(payload);
      }

      throw buildOfflineUserFacingError("No se pudo registrar el movimiento.", error);
    }
  };

  const getLowStockAlerts = async () => {
    if (isOffline && hasDesktopFallback) {
      const snapshot = await getOfflineInventorySnapshot();
      return snapshot.lowStockAlerts;
    }

    try {
      const response = await api.get<LowStockAlert[]>("/alerts/low-stock");
      setIsOffline(false);
      return response;
    } catch (error) {
      if (hasDesktopFallback && error instanceof ApiError && error.status === 0) {
        setIsOffline(true);
        const snapshot = await getOfflineInventorySnapshot();
        return snapshot.lowStockAlerts;
      }

      throw buildOfflineUserFacingError("No se pudieron cargar las alertas.", error);
    }
  };

  const getLowStockCount = async () => {
    const alerts = await getLowStockAlerts();
    return alerts.length;
  };

  const getDashboardSnapshot = async (role?: string) => {
    if (isOffline && hasDesktopFallback) {
      const snapshot = await getOfflineInventorySnapshot();
      return {
        lowStockAlerts: snapshot.lowStockAlerts,
        recentMovements: snapshot.movements,
        totalProducts: snapshot.products.length,
        totalUsers: role === "admin" ? 1 : 0,
      };
    }

    try {
      const [users, products, movements, lowStockAlerts] = await Promise.all([
        role === "admin" ? api.get<unknown[]>("/users") : Promise.resolve([]),
        api.get<ProductListResponse>("/products?page=1&pageSize=100"),
        api.get<StockMovement[]>("/inventory/movements?limit=12"),
        api.get<LowStockAlert[]>("/alerts/low-stock"),
      ]);

      setIsOffline(false);

      return {
        lowStockAlerts,
        recentMovements: movements,
        totalProducts: products.total,
        totalUsers: users.length,
      };
    } catch (error) {
      if (hasDesktopFallback && error instanceof ApiError && error.status === 0) {
        setIsOffline(true);
        const snapshot = await getOfflineInventorySnapshot();
        return {
          lowStockAlerts: snapshot.lowStockAlerts,
          recentMovements: snapshot.movements,
          totalProducts: snapshot.products.length,
          totalUsers: role === "admin" ? 1 : 0,
        };
      }

      throw buildOfflineUserFacingError("No se pudieron cargar los datos del panel.", error);
    }
  };

  const value = useMemo<DataProviderContextValue>(
    () => ({
      apiBaseUrl,
      getDashboardSnapshot,
      getInventorySnapshot,
      getLowStockAlerts,
      getLowStockCount,
      hasDesktopFallback,
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
    [apiBaseUrl, hasDesktopFallback, isOffline],
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
