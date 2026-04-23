import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { APP_NAME, APP_VERSION } from "../../shared/src/constants/app";
import { t, tUserRole } from "./i18n";
import { useAuth } from "./auth/AuthProvider";
import AuthGuard from "./components/AuthGuard";
import MotionButton from "./components/MotionButton";
import SectionLoader from "./components/SectionLoader";
import { useToast } from "./components/ToastProvider";
import WarehouseWorkspaceBar from "./components/WarehouseWorkspaceBar";
import { useWarehouseContext } from "./context/WarehouseContext";
import { useDataProvider } from "./services/data-provider";

const DashboardHome = lazy(() => import("./components/DashboardHome"));
const UsersSection = lazy(() => import("./components/UsersSection"));
const ProductsSection = lazy(() => import("./components/ProductsSection"));
const InventorySection = lazy(() => import("./components/InventorySection"));
const MovementsSection = lazy(() => import("./components/MovementsSection"));
const ConfigurationSection = lazy(() => import("./components/ConfigurationSection"));
const LocationsSection = lazy(() => import("./components/LocationsSection"));
const TransfersSection = lazy(() => import("./components/TransfersSection"));
const DispatchSection = lazy(() => import("./components/DispatchSection"));
const AdjustmentsSection = lazy(() => import("./components/AdjustmentsSection"));
const CycleCountsSection = lazy(() => import("./components/CycleCountsSection"));

type SectionId =
  | "dashboard"
  | "usuarios"
  | "productos"
  | "inventario"
  | "movimientos"
  | "ubicaciones"
  | "transferencias"
  | "despacho"
  | "ajustes"
  | "conteos"
  | "configuracion";

type Section = {
  id: SectionId;
  label: string;
  description: string;
};

const sections: Section[] = [
  {
    id: "dashboard",
    label: t("sections.dashboard.label"),
    description: t("sections.dashboard.description"),
  },
  {
    id: "usuarios",
    label: t("sections.usuarios.label"),
    description: t("sections.usuarios.description"),
  },
  {
    id: "productos",
    label: t("sections.productos.label"),
    description: t("sections.productos.description"),
  },
  {
    id: "inventario",
    label: t("sections.inventario.label"),
    description: t("sections.inventario.description"),
  },
  {
    id: "movimientos",
    label: t("sections.movimientos.label"),
    description: t("sections.movimientos.description"),
  },
  {
    id: "ubicaciones",
    label: t("sections.ubicaciones.label"),
    description: t("sections.ubicaciones.description"),
  },
  {
    id: "transferencias",
    label: t("sections.transferencias.label"),
    description: t("sections.transferencias.description"),
  },
  {
    id: "despacho",
    label: t("sections.despacho.label"),
    description: t("sections.despacho.description"),
  },
  {
    id: "ajustes",
    label: t("sections.ajustes.label"),
    description: t("sections.ajustes.description"),
  },
  {
    id: "conteos",
    label: t("sections.conteos.label"),
    description: t("sections.conteos.description"),
  },
  {
    id: "configuracion",
    label: t("sections.configuracion.label"),
    description: t("sections.configuracion.description"),
  },
];

const sectionAccent: Record<SectionId, string> = {
  dashboard: "from-orange-500/20 to-cyan-400/10",
  usuarios: "from-cyan-400/20 to-sky-500/10",
  productos: "from-emerald-400/20 to-teal-500/10",
  inventario: "from-indigo-400/20 to-cyan-300/10",
  movimientos: "from-amber-400/20 to-orange-400/10",
  ubicaciones: "from-violet-400/20 to-fuchsia-500/10",
  transferencias: "from-emerald-400/20 to-lime-500/10",
  despacho: "from-cyan-400/20 to-emerald-500/10",
  ajustes: "from-rose-400/20 to-orange-500/10",
  conteos: "from-sky-400/20 to-indigo-500/10",
  configuracion: "from-slate-300/20 to-zinc-400/10",
};

