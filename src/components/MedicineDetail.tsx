import { useState } from 'react';
import { Link } from 'wouter';
import {
  formatDays,
  formatExpiry,
  formatNumber,
  formatQuantity,
  formatWeekdays,
  unitLabel,
} from '../../shared/format';
import type { MedicineHealth } from '../../shared/status';
import type { Medicine } from '../../shared/types';
import { useDeviceAlerts } from '../lib/device';
import { haptic } from '../lib/motion';
import { useAdjustQuantity, useDeleteMedicine } from '../lib/queries';
import { Badges } from './Badges';
import { Icon } from './Icon';
import { useToast } from './Toast';

function expirySentence(medicine: Medicine, health: MedicineHealth): string {
  if (!medicine.expiresOn || health.daysUntilExpiry === null) return 'Sem validade informada';
  const printed = formatExpiry(medicine.expiresOn);
  const days = health.daysUntilExpiry;
  if (days < 0) return `${printed}, venceu há ${formatDays(-days)}`;
  if (days === 0) return `${printed}, vence hoje`;
  return `${printed}, vence em ${formatDays(days)}`;
}

export function MedicineDetail({
  medicine,
  health,
  onDeleted,
}: {
  medicine: Medicine;
  health: MedicineHealth;
  /** Chamado depois de excluir: quem abriu o painel é quem o fecha. */
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const adjust = useAdjustQuantity(medicine.id);
  const remove = useDeleteMedicine();
  const toast = useToast();
  const alerts = useDeviceAlerts();

  // Para que lado o número rola: para cima ao pôr, para baixo ao tirar.
  const [direction, setDirection] = useState<'sobe' | 'desce'>('sobe');
  const change = (delta: number) => {
    setDirection(delta > 0 ? 'sobe' : 'desce');
    haptic(4);
    adjust.mutate(delta, { onError: (error) => toast(error.message, 'error') });
  };

  // mutateAsync: o painel sai da tela junto com o remédio, e callbacks de mutate() não
  // rodariam depois disso.
  const onDelete = async () => {
    try {
      await remove.mutateAsync(medicine.id);
      toast('Remédio excluído');
      onDeleted();
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  return (
    <div className="detalhe" data-tone={health.tone}>
      {medicine.dosage && <p className="detalhe-dosagem">{medicine.dosage}</p>}
      {medicine.tags.length > 0 ? (
        <ul className="tags" aria-label="Pra que serve">
          {medicine.tags.map((tag) => (
            <li key={tag} className="tag">
              {tag}
            </li>
          ))}
        </ul>
      ) : (
        <p className="detalhe-serve">Sem tags de para que serve.</p>
      )}

      <section className="estoque" aria-label="Quantidade em casa">
        <div className="estoque-controle">
          <button
            type="button"
            className="passo"
            onClick={() => change(-1)}
            disabled={medicine.quantity <= 0}
            aria-label="Tirar 1"
          >
            <Icon name="minus" size={26} />
          </button>
          <p className="estoque-valor" aria-live="polite">
            <span className="numeros estoque-numero">
              <span key={medicine.quantity} data-rola={direction} data-testid="quantidade">
                {formatNumber(medicine.quantity)}
              </span>
            </span>
            <span>{unitLabel(medicine.unit, medicine.quantity)} em casa</span>
          </p>
          <button type="button" className="passo" onClick={() => change(1)} aria-label="Pôr 1">
            <Icon name="plus" size={26} />
          </button>
        </div>
        <div className="estoque-notas">
          <Badges health={health} />
          {medicine.lowThreshold > 0 && (
            <span className="meta">
              Avisa quando {medicine.lowThreshold === 1 ? 'restar' : 'restarem'}{' '}
              {formatQuantity(medicine.lowThreshold, medicine.unit)}
            </span>
          )}
          {health.daysOfSupply !== null && medicine.quantity > 0 && (
            <span className="meta">Dá para {formatDays(health.daysOfSupply)}</span>
          )}
        </div>
      </section>

      <dl className="ficha">
        <div>
          <dt>Validade</dt>
          <dd>{expirySentence(medicine, health)}</dd>
        </div>
        <div>
          <dt>Horários</dt>
          <dd>
            {medicine.schedules.length === 0 ? (
              'Sem lembrete de horário'
            ) : (
              <ul className="ficha-horarios">
                {medicine.schedules.map((schedule) => (
                  <li key={schedule.id}>
                    <span className="numeros">{schedule.time}</span>
                    <span>
                      {formatQuantity(schedule.dose, medicine.unit)},{' '}
                      {formatWeekdays(schedule.days)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt>Anotações</dt>
          <dd className="ficha-notas">{medicine.notes || 'Nenhuma anotação'}</dd>
        </div>
      </dl>

      {alerts.device ? (
        <label className="avisado avisado-so">
          <input
            type="checkbox"
            role="switch"
            checked={alerts.notifies(medicine.id)}
            onChange={(e) =>
              alerts
                .setNotify(medicine.id, e.target.checked)
                .catch((error: Error) => toast(error.message, 'error'))
            }
          />
          <span className="avisado-nome">Avisar neste aparelho</span>
        </label>
      ) : (
        alerts.ready && (
          <p className="ajuda">
            Este aparelho não recebe lembretes. Para receber, ative em{' '}
            <Link href="/ajustes">Ajustes</Link>.
          </p>
        )
      )}

      {confirming ? (
        <div className="confirmar" role="alertdialog" aria-labelledby="confirmar-titulo">
          <p id="confirmar-titulo">
            Excluir <strong>{medicine.name}</strong>? Os horários e o histórico de doses dele também
            são apagados.
          </p>
          <div className="acoes">
            <button
              type="button"
              className="botao"
              data-variant="perigo"
              onClick={onDelete}
              disabled={remove.isPending}
            >
              Excluir remédio
            </button>
            <button
              type="button"
              className="botao"
              data-variant="secundario"
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="acoes">
          <Link href={`/remedios/${medicine.id}/editar`} className="botao">
            <Icon name="edit" size={20} />
            Editar
          </Link>
          <button
            type="button"
            className="botao"
            data-variant="texto-perigo"
            onClick={() => setConfirming(true)}
          >
            <Icon name="trash" size={20} />
            Excluir
          </button>
        </div>
      )}
    </div>
  );
}
