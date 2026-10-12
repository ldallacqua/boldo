import { useState, type CSSProperties } from 'react';
import { Link } from 'wouter';
import { attentionReasons, formatQuantity, formatWait } from '../../shared/format';
import { dayProgress, type DayProgress } from '../../shared/schedule';
import type { DoseToday } from '../../shared/types';
import { Icon } from '../components/Icon';
import { Mascote } from '../components/Mascote';
import { Empty, LoadError, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { formatClock, formatLongDate } from '../lib/dates';
import { haptic } from '../lib/motion';
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

/** A frase sobre a próxima dose em aberto: quem é, de que horas e quanto falta. */
function nextSentence(progress: DayProgress, doses: DoseToday[]): string | null {
  const next = doses.find((dose) => dose.scheduleId === progress.next?.scheduleId);
  if (!next) return null;
  return next.status === 'late'
    ? `${next.medicineName} das ${next.time} está atrasada.`
    : `Próxima: ${next.medicineName} às ${next.time}, ${formatWait(progress.minutesToNext)}.`;
}

/** Vai junto com o link de um remédio: ao fechar o painel, a pessoa volta para cá. */
const FROM_TODAY = { voltar: '/' };

const RING = 2 * Math.PI * 26;
/** Para onde voa cada folha da comemoração: ângulo (graus) e distância (px). */
const LEAVES = [
  [-80, 46],
  [-45, 58],
  [-12, 44],
  [22, 60],
  [58, 46],
  [96, 56],
  [134, 44],
  [170, 60],
  [205, 46],
  [240, 58],
] as const;

/** O dia em um anel: quantas doses já foram registradas, do total. */
function ProgressRing({ progress }: { progress: DayProgress }) {
  const { done, total } = progress;
  const complete = total > 0 && done === total;
  // Comemora só quando a última dose é registrada com a tela aberta, não a cada visita.
  const [seen, setSeen] = useState(done);
  const [party, setParty] = useState(0);
  if (done !== seen) {
    setSeen(done);
    if (complete && done > seen) setParty((count) => count + 1);
  }

  return (
    <div
      className="anel"
      role="img"
      aria-label={`${done} de ${total} doses registradas`}
      data-completo={complete}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="anel-trilho" cx="32" cy="32" r="26" />
        <circle
          className="anel-feito"
          cx="32"
          cy="32"
          r="26"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - (total ? done / total : 0))}
        />
        {complete && <path className="anel-check" d="m22 33 7 7 13-15" pathLength={1} />}
      </svg>
      {!complete && (
        <p className="anel-conta numeros" aria-hidden="true">
          <span key={done} className="anel-feitas">
            {done}
          </span>
          <span className="anel-total">/{total}</span>
        </p>
      )}
      {party > 0 && (
        <span key={party} className="festa" aria-hidden="true">
          {LEAVES.map(([angle, distance], index) => (
            <span
              key={angle}
              style={
                {
                  '--angulo': `${angle}deg`,
                  '--longe': `${distance}px`,
                  '--atraso': `${index * 18}ms`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      )}
    </div>
  );
}

function DoseItem({
  dose,
  date,
  timezone,
  index,
}: {
  dose: DoseToday;
  date: string;
  timezone?: string;
  index: number;
}) {
  const act = useDoseAction();
  const toast = useToast();
  const run = (action: 'take' | 'skip' | 'undo') => {
    if (action === 'take') haptic();
    act.mutate(
      { scheduleId: dose.scheduleId, action, date },
      { onError: (error) => toast(error.message, 'error') },
    );
  };
  const done = dose.status === 'taken' || dose.status === 'skipped';

  return (
    <li className="dose" data-status={dose.status} style={{ '--i': index } as CSSProperties}>
      <time className="dose-hora numeros">{dose.time}</time>
      <span className="dose-no" aria-hidden="true">
        {dose.status === 'taken' && (
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path className="dose-check" d="m5 12.5 4.5 4.5L19 7.5" pathLength={1} />
          </svg>
        )}
      </span>
      <div className="dose-corpo">
        <div>
          <p className="dose-nome">
            <Link href={`/remedios/${dose.medicineId}`} state={FROM_TODAY}>
              {dose.medicineName}
            </Link>
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
  const progress = dayProgress(doses, today.data.time);
  const open = progress.total - progress.done;
  const next = nextSentence(progress, doses);

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
      <header className="pagina-topo pagina-topo-dia">
        <div>
          <h1 className="titulo-dia">{formatLongDate(date)}</h1>
          <p className="resumo">{summary(open, doses.length, attention.length)}</p>
          {next && <p className="proxima">{next}</p>}
        </div>
        {doses.length > 0 && <ProgressRing progress={progress} />}
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
              {doses.map((dose, index) => (
                <DoseItem
                  index={index}
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
            <p className="secao-vazia secao-vazia-mascote">
              <Mascote pose="tudo-certo" size={72} />
              Nada acabando nem vencendo.
            </p>
          ) : (
            <ul className="lista">
              {attention.map(({ medicine, health }, index) => (
                <li key={medicine.id} style={{ '--i': index } as CSSProperties}>
                  <Link
                    href={`/remedios/${medicine.id}`}
                    state={FROM_TODAY}
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
