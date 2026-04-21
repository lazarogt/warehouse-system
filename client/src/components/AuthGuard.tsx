import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import ChangePasswordScreen from "./ChangePasswordScreen";
import GlobalLoader from "./GlobalLoader";
import LoginScreen from "./LoginScreen";

type AuthGuardProps = {
  children: ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const { apiBaseUrl, loading, logout, setAuthenticatedUser, user, isOfflineAuth } = useAuth();

  if (loading) {
    return <GlobalLoader fullscreen label="Verificando sesion..." />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!isOfflineAuth && user.mustChangePassword) {
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
