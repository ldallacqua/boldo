import type { KeyboardEvent } from 'react';
import { MAX_TAGS, normalizeTag, normalizeTags, tagKey } from '../../shared/tags';
import { Icon } from './Icon';

interface TagInputProps {
  id: string;
  label: string;
  tags: string[];
  /** O que está digitado e ainda não virou tag. */
  text: string;
  suggestions: string[];
  onChange: (tags: string[], text: string) => void;
}

const MAX_SUGGESTIONS = 10;

/** Campo de tags: as escolhidas viram cápsulas; as sugestões entram com um toque. */
export function TagInput({ id, label, tags, text, suggestions, onChange }: TagInputProps) {
  const full = tags.length >= MAX_TAGS;
  const chosen = new Set(tags.map(tagKey));
  const typed = tagKey(text);
  const offered = suggestions
    .filter((tag) => !chosen.has(tagKey(tag)) && tagKey(tag).includes(typed))
    .slice(0, MAX_SUGGESTIONS);

  const add = (raw: string) => onChange(normalizeTags([...tags, raw]), '');

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Enter cria a tag em vez de enviar o formulário.
      event.preventDefault();
      if (normalizeTag(text)) add(text);
    } else if (event.key === 'Backspace' && text === '' && tags.length > 0) {
      onChange(tags.slice(0, -1), '');
    }
  };

  const onInput = (value: string) => {
    // Vírgula separa tags, como em uma lista escrita à mão.
    if (!/[,;]/.test(value)) return onChange(tags, value);
    const parts = value.split(/[,;]/);
    const rest = parts.pop() ?? '';
    onChange(normalizeTags([...tags, ...parts]), rest.trimStart());
  };

  return (
    <div className="campo">
      <label htmlFor={id}>{label}</label>
      <div className="tags-campo">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button
              type="button"
              className="tag-remover"
              aria-label={`Remover ${tag}`}
              onClick={() =>
                onChange(
                  tags.filter((other) => other !== tag),
                  text,
                )
              }
            >
              <Icon name="close" size={16} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={tags.length === 0 ? 'Dor, febre…' : full ? '' : 'Outra…'}
          autoComplete="off"
          enterKeyHint="done"
          disabled={full}
          aria-describedby={`${id}-ajuda`}
        />
      </div>
      {!full && offered.length > 0 && (
        <div className="tags-sugestoes" role="group" aria-label="Sugestões de tags">
          {offered.map((tag) => (
            <button key={tag} type="button" className="tag-sugestao" onClick={() => add(tag)}>
              <Icon name="plus" size={16} />
              {tag}
            </button>
          ))}
        </div>
      )}
      <p id={`${id}-ajuda`} className="ajuda">
        {full
          ? `Chegou ao limite de ${MAX_TAGS} tags.`
          : 'Toque em uma sugestão ou escreva a sua e aperte Enter.'}
      </p>
    </div>
  );
}
