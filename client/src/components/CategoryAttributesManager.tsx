import { useEffect, useMemo, useState } from "react";
import type {
  Category,
  CategoryAttribute,
  CategoryAttributeInput,
  CategoryAttributeType,
  User,
} from "../../../shared/src";
import { CATEGORY_ATTRIBUTE_TYPES } from "../../../shared/src";
import { createApiClient } from "../lib/api";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import MotionButton from "./MotionButton";
import SectionLoader from "./SectionLoader";
import { useToast } from "./ToastProvider";

type CategoryAttributesManagerProps = {
  apiBaseUrl: string;
  categories: Category[];
  currentUser: User | null;
};

type CategoryAttributesState = {
  loading: boolean;
  saving: boolean;
  deletingId: number | null;
  togglingId: number | null;
  error: string | null;
  attributes: CategoryAttribute[];
};

type FormValues = {
  key: string;
  label: string;
  type: CategoryAttributeType;
  required: boolean;
  optionsText: string;
  sortOrder: string;
  active: boolean;
};

const initialState: CategoryAttributesState = {
  loading: false,
  saving: false,
  deletingId: null,
  togglingId: null,
  error: null,
  attributes: [],
};

const buildInitialValues = (attribute?: CategoryAttribute | null): FormValues => ({
  key: attribute?.key ?? "",
  label: attribute?.label ?? "",
  type: attribute?.type ?? "text",
  required: attribute?.required ?? false,
  optionsText: attribute?.options?.join(", ") ?? "",
  sortOrder: attribute ? String(attribute.sortOrder) : "0",
  active: attribute?.active ?? true,
});

