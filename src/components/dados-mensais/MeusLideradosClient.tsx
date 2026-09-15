'use client';

// ROIP APP 9BOX — client canonico da rota `/dados-mensais/meus-liderados`
// (DOC 05 §14.14, ME-fila1-01). Componente dedicado — nao e variant do
// `DadosMensaisClient` (§14.13) porque o schema de colunas e dinamico
// por familia de funcao do liderado (Meta/Demanda/Realizado × 4
// variaveis) com tratamento especial Familia 6 CC3 (Meta e Demanda
// fixos em 5 e read-only; Realizado como dropdown 1-5).
//
// Origem canonica:
// - DOC 05 §14.14 (header + tabela dinamica + comportamento por status
//   do mes + Familia 6 CC3 + botao `[Solicitar desbloqueio]` D053).
// - DOC 05 §14.16 (modal integral — reuso direto do
//   `ModalSolicitarDesbloqueio` compartilhado).
// - DOC 03 §3.11 + §4.7 (motor de dados mensais + editabilidade por
//   status do mes).
// - Mockup `o1b_v1.html` (referencia visual canonica).
//
// Contrato canonico:
//   - `liderId` + `liderTipo` sao derivados no server (page.tsx)
//     canonicamente da sessao (`session.userId` + role → tipo). Aqui
//     apenas sao consumidos para render do titulo/subtitulo — actions
//     de load/save NAO os passam bit-a-bit (as actions os derivam
//     internamente da sessao; defense-in-depth §2.4).
//   - `isRhPuro`: quando `true`, renderiza estado vazio canonico "Voce
//     nao tem liderados diretos" sem invocar procs. Preserva a matriz
//     §10.4 `rh: allow` para a rota sem submeter RH puro ao FORBIDDEN
//     do proc `getMonthlyInputForm(aba='lider')`.
//
// **RV-13.** Imports consumidos:
//   - Types e helpers de sessao/servidor via props.
//   - `ModalSolicitarDesbloqueio` compartilhado.
//   - Actions injetadas via prop.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import type {
  MonthlyInputFormLeaderRow,
  MonthlyInputFormLeaderVariable,
  MonthlyInputFormResult,
  SaveMonthlyDataResult,
} from '../../server/routers/monthlyData';

import { triggerXlsxDownload } from '../import-mass/downloadXlsxBase64';
import { ImportarPlanilhaModal } from '../import-mass/ImportarPlanilhaModal';
import { ModalSolicitarDesbloqueio } from './ModalSolicitarDesbloqueio';
import type {
  DadosMensaisActionResult,
  DadosMensaisLeaderOption,
  DadosMensaisMesFechado,
} from './internals';
import { formatMesLabel, nextMes, prevMes } from './internals';

// -----------------------------------------------------------------------
// Tipos publicos (RV-13 — consumidos por page.tsx + testes)
// -----------------------------------------------------------------------

/**
 * Contrato canonico das actions injetadas via prop. Subset canonico
 * §14.14 — 6 actions (vs 8 do padrao §14.13 RH). Retornos usam o
 * `DadosMensaisActionResult` compartilhado do `internals.ts` para
 * reaproveitar a discriminated union canonica ok/erro.
 */
export interface MeusLideradosClientActions {
  readonly loadMonthlyForm: (input: {
    readonly companyId: number;
    readonly mes: string;
  }) => Promise<DadosMensaisActionResult<MonthlyInputFormResult>>;
  readonly saveMonthlyLeaderData: (input: {
    readonly companyId: number;
    readonly mes: string;
    readonly liderados: ReadonlyArray<{
      readonly employeeId: number;
      readonly variaveis: ReadonlyArray<{
        readonly variableIndex: number;
        readonly demanda: string;
        readonly executado: string;
      }>;
    }>;
  }) => Promise<DadosMensaisActionResult<SaveMonthlyDataResult>>;
  readonly getClosureStatus: (input: {
    readonly companyId: number;
    readonly mes: string;
  }) => Promise<DadosMensaisActionResult<{ readonly status: StatusMes }>>;
  readonly createUnlockRequest: (input: {
    readonly companyId: number;
    readonly mes: string;
    readonly justificativa: string;
  }) => Promise<DadosMensaisActionResult<{ readonly id: number }>>;
  readonly hasPendingRequest: (input: {
    readonly companyId: number;
    readonly mes: string;
  }) => Promise<
    DadosMensaisActionResult<{
      readonly hasPending: boolean;
      readonly requestedAt: string | null;
    }>
  >;
  readonly listMesesFechados: (input: {
    readonly companyId: number;
  }) => Promise<DadosMensaisActionResult<DadosMensaisMesFechado[]>>;
  /**
   * ME-fila5 D3 (Item 5.6) — actions canonicas opcionais para os botoes
   * `[📄 Baixar planilha modelo]` + `[📤 Importar em massa]` da tela
   * Meus Liderados. Ausentes → botoes escondidos. `liderId` + `liderTipo`
   * derivam da sessao no page.tsx e ficam wire-in no fechamento das
   * actions (nao aparecem no contrato aqui — o modal nao os conhece).
   * Padrao bit-a-bit ao `downloadRHTemplateMonthly` do
   * `DadosMensaisClientActions`.
   */
  readonly downloadLeaderTemplateMonthly?: (input: {
    readonly companyId: number;
    readonly mes: string;
  }) => Promise<{
    readonly filename: string;
    readonly xlsxBase64: string;
    readonly bytes: number;
  }>;
  readonly uploadLeaderDataMonthly?: (input: {
    readonly companyId: number;
    readonly mes: string;
    readonly xlsxBase64: string;
  }) => Promise<{
    readonly ok: boolean;
    readonly linhasProcessadas: number;
    readonly linhasSucesso: number;
    readonly linhasErro: number;
    readonly erros: readonly {
      readonly linha: number;
      readonly coluna: string;
      readonly mensagem: string;
    }[];
  }>;
}

