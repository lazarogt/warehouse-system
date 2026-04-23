import { useCallback, useEffect, useState } from "react";
import type {
  CreateUserInput,
  ResetPasswordResponse,
  UpdateUserInput,
  User,
} from "../../../shared/src";
import { t } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import { safeArray } from "../lib/format";
import { useDataProvider } from "../services/data-provider";
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
  const { http } = useDataProvider();
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
      const users = await http.get<User[]>("/users");

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
  }, [http, isAdmin]);

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
        await http.post<User>("/users", payload);
        notify({
          type: "success",
          title: t("users.createSuccess"),
          message: t("users.createSuccessText"),
        });
      } else if (editingUser) {
        await http.put<User>(`/users/${editingUser.id}`, payload);
        notify({
          type: "success",
          title: t("users.updateSuccess"),
          message: `${t("users.updateSuccessText")} ${editingUser.name}.`,
        });
      }

      handleCloseForm();
      await loadUsers();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("users.createError");

      setState((current) => ({
        ...current,
        saving: false,
        error: message,
      }));
      notify({
        type: "error",
        title: t("users.createError"),
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
      await http.delete(`/users/${pendingDeleteUser.id}`);
      await loadUsers();
      notify({
        type: "success",
        title: t("users.deleteSuccess"),
        message: `${t("users.deleteSuccessText")} ${pendingDeleteUser.name}.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("users.deleteError");

      setState((current) => ({
        ...current,
        deletingUserId: null,
        error: message,
      }));
      notify({
        type: "error",
        title: t("users.deleteError"),
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
      const result = await http.put<ResetPasswordResponse>(
        `/users/${pendingResetUser.id}/reset-password`,
        {},
      );
      setResetPasswordResult(result.temporaryPassword ? result : null);
      notify({
        type: "success",
        title: t("users.resetPassword"),
        message: result.temporaryPassword
          ? `${t("users.passwordReset")} ${pendingResetUser.username}.`
          : result.message,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("users.resetPassword");

      setState((current) => ({
        ...current,
        resettingUserId: null,
        error: message,
      }));
      notify({
        type: "error",
        title: t("users.resetPassword"),
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
    return <SectionLoader label={`${t("loading.section")} ${t("users.list").toLowerCase()}...`} />;
  }

  if (!isAdmin) {
    return (
      <SectionNotice
        title={t("common.error")}
        message={t("users.onlyAdmin")}
        tone="warning"
      />
    );
  }

  return (
    <div className="space-y-6">
      {state.error && (
        <SectionNotice title={t("common.error")} message={state.error} tone="error" />
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
        title={t("users.deleteConfirm")}
        description={
          pendingDeleteUser
            ? `${t("users.deleteConfirm")}: ${pendingDeleteUser.name}.`
            : ""
        }
        confirmLabel={t("users.deleteConfirm")}
        confirming={pendingDeleteUser ? state.deletingUserId === pendingDeleteUser.id : false}
        onCancel={() => setPendingDeleteUser(null)}
        onConfirm={() => void handleConfirmDelete()}
      />

      <ConfirmDialog
        open={Boolean(pendingResetUser)}
        title={t("users.resetPassword")}
        description={
          pendingResetUser
            ? `${t("users.passwordReset")}: ${pendingResetUser.username}.`
            : ""
        }
        confirmLabel={t("users.resetPassword")}
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
              <p className="text-xs uppercase tracking-[0.24em] text-amber-200">{t("users.passwordReset")}</p>
              <h3 id="reset-password-result" className="mt-2 text-2xl font-semibold text-white">
                {t("users.resetPassword")}
              </h3>
            </div>

            <MotionButton
              aria-label={t("common.close")}
              onClick={() => setResetPasswordResult(null)}
              className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5"
            >
              {t("common.close")}
            </MotionButton>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5">
            <p className="text-sm text-amber-50">
              {t("users.passwordReset")}:{" "}
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
