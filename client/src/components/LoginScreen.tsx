import { useState } from "react";
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
      nextErrors.identifier = "Ingresa username o email.";
    }

    if (!password) {
      nextErrors.password = "Ingresa tu contraseña.";
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
        title: "Sesion iniciada",
        message: "Acceso correcto al dashboard.",
      });
    } catch (error) {
      notify({
        type: "error",
        title: "No se pudo iniciar sesion",
        message: error instanceof Error ? error.message : "Intentalo de nuevo.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink bg-grid px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <section className="w-full max-w-xl rounded-[32px] border border-white/10 bg-slate-950/85 p-8 shadow-panel">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">Autenticacion</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Inicia sesion</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            El dashboard administrativo permanece protegido hasta que exista una sesion valida.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Username o email</span>
              <input
                aria-label="Username o email"
                autoFocus
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
              {errors.identifier && <span className="text-sm text-rose-300">{errors.identifier}</span>}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Contraseña</span>
              <input
                aria-label="Contraseña"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {errors.password && <span className="text-sm text-rose-300">{errors.password}</span>}
            </label>

            <MotionButton
              aria-label="Iniciar sesion"
              className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Ingresando..." : "Entrar"}
            </MotionButton>
          </form>
        </section>
      </div>
    </div>
  );
}
