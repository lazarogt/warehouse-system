import { useState } from "react";
import { t } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import MotionButton from "./MotionButton";
import { useToast } from "./ToastProvider";

type FormErrors = Partial<Record<"identifier" | "password", string>>;

export default function LoginScreen() {
  const { login } = useAuth();
  const { notify } = useToast();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (!identifier.trim()) {
      nextErrors.identifier = t("auth.identifierRequired");
    }

    if (!password) {
      nextErrors.password = t("auth.passwordRequired");
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
      await login(identifier.trim(), password);
      notify({
        type: "success",
        title: t("auth.loginSuccess"),
        message: t("sections.dashboard.description"),
      });
    } catch (error) {
      notify({
        type: "error",
        title: t("auth.loginError"),
        message: error instanceof Error ? error.message : t("app.retry"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink bg-grid px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <section className="w-full max-w-xl rounded-[32px] border border-white/10 bg-slate-950/85 p-8 shadow-panel">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">{t("auth.authentication")}</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">{t("auth.loginTitle")}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">{t("auth.loginSubtitle")}</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">{t("auth.identifier")}</span>
              <input
                aria-label={t("auth.identifier")}
                autoFocus
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
              {errors.identifier ? <span className="text-sm text-rose-300">{errors.identifier}</span> : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">{t("common.password")}</span>
              <input
                aria-label={t("common.password")}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {errors.password ? <span className="text-sm text-rose-300">{errors.password}</span> : null}
            </label>

            <MotionButton
              aria-label={t("auth.login")}
              className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? t("auth.signingIn") : t("auth.login")}
            </MotionButton>
          </form>
        </section>
      </div>
    </div>
  );
}
