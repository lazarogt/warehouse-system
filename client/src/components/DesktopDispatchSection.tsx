import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Product, StockMovement } from "../../../shared/src/types/desktop-warehouse-ipc";
import { t } from "../i18n";
import { safeDateTime, safeInteger, safeText } from "../lib/format";
import { useWarehouseContext } from "../context/WarehouseContext";
import Modal from "./Modal";
import MotionButton from "./MotionButton";
import SectionLoader from "./SectionLoader";
import SectionNotice from "./SectionNotice";
import { useToast } from "./ToastProvider";

type DesktopDispatchFormValues = {
  customer: string;
  notes: string;
  productId: string;
  quantity: string;
};

const initialFormValues: DesktopDispatchFormValues = {
  customer: "",
  notes: "",
  productId: "",
  quantity: "1",
};

function buildMovementLabel(movement: StockMovement) {
  const notes = movement.metadata?.notes?.trim();
  return notes ?? t("desktopDispatch.notesFallback");
}

export default function DesktopDispatchSection() {
  const {
    isDesktopMode,
    loading: warehouseLoading,
    selectedWarehouse,
    selectedWarehouseId,
  } = useWarehouseContext();
  const { notify } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [dispatches, setDispatches] = useState<StockMovement[]>([]);
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [currentStockLoading, setCurrentStockLoading] = useState(false);
  const [formValues, setFormValues] = useState<DesktopDispatchFormValues>(initialFormValues);

  const warehouseApi = window.api?.warehouse;
  const exportApi = window.api?.export;

  const loadDesktopDispatchData = async () => {
    if (!warehouseApi) {
      setProducts([]);
      setDispatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [productsResponse, movementsResponse] = await Promise.all([
        warehouseApi.getProducts(),
        warehouseApi.getStockMovements(
          selectedWarehouseId ? { warehouseId: selectedWarehouseId } : undefined,
        ),
      ]);

      if (!productsResponse.success) {
        throw new Error(productsResponse.error.message || "No se pudieron cargar los productos.");
      }

      if (!movementsResponse.success) {
        throw new Error(movementsResponse.error.message || "No se pudieron cargar los despachos.");
      }

      setProducts(
        [...productsResponse.data].sort((left, right) =>
          left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
        ),
      );
      setDispatches(
        movementsResponse.data.filter(
          (movement) => movement.reason === "dispatch" && movement.type === "out",
        ),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el modulo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isDesktopMode) {
      return;
    }

    void loadDesktopDispatchData();
  }, [isDesktopMode, selectedWarehouseId]);

  useEffect(() => {
    if (!warehouseApi || !selectedWarehouseId || !formValues.productId || !modalOpen) {
      setCurrentStock(null);
      setCurrentStockLoading(false);
      return;
    }

    let active = true;

    const loadStock = async () => {
      setCurrentStockLoading(true);

      try {
        const response = await warehouseApi.getWarehouseStock({
          warehouseId: selectedWarehouseId,
          productId: Number(formValues.productId),
        });

        if (!active) {
          return;
        }

        if (!response.success) {
          throw new Error(response.error.message || "No se pudo consultar el stock.");
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

    void loadStock();

    return () => {
      active = false;
    };
  }, [formValues.productId, modalOpen, selectedWarehouseId, warehouseApi]);

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.id === Number(formValues.productId)) ?? null;
  }, [formValues.productId, products]);

  const requestedQuantity = Number(formValues.quantity);

  if (!isDesktopMode) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!warehouseApi || submitting || !selectedWarehouseId) {
      return;
    }

    if (!formValues.productId) {
      notify({
        type: "error",
        title: "Producto invalido",
        message: "Selecciona un producto valido.",
      });
      return;
    }

    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
      notify({
        type: "error",
        title: "Cantidad invalida",
        message: "La cantidad debe ser mayor que 0.",
      });
      return;
    }

    if ((currentStock ?? 0) < requestedQuantity) {
      notify({
        type: "error",
        title: "Stock insuficiente",
        message: `Disponible: ${safeInteger(currentStock ?? 0)}.`,
      });
      return;
    }

    if (!formValues.customer.trim()) {
      notify({
        type: "error",
        title: "Cliente requerido",
        message: "Escribe cliente o destino.",
      });
      return;
    }

    setSubmitting(true);

    try {
      const response = await warehouseApi.dispatchProduct({
        warehouseId: selectedWarehouseId,
        productId: Number(formValues.productId),
        quantity: requestedQuantity,
        customer: formValues.customer.trim(),
        notes: formValues.notes.trim() ? formValues.notes.trim() : undefined,
      });

      if (!response.success) {
        throw new Error(response.error.message || "No se pudo registrar el despacho.");
      }

      setFormValues(initialFormValues);
      setCurrentStock(null);
      setModalOpen(false);
      await loadDesktopDispatchData();
      notify({
        type: "success",
        title: "Despacho registrado",
      });
    } catch (submitError) {
      notify({
        type: "error",
        title: "No se pudo despachar",
        message: submitError instanceof Error ? submitError.message : "Intentalo de nuevo.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async (format: "pdf" | "excel") => {
    if (!exportApi || exporting) {
      return;
    }

    setExporting(format);

    try {
      const response =
        format === "pdf"
          ? await exportApi.pdf({
              reportType: "dispatches",
              warehouseId: selectedWarehouseId ?? undefined,
            })
          : await exportApi.excel({
              reportType: "dispatches",
              warehouseId: selectedWarehouseId ?? undefined,
            });

      if (!response.success) {
        throw new Error(response.error.message || "No se pudo exportar.");
      }

      if (!response.data.canceled) {
        notify({
          type: "success",
          title: format === "pdf" ? "PDF generado" : "Excel generado",
        });
      }
    } catch (exportError) {
      notify({
        type: "error",
        title: "No se pudo exportar",
        message: exportError instanceof Error ? exportError.message : "Intentalo de nuevo.",
      });
    } finally {
      setExporting(null);
    }
  };

  if (loading && warehouseLoading) {
    return <SectionLoader label="Cargando despachos..." />;
  }

  return (
    <div className="space-y-6">
      <section className="panel-surface">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="toolbar-label text-cyan-100">{t("desktopDispatch.subtitle")}</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{t("desktopDispatch.title")}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Usa el almacen activo y confirma un despacho en una sola ventana.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <MotionButton
              onClick={() => setModalOpen(true)}
              disabled={!selectedWarehouseId}
              className="min-h-[46px] rounded-2xl bg-emerald-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Despachar
            </MotionButton>
            <MotionButton
              onClick={() => void handleExport("pdf")}
              disabled={exporting !== null}
              className="min-h-[46px] rounded-2xl border border-orange-300/20 bg-orange-500/10 px-5 text-sm font-medium text-orange-100 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting === "pdf" ? t("loading.processing") : t("common.exportPdf")}
            </MotionButton>
            <MotionButton
              onClick={() => void handleExport("excel")}
              disabled={exporting !== null}
              className="min-h-[46px] rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting === "excel" ? t("loading.processing") : t("common.exportExcel")}
            </MotionButton>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="panel-subtle p-4">
            <p className="toolbar-label">{t("warehouse.active")}</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {selectedWarehouse?.name ?? t("common.noData")}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {selectedWarehouse?.location ?? t("desktopDispatch.selectedWarehouseText")}
            </p>
          </article>
          <article className="panel-subtle p-4">
            <p className="toolbar-label">{t("sections.productos.label")}</p>
            <p className="mt-2 text-lg font-semibold text-white">{safeInteger(products.length)}</p>
            <p className="mt-1 text-sm text-slate-400">{t("sections.despacho.description")}</p>
          </article>
          <article className="panel-subtle p-4">
            <p className="toolbar-label">{t("desktopDispatch.recent")}</p>
            <p className="mt-2 text-lg font-semibold text-white">{safeInteger(dispatches.length)}</p>
            <p className="mt-1 text-sm text-slate-400">{t("sections.movimientos.description")}</p>
          </article>
        </div>

        {error ? (
          <div className="mt-5">
            <SectionNotice title="No se pudo cargar" message={error} tone="error" />
          </div>
        ) : null}

        {!selectedWarehouseId ? (
          <div className="mt-5">
            <SectionNotice
              title="Selecciona un almacen"
              message="El despacho usa siempre el almacen activo."
              tone="warning"
            />
          </div>
        ) : null}
      </section>

      <section className="panel-surface">
        <p className="toolbar-label">{t("desktopDispatch.history")}</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">{t("desktopDispatch.recent")}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Cada despacho crea un movimiento OUT con cliente y observacion.
        </p>

        <div className="table-shell mt-6 overflow-x-auto">
          <table className="table-fixed w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
                <th className="px-5 py-4 font-medium">{t("common.product")}</th>
                <th className="px-5 py-4 font-medium">{t("common.quantity")}</th>
                <th className="px-5 py-4 font-medium">{t("desktopDispatch.customer")}</th>
                <th className="px-5 py-4 font-medium">{t("common.notes")}</th>
                <th className="px-5 py-4 font-medium">{t("common.date")}</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6">
                    <div className="state-card text-center">{t("desktopDispatch.empty")}</div>
                  </td>
                </tr>
              ) : null}

              {dispatches.map((dispatch) => (
                <tr key={dispatch.id} className="border-t border-white/10 align-top hover:bg-white/[0.035]">
                  <td className="px-5 py-5 text-sm font-semibold text-white">
                    {safeText(dispatch.productName, `Producto #${dispatch.productId}`)}
                  </td>
                  <td className="px-5 py-5 text-sm text-slate-200">{safeInteger(dispatch.quantity)}</td>
                  <td className="px-5 py-5 text-sm text-slate-300">
                    {safeText(dispatch.metadata?.customer, "Sin cliente")}
                  </td>
                  <td className="px-5 py-5 text-sm text-slate-300">
                    {safeText(buildMovementLabel(dispatch))}
                  </td>
                  <td className="px-5 py-5 text-sm text-slate-300">{safeDateTime(dispatch.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!submitting) {
            setModalOpen(false);
          }
        }}
        titleId="desktop-dispatch-title"
      >
        <div className="rounded-[30px] border border-white/10 bg-slate-950 p-6 shadow-panel sm:p-8">
          <p className="toolbar-label text-emerald-100">{t("workspace.quickQuantity")}</p>
          <h3 id="desktop-dispatch-title" className="mt-2 text-2xl font-semibold text-white">
            Despachar
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Flujo corto para registrar una salida desde el almacen activo.
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="field-label">{t("common.warehouse")}</span>
              <input
                value={selectedWarehouse?.name ?? ""}
                disabled
                className="toolbar-field w-full cursor-not-allowed bg-white/[0.04] text-slate-300"
              />
            </label>

            <label className="block space-y-2">
              <span className="field-label">{t("common.product")}</span>
              <select
                autoFocus
                value={formValues.productId}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, productId: event.target.value }))
                }
                className="toolbar-field w-full"
              >
                <option value="" className="bg-slate-900">
                  Selecciona producto
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id} className="bg-slate-900">
                    {product.name} · {product.sku}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="toolbar-label">{t("inventory.availableNow")}</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {currentStockLoading ? "Consultando..." : currentStock ?? "--"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {selectedProduct
                  ? `${selectedProduct.name} en ${selectedWarehouse?.name ?? "el almacen activo"}.`
                  : "Selecciona un producto para ver stock en tiempo real."}
              </p>
            </div>

            <label className="block space-y-2">
              <span className="field-label">{t("common.quantity")}</span>
              <input
                value={formValues.quantity}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, quantity: event.target.value }))
                }
                className="toolbar-field w-full"
                inputMode="numeric"
                min="1"
                step="1"
                type="number"
              />
            </label>

            <label className="block space-y-2">
              <span className="field-label">{t("desktopDispatch.customer")}</span>
              <input
                value={formValues.customer}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, customer: event.target.value }))
                }
                className="toolbar-field w-full"
                placeholder="Ej. Cliente Mostrador"
              />
            </label>

            <label className="block space-y-2">
              <span className="field-label">{t("common.notes")}</span>
              <textarea
                value={formValues.notes}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, notes: event.target.value }))
                }
                className="toolbar-field min-h-24 w-full"
                placeholder="Detalle opcional"
              />
            </label>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
              <MotionButton
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[48px] rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Cancelar
              </MotionButton>
              <MotionButton
                type="submit"
                disabled={submitting || !selectedWarehouseId}
                className="min-h-[48px] rounded-2xl bg-emerald-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Guardando..." : "Despachar"}
              </MotionButton>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
