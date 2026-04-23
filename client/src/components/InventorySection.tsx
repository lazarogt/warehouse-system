import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STOCK_MOVEMENT_TYPES,
  type LowStockAlert,
  type Product,
  type ReportFormat,
  type StockLevel,
  type StockMovement,
  type StockMovementInput,
  type Warehouse,
  type WarehouseLocation,
} from "../../../shared/src";
import { t, tMovementType } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import { getErrorMessage, saveDownloadedFile } from "../lib/api";
import { safeArray, safeDateTime, safeInteger, safeText } from "../lib/format";
import { triggerAlertsRefresh } from "../utils/alerts";
import { useWarehouseContext } from "../context/WarehouseContext";
import ActionGroup from "./ActionGroup";
import GlobalLoader from "./GlobalLoader";
import MotionButton from "./MotionButton";
import SectionLoader from "./SectionLoader";
import SectionNotice from "./SectionNotice";
import { useToast } from "./ToastProvider";
import { type WarehouseScopedProduct, useDataProvider } from "../services/data-provider";

type InventorySectionProps = {
  apiBaseUrl: string;
  mode?: "inventory" | "movements";
};

type InventorySectionState = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  products: WarehouseScopedProduct[];
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
  movements: StockMovement[];
  stock: StockLevel[];
  lowStockAlerts: LowStockAlert[];
};

type MovementFormValues = {
  productId: string;
  warehouseId: string;
  warehouseLocationId: string;
  type: StockMovementInput["type"];
  quantity: string;
  movementDate: string;
  observation: string;
};

type MovementFormErrors = Partial<Record<keyof MovementFormValues, string>>;

const initialState: InventorySectionState = {
  loading: true,
  saving: false,
  error: null,
  products: [],
  warehouses: [],
  locations: [],
  movements: [],
  stock: [],
  lowStockAlerts: [],
};

const createInitialForm = (): MovementFormValues => ({
  productId: "",
  warehouseId: "",
  warehouseLocationId: "",
  type: "entry",
  quantity: "1",
  movementDate: new Date().toISOString().slice(0, 16),
  observation: "",
});

