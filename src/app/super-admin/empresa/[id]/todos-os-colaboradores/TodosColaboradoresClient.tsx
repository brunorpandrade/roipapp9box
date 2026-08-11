'use client';

// ROIP APP 9BOX — client component /super-admin/empresa/[id]/todos-os-
// colaboradores (§14.10 + §14.10.1 + §20, ME-076).
//
// Origem canonica:
// - CAMADA_UI §14.10 (14 colunas + 8 filtros + acoes + estados de UI) +
//   §14.10.1 (3 badges L/RH/RF inline no Nome — ordem canonica L → RH
//   → RF) + §20 (dropdown sincronizado com botao dedicado `[RH]`).
// - Mockup canonico `painel_principal_fase7_v5.html` (base — funcao
//   `renderTabelaColaboradores` + estilos base) + delta canonico bit-
//   exact `delta_todos_colaboradores_v2.html` (badges + 8o filtro).
// - CSS canonico bit-exact das badges (`delta_todos_colaboradores_v2.
//   html` patch box):
//   - `.badge-lider`: `#CCFBF1` / `#0F766E`.
//   - `.badge-rh`: `#E6F1FB` / `#0C447C`.
//   - `.badge-respfin`: `#DCFCE7` / `#166534`.
// - S499b: polimento avancado (dirty state modais + banners de mismatch
//   + toast global) canonicamente diferido para ME-080.
//
// Escopo MVP canonico bit-exact desta ME (ficha §3.3 + decisao Bruno):
// - Entra: 14 colunas + 8 filtros + badges L/RH/RF + paginacao server-
//   side + ordenacao 10 colunas + estados canonicos empty/loading.
// - Difere ME-078: pop-up ficha cadastral (icone 📇 render como texto
//   informativo, sem clique); botao `[+ Cadastrar colaborador]` render
//   desabilitado com tooltip "Disponivel apos ME-078".
// - Difere ME-080: 3 botoes de export/import (render desabilitados).
// - Difere Bloco B9: pop-up 80% Dashboard individual (clique Foto/Nome
//   sem acao); icone Perfil individual (🧠) render como badge informa-
//   tivo sem clique.
//
// **RV-13.** `TodosColaboradoresClient` → page.tsx (mesma rota).

import { useCallback, useMemo, useState, type CSSProperties, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import {
  DEPARTAMENTO_VALUES,
  JOB_FAMILY_VALUES,
  NIVEL_HIERARQUICO_VALUES,
  type Departamento,
  type JobFamily,
  type NivelHierarquico,
} from '../../../../../db/schema';
import type {
  EmployeeListRow,
  ListEmployeesPageSize,
  ListEmployeesResult,
  ListEmployeesSortField,
  ListEmployeesSortOrder,
  PapelFuncional,
  ProfileIndividualStatus,
} from '../../../../../server/services/employees';

import { listarColaboradoresAction } from './actions';
import {
  BUSCA_MAX_LEN,
  SENIORIDADE_FILTER_VALUES,
  STATUS_FILTER_VALUES,
  type ColaboradoresFilters,
  type SenioridadeFilterValue,
  type StatusFilterValue,
} from './filters';
import {
  DEPARTAMENTO_LABELS,
  JOB_FAMILY_LABELS,
  NIVEL_HIERARQUICO_LABELS,
  PROFILE_INDIVIDUAL_STATUS_LABELS,
  SENIORIDADE_LABELS,
  STATUS_LABELS,
  formatCpfMasked,
  formatDateBR,
  getIniciaisFromName,
  hashNameToColor,
} from './internals';

// -----------------------------------------------------------------------
// Props canonicos bit-exact
// -----------------------------------------------------------------------

export interface TodosColaboradoresClientProps {
  readonly companyId: number;
  readonly initialResult: ListEmployeesResult;
  readonly initialFilters: ColaboradoresFilters;
  readonly initialDepartamentos: readonly Departamento[];
  readonly initialLideres: readonly { id: number; name: string }[];
}

// -----------------------------------------------------------------------
// Estilos canonicos (inline — padrao ME-057c/ME-074/ME-075)
// -----------------------------------------------------------------------

const CARD_STYLE: CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: 16,
};

