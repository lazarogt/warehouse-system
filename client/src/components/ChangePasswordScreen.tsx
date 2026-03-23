import { useMemo, useState } from "react";
import type { AuthResponse, ChangePasswordInput, User } from "../../../shared/src";
import { createApiClient } from "../lib/api";
import MotionButton from "./MotionButton";
import { useToast } from "./ToastProvider";

type ChangePasswordScreenProps = {
  apiBaseUrl: string;
  user: User;
  onPasswordChanged: (user: User) => void;
  onLogout: () => Promise<void>;
};

type FormErrors = Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string>>;

export default function ChangePasswordScreen({
  apiBaseUrl,
  user,
  onPasswordChanged,
  onLogout,
}: ChangePasswordScreenProps) {
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const { notify } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (!currentPassword) {
      nextErrors.currentPassword = "La contraseña actual es obligatoria.";
    }

    if (newPassword.length < 8) {
      nextErrors.newPassword = "La nueva contraseña debe tener al menos 8 caracteres.";
    }

    if (newPassword === currentPassword) {
      nextErrors.newPassword = "La nueva contraseña debe ser distinta a la actual.";
    }

    if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = "La confirmación no coincide.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setSaving(true);

    try {
      const response = await api.post<AuthResponse>("/auth/change-password", {
        currentPassword,
        newPassword,
      } satisfies ChangePasswordInput);

      notify({
        type: "success",
        title: "Contraseña actualizada",
        message: "Ya puedes continuar al dashboard.",
      });
      onPasswordChanged(response.user);
    } catch (error) {
      notify({
        type: "error",
        title: "No se pudo cambiar la contraseña",
        message: error instanceof Error ? error.message : "Inténtalo de nuevo.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink bg-grid px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <section className="w-full max-w-2xl rounded-[32px] border border-white/10 bg-slate-950/85 p-8 shadow-panel">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-200">Cambio obligatorio</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Actualiza tu contraseña</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            La cuenta <strong>@{user.username}</strong> requiere una nueva contraseña antes de usar
            el dashboard. Esta medida se activa tras un reset administrativo.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Contraseña actual</span>
              <input
                aria-label="Contraseña actual"
                autoFocus
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              {errors.currentPassword && (
                <span className="text-sm text-rose-300">{errors.currentPassword}</span>
              )}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Nueva contraseña</span>
              <input
                aria-label="Nueva contraseña"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              {errors.newPassword && <span className="text-sm text-rose-300">{errors.newPassword}</span>}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Confirmar nueva contraseña</span>
              <input
                aria-label="Confirmar nueva contraseña"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              {errors.confirmPassword && (
                <span className="text-sm text-rose-300">{errors.confirmPassword}</span>
              )}
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <MotionButton
                aria-label="Guardar nueva contraseña"
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? "Guardando..." : "Cambiar contraseña"}
              </MotionButton>
              <MotionButton
                aria-label="Cerrar sesión"
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/5"
                onClick={() => void onLogout()}
                type="button"
              >
                Logout
              </MotionButton>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
