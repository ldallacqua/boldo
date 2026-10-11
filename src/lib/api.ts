import type {
  Medicine,
  MedicineInput,
  Settings,
  SettingsResponse,
  TodayResponse,
} from '../../shared/types';
import { API_BASE } from './config';
import { queryClient } from './queryClient';
import { getToken, setToken } from './session';

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
    const token = getToken();
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }

  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    // A sessão caiu: volta para a tela de senha.
    if (response.status === 401 && path !== '/api/login') {
      setToken(null);
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
  /** Sem token guardado, nem pergunta ao servidor. */
  session: async () =>
    getToken() ? request<{ authenticated: boolean }>('/api/session') : { authenticated: false },
  login: async (password: string) => {
    const result = await request<{ authenticated: boolean; token: string }>('/api/login', 'POST', {
      password,
    });
    setToken(result.token);
    return { authenticated: result.authenticated };
  },
  /** Sair é esquecer o token neste aparelho. */
  logout: () => setToken(null),
  /** Tudo o que está guardado, para backup. */
  exportData: () => request<Record<string, unknown>>('/api/export'),

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
  getDevice: (endpoint: string) =>
    request<{ mutedMedicines: number[] }>('/api/push/device', 'POST', { endpoint }),
  saveDevice: (endpoint: string, mutedMedicines: number[]) =>
    request<{ mutedMedicines: number[] }>('/api/push/device', 'PUT', { endpoint, mutedMedicines }),
};