export default function InventorySection({
  apiBaseUrl,
  mode = "inventory",
}: InventorySectionProps) {
  const { user: currentUser } = useAuth();
  const { isDesktopMode, selectedWarehouseId, warehouseViewMode } = useWarehouseContext();
  const { notify } = useToast();
  const {
    getInventorySnapshot,
    http,
    isOffline,
    lookupProduct,
    postInventoryMovement,
  } = useDataProvider();
  const [state, setState] = useState<InventorySectionState>(initialState);
  const [formValues, setFormValues] = useState<MovementFormValues>(createInitialForm);
  const [formErrors, setFormErrors] = useState<MovementFormErrors>({});
  const [exportingFormat, setExportingFormat] = useState<ReportFormat | null>(null);
  const [quickLookup, setQuickLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<Product | null>(null);

  const loadInventory = useCallback(async () => {
    try {
      const inventorySnapshot = await getInventorySnapshot();

      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        products: safeArray(inventorySnapshot.products),
        warehouses: safeArray(inventorySnapshot.warehouses),
        locations: safeArray(inventorySnapshot.locations),
        movements: safeArray(inventorySnapshot.movements),
        stock: safeArray(inventorySnapshot.stock),
        lowStockAlerts: safeArray(inventorySnapshot.lowStockAlerts),
      }));
    } catch (error) {
      const message = getErrorMessage(error, "No se pudieron cargar los datos de inventario.");

      setState((current) => ({
        ...current,
        loading: false,
        error: message,
      }));
      notify({
        type: "error",
        title: "No se pudo cargar inventario",
        message,
      });
    }
  }, [getInventorySnapshot, notify]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    if (!selectedWarehouseId) {
      return;
    }

    setFormValues((current) => {
      const nextWarehouseId =
        warehouseViewMode === "selected"
          ? String(selectedWarehouseId)
          : current.warehouseId || String(selectedWarehouseId);

      if (current.warehouseId === nextWarehouseId) {
        return current;
      }

      return {
        ...current,
        warehouseId: nextWarehouseId,
        warehouseLocationId: "",
      };
    });
  }, [selectedWarehouseId, warehouseViewMode]);

  const canRegisterMovements =
    currentUser?.role === "admin" ||
    currentUser?.role === "manager" ||
    currentUser?.role === "operator";
  const canExportReports =
    currentUser?.role === "admin" || currentUser?.role === "manager";

  const selectedStock = useMemo(() => {
    if (!formValues.productId || !formValues.warehouseId) {
      return null;
    }

    const baseMatch = state.stock.find(
      (item) =>
        item.productId === Number(formValues.productId) &&
        item.warehouseId === Number(formValues.warehouseId) &&
        !item.warehouseLocationId,
    );

    if (!formValues.warehouseLocationId) {
      return baseMatch ?? null;
    }

    return (
      state.stock.find(
        (item) =>
          item.productId === Number(formValues.productId) &&
          item.warehouseId === Number(formValues.warehouseId) &&
          item.warehouseLocationId === Number(formValues.warehouseLocationId),
      ) ??
      baseMatch ??
      null
    );
  }, [formValues.productId, formValues.warehouseId, formValues.warehouseLocationId, state.stock]);

  const availableLocations = useMemo(() => {
    if (!formValues.warehouseId) {
      return [];
    }

    return state.locations.filter(
      (location) => location.warehouseId === Number(formValues.warehouseId) && location.active,
    );
  }, [formValues.warehouseId, state.locations]);

  const requestedQuantity = Number(formValues.quantity);
  const hasInsufficientStock =
    formValues.type === "exit" &&
    Number.isInteger(requestedQuantity) &&
    requestedQuantity > 0 &&
    ((!selectedStock && Boolean(formValues.productId) && Boolean(formValues.warehouseId)) ||
      requestedQuantity > (selectedStock?.quantity ?? 0));

  const criticalProductIds = useMemo(() => {
    return new Set(state.lowStockAlerts.map((item) => item.id));
  }, [state.lowStockAlerts]);

  const uniqueProducts = useMemo(() => {
    const productsById = new Map<number, WarehouseScopedProduct>();

    state.products.forEach((product) => {
      if (!productsById.has(product.id)) {
        productsById.set(product.id, product);
      }
    });

    return [...productsById.values()];
  }, [state.products]);

  const validateForm = () => {
    const nextErrors: MovementFormErrors = {};
    const quantity = Number(formValues.quantity);

    if (!formValues.productId) {
      nextErrors.productId = "Selecciona un producto.";
    }

    if (!formValues.warehouseId) {
      nextErrors.warehouseId = "Selecciona un almacen.";
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      nextErrors.quantity = "La cantidad debe ser un entero mayor a 0.";
    }

    if (!formValues.movementDate) {
      nextErrors.movementDate = "La fecha es obligatoria.";
    }

    if (
      formValues.type === "exit" &&
      selectedStock &&
      Number.isInteger(quantity) &&
      quantity > selectedStock.quantity
    ) {
      nextErrors.quantity = `Stock insuficiente. Disponible: ${selectedStock.quantity}.`;
    }

    if (formValues.type === "exit" && !selectedStock && formValues.productId && formValues.warehouseId) {
      nextErrors.quantity = "No hay stock disponible para ese producto en el almacen seleccionado.";
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (state.saving) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    try {
      await postInventoryMovement({
        productId: Number(formValues.productId),
        warehouseId: Number(formValues.warehouseId),
        warehouseLocationId: formValues.warehouseLocationId
          ? Number(formValues.warehouseLocationId)
          : null,
        type: formValues.type,
        quantity: Number(formValues.quantity),
        movementDate: new Date(formValues.movementDate).toISOString(),
        observation: formValues.observation.trim() ? formValues.observation.trim() : null,
      } satisfies StockMovementInput);

      setFormValues(createInitialForm());
      setFormErrors({});
      await loadInventory();
      triggerAlertsRefresh();
      notify({
        type: "success",
        title: "Movimiento registrado",
        message: "El inventario se actualizo correctamente.",
      });
    } catch (error) {
      const message = getErrorMessage(error, "No se pudo registrar el movimiento.");

      setState((current) => ({
        ...current,
        saving: false,
        error: message,
      }));
      notify({
        type: "error",
        title: "No se pudo registrar el movimiento",
        message,
      });
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  const handleExport = async (format: ReportFormat) => {
    if (exportingFormat) {
      return;
    }

    const desktopExportApi = window.api?.export;
    const reportType = mode === "inventory" ? "inventory" : "movements";
    const hasRows = mode === "inventory" ? state.stock.length > 0 : state.movements.length > 0;

    if (!hasRows) {
      notify({
        type: "error",
        title: "No hay datos para exportar",
        message:
          mode === "inventory"
            ? "Todavia no hay stock para exportar."
            : "Todavia no hay movimientos registrados.",
      });
      return;
    }

    setExportingFormat(format);

    try {
      if (isDesktopMode && desktopExportApi && (format === "pdf" || format === "excel")) {
        const response =
          format === "pdf"
            ? await desktopExportApi.pdf({
                reportType,
                warehouseId: selectedWarehouseId ?? undefined,
              })
            : await desktopExportApi.excel({
                reportType,
                warehouseId: selectedWarehouseId ?? undefined,
              });

        if (!response.success) {
          throw new Error(response.error.message || "No se pudo exportar.");
        }

        if (!response.data.canceled) {
          notify({
            type: "success",
            title: "Exportacion generada",
            message: `Se guardo el ${format.toUpperCase()} correctamente.`,
          });
        }

        return;
      }

      const file = await http.download(`/reports/movements/export?format=${format}`);
      saveDownloadedFile(file);
      notify({
        type: "success",
        title: "Exportacion generada",
        message: `Se descargo el reporte de movimientos en ${format.toUpperCase()}.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "No se pudo exportar movimientos",
        message: getErrorMessage(error, "Intentalo de nuevo."),
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const lowStockItems = useMemo(() => {
    return state.lowStockAlerts.slice(0, 8);
  }, [state.lowStockAlerts]);

  const handleQuickLookup = async () => {
    if (lookupLoading) {
      return;
    }

    const value = quickLookup.trim();

    if (!value) {
      notify({
        type: "error",
        title: t("common.error"),
        message: t("inventory.lookupEmpty"),
      });
      return;
    }

    setLookupLoading(true);

    try {
      const product = await lookupProduct(value);
      setLookupResult(product);
      setFormValues((current) => ({
        ...current,
        productId: String(product.id),
      }));
      notify({
        type: "success",
        title: "Producto encontrado",
        message: `${product.name} listo para operar en inventario.`,
      });
    } catch (error) {
      setLookupResult(null);
      notify({
        type: "error",
        title: "No se encontro el producto",
        message: getErrorMessage(error, "Verifica el SKU o el código de barras."),
      });
    } finally {
      setLookupLoading(false);
    }
  };

  if (state.loading) {
    return <SectionLoader label="Cargando inventario..." />;
  }

  return (
    <div className="space-y-6">
      {state.error && (
        <SectionNotice title="Error" message={state.error} tone="error" />
      )}

      {mode === "movements" && (
        <section className="rounded-[28px] border border-white/10 bg-gradient-to-br from-amber-400/15 to-orange-500/10 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-100">Trazabilidad</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Historial de movimientos</h2>
          <p className="mt-3 text-sm text-slate-200">Entradas y salidas recientes.</p>
          {isOffline && (
            <div className="mt-4 inline-flex rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100">
              {t("common.offlineMode")}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <section className="panel-surface">
          <div className="flex flex-col gap-5 border-b border-white/10 pb-5">
            <div>
              <p className="toolbar-label">{t("sections.inventario.label")}</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                {mode === "movements" ? "Registrar ajuste de movimiento" : "Registrar movimiento"}
              </h3>
              <p className="mt-2 text-sm text-slate-300">Registro operativo.</p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_auto]">
              <div className="panel-subtle p-4">
                <label className="space-y-2">
                  <span className="toolbar-label">Búsqueda rápida por SKU o código de barras</span>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      aria-label="Buscar producto por SKU o código de barras en inventario"
                      value={quickLookup}
                      onChange={(event) => setQuickLookup(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleQuickLookup();
                        }
                      }}
                      className="toolbar-field min-w-0 flex-1"
                      placeholder="Escanea o escribe SKU o código de barras"
                    />
                    <MotionButton
                      aria-label="Buscar producto rapido para inventario"
                      onClick={() => void handleQuickLookup()}
                      className="min-h-[48px] rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
                    >
                      {lookupLoading ? t("loading.processing") : t("common.search")}
                    </MotionButton>
                  </div>
                </label>

                {lookupResult && (
                  <div className="panel-subtle mt-4 border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200">
                    <p className="font-semibold text-white">{lookupResult.name}</p>
                    <p className="mt-1 text-slate-400">
                      SKU: {lookupResult.sku ?? t("common.noDefined")} | {t("common.barcode")}: {lookupResult.barcode ?? t("common.noDefined")}
                    </p>
                    <p className="mt-1 text-slate-400">
                      Stock consolidado: {lookupResult.currentStock} | Categoría: {lookupResult.categoryName}
                    </p>
                  </div>
                )}
              </div>

              {((mode === "movements" && canExportReports) ||
                (mode === "inventory" && isDesktopMode && canExportReports)) ? (
                <div className="panel-subtle flex flex-col justify-between gap-3 p-4">
                  <div>
                    <p className="toolbar-label">Acciones</p>
                    <p className="mt-2 text-sm text-slate-300">
                      {mode === "inventory"
                        ? "Exporta el inventario del almacen activo en un clic."
                        : "Descarga el historial reciente sin salir del modulo."}
                    </p>
                  </div>
                  <ActionGroup align="end">
                    <MotionButton
                      aria-label="Exportar movimientos en Excel"
                      onClick={() => void handleExport("excel")}
                      className="min-h-[44px] rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
                    >
                      Exportar Excel
                    </MotionButton>
                    <MotionButton
                      aria-label="Exportar movimientos en PDF"
                      onClick={() => void handleExport("pdf")}
                      className="min-h-[44px] rounded-2xl border border-orange-400/20 bg-orange-500/10 px-4 text-sm font-medium text-orange-100 transition hover:bg-orange-500/20"
                    >
                      Exportar PDF
                    </MotionButton>
                  </ActionGroup>
                </div>
              ) : null}
            </div>
          </div>

          {!canRegisterMovements && (
            <div className="mt-6">
              <SectionNotice
                title="Permisos"
                message="Tu rol no puede registrar movimientos en esta etapa."
                tone="warning"
              />
            </div>
          )}

          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            <section className="panel-subtle p-5">
              <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="toolbar-label">Asignacion</p>
                  <h4 className="mt-2 text-lg font-semibold text-white">Producto y destino operativo</h4>
                </div>
                <p className="text-sm text-slate-400">
                  Selecciona el producto, el almacen y la ubicacion interna si aplica.
                </p>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <label className="space-y-2">
                  <span className="field-label">Producto</span>
                  <p className="field-hint">Articulo que recibira la entrada o salida.</p>
                  <select
                    value={formValues.productId}
                    disabled={!canRegisterMovements}
                    onChange={(event) => setFormValues((current) => ({ ...current, productId: event.target.value }))}
                    className="toolbar-field w-full disabled:opacity-60"
                  >
                    <option value="" className="bg-slate-900">
                      Selecciona un producto
                    </option>
                    {uniqueProducts.map((product) => (
                      <option key={product.id} value={product.id} className="bg-slate-900">
                        {product.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.productId && <span className="text-sm text-rose-300">{formErrors.productId}</span>}
                </label>

                <label className="space-y-2">
                  <span className="field-label">Almacen</span>
                  <p className="field-hint">Base principal del movimiento.</p>
                  <select
                    value={formValues.warehouseId}
                    disabled={!canRegisterMovements}
                    onChange={(event) => setFormValues((current) => ({ ...current, warehouseId: event.target.value }))}
                    className="toolbar-field w-full disabled:opacity-60"
                  >
                    <option value="" className="bg-slate-900">
                      Selecciona un almacen
                    </option>
                    {state.warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id} className="bg-slate-900">
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.warehouseId && <span className="text-sm text-rose-300">{formErrors.warehouseId}</span>}
                </label>
              </div>

              <div className="mt-5">
                <label className="space-y-2">
                  <span className="field-label">Ubicacion interna</span>
                  <p className="field-hint">Opcional. Usa una ubicacion concreta si el flujo lo requiere.</p>
                  <select
                    value={formValues.warehouseLocationId}
                    disabled={!canRegisterMovements || !formValues.warehouseId}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        warehouseLocationId: event.target.value,
                      }))
                    }
                    className="toolbar-field w-full disabled:opacity-60"
                  >
                    <option value="" className="bg-slate-900">
                      Sin ubicacion especifica
                    </option>
                    {availableLocations.map((location) => (
                      <option key={location.id} value={location.id} className="bg-slate-900">
                        {location.code} · {location.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="panel-subtle p-5">
              <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="toolbar-label">Movimiento</p>
                  <h4 className="mt-2 text-lg font-semibold text-white">Parametros del registro</h4>
                </div>
                <p className="text-sm text-slate-400">
                  Define tipo, cantidad, fecha y nota operativa del movimiento.
                </p>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-3">
                <label className="space-y-2">
                  <span className="field-label">Tipo</span>
                  <p className="field-hint">Entrada o salida sobre el stock actual.</p>
                  <select
                    value={formValues.type}
                    disabled={!canRegisterMovements}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        type: event.target.value as StockMovementInput["type"],
                      }))
                    }
                    className="toolbar-field w-full disabled:opacity-60"
                  >
                    {STOCK_MOVEMENT_TYPES.map((type) => (
                      <option key={type} value={type} className="bg-slate-900">
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="field-label">Cantidad</span>
                  <p className="field-hint">Solo enteros positivos segun la validacion actual.</p>
                  <input
                    value={formValues.quantity}
                    disabled={!canRegisterMovements}
                    onChange={(event) => setFormValues((current) => ({ ...current, quantity: event.target.value }))}
                    className="toolbar-field w-full disabled:opacity-60"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    type="number"
                  />
                  {formErrors.quantity && <span className="text-sm text-rose-300">{formErrors.quantity}</span>}
                </label>

                <label className="space-y-2">
                  <span className="field-label">Fecha</span>
                  <p className="field-hint">Marca temporal exacta del movimiento.</p>
                  <input
                    value={formValues.movementDate}
                    disabled={!canRegisterMovements}
                    onChange={(event) =>
                      setFormValues((current) => ({ ...current, movementDate: event.target.value }))
                    }
                    className="toolbar-field w-full disabled:opacity-60"
                    type="datetime-local"
                  />
                  {formErrors.movementDate && <span className="text-sm text-rose-300">{formErrors.movementDate}</span>}
                </label>
              </div>

              <label className="mt-5 block space-y-2">
                <span className="field-label">Observacion</span>
                <p className="field-hint">Contexto adicional opcional para el equipo operativo.</p>
                <textarea
                  value={formValues.observation}
                  disabled={!canRegisterMovements}
                  onChange={(event) => setFormValues((current) => ({ ...current, observation: event.target.value }))}
                  className="toolbar-field min-h-24 w-full disabled:opacity-60"
                  placeholder="Detalle opcional del movimiento"
                />
              </label>
            </section>

            <section className="panel-subtle p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="toolbar-label">Disponibilidad</p>
                  <p className="mt-2 text-base font-semibold text-white">Stock consultado en tiempo real</p>
                </div>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  {formValues.type === "exit" ? "Validacion de salida" : "Movimiento de entrada"}
                </span>
              </div>

              <div className="panel-subtle mt-4 px-4 py-3 text-sm text-slate-200">
                <p className="font-medium text-white">Stock disponible</p>
                <p className="mt-1 text-slate-400">
                  {selectedStock
                    ? `${selectedStock.quantity} unidades en ${selectedStock.warehouseName}${selectedStock.warehouseLocationName ? ` / ${selectedStock.warehouseLocationName}` : ""}.`
                    : "Selecciona producto y almacen para consultar el stock disponible."}
                </p>
              </div>

              {hasInsufficientStock && (
                <div className="mt-4">
                  <SectionNotice
                    title="Stock insuficiente"
                    message="No puedes registrar esta salida porque el stock disponible es insuficiente."
                    tone="error"
                  />
                </div>
              )}

              <div className="mt-5 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-slate-400">
                  El movimiento se registra con el mismo flujo y validaciones actuales del modulo.
                </p>

                <MotionButton
                  aria-label="Registrar movimiento de inventario"
                  type="submit"
                  disabled={state.saving || !canRegisterMovements || hasInsufficientStock}
                  className="min-h-[48px] rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {state.saving ? "Registrando..." : "Registrar movimiento"}
                </MotionButton>
              </div>
            </section>
          </form>
        </section>

        <section className="space-y-6">
          <article className="rounded-[28px] border border-white/10 bg-gradient-to-br from-indigo-400/15 to-cyan-400/10 p-6 shadow-panel">
            <p className="toolbar-label text-cyan-100">Alertas</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Stock bajo por producto</h3>

            <div className="mt-6 space-y-3">
              {lowStockItems.length === 0 && (
                <div className="state-card">
                  No hay alertas activas segun el stock minimo configurado.
                </div>
              )}

              {lowStockItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="truncate font-semibold text-white">
                        {safeText(item.name, "Producto sin nombre")}
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        {safeText(item.categoryName, "Sin categoria")}
                        {item.sku ? ` · ${safeText(item.sku)}` : ""}
                      </p>
                      {item.warehouseName ? (
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-cyan-200">
                          {t("common.warehouse")}: {safeText(item.warehouseName)}
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-rose-500/15 px-3 py-1 text-sm font-semibold text-rose-100">
                      {safeInteger(item.currentStock)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="panel-surface">
            <p className="toolbar-label">{t("common.stock")} {t("common.current").toLowerCase()}</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Resumen operativo</h3>
            <p className="mt-2 text-sm text-slate-300">Stock priorizado.</p>

            <div className="mt-6 space-y-3">
              {state.stock.length === 0 ? (
                <div className="state-card">
                  No hay niveles de stock disponibles para mostrar en este momento.
                </div>
              ) : (
                state.stock.slice(0, 6).map((item) => (
                  <div
                    key={`${item.productId}-${item.warehouseId}`}
                    className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 ${
                      criticalProductIds.has(item.productId)
                        ? "border-rose-400/20 bg-rose-500/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div>
                      <p className="truncate text-sm font-semibold text-white">
                        {safeText(item.productName, "Producto sin nombre")}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {safeText(item.warehouseName, "Sin almacen")}
                        {item.warehouseLocationName ? ` / ${safeText(item.warehouseLocationName)}` : ""}
                      </p>
                    </div>
                    <span className="text-lg font-semibold text-white">{safeInteger(item.quantity)}</span>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>
      </div>

      <section className="panel-surface">
        <p className="toolbar-label">{t("inventory.recentMovements")}</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">Movimientos recientes</h3>
        <p className="mt-2 text-sm text-slate-300">Últimos registros.</p>

        <div className="table-shell overflow-x-auto">
          <table className="table-fixed w-full min-w-[960px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
                <th className="px-5 py-4 font-medium">Producto</th>
                <th className="px-5 py-4 font-medium">Almacen</th>
                <th className="px-5 py-4 font-medium">Tipo</th>
                <th className="px-5 py-4 font-medium">Cantidad</th>
                <th className="px-5 py-4 font-medium">Usuario</th>
                <th className="px-5 py-4 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {state.movements.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6">
                    <div className="state-card text-center">No hay movimientos registrados.</div>
                  </td>
                </tr>
              )}

              {state.movements.map((movement) => (
                <tr
                  key={movement.id}
                  className="border-t border-white/10 align-top hover:bg-white/[0.035]"
                >
                  <td className="px-5 py-5">
                    <div>
                      <p className="truncate text-sm font-semibold text-white">
                        {safeText(movement.productName, "Producto sin nombre")}
                      </p>
                      {movement.productSku && (
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-cyan-200">
                          SKU {safeText(movement.productSku)}
                        </p>
                      )}
                      {movement.observation && (
                        <p className="mt-1 break-words text-sm text-slate-400">
                          {safeText(movement.observation)}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-5 text-sm text-slate-300">
                    {safeText(movement.warehouseName, "Sin almacen")}
                    {movement.warehouseLocationName ? ` / ${safeText(movement.warehouseLocationName)}` : ""}
                  </td>
                  <td className="px-5 py-5">
                    <span className={movement.type === "entry" ? "text-emerald-300" : "text-orange-300"}>
                      {tMovementType(movement.type)}
                    </span>
                  </td>
                  <td className="px-5 py-5 text-sm text-slate-200">{safeInteger(movement.quantity)}</td>
                  <td className="px-5 py-5 text-sm text-slate-300">{safeText(movement.userName, "Usuario no disponible")}</td>
                  <td className="px-5 py-5 text-sm text-slate-300">{safeDateTime(movement.movementDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {exportingFormat && (
        <GlobalLoader fullscreen label={`Generando exportacion ${exportingFormat.toUpperCase()}...`} />
      )}
    </div>
  );
}
