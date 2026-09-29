'use client';

// ROIP APP 9BOX — drawer canonico dos Dialogos de desenvolvimento no
// dashboard individual (ME Etapa 1 — Bloco 2). Reproduz bit-a-bit
// CAMADA_UI §14.26:
//   - Largura 54vw (max 720px, min 360px), borda esquerda teal, sombra
//     lateral.
//   - Cabecalho: barra de pesquisa, botao [Resumo com IA] (STUB nesta
//     ME — decisao D2.3), botao [+ Novo dialogo], label discreto com
//     nome do colaborador.
//   - Lista: todos recolhidos por default; apenas um expandido por vez.
//     Linha recolhida: data + titulo + bolinha status + icone pendencia.
//     Ordenacao: createdAt DESC.
//   - Dialogo expandido: linha do titulo (input largura total menos
//     controles), bolinha status clicavel, checkbox Pendencia; corpo
//     livre auto-resize.
//   - Botoes antes do 1o salvamento: [Salvar] + [Descartar dialogo].
//   - Botoes apos 1o salvamento: [Salvar] + [Arquivar] com confirmacao
//     canonica literal.
//   - Resumo com IA: date pickers `<input type="date">` (canonizado
//     `.toISOString().slice(0, 10)` — decisao D2.4); botao [Gerar
//     resumo] DESABILITADO com tooltip "Disponivel em ME futura".
//   - Fechar aba: [✕] canto superior direito; aviso se alteracoes nao
//     salvas.
//
// Debounce da pesquisa 300ms canonico (§14.26).
//
// **RV-13.** Componente consumido em `DashboardIndividualClient.tsx`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../../lib/design-tokens/colors';

import {
  dialogosArchiveAction,
  dialogosCreateAction,
  dialogosDiscardAction,
  dialogosListAction,
  dialogosUpdateAction,
} from './dialogosActions';
import type { DialogoRow } from './dialogosTypes';

/** Mensagem literal canonica §14.26 de arquivamento. */
export const MSG_CONFIRM_ARQUIVAR_DIALOGO =
  'Este dialogo sera arquivado e nao aparecera mais na lista. Deseja continuar?';

/** Debounce canonico da pesquisa (§14.26). */
const DEBOUNCE_MS = 300;

const TEAL = '#14B8A6';

const OVERLAY: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '54vw',
  maxWidth: 720,
  minWidth: 360,
  background: COLORS.background.card,
  borderLeft: `3px solid ${TEAL}`,
  boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.12)',
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column',
};

const HEADER: CSSProperties = {
  padding: 16,
  borderBottom: `1px solid ${COLORS.border.default}`,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const HEADER_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const SEARCH_INPUT: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  color: COLORS.text.primary,
  outline: 'none',
};

const HEADER_BTN: CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  color: COLORS.text.secondary,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const HEADER_BTN_PRIMARY: CSSProperties = {
  ...HEADER_BTN,
  background: TEAL,
  color: '#FFFFFF',
  border: 'none',
};

const CLOSE_BTN: CSSProperties = {
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  borderRadius: 8,
  width: 32,
  height: 32,
  fontSize: 16,
  lineHeight: 1,
  color: COLORS.text.secondary,
  cursor: 'pointer',
  flexShrink: 0,
};

const LIST_AREA: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const ROW_COLLAPSED: CSSProperties = {
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: '10px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  cursor: 'pointer',
  background: COLORS.background.card,
};

const ROW_EXPANDED: CSSProperties = {
  border: `1px solid ${TEAL}`,
  borderRadius: 8,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  background: COLORS.background.card,
};

const TITULO_INPUT: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 10px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 6,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  color: COLORS.text.primary,
  outline: 'none',
};

const CORPO_TEXTAREA: CSSProperties = {
  width: '100%',
  minHeight: 120,
  padding: '10px 12px',
  fontSize: 13,
  borderRadius: 6,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  color: COLORS.text.primary,
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
  lineHeight: 1.5,
};

