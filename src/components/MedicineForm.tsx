import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CatalogMatch } from '../../shared/catalog';
import { DOSAGE_UNITS, formatDosage, parseDosage, type DosageUnit } from '../../shared/dosage';
import { normalizeTags, SUGGESTED_TAGS } from '../../shared/tags';
import {
  ALL_DAYS,
  UNIT_KEYS,
  UNITS,
  type Medicine,
  type MedicineInput,
  type UnitKey,
  type Weekday,
} from '../../shared/types';
import { parseMedicineInput } from '../../shared/validate';
import { TagInput } from './TagInput';
import { MONTHS } from '../lib/dates';
import { useDeviceAlerts } from '../lib/device';
import { useSaveMedicine } from '../lib/queries';
import { BarcodeScanner } from './BarcodeScanner';
import { Icon } from './Icon';
import { useToast } from './Toast';

interface ScheduleDraft {
  key: string;
  id?: number;
  time: string;
  dose: string;
  days: Weekday[];
}

interface Draft {
  name: string;
  dosageAmount: string;
  dosageUnit: DosageUnit;
  tags: string[];
  /** O que está digitado no campo de tags e ainda não virou tag. */
  tagText: string;
  unit: UnitKey;
  quantity: string;
  lowThreshold: string;
  expiryMonth: string;
  expiryYear: string;
  notes: string;
  schedules: ScheduleDraft[];
}

const DAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

let nextKey = 0;
const newKey = () => `novo-${(nextKey += 1)}`;

function toDraft(medicine: Medicine | null): Draft {
  const [year = '', month = ''] = medicine?.expiresOn?.split('-') ?? [];
  const dosage = medicine ? parseDosage(medicine.dosage) : null;
  return {
    name: medicine?.name ?? '',
    dosageAmount: dosage ? String(dosage.amount) : '',
    dosageUnit: dosage?.unit ?? 'mg',
    tags: medicine?.tags ?? [],
    tagText: '',
    unit: medicine?.unit ?? 'comprimido',
    quantity: medicine ? String(medicine.quantity) : '',
    lowThreshold: medicine?.lowThreshold ? String(medicine.lowThreshold) : '',
    expiryMonth: month,
    expiryYear: year,
    notes: medicine?.notes ?? '',
    schedules:
      medicine?.schedules.map((s) => ({
        key: `id-${s.id}`,
        id: s.id,
        time: s.time,
        dose: String(s.dose),
        days: s.days,
      })) ?? [],
  };
}

const toNumber = (value: string) => (value.trim() === '' ? 0 : Number(value.replace(',', '.')));

function toInput(draft: Draft): MedicineInput {
  return {
    name: draft.name,
    dosage:
      draft.dosageAmount.trim() === ''
        ? ''
        : formatDosage({ amount: toNumber(draft.dosageAmount), unit: draft.dosageUnit }),
    tags: [...draft.tags, draft.tagText],
    unit: draft.unit,
    quantity: toNumber(draft.quantity),
    lowThreshold: toNumber(draft.lowThreshold),
    expiresOn:
      draft.expiryMonth && draft.expiryYear ? `${draft.expiryYear}-${draft.expiryMonth}` : null,
    notes: draft.notes,
    schedules: draft.schedules.map((s) => ({
      id: s.id,
      time: s.time,
      dose: toNumber(s.dose),
      days: s.days,
    })),
  };
}

