import { flushSync } from 'react-dom';

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Troca de tela com a View Transitions API: o navegador fotografa o antes e o depois e anima
 * entre os dois (as regras estão em styles/motion.css). Onde não existe, a troca é seca.
 */
export function withViewTransition(update: () => void): void {
  if (!document.startViewTransition || prefersReducedMotion()) {
    update();
    return;
  }
  // flushSync: a foto do "depois" precisa do DOM já atualizado quando a função retorna.
  document.startViewTransition(() => flushSync(update));
}

/** Um toque curto de vibração para confirmar uma ação. O iPhone não tem; lá não faz nada. */
export function haptic(pattern: number | number[] = 8): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Sem vibração, sem problema.
  }
}
