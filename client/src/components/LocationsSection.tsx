import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WAREHOUSE_LOCATION_TYPES,
  type Warehouse,
  type WarehouseLocation,
  type WarehouseLocationInput,
} from "../../../shared/src";
import { useAuth } from "../auth/AuthProvider";
import { createApiClient } from "../lib/api";
import { safeArray } from "../lib/format";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import MotionButton from "./MotionButton";
import SectionLoader from "./SectionLoader";
import { useToast } from "./ToastProvider";

type LocationsSectionProps = {
  apiBaseUrl: string;
};

type LocationsState = {
  loading: boolean;
  saving: boolean;
  deletingId: number | null;
  error: string | null;
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
};

type FormValues = {
  warehouseId: string;
  code: string;
  name: string;
  type: WarehouseLocation["type"];
  parentLocationId: string;
  active: boolean;
};

const initialState: LocationsState = {
  loading: true,
  saving: false,
  deletingId: null,
  error: null,
  warehouses: [],
  locations: [],
};

const createInitialForm = (location?: WarehouseLocation | null): FormValues => ({
  warehouseId: location ? String(location.warehouseId) : "",
  code: location?.code ?? "",
  name: location?.name ?? "",
  type: location?.type ?? "zone",
  parentLocationId: location?.parentLocationId ? String(location.parentLocationId) : "",
  active: location?.active ?? true,
});