const ACTION_BTN: CSSProperties = {
  padding: '7px 14px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  color: COLORS.text.secondary,
  cursor: 'pointer',
};

const ACTION_BTN_PRIMARY: CSSProperties = {
  ...ACTION_BTN,
  background: TEAL,
  color: '#FFFFFF',
  border: 'none',
};

const ACTION_BTN_DANGER: CSSProperties = {
  ...ACTION_BTN,
  color: COLORS.badge.dangerText,
  borderColor: COLORS.badge.dangerText,
};

/** Padrao canonico Etapa 0: `.toISOString().slice(0, 10)` (UTC). */
export function formatDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Formata data legivel para linha recolhida (dd/mm/yyyy pt-BR). */
function formatDataLinha(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString('pt-BR');
}

/** Bolinha canonica de status (§14.26). */
function StatusBolinha(props: {
  status: 'verde' | 'vermelho';
  onClick?: () => void;
  disabled?: boolean;
}): JSX.Element {
  const color = props.status === 'verde' ? COLORS.semantic.success : COLORS.semantic.danger;
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={`Alternar status (${props.status})`}
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: color,
        border: 'none',
        padding: 0,
        cursor: props.onClick !== undefined && !props.disabled ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    />
  );
}

/** Icone canonico de pendencia (§14.26 — checkbox ☑ ou ☐). */
function PendenciaIcone(props: { pendencia: boolean }): JSX.Element {
  return (
    <span style={{ fontSize: 14, color: COLORS.text.secondary, flexShrink: 0 }}>
      {props.pendencia ? '☑' : '☐'}
    </span>
  );
}

interface DialogoExpandidoLocalState {
  readonly titulo: string;
  readonly corpo: string;
  readonly status: 'verde' | 'vermelho';
  readonly pendencia: boolean;
  readonly dirty: boolean;
}

