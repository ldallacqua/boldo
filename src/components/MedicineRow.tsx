import type { CSSProperties } from 'react';
import { Link } from 'wouter';
import { formatExpiry, formatNumber, unitLabel } from '../../shared/format';
import type { MedicineHealth } from '../../shared/status';
import type { Medicine } from '../../shared/types';
import { Badges } from './Badges';

interface MedicineRowProps {
  medicine: Medicine;
  health: MedicineHealth;
  /** Posição na lista: as linhas entram uma depois da outra. */
  index?: number;
}

/** Uma "caixinha" da lista: tarja de estado, nome, para que serve e quanto tem. */
export function MedicineRow({ medicine, health, index = 0 }: MedicineRowProps) {
  const times = medicine.schedules.map((s) => s.time);
  return (
    <li style={{ '--i': index } as CSSProperties}>
      <Link href={`/remedios/${medicine.id}`} className="caixa" data-tone={health.tone}>
        <div className="caixa-principal">
          <p className="caixa-nome">
            {medicine.name}
            {medicine.dosage && <span className="caixa-dosagem">{medicine.dosage}</span>}
          </p>
          <p className="caixa-serve">{medicine.tags.join(', ') || 'Sem tags'}</p>
        </div>

        <div className="caixa-meta">
          <Badges health={health} />
          {medicine.expiresOn && health.expiry === 'ok' && (
            <span className="meta">Validade {formatExpiry(medicine.expiresOn)}</span>
          )}
          {times.length > 0 && (
            <span className="meta">
              <span className="so-leitor">Horários: </span>
              {times.join(' e ')}
            </span>
          )}
        </div>

        <p className="caixa-quantidade">
          <span className="numeros">{formatNumber(medicine.quantity)}</span>
          <span className="caixa-unidade">{unitLabel(medicine.unit, medicine.quantity)}</span>
        </p>
      </Link>
    </li>
  );
}