export default function App() {
  const { apiBaseUrl, logout, user: currentUser } = useAuth();
  const {
    selectedWarehouse,
    selectedWarehouseId,
    warehouseViewMode,
    selectWarehouseViewMode,
  } = useWarehouseContext();
  const { getLowStockCount, isOffline } = useDataProvider();
  const { notify } = useToast();
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);

  const availableSections = useMemo(() => {
    if (currentUser?.role === "admin") {
      return sections;
    }

    return sections.filter((section) => section.id !== "usuarios");
  }, [currentUser]);

  const selectedSection =
    availableSections.find((section) => section.id === activeSection) ?? availableSections[0];

  useEffect(() => {
    const loadLowStockCount = async () => {
      if (!currentUser || currentUser.mustChangePassword) {
        setLowStockCount(0);
        return;
      }

      try {
        const count = await getLowStockCount();
        setLowStockCount(count);
      } catch {
        setLowStockCount(0);
      }
    };

    const handleRefresh = () => {
      void loadLowStockCount();
    };

    void loadLowStockCount();
    window.addEventListener("alerts:refresh", handleRefresh);

    return () => {
      window.removeEventListener("alerts:refresh", handleRefresh);
    };
  }, [activeSection, currentUser, getLowStockCount]);

  useEffect(() => {
    if (!availableSections.find((section) => section.id === activeSection)) {
      setActiveSection("dashboard");
    }
  }, [activeSection, availableSections]);

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await logout();
    } catch (error) {
      notify({
        type: "error",
        title: t("app.noSessionCloseError"),
        message: error instanceof Error ? error.message : t("app.retry"),
      });
    } finally {
      setLoggingOut(false);
    }
  };

  const renderMainContent = () => {
    if (selectedSection.id === "dashboard") {
      return <DashboardHome />;
    }

    if (selectedSection.id === "usuarios") {
      return <UsersSection apiBaseUrl={apiBaseUrl} />;
    }

    if (selectedSection.id === "productos") {
      return <ProductsSection apiBaseUrl={apiBaseUrl} />;
    }

    if (selectedSection.id === "inventario" || selectedSection.id === "movimientos") {
      return selectedSection.id === "inventario" ? (
        <InventorySection apiBaseUrl={apiBaseUrl} />
      ) : (
        <MovementsSection apiBaseUrl={apiBaseUrl} />
      );
    }

    if (selectedSection.id === "ubicaciones") {
      return <LocationsSection apiBaseUrl={apiBaseUrl} />;
    }

    if (selectedSection.id === "transferencias") {
      return <TransfersSection apiBaseUrl={apiBaseUrl} />;
    }

    if (selectedSection.id === "despacho") {
      return <DispatchSection apiBaseUrl={apiBaseUrl} />;
    }

    if (selectedSection.id === "ajustes") {
      return <AdjustmentsSection apiBaseUrl={apiBaseUrl} />;
    }

    if (selectedSection.id === "conteos") {
      return <CycleCountsSection apiBaseUrl={apiBaseUrl} />;
    }

    if (selectedSection.id === "configuracion") {
      return <ConfigurationSection apiBaseUrl={apiBaseUrl} />;
    }

    return (
      <section
        className={`rounded-[30px] border border-white/10 bg-gradient-to-br ${sectionAccent[selectedSection.id]} p-6 shadow-panel sm:p-8`}
      >
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-200">
            {t("app.activeSection")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">{selectedSection.label}</h2>
          <p className="mt-4 text-sm leading-7 text-slate-200 sm:text-base">
            {selectedSection.description}
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <article className="rounded-[24px] border border-white/10 bg-slate-950/45 p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t("app.mainContent")}</p>
            <p className="mt-3 text-lg font-semibold text-white">{t("app.sectionPlaceholder")}</p>
          </article>

          <article className="rounded-[24px] border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t("app.navReady")}</p>
            <p className="mt-3 text-lg font-semibold text-white">{t("app.navReadyText")}</p>
          </article>
        </div>
      </section>
    );
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-ink bg-grid text-white">
        <div className="min-h-screen bg-[linear-gradient(180deg,rgba(8,17,31,0.86),rgba(8,17,31,0.96))]">
          <div className="flex min-h-screen">
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <aside
            className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[86vw] border-r border-white/10 bg-slate-950/90 px-5 py-6 shadow-panel transition-transform duration-300 lg:static lg:w-72 lg:translate-x-0 lg:bg-slate-950/70 ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between lg:block">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-orange-300">
                  {t("app.adminPanel")}
                </p>
                <h1 className="mt-3 text-2xl font-semibold">{APP_NAME}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {t("app.sidebarReady")}
                </p>
              </div>

              <MotionButton
                aria-label={t("common.close")}
                onClick={() => setSidebarOpen(false)}
                className="rounded-full border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.22em] text-slate-300 lg:hidden"
              >
                {t("common.close")}
              </MotionButton>
            </div>

            <nav className="mt-10 space-y-2">
              {availableSections.map((section) => {
                const isActive = section.id === activeSection;

                return (
                  <button
                    key={section.id}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    aria-label={section.label}
                    onClick={() => {
                      setActiveSection(section.id);
                      setSidebarOpen(false);
                    }}
                    className={`ui-button relative flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ${
                      isActive
                        ? "text-ink shadow-lg"
                        : "bg-white/0 text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute inset-0 rounded-2xl bg-white" />
                    )}
                    <span className="relative z-10 font-medium">{section.label}</span>
                    <div className="relative z-10 flex items-center gap-2">
                      {(section.id === "inventario" || section.id === "dashboard") && lowStockCount > 0 && (
                        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                          {lowStockCount}
                        </span>
                      )}
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          isActive ? "bg-orange-500" : "bg-slate-600"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </nav>

            <div className="mt-10 rounded-[24px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.26em] text-slate-400">{t("app.version")}</p>
              <p className="mt-3 text-lg font-semibold text-white">{APP_VERSION}</p>
              <p className="mt-2 text-sm text-slate-400">{t("app.sidebarReady")}</p>
            </div>
          </aside>

          <div className="flex min-h-screen flex-1 flex-col lg:pl-0">
            <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/65 px-4 py-4 backdrop-blur xl:px-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <MotionButton
                    aria-label={t("app.menu")}
                    onClick={() => setSidebarOpen(true)}
                    className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 lg:hidden"
                  >
                    {t("app.menu")}
                  </MotionButton>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
                      {selectedSection.label}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {selectedWarehouse
                        ? `${t("warehouse.active")}: ${selectedWarehouse.name}`
                        : t("app.operationReadyEmpty")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {isOffline && (
                    <div className="rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100">
                      {t("common.offlineMode")}
                    </div>
                  )}
                  <div className="inline-flex overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-1">
                    <button
                      type="button"
                      aria-pressed={warehouseViewMode === "selected"}
                      disabled={!selectedWarehouseId}
                      onClick={() => selectWarehouseViewMode("selected")}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                        warehouseViewMode === "selected"
                          ? "bg-white text-ink"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {t("common.thisWarehouse")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={warehouseViewMode === "all"}
                      onClick={() => selectWarehouseViewMode("all")}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                        warehouseViewMode === "all"
                          ? "bg-white text-ink"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {t("common.allWarehouses")}
                    </button>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      {t("app.userLogged")}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
                        {currentUser
                          ? currentUser.name
                              .split(" ")
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)
                          : "--"}
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {currentUser?.name ?? t("app.noSession")}
                        </p>
                        <p className="text-sm text-slate-400">
                          {currentUser?.role ? tUserRole(currentUser.role) : t("app.sessionRequired")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {currentUser && (
                    <MotionButton
                      aria-label={t("common.logout")}
                      onClick={() => void handleLogout()}
                      disabled={loggingOut}
                      className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400"
                    >
                      {loggingOut ? `${t("common.processing")}...` : t("common.logout")}
                    </MotionButton>
                  )}
                </div>
              </div>
            </header>

            <main className="flex-1 px-4 py-6 xl:px-8 xl:py-8">
              <WarehouseWorkspaceBar />
              <Suspense fallback={<SectionLoader />}>
                <div key={selectedSection.id} className="mt-6">
                  {renderMainContent()}
                </div>
              </Suspense>
            </main>
          </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