/** Props canonicas do componente. */
export interface MeusLideradosClientProps {
  readonly companyId: number;
  readonly companyName: string;
  readonly initialMes: string;
  readonly initialStatus: string;
  readonly liderId: number;
  readonly liderTipo: 'employee' | 'clevel';
  readonly isRhPuro: boolean;
  readonly actions: MeusLideradosClientActions;
}

/** Status canonico do mes (§4.1). */
type StatusMes = 'aberto' | 'fechado' | 'desbloqueado';

/** Chave canonica de edicao em memoria: (employeeId, variableIndex). */
type EditKey = string;

/** Valor editado — apenas o par (demanda, executado). */
interface EditValue {
  readonly demanda: string;
  readonly executado: string;
}

// -----------------------------------------------------------------------
// Constantes canonicas de UI (bit-a-bit paridade com DadosMensaisClient)
// -----------------------------------------------------------------------

const NAVY = COLORS.primary.navy;

const CARD_STYLE = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  padding: 20,
  marginBottom: 16,
} as const;

const TABLE_WRAP_STYLE = {
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  overflow: 'auto' as const,
} as const;

const TABLE_STYLE = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  fontSize: 12,
  minWidth: 1400,
} as const;

const TH_STYLE = {
  textAlign: 'left' as const,
  padding: '10px 12px',
  fontSize: 10,
  fontWeight: 600,
  color: COLORS.text.secondary,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.06,
  borderBottom: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.elevated,
  whiteSpace: 'nowrap' as const,
} as const;

const TD_STYLE = {
  padding: '10px 12px',
  borderBottom: `1px solid ${COLORS.border.divider}`,
  color: COLORS.text.primary,
  verticalAlign: 'middle' as const,
} as const;

const TD_READONLY_STYLE = {
  ...TD_STYLE,
  background: '#F9FAFB',
  color: COLORS.text.secondary,
} as const;

const TD_BLOCKED_STYLE = {
  ...TD_STYLE,
  background: '#F3F4F6',
  color: COLORS.text.quaternary,
  textAlign: 'center' as const,
} as const;

const INPUT_STYLE = {
  width: 80,
  padding: '5px 8px',
  border: `1px solid #D1D5DB`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: 'inherit' as const,
} as const;

const SELECT_STYLE = {
  width: 68,
  padding: '5px 6px',
  border: `1px solid #D1D5DB`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: 'inherit' as const,
  background: 'white',
} as const;

const STATUS_LABELS: Record<StatusMes, string> = {
  aberto: 'Aberto',
  fechado: 'Fechado',
  desbloqueado: 'Desbloqueado',
};

const STATUS_COLORS: Record<StatusMes, { bg: string; text: string }> = {
  aberto: { bg: '#DCFCE7', text: '#166534' },
  fechado: { bg: '#F3F4F6', text: '#374151' },
  desbloqueado: { bg: '#FEF3C7', text: '#92400E' },
};

// Textos canonicos literais bit-a-bit.
const EMPTY_STATE_TEXT_RH_PURO =
  'Você não tem liderados diretos. Esta tela é destinada a líderes com equipe' + ' direta ativa.';
const EMPTY_STATE_TEXT_SEM_LIDERADOS = 'Nenhum liderado direto ativo neste mês.' as const;
const LABEL_FAMILIA_6 =
  'Família 6 — Realizado: nota de desempenho de 1 (insuficiente) a 5 (excelente).' as const;