export default function CategoryAttributesManager({
  apiBaseUrl,
  categories,
  currentUser,
}: CategoryAttributesManagerProps) {
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const { notify } = useToast();
  const [state, setState] = useState<CategoryAttributesState>(initialState);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    categories[0] ? String(categories[0].id) : "",
  );
  const [showForm, setShowForm] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<CategoryAttribute | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CategoryAttribute | null>(null);
  const [values, setValues] = useState<FormValues>(buildInitialValues());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const canManage = currentUser?.role === "admin";
  const titleId = "category-attribute-form";

  useEffect(() => {
    if (!selectedCategoryId && categories[0]) {
      setSelectedCategoryId(String(categories[0].id));
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (!selectedCategoryId) {
      setState((current) => ({ ...current, loading: false, attributes: [], error: null }));
      return;
    }

    let active = true;

    const loadAttributes = async () => {
      setState((current) => ({ ...current, loading: true, error: null }));

      try {
        const attributes = await api.get<CategoryAttribute[]>(
          `/categories/${selectedCategoryId}/attributes`,
        );

        if (!active) {
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          attributes,
          error: null,
        }));
      } catch (error) {
        if (!active) {
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          error:
            error instanceof Error ? error.message : "No se pudieron cargar los atributos.",
        }));
      }
    };

    void loadAttributes();

    return () => {
      active = false;
    };
  }, [api, selectedCategoryId]);

  const openCreate = () => {
    setEditingAttribute(null);
    setValues(buildInitialValues());
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (attribute: CategoryAttribute) => {
    setEditingAttribute(attribute);
    setValues(buildInitialValues(attribute));
    setErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingAttribute(null);
    setValues(buildInitialValues());
    setErrors({});
  };

  const parseOptions = () => {
    return values.optionsText
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    const sortOrder = Number(values.sortOrder);
    const options = parseOptions();

    if (!selectedCategoryId) {
      nextErrors.categoryId = "Selecciona una categoria.";
    }

    if (!values.key.trim()) {
      nextErrors.key = "La clave es obligatoria.";
    }

    if (!values.label.trim()) {
      nextErrors.label = "La etiqueta es obligatoria.";
    }

    if (!Number.isInteger(sortOrder)) {
      nextErrors.sortOrder = "El orden debe ser un numero entero.";
    }

    if (
      (values.type === "select" || values.type === "multiselect") &&
      options.length === 0
    ) {
      nextErrors.optionsText = "Debes definir opciones para select o multiselect.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = (): CategoryAttributeInput => ({
    key: values.key.trim(),
    label: values.label.trim(),
    type: values.type,
    required: values.required,
    options:
      values.type === "select" || values.type === "multiselect" ? parseOptions() : null,
    sortOrder: Number(values.sortOrder),
    active: values.active,
  });

  const reloadAttributes = async () => {
    if (!selectedCategoryId) {
      return;
    }

    const attributes = await api.get<CategoryAttribute[]>(`/categories/${selectedCategoryId}/attributes`);
    setState((current) => ({
      ...current,
      attributes,
      error: null,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate() || !selectedCategoryId) {
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    try {
      if (editingAttribute) {
        await api.put(
          `/categories/${selectedCategoryId}/attributes/${editingAttribute.id}`,
          buildPayload(),
        );
        notify({
          type: "success",
          title: "Atributo actualizado",
          message: `Se actualizo ${editingAttribute.label}.`,
        });
      } else {
        await api.post(`/categories/${selectedCategoryId}/attributes`, buildPayload());
        notify({
          type: "success",
          title: "Atributo creado",
          message: "El atributo se agrego correctamente a la categoria.",
        });
      }

      await reloadAttributes();
      closeForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo guardar el atributo.";

      setState((current) => ({ ...current, saving: false, error: message }));
      notify({
        type: "error",
        title: "No se pudo guardar el atributo",
        message,
      });
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  const handleDelete = async () => {
    if (!pendingDelete || !selectedCategoryId) {
      return;
    }

    setState((current) => ({ ...current, deletingId: pendingDelete.id, error: null }));

    try {
      await api.delete(`/categories/${selectedCategoryId}/attributes/${pendingDelete.id}`);
      await reloadAttributes();
      notify({
        type: "success",
        title: "Atributo eliminado",
        message: `Se elimino ${pendingDelete.label}.`,
      });
      setPendingDelete(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo eliminar el atributo.";

      setState((current) => ({ ...current, deletingId: null, error: message }));
      notify({
        type: "error",
        title: "No se pudo eliminar el atributo",
        message,
      });
      return;
    }

    setState((current) => ({ ...current, deletingId: null }));
  };

  const handleToggleActive = async (attribute: CategoryAttribute) => {
    if (!selectedCategoryId) {
      return;
    }

    setState((current) => ({ ...current, togglingId: attribute.id, error: null }));

    try {
      await api.put(`/categories/${selectedCategoryId}/attributes/${attribute.id}`, {
        key: attribute.key,
        label: attribute.label,
        type: attribute.type,
        required: attribute.required,
        options: attribute.options,
        sortOrder: attribute.sortOrder,
        active: !attribute.active,
      });
      await reloadAttributes();
      notify({
        type: "success",
        title: attribute.active ? "Atributo desactivado" : "Atributo activado",
        message: `${attribute.label} ahora esta ${attribute.active ? "inactivo" : "activo"}.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo actualizar el estado del atributo.";

      setState((current) => ({ ...current, error: message }));
      notify({
        type: "error",
        title: "No se pudo actualizar el atributo",
        message,
      });
    } finally {
      setState((current) => ({ ...current, togglingId: null }));
    }
  };

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Universal Catalog</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Atributos por categoria</h3>
          <p className="mt-2 text-sm text-slate-400">
            Define campos dinamicos reutilizables para productos sin modificar la tabla base.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            aria-label="Seleccionar categoria para administrar atributos"
            value={selectedCategoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id} className="bg-slate-900">
                {category.name}
              </option>
            ))}
          </select>

          {canManage && (
            <MotionButton
              aria-label="Crear atributo de categoria"
              onClick={openCreate}
              className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400"
            >
              Nuevo atributo
            </MotionButton>
          )}
        </div>
      </div>

      {!canManage && (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
          Solo admin puede crear, editar o eliminar atributos de categoria.
        </div>
      )}

      {state.error && (
        <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {state.error}
        </div>
      )}

      {state.loading ? (
        <div className="mt-6">
          <SectionLoader label="Cargando atributos de categoria..." />
        </div>
      ) : state.attributes.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
          No hay atributos configurados para esta categoria.
        </div>
      ) : (
        <div className="table-shell mt-6 overflow-x-auto">
          <table className="table-fixed w-full min-w-[1120px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
                <th className="px-4 py-3 font-medium">Clave</th>
                <th className="px-4 py-3 font-medium">Etiqueta</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Requerido</th>
                <th className="px-4 py-3 font-medium">Activo</th>
                <th className="px-4 py-3 font-medium">Uso</th>
                <th className="px-4 py-3 font-medium">Orden</th>
                <th className="w-40 px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {state.attributes.map((attribute) => (
                <tr key={attribute.id} className="border-t border-white/10 align-top hover:bg-white/[0.035]">
                  <td className="px-4 py-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{attribute.key}</p>
                      {attribute.options && attribute.options.length > 0 && (
                        <p className="mt-1 text-xs text-slate-400">{attribute.options.join(", ")}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-200">{attribute.label}</td>
                  <td className="px-4 py-4 text-sm uppercase text-slate-300">{attribute.type}</td>
                  <td className="px-4 py-4 text-sm text-slate-300">{attribute.required ? "Si" : "No"}</td>
                  <td className="px-4 py-4 text-sm text-slate-300">{attribute.active ? "Si" : "No"}</td>
                  <td className="px-4 py-4 text-sm text-slate-300">{attribute.usageCount}</td>
                  <td className="px-4 py-4 text-sm text-slate-300">{attribute.sortOrder}</td>
                  <td className="w-40 px-4 py-4 text-right">
                    <div className="flex flex-col items-end gap-2 flex-none">
                      {canManage && (
                        <>
                          <MotionButton
                            aria-label={`${attribute.active ? "Desactivar" : "Activar"} atributo ${attribute.label}`}
                            disabled={state.togglingId === attribute.id}
                            onClick={() => void handleToggleActive(attribute)}
                            className="min-h-[40px] w-32 rounded-xl border border-cyan-400/20 px-3.5 text-sm text-cyan-100 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {state.togglingId === attribute.id
                              ? "Actualizando..."
                              : attribute.active
                                ? "Desactivar"
                                : "Activar"}
                          </MotionButton>
                          <MotionButton
                            aria-label={`Editar atributo ${attribute.label}`}
                            onClick={() => openEdit(attribute)}
                            className="min-h-[40px] w-32 rounded-xl border border-white/10 px-3.5 text-sm text-slate-200 transition hover:bg-white/5"
                          >
                            Editar
                          </MotionButton>
                          <MotionButton
                            aria-label={`Eliminar atributo ${attribute.label}`}
                            disabled={state.deletingId === attribute.id || attribute.usageCount > 0}
                            onClick={() => setPendingDelete(attribute)}
                            className="min-h-[40px] w-32 rounded-xl border border-rose-400/20 px-3.5 text-sm text-rose-200 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {attribute.usageCount > 0
                              ? "En uso"
                              : state.deletingId === attribute.id
                                ? "Eliminando..."
                                : "Borrar"}
                          </MotionButton>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showForm} onClose={closeForm} titleId={titleId}>
        <section className="rounded-[28px] border border-white/10 bg-slate-950/95 p-6 shadow-panel">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Category Attribute</p>
              <h3 id={titleId} className="mt-2 text-2xl font-semibold text-white">
                {editingAttribute ? "Editar atributo" : "Nuevo atributo"}
              </h3>
            </div>

            <MotionButton
              aria-label="Cerrar formulario de atributo"
              onClick={closeForm}
              className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5"
            >
              Cerrar
            </MotionButton>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 xl:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Clave tecnica</span>
                <input
                  aria-label="Clave tecnica del atributo"
                  value={values.key}
                  onChange={(event) => setValues((current) => ({ ...current, key: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  placeholder="ej. color"
                />
                {errors.key && <span className="text-sm text-rose-300">{errors.key}</span>}
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Etiqueta</span>
                <input
                  aria-label="Etiqueta del atributo"
                  value={values.label}
                  onChange={(event) => setValues((current) => ({ ...current, label: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  placeholder="Color"
                />
                {errors.label && <span className="text-sm text-rose-300">{errors.label}</span>}
              </label>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Tipo</span>
                <select
                  aria-label="Tipo del atributo"
                  value={values.type}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      type: event.target.value as CategoryAttributeType,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                >
                  {CATEGORY_ATTRIBUTE_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-slate-900">
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Orden</span>
                <input
                  aria-label="Orden del atributo"
                  value={values.sortOrder}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, sortOrder: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  inputMode="numeric"
                  step="1"
                  type="number"
                />
                {errors.sortOrder && <span className="text-sm text-rose-300">{errors.sortOrder}</span>}
              </label>
            </div>

            {(values.type === "select" || values.type === "multiselect") && (
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Opciones</span>
                <input
                  aria-label="Opciones del atributo"
                  value={values.optionsText}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, optionsText: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  placeholder="Rojo, Azul, Verde"
                />
                {errors.optionsText && <span className="text-sm text-rose-300">{errors.optionsText}</span>}
              </label>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <input
                  aria-label="Atributo obligatorio"
                  checked={values.required}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, required: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>Obligatorio</span>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <input
                  aria-label="Atributo activo"
                  checked={values.active}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, active: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>Activo</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <MotionButton
                aria-label={editingAttribute ? "Guardar atributo" : "Crear atributo"}
                disabled={state.saving}
                type="submit"
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.saving
                  ? "Guardando..."
                  : editingAttribute
                    ? "Guardar cambios"
                    : "Crear atributo"}
              </MotionButton>

              <MotionButton
                aria-label="Cancelar formulario de atributo"
                onClick={closeForm}
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/5"
                type="button"
              >
                Cancelar
              </MotionButton>
            </div>
          </form>
        </section>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Eliminar atributo"
        description={
          pendingDelete
            ? `Vas a eliminar ${pendingDelete.label}. Solo se permite borrar atributos sin uso en productos.`
            : ""
        }
        confirmLabel="Eliminar atributo"
        confirming={pendingDelete ? state.deletingId === pendingDelete.id : false}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </section>
  );
}
