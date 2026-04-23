import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CreateStockTransferInput,
  Product,
  ProductListResponse,
  ReportFormat,
  StockTransfer,
  Warehouse,
  WarehouseLocation,
} from "../../../shared/src";
import { t, tTransferStatus } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import { getErrorMessage, saveDownloadedFile } from "../lib/api";
import { safeArray } from "../lib/format";
import { useDataProvider } from "../services/data-provider";
import ConfirmDialog from "./ConfirmDialog";
import MotionButton from "./MotionButton";
import SectionLoader from "./SectionLoader";
import { useToast } from "./ToastProvider";

type TransfersSectionProps = {
  apiBaseUrl: string;
};

type TransfersState = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
  products: Product[];
  transfers: StockTransfer[];
};

type TransferForm = {
  fromWarehouseId: string;
  toWarehouseId: string;
  fromLocationId: string;
  toLocationId: string;
  productId: string;
  quantity: string;
  notes: string;
  manualDestination: string;
  carrierName: string;
};

const initialState: TransfersState = {
  loading: true,
  saving: false,
  error: null,
  warehouses: [],
  locations: [],
  products: [],
  transfers: [],
};

const initialForm: TransferForm = {
  fromWarehouseId: "",
  toWarehouseId: "",
  fromLocationId: "",
  toLocationId: "",
  productId: "",
  quantity: "1",
  notes: "",
  manualDestination: "",
  carrierName: "",
};

