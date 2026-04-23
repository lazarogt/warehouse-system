import { useEffect, useState } from "react";
import {
  USER_ROLES,
  type Category,
  type HealthResponse,
  type ProductListResponse,
  type User,
  type Warehouse as ApiWarehouse,
} from "../../../shared/src";
import { APP_NAME, APP_VERSION } from "../../../shared/src/constants/app";
import { t, tUserRole } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import { useWarehouseContext } from "../context/WarehouseContext";
import { useDataProvider } from "../services/data-provider";
import CategoryAttributesManager from "./CategoryAttributesManager";
import DesktopWarehouseManager from "./DesktopWarehouseManager";
import MotionButton from "./MotionButton";
import { useToast } from "./ToastProvider";

type ConfigurationSectionProps = {
  apiBaseUrl: string;
};

type ConfigurationState = {
  loading: boolean;
  error: string | null;
  currentUser: User | null;
  health: HealthResponse | null;
  users: User[];
  categories: Category[];
  warehouses: ApiWarehouse[];
  productsTotal: number;
};

const initialState: ConfigurationState = {
  loading: true,
  error: null,
  currentUser: null,
  health: null,
  users: [],
  categories: [],
  warehouses: [],
  productsTotal: 0,
};

export default function ConfigurationSection({ apiBaseUrl }: ConfigurationSectionProps) {
  const { user: currentUser } = useAuth();
  const { availableWarehouses, isDesktopMode } = useWarehouseContext();
  const { http, isOffline } = useDataProvider();
  const { notify } = useToast();
  const [state, setState] = useState<ConfigurationState>(initialState);
  const [backupAction, setBackupAction] = useState<"create" | "restore" | null>(null);
  const isDesktopBackupAvailable = Boolean(window.api?.backup);
  const warehouseTotal = isDesktopMode ? availableWarehouses.length : state.warehouses.length;

  useEffect(() => {
    const loadConfiguration = async () => {
      const results = await Promise.allSettled([
        http.get<HealthResponse>("/health"),
        currentUser?.role === "admin" ? http.get<User[]>("/users") : Promise.resolve([]),
        http.get<Category[]>("/categories"),
        http.get<ApiWarehouse[]>("/warehouses"),
        http.get<ProductListResponse>("/products?page=1&pageSize=1"),
      ]);

      const [healthResult, usersResult, categoriesResult, warehousesResult, productsResult] = results;
      const rejectedResults = results.filter((result) => result.status === "rejected");

      setState({
        loading: false,
        error:
          rejectedResults.length > 0
            ? t("configuration.offlineWarning")
            : null,
        currentUser,
        health: healthResult.status === "fulfilled" ? healthResult.value : null,
        users: usersResult.status === "fulfilled" ? usersResult.value : [],
        categories: categoriesResult.status === "fulfilled" ? categoriesResult.value : [],
        warehouses: warehousesResult.status === "fulfilled" ? warehousesResult.value : [],
        productsTotal:
          productsResult.status === "fulfilled" ? productsResult.value.total : 0,
      });
    };

    void loadConfiguration();
  }, [currentUser, http]);

  const handleCreateBackup = async () => {
    if (!window.api?.backup || backupAction) {
      return;
    }

    setBackupAction("create");

    try {
      const response = await window.api.backup.createBackup();

      if (!response.success) {
        throw new Error(response.error.message || t("configuration.backupCreateError"));
      }

      notify({
        type: "success",
        title: t("configuration.backupCreateSuccess"),
        message: `Se guardo en ${response.data.fileName}.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: t("configuration.backupCreateError"),
        message: error instanceof Error ? error.message : t("app.retry"),
      });
    } finally {
      setBackupAction(null);
    }
  };

  const handleRestoreBackup = async () => {
    if (!window.api?.backup || backupAction) {
      return;
    }

    setBackupAction("restore");

    try {
      const response = await window.api.backup.restoreBackup();

      if (!response.success) {
        throw new Error(response.error.message || t("configuration.backupRestoreError"));
      }

      if (!response.data.restored) {
        return;
      }

      notify({
        type: "success",
        title: t("configuration.backupRestoreSuccess"),
        message: "La app se reiniciara para cargar la base restaurada.",
      });
    } catch (error) {
      notify({
        type: "error",
        title: t("configuration.backupRestoreError"),
        message: error instanceof Error ? error.message : t("app.retry"),
      });
    } finally {
      setBackupAction(null);
    }
  };

  if (state.loading) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
        <p className="text-sm text-slate-300">{t("configuration.loading")}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {state.error && (
        <section className="rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {state.error}
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <article className="rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-200/10 to-zinc-300/10 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-300">{t("configuration.configuration")}</p>
          <h3 className="mt-2 text-3xl font-semibold text-white">{t("configuration.summary")}</h3>
          <p className="mt-3 text-sm text-slate-300">Resumen del panel.</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("app.version")}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{APP_VERSION}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("sections.usuarios.label")}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{state.users.length}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("sections.productos.label")}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{state.productsTotal}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("sections.ubicaciones.label")}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{warehouseTotal}</p>
            </article>
          </div>
        </article>

        <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t("configuration.sessionHealth")}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{t("configuration.sessionReady")}</h3>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("app.userLogged")}</p>
              <p className="mt-3 text-lg font-semibold text-white">{state.currentUser?.name ?? t("app.noSession")}</p>
              <p className="mt-1 text-sm text-slate-400">
                {state.currentUser?.role ? tUserRole(state.currentUser.role) : t("common.noData")}
              </p>
            </div>

            {isDesktopBackupAvailable && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("configuration.backupSection")}</p>
                <p className="mt-3 text-lg font-semibold text-white">Proteccion de la base</p>
                <p className="mt-2 text-sm text-slate-400">Copia local y restauración.</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <MotionButton
                    aria-label="Crear copia"
                    onClick={() => void handleCreateBackup()}
                    disabled={backupAction !== null}
                    className="min-h-[46px] rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {backupAction === "create" ? t("loading.processing") : t("configuration.backupCreate")}
                  </MotionButton>
                  <MotionButton
                    aria-label="Restaurar copia"
                    onClick={() => void handleRestoreBackup()}
                    disabled={backupAction !== null}
                    className="min-h-[46px] rounded-2xl border border-orange-300/20 bg-orange-500/10 px-4 text-sm font-semibold text-orange-100 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {backupAction === "restore" ? t("loading.processing") : t("configuration.backupRestore")}
                  </MotionButton>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("configuration.apiStatus")}</p>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                    state.health?.status === "ok"
                      && !isOffline
                      ? "bg-emerald-500/15 text-emerald-100"
                      : "bg-rose-500/15 text-rose-100"
                  }`}
                >
                  {isOffline ? t("common.offlineMode") : state.health?.status ?? t("configuration.healthUnknown").toLowerCase()}
                </span>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                    state.health?.database.status === "up"
                      ? "bg-cyan-500/15 text-cyan-100"
                      : "bg-rose-500/15 text-rose-100"
                  }`}
                >
                  BD {state.health?.database.status ?? "down"}
                </span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t("configuration.rolesTitle")}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{t("configuration.rolesSubtitle")}</h3>

          <div className="mt-6 space-y-3">
            {USER_ROLES.map((role) => (
              <article key={role} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">{tUserRole(role)}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {role === "admin" && "Control total del sistema, usuarios, catalogos e inventario."}
                  {role === "manager" && "Gestion operativa de catalogos, productos, stock y movimientos."}
                  {role === "operator" && "Registro de movimientos y consulta operativa del inventario."}
                </p>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t("configuration.instance")}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{t("configuration.visibleParams")}</h3>

          <div className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-slate-400">Aplicacion</span>
              <span className="font-medium text-white">{APP_NAME}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-slate-400">API</span>
              <span className="font-medium text-white">{apiBaseUrl}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-slate-400">Categorias</span>
              <span className="font-medium text-white">{state.categories.length}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-slate-400">Almacenes</span>
              <span className="font-medium text-white">{warehouseTotal}</span>
            </div>
          </div>
        </article>
      </section>

      <DesktopWarehouseManager />

      <CategoryAttributesManager
        apiBaseUrl={apiBaseUrl}
        categories={state.categories}
        currentUser={state.currentUser}
      />
    </div>
  );
}
