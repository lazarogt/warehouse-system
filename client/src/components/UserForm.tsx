import { useEffect, useMemo, useState } from "react";
import { USER_ROLES, USER_STATUSES, type CreateUserInput, type UpdateUserInput, type User } from "../../../shared/src";
import Modal from "./Modal";
import MotionButton from "./MotionButton";

type UserFormProps = {
  open: boolean;
  mode: "create" | "edit";
  initialUser?: User | null;
  saving: boolean;
  canManageRoles: boolean;
  onCancel: () => void;
  onSubmit: (payload: CreateUserInput | UpdateUserInput) => Promise<void>;
};

type FormValues = {
  name: string;
  username: string;
  email: string;
  role: CreateUserInput["role"];
  status: CreateUserInput["status"];
  password: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const buildInitialValues = (user?: User | null): FormValues => ({
  name: user?.name ?? "",
  username: user?.username ?? "",
  email: user?.email ?? "",
  role: user?.role ?? "operator",
  status: user?.status ?? "active",
  password: "",
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/;

export default function UserForm({
  open,
  mode,
  initialUser,
  saving,
  canManageRoles,
  onCancel,
  onSubmit,
}: UserFormProps) {
  const [values, setValues] = useState<FormValues>(buildInitialValues(initialUser));
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    setValues(buildInitialValues(initialUser));
    setErrors({});
  }, [initialUser, mode]);

  const title = useMemo(() => {
    return mode === "create" ? "Crear usuario" : "Editar usuario";
  }, [mode]);
  const titleId = "user-form-title";

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (!values.name.trim()) {
      nextErrors.name = "El nombre es obligatorio.";
    }

    if (!values.username.trim()) {
      nextErrors.username = "El username es obligatorio.";
    } else if (!USERNAME_PATTERN.test(values.username.trim().toLowerCase())) {
      nextErrors.username = "Usa 3-40 caracteres con letras, numeros, punto, guion o guion bajo.";
    }

    if (!values.email.trim()) {
      nextErrors.email = "El email es obligatorio.";
    } else if (!EMAIL_PATTERN.test(values.email.trim().toLowerCase())) {
      nextErrors.email = "Ingresa un email valido.";
    }

    if (mode === "create" && values.password.length < 8) {
      nextErrors.password = "La contrasena debe tener al menos 8 caracteres.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    if (mode === "create") {
      await onSubmit({
        name: values.name.trim(),
        username: values.username.trim().toLowerCase(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        role: values.role,
        status: values.status,
      });
      return;
    }

    await onSubmit({
      name: values.name.trim(),
      username: values.username.trim().toLowerCase(),
      email: values.email.trim().toLowerCase(),
      role: values.role,
      status: values.status,
    });
  };

  return (
    <Modal open={open} onClose={onCancel} titleId={titleId}>
      <section className="rounded-[28px] border border-white/10 bg-slate-950/95 p-6 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">User Form</p>
            <h3 id={titleId} className="mt-2 text-2xl font-semibold text-white">
              {title}
            </h3>
          </div>

          <MotionButton
            aria-label="Cerrar formulario de usuario"
            onClick={onCancel}
            className="min-h-[40px] rounded-2xl border border-white/10 px-4 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Cancelar
          </MotionButton>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-5 xl:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Nombre</span>
              <input
                aria-label="Nombre del usuario"
                autoFocus
                value={values.name}
                onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                placeholder="Nombre completo"
              />
              {errors.name && <span className="text-sm text-rose-300">{errors.name}</span>}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Username</span>
              <input
                aria-label="Username del usuario"
                value={values.username}
                onChange={(event) => setValues((current) => ({ ...current, username: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                placeholder="usuario"
              />
              {errors.username && <span className="text-sm text-rose-300">{errors.username}</span>}
            </label>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Email</span>
              <input
                aria-label="Email del usuario"
                value={values.email}
                onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                placeholder="usuario@empresa.com"
                type="email"
              />
              {errors.email && <span className="text-sm text-rose-300">{errors.email}</span>}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Rol</span>
              <select
                aria-label="Rol del usuario"
                value={values.role}
                disabled={!canManageRoles}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    role: event.target.value as FormValues["role"],
                  }))
                }
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role} className="bg-slate-900">
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Estado</span>
              <select
                aria-label="Estado del usuario"
                value={values.status}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    status: event.target.value as FormValues["status"],
                  }))
                }
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              >
                {USER_STATUSES.map((status) => (
                  <option key={status} value={status} className="bg-slate-900">
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {mode === "create" && (
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Contrasena</span>
              <input
                aria-label="Contrasena del usuario"
                value={values.password}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                placeholder="Minimo 8 caracteres"
                type="password"
              />
              {errors.password && <span className="text-sm text-rose-300">{errors.password}</span>}
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <MotionButton
              aria-label={mode === "create" ? "Crear usuario" : "Guardar cambios del usuario"}
              type="submit"
              disabled={saving}
              className="min-h-[48px] rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Guardando..." : mode === "create" ? "Crear usuario" : "Guardar cambios"}
            </MotionButton>

            <p className="text-sm leading-6 text-slate-300">
              {mode === "create"
                ? "El alta de usuarios esta reservada al admin, con rol y estado definidos desde el panel."
                : "Puedes actualizar username, nombre, email, rol y estado del usuario."}
            </p>
          </div>
        </form>
      </section>
    </Modal>
  );
}
