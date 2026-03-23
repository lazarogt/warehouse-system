import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`pointer-events-auto rounded-[22px] border px-4 py-4 shadow-lg backdrop-blur ${toastStyles[toast.type]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.message && <p className="mt-1 text-sm opacity-90">{toast.message}</p>}
                </div>

                <button
                  type="button"
                  aria-label="Cerrar notificacion"
                  className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/80 transition hover:bg-white/10"
                  onClick={() => removeToast(toast.id)}
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
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