const TOOLBAR_ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  justifyContent: 'flex-end',
};

const BTN_OUTLINE: CSSProperties = {
  background: '#FFFFFF',
  color: COLORS.text.secondary,
  border: `1px solid ${COLORS.border.default}`,
  padding: '7px 12px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const BTN_OUTLINE_DISABLED: CSSProperties = {
  ...BTN_OUTLINE,
  color: COLORS.text.quaternary,
  cursor: 'not-allowed',
  background: '#F9FAFB',
};

const BTN_PRIMARY: CSSProperties = {
  background: COLORS.accent.teal,
  color: '#FFFFFF',
  border: `1px solid ${COLORS.accent.teal}`,
  padding: '7px 12px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const BTN_PRIMARY_DISABLED: CSSProperties = {
  ...BTN_PRIMARY,
  background: '#9CD5CB',
  border: '1px solid #9CD5CB',
  cursor: 'not-allowed',
};

const FILTROS_TITLE: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: COLORS.text.tertiary,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  marginBottom: 10,
};

const FILTROS_ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
};

const FILTRO_SELECT: CSSProperties = {
  padding: '7px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 12,
  color: COLORS.text.secondary,
  background: '#FFFFFF',
  cursor: 'pointer',
  minWidth: 160,
};

const FILTRO_INPUT: CSSProperties = {
  padding: '7px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 12,
  color: COLORS.text.primary,
  background: '#FFFFFF',
  minWidth: 220,
};

const FILTRO_DATE: CSSProperties = {
  padding: '7px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 12,
  color: COLORS.text.primary,
  background: '#FFFFFF',
  minWidth: 130,
};

const BTN_RH_ATIVO: CSSProperties = {
  background: '#FFFFFF',
  color: COLORS.primary.navy,
  border: `2px solid ${COLORS.primary.navy}`,
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const BTN_RH_INATIVO: CSSProperties = {
  background: '#FFFFFF',
  color: COLORS.text.secondary,
  border: `1px solid ${COLORS.border.default}`,
  padding: '7px 12px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

const TABLE_WRAP: CSSProperties = {
  overflowX: 'auto',
  width: '100%',
};

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};

const TH_STYLE: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 700,
  color: COLORS.text.tertiary,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  borderBottom: `1px solid ${COLORS.border.default}`,
  whiteSpace: 'nowrap',
};

const TH_SORTABLE: CSSProperties = {
  ...TH_STYLE,
  cursor: 'pointer',
  userSelect: 'none',
};

const TD_STYLE: CSSProperties = {
  padding: '10px 12px',
  color: COLORS.text.primary,
  borderBottom: `1px solid ${COLORS.border.default}`,
  verticalAlign: 'middle',
};

const AVATAR_STYLE: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#FFFFFF',
  fontSize: 12,
  fontWeight: 700,
};

const BADGE_L: CSSProperties = {
  display: 'inline-block',
  background: '#CCFBF1',
  color: '#0F766E',
  fontSize: 9,
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: 4,
  textTransform: 'uppercase',
  marginLeft: 6,
};

const BADGE_RH: CSSProperties = {
  display: 'inline-block',
  background: '#E6F1FB',
  color: '#0C447C',
  fontSize: 9,
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: 4,
  textTransform: 'uppercase',
  marginLeft: 6,
};

const BADGE_RF: CSSProperties = {
  display: 'inline-block',
  background: '#DCFCE7',
  color: '#166534',
  fontSize: 9,
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: 4,
  textTransform: 'uppercase',
  marginLeft: 6,
};

const NIVEL_BADGE_BASE: CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 999,
};

const STATUS_BADGE_ATIVO: CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 999,
  background: COLORS.badge.successBg,
  color: COLORS.badge.successText,
};

