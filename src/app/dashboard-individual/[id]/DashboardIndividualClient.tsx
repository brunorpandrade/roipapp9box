'use client';

import { useCallback, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../../lib/design-tokens/colors';

import { FichaCadastralModal } from '../../../components/colaboradores/FichaCadastralModal';

import { PerfilIndividualRelatorioModal } from './PerfilIndividualRelatorioModal';
import {
  generateDiagnosticoAction,
  loadDashboardQuarterAction,
  loadEixoXDetalheAction,
} from './actions';
import {
  NINE_BOX_GRID,
  QUADRANTE_LEGENDA,
  colIndexFor,
  derivarSeta,
  faixaDesempenhoLabel,
  faixaPlenitudeLabel,
  formatBRLInt,
  formatMultiplier,
  formatNumBR,
  formatPercent,
  formatPercentFrac,
  formatScore,
  idadeAnos,
  initialsOf,
  ociosidadeLabel,
  ociosidadeTier,
  quarterLabel,
  rowIndexFor,
  tempoEmpresa,
} from './internals';
import type {
  DashboardIndividualClientProps,
  EixoXDetalhe,
  EixoY,
  FaixaDesempenho,
  OciosidadeTier,
  PosicaoX,
  PosicaoY,
  QuarterView,
} from './internals';

const CARD: CSSProperties = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 12,
  padding: 16,
};

const LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: COLORS.text.tertiary,
  letterSpacing: '0.04em',
};

const OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17,24,39,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 50,
};

function navBtnStyle(disabled: boolean): CSSProperties {
  return {
    border: `1px solid ${COLORS.border.default}`,
    background: COLORS.background.card,
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 13,
    color: COLORS.text.secondary,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };
}

function NineBox(props: {
  posicaoX: PosicaoX;
  posicaoY: PosicaoY;
  iniciais: string;
  seta: string;
  setaColor: string;
}): JSX.Element {
  const activeRow = rowIndexFor(props.posicaoY);
  const activeCol = colIndexFor(props.posicaoX);
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <span style={{ ...LABEL, fontSize: 11 }}>↑</span>
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            ...LABEL,
            fontSize: 10,
            textAlign: 'center',
          }}
        >
          PLENITUDE
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {NINE_BOX_GRID.map((row, r) =>
            row.map((cell, c) => {
              const active = r === activeRow && c === activeCol;
              return (
                <div
                  key={cell.quadrante}
                  style={{
                    background: cell.bg,
                    color: cell.text,
                    borderRadius: 10,
                    minHeight: 92,
                    padding: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.03em',
                    lineHeight: 1.2,
                    position: 'relative',
                    outline: active ? `2px solid ${COLORS.text.primary}` : 'none',
                    outlineOffset: active ? 1 : 0,
                    opacity: active ? 1 : 0.7,
                  }}
                >
                  {active ? (
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: '50%',
                        background: COLORS.primary.navy,
                        color: '#FFFFFF',
                        fontSize: 14,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {props.iniciais}
                    </div>
                  ) : (
                    cell.quadrante
                  )}
                  {active && props.seta.length > 0 ? (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 6,
                        right: 8,
                        fontSize: 16,
                        color: props.setaColor,
                      }}
                    >
                      {props.seta}
                    </span>
                  ) : null}
                </div>
              );
            }),
          )}
        </div>
        <div style={{ textAlign: 'center', ...LABEL, marginTop: 8, fontSize: 10 }}>
          DESEMPENHO →
        </div>
      </div>
    </div>
  );
}

