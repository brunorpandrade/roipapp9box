'use client';

import { useCallback, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../../lib/design-tokens/colors';

import { generateDiagnosticoAction } from './actions';
import {
  QUADRANTE_LEGENDA,
  NINE_BOX_GRID,
  colIndexFor,
  direcaoArrow,
  faixaDesempenhoLabel,
  faixaPlenitudeLabel,
  formatPercent,
  formatScore,
  initialsOf,
  rowIndexFor,
} from './internals';
import type {
  DashboardIndividualClientProps,
  DiagnosticoState,
  PosicaoX,
  PosicaoY,
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

function NineBox(props: { posicaoX: PosicaoX; posicaoY: PosicaoY; direcao: string }): JSX.Element {
  const activeRow = rowIndexFor(props.posicaoY);
  const activeCol = colIndexFor(props.posicaoX);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
      {NINE_BOX_GRID.map((row, r) =>
        row.map((cell, c) => {
          const active = r === activeRow && c === activeCol;
          return (
            <div
              key={cell.quadrante}
              style={{
                background: cell.bg,
                color: cell.text,
                borderRadius: 8,
                padding: '10px 6px',
                minHeight: 54,
                fontSize: 9,
                fontWeight: 700,
                textAlign: 'center',
                letterSpacing: '0.03em',
                lineHeight: 1.2,
                outline: active ? `2px solid ${COLORS.text.primary}` : 'none',
                outlineOffset: active ? 1 : 0,
                position: 'relative',
                opacity: active ? 1 : 0.65,
              }}
            >
              {cell.quadrante}
              {active && props.direcao.length > 0 ? (
                <span style={{ position: 'absolute', top: 3, right: 5, fontSize: 12 }}>
                  {props.direcao}
                </span>
              ) : null}
            </div>
          );
        }),
      )}
    </div>
  );
}

function DiagnosticoArea(props: {
  employeeId: number;
  trimestre: string | null;
  isTrimestreAtual: boolean;
  inicial: DiagnosticoState;
}): JSX.Element {
  const [texto, setTexto] = useState<string | null>(props.inicial.texto);
  const [geradoEm, setGeradoEm] = useState<string | null>(props.inicial.geradoEm);
  const [gerando, setGerando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  const gerar = useCallback(async (): Promise<void> => {
    if (props.trimestre === null) {
      return;
    }
    setGerando(true);
    setErro(null);
    const res = await generateDiagnosticoAction({
      employeeId: props.employeeId,
      trimestre: props.trimestre,
    });
    setGerando(false);
    if (!res.ok) {
      setErro(res.error ?? 'Não foi possível gerar o diagnóstico agora.');
      return;
    }
    setTexto(res.texto);
    setGeradoEm(res.geradoEm);
  }, [props.employeeId, props.trimestre]);

  const podeGerar = props.isTrimestreAtual && props.trimestre !== null;
  const rotuloBotao = texto === null ? 'Gerar diagnóstico' : 'Atualizar diagnóstico';

  return (
    <div style={CARD}>
      <div style={{ ...LABEL, marginBottom: 8 }}>DIAGNÓSTICO — IA</div>
      {gerando ? (
        <p style={{ fontSize: 13, color: COLORS.text.tertiary }}>Gerando diagnóstico…</p>
      ) : texto !== null ? (
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
          {texto}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: COLORS.text.tertiary }}>
          Diagnóstico não gerado para este trimestre.
        </p>
      )}
      {geradoEm !== null && !gerando ? (
        <p style={{ fontSize: 11, color: COLORS.text.quaternary, marginTop: 6 }}>
          Gerado em {new Date(geradoEm).toLocaleString('pt-BR')}
        </p>
      ) : null}
      {erro !== null ? (
        <p style={{ fontSize: 12, color: COLORS.badge.dangerText, marginTop: 8 }}>{erro}</p>
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
            border: texto === null ? 'none' : `1px solid ${COLORS.border.default}`,
            background: texto === null ? COLORS.primary.navy : COLORS.background.card,
            color: texto === null ? '#FFFFFF' : COLORS.text.secondary,
            fontWeight: 600,
            fontSize: 13,
            cursor: gerando ? 'not-allowed' : 'pointer',
          }}
        >
          {rotuloBotao}
        </button>
      ) : null}
    </div>
  );
}

