import { useRef, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import type { MedicineHealth } from '../../shared/status';
import { tagKey } from '../../shared/tags';
import type { Medicine } from '../../shared/types';
import { Icon } from '../components/Icon';
import { MedicineDetail } from '../components/MedicineDetail';
import { MedicineForm } from '../components/MedicineForm';
import { MedicineRow } from '../components/MedicineRow';
import { Sheet, type SheetHandle } from '../components/Sheet';
import { Empty, LoadError, Loading } from '../components/States';
import { useHealth, useMedicines } from '../lib/queries';

type Filter = 'todos' | 'acabando' | 'vencendo' | 'horario';

const FILTERS: { key: Filter; label: string; test: (m: Medicine, h: MedicineHealth) => boolean }[] =
  [
    { key: 'todos', label: 'Todos', test: () => true },
    { key: 'acabando', label: 'Acabando', test: (_, h) => h.stock !== 'ok' },
    {
      key: 'vencendo',
      label: 'Vencendo',
      test: (_, h) => h.expiry === 'expiring' || h.expiry === 'expired',
    },
    { key: 'horario', label: 'Com horário', test: (m) => m.schedules.length > 0 },
  ];

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Medicines() {
  const medicines = useMedicines();
  const healthOf = useHealth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [tag, setTag] = useState<string | null>(null);
  const sheet = useRef<SheetHandle>(null);

  const [isNew] = useRoute('/remedios/novo');
  const [isEdit, editParams] = useRoute('/remedios/:id/editar');
  const [isDetail, detailParams] = useRoute('/remedios/:id');
  const openId = isNew ? null : Number((isEdit ? editParams : detailParams)?.id) || null;

  if (medicines.isPending) return <Loading />;
  if (medicines.isError) {
    return <LoadError message={medicines.error.message} onRetry={() => medicines.refetch()} />;
  }

  const all = medicines.data.map((medicine) => ({ medicine, health: healthOf(medicine) }));
  const query = normalize(search.trim());
  const active = FILTERS.find((f) => f.key === filter)!;
  // As tags em uso, da mais comum para a menos comum.
  const tagCounts = new Map<string, number>();
  for (const { medicine } of all) {
    for (const used of medicine.tags) tagCounts.set(used, (tagCounts.get(used) ?? 0) + 1);
  }
  const usedTags = [...tagCounts.keys()].sort(
    (a, b) => tagCounts.get(b)! - tagCounts.get(a)! || a.localeCompare(b, 'pt-BR'),
  );
  // Se a tag escolhida deixou de existir (remédio editado ou excluído), o filtro some com ela.
  const activeTag = tag !== null && tagCounts.has(tag) ? tag : null;

  const shown = all.filter(
    ({ medicine, health }) =>
      active.test(medicine, health) &&
      (activeTag === null || medicine.tags.some((used) => tagKey(used) === tagKey(activeTag))) &&
      (!query ||
        normalize(`${medicine.name} ${medicine.tags.join(' ')} ${medicine.dosage}`).includes(
          query,
        )),
  );
  const open = all.find(({ medicine }) => medicine.id === openId);
  const leave = () => navigate('/remedios');
  /** Fecha o painel com a animação de saída; `leave` troca a rota quando ela termina. */
  const close = () => (sheet.current ? sheet.current.dismiss() : leave());

  return (
    <>
      <header className="pagina-topo pagina-topo-acao">
        <div>
          <h1>Remédios</h1>
          <p className="resumo">
            {all.length === 0
              ? 'Nenhum cadastrado ainda.'
              : all.length === 1
                ? '1 remédio em casa.'
                : `${all.length} remédios em casa.`}
          </p>
        </div>
        <Link href="/remedios/novo" className="botao adicionar">
          <Icon name="plus" size={20} />
          Adicionar remédio
        </Link>
      </header>

      {all.length === 0 ? (
        <Empty title="A farmacinha está vazia">
          <p>Cadastre o primeiro remédio: nome, para que serve, quanto tem e a validade.</p>
        </Empty>
      ) : (
        <>
          <div className="ferramentas">
            <label className="busca">
              <span className="so-leitor">Buscar remédio</span>
              <Icon name="search" size={20} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou para que serve"
              />
            </label>
            <div className="filtros" role="group" aria-label="Filtrar remédios">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="filtro"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                  <span className="filtro-conta numeros">
                    {all.filter(({ medicine, health }) => f.test(medicine, health)).length}
                  </span>
                </button>
              ))}
            </div>
            {usedTags.length > 0 && (
              <div className="filtros filtros-tags" role="group" aria-label="Filtrar por tag">
                {usedTags.map((used) => (
                  <button
                    key={used}
                    type="button"
                    className="filtro"
                    data-variant="tag"
                    aria-pressed={activeTag === used}
                    onClick={() => setTag(activeTag === used ? null : used)}
                  >
                    {used}
                    <span className="filtro-conta numeros">{tagCounts.get(used)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="secao-vazia">
              Nenhum remédio com esses critérios.{' '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setSearch('');
                  setFilter('todos');
                  setTag(null);
                }}
              >
                Mostrar todos
              </button>
            </p>
          ) : (
            <ul className="lista">
              {shown.map(({ medicine, health }, index) => (
                <MedicineRow key={medicine.id} medicine={medicine} health={health} index={index} />
              ))}
            </ul>
          )}
        </>
      )}

      {(isNew || isDetail || isEdit) && (
        <Sheet
          ref={sheet}
          title={isNew ? 'Novo remédio' : open ? open.medicine.name : 'Remédio não encontrado'}
          view={isNew ? 'novo' : isEdit ? 'editar' : 'detalhe'}
          onClose={leave}
          onBack={isEdit && open ? () => navigate(`/remedios/${open.medicine.id}`) : undefined}
        >
          {isNew ? (
            <MedicineForm
              medicine={null}
              usedTags={usedTags}
              onSaved={(saved) => navigate(`/remedios/${saved.id}`, { replace: true })}
              onCancel={close}
            />
          ) : !open ? (
            <p className="secao-vazia">Ele pode ter sido excluído em outro aparelho.</p>
          ) : isEdit ? (
            <MedicineForm
              key={open.medicine.id}
              medicine={open.medicine}
              usedTags={usedTags}
              onSaved={() => navigate(`/remedios/${open.medicine.id}`)}
              onCancel={() => navigate(`/remedios/${open.medicine.id}`)}
            />
          ) : (
            <MedicineDetail medicine={open.medicine} health={open.health} onDeleted={close} />
          )}
        </Sheet>
      )}
    </>
  );
}
