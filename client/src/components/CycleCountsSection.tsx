import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CreateCycleCountInput,
  CycleCount,
  CycleCountItem,
  Product,
  ProductListResponse,
  Warehouse,
  WarehouseLocation,
} from "../../../shared/src";
import { useAuth } from "../auth/AuthProvider";
import { createApiClient } from "../lib/api";
import { safeArray } from "../lib/format";
import ConfirmDialog from "./ConfirmDialog";
import MotionButton from "./MotionButton";
import SectionLoader from "./SectionLoader";
import { useToast } from "./ToastProvider";

type CycleCountsSectionProps = {
  apiBaseUrl: string;
};

type CycleCountsState = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
  products: Product[];
  counts: CycleCount[];
};

const initialState: CycleCountsState = {
  loading: true,
  saving: false,
  error: null,
  warehouses: [],
  locations: [],
  products: [],
  counts: [],
};

export default function CycleCountsSection({ apiBaseUrl }: CycleCountsSectionProps) {
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState<CycleCountsState>(initialState);
  const [selectedCountId, setSelectedCountId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({
    warehouseId: "",
    warehouseLocationId: "",
    notes: "",
  });
  const [newItemProductId, setNewItemProductId] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    count: CycleCount;
    action: "start" | "complete" | "cancel";
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [warehouses, locations, products, counts] = await Promise.all([
        api.get<Warehouse[]>("/warehouses"),
        api.get<WarehouseLocation[]>("/locations"),
        api.get<ProductListResponse>("/products?page=1&pageSize=100"),
        api.get<CycleCount[]>("/cycle-counts"),
      ]);

      setState({
        loading: false,
        saving: false,
        error: null,
        warehouses: safeArray(warehouses),
        locations: safeArray(locations),
        products: safeArray(products.items),
        counts: safeArray(counts),
      });

      if (!selectedCountId && counts[0]) {
        setSelectedCountId(counts[0].id);
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "No se pudieron cargar los conteos.",
      }));
    }
  }, [api, selectedCountId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canManage = currentUser?.role === "admin" || currentUser?.role === "manager";

  const availableLocations = useMemo(() => {
    if (!createForm.warehouseId) {
      return [];
    }

    return state.locations.filter(
      (location) => location.warehouseId === Number(createForm.warehouseId) && location.active,
    );
  }, [createForm.warehouseId, state.locations]);

  const selectedCount =
    state.counts.find((count) => count.id === selectedCountId) ?? state.counts[0] ?? null;

  const handleCreateCount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (state.saving) {
      return;
    }

    if (!createForm.warehouseId) {
      notify({
        type: "error",
        title: "Formulario incompleto",
        message: "Selecciona un almacen para el conteo.",
      });
      return;
    }

    setState((current) => ({ ...current, saving: true }));

    const payload: CreateCycleCountInput = {
      warehouseId: Number(createForm.warehouseId),
      warehouseLocationId: createForm.warehouseLocationId
        ? Number(createForm.warehouseLocationId)
        : null,
      notes: createForm.notes.trim() ? createForm.notes.trim() : null,
    };

    try {
      const created = await api.post<CycleCount>("/cycle-counts", payload);
      setCreateForm({ warehouseId: "", warehouseLocationId: "", notes: "" });
      setSelectedCountId(created.id);
      notify({
        type: "success",
        title: "Conteo creado",
        message: `El conteo #${created.id} ya esta listo para preparar items.`,
      });
      await loadData();
    } catch (error) {
      notify({
        type: "error",
        title: "No se pudo crear el conteo",
        message: error instanceof Error ? error.message : "Intentalo de nuevo.",
      });
      setState((current) => ({ ...current, saving: false }));
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  const handleAddItem = async () => {
    if (!selectedCount || !newItemProductId || state.saving) {
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    try {
      await api.post(`/cycle-counts/${selectedCount.id}/items`, {
        productId: Number(newItemProductId),
      });
      setNewItemProductId("");
      notify({
        type: "success",
        title: "Item agregado",
        message: "El producto ya forma parte del conteo.",
      });
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        saving: false,
        error: error instanceof Error ? error.message : "No se pudo agregar el item.",
      }));
      notify({
        type: "error",
        title: "No se pudo agregar el item",
        message: error instanceof Error ? error.message : "Intentalo de nuevo.",
      });
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  const handleUpdateItem = async (item: CycleCountItem, countedQuantity: number) => {
    if (!selectedCount || state.saving) {
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    try {
      await api.patch(`/cycle-counts/${selectedCount.id}/items/${item.id}`, {
        countedQuantity,
        resolved: countedQuantity === item.expectedQuantity,
      });
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        saving: false,
        error: error instanceof Error ? error.message : "No se pudo actualizar el conteo.",
      }));
      notify({
        type: "error",
        title: "No se pudo actualizar el conteo",
        message: error instanceof Error ? error.message : "Intentalo de nuevo.",
      });
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  const handleCountAction = async () => {
    if (!pendingAction || state.saving) {
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    try {
      if (pendingAction.action === "complete") {
        await api.patch(`/cycle-counts/${pendingAction.count.id}/complete`, {
          applyAdjustments: true,
        });
      } else {
        await api.patch(`/cycle-counts/${pendingAction.count.id}/${pendingAction.action}`, {});
      }

      notify({
        type: "success",
        title: "Conteo actualizado",
        message: `El conteo #${pendingAction.count.id} paso por ${pendingAction.action}.`,
      });
      setPendingAction(null);
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        saving: false,
        error: error instanceof Error ? error.message : "No se pudo actualizar el conteo.",
      }));
      notify({
        type: "error",
        title: "No se pudo actualizar el conteo",
        message: error instanceof Error ? error.message : "Intentalo de nuevo.",
      });
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  if (state.loading) {
    return <SectionLoader label="Cargando conteos..." />;
  }

  return (
    <div className="space-y-6">
      {state.error && (
        <section className="rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {state.error}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Conteos ciclicos</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Auditar stock fisico</h3>
          <p className="mt-2 text-sm text-slate-400">
            Inicia conteos por almacen o ubicacion y resuelve diferencias con trazabilidad.
          </p>

          {!canManage && (
            <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-50">
              Tu rol actual solo puede consultar los conteos existentes.
            </div>
          )}

          <form className="mt-6 space-y-5" onSubmit={handleCreateCount}>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Almacen</span>
                <select
                  value={createForm.warehouseId}
                  disabled={!canManage}
                  onChange={(event) =>
                    setCreateForm((current) => ({
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
                  value={createForm.warehouseLocationId}
                  disabled={!canManage || !createForm.warehouseId}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      warehouseLocationId: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                >
                  <option value="" className="bg-slate-900">
                    Todo el almacen
                  </option>
                  {availableLocations.map((location) => (
                    <option key={location.id} value={location.id} className="bg-slate-900">
                      {location.code} · {location.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Notas</span>
              <textarea
                value={createForm.notes}
                disabled={!canManage}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, notes: event.target.value }))
                }
                className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                placeholder="Alcance del conteo, turno o comentario operativo"
              />
            </label>

            <MotionButton
              aria-label="Crear conteo ciclico"
              type="submit"
              disabled={state.saving || !canManage}
              className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-60"
            >
              {state.saving ? "Creando..." : "Crear conteo"}
            </MotionButton>
          </form>

          <div className="mt-6 space-y-3">
            {state.counts.map((count) => (
              <button
                key={count.id}
                type="button"
                onClick={() => setSelectedCountId(count.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selectedCount?.id === count.id
                    ? "border-cyan-300/40 bg-cyan-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <p className="font-semibold text-white">Conteo #{count.id}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {count.warehouseName}
                  {count.warehouseLocationName ? ` / ${count.warehouseLocationName}` : ""}
                </p>
                <p className="mt-1 text-sm text-slate-400">{count.status}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Detalle</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            {selectedCount ? `Conteo #${selectedCount.id}` : "Selecciona un conteo"}
          </h3>

          {!selectedCount && (
            <p className="mt-4 text-sm text-slate-300">
              No hay conteos disponibles todavia. Crea uno para empezar a auditar existencias.
            </p>
          )}

          {selectedCount && (
            <div className="mt-6 space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                <p className="font-semibold text-white">
                  {selectedCount.warehouseName}
                  {selectedCount.warehouseLocationName
                    ? ` / ${selectedCount.warehouseLocationName}`
                    : ""}
                </p>
                <p className="mt-1">Estado: {selectedCount.status}</p>
                {selectedCount.notes && <p className="mt-2">{selectedCount.notes}</p>}
              </div>

              {canManage && selectedCount.status !== "completed" && selectedCount.status !== "cancelled" && (
                <div className="grid gap-3 md:grid-cols-[1fr,160px]">
                  <select
                    value={newItemProductId}
                    onChange={(event) => setNewItemProductId(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  >
                    <option value="" className="bg-slate-900">
                      Agregar producto al conteo
                    </option>
                    {state.products.map((product) => (
                      <option key={product.id} value={product.id} className="bg-slate-900">
                        {product.name} {product.sku ? `· ${product.sku}` : ""}
                      </option>
                    ))}
                  </select>
                  <MotionButton
                    aria-label="Agregar item al conteo"
                    onClick={() => void handleAddItem()}
                    className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
                  >
                    Agregar item
                  </MotionButton>
                </div>
              )}

              <div className="space-y-3">
                {selectedCount.items.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    No hay items en este conteo.
                  </div>
                )}

                {selectedCount.items.map((item, index) => (
                  <motion.article
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: index * 0.03 }}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          {item.productName} {item.productSku ? `· ${item.productSku}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          Esperado: {item.expectedQuantity}
                          {item.countedQuantity !== null ? ` · Contado: ${item.countedQuantity}` : ""}
                          {item.difference !== null ? ` · Diferencia: ${item.difference}` : ""}
                        </p>
                      </div>

                      {canManage && selectedCount.status !== "completed" && selectedCount.status !== "cancelled" ? (
                        <input
                          aria-label={`Cantidad contada para ${item.productName}`}
                          defaultValue={item.countedQuantity ?? item.expectedQuantity}
                          onBlur={(event) => {
                            const countedQuantity = Number(event.target.value);
                            if (Number.isInteger(countedQuantity) && countedQuantity >= 0) {
                              void handleUpdateItem(item, countedQuantity);
                            }
                          }}
                          className="w-32 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                          min="0"
                          step="1"
                          type="number"
                        />
                      ) : (
                        <span className="rounded-full bg-slate-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                          {item.resolved ? "Resuelto" : "Pendiente"}
                        </span>
                      )}
                    </div>
                  </motion.article>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {canManage && selectedCount.status === "draft" && (
                  <MotionButton
                    aria-label={`Iniciar conteo ${selectedCount.id}`}
                    onClick={() => setPendingAction({ count: selectedCount, action: "start" })}
                    className="rounded-xl border border-cyan-400/20 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/10"
                  >
                    Iniciar
                  </MotionButton>
                )}

                {canManage &&
                  (selectedCount.status === "draft" || selectedCount.status === "in_progress") && (
                    <>
                      <MotionButton
                        aria-label={`Completar conteo ${selectedCount.id}`}
                        onClick={() => setPendingAction({ count: selectedCount, action: "complete" })}
                        className="rounded-xl border border-emerald-400/20 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/10"
                      >
                        Completar y ajustar
                      </MotionButton>
                      <MotionButton
                        aria-label={`Cancelar conteo ${selectedCount.id}`}
                        onClick={() => setPendingAction({ count: selectedCount, action: "cancel" })}
                        className="rounded-xl border border-rose-400/20 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/10"
                      >
                        Cancelar
                      </MotionButton>
                    </>
                  )}
              </div>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title="Confirmar accion"
        description={
          pendingAction
            ? `Vas a ${pendingAction.action} el conteo #${pendingAction.count.id}.`
            : ""
        }
        confirmLabel="Confirmar"
        confirming={false}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void handleCountAction()}
      />
    </div>
  );
}
