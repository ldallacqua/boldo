import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pending: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** O Chrome/Edge avisam quando o app pode ser instalado; guardamos o evento para o botão. */
export function watchInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pending = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    pending = null;
    notify();
  });
}

export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending !== null,
  );
}

export async function promptInstall(): Promise<boolean> {
  if (!pending) return false;
  await pending.prompt();
  const { outcome } = await pending.userChoice;
  pending = null;
  notify();
  return outcome === 'accepted';
}