const LABEL_BANNER_METAS_TODOS =
  'Todos os seus liderados estão com metas pendentes. Peça ao RH para configurar' +
  ' as metas antes de lançar demanda e executado.';
const LABEL_BANNER_LINHAS_PENDENTES =
  'Linhas com — indicam colaboradores sem metas configuradas.' as const;
const LABEL_TOAST_SAVE = 'Alterações salvas com sucesso.' as const;
const LABEL_TOAST_UNLOCK_REQUEST = 'Solicitação enviada. Bruno será notificado.' as const;
const LABEL_MES_FECHADO_BANNER =
  'Mês fechado — dados não editáveis. Para editar, solicite desbloqueio ao Super Admin.' as const;

const FAMILIA_6_LIKERT_VALORES: readonly string[] = ['1', '2', '3', '4', '5'];

// -----------------------------------------------------------------------
// Helpers puros
// -----------------------------------------------------------------------

function buildEditKey(employeeId: number, variableIndex: number): EditKey {
  return `${employeeId}:${variableIndex}`;
}

function isPesoZero(v: MonthlyInputFormLeaderVariable): boolean {
  return Number(v.weight) === 0;
}

function isLineaMetasPendentes(row: MonthlyInputFormLeaderRow): boolean {
  // Row com todas as variaveis peso=0 → familia sem variaveis; sem
  // configuracao real de metas. Por convencao canonica (mockup o1b:
  // "metasPendentes"), tratamos como metas pendentes de RH.
  if (row.variaveis.length === 0) {
    return true;
  }
  return row.variaveis.every((v) => isPesoZero(v));
}

function todosMetasPendentes(rows: readonly MonthlyInputFormLeaderRow[]): boolean {
  return rows.length > 0 && rows.every((r) => isLineaMetasPendentes(r));
}

function algumaLinhaMetasPendentes(rows: readonly MonthlyInputFormLeaderRow[]): boolean {
  return rows.some((r) => isLineaMetasPendentes(r));
}

function algumaFamilia6(rows: readonly MonthlyInputFormLeaderRow[]): boolean {
  return rows.some((r) => r.familia6 === true);
}

// -----------------------------------------------------------------------
// Sub-componente: badge de status do mes
// -----------------------------------------------------------------------

function StatusBadgeMes(props: { readonly status: StatusMes }): JSX.Element {
  const c = STATUS_COLORS[props.status];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 12,
        background: c.bg,
        color: c.text,
      }}
    >
      {STATUS_LABELS[props.status]}
    </span>
  );
}

// -----------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------

