import { useState, type FormEvent } from "react";
import type { Warehouse } from "../../../shared/src/types/desktop-warehouse-ipc";
import { useWarehouseContext } from "../context/WarehouseContext";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import MotionButton from "./MotionButton";
import SectionNotice from "./SectionNotice";
import { useToast } from "./ToastProvider";

type EditFormValues = {
  warehouseId: number | null;
  location: string;
  name: string;
};

type EditFormErrors = {
  location?: string;
  name?: string;
  submit?: string;
};

const initialEditFormValues: EditFormValues = {
  warehouseId: null,
  location: "",
  name: "",
};

function buildEditFormValues(warehouse: Warehouse): EditFormValues {
  return {
    warehouseId: warehouse.id,
    name: warehouse.name,
    location: warehouse.location,
  };
}

function validateEditForm(values: EditFormValues): EditFormErrors {
  const errors: EditFormErrors = {};

  if (!values.name.trim()) {
    errors.name = "Escribe el nombre.";
  }

  if (!values.location.trim()) {
    errors.location = "Escribe la ubicacion.";
  }

  return errors;
}

export default function DesktopWarehouseManager() {
  const {
    availableWarehouses,
    deactivateWarehouse,
    error,
    isDesktopMode,
    loading,
    selectedWarehouseId,
    updateWarehouse,
  } = useWarehouseContext();
  const { notify } = useToast();
  const [editValues, setEditValues] = useState<EditFormValues>(initialEditFormValues);
  const [editErrors, setEditErrors] = useState<EditFormErrors>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [warehouseToDeactivate, setWarehouseToDeactivate] = useState<Warehouse | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [deactivatingWarehouse, setDeactivatingWarehouse] = useState(false);

  if (!isDesktopMode) {
    return null;
  }

  const isEditModalOpen = editValues.warehouseId !== null;

  const resetEditState = () => {
    setEditValues(initialEditFormValues);
    setEditErrors({});
  };

  const resetDeactivateState = () => {
    setWarehouseToDeactivate(null);
    setDeactivateError(null);
  };

  const handleEditOpen = (warehouse: Warehouse) => {
    setEditValues(buildEditFormValues(warehouse));
    setEditErrors({});
  };

  const handleEditClose = () => {
    if (savingEdit) {
      return;
    }

    resetEditState();
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (savingEdit || !editValues.warehouseId) {
      return;
    }

    const nextErrors = validateEditForm(editValues);

    if (Object.keys(nextErrors).length > 0) {
      setEditErrors(nextErrors);
      return;
    }

    setSavingEdit(true);
    setEditErrors({});

    try {
      const updatedWarehouse = await updateWarehouse({
        warehouseId: editValues.warehouseId,
        name: editValues.name.trim(),
        location: editValues.location.trim(),
      });

      resetEditState();
      notify({
        type: "success",
        title: "Almacén actualizado",
      });
    } catch (submitError) {
      setEditErrors({
        submit:
          submitError instanceof Error ? submitError.message : "No se pudo guardar este almacen.",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeactivateClose = () => {
    if (deactivatingWarehouse) {
      return;
    }

    resetDeactivateState();
  };

  const handleDeactivateConfirm = async () => {
    if (!warehouseToDeactivate || deactivatingWarehouse) {
      return;
    }

    setDeactivatingWarehouse(true);
    setDeactivateError(null);

    try {
      await deactivateWarehouse({ warehouseId: warehouseToDeactivate.id });
      resetDeactivateState();
      notify({
        type: "success",
        title: "Almacén desactivado",
      });
    } catch (deactivateWarehouseError) {
      setDeactivateError(
        deactivateWarehouseError instanceof Error
          ? deactivateWarehouseError.message
          : "No se pudo desactivar este almacen.",
      );
    } finally {
      setDeactivatingWarehouse(false);
    }
  };

  return (
    <>
      <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Almacenes</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Gestion simple</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              Cambia nombre o ubicacion y desactiva solo cuando ya no se use.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            {loading ? "Cargando..." : `${availableWarehouses.length} almacenes`}
          </div>
        </div>

        {error ? (
          <div className="mt-6">
            <SectionNotice title="No se pudo cargar" message={error} tone="error" />
          </div>
        ) : null}

        {!loading && availableWarehouses.length === 0 ? (
          <div className="mt-6">
            <SectionNotice
              title="Sin almacenes"
              message="Crea uno nuevo desde la barra superior para empezar."
              tone="info"
            />
          </div>
        ) : null}

        {availableWarehouses.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm text-slate-200">
              <thead>
                <tr className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  <th className="border-b border-white/10 px-4 py-3 font-medium">Nombre</th>
                  <th className="border-b border-white/10 px-4 py-3 font-medium">Ubicacion</th>
                  <th className="border-b border-white/10 px-4 py-3 font-medium">Estado</th>
                  <th className="border-b border-white/10 px-4 py-3 font-medium text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {availableWarehouses.map((warehouse) => {
                  const isSelected = warehouse.id === selectedWarehouseId;

                  return (
                    <tr key={warehouse.id} className="align-top">
                      <td className="border-b border-white/5 px-4 py-4">
                        <p className="font-semibold text-white">{warehouse.name}</p>
                      </td>
                      <td className="border-b border-white/5 px-4 py-4 text-slate-300">
                        {warehouse.location}
                      </td>
                      <td className="border-b border-white/5 px-4 py-4">
                        {isSelected ? (
                          <span className="inline-flex rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
                            Activo
                          </span>
                        ) : (
                          <span className="text-slate-500">Disponible</span>
                        )}
                      </td>
                      <td className="border-b border-white/5 px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <MotionButton
                            aria-label={`Editar ${warehouse.name}`}
                            onClick={() => handleEditOpen(warehouse)}
                            className="rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5"
                          >
                            Editar
                          </MotionButton>
                          <MotionButton
                            aria-label={`Desactivar ${warehouse.name}`}
                            onClick={() => {
                              setWarehouseToDeactivate(warehouse);
                              setDeactivateError(null);
                            }}
                            className="rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20"
                          >
                            Desactivar
                          </MotionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <Modal open={isEditModalOpen} onClose={handleEditClose} titleId="warehouse-edit-title">
        <div className="rounded-[30px] border border-white/10 bg-slate-950 p-6 shadow-panel sm:p-8">
          <p className="toolbar-label text-cyan-200">Editar almacen</p>
          <h3 id="warehouse-edit-title" className="mt-2 text-2xl font-semibold text-white">
            Editar datos
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Ajusta el nombre y la ubicacion para que el equipo vea la informacion correcta.
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleEditSubmit}>
            <label className="block space-y-2">
              <span className="field-label">Nombre</span>
              <input
                autoFocus
                value={editValues.name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setEditValues((current) => ({ ...current, name: nextName }));
                  setEditErrors((current) => ({ ...current, name: undefined, submit: undefined }));
                }}
                className="toolbar-field w-full"
                placeholder="Ej. Almacen Centro"
              />
              {editErrors.name ? <p className="text-sm text-rose-300">{editErrors.name}</p> : null}
            </label>

            <label className="block space-y-2">
              <span className="field-label">Ubicacion</span>
              <input
                value={editValues.location}
                onChange={(event) => {
                  const nextLocation = event.target.value;
                  setEditValues((current) => ({ ...current, location: nextLocation }));
                  setEditErrors((current) => ({
                    ...current,
                    location: undefined,
                    submit: undefined,
                  }));
                }}
                className="toolbar-field w-full"
                placeholder="Ej. Calle 8, local principal"
              />
              {editErrors.location ? (
                <p className="text-sm text-rose-300">{editErrors.location}</p>
              ) : null}
            </label>

            {editErrors.submit ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {editErrors.submit}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
              <MotionButton
                type="button"
                onClick={handleEditClose}
                className="min-h-[48px] rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Cancelar
              </MotionButton>
              <MotionButton
                type="submit"
                disabled={savingEdit}
                className="min-h-[48px] rounded-2xl bg-cyan-500 px-5 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingEdit ? "Guardando..." : "Guardar"}
              </MotionButton>
            </div>
          </form>
        </div>
      </Modal>

      <ConfirmDialog
        open={warehouseToDeactivate !== null}
        title={
          warehouseToDeactivate ? `Desactivar almacén '${warehouseToDeactivate.name}'?` : ""
        }
        description={
          warehouseToDeactivate
            ? "Este almacén ya no estará disponible para operaciones."
            : ""
        }
        confirmLabel="Desactivar"
        confirming={deactivatingWarehouse}
        errorMessage={deactivateError}
        onCancel={handleDeactivateClose}
        onConfirm={() => void handleDeactivateConfirm()}
      />
    </>
  );
}
