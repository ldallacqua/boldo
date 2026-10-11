import { formatDays } from '../../shared/format';
import type { MedicineHealth } from '../../shared/status';

/** Selos curtos de estado. Não aparece nada quando está tudo certo. */
export function Badges({ health }: { health: MedicineHealth }) {
  const days = health.daysUntilExpiry ?? 0;
  return (
    <>
      {health.stock === 'out' && (
        <span className="badge" data-tone="danger">
          Acabou
        </span>
      )}
      {health.stock === 'low' && (
        <span className="badge" data-tone="warn">
          Acabando
        </span>
      )}
      {health.expiry === 'expired' && (
        <span className="badge" data-tone="danger">
          Vencido
        </span>
      )}
      {health.expiry === 'expiring' && (
        <span className="badge" data-tone="warn">
          {days === 0 ? 'Vence hoje' : `Vence em ${formatDays(days)}`}
        </span>
      )}
    </>
  );
}
