import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { t } from "../i18n";

type ToastType = "success" | "error";

type ToastItem = {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
};

type ToastContextValue = {
  notify: (toast: Omit<ToastItem, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toastStyles: Record<ToastType, string> = {
  success: "border-emerald-400/20 bg-emerald-500/10 text-emerald-50",
  error: "border-rose-400/20 bg-rose-500/10 text-rose-50",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id =
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      setToasts((current) => [...current, { ...toast, id }]);

      window.setTimeout(() => {
        removeToast(id);
      }, 3600);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-[22px] border px-4 py-4 shadow-lg backdrop-blur ${toastStyles[toast.type]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.message && <p className="mt-1 text-sm opacity-90">{toast.message}</p>}
              </div>

              <button
                type="button"
                aria-label={t("notifications.close")}
                className="ui-button rounded-full border border-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                onClick={() => removeToast(toast.id)}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }

  return context;
};