export default function LocationsSection({ apiBaseUrl }: LocationsSectionProps) {
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState<LocationsState>(initialState);
  const [showForm, setShowForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<WarehouseLocation | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WarehouseLocation | null>(null);
  const [formValues, setFormValues] = useState<FormValues>(createInitialForm());
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [warehouses, locations] = await Promise.all([
        api.get<Warehouse[]>("/warehouses"),
        api.get<WarehouseLocation[]>("/locations"),
      ]);

      setState({
        loading: false,
        saving: false,
        deletingId: null,
        error: null,
        warehouses: safeArray(warehouses),
        locations: safeArray(locations),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "No se pudieron cargar las ubicaciones.",
      }));
    }
  }, [api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setFormValues(createInitialForm(editingLocation));
    setFormError(null);
  }, [editingLocation, showForm]);

  const canManage = currentUser?.role === "admin" || currentUser?.role === "manager";

  const filteredParentOptions = useMemo(() => {
    if (!formValues.warehouseId) {
      return [];
    }

    return state.locations.filter(
      (location) =>
        location.warehouseId === Number(formValues.warehouseId) &&
        location.id !== editingLocation?.id,
    );
  }, [editingLocation?.id, formValues.warehouseId, state.locations]);

  const groupedLocations = useMemo(() => {
    return state.warehouses.map((warehouse) => ({
      warehouse,
      locations: state.locations.filter((location) => location.warehouseId === warehouse.id),
    }));
  }, [state.locations, state.warehouses]);

  const handleOpenCreate = () => {
    setEditingLocation(null);
    setShowForm(true);
  };

  const handleOpenEdit = (location: WarehouseLocation) => {
    setEditingLocation(location);
    setShowForm(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (state.saving) {
      return;
    }

    if (!formValues.warehouseId || !formValues.code.trim() || !formValues.name.trim()) {
      setFormError("Completa almacen, codigo y nombre.");
      return;
    }

    setState((current) => ({ ...current, saving: true }));
    setFormError(null);

    const payload: WarehouseLocationInput = {
      warehouseId: Number(formValues.warehouseId),
      code: formValues.code.trim(),
      name: formValues.name.trim(),
      type: formValues.type,
      parentLocationId: formValues.parentLocationId ? Number(formValues.parentLocationId) : null,
      active: formValues.active,
    };

    try {
      if (editingLocation) {
        await api.put(`/locations/${editingLocation.id}`, payload);
        notify({
          type: "success",
          title: "Ubicacion actualizada",
          message: `${payload.name} se actualizo correctamente.`,
        });
      } else {
        await api.post("/locations", payload);
        notify({
          type: "success",
          title: "Ubicacion creada",
          message: `${payload.name} ya esta disponible para operar.`,
        });
      }

      setShowForm(false);
      setEditingLocation(null);
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la ubicacion.";
      setFormError(message);
      notify({
        type: "error",
        title: "No se pudo guardar la ubicacion",
        message,
      });
      setState((current) => ({ ...current, saving: false }));
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || state.deletingId !== null) {
      return;
    }

    setState((current) => ({ ...current, deletingId: pendingDelete.id }));

    try {
      await api.delete(`/locations/${pendingDelete.id}`);
      notify({
        type: "success",
        title: "Ubicacion eliminada",
        message: `${pendingDelete.name} ya no forma parte del arbol interno.`,
      });
      setPendingDelete(null);
      await loadData();
    } catch (error) {
      notify({
        type: "error",
        title: "No se pudo eliminar la ubicacion",
        message: error instanceof Error ? error.message : "Intentalo de nuevo.",
      });
      setState((current) => ({ ...current, deletingId: null }));
    }
  };

  if (state.loading) {
    return <SectionLoader label="Cargando ubicaciones..." />;
  }

  return (
    <div className="space-y-6">
      {state.error && (
        <section className="rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {state.error}
        </section>
      )}

      {!canManage && (
        <section className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-50">
          Tu rol puede consultar ubicaciones, pero no crear ni modificar la estructura interna.
        </section>
      )}

      <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Ubicaciones</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Mapa interno por almacen</h3>
            <p className="mt-2 text-sm text-slate-400">
              Administra zonas, racks, bins y otras ubicaciones operativas sin hardcodear industria.
            </p>
          </div>

          {canManage && (
            <MotionButton
              aria-label="Crear nueva ubicacion"
              onClick={handleOpenCreate}
              className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400"
            >
              Nueva ubicacion
            </MotionButton>
          )}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {groupedLocations.map(({ warehouse, locations }) => (
            <article
              key={warehouse.id}
              className="rounded-[24px] border border-white/10 bg-white/5 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-white">{warehouse.name}</p>
                  <p className="mt-1 text-sm text-slate-400">{locations.length} ubicaciones registradas</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {locations.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-300">
                    No hay ubicaciones configuradas para este almacen.
                  </div>
                )}

                {locations.map((location, index) => (
                  <motion.article
                    key={location.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          {location.code} · {location.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          Tipo: {location.type}
                          {location.parentLocationName
                            ? ` · Padre: ${location.parentLocationCode ?? ""} ${location.parentLocationName}`.trim()
                            : ""}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                            location.active
                              ? "bg-emerald-500/15 text-emerald-100"
                              : "bg-slate-500/20 text-slate-200"
                          }`}
                        >
                          {location.active ? "Activa" : "Inactiva"}
                        </span>

                        {canManage && (
                          <>
                            <MotionButton
                              aria-label={`Editar ubicacion ${location.name}`}
                              onClick={() => handleOpenEdit(location)}
                              className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                            >
                              Editar
                            </MotionButton>
                            <MotionButton
                              aria-label={`Eliminar ubicacion ${location.name}`}
                              onClick={() => setPendingDelete(location)}
                              disabled={state.deletingId === location.id}
                              className="rounded-xl border border-rose-400/20 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
                            >
                              {state.deletingId === location.id ? "Eliminando..." : "Eliminar"}
                            </MotionButton>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <Modal open={showForm} onClose={() => setShowForm(false)} titleId="location-form-title">
        <section className="rounded-[28px] border border-white/10 bg-slate-950/95 p-6 shadow-panel">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Ubicacion</p>
              <h3 id="location-form-title" className="mt-2 text-2xl font-semibold text-white">
                {editingLocation ? "Editar ubicacion" : "Nueva ubicacion"}
              </h3>
            </div>

            <MotionButton
              aria-label="Cerrar formulario de ubicacion"
              onClick={() => setShowForm(false)}
              className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
            >
              Cerrar
            </MotionButton>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Almacen</span>
                <select
                  aria-label="Almacen de la ubicacion"
                  value={formValues.warehouseId}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      warehouseId: event.target.value,
                      parentLocationId: "",
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
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
                <span className="text-sm font-medium text-slate-200">Tipo</span>
                <select
                  aria-label="Tipo de ubicacion"
                  value={formValues.type}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      type: event.target.value as WarehouseLocation["type"],
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                >
                  {WAREHOUSE_LOCATION_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-slate-900">
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Codigo</span>
                <input
                  aria-label="Codigo de ubicacion"
                  value={formValues.code}
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, code: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  placeholder="Ej. Z-A1-BIN-01"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Nombre</span>
                <input
                  aria-label="Nombre de ubicacion"
                  value={formValues.name}
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  placeholder="Ej. Rack frontal"
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Ubicacion padre</span>
              <select
                aria-label="Ubicacion padre"
                value={formValues.parentLocationId}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, parentLocationId: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              >
                <option value="" className="bg-slate-900">
                  Sin padre
                </option>
                {filteredParentOptions.map((location) => (
                  <option key={location.id} value={location.id} className="bg-slate-900">
                    {location.code} · {location.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              <input
                aria-label="Ubicacion activa"
                checked={formValues.active}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, active: event.target.checked }))
                }
                type="checkbox"
              />
              <span>Mantener ubicacion activa</span>
            </label>

            {formError && <p className="text-sm text-rose-300">{formError}</p>}

            <MotionButton
              aria-label={editingLocation ? "Guardar ubicacion" : "Crear ubicacion"}
              type="submit"
              disabled={state.saving}
              className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-60"
            >
              {state.saving ? "Guardando..." : editingLocation ? "Guardar cambios" : "Crear ubicacion"}
            </MotionButton>
          </form>
        </section>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Eliminar ubicacion"
        description={
          pendingDelete
            ? `Vas a eliminar ${pendingDelete.code} - ${pendingDelete.name}. Esta accion puede fallar si la ubicacion esta en uso.`
            : ""
        }
        confirmLabel="Eliminar ubicacion"
        confirming={pendingDelete ? state.deletingId === pendingDelete.id : false}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
