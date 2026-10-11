import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Notify = (message: string, tone?: 'ok' | 'error') => void;

const ToastContext = createContext<Notify>(() => {});

export function useToast(): Notify {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error'; key: number } | null>(
    null,
  );
  const area = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // O painel de remédio é um <dialog> modal; só um popover aberto depois dele fica por cima.
  const raise = (open: boolean) => {
    try {
      const element = area.current;
      if (!element) return;
      if (element.matches(':popover-open')) element.hidePopover();
      if (open) element.showPopover();
    } catch {
      // Navegador sem popover: o aviso aparece mesmo assim, só que atrás do painel.
    }
  };

  const notify = useCallback<Notify>((message, tone = 'ok') => {
    window.clearTimeout(timer.current);
    setToast({ message, tone, key: Date.now() });
    raise(true);
    timer.current = window.setTimeout(
      () => {
        setToast(null);
        raise(false);
      },
      tone === 'error' ? 6000 : 3200,
    );
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div ref={area} className="toast-area" popover="manual" role="status" aria-live="polite">
        {toast && (
          <div key={toast.key} className="toast" data-tone={toast.tone}>
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
