"use client";
import { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

const ICON_MAP = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const STYLE_MAP = {
  success:
    "bg-accent-50 dark:bg-accent-900/30 border-accent-200 dark:border-accent-800 text-accent-800 dark:text-accent-200",
  error:
    "bg-error-50 dark:bg-error-900/30 border-error-200 dark:border-error-800 text-error-800 dark:text-error-200",
  warning:
    "bg-warning-50 dark:bg-warning-900/30 border-warning-200 dark:border-warning-800 text-warning-800 dark:text-warning-200",
  info: "bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800 text-primary-800 dark:text-primary-200",
};

const ICON_STYLE_MAP = {
  success: "text-accent-500",
  error: "text-error-500",
  warning: "text-warning-500",
  info: "text-primary-500",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "success", duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const Icon = ICON_MAP[toast.type] || Info;
          const style = STYLE_MAP[toast.type] || STYLE_MAP.info;
          const iconStyle = ICON_STYLE_MAP[toast.type] || ICON_STYLE_MAP.info;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg animate-slide-in ${style}`}
            >
              <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${iconStyle}`} />
              <p className="text-sm font-medium flex-1">{toast.message}</p>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 p-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 opacity-60" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
