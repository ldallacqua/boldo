import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { healthOf, type MedicineHealth } from '../../shared/status';
import { localNow } from '../../shared/time';
import type { Medicine, MedicineInput, Settings } from '../../shared/types';
import { api, type DoseAction } from './api';

export function useSession() {
  return useQuery({ queryKey: ['session'], queryFn: api.session, staleTime: Infinity });
}

export function useMedicines() {
  return useQuery({ queryKey: ['medicines'], queryFn: api.medicines });
}

export function useToday() {
  return useQuery({ queryKey: ['today'], queryFn: api.today, refetchInterval: 60_000 });
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: api.settings });
}

/** Estado de cada remédio (estoque, validade, cor da tarja) no dia de hoje do servidor. */
export function useHealth(): (medicine: Medicine) => MedicineHealth {
  const today = useToday().data?.date;
  const settings = useSettings().data;
  const fallback = localNow(Intl.DateTimeFormat().resolvedOptions().timeZone).date;
  return (medicine) => healthOf(medicine, today ?? fallback, settings?.expiryWarnDays ?? 30);
}

function useRefreshStock() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['medicines'] }),
      client.invalidateQueries({ queryKey: ['today'] }),
    ]);
}

export function useSaveMedicine(id: number | null) {
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: (input: MedicineInput) =>
      id === null ? api.createMedicine(input) : api.updateMedicine(id, input),
    onSuccess: refresh,
  });
}

export function useDeleteMedicine() {
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: api.deleteMedicine,
    // Sem esperar o refetch: quem chamou fecha o painel antes de a lista mudar.
    onSuccess: () => void refresh(),
  });
}

export function useAdjustQuantity(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (delta: number) => api.adjustQuantity(id, delta),
    // Mostra o novo número na hora; se o servidor recusar, o refetch corrige.
    onMutate: async (delta) => {
      await client.cancelQueries({ queryKey: ['medicines'] });
      client.setQueryData<Medicine[]>(['medicines'], (list) =>
        list?.map((m) => (m.id === id ? { ...m, quantity: Math.max(0, m.quantity + delta) } : m)),
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['medicines'] }),
  });
}

export function useDoseAction() {
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: (vars: { scheduleId: number; action: DoseAction; date: string }) =>
      api.dose(vars.scheduleId, vars.action, vars.date),
    onSettled: refresh,
  });
}

export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => api.saveSettings(settings),
    onSuccess: (data) => client.setQueryData(['settings'], data),
  });
}