export default function TransfersSection({ apiBaseUrl }: TransfersSectionProps) {
  const { http } = useDataProvider();
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState<TransfersState>(initialState);
  const [formValues, setFormValues] = useState<TransferForm>(initialForm);
  const [pendingAction, setPendingAction] = useState<{
    transfer: StockTransfer;
    action: "approve" | "complete" | "cancel";
  } | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ReportFormat | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [warehouses, locations, products, transfers] = await Promise.all([
        http.get<Warehouse[]>("/warehouses"),
        http.get<WarehouseLocation[]>("/locations"),
        http.get<ProductListResponse>("/products?page=1&pageSize=100"),
        http.get<StockTransfer[]>("/transfers"),
      ]);

      setState({
        loading: false,
        saving: false,
        error: null,
        warehouses: safeArray(warehouses),
        locations: safeArray(locations),
        products: safeArray(products.items),
        transfers: safeArray(transfers),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : t("transfers.createError"),
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
  const canApprove =
    currentUser?.role === "admin" || currentUser?.role === "manager";
  const canExportReports =
    currentUser?.role === "admin" || currentUser?.role === "manager";

  const fromLocations = useMemo(() => {
    if (!formValues.fromWarehouseId) {
      return [];
    }

    return state.locations.filter(
      (location) => location.warehouseId === Number(formValues.fromWarehouseId) && location.active,
    );
  }, [formValues.fromWarehouseId, state.locations]);

  const toLocations = useMemo(() => {
    if (!formValues.toWarehouseId) {
      return [];
    }

    return state.locations.filter(
      (location) => location.warehouseId === Number(formValues.toWarehouseId) && location.active,
    );
  }, [formValues.toWarehouseId, state.locations]);

  const handleCreateTransfer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (state.saving) {
      return;
    }

    if (!formValues.fromWarehouseId || !formValues.toWarehouseId || !formValues.productId) {
      notify({
        type: "error",
        title: t("common.error"),
        message: t("transfers.formIncomplete"),
      });
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    const payload: CreateStockTransferInput = {
      fromWarehouseId: Number(formValues.fromWarehouseId),
      toWarehouseId: Number(formValues.toWarehouseId),
      fromLocationId: formValues.fromLocationId ? Number(formValues.fromLocationId) : null,
      toLocationId: formValues.toLocationId ? Number(formValues.toLocationId) : null,
      productId: Number(formValues.productId),
      quantity: Number(formValues.quantity),
      manualDestination: formValues.manualDestination.trim()
        ? formValues.manualDestination.trim()
        : null,
      carrierName: formValues.carrierName.trim() ? formValues.carrierName.trim() : null,
      notes: formValues.notes.trim() ? formValues.notes.trim() : null,
    };

    try {
      await http.post("/transfers", payload);
      setFormValues(initialForm);
      notify({
        type: "success",
        title: t("transfers.createSuccess"),
        message: t("transfers.createSuccessText"),
      });
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("transfers.createError");
      notify({
        type: "error",
        title: t("transfers.createError"),
        message,
      });
      setState((current) => ({ ...current, saving: false, error: message }));
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  const handleExport = async (format: ReportFormat) => {
    if (exportingFormat) {
      return;
    }

    if (state.transfers.length === 0) {
      notify({
        type: "error",
        title: t("common.error"),
        message: t("transfers.exportNoData"),
      });
      return;
    }

    setExportingFormat(format);

    try {
      const file = await http.download(`/reports/transfers/export?format=${format}`);
      saveDownloadedFile(file);
      notify({
        type: "success",
        title: t("transfers.exportSuccess"),
        message: format.toUpperCase(),
      });
    } catch (error) {
      notify({
        type: "error",
        title: t("transfers.exportError"),
        message: getErrorMessage(error, t("app.retry")),
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleTransferAction = async () => {
    if (!pendingAction || state.saving) {
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    const path =
      pendingAction.action === "approve"
        ? `/transfers/${pendingAction.transfer.id}/approve`
        : pendingAction.action === "complete"
          ? `/transfers/${pendingAction.transfer.id}/complete`
          : `/transfers/${pendingAction.transfer.id}/cancel`;

    try {
      await http.patch(path, {});
      notify({
        type: "success",
        title: t("transfers.statusUpdated"),
        message: `#${pendingAction.transfer.id}`,
      });
      setPendingAction(null);
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        saving: false,
        error: error instanceof Error ? error.message : t("transfers.invalidStatusChange"),
      }));
      notify({
        type: "error",
        title: t("transfers.invalidStatusChange"),
        message: error instanceof Error ? error.message : t("app.retry"),
      });
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  if (state.loading) {
    return <SectionLoader label={t("transfers.loading")} />;
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
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t("sections.transferencias.label")}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{t("transfers.moveTitle")}</h3>
          <p className="mt-2 text-sm text-slate-400">{t("transfers.subtitle")}</p>

          {canExportReports && (
            <div className="mt-6 flex flex-wrap gap-3">
              <MotionButton
                aria-label={t("common.exportExcel")}
                onClick={() => void handleExport("excel")}
                className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20"
              >
                {t("common.exportExcel")}
              </MotionButton>
              <MotionButton
                aria-label={t("common.exportPdf")}
                onClick={() => void handleExport("pdf")}
                className="rounded-2xl border border-orange-400/20 bg-orange-500/10 px-4 py-3 text-sm font-medium text-orange-100 hover:bg-orange-500/20"
              >
                {t("common.exportPdf")}
              </MotionButton>
              <MotionButton
                aria-label={t("common.exportOdf")}
                onClick={() => void handleExport("odf")}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-white/10"
              >
                {t("common.exportOdf")}
              </MotionButton>
            </div>
          )}

          {!canCreate && (
            <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-50">
              {t("transfers.permissions")}
            </div>
          )}

          <form className="mt-6 space-y-5" onSubmit={handleCreateTransfer}>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Almacen origen</span>
                <select
                  value={formValues.fromWarehouseId}
                  disabled={!canCreate}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      fromWarehouseId: event.target.value,
                      fromLocationId: "",
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                >
                  <option value="" className="bg-slate-900">
                    Selecciona origen
                  </option>
                  {state.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id} className="bg-slate-900">
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Almacen destino</span>
                <select
                  value={formValues.toWarehouseId}
                  disabled={!canCreate}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      toWarehouseId: event.target.value,
                      toLocationId: "",
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                >
                  <option value="" className="bg-slate-900">
                    Selecciona destino
                  </option>
                  {state.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id} className="bg-slate-900">
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Ubicacion origen</span>
                <select
                  value={formValues.fromLocationId}
                  disabled={!canCreate || !formValues.fromWarehouseId}
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, fromLocationId: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                >
                  <option value="" className="bg-slate-900">
                    Sin ubicacion especifica
                  </option>
                  {fromLocations.map((location) => (
                    <option key={location.id} value={location.id} className="bg-slate-900">
                      {location.code} · {location.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Ubicacion destino</span>
                <select
                  value={formValues.toLocationId}
                  disabled={!canCreate || !formValues.toWarehouseId}
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, toLocationId: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                >
                  <option value="" className="bg-slate-900">
                    Sin ubicacion especifica
                  </option>
                  {toLocations.map((location) => (
                    <option key={location.id} value={location.id} className="bg-slate-900">
                      {location.code} · {location.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-[1fr,180px]">
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
                <span className="text-sm font-medium text-slate-200">Cantidad</span>
                <input
                  value={formValues.quantity}
                  disabled={!canCreate}
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, quantity: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                  min="1"
                  step="1"
                  type="number"
                />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Destino manual</span>
                <input
                  value={formValues.manualDestination}
                  disabled={!canCreate}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      manualDestination: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                  placeholder="Ej. Cafeteria Centro"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Transportista</span>
                <input
                  value={formValues.carrierName}
                  disabled={!canCreate}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      carrierName: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                  placeholder="Nombre del responsable del traslado"
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Notas</span>
              <textarea
                value={formValues.notes}
                disabled={!canCreate}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, notes: event.target.value }))
                }
                className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:opacity-60"
                placeholder="Observaciones de traslado"
              />
            </label>

            <MotionButton
              aria-label="Crear transferencia de stock"
              type="submit"
              disabled={state.saving || !canCreate}
              className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-60"
            >
              {state.saving ? "Guardando..." : "Solicitar transferencia"}
            </MotionButton>
          </form>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Cola operativa</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Transferencias recientes</h3>

          <div className="mt-6 space-y-3">
            {state.transfers.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                No hay transferencias registradas.
              </div>
            )}

            {state.transfers.map((transfer) => (
              <article
                key={transfer.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-semibold text-white">
                      #{transfer.id} · {transfer.productName}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {transfer.fromWarehouseName}
                      {transfer.fromLocationName ? ` / ${transfer.fromLocationName}` : ""}
                      {" -> "}
                      {transfer.manualDestination?.trim()
                        ? transfer.manualDestination
                        : `${transfer.toWarehouseName}${transfer.toLocationName ? ` / ${transfer.toLocationName}` : ""}`}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      Cantidad: {transfer.quantity} · Solicitado por: {transfer.requestedByName}
                    </p>
                    {transfer.carrierName && (
                      <p className="mt-1 text-sm text-slate-400">
                        Transportista: {transfer.carrierName}
                      </p>
                    )}
                    {transfer.notes && (
                      <p className="mt-2 text-sm text-slate-300">{transfer.notes}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                        transfer.status === "completed"
                          ? "bg-emerald-500/15 text-emerald-100"
                          : transfer.status === "approved"
                            ? "bg-cyan-500/15 text-cyan-100"
                            : transfer.status === "cancelled"
                              ? "bg-slate-500/20 text-slate-200"
                              : "bg-amber-500/15 text-amber-100"
                      }`}
                    >
                          {tTransferStatus(transfer.status)}
                    </span>

                    {canApprove && transfer.status === "pending" && (
                      <MotionButton
                        aria-label={`Aprobar transferencia ${transfer.id}`}
                        onClick={() => setPendingAction({ transfer, action: "approve" })}
                        className="rounded-xl border border-cyan-400/20 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/10"
                      >
                        Aprobar
                      </MotionButton>
                    )}

                    {canApprove && transfer.status === "approved" && (
                      <MotionButton
                        aria-label={`Completar transferencia ${transfer.id}`}
                        onClick={() => setPendingAction({ transfer, action: "complete" })}
                        className="rounded-xl border border-emerald-400/20 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/10"
                      >
                        Completar
                      </MotionButton>
                    )}

                    {canApprove && (transfer.status === "pending" || transfer.status === "approved") && (
                      <MotionButton
                        aria-label={`Cancelar transferencia ${transfer.id}`}
                        onClick={() => setPendingAction({ transfer, action: "cancel" })}
                        className="rounded-xl border border-rose-400/20 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/10"
                      >
                        Cancelar
                      </MotionButton>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={t("transfers.actionConfirm")}
        description={
          pendingAction
            ? `Vas a ${pendingAction.action} la transferencia #${pendingAction.transfer.id}.`
            : ""
        }
        confirmLabel={t("common.confirm")}
        confirming={false}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void handleTransferAction()}
      />
    </div>
  );
}
