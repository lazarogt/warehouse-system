import { useEffect, useMemo, useState } from "react";
import {
  type LowStockAlert,
  type StockMovement,
} from "../../../shared/src";
import { t, tUserRole } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import { useWarehouseContext } from "../context/WarehouseContext";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDataProvider } from "../services/data-provider";

type DashboardState = {
  loading: boolean;
  error: string | null;
  totalUsers: number;
  totalProducts: number;
  recentMovements: StockMovement[];
  lowStockAlerts: LowStockAlert[];
};

const MOVEMENT_CHART_COLORS = ["#fb923c", "#2dd4bf"];

const initialState: DashboardState = {
  loading: true,
  error: null,
  totalUsers: 0,
  totalProducts: 0,
  recentMovements: [],
  lowStockAlerts: [],
};

export default function DashboardHome() {
  const [state, setState] = useState<DashboardState>(initialState);
  const { user } = useAuth();
  const { selectedWarehouse, warehouseViewMode } = useWarehouseContext();
  const { getDashboardSnapshot, isOffline } = useDataProvider();

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const dashboardSnapshot = await getDashboardSnapshot(user?.role);

        setState({
          loading: false,
          error: null,
          totalUsers: dashboardSnapshot.totalUsers,
          totalProducts: dashboardSnapshot.totalProducts,
          recentMovements: dashboardSnapshot.recentMovements,
          lowStockAlerts: dashboardSnapshot.lowStockAlerts,
        });
      } catch (error) {
        setState({
          ...initialState,
          loading: false,
          error: error instanceof Error ? error.message : t("common.error"),
        });
      }
    };

    void loadDashboard();
  }, [getDashboardSnapshot, user?.role]);

  const lowStockProducts = useMemo(() => {
    return state.lowStockAlerts
      .sort((left, right) => left.currentStock - right.currentStock)
      .slice(0, 6);
  }, [state.lowStockAlerts]);

  const movementChartData = useMemo(() => {
    const totals = state.recentMovements.reduce(
      (accumulator, movement) => {
        if (movement.type === "entry") {
          accumulator.entry += movement.quantity;
        } else {
          accumulator.exit += movement.quantity;
        }

        return accumulator;
      },
      { entry: 0, exit: 0 },
    );

    return [
      { name: t("dashboard.entries"), value: totals.entry },
      { name: t("dashboard.exits"), value: totals.exit },
    ];
  }, [state.recentMovements]);

  const stockChartData = useMemo(() => {
    return [...state.lowStockAlerts]
      .sort((left, right) => right.currentStock - left.currentStock)
      .slice(0, 6)
      .map((item) => ({
        name: item.name.length > 12 ? `${item.name.slice(0, 12).trim()}...` : item.name,
        stock: item.currentStock,
      }));
  }, [state.lowStockAlerts]);

  const metricCards = [
    {
      title: t("dashboard.totalUsers"),
      value: state.totalUsers,
      accent: "from-cyan-400/20 to-sky-500/10",
    },
    {
      title: t("dashboard.totalProducts"),
      value: state.totalProducts,
      accent: "from-emerald-400/20 to-teal-500/10",
    },
    {
      title: t("dashboard.recentMovements"),
      value: state.recentMovements.length,
      accent: "from-orange-400/20 to-amber-500/10",
    },
    {
      title: t("dashboard.lowStockTitle"),
      value: lowStockProducts.length,
      accent: "from-rose-400/20 to-orange-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.25fr,0.95fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-panel backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300">
            {t("dashboard.metrics")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            {t("dashboard.metricsTitle")}
          </h2>
          <p className="mt-4 text-sm text-slate-300">
            {warehouseViewMode === "selected" && selectedWarehouse
              ? `${t("warehouse.active")}: ${selectedWarehouse.name}`
              : t("dashboard.metricsSubtitle")}
          </p>
          {isOffline && (
            <div className="mt-4 inline-flex rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100">
              {t("common.offlineMode")}
            </div>
          )}

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((card) => (
              <article
                key={card.title}
                className={`rounded-[24px] border border-white/10 bg-gradient-to-br ${card.accent} p-5`}
              >
                <p className="text-xs uppercase tracking-[0.24em] text-slate-300">{card.title}</p>
                <p className="mt-4 text-3xl font-semibold text-white">
                  {state.loading ? "--" : card.value}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            {t("dashboard.currentSession")}
          </p>

          {state.loading ? <p className="mt-4 text-sm text-slate-300">{t("loading.content")}</p> : null}

          {!state.loading && state.error && (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">
              {state.error}
            </div>
          )}

          {!state.loading && !state.error && user && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-lg font-bold text-white">
                  {user.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">{user.name}</p>
                  <p className="text-sm text-slate-400">{user.email}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{t("dashboard.role")}</p>
                  <p className="mt-2 font-semibold text-white">{tUserRole(user.role)}</p>
                </div>
                <div className="rounded-2xl bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{t("common.alerts")}</p>
                  <p className="mt-2 font-semibold text-white">{lowStockProducts.length}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                {t("dashboard.totalProducts")}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">{t("common.stock")}</h3>
            </div>
          </div>

          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockChartData}>
                <XAxis dataKey="name" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{
                    background: "#08111f",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "16px",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="stock" radius={[10, 10, 0, 0]} fill="#2dd4bf" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t("dashboard.recentMovements")}</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{t("dashboard.movementBalance")}</h3>

          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={movementChartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                >
                  {movementChartData.map((entry, index) => (
                    <Cell key={entry.name} fill={MOVEMENT_CHART_COLORS[index % MOVEMENT_CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#08111f",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "16px",
                    color: "#fff",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {movementChartData.map((item, index) => (
              <div key={item.name} className="rounded-2xl bg-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: MOVEMENT_CHART_COLORS[index % MOVEMENT_CHART_COLORS.length] }}
                  />
                  <p className="text-sm text-slate-300">{item.name}</p>
                </div>
                <p className="mt-2 text-xl font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <article className="rounded-[28px] border border-white/10 bg-gradient-to-br from-rose-500/15 to-orange-500/10 p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-200">{t("common.alerts")}</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{t("dashboard.lowStockTitle")}</h3>
            </div>
            <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-rose-100">
              {t("app.lowStock")}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {lowStockProducts.length === 0 && !state.loading && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                {t("dashboard.noLowStock")}
              </div>
            )}

            {lowStockProducts.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">{item.name}</p>
                    <p className="mt-1 text-sm text-slate-300">{item.categoryName}</p>
                    {item.warehouseName ? (
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-cyan-200">
                        {t("common.warehouse")}: {item.warehouseName}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-rose-500/15 px-3 py-1 text-sm font-semibold text-rose-100">
                    {item.currentStock}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t("dashboard.latest")}</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{t("dashboard.recentMovements")}</h3>

          <div className="mt-6 overflow-hidden rounded-[24px] border border-white/10">
            <div className="grid grid-cols-[1.2fr,0.9fr,0.7fr,1fr] gap-3 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.22em] text-slate-400">
                <span>{t("warehouse.product")}</span>
                <span>{t("common.warehouse")}</span>
                <span>{t("common.type")}</span>
                <span>{t("common.date")}</span>
            </div>

            <div className="divide-y divide-white/10">
              {state.recentMovements.length === 0 && !state.loading && (
                <div className="px-4 py-5 text-sm text-slate-300">{t("dashboard.noMovements")}</div>
              )}

              {state.recentMovements.map((movement) => (
                <div
                  key={movement.id}
                  className="grid grid-cols-[1.2fr,0.9fr,0.7fr,1fr] gap-3 px-4 py-4 text-sm text-slate-200"
                >
                  <span>{movement.productName}</span>
                  <span>{movement.warehouseName}</span>
                  <span
                    className={
                      movement.type === "entry" ? "text-emerald-300" : "text-orange-300"
                    }
                  >
                    {movement.type === "entry" ? t("dashboard.entries") : t("dashboard.exits")}
                  </span>
                  <span>{new Date(movement.movementDate).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
