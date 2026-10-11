import type { ReactNode } from 'react';
import { Mascote, type Pose } from './Mascote';

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
      <Mascote pose="ops" size={140} />
      <h2>Não deu para carregar</h2>
      <p>{message}</p>
      <button type="button" className="botao" data-variant="secundario" onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}

export function Empty({
  title,
  pose = 'vazio',
  children,
}: {
  title: string;
  pose?: Pose;
  children: ReactNode;
}) {
  return (
    <div className="vazio">
      <Mascote pose={pose} size={140} />
      <h2>{title}</h2>
      {children}
    </div>
  );
}
