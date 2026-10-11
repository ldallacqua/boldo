import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface SheetProps {
  title: string;
  onClose: () => void;
  /** Mostra "voltar" em vez de "fechar" (ex.: do formulário para os detalhes). */
  onBack?: () => void;
  children: ReactNode;
}

/** Painel modal: sobe de baixo no celular e entra pela direita em telas largas. */
export function Sheet({ title, onClose, onBack, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="sheet-panel">
        <header className="sheet-header">
          {onBack ? (
            <button type="button" className="icon-button" onClick={onBack} aria-label="Voltar">
              <Icon name="back" />
            </button>
          ) : (
            <span />
          )}
          <h2 id="sheet-title" className="sheet-title">
            {title}
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </dialog>
  );
}
