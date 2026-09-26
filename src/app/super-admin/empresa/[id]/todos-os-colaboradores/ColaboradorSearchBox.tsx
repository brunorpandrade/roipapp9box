'use client';

// ROIP APP 9BOX — ColaboradorSearchBox: campo de busca da tabela
// `/todos-os-colaboradores` com icone de lupa + autocomplete conforme
// digita (§14.10 — "input com icone de lupa... busca em tempo real,
// debounce 300ms, case-insensitive, sem acento").
//
// Extraido do `<input>` inline do `TodosColaboradoresClient` (L125 —
// refactor do callsite original) para ser componente unico reusado pelas
// duas rotas da tabela — nativa `/todos-os-colaboradores` e Bruno
// `/super-admin/empresa/[id]/todos-os-colaboradores` — via o client
// compartilhado (RV-14 — nunca duas copias).
//
// Escopo desta ME (decisao Bruno): APENAS a superficie (lupa +
// autocomplete). O motor de filtro (server-side `busca`) permanece
// intacto — o commit para a tabela continua por Enter / clique na lupa /
// selecao de sugestao / blur, exatamente como antes. O debounce 300ms
// (§14.10) rege a lista de sugestoes client-side (a superficie "em tempo
// real"), nao a cadencia de refetch da tabela.
//
// Padrao do autocomplete espelha `OrganogramaClient` (indice client-side +
// dropdown + `normalizeForSearch` compartilhado): avatar de iniciais
// colorido (§14.10 coluna Foto) + nome + cargo, no maximo 20 resultados.
//
// **RV-13.** `ColaboradorSearchBox` → `TodosColaboradoresClient.tsx`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { useEffect, useMemo, useState, type CSSProperties, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import { normalizeForSearch } from '../../../../../lib/text/normalizeForSearch';

import { getIniciaisFromName, hashNameToColor, type EmployeeSearchEntry } from './internals';

const SUGGESTION_LIMIT = 20 as const;
const DEBOUNCE_MS = 300 as const;

const WRAP: CSSProperties = {
  position: 'relative',
  minWidth: 220,
};

const INPUT: CSSProperties = {
  padding: '7px 34px 7px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 12,
  color: COLORS.text.primary,
  background: '#FFFFFF',
  width: '100%',
  boxSizing: 'border-box',
};

const LUPA_BTN: CSSProperties = {
  position: 'absolute',
  top: '50%',
  right: 6,
  transform: 'translateY(-50%)',
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
  color: COLORS.text.tertiary,
  padding: 0,
};

const DROPDOWN: CSSProperties = {
  position: 'absolute',
  top: 38,
  left: 0,
  width: '100%',
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
  zIndex: 50,
  maxHeight: 240,
  overflowY: 'auto',
};

const DROPDOWN_EMPTY: CSSProperties = {
  padding: 10,
  fontSize: 11,
  color: COLORS.text.quaternary,
};

const DROPDOWN_ITEM: CSSProperties = {
  padding: '8px 10px',
  fontSize: 12,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderBottom: `1px solid ${COLORS.border.divider}`,
  color: COLORS.text.primary,
};

function avatarStyle(name: string): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: hashNameToColor(name),
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    fontWeight: 600,
    flexShrink: 0,
  };
}

export interface ColaboradorSearchBoxProps {
  readonly value: string;
  readonly maxLength: number;
  readonly suggestions: readonly EmployeeSearchEntry[];
  readonly onChange: (next: string) => void;
  readonly onSubmit: () => void;
  readonly onSelectSuggestion: (name: string) => void;
}

export function ColaboradorSearchBox(props: ColaboradorSearchBoxProps): JSX.Element {
  const { value, maxLength, suggestions, onChange, onSubmit, onSelectSuggestion } = props;
  const [showResults, setShowResults] = useState<boolean>(false);
  const [debounced, setDebounced] = useState<string>(value);

  // §14.10 — debounce 300ms rege a lista de sugestoes (superficie "em
  // tempo real"), nao a cadencia de refetch da tabela.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebounced(value);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [value]);

  const hasAutocomplete = suggestions.length > 0;

  const filtered = useMemo<readonly EmployeeSearchEntry[]>(() => {
    const term = normalizeForSearch(debounced.trim());
    if (term.length === 0) return [];
    return suggestions
      .filter((entry) => normalizeForSearch(`${entry.name} ${entry.cargo}`).includes(term))
      .slice(0, SUGGESTION_LIMIT);
  }, [suggestions, debounced]);

  const dropdownAberto = hasAutocomplete && showResults && debounced.trim().length > 0;

  return (
    <div style={WRAP}>
      <input
        style={INPUT}
        type="text"
        placeholder="Buscar por nome, CPF ou cargo..."
        value={value}
        maxLength={maxLength}
        onChange={(e): void => {
          onChange(e.target.value);
          setShowResults(true);
        }}
        onFocus={(): void => {
          if (value.trim().length > 0) setShowResults(true);
        }}
        onKeyDown={(e): void => {
          if (e.key === 'Enter') {
            setShowResults(false);
            onSubmit();
          }
          if (e.key === 'Escape') {
            setShowResults(false);
          }
        }}
        onBlur={(): void => {
          onSubmit();
        }}
        aria-label="Buscar colaborador"
      />
      <button
        type="button"
        style={LUPA_BTN}
        onMouseDown={(e): void => {
          // Impede o blur do input antes do commit deste clique.
          e.preventDefault();
        }}
        onClick={(): void => {
          setShowResults(false);
          onSubmit();
        }}
        aria-label="Buscar"
        title="Buscar"
      >
        🔍
      </button>
      {dropdownAberto ? (
        <div style={DROPDOWN}>
          {filtered.length === 0 ? (
            <div style={DROPDOWN_EMPTY}>Nenhum colaborador encontrado.</div>
          ) : (
            filtered.map((entry) => (
              <div
                key={entry.id}
                role="button"
                tabIndex={0}
                style={DROPDOWN_ITEM}
                onMouseDown={(e): void => {
                  // Mantem o foco / impede blur-commit antes do onClick.
                  e.preventDefault();
                }}
                onClick={(): void => {
                  setShowResults(false);
                  onSelectSuggestion(entry.name);
                }}
              >
                <div style={avatarStyle(entry.name)}>{getIniciaisFromName(entry.name)}</div>
                <span>
                  {entry.name}
                  {entry.cargo.length > 0 ? ` · ${entry.cargo}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
