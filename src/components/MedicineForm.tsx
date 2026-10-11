import { useState, type FormEvent } from 'react';
import { DOSAGE_UNITS, formatDosage, parseDosage, type DosageUnit } from '../../shared/dosage';
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
import { MONTHS } from '../lib/dates';
import { useSaveMedicine } from '../lib/queries';
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
  purpose: string;
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
    purpose: medicine?.purpose ?? '',
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
    purpose: draft.purpose,
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
  onSaved: (medicine: Medicine) => void;
  onCancel: () => void;
}

export function MedicineForm({ medicine, onSaved, onCancel }: MedicineFormProps) {
  const [draft, setDraft] = useState(() => toDraft(medicine));
  const [error, setError] = useState<string | null>(null);
  const save = useSaveMedicine(medicine?.id ?? null);
  const toast = useToast();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const setSchedule = (key: string, patch: Partial<ScheduleDraft>) =>
    set(
      'schedules',
      draft.schedules.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );

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
      onSuccess: (saved) => {
        toast('Remédio salvo');
        onSaved(saved);
      },
      onError: (failure) => setError(failure.message),
    });
  };

  const unitPlural = UNITS[draft.unit][1];

  return (
    <form className="formulario" onSubmit={onSubmit} noValidate>
      <div className="campo">
        <label htmlFor="nome">Nome</label>
        <input
          id="nome"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Dipirona"
          autoComplete="off"
          required
          autoFocus={!medicine}
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

      <div className="campo">
        <label htmlFor="serve">Pra que serve</label>
        <input
          id="serve"
          value={draft.purpose}
          onChange={(e) => set('purpose', e.target.value)}
          placeholder="Dor e febre"
          autoComplete="off"
        />
      </div>

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
              { key: newKey(), time: '08:00', dose: '1', days: ALL_DAYS },
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
