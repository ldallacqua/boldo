import type { ReactNode } from 'react';
import { Mark } from './Icon';
import { Mascote, type Pose } from './Mascote';

/**
 * Enquanto os dados chegam, a tela mostra o contorno do que vem: um título e algumas
 * caixinhas. `variant="marca"` é para a abertura do app, antes de saber se há sessão.
 */
export function Loading({
  label = 'Carregando',
  variant = 'lista',
}: {
  label?: string;
  variant?: 'lista' | 'marca';
}) {
  if (variant === 'marca') {
    return (
      <div className="abrindo" role="status">
        <Mark size={72} />
        <span className="so-leitor">{label}</span>
      </div>
    );
  }
  return (
    <div className="esqueleto" role="status">
      <span className="esqueleto-titulo" />
      <span className="esqueleto-linha" />
      <span className="esqueleto-caixa" />
      <span className="esqueleto-caixa" />
      <span className="esqueleto-caixa" />
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
