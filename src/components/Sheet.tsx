import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { prefersReducedMotion } from '../lib/motion';
import { Icon } from './Icon';

export interface SheetHandle {
  /** Fecha com a animação de saída e só então chama `onClose`. */
  dismiss: () => void;
  /** O mesmo que tocar em "voltar": pergunta antes, se houver edição não salva. */
  back: () => void;
}

interface SheetProps {
  title: string;
  onClose: () => void;
  /** Mostra "voltar" em vez de "fechar" (ex.: do formulário para os detalhes). */
  onBack?: () => void;
  /** Muda quando o painel troca de conteúdo (detalhe ↔ edição): o novo entra com um esmaecer. */
  view?: string;
  /** Há edição não salva: antes de fechar ou voltar, o painel pergunta se pode descartar. */
  unsaved?: boolean;
  ref?: Ref<SheetHandle>;
  children: ReactNode;
}

const WIDE = '(min-width: 720px)';
/** Arrastou mais que isto, ou soltou mais rápido que isto para baixo: fecha. */
const DISMISS_DISTANCE = 120;
const DISMISS_SPEED = 0.6;

/**
 * Painel modal: sobe de baixo no celular e entra pela direita em telas largas. No celular
 * dá para puxar pelo cabeçalho e arrastar para baixo até fechar.
 */
export function Sheet({ title, onClose, onBack, view, unsaved, ref, children }: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; time: number; offset: number; speed: number } | null>(null);
  const closing = useRef(false);
  // Enquanto o painel sai, o conteúdo fica como estava (um remédio excluído não vira
  // "não encontrado" no meio da animação).
  const [frozen, setFrozen] = useState<ReactNode>(null);
  // O que a pessoa pediu (fechar, voltar) e está esperando ela confirmar o descarte.
  const [pending, setPending] = useState<(() => void) | null>(null);

  /** Faz `action` já, ou só depois de a pessoa aceitar perder o que editou. */
  const attempt = (action: () => void) => {
    if (unsaved) setPending(() => action);
    else action();
  };

  useEffect(() => {
    const element = dialog.current!;
    if (!element.open) element.showModal();
    // Sem isto o navegador foca o primeiro botão e desenha o anel de foco em volta do "fechar".
    // `preventScroll`: o painel começa fora da tela, e focar algo fora da tela faz o navegador
    // rolar o <dialog> para mostrá-lo, o que cancela a entrada (ele aparece já no lugar).
    panel.current?.focus({ preventScroll: true });
    return () => element.close();
  }, []);

  const dismiss = (from = 0) => {
    if (closing.current) return;
    closing.current = true;
    const element = panel.current;
    if (!element || prefersReducedMotion()) return onClose();
    setFrozen(children);
    dialog.current?.setAttribute('data-fechando', '');
    const wide = window.matchMedia(WIDE).matches;
    const animation = element.animate(
      wide
        ? [{ translate: '0 0' }, { translate: '100% 0' }]
        : [{ translate: `0 ${from}px` }, { translate: '0 100%' }],
      { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
    animation.finished.then(onClose, onClose);
  };

  useImperativeHandle(ref, () => ({
    dismiss: () => attempt(() => dismiss()),
    back: () => onBack && attempt(onBack),
  }));

  const onPointerDown = (event: ReactPointerEvent) => {
    if (window.matchMedia(WIDE).matches || closing.current) return;
    if ((event.target as Element).closest('button, a, input')) return;
    drag.current = { y: event.clientY, time: event.timeStamp, offset: 0, speed: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const state = drag.current;
    if (!state || !panel.current) return;
    const offset = Math.max(0, event.clientY - state.y);
    const elapsed = Math.max(1, event.timeStamp - state.time);
    state.speed = (offset - state.offset) / elapsed;
    state.offset = offset;
    state.time = event.timeStamp;
    panel.current.style.transition = 'none';
    panel.current.style.translate = `0 ${offset}px`;
    // O véu clareia junto com o painel que desce.
    dialog.current?.style.setProperty(
      '--arrasto',
      String(Math.max(0, 1 - offset / panel.current.offsetHeight)),
    );
  };

  const onPointerUp = () => {
    const state = drag.current;
    drag.current = null;
    if (!state || !panel.current) return;
    if (!unsaved && (state.offset > DISMISS_DISTANCE || state.speed > DISMISS_SPEED)) {
      panel.current.style.translate = '';
      dismiss(state.offset);
      return;
    }
    // Com edição por salvar o painel volta ao lugar e pergunta, em vez de sumir com ela.
    if (unsaved && state.offset > DISMISS_DISTANCE) setPending(() => () => dismiss());
    panel.current.style.transition = '';
    panel.current.style.translate = '';
    dialog.current?.style.removeProperty('--arrasto');
  };

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        attempt(() => dismiss());
      }}
      // O navegador pode fechar o <dialog> por conta própria (dois Esc seguidos no Chrome):
      // a rota acompanha, para não sobrar um painel fechado com o endereço dele.
      onClose={() => {
        if (!closing.current && !dialog.current?.open) onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) attempt(() => dismiss());
      }}
    >
      <div ref={panel} className="sheet-panel" tabIndex={-1}>
        <header
          className="sheet-header"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="sheet-puxador" aria-hidden="true" />
          {onBack ? (
            <button
              type="button"
              className="icon-button"
              onClick={() => attempt(onBack)}
              aria-label="Voltar"
            >
              <Icon name="back" />
            </button>
          ) : (
            <span />
          )}
          <h2 id="sheet-title" className="sheet-title">
            {title}
          </h2>
          <button
            type="button"
            className="icon-button"
            onClick={() => attempt(() => dismiss())}
            aria-label="Fechar"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">
          <div key={view} className="sheet-conteudo">
            {frozen ?? children}
          </div>
        </div>
        {pending && (
          <div className="sheet-pergunta" role="alertdialog" aria-labelledby="sheet-pergunta">
            <p id="sheet-pergunta">Descartar o que você mudou neste remédio?</p>
            <div className="acoes">
              <button
                type="button"
                className="botao"
                data-variant="perigo"
                onClick={() => {
                  setPending(null);
                  pending();
                }}
              >
                Descartar
              </button>
              <button
                type="button"
                className="botao"
                data-variant="secundario"
                autoFocus
                onClick={() => setPending(null)}
              >
                Continuar editando
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