export function DashboardIndividualClient(props: DashboardIndividualClientProps): JSX.Element {
  const { employee, eixoX, eixoY, nineBox, diagnostico, trimestre } = props;
  const quadrante = nineBox?.quadrante ?? null;
  const legenda = quadrante !== null ? (QUADRANTE_LEGENDA[quadrante] ?? '') : '';
  const seta = direcaoArrow(nineBox?.direcaoMovimento ?? null);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
          Dashboard individual
        </h1>
        {trimestre !== null ? (
          <span style={{ fontSize: 13, color: COLORS.text.tertiary }}>{trimestre}</span>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  background: COLORS.primary.navy,
                  color: '#FFFFFF',
                  fontSize: 15,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {initialsOf(employee.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text.primary }}>
                  {employee.name}
                </div>
                <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>
                  {employee.jobFamily} · {employee.departamento}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: COLORS.text.quaternary }}>
                    {employee.senioridade}
                  </span>
                  <span style={{ fontSize: 11, color: COLORS.text.quaternary }}>
                    {employee.nivelHierarquico}
                  </span>
                  {employee.isLider ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: COLORS.badge.rhText,
                        background: COLORS.badge.rhBg,
                        borderRadius: 999,
                        padding: '1px 8px',
                      }}
                    >
                      Líder
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ ...LABEL, marginBottom: 10 }}>9-BOX</div>
            {nineBox !== null ? (
              <>
                <NineBox
                  posicaoX={nineBox.posicaoX}
                  posicaoY={nineBox.posicaoY}
                  direcao={seta.char}
                />
                <div style={{ textAlign: 'center', ...LABEL, marginTop: 8, fontSize: 10 }}>
                  DESEMPENHO →
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...LABEL, fontSize: 10 }}>QUADRANTE ATUAL</div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: COLORS.text.primary,
                      marginTop: 2,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {quadrante}
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
                Sem classificação 9-Box para este colaborador.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={CARD}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div>
                <div style={LABEL}>EIXO X</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.semantic.success }}>
                  {formatPercent(eixoX?.indiceDesempenho ?? null)}
                </div>
                <div style={{ fontSize: 11, color: COLORS.text.tertiary, marginTop: 2 }}>
                  {faixaDesempenhoLabel(eixoX?.faixaDesempenho ?? null)}
                </div>
              </div>
              <div>
                <div style={LABEL}>EIXO Y</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.primary.navy }}>
                  {formatPercent(eixoY?.plenitudeScore ?? null)}
                </div>
                <div style={{ fontSize: 11, color: COLORS.text.tertiary, marginTop: 2 }}>
                  {faixaPlenitudeLabel(eixoY?.faixaPlenitude ?? null)}
                </div>
              </div>
              <div>
                <div style={LABEL}>OCIOSIDADE</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary }}>
                  {formatPercent(eixoX?.capacidadeOciosa ?? null)}
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

          {eixoY !== null && eixoY.dimensoes.length > 0 ? (
            <div style={CARD}>
              <div style={{ ...LABEL, marginBottom: 8 }}>PLENITUDE — AUTOAVALIAÇÃO vs LÍDER</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {eixoY.dimensoes.map((d) => (
                  <div
                    key={d.label}
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
                  >
                    <span style={{ color: COLORS.text.secondary }}>{d.label}</span>
                    <span style={{ color: COLORS.text.tertiary }}>
                      auto {formatScore(d.a)} · líder {formatScore(d.c)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <DiagnosticoArea
            employeeId={employee.id}
            trimestre={trimestre}
            isTrimestreAtual={props.isTrimestreAtual}
            inicial={diagnostico}
          />
        </div>
      </div>
    </div>
  );
}
