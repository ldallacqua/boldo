import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, Route, Switch } from 'wouter';
import { Shell } from './components/Shell';
import { Empty, LoadError, Loading } from './components/States';
import { useSession } from './lib/queries';
import { Login } from './pages/Login';
import { Medicines } from './pages/Medicines';
import { Settings } from './pages/Settings';
import { Today } from './pages/Today';

export function App() {
  const session = useSession();
  const client = useQueryClient();

  // O service worker avisa quando uma dose foi registrada pela notificação.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'refresh') client.invalidateQueries();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [client]);

  if (session.isPending) return <Loading label="Abrindo o Boldo" />;
  if (session.isError) {
    return <LoadError message={session.error.message} onRetry={() => session.refetch()} />;
  }
  if (!session.data.authenticated) return <Login />;

  return (
    <Shell>
      <Switch>
        <Route path="/" component={Today} />
        <Route path="/remedios/*?" component={Medicines} />
        <Route path="/ajustes" component={Settings} />
        <Route>
          <Empty title="Página não encontrada" pose="ops">
            <p>Esse endereço não existe no Boldo.</p>
            <Link className="botao" href="/">
              Ir para Hoje
            </Link>
          </Empty>
        </Route>
      </Switch>
    </Shell>
  );
}
