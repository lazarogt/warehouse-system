import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthResponse, User } from "../../../shared/src";
import { ApiError, createApiClient, getApiBaseUrl } from "../lib/api";

type AuthContextValue = {
  apiBaseUrl: string;
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  refreshSession: () => Promise<User | null>;
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setAuthenticatedUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasDispatchedAppReadyRef = useRef(false);

  const refreshSession = useCallback(async () => {
    setError(null);

    try {
      const response = await api.get<AuthResponse>("/auth/me");
      setUser(response.user);
      return response.user;
    } catch (authError) {
      if (authError instanceof ApiError && authError.status === 401) {
        setUser(null);
        return null;
      }

      const message =
        authError instanceof Error ? authError.message : "No se pudo verificar la sesion.";
      setError(message);
      setUser(null);
      return null;
    }
  }, [api]);

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      await refreshSession();
      setLoading(false);
    };

    void bootstrap();
  }, [refreshSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setError(null);
      setLoading(false);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);

    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, []);

  useEffect(() => {
    if (loading || hasDispatchedAppReadyRef.current) {
      return;
    }

    hasDispatchedAppReadyRef.current = true;
    window.dispatchEvent(new Event("warehouse:app-ready"));
  }, [loading]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      setError(null);
      const response = await api.post<AuthResponse>("/auth/login", {
        identifier,
        password,
      });
      setUser(response.user);
      return response.user;
    },
    [api],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      setError(null);
    }
  }, [api]);

  const value = useMemo<AuthContextValue>(
    () => ({
      apiBaseUrl,
      user,
      loading,
      error,
      isAuthenticated: Boolean(user),
      refreshSession,
      login,
      logout,
      setAuthenticatedUser: setUser,
    }),
    [apiBaseUrl, error, loading, login, logout, refreshSession, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
};
