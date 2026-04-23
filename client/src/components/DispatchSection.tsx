import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CreateDispatchInput,
  Dispatch,
  Product,
  ProductListResponse,
  ReportFormat,
  StockLevel,
} from "../../../shared/src";
import { useAuth } from "../auth/AuthProvider";
import { getErrorMessage, saveDownloadedFile } from "../lib/api";
import { safeArray, safeCurrency, safeDateTime, safeInteger, safeText } from "../lib/format";
import { triggerAlertsRefresh } from "../utils/alerts";
import { useDataProvider } from "../services/data-provider";
import MotionButton from "./MotionButton";
import DesktopDispatchSection from "./DesktopDispatchSection";
import SectionLoader from "./SectionLoader";
import SectionNotice from "./SectionNotice";
import { useToast } from "./ToastProvider";

type DispatchSectionProps = {
  apiBaseUrl: string;
};

type DispatchSectionState = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  products: Product[];
  stock: StockLevel[];
  dispatches: Dispatch[];
};

type DispatchFormValues = {
  manualDestination: string;
  carrierName: string;
  notes: string;
};

type DispatchLineForm = {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;
};

type DispatchLineView = DispatchLineForm & {
  quantityValue: number;
  unitPriceValue: number;
  lineTotal: number;
  availableStock: number;
  selectedProduct: Product | null;
  hasValidProduct: boolean;
  exceedsStock: boolean;
};

const initialState: DispatchSectionState = {
  loading: true,
  saving: false,
  error: null,
  products: [],
  stock: [],
  dispatches: [],
};

const initialFormValues: DispatchFormValues = {
  manualDestination: "",
  carrierName: "",
  notes: "",
};

const createLineId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createInitialLine = (): DispatchLineForm => ({
  id: createLineId(),
  productId: "",
  quantity: "1",
  unitPrice: "0.00",
});