function LegendaModal(props: { onClose: () => void }): JSX.Element {
  return (
    <div style={OVERLAY} onClick={props.onClose}>
      <div
        style={{ ...CARD, maxWidth: 820, width: '100%', maxHeight: '86vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={props.onClose} style={navBtnStyle(false)}>
            Fechar
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {NINE_BOX_GRID.flat().map((cell) => (
            <div key={cell.quadrante} style={{ background: cell.bg, borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: cell.text, marginBottom: 4 }}>
                {cell.quadrante}
              </div>
              <div style={{ fontSize: 11, color: COLORS.text.secondary, lineHeight: 1.4 }}>
                {QUADRANTE_LEGENDA[cell.quadrante] ?? ''}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: COLORS.background.elevated,
            borderRadius: 8,
            fontSize: 12,
            color: COLORS.text.secondary,
          }}
        >
          <div>
            <strong>Faixas de desempenho:</strong> Baixo &lt;60% · Médio 60–85% · Alto &gt;85%
          </div>
          <div>
            <strong>Faixas de plenitude:</strong> Baixa &lt;50% · Média 50–75% · Alta &gt;75%
          </div>
        </div>
      </div>
    </div>
  );
}

function barra(valor: string | null, cor: string): JSX.Element {
  const num = Number(valor);
  const pct = Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : 0;
  return (
    <div style={{ flex: 1, height: 8, background: COLORS.border.default, borderRadius: 999 }}>
      <div style={{ width: `${pct}%`, height: 8, background: cor, borderRadius: 999 }} />
    </div>
  );
}

const AZUL_AUTO = '#4F7FE0';
const VERDE_LIDER = '#45B08C';

const CLOSE_X: CSSProperties = {
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  borderRadius: 8,
  width: 32,
  height: 32,
  fontSize: 16,
  lineHeight: 1,
  color: COLORS.text.secondary,
  cursor: 'pointer',
};

function statusBadge(respondido: boolean): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 600,
        color: respondido ? COLORS.badge.successTextAlt : COLORS.text.tertiary,
        background: respondido ? COLORS.badge.successBg : COLORS.background.elevated,
        borderRadius: 999,
        padding: '2px 8px',
        marginBottom: 6,
      }}
    >
      {respondido ? 'Respondido' : 'Pendente'}
    </span>
  );
}

function dimRow(label: string, valor: string | null, cor: string): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <span style={{ width: 96, fontSize: 12, color: COLORS.text.secondary, flexShrink: 0 }}>
        {label}
      </span>
      {barra(valor, cor)}
      <span
        style={{
          width: 44,
          textAlign: 'right',
          fontSize: 12,
          fontWeight: 600,
          color: cor,
          flexShrink: 0,
        }}
      >
        {formatPercent(valor)}
      </span>
    </div>
  );
}

