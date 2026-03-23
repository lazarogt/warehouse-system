import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CreateUserInput,
  ResetPasswordResponse,
  UpdateUserInput,
  User,
} from "../../../shared/src";
import { useAuth } from "../auth/AuthProvider";
import { createApiClient } from "../lib/api";
import { safeArray } from "../lib/format";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import SectionLoader from "./SectionLoader";
import SectionNotice from "./SectionNotice";
import { useToast } from "./ToastProvider";
import UserForm from "./UserForm";
import UserList from "./UserList";
import MotionButton from "./MotionButton";

type UsersSectionProps = {
  apiBaseUrl: string;
};

type UsersSectionState = {
  loading: boolean;
  saving: boolean;
  deletingUserId: number | null;
  resettingUserId: number | null;
  error: string | null;
  users: User[];
};

const initialState: UsersSectionState = {
  loading: true,
  saving: false,
  deletingUserId: null,
  resettingUserId: null,
  error: null,
  users: [],
};

type FormMode = "create" | "edit";

export default function UsersSection({ apiBaseUrl }: UsersSectionProps) {
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState<UsersSectionState>(initialState);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);
  const [pendingResetUser, setPendingResetUser] = useState<User | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<ResetPasswordResponse | null>(null);
  const isAdmin = currentUser?.role === "admin";

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        users: [],
      }));
      return;
    }

    try {
      const users = await api.get<User[]>("/users");

      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        users: safeArray(users),
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudieron cargar los usuarios.";

      setState((current) => ({
        ...current,
        loading: false,
        error: message,
      }));
    }
  }, [api, isAdmin]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleOpenCreate = () => {
    setFormMode("create");
    setEditingUser(null);
    setShowForm(true);
  };

  const handleOpenEdit = (user: User) => {
    setFormMode("edit");
    setEditingUser(user);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormMode("create");
  };

  const handleSubmit = async (payload: CreateUserInput | UpdateUserInput) => {
    if (state.saving) {
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    try {
      if (formMode === "create") {
        await api.post<User>("/users", payload);
        notify({
          type: "success",
          title: "Usuario creado",
          message: "El usuario se registro correctamente.",
        });
      } else if (editingUser) {
        await api.put<User>(`/users/${editingUser.id}`, payload);
        notify({
          type: "success",
          title: "Usuario actualizado",
          message: `Se actualizaron los datos de ${editingUser.name}.`,
        });
      }

      handleCloseForm();
      await loadUsers();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo guardar el usuario.";

      setState((current) => ({
        ...current,
        saving: false,
        error: message,
      }));
      notify({
        type: "error",
        title: "No se pudo guardar el usuario",
        message,
      });
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  const handleDelete = async (user: User) => {
    if (state.deletingUserId !== null) {
      return;
    }

    setPendingDeleteUser(user);
  };

  const handleResetPassword = (user: User) => {
    if (state.resettingUserId !== null) {
      return;
    }

    setPendingResetUser(user);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteUser || state.deletingUserId !== null) {
      return;
    }

    setState((current) => ({
      ...current,
      deletingUserId: pendingDeleteUser.id,
      error: null,
    }));

    try {
      await api.delete(`/users/${pendingDeleteUser.id}`);
      await loadUsers();
      notify({
        type: "success",
        title: "Usuario eliminado",
        message: `Se elimino ${pendingDeleteUser.name}.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo eliminar el usuario.";

      setState((current) => ({
        ...current,
        deletingUserId: null,
        error: message,
      }));
      notify({
        type: "error",
        title: "No se pudo eliminar el usuario",
        message,
      });
      return;
    }

    setState((current) => ({
      ...current,
      deletingUserId: null,
    }));
    setPendingDeleteUser(null);
  };

  const handleConfirmResetPassword = async () => {
    if (!pendingResetUser || state.resettingUserId !== null) {
      return;
    }

    setState((current) => ({
      ...current,
      resettingUserId: pendingResetUser.id,
      error: null,
    }));

    try {
      const result = await api.put<ResetPasswordResponse>(
        `/users/${pendingResetUser.id}/reset-password`,
        {},
      );
      setResetPasswordResult(result.temporaryPassword ? result : null);
      notify({
        type: "success",
        title: "Password reseteada",
        message: result.temporaryPassword
          ? `Se genero una password temporal para ${pendingResetUser.username}.`
          : result.message,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo resetear la password.";

      setState((current) => ({
        ...current,
        resettingUserId: null,
        error: message,
      }));
      notify({
        type: "error",
        title: "No se pudo resetear la password",
        message,
      });
      return;
    }

    setState((current) => ({
      ...current,
      resettingUserId: null,
    }));
    setPendingResetUser(null);
  };

  if (state.loading) {
    return <SectionLoader label="Cargando gestion de usuarios..." />;
  }

  if (!isAdmin) {
    return (
      <SectionNotice
        title="Acceso restringido"
        message="Esta seccion esta disponible unicamente para usuarios con rol admin."
        tone="warning"
      />
    );
  }

  return (
    <div className="space-y-6">
      {state.error && (
        <SectionNotice title="Error" message={state.error} tone="error" />
      )}

      <UserList
        users={state.users}
        loading={state.loading}
        deletingUserId={state.deletingUserId}
        resettingUserId={state.resettingUserId}
        currentUserId={currentUser?.id}
        canManage={isAdmin}
        onCreate={handleOpenCreate}
        onEdit={handleOpenEdit}
        onDelete={handleDelete}
        onResetPassword={handleResetPassword}
      />

      <UserForm
        open={showForm}
        mode={formMode}
        initialUser={editingUser}
        saving={state.saving}
        canManageRoles={isAdmin}
        onCancel={handleCloseForm}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteUser)}
        title="Eliminar usuario"
        description={
          pendingDeleteUser
            ? `Vas a eliminar a ${pendingDeleteUser.name}. Esta accion no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar usuario"
        confirming={pendingDeleteUser ? state.deletingUserId === pendingDeleteUser.id : false}
        onCancel={() => setPendingDeleteUser(null)}
        onConfirm={() => void handleConfirmDelete()}
      />

      <ConfirmDialog
        open={Boolean(pendingResetUser)}
        title="Resetear password"
        description={
          pendingResetUser
            ? `Se generara una password temporal nueva para ${pendingResetUser.username}. La sesion actual de ese usuario se cerrara.`
            : ""
        }
        confirmLabel="Resetear password"
        confirming={pendingResetUser ? state.resettingUserId === pendingResetUser.id : false}
        onCancel={() => setPendingResetUser(null)}
        onConfirm={() => void handleConfirmResetPassword()}
      />

      <Modal
        open={Boolean(resetPasswordResult)}
        onClose={() => setResetPasswordResult(null)}
        titleId="reset-password-result"
      >
        <section className="rounded-[28px] border border-white/10 bg-slate-950/95 p-6 shadow-panel">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-amber-200">Password temporal</p>
              <h3 id="reset-password-result" className="mt-2 text-2xl font-semibold text-white">
                Nueva credencial generada
              </h3>
            </div>

            <MotionButton
              aria-label="Cerrar modal de password temporal"
              onClick={() => setResetPasswordResult(null)}
              className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5"
            >
              Cerrar
            </MotionButton>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5">
            <p className="text-sm text-amber-50">
              Esta password se muestra una sola vez. Usuario:{" "}
              <strong>{resetPasswordResult?.username}</strong>
            </p>
            <p className="mt-4 rounded-2xl bg-slate-950/70 px-4 py-3 font-mono text-lg font-semibold text-white">
              {resetPasswordResult?.temporaryPassword}
            </p>
          </div>
        </section>
      </Modal>
    </div>
  );
}