function DialogoExpandido(props: {
  dialog: DialogoRow;
  onCollapse: () => void;
  onSaved: (updated: DialogoRow) => void;
  onDiscarded: (id: number) => void;
  onArchived: (id: number) => void;
  onDirtyChange: (dirty: boolean) => void;
}): JSX.Element {
  const { dialog } = props;
  const foiSalvo = useMemo<boolean>(
    () => (dialog.titulo ?? '').length > 0 || (dialog.corpo ?? '').length > 0,
    [dialog.titulo, dialog.corpo],
  );

  const [local, setLocal] = useState<DialogoExpandidoLocalState>({
    titulo: dialog.titulo ?? '',
    corpo: dialog.corpo ?? '',
    status: dialog.status,
    pendencia: dialog.pendencia,
    dirty: false,
  });
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    props.onDirtyChange(local.dirty);
  }, [local.dirty, props]);

  const setField = useCallback(
    <K extends keyof Omit<DialogoExpandidoLocalState, 'dirty'>>(
      key: K,
      value: DialogoExpandidoLocalState[K],
    ): void => {
      setLocal((prev) => ({ ...prev, [key]: value, dirty: true }));
    },
    [],
  );

  const salvar = useCallback(async (): Promise<void> => {
    setSalvando(true);
    setErro(null);
    const res = await dialogosUpdateAction({
      id: dialog.id,
      titulo: local.titulo,
      corpo: local.corpo,
      status: local.status,
      pendencia: local.pendencia,
    });
    setSalvando(false);
    if (!res.ok || res.dialog === null) {
      setErro(res.error ?? 'Nao foi possivel salvar.');
      return;
    }
    setLocal((prev) => ({ ...prev, dirty: false }));
    props.onSaved(res.dialog);
  }, [dialog.id, local, props]);

  const descartar = useCallback(async (): Promise<void> => {
    setSalvando(true);
    setErro(null);
    const res = await dialogosDiscardAction({ id: dialog.id });
    setSalvando(false);
    if (!res.ok) {
      setErro(res.error ?? 'Nao foi possivel descartar.');
      return;
    }
    props.onDiscarded(dialog.id);
  }, [dialog.id, props]);

  const arquivar = useCallback(async (): Promise<void> => {
    // Confirmacao canonica §14.26 — modal nativo do browser.
    const ok = typeof window !== 'undefined' && window.confirm(MSG_CONFIRM_ARQUIVAR_DIALOGO);
    if (!ok) {
      return;
    }
    setSalvando(true);
    setErro(null);
    const res = await dialogosArchiveAction({ id: dialog.id });
    setSalvando(false);
    if (!res.ok) {
      setErro(res.error ?? 'Nao foi possivel arquivar.');
      return;
    }
    props.onArchived(dialog.id);
  }, [dialog.id, props]);

  const alternarStatus = useCallback((): void => {
    setField('status', local.status === 'verde' ? 'vermelho' : 'verde');
  }, [local.status, setField]);

  return (
    <div style={ROW_EXPANDED}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="text"
          value={local.titulo}
          onChange={(e) => setField('titulo', e.target.value)}
          placeholder="Titulo do dialogo"
          maxLength={255}
          autoFocus={!foiSalvo}
          style={TITULO_INPUT}
        />
        <StatusBolinha status={local.status} onClick={alternarStatus} disabled={salvando} />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            color: COLORS.text.secondary,
          }}
        >
          <input
            type="checkbox"
            checked={local.pendencia}
            onChange={(e) => setField('pendencia', e.target.checked)}
            disabled={salvando}
          />
          Pendencia
        </label>
        <button
          type="button"
          onClick={props.onCollapse}
          aria-label="Recolher"
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: 16,
            color: COLORS.text.tertiary,
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          ▲
        </button>
      </div>
      <textarea
        value={local.corpo}
        onChange={(e) => setField('corpo', e.target.value)}
        placeholder="Corpo do dialogo (texto livre)"
        maxLength={10_000}
        style={CORPO_TEXTAREA}
      />
      {erro !== null ? (
        <p style={{ fontSize: 12, color: COLORS.badge.dangerText, margin: 0 }}>{erro}</p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || !local.dirty}
          style={{
            ...ACTION_BTN_PRIMARY,
            opacity: salvando || !local.dirty ? 0.5 : 1,
            cursor: salvando || !local.dirty ? 'not-allowed' : 'pointer',
          }}
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
        {foiSalvo ? (
          <button
            type="button"
            onClick={() => void arquivar()}
            disabled={salvando}
            style={{
              ...ACTION_BTN,
              opacity: salvando ? 0.5 : 1,
            }}
          >
            Arquivar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void descartar()}
            disabled={salvando}
            style={{
              ...ACTION_BTN_DANGER,
              opacity: salvando ? 0.5 : 1,
            }}
          >
            Descartar dialogo
          </button>
        )}
      </div>
    </div>
  );
}

function DialogoRecolhido(props: { dialog: DialogoRow; onExpand: () => void }): JSX.Element {
  const { dialog } = props;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={props.onExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onExpand();
        }
      }}
      style={ROW_COLLAPSED}
    >
      <span style={{ fontSize: 12, color: COLORS.text.tertiary, minWidth: 88 }}>
        {formatDataLinha(dialog.createdAt)}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: COLORS.text.primary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {(dialog.titulo ?? '').length > 0 ? (
          dialog.titulo
        ) : (
          <em style={{ color: COLORS.text.tertiary }}>Sem titulo</em>
        )}
      </span>
      <StatusBolinha status={dialog.status} />
      <PendenciaIcone pendencia={dialog.pendencia} />
    </div>
  );
}

interface ResumoIAState {
  readonly open: boolean;
  readonly dataInicial: string;
  readonly dataFinal: string;
}

