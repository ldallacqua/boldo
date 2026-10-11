/** A aparência é de cada aparelho: fica no navegador, não no servidor. */
export type ThemeChoice = 'auto' | 'claro' | 'escuro';

const KEY = 'boldo.tema';
const BAR_COLOR = { light: '#F3ECD9', dark: '#111814' };

export function getThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'claro' || stored === 'escuro' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Põe o tema no <html> e acerta a cor da barra do navegador. */
export function applyTheme(choice: ThemeChoice = getThemeChoice()): void {
  const dark = choice === 'escuro' || (choice === 'auto' && systemDark().matches);
  const theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme]);
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Sem armazenamento (aba privada), a escolha vale só até recarregar.
  }
  applyTheme(choice);
}

/** Chame uma vez ao abrir o app: aplica o tema e acompanha o sistema quando está em automático. */
export function startTheme(): void {
  applyTheme();
  systemDark().addEventListener('change', () => applyTheme());
}
