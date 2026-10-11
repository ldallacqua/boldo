import type { ReactNode } from 'react';

export function Loading({ label = 'Carregando' }: { label?: string }) {
  return (
    <div className="carregando" role="status">
      <span className="carregando-ponto" />
      <span className="so-leitor">{label}</span>
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="vazio" role="alert">
      <h2>Não deu para carregar</h2>
      <p>{message}</p>
      <button type="button" className="botao" data-variant="secundario" onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="vazio">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