const STATUS_BADGE_INATIVO: CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 999,
  background: COLORS.badge.dangerBg,
  color: COLORS.badge.dangerText,
};

const PI_BADGE_BASE: CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 999,
};

const EMPTY_STATE: CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
  color: COLORS.text.tertiary,
  fontSize: 13,
};

const PAGINATION_BAR: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 4px',
  fontSize: 12,
  color: COLORS.text.secondary,
};

const PAGINATION_BTN: CSSProperties = {
  padding: '4px 10px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  background: '#FFFFFF',
  color: COLORS.text.primary,
  cursor: 'pointer',
  fontSize: 12,
  minWidth: 32,
};

const PAGINATION_BTN_DISABLED: CSSProperties = {
  ...PAGINATION_BTN,
  color: COLORS.text.tertiary,
  cursor: 'not-allowed',
  background: '#F9FAFB',
};

// -----------------------------------------------------------------------
// Helpers canonicos bit-exact de UI
// -----------------------------------------------------------------------

/**
 * §2.6 CAMADA_UI + §14.10 — cores canonicas bit-exact do badge de nivel
 * hierarquico. Mesmas cores canonicas do organograma §2.6.
 */
function getNivelBadgeStyle(nivel: NivelHierarquico): CSSProperties {
  if (nivel === 'estrategico') {
    return {
      ...NIVEL_BADGE_BASE,
      background: COLORS.badge.warningBg,
      color: COLORS.badge.warningText,
    };
  }
  if (nivel === 'tatico') {
    return {
      ...NIVEL_BADGE_BASE,
      background: COLORS.badge.infoBg,
      color: COLORS.badge.infoText,
    };
  }
  return {
    ...NIVEL_BADGE_BASE,
    background: COLORS.badge.tealClaroBgAlt,
    color: COLORS.badge.tealClaroText,
  };
}

/**
 * §14.10 — cor canonica bit-exact do badge de status do Perfil Individual.
 */
function getProfileIndividualBadgeStyle(status: ProfileIndividualStatus): CSSProperties {
  if (status === 'enviado') {
    return {
      ...PI_BADGE_BASE,
      background: COLORS.badge.successBg,
      color: COLORS.badge.successText,
    };
  }
  if (status === 'em_andamento') {
    return {
      ...PI_BADGE_BASE,
      background: COLORS.badge.infoBg,
      color: COLORS.badge.infoText,
    };
  }
  if (status === 'inconsistente') {
    return {
      ...PI_BADGE_BASE,
      background: COLORS.badge.warningBg,
      color: COLORS.badge.warningText,
    };
  }
  return {
    ...PI_BADGE_BASE,
    background: '#F3F4F6',
    color: COLORS.text.tertiary,
  };
}

/**
 * §14.10 — converte `Date | null` para valor `<input type="date">` (ISO
 * `YYYY-MM-DD`) e vice-versa. Helpers usados pelos handlers dos 4
 * filtros de data (admissao + cadastro).
 */