export function MeusLideradosClient(props: MeusLideradosClientProps): JSX.Element {
  const { companyId, initialMes, initialStatus, liderId, liderTipo, isRhPuro, actions } = props;
  void liderId;
  void liderTipo;

  const [mes, setMes] = useState<string>(initialMes);
  const [status, setStatus] = useState<StatusMes>((initialStatus as StatusMes) ?? 'aberto');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly MonthlyInputFormLeaderRow[]>([]);
  const [edits, setEdits] = useState<Map<EditKey, EditValue>>(new Map());
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);
  const [hasPending, setHasPending] = useState<boolean>(false);
  const [pendingRequestedAt, setPendingRequestedAt] = useState<string | null>(null);
  // ME-fila5 D3 (Item 5.6) — modal Importar em massa Lider.
  const [importarLeaderOpen, setImportarLeaderOpen] = useState(false);
  const [importActionError, setImportActionError] = useState<string | null>(null);

  const isEditable = status === 'aberto' || status === 'desbloqueado';

  // -------------------------------------------------------------------
  // Fetch canonico dos dados ao trocar mes
  // -------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (isRhPuro) {
      return;
    }
    setLoading(true);
    setError(null);
    setEdits(new Map());

    try {
      const csResult = await actions.getClosureStatus({ companyId, mes });
      if (csResult.ok) {
        setStatus(csResult.data.status);
      }

      const result = await actions.loadMonthlyForm({ companyId, mes });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.data.abaAtiva !== 'lider') {
        // Defensivo: proc deve sempre retornar aba='lider' para esta
        // tela (page passa aba='lider' pela action). Se retornar
        // 'rh', trata-se de inconsistencia — reporta erro generico.
        setError('Resposta inesperada do servidor. Recarregue a página.');
        return;
      }
      setRows(result.data.liderados);

      const pendingResult = await actions.hasPendingRequest({ companyId, mes });
      if (pendingResult.ok) {
        setHasPending(pendingResult.data.hasPending);
        setPendingRequestedAt(pendingResult.data.requestedAt);
      }
    } catch {
      setError('Não foi possível carregar os dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [actions, companyId, mes, isRhPuro]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------

  const handleMesAnterior = useCallback(() => {
    setMes((m) => prevMes(m));
  }, []);
  const handleMesSeguinte = useCallback(() => {
    setMes((m) => nextMes(m));
  }, []);

  const handleEdit = useCallback(
    (employeeId: number, variableIndex: number, field: 'demanda' | 'executado', value: string) => {
      setEdits((prev) => {
        const next = new Map(prev);
        const key = buildEditKey(employeeId, variableIndex);
        const current = next.get(key);
        if (current !== undefined) {
          next.set(key, {
            demanda: field === 'demanda' ? value : current.demanda,
            executado: field === 'executado' ? value : current.executado,
          });
          return next;
        }
        // Carrega valores atuais persistidos para nao perder a outra
        // parte do par se o usuario so editou uma das duas colunas.
        const row = rows.find((r) => r.employeeId === employeeId);
        const variable = row?.variaveis.find((v) => v.variableIndex === variableIndex);
        next.set(key, {
          demanda: field === 'demanda' ? value : (variable?.demanda ?? ''),
          executado: field === 'executado' ? value : (variable?.executado ?? ''),
        });
        return next;
      });
    },
    [rows],
  );

  const handleDescartar = useCallback(() => {
    setEdits(new Map());
  }, []);

  const handleSalvar = useCallback(async () => {
    if (edits.size === 0) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Agrupa edits por employeeId → lista de variaveis com
      // (demanda, executado). Para variaveis nao-editadas ainda
      // persistentes, pegamos o valor atual das rows (incompleto
      // fica como string vazia — proc rejeita min(1)).
      const perEmp = new Map<number, Map<number, EditValue>>();
      for (const [key, val] of edits.entries()) {
        const [empIdStr, varIdxStr] = key.split(':');
        const empId = Number(empIdStr);
        const varIdx = Number(varIdxStr);
        let inner = perEmp.get(empId);
        if (inner === undefined) {
          inner = new Map();
          perEmp.set(empId, inner);
        }
        inner.set(varIdx, val);
      }
      const liderados = Array.from(perEmp.entries()).map(([employeeId, byVar]) => ({
        employeeId,
        variaveis: Array.from(byVar.entries()).map(([variableIndex, v]) => ({
          variableIndex,
          demanda: v.demanda,
          executado: v.executado,
        })),
      }));
      const result = await actions.saveMonthlyLeaderData({
        companyId,
        mes,
        liderados,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEdits(new Map());
      setToast(LABEL_TOAST_SAVE);
      // Re-fetch para refletir persistencia canonicamente.
      await fetchData();
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }, [actions, companyId, mes, edits, fetchData]);

  const handleAbrirModal = useCallback(() => {
    setShowUnlockModal(true);
  }, []);
  const handleFecharModal = useCallback(() => {
    setShowUnlockModal(false);
  }, []);
  const handleUnlockSuccess = useCallback((message: string) => {
    setToast(message.length > 0 ? message : LABEL_TOAST_UNLOCK_REQUEST);
    setShowUnlockModal(false);
    setHasPending(true);
    setPendingRequestedAt(new Date().toISOString());
  }, []);

  // Toast auto-dismiss.
  useEffect(() => {
    if (toast === null) {
      return;
    }
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // -------------------------------------------------------------------
  // Derivados de render
  // -------------------------------------------------------------------

  const preenchidos = useMemo(() => {
    let count = 0;
    for (const row of rows) {
      if (isLineaMetasPendentes(row)) {
        continue;
      }
      const completo = row.variaveis.every((v) => {
        if (isPesoZero(v)) {
          return true;
        }
        const key = buildEditKey(row.employeeId, v.variableIndex);
        const edit = edits.get(key);
        const dem = edit?.demanda ?? v.demanda ?? '';
        const exec = edit?.executado ?? v.executado ?? '';
        return dem !== '' && exec !== '';
      });
      if (completo) {
        count += 1;
      }
    }
    return count;
  }, [rows, edits]);

  const showBannerMetasTodos = todosMetasPendentes(rows);
  const showBannerLinhasPendentes = !showBannerMetasTodos && algumaLinhaMetasPendentes(rows);
  const showFamilia6Label = algumaFamilia6(rows);

  // -------------------------------------------------------------------
  // Wrapper para o modal — precisa de `listCompanyLeaders` no contrato
  // do modal compartilhado. Como esta tela nao expoe o dropdown de
  // liderId (o titular ja e o proprio usuario), fornecemos uma
  // implementacao no-op que devolve lista vazia; o modal detecta pela
  // aba='lider' fixa e nao renderiza o dropdown (comportamento canonico
  // §14.16: dropdown so aparece quando aba='lider' E chamador e RH/
  // super_admin/rh_lider escolhendo por qual lider criar solicitacao).
  // -------------------------------------------------------------------

  const listCompanyLeadersNoop = useCallback(
    async (_input: {
      readonly companyId: number;
    }): Promise<DadosMensaisActionResult<DadosMensaisLeaderOption[]>> => {
      void _input;
      return { ok: true, data: [] };
    },
    [],
  );

  const createUnlockRequestForModal = useCallback(
    async (input: {
      readonly companyId: number;
      readonly mes: string;
      readonly aba: 'rh' | 'lider' | 'faturamento';
      readonly liderId?: number;
      readonly liderTipo?: 'employee' | 'clevel';
      readonly justificativa: string;
    }): Promise<DadosMensaisActionResult<{ readonly id: number }>> => {
      // Modal permite selecionar aba/lider genericamente; nesta tela
      // fixamos aba='lider' e o liderId/liderTipo sao derivados pela
      // action canonica a partir da sessao (defense-in-depth §2.4).
      // Ignora bit-a-bit os campos passados pelo modal.
      void input.aba;
      void input.liderId;
      void input.liderTipo;
      return actions.createUnlockRequest({
        companyId: input.companyId,
        mes: input.mes,
        justificativa: input.justificativa,
      });
    },
    [actions],
  );

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Titulo */}
      <div style={{ marginBottom: 16 }}>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: COLORS.text.primary,
            margin: '0 0 4px 0',
          }}
        >
          Dados mensais — Meus liderados
        </h1>
        <p
          style={{
            fontSize: 12,
            color: COLORS.text.tertiary,
            margin: 0,
          }}
        >
          Lançamento mensal de demanda e executado dos liderados diretos.
        </p>
      </div>

      {/* RH puro: estado vazio canonico — nao invoca procs, nao mostra
          navegacao de mes. */}
      {isRhPuro && (
        <div
          style={{
            ...CARD_STYLE,
            textAlign: 'center',
            padding: 48,
            color: COLORS.text.tertiary,
            fontSize: 13,
          }}
        >
          {EMPTY_STATE_TEXT_RH_PURO}
        </div>
      )}

      {/* Navegacao de mes (apenas quando NAO for RH puro) */}
      {!isRhPuro && (
        <div
          style={{
            ...CARD_STYLE,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleMesAnterior}
              aria-label="Mês anterior"
              style={{
                width: 30,
                height: 30,
                background: 'white',
                border: `1px solid ${COLORS.border.default}`,
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              ‹
            </button>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '4px 12px',
                border: `1px solid ${COLORS.border.default}`,
                borderRadius: 8,
                minWidth: 160,
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: COLORS.text.tertiary,
                  textTransform: 'uppercase',
                  letterSpacing: 0.06,
                }}
              >
                Mês
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text.primary }}>
                {formatMesLabel(mes)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleMesSeguinte}
              aria-label="Próximo mês"
              style={{
                width: 30,
                height: 30,
                background: 'white',
                border: `1px solid ${COLORS.border.default}`,
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              ›
            </button>
          </div>
          <StatusBadgeMes status={status} />
        </div>
      )}

      {/* Banner canonico: mes fechado */}
      {!isRhPuro && status === 'fechado' && (
        <div
          style={{
            ...CARD_STYLE,
            background: '#F3F4F6',
            borderColor: COLORS.border.default,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: COLORS.text.secondary }}>
            {LABEL_MES_FECHADO_BANNER}
          </div>
          {hasPending ? (
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 8,
                background: COLORS.badge.warningBg,
                color: COLORS.badge.warningText,
              }}
              title={
                pendingRequestedAt !== null
                  ? `Solicitação criada em ${pendingRequestedAt}. Aguardando decisão do Super` +
                    ' Admin.'
                  : 'Solicitação em análise.'
              }
            >
              ⏳ Solicitação em análise
            </div>
          ) : (
            <button
              type="button"
              onClick={handleAbrirModal}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: `1px solid ${COLORS.border.default}`,
                background: 'white',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
                color: COLORS.text.primary,
              }}
            >
              Solicitar desbloqueio
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {!isRhPuro && loading && (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            color: COLORS.text.tertiary,
            fontSize: 13,
          }}
        >
          Carregando dados mensais...
        </div>
      )}

      {/* Erro */}
      {!isRhPuro && !loading && error !== null && (
        <div
          style={{
            ...CARD_STYLE,
            textAlign: 'center',
            color: COLORS.badge.dangerText,
          }}
        >
          <div style={{ marginBottom: 12 }}>{error}</div>
          <button
            type="button"
            onClick={() => void fetchData()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${COLORS.border.default}`,
              background: 'white',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Recarregar
          </button>
        </div>
      )}

      {/* Card principal: banners + tabela */}
      {!isRhPuro && !loading && error === null && (
        <div style={CARD_STYLE}>
          {/* ME-fila5 D3 (Item 5.6) — Botoes de import/download em massa.
              Visiveis quando actions estao injetadas + mes editavel. */}
          {isEditable &&
            actions.downloadLeaderTemplateMonthly !== undefined &&
            actions.uploadLeaderDataMonthly !== undefined && (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginBottom: 16,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={async () => {
                    setImportActionError(null);
                    try {
                      const res = await actions.downloadLeaderTemplateMonthly!({
                        companyId,
                        mes,
                      });
                      triggerXlsxDownload(res.xlsxBase64, res.filename);
                    } catch (err) {
                      const msg =
                        err instanceof Error ? err.message : 'Falha ao gerar planilha modelo.';
                      setImportActionError(msg);
                    }
                  }}
                  style={{
                    padding: '9px 16px',
                    fontSize: 13,
                    fontWeight: 500,
                    border: `1px solid ${COLORS.primary.navy}`,
                    borderRadius: 6,
                    background: '#FFFFFF',
                    color: COLORS.primary.navy,
                    cursor: 'pointer',
                  }}
                  title="Baixar XLSX pre-preenchido com seus liderados"
                >
                  📄 Baixar planilha modelo
                </button>
                <button
                  type="button"
                  onClick={() => setImportarLeaderOpen(true)}
                  style={{
                    padding: '9px 16px',
                    fontSize: 13,
                    fontWeight: 500,
                    border: `1px solid ${COLORS.primary.navy}`,
                    borderRadius: 6,
                    background: '#FFFFFF',
                    color: COLORS.primary.navy,
                    cursor: 'pointer',
                  }}
                  title="Importar dados dos liderados em massa via XLSX"
                >
                  📤 Importar em massa
                </button>
              </div>
            )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: COLORS.text.primary,
                }}
              >
                Liderados diretos
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: COLORS.text.tertiary,
                  marginLeft: 8,
                }}
              >
                {preenchidos} / {rows.length} preenchidos
              </span>
            </div>
          </div>

          {showBannerMetasTodos && (
            <div
              style={{
                background: COLORS.badge.warningBg,
                border: `1px solid #FDE68A`,
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 12,
                fontSize: 12,
                color: '#78350F',
              }}
            >
              {LABEL_BANNER_METAS_TODOS}
            </div>
          )}

          {showBannerLinhasPendentes && (
            <div
              style={{
                background: '#F3F4F6',
                border: `1px solid ${COLORS.border.default}`,
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 12,
                fontSize: 12,
                color: COLORS.text.secondary,
              }}
            >
              {LABEL_BANNER_LINHAS_PENDENTES}
            </div>
          )}

          {rows.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: COLORS.text.tertiary,
                fontSize: 13,
                fontStyle: 'italic',
              }}
            >
              {EMPTY_STATE_TEXT_SEM_LIDERADOS}
            </div>
          ) : (
            <div style={TABLE_WRAP_STYLE}>
              <table style={TABLE_STYLE}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Nome</th>
                    <th style={TH_STYLE}>Cargo</th>
                    {[1, 2, 3, 4].map((i) => (
                      <Fragment key={`th-${i}`}>
                        <th
                          style={{
                            ...TH_STYLE,
                            borderLeft: i > 1 ? `2px solid ${COLORS.border.default}` : undefined,
                          }}
                        >
                          Meta {i}
                        </th>
                        <th style={TH_STYLE}>Demanda {i}</th>
                        <th style={TH_STYLE}>Realizado {i}</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>{rows.map((row) => renderRow(row, edits, handleEdit, isEditable))}</tbody>
              </table>
            </div>
          )}

          {showFamilia6Label && (
            <div
              style={{
                fontSize: 12,
                color: COLORS.text.tertiary,
                marginTop: 10,
                fontStyle: 'italic',
              }}
            >
              {LABEL_FAMILIA_6}
            </div>
          )}
        </div>
      )}

      {/* Save bar (apenas se ha edits e mes editavel) */}
      {!isRhPuro && !loading && error === null && edits.size > 0 && isEditable && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            background: 'white',
            borderTop: `1px solid ${COLORS.border.default}`,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            borderRadius: 10,
            boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: COLORS.text.secondary,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: COLORS.semantic.warning,
              }}
            />
            Alterações não salvas
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleDescartar}
              disabled={saving}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: `1px solid ${COLORS.border.default}`,
                background: 'white',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => void handleSalvar()}
              disabled={saving}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: NAVY,
                color: 'white',
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast !== null && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '12px 20px',
            background: COLORS.badge.successBg,
            border: `1px solid ${COLORS.semantic.success}`,
            borderRadius: 10,
            fontSize: 13,
            color: COLORS.badge.successText,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            zIndex: 1000,
            maxWidth: 360,
          }}
        >
          {toast}
        </div>
      )}

      {/* Modal canonico Solicitar desbloqueio */}
      {showUnlockModal && (
        <ModalSolicitarDesbloqueio
          companyId={companyId}
          initialMes={mes}
          initialAba="lider"
          onClose={handleFecharModal}
          onSuccess={handleUnlockSuccess}
          listMesesFechados={actions.listMesesFechados}
          listCompanyLeaders={listCompanyLeadersNoop}
          createUnlockRequest={createUnlockRequestForModal}
        />
      )}

      {/* ME-fila5 D3 (Item 5.6) — toast erro de acao import/download */}
      {importActionError !== null && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            padding: '14px 20px',
            borderRadius: 8,
            fontSize: 14,
            color: '#FFFFFF',
            background: '#DC2626',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            zIndex: 500,
            maxWidth: 360,
          }}
        >
          {importActionError}
          <button
            type="button"
            onClick={() => setImportActionError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              marginLeft: 12,
              cursor: 'pointer',
              fontSize: 14,
            }}
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      )}

      {/* ME-fila5 D3 (Item 5.6) — modal Importar dados Lider em massa */}
      {actions.downloadLeaderTemplateMonthly !== undefined &&
        actions.uploadLeaderDataMonthly !== undefined && (
          <ImportarPlanilhaModal
            variant="monthly-leader"
            open={importarLeaderOpen}
            onClose={() => setImportarLeaderOpen(false)}
            onDownloadTemplate={async () => {
              const res = await actions.downloadLeaderTemplateMonthly!({
                companyId,
                mes,
              });
              return { filename: res.filename, xlsxBase64: res.xlsxBase64 };
            }}
            onUpload={async (file) => {
              const arrayBuffer = await file.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let i = 0; i < bytes.length; i += 1) {
                binary += String.fromCharCode(bytes[i]!);
              }
              const base64 = btoa(binary);
              return actions.uploadLeaderDataMonthly!({
                companyId,
                mes,
                xlsxBase64: base64,
              });
            }}
            onSuccess={() => {
              void fetchData();
            }}
          />
        )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Helper de render: uma linha (extraida por RV-14 legibilidade)
