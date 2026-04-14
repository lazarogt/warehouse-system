import { memo } from "react";
import type { User } from "../../../shared/src";
import { safeText } from "../lib/format";
import MotionButton from "./MotionButton";

type UserListProps = {
  users: User[];
  loading: boolean;
  deletingUserId: number | null;
  resettingUserId: number | null;
  currentUserId?: number;
  canManage: boolean;
  onCreate: () => void;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onResetPassword: (user: User) => void;
};

const roleLabelStyles: Record<User["role"], string> = {
  admin: "bg-orange-500/15 text-orange-200",
  manager: "bg-cyan-500/15 text-cyan-200",
  operator: "bg-emerald-500/15 text-emerald-200",
};

const statusLabelStyles: Record<User["status"], string> = {
  active: "bg-emerald-500/15 text-emerald-200",
  inactive: "bg-slate-500/20 text-slate-200",
};

function UserList({
  users,
  loading,
  deletingUserId,
  resettingUserId,
  currentUserId,
  canManage,
  onCreate,
  onEdit,
  onDelete,
  onResetPassword,
}: UserListProps) {
  return (
    <section className="panel-surface">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="toolbar-label">User List</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Gestion de usuarios</h3>
          <p className="mt-2 text-sm text-slate-300">
            CRUD administrativo de usuarios con roles y estado.
          </p>
        </div>

        {canManage && (
          <MotionButton
            aria-label="Crear nuevo usuario"
            onClick={onCreate}
            className="min-h-[44px] rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-400"
          >
            Nuevo usuario
          </MotionButton>
        )}
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="table-fixed w-full min-w-[920px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
              <th className="px-5 py-4 font-medium">Nombre</th>
              <th className="px-5 py-4 font-medium">Email</th>
              <th className="px-5 py-4 font-medium">Rol</th>
              <th className="px-5 py-4 font-medium">Estado</th>
              <th className="w-40 px-5 py-4 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-sm text-slate-300">
                  Cargando usuarios...
                </td>
              </tr>
            )}

            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-sm text-slate-300">
                  No hay usuarios registrados.
                </td>
              </tr>
            )}

            {!loading &&
              users.map((user) => {
                const isCurrentUser = currentUserId === user.id;
                const isDeleting = deletingUserId === user.id;

                return (
                  <tr
                    key={user.id}
                    className="border-t border-white/10 align-top hover:bg-white/[0.035]"
                  >
                    <td className="px-5 py-5">
                      <div>
                        <p className="truncate text-sm font-semibold text-white">
                          {safeText(user.name, "Usuario sin nombre")}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-400">@{safeText(user.username, "sin-username")}</p>
                        {isCurrentUser && (
                          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-cyan-300">
                            Sesion actual
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-5 text-sm text-slate-200">
                      <span className="block truncate">{safeText(user.email, "Sin email")}</span>
                    </td>
                    <td className="px-5 py-5">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${roleLabelStyles[user.role]}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-5">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusLabelStyles[user.status]}`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="w-40 px-5 py-5 text-right">
                      <div className="flex flex-col items-end gap-2 flex-none">
                        {canManage && (
                          <>
                            <MotionButton
                              aria-label={`Resetear password de ${user.name}`}
                              disabled={resettingUserId === user.id}
                              onClick={() => onResetPassword(user)}
                              className="min-h-[40px] w-32 rounded-xl border border-amber-400/20 px-3.5 text-sm text-amber-100 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {resettingUserId === user.id ? "Reseteando..." : "Reset Password"}
                            </MotionButton>
                            <MotionButton
                              aria-label={`Editar usuario ${user.name}`}
                              onClick={() => onEdit(user)}
                              className="min-h-[40px] w-32 rounded-xl border border-white/10 px-3.5 text-sm text-slate-200 transition hover:bg-white/5 hover:text-white"
                            >
                              Editar
                            </MotionButton>
                            <MotionButton
                              aria-label={`Eliminar usuario ${user.name}`}
                              disabled={isCurrentUser || isDeleting}
                              onClick={() => onDelete(user)}
                              className="min-h-[40px] w-32 rounded-xl border border-rose-400/20 px-3.5 text-sm text-rose-200 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isDeleting ? "Eliminando..." : "Eliminar"}
                            </MotionButton>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default memo(UserList);