function dateToInputValue(d: Date | null): string {
  if (d === null) return '';
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function inputValueToDate(v: string): Date | null {
  if (v === '') return null;
  const parsed = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

// -----------------------------------------------------------------------
// Componente canonico bit-exact
// -----------------------------------------------------------------------

export function TodosColaboradoresClient(props: TodosColaboradoresClientProps): JSX.Element {
  const { companyId, initialResult, initialFilters, initialDepartamentos, initialLideres } = props;

  const [result, setResult] = useState<ListEmployeesResult>(initialResult);
  const [filters, setFilters] = useState<ColaboradoresFilters>(initialFilters);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [buscaDraft, setBuscaDraft] = useState<string>(initialFilters.busca);

  const refetch = useCallback(
    async (nextFilters: ColaboradoresFilters): Promise<void> => {
      setIsLoading(true);
      try {
        const next = await listarColaboradoresAction(companyId, nextFilters);
        setResult(next);
        setFilters(nextFilters);
      } finally {
        setIsLoading(false);
      }
    },
    [companyId],
  );

  const handleBuscaSubmit = useCallback((): void => {
    void refetch({ ...filters, busca: buscaDraft.trim(), page: 1 });
  }, [buscaDraft, filters, refetch]);

  const handleDepartamentoChange = useCallback(
    (novo: Departamento | null): void => {
      void refetch({ ...filters, departamento: novo, page: 1 });
    },
    [filters, refetch],
  );

  const handleLiderChange = useCallback(
    (novoId: number | null): void => {
      void refetch({ ...filters, liderId: novoId, page: 1 });
    },
    [filters, refetch],
  );

  const handleNivelChange = useCallback(
    (novo: NivelHierarquico | null): void => {
      void refetch({ ...filters, nivelHierarquico: novo, page: 1 });
    },
    [filters, refetch],
  );

  const handleStatusChange = useCallback(
    (novo: StatusFilterValue): void => {
      void refetch({ ...filters, status: novo, page: 1 });
    },
    [filters, refetch],
  );

  const handleSenioridadeChange = useCallback(
    (novo: SenioridadeFilterValue | null): void => {
      void refetch({ ...filters, senioridade: novo, page: 1 });
    },
    [filters, refetch],
  );

  const handleJobFamilyChange = useCallback(
    (novo: JobFamily | null): void => {
      void refetch({ ...filters, jobFamily: novo, page: 1 });
    },
    [filters, refetch],
  );

  const handlePapelChange = useCallback(
    (novo: PapelFuncional): void => {
      void refetch({ ...filters, papelFuncional: novo, page: 1 });
    },
    [filters, refetch],
  );

  // §20 — sincronizacao canonica bit-exact entre botao `[RH]` e opcao
  // "RH" do dropdown "Papel funcional".
  const handleBotaoRhClick = useCallback((): void => {
    const rhAtivo = filters.papelFuncional === 'rh';
    const novoPapel: PapelFuncional = rhAtivo ? 'todos' : 'rh';
    void refetch({ ...filters, papelFuncional: novoPapel, page: 1 });
  }, [filters, refetch]);

  const handleDataAdmissaoInicioChange = useCallback(
    (v: string): void => {
      void refetch({
        ...filters,
        dataAdmissaoInicio: inputValueToDate(v),
        page: 1,
      });
    },
    [filters, refetch],
  );

  const handleDataAdmissaoFimChange = useCallback(
    (v: string): void => {
      void refetch({
        ...filters,
        dataAdmissaoFim: inputValueToDate(v),
        page: 1,
      });
    },
    [filters, refetch],
  );

  const handleDataCadastroInicioChange = useCallback(
    (v: string): void => {
      void refetch({
        ...filters,
        dataCadastroInicio: inputValueToDate(v),
        page: 1,
      });
    },
    [filters, refetch],
  );

  const handleDataCadastroFimChange = useCallback(
    (v: string): void => {
      void refetch({
        ...filters,
        dataCadastroFim: inputValueToDate(v),
        page: 1,
      });
    },
    [filters, refetch],
  );

  const handleLimparFiltros = useCallback((): void => {
    void refetch({
      ...filters,
      busca: '',
      departamento: null,
      liderId: null,
      nivelHierarquico: null,
      status: 'ativo',
      senioridade: null,
      jobFamily: null,
      dataAdmissaoInicio: null,
      dataAdmissaoFim: null,
      dataCadastroInicio: null,
      dataCadastroFim: null,
      papelFuncional: 'todos',
      page: 1,
    });
    setBuscaDraft('');
  }, [filters, refetch]);

  const handleSortClick = useCallback(
    (field: ListEmployeesSortField): void => {
      const isSame = filters.sortBy === field;
      const nextOrder: ListEmployeesSortOrder =
        isSame && filters.sortOrder === 'asc' ? 'desc' : 'asc';
      void refetch({
        ...filters,
        sortBy: field,
        sortOrder: nextOrder,
        page: 1,
      });
    },
    [filters, refetch],
  );

  const handlePageChange = useCallback(
    (novaPagina: number): void => {
      void refetch({ ...filters, page: novaPagina });
    },
    [filters, refetch],
  );

  const handlePageSizeChange = useCallback(
    (novoTamanho: ListEmployeesPageSize): void => {
      void refetch({ ...filters, pageSize: novoTamanho, page: 1 });
    },
    [filters, refetch],
  );

  const totalPages = useMemo((): number => {
    if (result.totalCount === 0) return 1;
    return Math.ceil(result.totalCount / filters.pageSize);
  }, [result.totalCount, filters.pageSize]);

  const hasAnyFilter =
    filters.busca !== '' ||
    filters.departamento !== null ||
    filters.liderId !== null ||
    filters.nivelHierarquico !== null ||
    filters.status !== 'ativo' ||
    filters.senioridade !== null ||
    filters.jobFamily !== null ||
    filters.dataAdmissaoInicio !== null ||
    filters.dataAdmissaoFim !== null ||
    filters.dataCadastroInicio !== null ||
    filters.dataCadastroFim !== null ||
    filters.papelFuncional !== 'todos';

  const hasNoRegistrosInicial = result.totalCount === 0 && !hasAnyFilter && filters.busca === '';

  const isEmpty = result.rows.length === 0;

  const rhAtivo = filters.papelFuncional === 'rh';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar canonica bit-exact — 4 botoes de acao + botao RH */}
      <div style={CARD_STYLE}>
        <div style={TOOLBAR_ROW}>
          <input
            style={FILTRO_INPUT}
            type="text"
            placeholder="Buscar por nome, CPF ou cargo..."
            value={buscaDraft}
            maxLength={BUSCA_MAX_LEN}
            onChange={(e): void => setBuscaDraft(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === 'Enter') handleBuscaSubmit();
            }}
            onBlur={handleBuscaSubmit}
            aria-label="Buscar colaborador"
          />
          <button
            type="button"
            onClick={handleBotaoRhClick}
            style={rhAtivo ? BTN_RH_ATIVO : BTN_RH_INATIVO}
            aria-pressed={rhAtivo}
            aria-label="Filtrar por RH"
          >
            RH
          </button>
          <button
            type="button"
            disabled
            style={BTN_OUTLINE_DISABLED}
            title="Disponível após ME-080"
            aria-label="Exportar planilha (disponível após ME-080)"
          >
            📥 Exportar planilha
          </button>
          <button
            type="button"
            disabled
            style={BTN_OUTLINE_DISABLED}
            title="Disponível após ME-080"
            aria-label="Baixar planilha modelo (disponível após ME-080)"
          >
            📄 Baixar modelo
          </button>
          <button
            type="button"
            disabled
            style={BTN_OUTLINE_DISABLED}
            title="Disponível após ME-080"
            aria-label="Importar em massa (disponível após ME-080)"
          >
            📤 Importar em massa
          </button>
          <button
            type="button"
            disabled
            style={BTN_PRIMARY_DISABLED}
            title="Disponível após ME-078"
            aria-label="Cadastrar colaborador (disponível após ME-078)"
          >
            + Cadastrar colaborador
          </button>
        </div>
      </div>

      {/* Card de filtros canonicos bit-exact — 8 filtros §14.10 + §20 */}
      <div style={CARD_STYLE}>
        <div style={FILTROS_TITLE}>Filtros</div>
        <div style={FILTROS_ROW}>
          <select
            style={FILTRO_SELECT}
            value={filters.departamento ?? ''}
            onChange={(e): void => {
              const v = e.target.value;
              if (v === '') return handleDepartamentoChange(null);
              if ((DEPARTAMENTO_VALUES as readonly string[]).includes(v)) {
                return handleDepartamentoChange(v as Departamento);
              }
              return handleDepartamentoChange(null);
            }}
            aria-label="Filtrar por departamento"
          >
            <option value="">Departamento: Todos</option>
            {initialDepartamentos.map((d) => (
              <option key={d} value={d}>
                {DEPARTAMENTO_LABELS[d]}
              </option>
            ))}
          </select>
          <select
            style={FILTRO_SELECT}
            value={filters.liderId === null ? '' : String(filters.liderId)}
            onChange={(e): void => {
              const v = e.target.value;
              if (v === '') return handleLiderChange(null);
              const n = Number.parseInt(v, 10);
              if (Number.isNaN(n) || n <= 0) return handleLiderChange(null);
              return handleLiderChange(n);
            }}
            aria-label="Filtrar por líder direto"
          >
            <option value="">Líder: Todos</option>
            {initialLideres.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            style={FILTRO_SELECT}
            value={filters.nivelHierarquico ?? ''}
            onChange={(e): void => {
              const v = e.target.value;
              if (v === '') return handleNivelChange(null);
              if ((NIVEL_HIERARQUICO_VALUES as readonly string[]).includes(v)) {
                return handleNivelChange(v as NivelHierarquico);
              }
              return handleNivelChange(null);
            }}
            aria-label="Filtrar por nível hierárquico"
          >
            <option value="">Nível: Todos</option>
            {NIVEL_HIERARQUICO_VALUES.map((n) => (
              <option key={n} value={n}>
                {NIVEL_HIERARQUICO_LABELS[n]}
              </option>
            ))}
          </select>
          <select
            style={FILTRO_SELECT}
            value={filters.status}
            onChange={(e): void => {
              const v = e.target.value;
              if ((STATUS_FILTER_VALUES as readonly string[]).includes(v)) {
                handleStatusChange(v as StatusFilterValue);
              }
            }}
            aria-label="Filtrar por status"
          >
            <option value="ativo">Status: Ativo</option>
            <option value="inativo">Status: Inativo</option>
            <option value="todos">Status: Todos</option>
          </select>
          <select
            style={FILTRO_SELECT}
            value={filters.senioridade ?? ''}
            onChange={(e): void => {
              const v = e.target.value;
              if (v === '') return handleSenioridadeChange(null);
              if ((SENIORIDADE_FILTER_VALUES as readonly string[]).includes(v)) {
                return handleSenioridadeChange(v as SenioridadeFilterValue);
              }
              return handleSenioridadeChange(null);
            }}
            aria-label="Filtrar por senioridade"
          >
            <option value="">Senioridade: Todos</option>
            {SENIORIDADE_FILTER_VALUES.map((s) => (
              <option key={s} value={s}>
                {SENIORIDADE_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            style={FILTRO_SELECT}
            value={filters.jobFamily ?? ''}
            onChange={(e): void => {
              const v = e.target.value;
              if (v === '') return handleJobFamilyChange(null);
              if ((JOB_FAMILY_VALUES as readonly string[]).includes(v)) {
                return handleJobFamilyChange(v as JobFamily);
              }
              return handleJobFamilyChange(null);
            }}
            aria-label="Filtrar por família de função"
          >
            <option value="">Família: Todos</option>
            {JOB_FAMILY_VALUES.map((f) => (
              <option key={f} value={f}>
                {JOB_FAMILY_LABELS[f]}
              </option>
            ))}
          </select>
          <select
            style={FILTRO_SELECT}
            value={filters.papelFuncional}
            onChange={(e): void => {
              const v = e.target.value as PapelFuncional;
              handlePapelChange(v);
            }}
            aria-label="Filtrar por papel funcional"
          >
            <option value="todos">Papel funcional: Todos</option>
            <option value="lider">Papel funcional: Líder</option>
            <option value="rh">Papel funcional: RH</option>
            <option value="respfin">Papel funcional: Responsável financeiro</option>
            <option value="sem_papel">Papel funcional: Sem papel</option>
          </select>
          <input
            style={FILTRO_DATE}
            type="date"
            value={dateToInputValue(filters.dataAdmissaoInicio)}
            onChange={(e): void => handleDataAdmissaoInicioChange(e.target.value)}
            aria-label="Data de admissão — início"
            title="Data de admissão — início"
          />
          <input
            style={FILTRO_DATE}
            type="date"
            value={dateToInputValue(filters.dataAdmissaoFim)}
            onChange={(e): void => handleDataAdmissaoFimChange(e.target.value)}
            aria-label="Data de admissão — fim"
            title="Data de admissão — fim"
          />
          <input
            style={FILTRO_DATE}
            type="date"
            value={dateToInputValue(filters.dataCadastroInicio)}
            onChange={(e): void => handleDataCadastroInicioChange(e.target.value)}
            aria-label="Data de cadastro — início"
            title="Data de cadastro — início"
          />
          <input
            style={FILTRO_DATE}
            type="date"
            value={dateToInputValue(filters.dataCadastroFim)}
            onChange={(e): void => handleDataCadastroFimChange(e.target.value)}
            aria-label="Data de cadastro — fim"
            title="Data de cadastro — fim"
          />
          {hasAnyFilter ? (
            <button
              type="button"
              onClick={handleLimparFiltros}
              style={{
                background: 'transparent',
                border: 'none',
                color: COLORS.semantic.danger,
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 600,
                textDecoration: 'underline',
                textDecorationStyle: 'dotted',
                padding: 0,
              }}
              aria-label="Limpar filtros"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      </div>

      {/* Card da tabela canonica bit-exact — 14 colunas §14.10 */}
      <div style={CARD_STYLE}>
        {isEmpty ? (
          <div style={EMPTY_STATE} role="status" aria-live="polite">
            {hasNoRegistrosInicial
              ? 'Nenhum colaborador cadastrado ainda.'
              : 'Nenhum colaborador atende aos filtros aplicados.'}
          </div>
        ) : (
          <>
            <div style={TABLE_WRAP}>
              <table style={TABLE_STYLE}>
                <thead>
                  <tr>
                    <th style={{ ...TH_STYLE, width: 40 }} aria-hidden="true">
                      Foto
                    </th>
                    {renderSortableTh('Nome', 'name', filters, handleSortClick)}
                    {renderSortableTh('CPF', 'cpf', filters, handleSortClick)}
                    {renderSortableTh('Cargo', 'descricaoCBO', filters, handleSortClick)}
                    {renderSortableTh('Senioridade', 'senioridade', filters, handleSortClick)}
                    {renderSortableTh('Família de função', 'jobFamily', filters, handleSortClick)}
                    {renderSortableTh(
                      'Nível hierárquico',
                      'nivelHierarquico',
                      filters,
                      handleSortClick,
                    )}
                    {renderSortableTh('Departamento', 'departamento', filters, handleSortClick)}
                    {renderSortableTh('Líder direto', 'liderName', filters, handleSortClick)}
                    <th style={TH_STYLE}>Dados cadastrais</th>
                    <th style={TH_STYLE}>Perfil individual</th>
                    {renderSortableTh('Data de admissão', 'dataAdmissao', filters, handleSortClick)}
                    <th style={TH_STYLE}>Status</th>
                    {renderSortableTh('Data de cadastro', 'createdAt', filters, handleSortClick)}
                  </tr>
                </thead>
                <tbody>{result.rows.map(renderRow)}</tbody>
              </table>
            </div>
            <div style={PAGINATION_BAR}>
              <div>
                Exibir{' '}
                <select
                  value={filters.pageSize}
                  onChange={(e): void =>
                    handlePageSizeChange(Number(e.target.value) as ListEmployeesPageSize)
                  }
                  style={{
                    padding: '4px 8px',
                    border: `1px solid ${COLORS.border.default}`,
                    borderRadius: 6,
                    fontSize: 12,
                    marginLeft: 4,
                    marginRight: 4,
                  }}
                  aria-label="Registros por página"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>{' '}
                por página · {result.totalCount} registro(s)
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={(): void => handlePageChange(filters.page - 1)}
                  disabled={filters.page <= 1 || isLoading}
                  style={filters.page <= 1 ? PAGINATION_BTN_DISABLED : PAGINATION_BTN}
                  aria-label="Página anterior"
                >
                  ‹
                </button>
                <span style={{ padding: '0 8px' }}>
                  {filters.page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={(): void => handlePageChange(filters.page + 1)}
                  disabled={filters.page >= totalPages || isLoading}
                  style={filters.page >= totalPages ? PAGINATION_BTN_DISABLED : PAGINATION_BTN}
                  aria-label="Próxima página"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Renderizacao canonica bit-exact de linha da tabela + coluna ordenavel
// -----------------------------------------------------------------------

function renderSortableTh(
  label: string,
  field: ListEmployeesSortField,
  filters: ColaboradoresFilters,
  onClick: (f: ListEmployeesSortField) => void,
): JSX.Element {
  const isActive = filters.sortBy === field;
  const arrow = isActive ? (filters.sortOrder === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      key={field}
      style={TH_SORTABLE}
      onClick={(): void => onClick(field)}
      aria-sort={isActive ? (filters.sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {arrow}
    </th>
  );
}

function renderRow(row: EmployeeListRow): JSX.Element {
  const avatarColor = hashNameToColor(row.name);
  const iniciais = getIniciaisFromName(row.name);
  const nivelStyle = getNivelBadgeStyle(row.nivelHierarquico);
  const statusStyle = row.status === 'ativo' ? STATUS_BADGE_ATIVO : STATUS_BADGE_INATIVO;
  const piStyle = getProfileIndividualBadgeStyle(row.profileIndividualStatus);
  return (
    <tr key={row.id}>
      <td style={TD_STYLE}>
        <span style={{ ...AVATAR_STYLE, background: avatarColor }} aria-hidden="true">
          {iniciais}
        </span>
      </td>
      <td style={{ ...TD_STYLE, minWidth: 200 }}>
        <span style={{ fontWeight: 600 }}>{row.name}</span>
        {row.isLider ? (
          <span style={BADGE_L} title="Líder de equipe">
            L
          </span>
        ) : null}
        {row.isRH ? (
          <span style={BADGE_RH} title="RH">
            RH
          </span>
        ) : null}
        {row.isResponsavelFinanceiro ? (
          <span style={BADGE_RF} title="Responsável financeiro">
            RF
          </span>
        ) : null}
      </td>
      <td style={TD_STYLE}>{formatCpfMasked(row.cpf)}</td>
      <td style={TD_STYLE}>{row.cargo}</td>
      <td style={TD_STYLE}>{SENIORIDADE_LABELS[row.senioridade]}</td>
      <td style={TD_STYLE}>{JOB_FAMILY_LABELS[row.jobFamily]}</td>
      <td style={TD_STYLE}>
        <span style={nivelStyle}>{NIVEL_HIERARQUICO_LABELS[row.nivelHierarquico]}</span>
      </td>
      <td style={TD_STYLE}>{DEPARTAMENTO_LABELS[row.departamento]}</td>
      <td style={TD_STYLE}>{row.liderName ?? '—'}</td>
      <td style={TD_STYLE}>
        <span style={{ color: COLORS.text.tertiary, fontSize: 11 }} title="Disponível após ME-078">
          📇
        </span>
      </td>
      <td style={TD_STYLE}>
        <span style={piStyle}>{PROFILE_INDIVIDUAL_STATUS_LABELS[row.profileIndividualStatus]}</span>
      </td>
      <td style={TD_STYLE}>{formatDateBR(row.dataAdmissao)}</td>
      <td style={TD_STYLE}>
        <span style={statusStyle}>{STATUS_LABELS[row.status]}</span>
      </td>
      <td style={TD_STYLE}>{formatDateBR(row.createdAt)}</td>
    </tr>
  );
}
