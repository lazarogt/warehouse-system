import { useEffect, useMemo, useState } from "react";
import {
  APP_NAME,
  APP_VERSION,
  USER_ROLES,
  type Category,
  type HealthResponse,
  type ProductListResponse,
  type User,
  type Warehouse,
} from "../../../shared/src";
import { useAuth } from "../auth/AuthProvider";
import { createApiClient } from "../lib/api";
import CategoryAttributesManager from "./CategoryAttributesManager";

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
  warehouses: Warehouse[];
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
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const { user: currentUser } = useAuth();
  const [state, setState] = useState<ConfigurationState>(initialState);

  useEffect(() => {
    const loadConfiguration = async () => {
      try {
        const [health, users, categories, warehouses, products] = await Promise.all([
          api.get<HealthResponse>("/health"),
          currentUser?.role === "admin" ? api.get<User[]>("/users") : Promise.resolve([]),
          api.get<Category[]>("/categories"),
          api.get<Warehouse[]>("/warehouses"),
          api.get<ProductListResponse>("/products?page=1&pageSize=1"),
        ]);

        setState({
          loading: false,
          error: null,
          currentUser,
          health,
          users,
          categories,
          warehouses,
          productsTotal: products.total,
        });
      } catch (error) {
        setState({
          ...initialState,
          loading: false,
          error: error instanceof Error ? error.message : "No se pudo cargar la configuracion.",
        });
      }
    };

    void loadConfiguration();
  }, [api, currentUser]);

  if (state.loading) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
        <p className="text-sm text-slate-300">Cargando configuracion...</p>
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
          <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Configuracion</p>
          <h3 className="mt-2 text-3xl font-semibold text-white">Estado general del sistema</h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Resumen tecnico del panel y de los modulos disponibles para la operacion actual.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Version</p>
              <p className="mt-3 text-2xl font-semibold text-white">{APP_VERSION}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Usuarios</p>
              <p className="mt-3 text-2xl font-semibold text-white">{state.users.length}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Productos</p>
              <p className="mt-3 text-2xl font-semibold text-white">{state.productsTotal}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Almacenes</p>
              <p className="mt-3 text-2xl font-semibold text-white">{state.warehouses.length}</p>
            </article>
          </div>
        </article>

        <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Sesion y salud</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Operacion estable</h3>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Usuario actual</p>
              <p className="mt-3 text-lg font-semibold text-white">{state.currentUser?.name ?? "Sin sesion"}</p>
              <p className="mt-1 text-sm text-slate-400">{state.currentUser?.role ?? "no disponible"}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Health API</p>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                    state.health?.status === "ok"
                      ? "bg-emerald-500/15 text-emerald-100"
                      : "bg-rose-500/15 text-rose-100"
                  }`}
                >
                  {state.health?.status ?? "desconocido"}
                </span>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                    state.health?.database.status === "up"
                      ? "bg-cyan-500/15 text-cyan-100"
                      : "bg-rose-500/15 text-rose-100"
                  }`}
                >
                  DB {state.health?.database.status ?? "down"}
                </span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Roles</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Matriz de acceso</h3>

          <div className="mt-6 space-y-3">
            {USER_ROLES.map((role) => (
              <article key={role} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">{role}</p>
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
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Instancia</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Parametros visibles</h3>

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
              <span className="font-medium text-white">{state.warehouses.length}</span>
            </div>
          </div>
        </article>
      </section>

      <CategoryAttributesManager
        apiBaseUrl={apiBaseUrl}
        categories={state.categories}
        currentUser={state.currentUser}
      />
    </div>
  );
}
