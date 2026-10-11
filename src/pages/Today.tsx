import { Link } from 'wouter';
import { attentionReasons, formatQuantity } from '../../shared/format';
import type { DoseToday } from '../../shared/types';
import { Icon } from '../components/Icon';
import { Empty, LoadError, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { formatClock, formatLongDate } from '../lib/dates';
import { useDoseAction, useHealth, useMedicines, useSettings, useToday } from '../lib/queries';

const plural = (n: number, one: string, many: string) => (n === 1 ? `${n} ${one}` : `${n} ${many}`);

function summary(open: number, total: number, attention: number): string {
  const parts: string[] = [];
  if (total === 0) parts.push('Nenhuma dose marcada para hoje.');
  else if (open === 0) parts.push('Todas as doses de hoje foram registradas.');
  else parts.push(`${open === 1 ? 'Falta' : 'Faltam'} ${plural(open, 'dose', 'doses')} hoje.`);

  if (attention > 0) {
    parts.push(`${plural(attention, 'remédio precisa', 'remédios precisam')} de atenção.`);
  } else {
    parts.push('Estoque e validades em ordem.');
  }
  return parts.join(' ');
}

function DoseItem({ dose, date, timezone }: { dose: DoseToday; date: string; timezone?: string }) {
  const act = useDoseAction();
  const toast = useToast();
  const run = (action: 'take' | 'skip' | 'undo') =>
    act.mutate(
      { scheduleId: dose.scheduleId, action, date },
      { onError: (error) => toast(error.message, 'error') },
    );
  const done = dose.status === 'taken' || dose.status === 'skipped';

  return (
    <li className="dose" data-status={dose.status}>
      <time className="dose-hora numeros">{dose.time}</time>
      <span className="dose-no" aria-hidden="true">
        {dose.status === 'taken' && <Icon name="check" size={14} />}
      </span>
      <div className="dose-corpo">
        <div>
          <p className="dose-nome">
            <Link href={`/remedios/${dose.medicineId}`}>{dose.medicineName}</Link>
            {dose.dosage && <span className="caixa-dosagem">{dose.dosage}</span>}
          </p>
          <p className="dose-detalhe">
            {formatQuantity(dose.dose, dose.unit)}
            {dose.status === 'late' && (
              <span className="badge" data-tone="warn">
                Atrasada
              </span>
            )}
            {dose.status === 'taken' && dose.recordedAt && (
              <span>Tomado às {formatClock(dose.recordedAt, timezone)}</span>
            )}
            {dose.status === 'skipped' && <span>Pulado</span>}
          </p>
        </div>
        <div className="dose-acoes">
          {done ? (
            <button
              type="button"
              className="botao"
              data-variant="texto"
              onClick={() => run('undo')}
              disabled={act.isPending}
              aria-label={`Desfazer registro de ${dose.medicineName} das ${dose.time}`}
            >
              Desfazer
            </button>
          ) : (
            <>
              <button
                type="button"
                className="botao"
                data-variant="texto"
                onClick={() => run('skip')}
                disabled={act.isPending}
                aria-label={`Pular ${dose.medicineName} das ${dose.time}`}
              >
                Pular
              </button>
              <button
                type="button"
                className="botao"
                onClick={() => run('take')}
                disabled={act.isPending}
                aria-label={`Tomei ${dose.medicineName} das ${dose.time}`}
              >
                Tomei
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function Today() {
  const today = useToday();
  const medicines = useMedicines();
  const settings = useSettings();
  const healthOf = useHealth();

  if (today.isPending || medicines.isPending) return <Loading />;
  if (today.isError || medicines.isError) {
    return (
      <LoadError
        message={(today.error ?? medicines.error)!.message}
        onRetry={() => {
          today.refetch();
          medicines.refetch();
        }}
      />
    );
  }

  const { date, doses } = today.data;
  const attention = medicines.data
    .map((medicine) => ({ medicine, health: healthOf(medicine) }))
    .filter(({ health }) => health.tone !== 'ok')
    .sort((a, b) => (a.health.tone === b.health.tone ? 0 : a.health.tone === 'danger' ? -1 : 1));
  const open = doses.filter((d) => d.status === 'pending' || d.status === 'late').length;

  if (medicines.data.length === 0) {
    return (
      <>
        <header className="pagina-topo">
          <h1 className="titulo-dia">{formatLongDate(date)}</h1>
        </header>
        <Empty title="A farmacinha está vazia">
          <p>Cadastre o primeiro remédio para saber o que tem em casa e receber os lembretes.</p>
          <Link href="/remedios/novo" className="botao">
            <Icon name="plus" size={20} />
            Adicionar remédio
          </Link>
        </Empty>
      </>
    );
  }

  return (
    <>
      <header className="pagina-topo">
        <h1 className="titulo-dia">{formatLongDate(date)}</h1>
        <p className="resumo">{summary(open, doses.length, attention.length)}</p>
      </header>

      <div className="hoje">
        <section aria-labelledby="doses-titulo">
          <h2 id="doses-titulo" className="secao-titulo">
            Doses de hoje
          </h2>
          {doses.length === 0 ? (
            <p className="secao-vazia">
              Para receber lembretes, abra um remédio e adicione os horários de tomar.
            </p>
          ) : (
            <ol className="doses">
              {doses.map((dose) => (
                <DoseItem
                  key={dose.scheduleId}
                  dose={dose}
                  date={date}
                  timezone={settings.data?.timezone}
                />
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="atencao-titulo">
          <h2 id="atencao-titulo" className="secao-titulo">
            Precisa de atenção
          </h2>
          {attention.length === 0 ? (
            <p className="secao-vazia">Nada acabando nem vencendo.</p>
          ) : (
            <ul className="lista">
              {attention.map(({ medicine, health }) => (
                <li key={medicine.id}>
                  <Link
                    href={`/remedios/${medicine.id}`}
                    className="caixa caixa-aviso"
                    data-tone={health.tone}
                  >
                    <div className="caixa-principal">
                      <p className="caixa-nome">
                        {medicine.name}
                        {medicine.dosage && (
                          <span className="caixa-dosagem">{medicine.dosage}</span>
                        )}
                      </p>
                      {attentionReasons(
                        health,
                        medicine.quantity,
                        medicine.unit,
                        medicine.expiresOn,
                      ).map((reason) => (
                        <p key={reason} className="caixa-motivo">
                          {reason}
                        </p>
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