function ResumoIABox(props: {
  state: ResumoIAState;
  onChange: (patch: Partial<ResumoIAState>) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <div
      style={{
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        padding: 12,
        margin: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: COLORS.background.elevated,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text.primary }}>
          Resumo com IA
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Fechar area de resumo"
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: 14,
            color: COLORS.text.tertiary,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ fontSize: 11, color: COLORS.text.tertiary }}>
          Data inicial
          <input
            type="date"
            value={props.state.dataInicial}
            onChange={(e) => props.onChange({ dataInicial: e.target.value })}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 8px',
              marginTop: 3,
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              fontSize: 12,
            }}
          />
        </label>
        <label style={{ fontSize: 11, color: COLORS.text.tertiary }}>
          Data final
          <input
            type="date"
            value={props.state.dataFinal}
            onChange={(e) => props.onChange({ dataFinal: e.target.value })}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 8px',
              marginTop: 3,
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              fontSize: 12,
            }}
          />
        </label>
      </div>
      <button
        type="button"
        disabled
        title="Disponivel em ME futura"
        style={{
          ...ACTION_BTN,
          alignSelf: 'flex-start',
          cursor: 'not-allowed',
          opacity: 0.5,
        }}
      >
        Gerar resumo (em breve)
      </button>
    </div>
  );
}

export interface DialogosDrawerProps {
  readonly employeeId: number;
  readonly employeeName: string;
  /**
   * Retomada ME-PAINEL-PENDENCIAS-DIALOGOS (D2). ID canonico do
   * dialogo a expandir automaticamente ao abrir o drawer via deep-link
   * do `CardPendenciasDialogos`. Quando `null`/omitido, mantem o
   * comportamento canonico (nenhum expandido inicialmente). Se o id
   * nao existir na lista carregada (dialogo arquivado/removido), o
   * drawer abre normalmente sem expandir nada — sem erro visivel.
   */
  readonly initialExpandedId?: number | null;
  readonly onClose: () => void;
}

