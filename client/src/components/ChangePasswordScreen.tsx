import { useState } from "react";
import type { AuthResponse, ChangePasswordInput, User } from "../../../shared/src";
import { t } from "../i18n";
import { useDataProvider } from "../services/data-provider";
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
  const { http } = useDataProvider();
  const { notify } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (!currentPassword) {
      nextErrors.currentPassword = t("auth.currentPasswordRequired");
    }

    if (newPassword.length < 8) {
      nextErrors.newPassword = t("auth.newPasswordLength");
    }

    if (newPassword === currentPassword) {
      nextErrors.newPassword = t("auth.newPasswordDifferent");
    }

    if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = t("auth.passwordMismatch");
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
      const response = await http.post<AuthResponse>("/auth/change-password", {
        currentPassword,
        newPassword,
      } satisfies ChangePasswordInput);

      notify({
        type: "success",
        title: t("auth.changePassword"),
        message: t("auth.passwordChanged"),
      });
      onPasswordChanged(response.user);
    } catch (error) {
      notify({
        type: "error",
        title: t("auth.changePasswordError"),
        message: error instanceof Error ? error.message : t("app.retry"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink bg-grid px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <section className="w-full max-w-2xl rounded-[32px] border border-white/10 bg-slate-950/85 p-8 shadow-panel">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-200">{t("auth.mandatoryChange")}</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">{t("auth.changePassword")}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            <strong>@{user.username}</strong> · {t("auth.mandatoryChangeSubtitle")}
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">{t("auth.currentPassword")}</span>
              <input
                aria-label={t("auth.currentPassword")}
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
              <span className="text-sm font-medium text-slate-200">{t("auth.newPassword")}</span>
              <input
                aria-label={t("auth.newPassword")}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              {errors.newPassword ? <span className="text-sm text-rose-300">{errors.newPassword}</span> : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">{t("auth.confirmNewPassword")}</span>
              <input
                aria-label={t("auth.confirmNewPassword")}
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
                aria-label={t("auth.changePassword")}
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? t("auth.savingPassword") : t("auth.changePassword")}
              </MotionButton>
              <MotionButton
                aria-label={t("common.logout")}
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/5"
                onClick={() => void onLogout()}
                type="button"
              >
                {t("common.logout")}
              </MotionButton>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