// -----------------------------------------------------------------------

function renderRow(
  row: MonthlyInputFormLeaderRow,
  edits: Map<EditKey, EditValue>,
  onEdit: (
    employeeId: number,
    variableIndex: number,
    field: 'demanda' | 'executado',
    value: string,
  ) => void,
  isEditable: boolean,
): JSX.Element {
  const metasPendentes = isLineaMetasPendentes(row);
  // Ordena canonicamente por variableIndex (proc ja retorna ordenado
  // por design, mas defense-in-depth); garante 4 slots.
  const variaveisPorSlot: Array<MonthlyInputFormLeaderVariable | null> = [null, null, null, null];
  for (const v of row.variaveis) {
    const slot = v.variableIndex - 1;
    if (slot >= 0 && slot < 4) {
      variaveisPorSlot[slot] = v;
    }
  }

  return (
    <tr key={`row-${row.employeeId}`}>
      <td
        style={{
          ...TD_STYLE,
          fontWeight: 600,
          position: 'sticky',
          left: 0,
          background: 'white',
        }}
      >
        {row.name}
        {metasPendentes && (
          <span
            style={{ marginLeft: 6, fontSize: 11 }}
            title={
              'Colaborador sem metas configuradas — peça ao RH para configurar antes' +
              ' de lançar dados.'
            }
          >
            ⚠️
          </span>
        )}
      </td>
      <td
        style={{
          ...TD_STYLE,
          fontSize: 11,
          color: COLORS.text.tertiary,
          position: 'sticky',
          left: 140,
          background: 'white',
        }}
      >
        {row.jobFamily}
      </td>
      {variaveisPorSlot.map((v, idx) => renderVarCells(row, v, idx, edits, onEdit, isEditable))}
    </tr>
  );
}