export function DialogosDrawer(props: DialogosDrawerProps): JSX.Element {
  const initialExpandedId = props.initialExpandedId ?? null;
  const [dialogs, setDialogs] = useState<readonly DialogoRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [erroGlobal, setErroGlobal] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedId, setExpandedId] = useState<number | null>(initialExpandedId);
  const [dirtyExpanded, setDirtyExpanded] = useState<boolean>(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialScrollAppliedRef = useRef<boolean>(false);

  const [resumoIA, setResumoIA] = useState<ResumoIAState>({
    open: false,
    dataInicial: formatDateUTC(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
    dataFinal: formatDateUTC(new Date()),
  });

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const res = await dialogosListAction({ employeeId: props.employeeId });
    setLoading(false);
    if (!res.ok) {
      setErroGlobal(res.error ?? 'Erro ao carregar dialogos.');
      return;
    }
    setErroGlobal(null);
    setDialogs(res.dialogs);
  }, [props.employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Retomada ME-PAINEL-PENDENCIAS-DIALOGOS (D2). Apos o primeiro load
  // com dados, se veio deep-link com `initialExpandedId` valido e o
  // dialogo existe na lista carregada, faz scroll suave ate o item ja
  // expandido. Aplicado uma unica vez por ciclo de abertura do drawer
  // (o ref garante idempotencia contra reloads da lista pos-acao).
  useEffect(() => {
    if (initialExpandedId === null) {
      return;
    }
    if (initialScrollAppliedRef.current) {
      return;
    }
    if (loading) {
      return;
    }
    const existe = dialogs.some((d) => d.id === initialExpandedId);
    if (!existe) {
      initialScrollAppliedRef.current = true;
      return;
    }
    initialScrollAppliedRef.current = true;
    if (typeof document === 'undefined') {
      return;
    }
    const seletor = `[data-dialog-id="${initialExpandedId}"]`;
    const el = document.querySelector(seletor);
    if (el !== null) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [initialExpandedId, loading, dialogs]);

  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setSearchTerm(searchInput);
    }, DEBOUNCE_MS);
    return (): void => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchInput]);

  const filtered = useMemo<readonly DialogoRow[]>(() => {
    if (searchTerm.trim().length === 0) {
      return dialogs;
    }
    const q = searchTerm.trim().toLowerCase();
    return dialogs.filter((d) => {
      const titulo = (d.titulo ?? '').toLowerCase();
      const corpo = (d.corpo ?? '').toLowerCase();
      return titulo.includes(q) || corpo.includes(q);
    });
  }, [dialogs, searchTerm]);

  const criar = useCallback(async (): Promise<void> => {
    const res = await dialogosCreateAction({ employeeId: props.employeeId });
    if (!res.ok || res.dialog === null) {
      setErroGlobal(res.error ?? 'Nao foi possivel criar o dialogo.');
      return;
    }
    setDialogs((prev) => [res.dialog!, ...prev]);
    setExpandedId(res.dialog.id);
    setErroGlobal(null);
  }, [props.employeeId]);

  const tentarFechar = useCallback((): void => {
    if (dirtyExpanded) {
      // Aviso canonico §14.26 sobre alteracoes nao salvas — modal nativo.
      const aviso = 'Ha alteracoes nao salvas. Fechar mesmo assim?';
      const ok = typeof window !== 'undefined' && window.confirm(aviso);
      if (!ok) {
        return;
      }
    }
    props.onClose();
  }, [dirtyExpanded, props]);

  const handleSaved = useCallback((updated: DialogoRow): void => {
    setDialogs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }, []);

  const handleDiscarded = useCallback((id: number): void => {
    setDialogs((prev) => prev.filter((d) => d.id !== id));
    setExpandedId(null);
  }, []);

  const handleArchived = useCallback((id: number): void => {
    setDialogs((prev) => prev.filter((d) => d.id !== id));
    setExpandedId(null);
  }, []);

  return (
    <div style={OVERLAY} role="dialog" aria-label="Dialogos de desenvolvimento">
      <div style={HEADER}>
        <div style={HEADER_ROW}>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por titulo ou conteudo..."
            style={SEARCH_INPUT}
          />
          <button
            type="button"
            onClick={() => setResumoIA((s) => ({ ...s, open: !s.open }))}
            style={HEADER_BTN}
            title="Interface visual — geracao disponivel em ME futura"
          >
            Resumo com IA
          </button>
          <button type="button" onClick={() => void criar()} style={HEADER_BTN_PRIMARY}>
            + Novo dialogo
          </button>
          <button type="button" onClick={tentarFechar} aria-label="Fechar" style={CLOSE_BTN}>
            ×
          </button>
        </div>
        <div style={{ fontSize: 11, color: COLORS.text.tertiary }}>
          {props.employeeName} · {new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>

      {resumoIA.open ? (
        <ResumoIABox
          state={resumoIA}
          onChange={(patch) => setResumoIA((s) => ({ ...s, ...patch }))}
          onClose={() => setResumoIA((s) => ({ ...s, open: false }))}
        />
      ) : null}

      <div style={LIST_AREA}>
        {loading ? (
          <p style={{ fontSize: 12, color: COLORS.text.tertiary }}>Carregando dialogos...</p>
        ) : erroGlobal !== null ? (
          <p style={{ fontSize: 12, color: COLORS.badge.dangerText }}>{erroGlobal}</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 12, color: COLORS.text.tertiary }}>
            {dialogs.length === 0
              ? 'Sem dialogos. Clique em [+ Novo dialogo] para comecar.'
              : 'Nenhum resultado para a pesquisa.'}
          </p>
        ) : (
          filtered.map((d) => (
            <div key={d.id} data-dialog-id={d.id}>
              {expandedId === d.id ? (
                <DialogoExpandido
                  dialog={d}
                  onCollapse={() => {
                    setExpandedId(null);
                    setDirtyExpanded(false);
                  }}
                  onSaved={handleSaved}
                  onDiscarded={handleDiscarded}
                  onArchived={handleArchived}
                  onDirtyChange={setDirtyExpanded}
                />
              ) : (
                <DialogoRecolhido
                  dialog={d}
                  onExpand={() => {
                    setExpandedId(d.id);
                    setDirtyExpanded(false);
                  }}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
