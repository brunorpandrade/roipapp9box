// ROIP APP 9BOX — client component canonico `LgpdExportClient`
// (ME-1.12.b Despacho A, item [1.12.b] do roadmap V4).
//
// Lista integral dos titulares (employees + C-levels) da empresa com
// campo de busca client-side (nome ou CPF, case-insensitive, sem
// acento via `normalizeForSearch`) e botao canonico "Exportar PDF"
// que chama `GET /api/super-admin/lgpd/exportar?companyId=X&
// titularType=Y&titularId=Z` para disparar o download do PDF integral
// §19.6 do titular selecionado.
//
// Pattern canonico de busca espelha
// `src/app/super-admin/empresa/[id]/todos-os-colaboradores/
// ColaboradorSearchBox.tsx` (debounce de 300ms + filtro client-side
// sobre lista ja carregada).
//
// **RV-13.** Consumido pela page `./page.tsx`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use client';

import { useMemo, useState, type CSSProperties, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import { formatCpf } from '../../../../../lib/cpf/formatCpf';
import { normalizeForSearch } from '../../../../../lib/text/normalizeForSearch';

export interface LgpdTitularRow {
  readonly titularType: 'employee' | 'clevel';
  readonly id: number;
  readonly name: string;
  readonly cpf: string;
  readonly cargo: string;
  readonly status: 'ativo' | 'inativo';
}

export interface LgpdExportClientProps {
  readonly companyId: number;
  readonly titulares: readonly LgpdTitularRow[];
}

const WRAP: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const SEARCH_INPUT: CSSProperties = {
  padding: '9px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 13,
  color: COLORS.text.primary,
  background: '#FFFFFF',
  width: '100%',
  maxWidth: 420,
  boxSizing: 'border-box',
};

const TABLE_WRAP: CSSProperties = {
  overflowX: 'auto',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
};

const TABLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const TH_BASE: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  background: COLORS.background.elevated,
  color: COLORS.text.secondary,
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: `1px solid ${COLORS.border.default}`,
};

const TD_BASE: CSSProperties = {
  padding: '10px 12px',
  borderBottom: `1px solid ${COLORS.border.default}`,
  color: COLORS.text.primary,
};

const BOTAO_EXPORTAR: CSSProperties = {
  padding: '6px 14px',
  background: COLORS.primary.navy,
  color: '#FFFFFF',
  border: 'none',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const BADGE_INATIVO: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  background: COLORS.border.default,
  color: COLORS.text.tertiary,
  borderRadius: 10,
  fontSize: 10,
  fontWeight: 700,
  marginLeft: 8,
};

const TITULAR_TIPO_ROTULO: Record<'employee' | 'clevel', string> = {
  employee: 'Colaborador',
  clevel: 'C-Level',
};

export function LgpdExportClient(props: LgpdExportClientProps): JSX.Element {
  const { companyId, titulares } = props;
  const [query, setQuery] = useState('');

  const titularesFiltrados = useMemo(() => {
    const normalizedQuery = normalizeForSearch(query.trim());
    if (normalizedQuery.length === 0) {
      return titulares;
    }
    return titulares.filter((t) => {
      const nomeNorm = normalizeForSearch(t.name);
      const cpfDigits = t.cpf.replace(/\D/g, '');
      const queryDigits = query.replace(/\D/g, '');
      if (nomeNorm.includes(normalizedQuery)) {
        return true;
      }
      if (queryDigits.length > 0 && cpfDigits.includes(queryDigits)) {
        return true;
      }
      return false;
    });
  }, [titulares, query]);

  function hrefExportar(titular: LgpdTitularRow): string {
    const qs = new URLSearchParams({
      companyId: String(companyId),
      titularType: titular.titularType,
      titularId: String(titular.id),
    });
    return `/api/super-admin/lgpd/exportar?${qs.toString()}`;
  }

  function onExportar(titular: LgpdTitularRow): void {
    const url = hrefExportar(titular);
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }

  return (
    <div style={WRAP}>
      <input
        type="search"
        placeholder="Buscar por nome ou CPF…"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        style={SEARCH_INPUT}
        aria-label="Buscar titular por nome ou CPF"
      />

      <div style={TABLE_WRAP}>
        <table style={TABLE}>
          <thead>
            <tr>
              <th style={TH_BASE}>Nome</th>
              <th style={TH_BASE}>CPF</th>
              <th style={TH_BASE}>Cargo</th>
              <th style={TH_BASE}>Tipo</th>
              <th style={{ ...TH_BASE, textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {titularesFiltrados.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    ...TD_BASE,
                    textAlign: 'center',
                    color: COLORS.text.tertiary,
                    padding: '24px 12px',
                  }}
                >
                  Nenhum titular encontrado para a busca.
                </td>
              </tr>
            ) : (
              titularesFiltrados.map((t) => (
                <tr key={`${t.titularType}-${t.id}`}>
                  <td style={TD_BASE}>
                    {t.name}
                    {t.status === 'inativo' ? <span style={BADGE_INATIVO}>INATIVO</span> : null}
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: 'monospace', fontSize: 12 }}>
                    {formatCpf(t.cpf)}
                  </td>
                  <td style={{ ...TD_BASE, color: COLORS.text.secondary }}>{t.cargo}</td>
                  <td style={{ ...TD_BASE, color: COLORS.text.secondary }}>
                    {TITULAR_TIPO_ROTULO[t.titularType]}
                  </td>
                  <td style={{ ...TD_BASE, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => onExportar(t)}
                      style={BOTAO_EXPORTAR}
                      aria-label={`Exportar PDF LGPD integral de ${t.name}`}
                    >
                      Exportar PDF
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