export default function DispatchSection({ apiBaseUrl }: DispatchSectionProps) {
  if (typeof window !== "undefined" && window.api?.warehouse) {
    return <DesktopDispatchSection />;
  }

  const { http } = useDataProvider();
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState<DispatchSectionState>(initialState);
  const [formValues, setFormValues] = useState<DispatchFormValues>(initialFormValues);
  const [lines, setLines] = useState<DispatchLineForm[]>([createInitialLine()]);
  const [lastDispatch, setLastDispatch] = useState<Dispatch | null>(null);
  const [exporting, setExporting] = useState<{ dispatchId: number; format: ReportFormat } | null>(null);

  const clearSectionError = useCallback(() => {
    setState((current) => (current.error ? { ...current, error: null } : current));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [productsResponse, stock, dispatches] = await Promise.all([
        http.get<ProductListResponse>("/products?page=1&pageSize=200"),
        http.get<StockLevel[]>("/inventory/stock"),
        http.get<Dispatch[]>("/dispatches"),
      ]);

      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        products: safeArray(productsResponse.items),
        stock: safeArray(stock),
        dispatches: safeArray(dispatches),
      }));
    } catch (error) {
      const message = getErrorMessage(error, "No se pudieron cargar los datos para despacho.");

      setState((current) => ({
        ...current,
        loading: false,
        error: message,
      }));
    }
  }, [http]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreate =
    currentUser?.role === "admin" ||
    currentUser?.role === "manager" ||
    currentUser?.role === "operator";
  const canExport = currentUser?.role === "admin" || currentUser?.role === "manager";

  const productsById = useMemo(() => {
    return new Map(state.products.map((product) => [product.id, product]));
  }, [state.products]);

  const stockByProductId = useMemo(() => {
    const summary = new Map<number, number>();

    for (const item of state.stock) {
      const current = summary.get(item.productId) ?? 0;
      summary.set(item.productId, current + safeInteger(item.quantity, 0));
    }

    return summary;
  }, [state.stock]);

  const lineViews = useMemo<DispatchLineView[]>(() => {
    return lines.map((line) => {
      const productId = Number(line.productId);
      const quantityValue = Number(line.quantity);
      const unitPriceValue = Number(line.unitPrice);
      const selectedProduct = Number.isInteger(productId) ? (productsById.get(productId) ?? null) : null;
      const availableStock = selectedProduct ? stockByProductId.get(selectedProduct.id) ?? 0 : 0;
      const hasValidProduct = Boolean(selectedProduct);
      const validQuantity = Number.isFinite(quantityValue) ? quantityValue : 0;
      const validUnitPrice = Number.isFinite(unitPriceValue) ? unitPriceValue : 0;

      return {
        ...line,
        quantityValue: validQuantity,
        unitPriceValue: validUnitPrice,
        lineTotal: Number((Math.max(0, validQuantity) * Math.max(0, validUnitPrice)).toFixed(2)),
        availableStock,
        selectedProduct,
        hasValidProduct,
        exceedsStock: hasValidProduct && Number.isFinite(validQuantity) && validQuantity > availableStock,
      };
    });
  }, [lines, productsById, stockByProductId]);

  const totalUnits = useMemo(() => {
    return lineViews.reduce((sum, line) => sum + Math.max(0, line.quantityValue || 0), 0);
  }, [lineViews]);

  const totalAmount = useMemo(() => {
    return Number(lineViews.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2));
  }, [lineViews]);

  const invalidStockLines = useMemo(() => {
    return lineViews.filter((line) => line.exceedsStock);
  }, [lineViews]);

  const dispatchHistory = useMemo(() => {
    return lastDispatch
      ? [lastDispatch, ...state.dispatches.filter((dispatch) => dispatch.id !== lastDispatch.id)]
      : state.dispatches;
  }, [lastDispatch, state.dispatches]);

  useEffect(() => {
    setLines((current) =>
      current.map((line) => {
        const productId = Number(line.productId);
        const selectedProduct = Number.isInteger(productId) ? productsById.get(productId) ?? null : null;

        if (!selectedProduct) {
          return line;
        }

        const nextUnitPrice = selectedProduct.price.toFixed(2);

        return line.unitPrice === nextUnitPrice ? line : { ...line, unitPrice: nextUnitPrice };
      }),
    );
  }, [productsById]);

  const handleLineChange = useCallback(
    (lineId: string, field: keyof Omit<DispatchLineForm, "id">, value: string) => {
      clearSectionError();
      setLines((current) =>
        current.map((line) => {
          if (line.id !== lineId) {
            return line;
          }

          if (field === "productId") {
            const productId = Number(value);
            const selectedProduct = Number.isInteger(productId) ? productsById.get(productId) ?? null : null;

            return {
              ...line,
              productId: value,
              unitPrice: selectedProduct ? selectedProduct.price.toFixed(2) : "0.00",
            };
          }

          return { ...line, [field]: value };
        }),
      );
    },
    [clearSectionError, productsById],
  );

  const handleAddLine = useCallback(() => {
    clearSectionError();
    setLines((current) => [...current, createInitialLine()]);
  }, [clearSectionError]);

  const handleRemoveLine = useCallback((lineId: string) => {
    clearSectionError();
    setLines((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((line) => line.id !== lineId);
    });
  }, [clearSectionError]);

  const resetForm = useCallback(() => {
    setFormValues(initialFormValues);
    setLines([createInitialLine()]);
  }, []);

  const validateForm = useCallback(() => {
    if (!formValues.manualDestination.trim() || !formValues.carrierName.trim()) {
      return "Completa destino manual y transportista.";
    }

    if (lineViews.length === 0) {
      return "Agrega al menos una linea de despacho.";
    }

    for (const line of lineViews) {
      if (!line.hasValidProduct) {
        return "Selecciona un producto valido en cada linea.";
      }

      if (!Number.isFinite(line.quantityValue) || line.quantityValue <= 0) {
        return "La cantidad de cada linea debe ser mayor a 0.";
      }

      if (!Number.isFinite(line.unitPriceValue) || line.unitPriceValue < 0) {
        return "El precio unitario debe ser un numero valido.";
      }

      if (line.exceedsStock) {
        const productName = safeText(line.selectedProduct?.name, "producto seleccionado");
        return `Stock insuficiente para ${productName}. Disponible: ${line.availableStock}.`;
      }
    }

    return null;
  }, [formValues.carrierName, formValues.manualDestination, lineViews]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (state.saving) {
        return;
      }

      const validationMessage = validateForm();

      if (validationMessage) {
        setState((current) => ({ ...current, error: validationMessage }));
        notify({
          type: "error",
          title: "No se pudo registrar el despacho",
          message: validationMessage,
        });
        return;
      }

      const payload: CreateDispatchInput = {
        manualDestination: formValues.manualDestination.trim(),
        carrierName: formValues.carrierName.trim(),
        notes: formValues.notes.trim() ? formValues.notes.trim() : null,
        items: lineViews.map((line) => ({
          productId: Number(line.productId),
          quantity: Number(line.quantityValue),
          unitPrice: Number(line.unitPriceValue.toFixed(2)),
        })),
      };

      setState((current) => ({ ...current, saving: true, error: null }));

      try {
        const createdDispatch = await http.post<Dispatch>("/dispatches", payload);
        setLastDispatch(createdDispatch);
        resetForm();
        await loadData();
        triggerAlertsRefresh();
        notify({
          type: "success",
          title: "Despacho registrado",
          message: "El stock se actualizo correctamente y el despacho quedo guardado.",
        });
      } catch (error) {
        const message = getErrorMessage(error, "No se pudo registrar el despacho.");

        setState((current) => ({
          ...current,
          saving: false,
          error: message,
        }));
        notify({
          type: "error",
          title: "No se pudo registrar el despacho",
          message,
        });
        return;
      }

      setState((current) => ({ ...current, saving: false }));
    },
    [formValues, http, lineViews, loadData, notify, resetForm, state.saving, validateForm],
  );

  const handleExport = useCallback(
    async (dispatchId: number, format: ReportFormat) => {
      if (exporting || (format !== "pdf" && format !== "excel" && format !== "odf")) {
        return;
      }

      setExporting({ dispatchId, format });

      try {
        const file = await http.download(`/dispatches/${dispatchId}/export?format=${format}`);
        saveDownloadedFile(file);
        notify({
          type: "success",
          title: "Despacho exportado",
          message: `Se descargo el despacho #${dispatchId} en ${format.toUpperCase()}.`,
        });
      } catch (error) {
        notify({
          type: "error",
          title: "No se pudo exportar el despacho",
          message: getErrorMessage(error, "Intentalo de nuevo."),
        });
      } finally {
        setExporting(null);
      }
    },
    [exporting, http, notify],
  );

  if (state.loading) {
    return <SectionLoader label="Cargando modulo de despacho..." />;
  }

  return (
    <div className="space-y-6">
      {state.error && <SectionNotice title="Error" message={state.error} tone="error" />}

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <section className="panel-surface">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="toolbar-label">Despacho</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Registrar salida operativa</h3>
              <p className="mt-2 text-sm text-slate-400">
                Crea despachos hacia puntos de venta o destinos externos. Al confirmar, el stock se
                descuenta automaticamente.
              </p>
            </div>

            <div className="panel-subtle px-4 py-3 text-right">
              <p className="toolbar-label">Total actual</p>
              <p className="mt-2 text-2xl font-semibold text-white">{safeCurrency(totalAmount)}</p>
              <p className="mt-1 text-xs text-slate-400">{totalUnits} unidades en el despacho</p>
            </div>
          </div>

          {!canCreate && (
            <div className="mt-6">
              <SectionNotice
                title="Acceso restringido"
                message="Tu rol actual solo puede consultar esta seccion."
                tone="warning"
              />
            </div>
          )}

          <form className="mt-6 space-y-6" onSubmit={(event) => void handleSubmit(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="field-label">Destino</span>
                <input
                  value={formValues.manualDestination}
                  onChange={(event) => {
                    clearSectionError();
                    setFormValues((current) => ({
                      ...current,
                      manualDestination: event.target.value,
                    }));
                  }}
                  className="toolbar-field w-full disabled:opacity-60"
                  placeholder="Ej. Cafeteria central"
                  disabled={!canCreate || state.saving}
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="field-label">Transportista</span>
                <input
                  value={formValues.carrierName}
                  onChange={(event) => {
                    clearSectionError();
                    setFormValues((current) => ({
                      ...current,
                      carrierName: event.target.value,
                    }));
                  }}
                  className="toolbar-field w-full disabled:opacity-60"
                  placeholder="Nombre del responsable"
                  disabled={!canCreate || state.saving}
                  required
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="field-label">Observaciones</span>
              <textarea
                value={formValues.notes}
                onChange={(event) => {
                  clearSectionError();
                  setFormValues((current) => ({
                    ...current,
                    notes: event.target.value,
                  }));
                }}
                className="toolbar-field min-h-28 w-full disabled:opacity-60"
                placeholder="Notas internas del despacho"
                disabled={!canCreate || state.saving}
              />
            </label>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="field-label">Lineas del despacho</p>
                  <p className="field-hint">
                    Define producto, cantidad y precio unitario para calcular el total en vivo.
                  </p>
                </div>

                <MotionButton
                  aria-label="Agregar linea al despacho"
                  onClick={handleAddLine}
                  disabled={!canCreate || state.saving}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Agregar linea
                </MotionButton>
              </div>

              <div className="space-y-4">
                {lineViews.map((line, index) => (
                  <article
                    key={line.id}
                    className="panel-subtle grid gap-4 p-4 lg:grid-cols-[minmax(0,2fr),120px,140px,auto]"
                  >
                    <label className="space-y-2">
                      <span className="toolbar-label">Producto #{index + 1}</span>
                      <select
                        value={line.productId}
                        onChange={(event) =>
                          handleLineChange(line.id, "productId", event.target.value)
                        }
                        className="toolbar-field w-full disabled:opacity-60"
                        disabled={!canCreate || state.saving}
                      >
                        <option value="">Selecciona un producto</option>
                        {state.products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                            {product.sku ? ` · ${product.sku}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="field-hint">
                        Stock disponible: {safeInteger(line.availableStock, 0)} unidades
                      </p>
                    </label>

                    <label className="space-y-2">
                      <span className="toolbar-label">Cantidad</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={line.quantity}
                        onChange={(event) =>
                          handleLineChange(line.id, "quantity", event.target.value)
                        }
                        className="toolbar-field w-full disabled:opacity-60"
                        disabled={!canCreate || state.saving}
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="toolbar-label">Precio unitario</span>
                      <input
                        value={line.unitPrice}
                        readOnly
                        aria-readonly="true"
                        className="toolbar-field w-full cursor-not-allowed bg-white/[0.04] text-slate-300 disabled:opacity-60"
                        disabled
                      />
                      <p className="field-hint">Se toma automaticamente del precio actual del producto.</p>
                    </label>

                    <div className="flex flex-col justify-between gap-3">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
                        <p className="toolbar-label">Subtotal</p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {safeCurrency(line.lineTotal)}
                        </p>
                        {line.exceedsStock ? (
                          <p className="mt-2 text-xs text-rose-300">
                            La cantidad supera el stock disponible.
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">
                            Disponible: {safeInteger(line.availableStock, 0)}
                          </p>
                        )}
                      </div>

                      <MotionButton
                        aria-label={`Eliminar linea ${index + 1}`}
                        onClick={() => handleRemoveLine(line.id)}
                        disabled={!canCreate || state.saving || lines.length === 1}
                        className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Eliminar linea
                      </MotionButton>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            {invalidStockLines.length > 0 && (
              <SectionNotice
                title="Stock insuficiente"
                message="Una o mas lineas superan el stock disponible. Ajusta las cantidades antes de confirmar."
                tone="warning"
              />
            )}

            <div className="flex flex-col gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="toolbar-label">Resumen del despacho</p>
                <p className="mt-2 text-lg font-semibold text-white">{safeCurrency(totalAmount)}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {lineViews.length} lineas · {totalUnits} unidades totales
                </p>
              </div>

              <MotionButton
                type="submit"
                aria-label="Confirmar despacho"
                disabled={!canCreate || state.saving}
                className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.saving ? "Registrando despacho..." : "Confirmar despacho"}
              </MotionButton>
            </div>
          </form>
        </section>

        <div className="space-y-6">
          <section className="panel-surface">
            <p className="toolbar-label text-emerald-100">Control operativo</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <article className="panel-subtle p-4">
                <p className="toolbar-label">Productos disponibles</p>
                <p className="mt-2 text-2xl font-semibold text-white">{state.products.length}</p>
                <p className="mt-1 text-sm text-slate-400">Catalogo listo para despachar.</p>
              </article>

              <article className="panel-subtle p-4">
                <p className="toolbar-label">Lineas activas</p>
                <p className="mt-2 text-2xl font-semibold text-white">{lineViews.length}</p>
                <p className="mt-1 text-sm text-slate-400">Puedes combinar multiples productos.</p>
              </article>

              <article className="panel-subtle p-4">
                <p className="toolbar-label">Stock comprometido</p>
                <p className="mt-2 text-2xl font-semibold text-white">{totalUnits}</p>
                <p className="mt-1 text-sm text-slate-400">Se descontara al registrar el despacho.</p>
              </article>
            </div>
          </section>

          <section className="panel-surface">
            <p className="toolbar-label text-cyan-100">Ultimo despacho creado</p>
            {lastDispatch ? (
              <>
                <h4 className="mt-2 text-xl font-semibold text-white">
                  #{lastDispatch.id} · {safeText(lastDispatch.manualDestination)}
                </h4>
                <div className="mt-5 space-y-3 text-sm text-slate-300">
                  <p>
                    <span className="text-slate-500">Transportista:</span>{" "}
                    {safeText(lastDispatch.carrierName)}
                  </p>
                  <p>
                    <span className="text-slate-500">Total:</span> {safeCurrency(lastDispatch.totalAmount)}
                  </p>
                  <p>
                    <span className="text-slate-500">Lineas:</span>{" "}
                    {safeInteger(lastDispatch.items.length, 0)}
                  </p>
                  <p>
                    <span className="text-slate-500">Observaciones:</span>{" "}
                    {safeText(lastDispatch.notes, "Sin observaciones")}
                  </p>
                </div>
              </>
            ) : (
              <div className="mt-4 state-card">
                El primer despacho que registres aparecera aqui como confirmacion rapida de la
                operacion.
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="panel-surface">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="toolbar-label">Historial de despachos</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Despachos recientes</h3>
            <p className="mt-2 text-sm text-slate-300">
              Consulta el historial dentro del mismo modulo y exporta cada despacho en formato profesional.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {dispatchHistory.length === 0 ? (
            <div className="state-card">Todavia no hay despachos registrados.</div>
          ) : (
            dispatchHistory.map((dispatch) => (
              <article key={dispatch.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h4 className="text-lg font-semibold text-white">
                        Despacho #{dispatch.id}
                      </h4>
                      <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-100">
                        {safeDateTime(dispatch.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-200">
                      <span className="text-slate-500">Destino:</span>{" "}
                      {safeText(dispatch.manualDestination)}
                    </p>
                    <p className="text-sm text-slate-200">
                      <span className="text-slate-500">Transportista:</span>{" "}
                      {safeText(dispatch.carrierName)}
                    </p>
                    <p className="text-sm text-slate-200">
                      <span className="text-slate-500">Observaciones:</span>{" "}
                      {safeText(dispatch.notes, "Sin observaciones")}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 lg:items-end">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-right">
                      <p className="toolbar-label">Total general</p>
                      <p className="mt-2 text-xl font-semibold text-white">
                        {safeCurrency(dispatch.totalAmount)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {safeInteger(dispatch.items.length, 0)} lineas
                      </p>
                    </div>

                    {canExport && (
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {(["pdf", "excel", "odf"] as ReportFormat[]).map((format) => (
                          <MotionButton
                            key={`${dispatch.id}-${format}`}
                            aria-label={`Exportar despacho ${dispatch.id} en ${format}`}
                            onClick={() => void handleExport(dispatch.id, format)}
                            disabled={Boolean(exporting)}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {exporting?.dispatchId === dispatch.id && exporting.format === format
                              ? `Generando ${format.toUpperCase()}...`
                              : format.toUpperCase()}
                          </MotionButton>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="table-fixed w-full min-w-[720px]">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
                        <th className="px-4 py-3 font-medium">Producto</th>
                        <th className="px-4 py-3 font-medium text-right">Cantidad</th>
                        <th className="px-4 py-3 font-medium text-right">Precio unitario</th>
                        <th className="px-4 py-3 font-medium text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatch.items.map((item) => (
                        <tr key={item.id} className="border-t border-white/10">
                          <td className="px-4 py-4 text-sm text-white">
                            {safeText(item.productName)}
                            {item.productSku ? (
                              <span className="ml-2 text-xs uppercase tracking-[0.18em] text-cyan-200">
                                {safeText(item.productSku)}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 text-right text-sm text-slate-200">
                            {safeInteger(item.quantity, 0)}
                          </td>
                          <td className="px-4 py-4 text-right text-sm text-slate-200">
                            {safeCurrency(item.unitPrice)}
                          </td>
                          <td className="px-4 py-4 text-right text-sm font-semibold text-white">
                            {safeCurrency(item.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
