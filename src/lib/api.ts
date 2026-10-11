import type {
  Medicine,
  MedicineInput,
  Settings,
  SettingsResponse,
  TodayResponse,
} from '../../shared/types';
import { queryClient } from './queryClient';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }

  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    // A sessão caiu: volta para a tela de senha.
    if (response.status === 401 && path !== '/api/login') {
      queryClient.setQueryData(['session'], { authenticated: false });
    }
    throw new ApiError(response.status, data?.error ?? 'Algo deu errado. Tente de novo.');
  }
  // Resposta 200 que não é JSON: há outra coisa respondendo no lugar da API (proxy, porta errada).
  if (data === null) {
    throw new ApiError(502, 'O servidor respondeu algo inesperado. Tente de novo em instantes.');
  }
  return data as T;
}

export type DoseAction = 'take' | 'skip' | 'undo';

export const api = {
  session: () => request<{ authenticated: boolean }>('/api/session'),
  login: (password: string) =>
    request<{ authenticated: boolean }>('/api/login', 'POST', { password }),
  logout: () => request<{ authenticated: boolean }>('/api/logout', 'POST'),

  medicines: () => request<Medicine[]>('/api/medicines'),
  createMedicine: (input: MedicineInput) => request<Medicine>('/api/medicines', 'POST', input),
  updateMedicine: (id: number, input: MedicineInput) =>
    request<Medicine>(`/api/medicines/${id}`, 'PUT', input),
  deleteMedicine: (id: number) => request<{ ok: true }>(`/api/medicines/${id}`, 'DELETE'),
  adjustQuantity: (id: number, delta: number) =>
    request<Medicine>(`/api/medicines/${id}/adjust`, 'POST', { delta }),

  today: () => request<TodayResponse>('/api/today'),
  dose: (scheduleId: number, action: DoseAction, date: string) =>
    request<{ ok: true }>(`/api/doses/${scheduleId}/${action}`, 'POST', { date }),

  settings: () => request<SettingsResponse>('/api/settings'),
  saveSettings: (settings: Settings) => request<SettingsResponse>('/api/settings', 'PUT', settings),

  subscribePush: (subscription: PushSubscriptionJSON) =>
    request<{ devices: number }>('/api/push/subscribe', 'POST', subscription),
  unsubscribePush: (endpoint: string) =>
    request<{ devices: number }>('/api/push/unsubscribe', 'POST', { endpoint }),
  testPush: () => request<{ delivered: number }>('/api/push/test', 'POST'),
};