function renderVarCells(
  row: MonthlyInputFormLeaderRow,
  v: MonthlyInputFormLeaderVariable | null,
  idx: number,
  edits: Map<EditKey, EditValue>,
  onEdit: (
    employeeId: number,
    variableIndex: number,
    field: 'demanda' | 'executado',
    value: string,
  ) => void,
  isEditable: boolean,
): JSX.Element {
  const borderLeftStyle =
    idx > 0 ? { borderLeft: `2px solid ${COLORS.border.default}` } : undefined;

  // Sem variavel neste slot → linha bloqueada (metasPendentes ou
  // familia com menos de 4 variaveis por design canonico).
  if (v === null) {
    return (
      <Fragment key={`slot-${idx}`}>
        <td style={{ ...TD_BLOCKED_STYLE, ...borderLeftStyle }}>—</td>
        <td style={TD_BLOCKED_STYLE}>—</td>
        <td style={TD_BLOCKED_STYLE}>—</td>
      </Fragment>
    );
  }

  const pesoZero = isPesoZero(v);
  if (pesoZero) {
    // Variavel com peso=0 canonicamente nao entra em contabilizacao;
    // celulas bloqueadas com "—".
    return (
      <Fragment key={`slot-${idx}`}>
        <td style={{ ...TD_BLOCKED_STYLE, ...borderLeftStyle }}>—</td>
        <td style={TD_BLOCKED_STYLE}>—</td>
        <td style={TD_BLOCKED_STYLE}>—</td>
      </Fragment>
    );
  }

  const editKey = buildEditKey(row.employeeId, v.variableIndex);
  const edit = edits.get(editKey);
  const demanda = edit?.demanda ?? v.demanda ?? '';
  const executado = edit?.executado ?? v.executado ?? '';

  // Familia 6 CC3: Meta read-only=5 e Demanda read-only=5 na tela;
  // Realizado como dropdown 1-5. O proc `saveMonthlyLeaderData` recebe
  // demanda=5 fixa (canonizada aqui).
  if (row.familia6 === true) {
    // Normalizacao canonica ME-fila2-seed retomada L113 empirica in-flight:
    // `v.executado` vem canonicamente do backend como `decimal(15,2)` — ex.:
    // '3.00', '5.00'. `<select value="3.00">` nao bate com
    // `<option value="3">` do enum canonico ['1','2','3','4','5'], caindo
    // para `value=""` (mostra "—") mesmo com dado NOT NULL no banco. Fix:
    // trunca para inteiro (Familia 6 CC3 canonicamente aceita apenas notas
    // Likert 1..5 inteiras — regra §14.14) preservando o formato do enum.
    // Edits em memoria (do proprio dropdown) ja sao inteiros — normalizacao
    // afeta apenas o valor carregado do backend.
    const executadoFamilia6 =
      executado !== '' && !Number.isNaN(Number(executado))
        ? String(Math.trunc(Number(executado)))
        : '';
    return (
      <Fragment key={`slot-${idx}`}>
        <td style={{ ...TD_READONLY_STYLE, ...borderLeftStyle }}>5</td>
        <td style={TD_READONLY_STYLE}>5</td>
        <td style={TD_STYLE}>
          <select
            value={executadoFamilia6}
            onChange={(e) => {
              onEdit(row.employeeId, v.variableIndex, 'demanda', '5');
              onEdit(row.employeeId, v.variableIndex, 'executado', e.target.value);
            }}
            disabled={!isEditable}
            style={SELECT_STYLE}
          >
            <option value="">—</option>
            {FAMILIA_6_LIKERT_VALORES.map((val) => (
              <option key={val} value={val}>
                {val}
              </option>
            ))}
          </select>
        </td>
      </Fragment>
    );
  }

  // Familias 1-5: Meta canonicamente vem em `v.meta` (S259 consumida na
  // ME-fila2-seed — proc `getMonthlyInputForm(aba='lider')` agora
  // popula `meta` via JOIN com `employeeGoals.goal`). Quando `meta` eh
  // `null`, o RH ainda nao configurou meta para essa `(employeeId,
  // variableIndex)` — renderiza "—" preservando o padrao canonico do
  // banner `LABEL_HINT_LINHAS_TRACO`. Demanda e Executado sao editaveis.
  const metaDisplay = v.meta ?? '—';
  return (
    <Fragment key={`slot-${idx}`}>
      <td style={{ ...TD_READONLY_STYLE, ...borderLeftStyle }}>{metaDisplay}</td>
      <td style={TD_STYLE}>
        <input
          type="text"
          value={demanda}
          onChange={(e) => onEdit(row.employeeId, v.variableIndex, 'demanda', e.target.value)}
          disabled={!isEditable}
          style={INPUT_STYLE}
        />
      </td>
      <td style={TD_STYLE}>
        <input
          type="text"
          value={executado}
          onChange={(e) => onEdit(row.employeeId, v.variableIndex, 'executado', e.target.value)}
          disabled={!isEditable}
          style={INPUT_STYLE}
        />
      </td>
    </Fragment>
  );
}
