import { Component, type ErrorInfo, type ReactNode } from 'react';
import { APP_BASE } from '../lib/config';
import { Mascote } from './Mascote';

/** Última linha de defesa: um erro de tela vira uma mensagem com saída, não uma página em branco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="conteudo">
        <div className="vazio" role="alert">
          <Mascote pose="ops" size={140} />
          <h2>O Boldo tropeçou</h2>
          <p>Algo inesperado aconteceu nesta tela. Seus dados estão guardados no servidor.</p>
          <button
            type="button"
            className="botao"
            onClick={() => window.location.assign(`${APP_BASE}/`)}
          >
            Recarregar o app
          </button>
        </div>
      </div>
    );
  }
}