function EixoYModal(props: { eixoY: EixoY; onClose: () => void }): JSX.Element {
  const { eixoY } = props;
  const convergente = !eixoY.alertaDivergencia;
  const divBg = convergente ? COLORS.badge.successBg : COLORS.badge.warningBg;
  const divText = convergente ? COLORS.badge.successText : COLORS.badge.warningText;
  return (
    <div style={OVERLAY} onClick={props.onClose}>
      <div
        style={{ ...CARD, maxWidth: 720, width: '100%', maxHeight: '86vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text.primary }}>
            Eixo Y (Plenitude)
          </div>
          <button type="button" onClick={props.onClose} aria-label="Fechar" style={CLOSE_X}>
            ×
          </button>
        </div>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}
        >
          <div style={{ background: COLORS.background.elevated, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: COLORS.text.tertiary, marginBottom: 4 }}>
              Autoavaliação
            </div>
            {statusBadge(eixoY.scoreA !== null)}
            <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.primary.navy }}>
              {formatPercent(eixoY.scoreA)}
            </div>
            <div style={{ fontSize: 11, color: COLORS.text.tertiary }}>Peso 40%</div>
          </div>
          <div style={{ background: COLORS.background.elevated, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: COLORS.text.tertiary, marginBottom: 4 }}>
              Avaliação do líder
            </div>
            {statusBadge(eixoY.scoreC !== null)}
            <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.primary.navy }}>
              {formatPercent(eixoY.scoreC)}
            </div>
            <div style={{ fontSize: 11, color: COLORS.text.tertiary }}>Peso 60%</div>
          </div>
          <div style={{ background: divBg, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: divText, marginBottom: 4 }}>Divergência</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: divText }}>
              {formatScore(eixoY.divergencia)} pts
            </div>
            <div style={{ fontSize: 11, color: divText }}>
              {convergente ? 'Convergente' : 'Divergente'}
            </div>
          </div>
        </div>
        <div style={{ ...LABEL, marginTop: 18, marginBottom: 8, fontSize: 12 }}>
          DETALHAMENTO POR DIMENSÃO
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {eixoY.dimensoes.map((d) => (
            <div key={d.label}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.text.primary,
                  marginBottom: 2,
                }}
              >
                {d.label}
              </div>
              {dimRow('Autoavaliação', d.a, AZUL_AUTO)}
              {dimRow('Líder', d.c, VERDE_LIDER)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function faixaDesColor(f: FaixaDesempenho | null): string {
  if (f === 'alto') {
    return COLORS.semantic.success;
  }
  if (f === 'medio') {
    return COLORS.semantic.warning;
  }
  if (f === 'baixo') {
    return COLORS.semantic.danger;
  }
  return COLORS.text.primary;
}

function ociColor(tier: OciosidadeTier): string {
  if (tier === 'saudavel') {
    return COLORS.semantic.success;
  }
  if (tier === 'atencao') {
    return COLORS.semantic.warning;
  }
  if (tier === 'critica') {
    return COLORS.semantic.danger;
  }
  return COLORS.text.primary;
}

function EixoXModal(props: {
  detalhe: EixoXDetalhe | null;
  loading: boolean;
  onClose: () => void;
}): JSX.Element {
  const { detalhe, loading } = props;
  return (
    <div style={OVERLAY} onClick={props.onClose}>
      <div
        style={{ ...CARD, maxWidth: 720, width: '100%', maxHeight: '86vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text.primary }}>
            Eixo X (Desempenho)
          </div>
          <button type="button" onClick={props.onClose} aria-label="Fechar" style={CLOSE_X}>
            ×
          </button>
        </div>
        {loading ? (
          <p style={{ fontSize: 13, color: COLORS.text.tertiary, marginTop: 14 }}>
            Carregando detalhamento…
          </p>
        ) : detalhe === null ? (
          <p style={{ fontSize: 13, color: COLORS.text.tertiary, marginTop: 14 }}>
            Não foi possível carregar o detalhamento.
          </p>
        ) : (
          <>
            <div
              style={{
                background: COLORS.background.elevated,
                borderRadius: 8,
                padding: 12,
                marginTop: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 13, color: COLORS.text.secondary }}>
                Índice de desempenho trimestral
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: COLORS.primary.navy }}>
                {formatPercentFrac(detalhe.indiceDesempenho)}
              </span>
            </div>
            <div style={{ marginTop: 14, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: COLORS.text.tertiary }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Variável</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Meta</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Demanda</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Executado</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Desempenho</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.variaveis.map((v) => (
                    <tr
                      key={v.variableIndex}
                      style={{ borderTop: `1px solid ${COLORS.border.divider}` }}
                    >
                      <td style={{ textAlign: 'left', padding: '8px', color: COLORS.text.primary }}>
                        {v.nome}
                      </td>
                      <td
                        style={{ textAlign: 'right', padding: '8px', color: COLORS.text.secondary }}
                      >
                        {formatNumBR(v.meta)}
                      </td>
                      <td
                        style={{ textAlign: 'right', padding: '8px', color: COLORS.text.secondary }}
                      >
                        {formatNumBR(v.demanda)}
                      </td>
                      <td
                        style={{ textAlign: 'right', padding: '8px', color: COLORS.text.primary }}
                      >
                        {formatNumBR(v.executado)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '8px',
                          color: COLORS.semantic.success,
                          fontWeight: 600,
                        }}
                      >
                        {formatPercentFrac(v.desempenho)}
                      </td>
                      <td
                        style={{ textAlign: 'right', padding: '8px', color: COLORS.text.tertiary }}
                      >
                        {formatPercent(v.peso)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detalhe.variaveis.length === 0 ? (
                <p style={{ fontSize: 13, color: COLORS.text.tertiary, marginTop: 8 }}>
                  Sem variáveis para este trimestre.
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function DashboardIndividualClient(props: DashboardIndividualClientProps): JSX.Element {
  const { employee, trimestresDisponiveis, fichaLoadAction, editHref, hideRf } = props;
  const [view, setView] = useState<QuarterView>(props.view);
  const [carregandoNav, setCarregandoNav] = useState<boolean>(false);
  const [gerando, setGerando] = useState<boolean>(false);
  const [erroDiag, setErroDiag] = useState<string | null>(null);
  const [legendaOpen, setLegendaOpen] = useState<boolean>(false);
  const [eixoYOpen, setEixoYOpen] = useState<boolean>(false);
  const [detalhesOpen, setDetalhesOpen] = useState<boolean>(false);
  const [eixoXOpen, setEixoXOpen] = useState<boolean>(false);
  const [eixoXData, setEixoXData] = useState<EixoXDetalhe | null>(null);
  const [eixoXLoading, setEixoXLoading] = useState<boolean>(false);
  const [perfilOpen, setPerfilOpen] = useState<boolean>(false);

  const idx = view.trimestre !== null ? trimestresDisponiveis.indexOf(view.trimestre) : -1;
  const temAnterior = idx >= 0 && idx < trimestresDisponiveis.length - 1;
  const temProximo = idx > 0;

  const navegar = useCallback(
    async (delta: number): Promise<void> => {
      if (idx < 0) {
        return;
      }
      const alvoIdx = idx - delta;
      if (alvoIdx < 0 || alvoIdx >= trimestresDisponiveis.length) {
        return;
      }
      const alvo = trimestresDisponiveis[alvoIdx];
      if (alvo === undefined) {
        return;
      }
      setCarregandoNav(true);
      setErroDiag(null);
      const res = await loadDashboardQuarterAction({ employeeId: employee.id, trimestre: alvo });
      setCarregandoNav(false);
      if (res.ok && res.view !== null) {
        setView(res.view);
      }
    },
    [employee.id, idx, trimestresDisponiveis],
  );

  const gerar = useCallback(async (): Promise<void> => {
    if (view.trimestre === null) {
      return;
    }
    setGerando(true);
    setErroDiag(null);
    const res = await generateDiagnosticoAction({
      employeeId: employee.id,
      trimestre: view.trimestre,
    });
    setGerando(false);
    if (!res.ok) {
      setErroDiag(res.error ?? 'Não foi possível gerar o diagnóstico agora.');
      return;
    }
    setView((v) => ({ ...v, diagnostico: { texto: res.texto, geradoEm: res.geradoEm } }));
  }, [employee.id, view.trimestre]);

  const abrirEixoX = useCallback(async (): Promise<void> => {
    if (view.trimestre === null) {
      return;
    }
    setEixoXOpen(true);
    setEixoXLoading(true);
    setEixoXData(null);
    const res = await loadEixoXDetalheAction({
      employeeId: employee.id,
      trimestre: view.trimestre,
    });
    setEixoXLoading(false);
    setEixoXData(res.ok ? res.detalhe : null);
  }, [employee.id, view.trimestre]);

  const nb = view.nineBox;
  const seta =
    nb !== null
      ? derivarSeta(nb.posicaoX, nb.posicaoY, nb.posicaoXAnterior, nb.posicaoYAnterior)
      : { char: '', color: '' };
  const legenda = nb !== null ? (QUADRANTE_LEGENDA[nb.quadrante] ?? '') : '';
  const fin = view.financeiro;
  const eixoY = view.eixoY;
  const podeGerar = view.isTrimestreAtual && view.trimestre !== null;
  const rotuloBotao =
    view.diagnostico.texto === null ? 'Gerar diagnóstico' : 'Atualizar diagnóstico';
  const eixoXColor = faixaDesColor(view.eixoX?.faixaDesempenho ?? null);
  const ociTier = ociosidadeTier(view.eixoX?.capacidadeOciosa ?? null);
  const metaNum = fin !== null ? Number(fin.percMetaAtingida) : Number.NaN;
  const metaColor =
    Number.isFinite(metaNum) && metaNum >= 100 ? COLORS.semantic.success : COLORS.semantic.warning;

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <button
          type="button"
          onClick={() => void navegar(-1)}
          disabled={!temAnterior || carregandoNav}
          style={navBtnStyle(!temAnterior || carregandoNav)}
        >
          ‹ Anterior
        </button>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: COLORS.text.primary,
            minWidth: 220,
            textAlign: 'center',
          }}
        >
          {quarterLabel(view.trimestre)}
        </div>
        <button
          type="button"
          onClick={() => void navegar(1)}
          disabled={!temProximo || carregandoNav}
          style={navBtnStyle(!temProximo || carregandoNav)}
        >
          Próximo ›
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: COLORS.primary.navy,
                  color: '#FFFFFF',
                  fontSize: 16,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {initialsOf(employee.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text.primary }}>
                  {employee.name}
                </div>
                <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>
                  {employee.jobFamily} · {employee.departamento}
                </div>
                {employee.liderDireto !== null ? (
                  <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>
                    Líder: {employee.liderDireto}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                  {idadeAnos(employee.dataNascimento) !== null ? (
                    <span style={{ fontSize: 11, color: COLORS.text.quaternary }}>
                      {idadeAnos(employee.dataNascimento)} anos
                    </span>
                  ) : null}
                  <span style={{ fontSize: 11, color: COLORS.text.quaternary }}>
                    {employee.senioridade}
                  </span>
                  <span style={{ fontSize: 11, color: COLORS.text.quaternary }}>
                    {employee.nivelHierarquico}
                  </span>
                  <span style={{ fontSize: 11, color: COLORS.text.quaternary }}>
                    {tempoEmpresa(employee.dataAdmissao)}
                  </span>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                {employee.status === 'ativo' ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.badge.successTextAlt,
                      background: COLORS.badge.successBg,
                      borderRadius: 999,
                      padding: '2px 10px',
                    }}
                  >
                    ● Ativo
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDetalhesOpen(true)}
                  style={navBtnStyle(false)}
                >
                  Detalhes
                </button>
              </div>
            </div>
          </div>

          <div style={CARD}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <div style={{ ...LABEL, fontSize: 13, color: COLORS.text.primary }}>9-BOX</div>
              <button type="button" onClick={() => setLegendaOpen(true)} style={navBtnStyle(false)}>
                Legenda
              </button>
            </div>
            {nb !== null ? (
              <>
                <NineBox
                  posicaoX={nb.posicaoX}
                  posicaoY={nb.posicaoY}
                  iniciais={initialsOf(employee.name)}
                  seta={seta.char}
                  setaColor={seta.color}
                />
                {view.assiduidadeMedia !== null ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ ...LABEL, fontSize: 10 }}>ASSIDUIDADE MÉDIA</div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: COLORS.semantic.success,
                        marginTop: 2,
                      }}
                    >
                      {formatPercent(view.assiduidadeMedia)}
                    </div>
                  </div>
                ) : null}
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...LABEL, fontSize: 10 }}>QUADRANTE ATUAL</div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: COLORS.text.primary,
                      marginTop: 2,
                    }}
                  >
                    {nb.quadrante}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.text.tertiary,
                      marginTop: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    {legenda}
                  </div>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13, color: COLORS.text.tertiary }}>
                Sem classificação 9-Box neste trimestre.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={CARD}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div>
                <div style={LABEL}>EIXO X</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: eixoXColor }}>
                  {formatPercentFrac(view.eixoX?.indiceDesempenho ?? null)}
                </div>
                <div style={{ fontSize: 11, color: COLORS.text.tertiary, marginTop: 2 }}>
                  {faixaDesempenhoLabel(view.eixoX?.faixaDesempenho ?? null)}
                </div>
                {view.eixoX !== null ? (
                  <button
                    type="button"
                    onClick={() => void abrirEixoX()}
                    style={{ ...navBtnStyle(false), marginTop: 8, width: '100%', fontSize: 11 }}
                  >
                    Detalhamento
                  </button>
                ) : null}
              </div>
              <div>
                <div style={LABEL}>EIXO Y</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.primary.navy }}>
                  {formatPercent(eixoY?.plenitudeScore ?? null)}
                </div>
                <div style={{ fontSize: 11, color: COLORS.text.tertiary, marginTop: 2 }}>
                  {faixaPlenitudeLabel(eixoY?.faixaPlenitude ?? null)}
                </div>
                {eixoY !== null ? (
                  <button
                    type="button"
                    onClick={() => setEixoYOpen(true)}
                    style={{ ...navBtnStyle(false), marginTop: 8, width: '100%', fontSize: 11 }}
                  >
                    Detalhamento
                  </button>
                ) : null}
              </div>
              <div>
                <div style={LABEL}>OCIOSIDADE</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: ociColor(ociTier) }}>
                  {formatPercent(view.eixoX?.capacidadeOciosa ?? null)}
                </div>
                <div style={{ fontSize: 11, color: COLORS.text.tertiary, marginTop: 2 }}>
                  {ociosidadeLabel(ociTier)}
                </div>
              </div>
            </div>
            {eixoY?.alertaDivergencia === true ? (
              <div
                style={{
                  marginTop: 12,
                  padding: '7px 11px',
                  background: COLORS.badge.warningBg,
                  color: COLORS.badge.warningText,
                  borderRadius: 8,
                  fontSize: 11,
                }}
              >
                ⚠ Divergência entre autoavaliação e avaliação do líder —{' '}
                <strong>{formatScore(eixoY.divergencia)} pts</strong>
              </div>
            ) : null}
          </div>

          {fin !== null ? (
            <div style={CARD}>
              <div style={{ ...LABEL, marginBottom: 10 }}>
                DADOS FINANCEIROS — MÉDIA MENSAL DO TRIMESTRE
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>ROI estimado</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text.primary }}>
                    {formatMultiplier(fin.roiEstimado)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>Meta de ROI</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text.primary }}>
                    {formatMultiplier(fin.metaROI)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>Retorno estimado</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text.primary }}>
                    {formatBRLInt(fin.retornoEstimado)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>
                    % da meta atingida
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: metaColor }}>
                    {formatPercent(fin.percMetaAtingida)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div style={CARD}>
            <div style={{ ...LABEL, marginBottom: 8 }}>DIAGNÓSTICO — IA</div>
            {gerando ? (
              <p style={{ fontSize: 13, color: COLORS.text.tertiary }}>Gerando diagnóstico…</p>
            ) : view.diagnostico.texto !== null ? (
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: COLORS.text.secondary,
                  background: COLORS.background.elevated,
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                {view.diagnostico.texto}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: COLORS.text.tertiary }}>
                Diagnóstico não gerado para este trimestre.
              </p>
            )}
            {view.diagnostico.geradoEm !== null && !gerando ? (
              <p style={{ fontSize: 11, color: COLORS.text.quaternary, marginTop: 6 }}>
                Gerado em {new Date(view.diagnostico.geradoEm).toLocaleString('pt-BR')}
              </p>
            ) : null}
            {erroDiag !== null ? (
              <p style={{ fontSize: 12, color: COLORS.badge.dangerText, marginTop: 8 }}>
                {erroDiag}
              </p>
            ) : null}
            {podeGerar ? (
              <button
                type="button"
                onClick={() => void gerar()}
                disabled={gerando}
                style={{
                  marginTop: 12,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border:
                    view.diagnostico.texto === null ? 'none' : `1px solid ${COLORS.border.default}`,
                  background:
                    view.diagnostico.texto === null ? COLORS.primary.navy : COLORS.background.card,
                  color: view.diagnostico.texto === null ? '#FFFFFF' : COLORS.text.secondary,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: gerando ? 'not-allowed' : 'pointer',
                }}
              >
                {rotuloBotao}
              </button>
            ) : null}
          </div>

          <div style={CARD}>
            <div style={{ ...LABEL, marginBottom: 10 }}>PERFIL INDIVIDUAL</div>
            <button
              type="button"
              onClick={() => setPerfilOpen(true)}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: COLORS.accent.teal,
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Perfil individual
            </button>
          </div>
        </div>
      </div>

      {perfilOpen ? (
        <PerfilIndividualRelatorioModal
          companyId={employee.companyId}
          employeeId={employee.id}
          employeeName={employee.name}
          cargo={employee.jobFamily}
          nivelHierarquico={employee.nivelHierarquico}
          departamento={employee.departamento}
          liderDireto={employee.liderDireto}
          onClose={() => setPerfilOpen(false)}
        />
      ) : null}
      {legendaOpen ? <LegendaModal onClose={() => setLegendaOpen(false)} /> : null}
      {eixoYOpen && eixoY !== null ? (
        <EixoYModal eixoY={eixoY} onClose={() => setEixoYOpen(false)} />
      ) : null}
      {eixoXOpen ? (
        <EixoXModal
          detalhe={eixoXData}
          loading={eixoXLoading}
          onClose={() => setEixoXOpen(false)}
        />
      ) : null}
      {detalhesOpen ? (
        <FichaCadastralModal
          companyId={employee.companyId}
          employeeId={employee.id}
          employeeName={employee.name}
          loadAction={fichaLoadAction}
          editHref={editHref}
          hideRf={hideRf}
          onClose={() => setDetalhesOpen(false)}
        />
      ) : null}
    </div>
  );
}
