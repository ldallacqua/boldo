import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { getPushEndpoint, getPushState } from './push';

interface Device {
  endpoint: string;
  muted: number[];
}

/**
 * A farmacinha é da casa, mas cada remédio avisa ou não avisa em cada aparelho. `device` é
 * null enquanto este aparelho não tiver os lembretes ativados.
 */
export function useDeviceAlerts() {
  const client = useQueryClient();
  const device = useQuery({
    queryKey: ['device'],
    queryFn: async (): Promise<Device | null> => {
      try {
        if ((await getPushState()) !== 'on') return null;
        const endpoint = await getPushEndpoint();
        if (!endpoint) return null;
        return { endpoint, muted: (await api.getDevice(endpoint)).mutedMedicines };
      } catch {
        return null;
      }
    },
  });

  /** Liga ou desliga os avisos de um remédio neste aparelho. Desfaz na tela se o servidor recusar. */
  const setNotify = async (medicineId: number, notify: boolean) => {
    // Uma busca em andamento traria a lista antiga por cima da escolha.
    await client.cancelQueries({ queryKey: ['device'] });
    const before = client.getQueryData<Device | null>(['device']);
    if (!before) return;
    const muted = before.muted.filter((id) => id !== medicineId);
    if (!notify) muted.push(medicineId);
    client.setQueryData(['device'], { ...before, muted });
    try {
      const saved = await api.saveDevice(before.endpoint, muted);
      client.setQueryData(['device'], { ...before, muted: saved.mutedMedicines });
    } catch (error) {
      client.setQueryData(['device'], before);
      throw error;
    }
  };

  return {
    ready: device.isSuccess,
    device: device.data ?? null,
    notifies: (medicineId: number) => !device.data?.muted.includes(medicineId),
    setNotify,
  };
}
