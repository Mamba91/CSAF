import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ToastType = 'error' | 'warn' | 'success' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

let _id = 0;

const STYLE: Record<ToastType, { bg: string; color: string; border: string; icon: string }> = {
  error:   { bg: 'var(--danger-muted)',   color: 'var(--danger)',   border: 'rgba(224,85,85,0.4)',   icon: '✕' },
  warn:    { bg: 'rgba(224,165,80,0.12)', color: 'var(--warn)',     border: 'rgba(224,165,80,0.4)',  icon: '⚠' },
  success: { bg: 'rgba(76,175,125,0.12)', color: 'var(--success)',  border: 'rgba(76,175,125,0.4)', icon: '✓' },
  info:    { bg: 'var(--accent-muted)',   color: 'var(--accent-h)', border: 'var(--border)',         icon: 'ℹ' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++_id;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2"
        style={{ maxWidth: 360, pointerEvents: 'none' }}
      >
        {toasts.map((toast) => {
          const s = STYLE[toast.type];
          return (
            <div
              key={toast.id}
              className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-xl"
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${s.border}`,
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                pointerEvents: 'auto',
                animation: 'toast-in 0.2s ease',
              }}
            >
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: s.bg, color: s.color }}
              >
                {s.icon}
              </span>
              <span className="flex-1 leading-snug" style={{ color: 'var(--text-1)' }}>
                {toast.message}
              </span>
              <button
                onClick={() => dismiss(toast.id)}
                className="mt-0.5 text-xs leading-none"
                style={{ color: 'var(--text-3)' }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
