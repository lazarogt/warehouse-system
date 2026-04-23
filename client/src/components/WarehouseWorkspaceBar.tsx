import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CreateProductPayload,
  Product,
} from "../../../shared/src/types/desktop-warehouse-ipc";
import { useWarehouseContext } from "../context/WarehouseContext";
import Modal from "./Modal";
import MotionButton from "./MotionButton";
import SectionNotice from "./SectionNotice";
import { useToast } from "./ToastProvider";

type QuickWarehouseFormValues = {
  name: string;
  location: string;
};

type QuickProductFormValues = {
  name: string;
  sku: string;
  initialStock: string;
};

type QuickStockFormValues = {
  productId: string;
  quantity: string;
  search: string;
};

type TransferFormValues = {
  productId: string;
  quantity: string;
  sourceId: string;
  targetId: string;
};

const initialWarehouseValues: QuickWarehouseFormValues = {
  name: "",
  location: "",
};

const initialProductValues: QuickProductFormValues = {
  name: "",
  sku: "",
  initialStock: "0",
};

const initialStockValues: QuickStockFormValues = {
  productId: "",
  quantity: "0",
  search: "",
};

const initialTransferValues: TransferFormValues = {
  productId: "",
  quantity: "1",
  sourceId: "",
  targetId: "",
};

function formatWarehouseLabel(location: string) {
  return location.trim() ? location : "Sin ubicacion";
}