interface MedicineFormProps {
  medicine: Medicine | null;
  /** Tags já usadas em outros remédios, oferecidas antes das sugestões gerais. */
  usedTags?: string[];
  onSaved: (medicine: Medicine) => void;
  onCancel: () => void;
  /** Avisa quando passa a haver (ou deixa de haver) edição não salva. */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Horário sugerido para o próximo lembrete: manhã, depois noite, depois o meio da tarde. */
const DEFAULT_TIMES = ['08:00', '20:00', '14:00'];
function nextTime(schedules: ScheduleDraft[]): string {
  const taken = new Set(schedules.map((schedule) => schedule.time));
  return DEFAULT_TIMES.find((time) => !taken.has(time)) ?? '08:00';
}

export function MedicineForm({
  medicine,
  usedTags = [],
  onSaved,
  onCancel,
  onDirtyChange,
}: MedicineFormProps) {
  const [draft, setDraft] = useState(() => toDraft(medicine));
  const [initial] = useState(() => JSON.stringify(draft));
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<CatalogMatch | null>(null);
  const save = useSaveMedicine(medicine?.id ?? null);
  const toast = useToast();
  const alerts = useDeviceAlerts();
  // null: a pessoa não mexeu, vale o que o aparelho já tem (remédio novo começa avisando).
  const [notifyChoice, setNotifyChoice] = useState<boolean | null>(null);
  const notify = notifyChoice ?? (medicine ? alerts.notifies(medicine.id) : true);

  // Remédio novo começa com o cursor no nome. Sem `autoFocus`: ele rolaria o painel, que
  // ainda está entrando, para dentro da tela de uma vez (veja o foco em Sheet.tsx).
  const nameField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!medicine) nameField.current?.focus({ preventScroll: true });
  }, [medicine]);

  // Depois de salvar não há mais o que perder, mesmo com o rascunho ainda diferente do original.
  const [saved, setSaved] = useState(false);
  const dirty = !saved && JSON.stringify(draft) !== initial;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const setSchedule = (key: string, patch: Partial<ScheduleDraft>) =>
    set(
      'schedules',
      draft.schedules.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );

  /** Põe no formulário o que a lista da Anvisa diz da caixa lida. A pessoa confere e salva. */
  const applyMatch = (match: CatalogMatch) => {
    const { prefill } = match;
    const dosage = parseDosage(prefill.dosage);
    setDraft((current) => ({
      ...current,
      name: prefill.name,
      dosageAmount: dosage ? String(dosage.amount) : '',
      dosageUnit: dosage?.unit ?? current.dosageUnit,
      unit: prefill.unit,
      quantity: String(prefill.quantity),
      tags: prefill.tags.length > 0 ? prefill.tags : current.tags,
      tagText: '',
      notes:
        !prefill.notes || current.notes.includes(prefill.notes)
          ? current.notes
          : [current.notes.trim(), prefill.notes].filter(Boolean).join('\n'),
    }));
    setScanned(match);
    setScanning(false);
    setError(null);
    toast('Dados da caixa preenchidos');
  };

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 14 }, (_, i) => String(thisYear - 2 + i));
  if (draft.expiryYear && !years.includes(draft.expiryYear)) years.unshift(draft.expiryYear);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (Boolean(draft.expiryMonth) !== Boolean(draft.expiryYear)) {
      setError('Para a validade, escolha o mês e o ano (ou deixe os dois em branco).');
      return;
    }
    const parsed = parseMedicineInput(toInput(draft));
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    save.mutate(parsed.value, {
      onSuccess: async (saved) => {
        if (alerts.device && notify !== alerts.notifies(saved.id)) {
          await alerts
            .setNotify(saved.id, notify)
            .catch(() => toast('Não deu para guardar a escolha de aviso deste aparelho', 'error'));
        }
        toast('Remédio salvo');
        setSaved(true);
        onSaved(saved);
      },
      onError: (failure) => setError(failure.message),
    });
  };

  const unitPlural = UNITS[draft.unit][1];
  const tagSuggestions = normalizeTags([...usedTags, ...SUGGESTED_TAGS]);

  return (
    <form className="formulario" onSubmit={onSubmit} noValidate>
      {!medicine &&
        (scanning ? (
          <BarcodeScanner onMatch={applyMatch} onClose={() => setScanning(false)} />
        ) : (
          <button
            type="button"
            className="botao leitor-abrir"
            data-variant="secundario"
            onClick={() => setScanning(true)}
          >
            <Icon name="scan" size={20} />
            {scanned ? 'Ler outro código de barras' : 'Ler código de barras'}
          </button>
        ))}

      {scanned && !scanning && (
        <div className="leitor-achou" role="status">
          <p>
            <strong>Confira antes de salvar.</strong> Os campos vieram da lista da Anvisa, e a
            quantidade é a de uma caixa cheia.
          </p>
          <p className="ajuda">
            {scanned.label} ({scanned.laboratory})
          </p>
        </div>
      )}

      <div className="campo">
        <label htmlFor="nome">Nome</label>
        <input
          id="nome"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Dipirona"
          autoComplete="off"
          required
          ref={nameField}
        />
      </div>

      <fieldset className="campo">
        <legend>Dosagem</legend>
        <div className="campos-lado">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            aria-label="Valor da dosagem"
            value={draft.dosageAmount}
            onChange={(e) => set('dosageAmount', e.target.value)}
            placeholder="500"
          />
          <select
            aria-label="Medida da dosagem"
            value={draft.dosageUnit}
            onChange={(e) => set('dosageUnit', e.target.value as DosageUnit)}
          >
            {DOSAGE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
        <p className="ajuda">Como está na caixa. Deixe o número em branco se não houver.</p>
      </fieldset>

      <TagInput
        id="serve"
        label="Pra que serve"
        tags={draft.tags}
        text={draft.tagText}
        suggestions={tagSuggestions}
        onChange={(tags, tagText) => setDraft((current) => ({ ...current, tags, tagText }))}
      />

      <div className="campos-lado">
        <div className="campo">
          <label htmlFor="quantidade">Quantidade em casa</label>
          <input
            id="quantidade"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={draft.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="campo">
          <label htmlFor="unidade">Unidade</label>
          <select
            id="unidade"
            value={draft.unit}
            onChange={(e) => set('unit', e.target.value as UnitKey)}
          >
            {UNIT_KEYS.map((key) => (
              <option key={key} value={key}>
                {UNITS[key][1]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="campo">
        <label htmlFor="minimo">Avisar quando restar</label>
        <div className="campo-sufixo">
          <input
            id="minimo"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={draft.lowThreshold}
            onChange={(e) => set('lowThreshold', e.target.value)}
            placeholder="0"
            aria-describedby="minimo-ajuda"
          />
          <span>{unitPlural}</span>
        </div>
        <p id="minimo-ajuda" className="ajuda">
          Deixe em branco para não avisar que está acabando.
        </p>
      </div>

      <fieldset className="campo">
        <legend>Validade</legend>
        <div className="campos-lado">
          <select
            aria-label="Mês da validade"
            value={draft.expiryMonth}
            onChange={(e) => set('expiryMonth', e.target.value)}
          >
            <option value="">Mês</option>
            {MONTHS.map((name, index) => {
              const value = String(index + 1).padStart(2, '0');
              return (
                <option key={value} value={value}>
                  {value} ({name})
                </option>
              );
            })}
          </select>
          <select
            aria-label="Ano da validade"
            value={draft.expiryYear}
            onChange={(e) => set('expiryYear', e.target.value)}
          >
            <option value="">Ano</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <p className="ajuda">Como está na caixa: mês e ano.</p>
      </fieldset>

      <fieldset className="campo">
        <legend>Horários para tomar</legend>
        {draft.schedules.length === 0 && (
          <p className="ajuda">Sem horários, este remédio não gera lembrete de dose.</p>
        )}
        <ul className="horarios">
          {draft.schedules.map((schedule, index) => (
            <li key={schedule.key} className="horario">
              <div className="horario-linha">
                <input
                  type="time"
                  aria-label={`Horário ${index + 1}`}
                  value={schedule.time}
                  onChange={(e) => setSchedule(schedule.key, { time: e.target.value })}
                  required
                />
                <div className="campo-sufixo">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label={`Dose do horário ${index + 1}`}
                    value={schedule.dose}
                    onChange={(e) => setSchedule(schedule.key, { dose: e.target.value })}
                  />
                  <span>{unitPlural}</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remover horário ${index + 1}`}
                  onClick={() =>
                    set(
                      'schedules',
                      draft.schedules.filter((s) => s.key !== schedule.key),
                    )
                  }
                >
                  <Icon name="trash" size={20} />
                </button>
              </div>
              <div className="dias" role="group" aria-label={`Dias do horário ${index + 1}`}>
                {ALL_DAYS.map((day) => {
                  const on = schedule.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      className="dia"
                      aria-pressed={on}
                      aria-label={DAY_NAMES[day]}
                      onClick={() =>
                        setSchedule(schedule.key, {
                          days: on
                            ? schedule.days.filter((d) => d !== day)
                            : [...schedule.days, day].sort(),
                        })
                      }
                    >
                      {DAY_LETTERS[day]}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="botao"
          data-variant="secundario"
          onClick={() =>
            set('schedules', [
              ...draft.schedules,
              { key: newKey(), time: nextTime(draft.schedules), dose: '1', days: ALL_DAYS },
            ])
          }
        >
          <Icon name="plus" size={20} />
          Adicionar horário
        </button>
      </fieldset>

      <div className="campo">
        <label htmlFor="notas">Anotações</label>
        <textarea
          id="notas"
          rows={4}
          value={draft.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Onde está guardado, quem receitou, tomar depois de comer…"
        />
      </div>

      {alerts.device && (
        <div className="campo">
          <label className="avisado avisado-so">
            <input
              type="checkbox"
              role="switch"
              checked={notify}
              onChange={(e) => setNotifyChoice(e.target.checked)}
            />
            <span className="avisado-nome">Avisar neste aparelho</span>
          </label>
          <p className="ajuda">
            Lembrete de dose e aviso de estoque e validade deste remédio. Cada aparelho da casa
            escolhe o seu.
          </p>
        </div>
      )}

      {error && (
        <p className="erro" role="alert">
          {error}
        </p>
      )}

      <div className="acoes acoes-fixas">
        <button type="submit" className="botao" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar remédio'}
        </button>
        <button type="button" className="botao" data-variant="secundario" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
