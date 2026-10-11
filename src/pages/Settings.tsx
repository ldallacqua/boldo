import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Mascote } from '../components/Mascote';
import { LoadError, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { promptInstall, useCanInstall } from '../lib/install';
import {
  disablePush,
  enablePush,
  getPushEndpoint,
  getPushState,
  isIos,
  isStandalone,
  type PushState,
} from '../lib/push';
import { useMedicines, useSaveSettings, useSettings } from '../lib/queries';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '../lib/theme';

const PUSH_TEXT: Record<PushState, string> = {
  on: 'Este aparelho recebe os lembretes de dose e os avisos de estoque e validade dos remédios marcados abaixo.',
  off: 'Este aparelho ainda não recebe lembretes.',
  denied:
    'As notificações estão bloqueadas para este site. Libere nas configurações do navegador e volte aqui.',
  'needs-install':
    'No iPhone e no iPad, os lembretes só funcionam com o app instalado. Toque em Compartilhar, depois em "Adicionar à Tela de Início", e abra o Boldo por lá.',
  unsupported:
    'Este navegador não tem suporte a notificações. Use Chrome, Edge, Firefox ou Safari.',
};

/**
 * A farmacinha é da casa, mas cada pessoa só quer ser avisada do que é dela: aqui o aparelho
 * escolhe de quais remédios recebe lembrete de dose e aviso de estoque e validade.
 */
function DeviceMedicines() {
  const medicines = useMedicines();
  const toast = useToast();
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [muted, setMuted] = useState<number[] | null>(null);

  useEffect(() => {
    let current = true;
    (async () => {
      const found = await getPushEndpoint();
      if (!found) return;
      const device = await api.getDevice(found);
      if (!current) return;
      setEndpoint(found);
      setMuted(device.mutedMedicines);
    })().catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  if (!endpoint || !muted || !medicines.data) return null;
  if (medicines.data.length === 0) return null;

  const toggle = async (id: number, notify: boolean) => {
    const before = muted;
    const next = notify ? muted.filter((other) => other !== id) : [...muted, id];
    setMuted(next);
    try {
      setMuted((await api.saveDevice(endpoint, next)).mutedMedicines);
    } catch (error) {
      setMuted(before);
      toast((error as Error).message, 'error');
    }
  };

  return (
    <fieldset className="campo">
      <legend>Avisar neste aparelho sobre</legend>
      <div className="avisados">
        {medicines.data.map((medicine) => (
          <label key={medicine.id} className="avisado">
            <input
              type="checkbox"
              checked={!muted.includes(medicine.id)}
              onChange={(e) => toggle(medicine.id, e.target.checked)}
            />
            <span className="avisado-nome">
              {medicine.name}
              {medicine.dosage && <span>{medicine.dosage}</span>}
            </span>
          </label>
        ))}
      </div>
      <p className="ajuda">
        Desmarque os remédios de outra pessoa da casa. Vale só para este aparelho; os outros
        continuam recebendo. Remédios novos já entram marcados.
      </p>
    </fieldset>
  );
}

function Appearance() {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice);
  const options: [ThemeChoice, string][] = [
    ['auto', 'Como o aparelho'],
    ['claro', 'Claro'],
    ['escuro', 'Escuro'],
  ];
  return (
    <section className="bloco" aria-labelledby="aparencia-titulo">
      <h2 id="aparencia-titulo">Aparência</h2>
      <fieldset className="opcoes">
        <legend className="so-leitor">Tema</legend>
        {options.map(([value, label]) => (
          <label key={value} className="opcao">
            <input
              type="radio"
              name="tema"
              value={value}
              checked={choice === value}
              onChange={() => {
                setChoice(value);
                setThemeChoice(value);
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="ajuda">Vale só para este aparelho.</p>
    </section>
  );
}

function Reminders({ vapidPublicKey, devices }: { vapidPublicKey: string; devices: number }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const client = useQueryClient();

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  const run = async (work: () => Promise<PushState>, done: (next: PushState) => string | null) => {
    setBusy(true);
    try {
      const next = await work();
      setState(next);
      const message = done(next);
      if (message) toast(message);
      await client.invalidateQueries({ queryKey: ['settings'] });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não deu para mudar os lembretes.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const { delivered } = await api.testPush();
      toast(
        delivered > 0
          ? 'Teste enviado. A notificação deve chegar em instantes.'
          : 'Nenhum aparelho recebeu. Ative os lembretes primeiro.',
        delivered > 0 ? 'ok' : 'error',
      );
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bloco bloco-mascote" aria-labelledby="lembretes-titulo">
      <Mascote pose="lembrete" size={104} />
      <h2 id="lembretes-titulo">Lembretes neste aparelho</h2>
      <p data-testid="push-estado">{state ? PUSH_TEXT[state] : 'Verificando…'}</p>
      <div className="acoes">
        {state === 'off' && (
          <button
            type="button"
            className="botao"
            disabled={busy}
            onClick={() =>
              run(
                () => enablePush(vapidPublicKey),
                (next) => (next === 'on' ? 'Lembretes ativados' : null),
              )
            }
          >
            <Icon name="bell" size={20} />
            Ativar lembretes
          </button>
        )}
        {state === 'on' && (
          <>
            <button type="button" className="botao" disabled={busy} onClick={test}>
              Enviar um teste
            </button>
            <button
              type="button"
              className="botao"
              data-variant="secundario"
              disabled={busy}
              onClick={() => run(disablePush, () => 'Lembretes desativados')}
            >
              Desativar lembretes
            </button>
          </>
        )}
      </div>
      {state === 'on' && <DeviceMedicines />}
      <p className="ajuda">
        {devices === 0
          ? 'Nenhum aparelho recebe lembretes por enquanto.'
          : devices === 1
            ? '1 aparelho recebe lembretes.'
            : `${devices} aparelhos recebem lembretes.`}{' '}
        Ative em cada celular, tablet ou computador em que quiser ser avisado.
      </p>
    </section>
  );
}

function Alerts({
  expiryWarnDays,
  alertTime,
  timezone,
}: {
  expiryWarnDays: number;
  alertTime: string;
  timezone: string;
}) {
  const [days, setDays] = useState(String(expiryWarnDays));
  const [time, setTime] = useState(alertTime);
  const save = useSaveSettings();
  const toast = useToast();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      { expiryWarnDays: Number(days), alertTime: time },
      {
        onSuccess: () => toast('Avisos salvos'),
        onError: (error) => toast(error.message, 'error'),
      },
    );
  };

  return (
    <section className="bloco" aria-labelledby="avisos-titulo">
      <h2 id="avisos-titulo">Avisos de estoque e validade</h2>
      <form className="formulario" onSubmit={onSubmit}>
        <div className="campos-lado">
          <div className="campo">
            <label htmlFor="antecedencia">Avisar da validade com</label>
            <div className="campo-sufixo">
              <input
                id="antecedencia"
                type="number"
                inputMode="numeric"
                min="1"
                max="365"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                required
              />
              <span>dias de antecedência</span>
            </div>
          </div>
          <div className="campo">
            <label htmlFor="hora-avisos">Enviar avisos a partir das</label>
            <input
              id="hora-avisos"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
        </div>
        <p className="ajuda">
          Os lembretes de dose saem na hora marcada em cada remédio. Avisos de estoque e validade
          não são enviados depois das 21:00. Fuso horário do servidor: {timezone}.
        </p>
        <div className="acoes">
          <button type="submit" className="botao" disabled={save.isPending}>
            Salvar avisos
          </button>
        </div>
      </form>
    </section>
  );
}

function Install() {
  const canInstall = useCanInstall();
  const toast = useToast();

  if (isStandalone()) return null;
  return (
    <section className="bloco" aria-labelledby="instalar-titulo">
      <h2 id="instalar-titulo">Instalar o app</h2>
      {canInstall ? (
        <>
          <p>O Boldo abre em tela cheia, como um app, direto da tela inicial.</p>
          <div className="acoes">
            <button
              type="button"
              className="botao"
              onClick={async () => {
                if (await promptInstall()) toast('App instalado');
              }}
            >
              <Icon name="phone" size={20} />
              Instalar neste aparelho
            </button>
          </div>
        </>
      ) : isIos() ? (
        <p>
          No Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início". O Boldo passa a
          abrir como um app.
        </p>
      ) : (
        <p>
          No menu do navegador, escolha "Instalar app" ou "Adicionar à tela inicial". No Safari do
          Mac, use Arquivo e depois "Adicionar ao Dock".
        </p>
      )}
    </section>
  );
}

export function Settings() {
  const settings = useSettings();
  const client = useQueryClient();
  const toast = useToast();

  if (settings.isPending) return <Loading />;
  if (settings.isError) {
    return <LoadError message={settings.error.message} onRetry={() => settings.refetch()} />;
  }

  const logout = () => {
    api.logout();
    client.setQueryData(['session'], { authenticated: false });
    // Não sobra dado de remédio na memória depois de sair.
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
  };

  // A API exige o token no cabeçalho, então um link comum não serve: baixa e salva pelo app.
  const download = async () => {
    try {
      const data = await api.exportData();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `boldo-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast('Cópia baixada');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  return (
    <>
      <header className="pagina-topo">
        <h1>Ajustes</h1>
      </header>
      <div className="blocos">
        <Reminders vapidPublicKey={settings.data.vapidPublicKey} devices={settings.data.devices} />
        <Alerts
          key={`${settings.data.expiryWarnDays}-${settings.data.alertTime}`}
          expiryWarnDays={settings.data.expiryWarnDays}
          alertTime={settings.data.alertTime}
          timezone={settings.data.timezone}
        />
        <Appearance />
        <Install />
        <section className="bloco" aria-labelledby="dados-titulo">
          <h2 id="dados-titulo">Seus dados</h2>
          <p>
            Tudo fica no banco de dados do servidor, então qualquer navegador mostra a mesma
            farmacinha. Baixe uma cópia quando quiser guardar um backup.
          </p>
          <div className="acoes">
            <button type="button" className="botao" data-variant="secundario" onClick={download}>
              <Icon name="download" size={20} />
              Baixar cópia dos dados
            </button>
            <button type="button" className="botao" data-variant="texto" onClick={logout}>
              <Icon name="logout" size={20} />
              Sair
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