export default function WarehouseWorkspaceBar() {
  const {
    availableWarehouses,
    createWarehouse,
    error,
    isDesktopMode,
    loading,
    refreshWarehouses,
    selectedWarehouse,
    selectedWarehouseId,
    selectWarehouse,
  } = useWarehouseContext();
  const { notify } = useToast();
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [stockPanelOpen, setStockPanelOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [warehouseValues, setWarehouseValues] =
    useState<QuickWarehouseFormValues>(initialWarehouseValues);
  const [productValues, setProductValues] = useState<QuickProductFormValues>(initialProductValues);
  const [stockValues, setStockValues] = useState<QuickStockFormValues>(initialStockValues);
  const [transferValues, setTransferValues] = useState<TransferFormValues>(initialTransferValues);
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [currentStockLoading, setCurrentStockLoading] = useState(false);
  const [transferSourceStock, setTransferSourceStock] = useState<number | null>(null);
  const [transferSourceStockLoading, setTransferSourceStockLoading] = useState(false);

  const loadProducts = useCallback(async () => {
    const warehouseApi = window.api?.warehouse;

    if (!warehouseApi) {
      setProducts([]);
      return;
    }

    setProductsLoading(true);

    try {
      const response = await warehouseApi.getProducts();

      if (!response.success) {
        throw new Error(response.error.message || "No se pudo cargar la lista de productos.");
      }

      setProducts(
        [...response.data].sort((left, right) =>
          left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
        ),
      );
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!stockPanelOpen && !transferModalOpen) {
      return;
    }

    void loadProducts().catch((loadError: unknown) => {
      notify({
        type: "error",
        title: "No se pudieron cargar los productos",
        message: loadError instanceof Error ? loadError.message : "Intentalo de nuevo.",
      });
    });
  }, [loadProducts, notify, stockPanelOpen, transferModalOpen]);

  useEffect(() => {
    if (!stockPanelOpen || !selectedWarehouseId || !stockValues.productId) {
      setCurrentStock(null);
      setCurrentStockLoading(false);
      return;
    }

    const warehouseApi = window.api?.warehouse;

    if (!warehouseApi) {
      setCurrentStock(null);
      setCurrentStockLoading(false);
      return;
    }

    let active = true;

    const loadCurrentStock = async () => {
      setCurrentStockLoading(true);

      try {
        const response = await warehouseApi.getWarehouseStock({
          warehouseId: selectedWarehouseId,
          productId: Number(stockValues.productId),
        });

        if (!active) {
          return;
        }

        if (!response.success) {
          throw new Error(response.error.message || "No se pudo consultar la cantidad actual.");
        }

        setCurrentStock(response.data.quantity);
      } catch {
        if (active) {
          setCurrentStock(0);
        }
      } finally {
        if (active) {
          setCurrentStockLoading(false);
        }
      }
    };

    void loadCurrentStock();

    return () => {
      active = false;
    };
  }, [selectedWarehouseId, stockPanelOpen, stockValues.productId]);

  useEffect(() => {
    if (!transferModalOpen || !transferValues.sourceId || !transferValues.productId) {
      setTransferSourceStock(null);
      setTransferSourceStockLoading(false);
      return;
    }

    const warehouseApi = window.api?.warehouse;

    if (!warehouseApi) {
      setTransferSourceStock(null);
      setTransferSourceStockLoading(false);
      return;
    }

    let active = true;

    const loadTransferSourceStock = async () => {
      setTransferSourceStockLoading(true);

      try {
        const response = await warehouseApi.getWarehouseStock({
          warehouseId: Number(transferValues.sourceId),
          productId: Number(transferValues.productId),
        });

        if (!active) {
          return;
        }

        if (!response.success) {
          throw new Error(response.error.message || "No se pudo consultar la cantidad.");
        }

        setTransferSourceStock(response.data.quantity);
      } catch {
        if (active) {
          setTransferSourceStock(0);
        }
      } finally {
        if (active) {
          setTransferSourceStockLoading(false);
        }
      }
    };

    void loadTransferSourceStock();

    return () => {
      active = false;
    };
  }, [transferModalOpen, transferValues.productId, transferValues.sourceId]);

  const filteredProducts = useMemo(() => {
    const query = stockValues.search.trim().toLowerCase();

    if (!query) {
      return products;
    }

    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query)
      );
    });
  }, [products, stockValues.search]);

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.id === Number(stockValues.productId)) ?? null;
  }, [products, stockValues.productId]);

  const selectedTransferProduct = useMemo(() => {
    return products.find((product) => product.id === Number(transferValues.productId)) ?? null;
  }, [products, transferValues.productId]);

  const handleWarehouseSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (savingWarehouse) {
      return;
    }

    if (!warehouseValues.name.trim() || !warehouseValues.location.trim()) {
      notify({
        type: "error",
        title: "Completa los datos",
        message: "Escribe nombre y ubicacion antes de guardar.",
      });
      return;
    }

    setSavingWarehouse(true);

    try {
      const warehouse = await createWarehouse({
        name: warehouseValues.name.trim(),
        location: warehouseValues.location.trim(),
      });

      setWarehouseValues(initialWarehouseValues);
      setWarehouseModalOpen(false);
      notify({
        type: "success",
        title: "Almacen listo",
        message: `${warehouse.name} quedo seleccionado para seguir trabajando.`,
      });
    } catch (submitError) {
      notify({
        type: "error",
        title: "No se pudo crear el almacen",
        message: submitError instanceof Error ? submitError.message : "Intentalo de nuevo.",
      });
    } finally {
      setSavingWarehouse(false);
    }
  };

  const handleQuickProductSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (savingProduct) {
      return;
    }

    if (!selectedWarehouseId || !selectedWarehouse) {
      notify({
        type: "error",
        title: "Selecciona un almacen",
        message: "Elige donde vas a guardar el producto primero.",
      });
      return;
    }

    const initialStock = Number(productValues.initialStock);

    if (!productValues.name.trim() || !productValues.sku.trim()) {
      notify({
        type: "error",
        title: "Completa los datos",
        message: "Escribe nombre y codigo antes de continuar.",
      });
      return;
    }

    if (!Number.isInteger(initialStock) || initialStock < 0) {
      notify({
        type: "error",
        title: "Cantidad invalida",
        message: "La cantidad inicial debe ser 0 o un numero entero positivo.",
      });
      return;
    }

    const warehouseApi = window.api?.warehouse;

    if (!warehouseApi) {
      notify({
        type: "error",
        title: "Solo disponible en escritorio",
        message: "Esta accion usa la app de escritorio.",
      });
      return;
    }

    setSavingProduct(true);

    try {
      const createPayload: CreateProductPayload = {
        name: productValues.name.trim(),
        sku: productValues.sku.trim(),
        price: 0,
        stock: 0,
      };
      const createResponse = await warehouseApi.createProduct(createPayload);

      if (!createResponse.success) {
        throw new Error(createResponse.error.message || "No se pudo crear el producto.");
      }

      if (initialStock > 0) {
        const stockResponse = await warehouseApi.createStockMovement({
          warehouseId: selectedWarehouseId,
          productId: createResponse.data.id,
          quantity: initialStock,
          type: "in",
        });

        if (!stockResponse.success) {
          throw new Error(
            stockResponse.error.message || "No se pudo guardar la cantidad inicial.",
          );
        }
      }

      setProductValues(initialProductValues);
      setProductModalOpen(false);
      await loadProducts();
      notify({
        type: "success",
        title: "Producto agregado",
        message: `${createResponse.data.name} quedo listo en ${selectedWarehouse.name}.`,
      });
    } catch (submitError) {
      notify({
        type: "error",
        title: "No se pudo crear el producto",
        message: submitError instanceof Error ? submitError.message : "Intentalo de nuevo.",
      });
    } finally {
      setSavingProduct(false);
    }
  };

  const handleStockSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (savingStock) {
      return;
    }

    if (!selectedWarehouseId || !selectedWarehouse || !stockValues.productId) {
      notify({
        type: "error",
        title: "Falta informacion",
        message: "Selecciona almacen y producto antes de guardar.",
      });
      return;
    }

    const quantity = Number(stockValues.quantity);

    if (!Number.isInteger(quantity) || quantity < 0) {
      notify({
        type: "error",
        title: "Cantidad invalida",
        message: "La cantidad debe ser 0 o un numero entero positivo.",
      });
      return;
    }

    const warehouseApi = window.api?.warehouse;

    if (!warehouseApi) {
      notify({
        type: "error",
        title: "Solo disponible en escritorio",
        message: "Esta accion usa la app de escritorio.",
      });
      return;
    }

    setSavingStock(true);

    try {
      const currentQuantity = currentStock ?? 0;
      const difference = quantity - currentQuantity;

      if (difference !== 0) {
        const response = await warehouseApi.createStockMovement({
          warehouseId: selectedWarehouseId,
          productId: Number(stockValues.productId),
          quantity: Math.abs(difference),
          type: difference > 0 ? "in" : "out",
        });

        if (!response.success) {
          throw new Error(response.error.message || "No se pudo actualizar la cantidad.");
        }
      }

      setCurrentStock(quantity);
      notify({
        type: "success",
        title: "Cantidad actualizada",
        message: `${selectedProduct?.name ?? "El producto"} quedo en ${quantity} unidades.`,
      });
    } catch (submitError) {
      notify({
        type: "error",
        title: "No se pudo guardar",
        message: submitError instanceof Error ? submitError.message : "Intentalo de nuevo.",
      });
    } finally {
      setSavingStock(false);
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshWarehouses();
    } catch (refreshError) {
      notify({
        type: "error",
        title: "No se pudo actualizar",
        message: refreshError instanceof Error ? refreshError.message : "Intentalo de nuevo.",
      });
    }
  };

  const handleOpenTransferModal = () => {
    if (!selectedWarehouseId) {
      return;
    }

    const defaultTargetWarehouse = availableWarehouses.find(
      (warehouse) => warehouse.id !== selectedWarehouseId,
    );

    setTransferValues({
      ...initialTransferValues,
      sourceId: String(selectedWarehouseId),
      targetId: defaultTargetWarehouse ? String(defaultTargetWarehouse.id) : "",
    });
    setTransferSourceStock(null);
    setTransferModalOpen(true);
  };

  const handleTransferSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (savingTransfer) {
      return;
    }

    if (
      !transferValues.sourceId ||
      !transferValues.targetId ||
      !transferValues.productId ||
      !transferValues.quantity
    ) {
      notify({
        type: "error",
        title: "Completa los datos",
        message: "Elige origen, destino, producto y cantidad.",
      });
      return;
    }

    const quantity = Number(transferValues.quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      notify({
        type: "error",
        title: "Cantidad invalida",
        message: "La cantidad debe ser mayor que 0.",
      });
      return;
    }

    if (transferValues.sourceId === transferValues.targetId) {
      notify({
        type: "error",
        title: "Destino invalido",
        message: "Elige un destino distinto.",
      });
      return;
    }

    if (transferSourceStock !== null && quantity > transferSourceStock) {
      notify({
        type: "error",
        title: "Stock insuficiente",
        message: "La cantidad supera lo disponible en origen.",
      });
      return;
    }

    const warehouseApi = window.api?.warehouse;

    if (!warehouseApi) {
      notify({
        type: "error",
        title: "Solo disponible en escritorio",
        message: "Esta accion usa la app de escritorio.",
      });
      return;
    }

    setSavingTransfer(true);

    try {
      const response = await warehouseApi.transferStock({
        sourceId: Number(transferValues.sourceId),
        targetId: Number(transferValues.targetId),
        productId: Number(transferValues.productId),
        quantity,
      });

      if (!response.success) {
        throw new Error(response.error.message || "No se pudo transferir.");
      }

      setTransferValues(initialTransferValues);
      setTransferSourceStock(null);
      setTransferModalOpen(false);
      notify({
        type: "success",
        title: "Transferencia realizada",
      });
    } catch (transferError) {
      notify({
        type: "error",
        title: "No se pudo transferir",
        message: transferError instanceof Error ? transferError.message : "Intentalo de nuevo.",
      });
    } finally {
      setSavingTransfer(false);
    }
  };

  if (!isDesktopMode) {
    return null;
  }

  return (
    <>
      <section className="panel-surface border-cyan-400/10 bg-gradient-to-br from-cyan-500/10 via-slate-950/80 to-emerald-500/10">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
              Operacion rapida
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Todo lo rapido trabaja sobre un solo almacen a la vez
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-200">
              Elige un almacen y crea productos o cantidades sin salir de la pantalla. Si vuelves a
              abrir la app, se conserva la ultima seleccion valida o se toma el primer almacen
              disponible.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <MotionButton
              aria-label="Crear almacen rapido"
              onClick={() => setWarehouseModalOpen(true)}
              className="min-h-[48px] rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
            >
              Nuevo almacen
            </MotionButton>
            <MotionButton
              aria-label="Crear producto rapido"
              onClick={() => setProductModalOpen(true)}
              disabled={!selectedWarehouseId}
              className="min-h-[48px] rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Producto rapido
            </MotionButton>
            <MotionButton
              aria-label="Abrir panel de cantidad rapida"
              onClick={() => setStockPanelOpen(true)}
              disabled={!selectedWarehouseId}
              className="min-h-[48px] rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Actualizar cantidad
            </MotionButton>
            <MotionButton
              aria-label="Transferir entre almacenes"
              onClick={handleOpenTransferModal}
              disabled={!selectedWarehouseId || availableWarehouses.length < 2}
              className="min-h-[48px] rounded-2xl border border-sky-300/20 bg-sky-500/10 px-5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Transferir
            </MotionButton>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <article className="panel-subtle p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <label className="block flex-1 space-y-2">
                <span className="toolbar-label">Almacén activo</span>
                <select
                  value={selectedWarehouseId ?? ""}
                  disabled={loading || availableWarehouses.length === 0}
                  onChange={(event) => selectWarehouse(Number(event.target.value))}
                  className="toolbar-field w-full disabled:opacity-60"
                >
                  {availableWarehouses.length === 0 ? (
                    <option value="" className="bg-slate-900">
                      {loading ? "Cargando almacenes..." : "Crea tu primer almacen"}
                    </option>
                  ) : null}
                  {availableWarehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id} className="bg-slate-900">
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>

              <MotionButton
                aria-label="Actualizar lista de almacenes"
                onClick={() => void handleRefresh()}
                className="min-h-[48px] rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Actualizar
              </MotionButton>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4">
                <p className="toolbar-label">Trabajando ahora</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {selectedWarehouse?.name ?? "Sin seleccion"}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedWarehouse
                    ? formatWarehouseLabel(selectedWarehouse.location)
                    : "Crea o elige un almacen para activar las acciones rapidas."}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4">
                <p className="toolbar-label">Regla de trabajo</p>
                <p className="mt-2 text-lg font-semibold text-white">Una sola sede por vez</p>
                <p className="mt-1 text-sm text-slate-400">
                  Producto rapido y cantidad rapida siempre se guardan en el almacen elegido.
                </p>
              </div>
            </div>
          </article>

          <article className="panel-subtle p-5">
            <p className="toolbar-label">Menos clics</p>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <p>1. Elige el almacen una vez.</p>
              <p>2. Crea el producto con nombre, codigo y cantidad inicial.</p>
              <p>3. Ajusta cantidades desde el panel sin navegar por formularios largos.</p>
            </div>
          </article>
        </div>

        {!loading && availableWarehouses.length === 0 && (
          <div className="mt-5">
            <SectionNotice
              title="Empieza creando un almacen"
              message="Las acciones rapidas necesitan al menos un almacen para funcionar."
              tone="warning"
            />
          </div>
        )}

        {error && (
          <div className="mt-5">
            <SectionNotice title="No se pudo cargar la operacion rapida" message={error} tone="error" />
          </div>
        )}
      </section>

      <Modal
        open={warehouseModalOpen}
        onClose={() => {
          if (!savingWarehouse) {
            setWarehouseModalOpen(false);
          }
        }}
        titleId="quick-warehouse-title"
      >
        <div className="rounded-[30px] border border-white/10 bg-slate-950 p-6 shadow-panel sm:p-8">
          <p className="toolbar-label text-cyan-200">Alta rapida</p>
          <h3 id="quick-warehouse-title" className="mt-2 text-2xl font-semibold text-white">
            Nuevo almacen
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Solo pide nombre y ubicacion para que el equipo empiece a trabajar.
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleWarehouseSubmit}>
            <label className="block space-y-2">
              <span className="field-label">Nombre</span>
              <input
                autoFocus
                value={warehouseValues.name}
                onChange={(event) =>
                  setWarehouseValues((current) => ({ ...current, name: event.target.value }))
                }
                className="toolbar-field w-full"
                placeholder="Ej. Almacen Centro"
              />
            </label>

            <label className="block space-y-2">
              <span className="field-label">Ubicacion</span>
              <input
                value={warehouseValues.location}
                onChange={(event) =>
                  setWarehouseValues((current) => ({ ...current, location: event.target.value }))
                }
                className="toolbar-field w-full"
                placeholder="Ej. Calle 8, local principal"
              />
            </label>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
              <MotionButton
                type="button"
                onClick={() => setWarehouseModalOpen(false)}
                className="min-h-[48px] rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Cancelar
              </MotionButton>
              <MotionButton
                type="submit"
                disabled={savingWarehouse}
                className="min-h-[48px] rounded-2xl bg-cyan-500 px-5 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingWarehouse ? "Guardando..." : "Guardar y usar"}
              </MotionButton>
            </div>
          </form>
        </div>
      </Modal>

      <Modal
        open={productModalOpen}
        onClose={() => {
          if (!savingProduct) {
            setProductModalOpen(false);
          }
        }}
        titleId="quick-product-title"
      >
        <div className="rounded-[30px] border border-white/10 bg-slate-950 p-6 shadow-panel sm:p-8">
          <p className="toolbar-label text-emerald-200">Producto rapido</p>
          <h3 id="quick-product-title" className="mt-2 text-2xl font-semibold text-white">
            Nuevo producto en una sola pantalla
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Se guarda en <span className="font-semibold text-white">{selectedWarehouse?.name ?? "el almacen elegido"}</span> con los datos minimos para operar.
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleQuickProductSubmit}>
            <label className="block space-y-2">
              <span className="field-label">Nombre del producto</span>
              <input
                autoFocus
                value={productValues.name}
                onChange={(event) =>
                  setProductValues((current) => ({ ...current, name: event.target.value }))
                }
                className="toolbar-field w-full"
                placeholder="Ej. Caja mediana"
              />
            </label>

            <label className="block space-y-2">
              <span className="field-label">Codigo</span>
              <p className="field-hint">Tu referencia corta para buscarlo despues.</p>
              <input
                value={productValues.sku}
                onChange={(event) =>
                  setProductValues((current) => ({ ...current, sku: event.target.value }))
                }
                className="toolbar-field w-full"
                placeholder="Ej. CAJ-MED-01"
              />
            </label>

            <label className="block space-y-2">
              <span className="field-label">Cantidad inicial</span>
              <p className="field-hint">
                Esta cantidad se guardara directamente en {selectedWarehouse?.name ?? "el almacen activo"}.
              </p>
              <input
                value={productValues.initialStock}
                onChange={(event) =>
                  setProductValues((current) => ({
                    ...current,
                    initialStock: event.target.value,
                  }))
                }
                className="toolbar-field w-full"
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
              />
            </label>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
              <MotionButton
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="min-h-[48px] rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Cancelar
              </MotionButton>
              <MotionButton
                type="submit"
                disabled={savingProduct || !selectedWarehouseId}
                className="min-h-[48px] rounded-2xl bg-emerald-500 px-5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProduct ? "Guardando..." : "Guardar producto"}
              </MotionButton>
            </div>
          </form>
        </div>
      </Modal>

      <Modal
        open={transferModalOpen}
        onClose={() => {
          if (!savingTransfer) {
            setTransferModalOpen(false);
          }
        }}
        titleId="transfer-stock-title"
      >
        <div className="rounded-[30px] border border-white/10 bg-slate-950 p-6 shadow-panel sm:p-8">
          <p className="toolbar-label text-sky-200">Transferencia</p>
          <h3 id="transfer-stock-title" className="mt-2 text-2xl font-semibold text-white">
            Transferir
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Mueve stock entre almacenes en un solo paso.
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleTransferSubmit}>
            <label className="block space-y-2">
              <span className="field-label">Origen</span>
              <select
                autoFocus
                value={transferValues.sourceId}
                onChange={(event) =>
                  setTransferValues((current) => ({
                    ...current,
                    sourceId: event.target.value,
                    targetId:
                      current.targetId === event.target.value ? "" : current.targetId,
                  }))
                }
                className="toolbar-field w-full"
              >
                <option value="" className="bg-slate-900">
                  Selecciona origen
                </option>
                {availableWarehouses
                  .filter((warehouse) => String(warehouse.id) !== transferValues.sourceId)
                  .map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id} className="bg-slate-900">
                      {warehouse.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="field-label">Destino</span>
              <select
                value={transferValues.targetId}
                onChange={(event) =>
                  setTransferValues((current) => ({ ...current, targetId: event.target.value }))
                }
                className="toolbar-field w-full"
              >
                <option value="" className="bg-slate-900">
                  Selecciona destino
                </option>
                {availableWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id} className="bg-slate-900">
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="field-label">Producto</span>
              <select
                value={transferValues.productId}
                disabled={productsLoading || products.length === 0}
                onChange={(event) =>
                  setTransferValues((current) => ({ ...current, productId: event.target.value }))
                }
                className="toolbar-field w-full disabled:opacity-60"
              >
                <option value="" className="bg-slate-900">
                  {productsLoading
                    ? "Cargando productos..."
                    : products.length === 0
                      ? "No hay productos"
                      : "Selecciona producto"}
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id} className="bg-slate-900">
                    {product.name} · {product.sku}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="field-label">Cantidad</span>
              <input
                value={transferValues.quantity}
                onChange={(event) =>
                  setTransferValues((current) => ({ ...current, quantity: event.target.value }))
                }
                className="toolbar-field w-full"
                inputMode="numeric"
                min="1"
                step="1"
                type="number"
              />
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="toolbar-label">Disponible</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {transferSourceStockLoading ? "Consultando..." : transferSourceStock ?? "--"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {selectedTransferProduct
                  ? `${selectedTransferProduct.name} en el origen.`
                  : "Selecciona un producto para ver lo disponible."}
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
              <MotionButton
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="min-h-[48px] rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Cancelar
              </MotionButton>
              <MotionButton
                type="submit"
                disabled={savingTransfer}
                className="min-h-[48px] rounded-2xl bg-sky-500 px-5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingTransfer ? "Guardando..." : "Transferir"}
              </MotionButton>
            </div>
          </form>
        </div>
      </Modal>

      {stockPanelOpen && (
        <div className="fixed inset-0 z-[85] bg-slate-950/70 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={() => {
              if (!savingStock) {
                setStockPanelOpen(false);
              }
            }}
          />
          <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-white/10 bg-slate-950 px-5 py-6 shadow-panel sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="toolbar-label text-orange-200">Cantidad rapida</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">Actualizar cantidad</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Todo se guarda en {selectedWarehouse?.name ?? "el almacen activo"}.
                </p>
              </div>

              <MotionButton
                aria-label="Cerrar panel de cantidad rapida"
                onClick={() => setStockPanelOpen(false)}
                className="rounded-full border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.22em] text-slate-300"
              >
                Cerrar
              </MotionButton>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleStockSubmit}>
              <label className="block space-y-2">
                <span className="field-label">Buscar producto</span>
                <input
                  autoFocus
                  value={stockValues.search}
                  onChange={(event) =>
                    setStockValues((current) => ({ ...current, search: event.target.value }))
                  }
                  className="toolbar-field w-full"
                  placeholder="Escribe nombre o codigo"
                />
              </label>

              <label className="block space-y-2">
                <span className="field-label">Producto</span>
                <select
                  value={stockValues.productId}
                  disabled={productsLoading || filteredProducts.length === 0}
                  onChange={(event) =>
                    setStockValues((current) => ({ ...current, productId: event.target.value }))
                  }
                  className="toolbar-field w-full disabled:opacity-60"
                >
                  <option value="" className="bg-slate-900">
                    {productsLoading
                      ? "Cargando productos..."
                      : filteredProducts.length === 0
                        ? "No hay productos para mostrar"
                        : "Selecciona un producto"}
                  </option>
                  {filteredProducts.map((product) => (
                    <option key={product.id} value={product.id} className="bg-slate-900">
                      {product.name} · {product.sku}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                <p className="toolbar-label">Cantidad actual</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {currentStockLoading ? "Consultando..." : currentStock ?? "--"}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {selectedProduct
                    ? `${selectedProduct.name} en ${selectedWarehouse?.name ?? "el almacen activo"}.`
                    : "Selecciona un producto para ver la cantidad actual."}
                </p>
              </div>

              <label className="block space-y-2">
                <span className="field-label">Nueva cantidad</span>
                <p className="field-hint">
                  Guarda el total final que debe quedar disponible en este almacen.
                </p>
                <input
                  value={stockValues.quantity}
                  onChange={(event) =>
                    setStockValues((current) => ({ ...current, quantity: event.target.value }))
                  }
                  className="toolbar-field w-full"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  type="number"
                />
              </label>

              <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
                <MotionButton
                  type="button"
                  onClick={() => setStockPanelOpen(false)}
                  className="min-h-[48px] rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  Cancelar
                </MotionButton>
                <MotionButton
                  type="submit"
                  disabled={savingStock || !selectedWarehouseId || !stockValues.productId}
                  className="min-h-[48px] rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingStock ? "Guardando..." : "Guardar cantidad"}
                </MotionButton>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
