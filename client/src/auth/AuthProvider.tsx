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
import { useDataProvider } from "../services/data-provider";

type AuthContextValue = {
  apiBaseUrl: string;
  user: User | null;
  loading: boolean;
  error: string | null;
  isOfflineAuth: boolean;
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

const AUTH_SESSION_STORAGE_KEY = "warehouse-system:auth-session";
const OFFLINE_AUTH_STORAGE_KEY = "warehouse-system:is-offline-auth";

function createOfflineAdminUser(): User {
  const timestamp = new Date().toISOString();

  return {
    id: "local-admin" as unknown as User["id"],
    name: "Administrador",
    username: "local-admin",
    email: "offline@local",
    role: "admin",
    status: "active",
    mustChangePassword: false,
    passwordResetAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function readStoredSession(): User | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as User;
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

function persistSession(user: User | null, isOfflineAuth: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  if (user) {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  }

  window.localStorage.setItem(OFFLINE_AUTH_STORAGE_KEY, String(isOfflineAuth));
}

export function AuthProvider({ children }: AuthProviderProps) {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const { hasDesktopFallback, isOffline, setOfflineFromFailure } = useDataProvider();
  const [user, setUser] = useState<User | null>(() => {
    if (!hasDesktopFallback) {
      return readStoredSession();
    }

    return readStoredSession() ?? createOfflineAdminUser();
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineAuth, setIsOfflineAuth] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return hasDesktopFallback;
    }

    const storedValue = window.localStorage.getItem(OFFLINE_AUTH_STORAGE_KEY);

    if (storedValue === "true" || storedValue === "false") {
      return storedValue === "true";
    }

    return hasDesktopFallback;
  });
  const hasDispatchedAppReadyRef = useRef(false);

  const activateOfflineSession = useCallback(() => {
    const offlineUser = createOfflineAdminUser();

    console.info("[auth] offline mode active");
    setUser(offlineUser);
    setIsOfflineAuth(true);
    setError(null);

    return offlineUser;
  }, []);

  const refreshSession = useCallback(async () => {
    setError(null);

    try {
      const response = await api.get<AuthResponse>("/auth/me");
      setUser(response.user);
      setIsOfflineAuth(false);
      return response.user;
    } catch (authError) {
      if (hasDesktopFallback && authError instanceof ApiError && authError.status === 0) {
        setOfflineFromFailure();
        return activateOfflineSession();
      }

      if (authError instanceof ApiError && authError.status === 401) {
        setUser(null);
        setIsOfflineAuth(false);
        return null;
      }

      const message =
        authError instanceof Error ? authError.message : "No se pudo verificar la sesion.";
      if (hasDesktopFallback) {
        setOfflineFromFailure();
        return activateOfflineSession();
      }

      setError(message);
      setUser(null);
      setIsOfflineAuth(false);
      return null;
    }
  }, [activateOfflineSession, api, hasDesktopFallback, setOfflineFromFailure]);

  useEffect(() => {
    const bootstrap = async () => {
      if (hasDesktopFallback) {
        setLoading(false);
        void refreshSession();
        return;
      }

      setLoading(true);
      await refreshSession();
      setLoading(false);
    };

    void bootstrap();
  }, [hasDesktopFallback, refreshSession]);

  useEffect(() => {
    persistSession(user, isOfflineAuth);
  }, [isOfflineAuth, user]);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (hasDesktopFallback && isOfflineAuth) {
        activateOfflineSession();
        return;
      }

      setUser(null);
      setIsOfflineAuth(false);
      setError(null);
      setLoading(false);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);

    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [activateOfflineSession, hasDesktopFallback, isOfflineAuth]);

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

      if (hasDesktopFallback && (isOffline || isOfflineAuth)) {
        return activateOfflineSession();
      }

      const response = await api.post<AuthResponse>("/auth/login", {
        identifier,
        password: password,
      });
      setUser(response.user);
      setIsOfflineAuth(false);
      return response.user;
    },
    [activateOfflineSession, api, hasDesktopFallback, isOffline, isOfflineAuth],
  );

  const logout = useCallback(async () => {
    if (hasDesktopFallback && (isOffline || isOfflineAuth)) {
      activateOfflineSession();
      return;
    }

    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      setIsOfflineAuth(false);
      setError(null);
    }
  }, [activateOfflineSession, api, hasDesktopFallback, isOffline, isOfflineAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      apiBaseUrl,
      user,
      loading,
      error,
      isOfflineAuth,
      isAuthenticated: Boolean(user),
      refreshSession,
      login,
      logout,
      setAuthenticatedUser: setUser,
    }),
    [apiBaseUrl, error, isOfflineAuth, loading, login, logout, refreshSession, user],
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
