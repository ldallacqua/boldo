const KEY = 'boldo.token';

/** O token de sessão fica no aparelho; é ele que vai em `Authorization: Bearer`. */
export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // Navegação privada sem armazenamento: a sessão vale só até fechar a aba.
  }
}
