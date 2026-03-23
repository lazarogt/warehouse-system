import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import ChangePasswordScreen from "./ChangePasswordScreen";
import GlobalLoader from "./GlobalLoader";
import LoginScreen from "./LoginScreen";
import MotionButton from "./MotionButton";

type AuthGuardProps = {
  children: ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const { apiBaseUrl, error, loading, refreshSession, logout, setAuthenticatedUser, user } = useAuth();

  if (loading) {
    return <GlobalLoader fullscreen label="Verificando sesion..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-ink bg-grid px-4 py-10 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl items-center justify-center">
          <section className="w-full max-w-2xl rounded-[32px] border border-rose-400/20 bg-slate-950/90 p-8 shadow-panel">
            <p className="text-xs uppercase tracking-[0.28em] text-rose-200">Conexion</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">No se pudo cargar la sesion</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">{error}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <MotionButton
                aria-label="Reintentar carga de sesion"
                onClick={() => void refreshSession()}
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400"
              >
                Reintentar
              </MotionButton>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (user.mustChangePassword) {
    return (
      <ChangePasswordScreen
        apiBaseUrl={apiBaseUrl}
        user={user}
        onPasswordChanged={setAuthenticatedUser}
        onLogout={logout}
      />
    );
  }

  return <>{children}</>;
}
