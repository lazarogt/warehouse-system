import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STOCK_ADJUSTMENT_TYPES,
  type Product,
  type ProductListResponse,
  type StockAdjustment,
  type StockAdjustmentInput,
  type Warehouse,
  type WarehouseLocation,
} from "../../../shared/src";
import { useAuth } from "../auth/AuthProvider";
import { safeArray } from "../lib/format";
import { useDataProvider } from "../services/data-provider";
import MotionButton from "./MotionButton";
import SectionLoader from "./SectionLoader";
import { useToast } from "./ToastProvider";

type AdjustmentsSectionProps = {
  apiBaseUrl: string;
};

type AdjustmentsState = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
  products: Product[];
  adjustments: StockAdjustment[];
};

type AdjustmentForm = {
  warehouseId: string;
  warehouseLocationId: string;
  productId: string;
  type: StockAdjustmentInput["type"];
  adjustedQuantity: string;
  reason: string;
};

const initialState: AdjustmentsState = {
  loading: true,
  saving: false,
  error: null,
  warehouses: [],
  locations: [],
  products: [],
  adjustments: [],
};

const initialForm: AdjustmentForm = {
  warehouseId: "",
  warehouseLocationId: "",
  productId: "",
  type: "correction",
  adjustedQuantity: "0",
  reason: "",
};

export default function AdjustmentsSection({ apiBaseUrl }: AdjustmentsSectionProps) {
  const { http } = useDataProvider();
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState<AdjustmentsState>(initialState);
  const [formValues, setFormValues] = useState<AdjustmentForm>(initialForm);

  const loadData = useCallback(async () => {
    try {
      const [warehouses, locations, products, adjustments] = await Promise.all([
        http.get<Warehouse[]>("/warehouses"),
        http.get<WarehouseLocation[]>("/locations"),
        http.get<ProductListResponse>("/products?page=1&pageSize=100"),
        http.get<StockAdjustment[]>("/adjustments"),
      ]);

      setState({
        loading: false,
        saving: false,
        error: null,
        warehouses: safeArray(warehouses),
        locations: safeArray(locations),
        products: safeArray(products.items),
        adjustments: safeArray(adjustments),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "No se pudieron cargar los ajustes.",
      }));
    }
  }, [http]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canCreate = currentUser?.role === "admin" || currentUser?.role === "manager";

  const availableLocations = useMemo(() => {
    if (!formValues.warehouseId) {
      return [];
    }

    return state.locations.filter(
      (location) => location.warehouseId === Number(formValues.warehouseId) && location.active,
    );
  }, [formValues.warehouseId, state.locations]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (state.saving) {
      return;
    }

    if (!formValues.warehouseId || !formValues.productId || !formValues.reason.trim()) {
      notify({
        type: "error",
        title: "Formulario incompleto",
        message: "Selecciona almacen, producto y motivo.",
      });
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    const payload: StockAdjustmentInput = {
      warehouseId: Number(formValues.warehouseId),
      warehouseLocationId: formValues.warehouseLocationId
        ? Number(formValues.warehouseLocationId)
        : null,
      productId: Number(formValues.productId),
      type: formValues.type,
      adjustedQuantity: Number(formValues.adjustedQuantity),
      reason: formValues.reason.trim(),
    };

    try {
      await http.post("/adjustments", payload);
      setFormValues(initialForm);
      notify({
        type: "success",
        title: "Ajuste registrado",
        message: "El inventario fue reconciliado y auditado correctamente.",
      });
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear el ajuste.";
      setState((current) => ({ ...current, saving: false, error: message }));
      notify({
        type: "error",
        title: "No se pudo registrar el ajuste",
        message,
      });
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  if (state.loading) {
    return <SectionLoader label="Cargando ajustes..." />;
  }

  return (
    <div className="space-y-6">
      {state.error && (
        <section className="rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {state.error}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Ajustes</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Corregir inventario real</h3>
          <p className="mt-2 text-sm text-slate-400">
            Usa este flujo para correcciones auditadas con motivo obligatorio.
          </p>

          {!canCreate && (
            <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-50">
              Tu rol actual solo puede consultar el historial de ajustes.
            </div>
          )}

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Almacen</span>
                <select
                  value={formValues.warehouseId}
                  disabled={!canCreate}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      warehouseId: event.target.value,
                      warehouseLocationId: "",
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
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
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Ubicacion</span>
                <select
                  value={formValues.warehouseLocationId}
                  disabled={!canCreate || !formValues.warehouseId}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      warehouseLocationId: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
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

            <div className="grid gap-5 md:grid-cols-[1fr,180px,180px]">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Producto</span>
                <select
                  value={formValues.productId}
                  disabled={!canCreate}
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, productId: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                >
                  <option value="" className="bg-slate-900">
                    Selecciona un producto
                  </option>
                  {state.products.map((product) => (
                    <option key={product.id} value={product.id} className="bg-slate-900">
                      {product.name} {product.sku ? `· ${product.sku}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Tipo</span>
                <select
                  value={formValues.type}
                  disabled={!canCreate}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      type: event.target.value as StockAdjustmentInput["type"],
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                >
                  {STOCK_ADJUSTMENT_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-slate-900">
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Cantidad final</span>
                <input
                  value={formValues.adjustedQuantity}
                  disabled={!canCreate}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      adjustedQuantity: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                  min="0"
                  step="1"
                  type="number"
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Motivo</span>
              <textarea
                value={formValues.reason}
                disabled={!canCreate}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, reason: event.target.value }))
                }
                className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                placeholder="Explica por que se realiza el ajuste"
              />
            </label>

            <MotionButton
              aria-label="Registrar ajuste de inventario"
              type="submit"
              disabled={state.saving || !canCreate}
              className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-60"
            >
              {state.saving ? "Registrando..." : "Registrar ajuste"}
            </MotionButton>
          </form>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Historial</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Ajustes recientes</h3>

          <div className="mt-6 space-y-3">
            {state.adjustments.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                No hay ajustes registrados.
              </div>
            )}

            {state.adjustments.map((adjustment) => (
              <article
                key={adjustment.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-semibold text-white">
                      {adjustment.productName} · {adjustment.type}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {adjustment.warehouseName}
                      {adjustment.warehouseLocationName
                        ? ` / ${adjustment.warehouseLocationName}`
                        : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {adjustment.previousQuantity} {"->"} {adjustment.adjustedQuantity} · {adjustment.createdByName}
                    </p>
                    <p className="mt-2 text-sm text-slate-300">{adjustment.reason}</p>
                  </div>
                  <span className="rounded-full bg-orange-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">
                    {new Date(adjustment.createdAt).toLocaleString()}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
