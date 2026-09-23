// ROIP APP 9BOX — peças compartilhadas dos dashboards agregados (ESPEC
// §7, §10). Extraídas do dashboard da empresa na ME §8.06.5 (RV-14) para
// serem reaproveitadas pelos dashboards de recorte (departamento, equipe
// direta, cadeia total). O comum: navegação de trimestre, card do
// coletivo, 9-Box com contagem + centro de massa + legenda, mostradores
// por faixa e as 4 dimensões. §8.06.6a acrescenta o IQL do líder e o
// card/seta de movimento (só equipe/cadeia). Folha e turnover NÃO estão
// aqui — são exclusivos da empresa (§11) e ficam no EmpresaDashboardClient.
//
// Módulo server-safe (sem 'use client'): o EmpresaDashboardClient chama
// `fmt` e usa CARD/LABEL no servidor. O único trecho com estado (o botão
// Legenda + modal) vive em `LegendaButton` (client).
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import Link from 'next/link';
import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import type { AggregateResult } from '../../../../../server/services/aggregationEngine';
import type { IqlLiderBloco, Movimento9Box } from '../../../../../server/services/companyAggregate';
import type { TurnoverPageData } from '../../../../../server/services/turnoverPanel';
import {
  NINE_BOX_GRID,
  colIndexFor,
  derivarSeta,
  faixaDesempenhoLabel,
  faixaPlenitudeLabel,
  formatPercent,
  formatPercentFrac,
  ociosidadeTier,
  rowIndexFor,
  type OciosidadeTier,
  type PosicaoX,
  type PosicaoY,
} from '../../../../dashboard-individual/[id]/internals';
import { LegendaButton } from './LegendaButton';

export const CARD: CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
};

export const LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: COLORS.text.tertiary,
};

const SU = COLORS.semantic.success;
const WA = COLORS.semantic.warning;
const DA = COLORS.semantic.danger;
const NEUTRO = COLORS.text.primary;

function numToStr(v: number | null): string | null {
  return v === null ? null : String(v);
}

export function fmt(v: number | null, dec: number): string {
  if (v === null) {
    return '—';
  }
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function corDesempenho(p: PosicaoX | null): string {
  if (p === 'alto') return SU;
  if (p === 'medio') return WA;
  if (p === 'baixo') return DA;
  return NEUTRO;
}

function corPlenitude(p: PosicaoY | null): string {
  if (p === 'alta') return SU;
  if (p === 'media') return WA;
  if (p === 'baixa') return DA;
  return NEUTRO;
}

function corOciosidade(tier: OciosidadeTier): string {
  if (tier === 'saudavel') return SU;
  if (tier === 'atencao') return WA;
  if (tier === 'critica') return DA;
  return NEUTRO;
}

function corAssiduidade(v: number | null): string {
  if (v === null) return NEUTRO;
  if (v >= 95) return SU;
  if (v >= 85) return WA;
  return DA;
}

// Faixas de cor do IQL (CAMADA_NEGOCIO §8.5): ate 65 vermelho, 66-75
// amarelo, acima de 75 verde. Vale para o geral e para as 4 dimensoes.
function corIql(v: number | null): string {
  if (v === null) return NEUTRO;
  if (v > 75) return SU;
  if (v > 65) return WA;
  return DA;
}

function Gauge(props: {
  readonly titulo: string;
  readonly arcValue: number | null;
  readonly texto: string;
  readonly cor: string;
  readonly faixa?: string;
}): JSX.Element {
  const v = props.arcValue === null ? 0 : Math.max(0, Math.min(100, props.arcValue));
  const L = Math.PI * 32;
  const off = L * (1 - v / 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ ...LABEL, textAlign: 'center', minHeight: 26 }}>{props.titulo}</span>
      <svg viewBox="0 0 80 46" width="100%" height="44" role="img">
        <path
          d="M8 42 A32 32 0 0 1 72 42"
          fill="none"
          stroke={COLORS.border.default}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <path
          d="M8 42 A32 32 0 0 1 72 42"
          fill="none"
          stroke={props.cor}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={L.toFixed(1)}
          strokeDashoffset={off.toFixed(1)}
        />
        <text x="40" y="40" textAnchor="middle" fontSize="15" fontWeight="700" fill={props.cor}>
          {props.texto}
        </text>
      </svg>
      {props.faixa !== undefined ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: props.cor, textAlign: 'center' }}>
          {props.faixa}
        </span>
      ) : null}
    </div>
  );
}

export function TrimestreNav(props: {
  readonly label: string | null;
  readonly anterior: string | null;
  readonly seguinte: string | null;
  readonly basePath: string;
}): JSX.Element {
  const { label, anterior, seguinte, basePath } = props;
  const pill: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: `1px solid ${COLORS.border.default}`,
    background: COLORS.background.card,
    fontSize: 13,
    color: COLORS.text.secondary,
    textDecoration: 'none',
  };
  const inativo: CSSProperties = { ...pill, color: COLORS.text.quaternary };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      {anterior !== null ? (
        <Link href={`${basePath}?trimestre=${anterior}`} style={pill}>
          ‹ Anterior
        </Link>
      ) : (
        <span style={inativo}>‹ Anterior</span>
      )}
      <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text.primary }}>
        {label ?? '—'}
      </span>
      {seguinte !== null ? (
        <Link href={`${basePath}?trimestre=${seguinte}`} style={pill}>
          Próximo ›
        </Link>
      ) : (
        <span style={inativo}>Próximo ›</span>
      )}
    </div>
  );
}

export function ColetivoCard(props: { readonly agg: AggregateResult }): JSX.Element {
  const { agg } = props;
  return (
    <div style={CARD}>
      <div style={LABEL}>Coletivo</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.text.primary, marginTop: 4 }}>
        {agg.headcount} colaboradores
      </div>
      <div style={{ fontSize: 13, color: COLORS.text.secondary, marginTop: 4 }}>
        Quadrante do centro de massa: {agg.centroMassa.quadrante ?? '—'}
      </div>
    </div>
  );
}

export function NineBoxColetivo(props: {
  readonly agg: AggregateResult;
  readonly movimento?: Movimento9Box | null;
}): JSX.Element {
  const { agg } = props;
  const cmRow = agg.centroMassa.posicaoY === null ? -1 : rowIndexFor(agg.centroMassa.posicaoY);
  const cmCol = agg.centroMassa.posicaoX === null ? -1 : colIndexFor(agg.centroMassa.posicaoX);
  const mv = props.movimento ?? null;
  const seta =
    mv !== null && mv.posicaoXAtual !== null && mv.posicaoYAtual !== null
      ? derivarSeta(mv.posicaoXAtual, mv.posicaoYAtual, mv.posicaoXAnterior, mv.posicaoYAnterior)
      : { char: '', color: '', label: '' };
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={LABEL}>9-Box — distribuição do coletivo</div>
        <LegendaButton />
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginTop: 12 }}>
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
                const centro = r === cmRow && c === cmCol;
                const n = agg.heatmap[r]![c]!;
                const mostraSeta = centro && seta.char.length > 0;
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
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      textAlign: 'center',
                      outline: centro ? `2px solid ${COLORS.text.primary}` : 'none',
                      outlineOffset: centro ? 1 : 0,
                      opacity: centro ? 1 : 0.7,
                    }}
                  >
                    <span style={{ fontSize: 22, fontWeight: 700 }}>{n}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}>
                      {cell.quadrante}
                    </span>
                    {mostraSeta ? (
                      <span style={{ fontSize: 16, fontWeight: 700, color: seta.color }}>
                        {seta.char}
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
    </div>
  );
}

export function MostradoresCard(props: {
  readonly agg: AggregateResult;
  readonly assiduidade: number | null;
}): JSX.Element {
  const { agg, assiduidade } = props;
  const px = agg.centroMassa.posicaoX;
  const py = agg.centroMassa.posicaoY;
  return (
    <div style={CARD}>
      <div style={{ ...LABEL, marginBottom: 8 }}>Eixos e presença</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Gauge
          titulo="Eixo X — Desempenho"
          arcValue={agg.indiceDesempenho === null ? null : agg.indiceDesempenho * 100}
          texto={formatPercentFrac(numToStr(agg.indiceDesempenho))}
          cor={corDesempenho(px)}
          faixa={faixaDesempenhoLabel(px)}
        />
        <Gauge
          titulo="Eixo Y — Plenitude"
          arcValue={agg.eixoY}
          texto={formatPercent(numToStr(agg.eixoY))}
          cor={corPlenitude(py)}
          faixa={faixaPlenitudeLabel(py)}
        />
        <Gauge
          titulo="Ociosidade média"
          arcValue={agg.ociosidade}
          texto={formatPercent(numToStr(agg.ociosidade))}
          cor={corOciosidade(ociosidadeTier(numToStr(agg.ociosidade)))}
        />
        <Gauge
          titulo="Assiduidade média"
          arcValue={assiduidade}
          texto={formatPercent(numToStr(assiduidade))}
          cor={corAssiduidade(assiduidade)}
        />
      </div>
    </div>
  );
}

export function DimensoesCard(props: { readonly agg: AggregateResult }): JSX.Element {
  return (
    <div style={CARD}>
      <div style={{ ...LABEL, marginBottom: 8 }}>Dimensões do Eixo Y</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {props.agg.dimensoes.map((d) => (
          <Gauge
            key={d.label}
            titulo={d.label}
            arcValue={d.score}
            texto={formatPercent(numToStr(d.score))}
            cor={corPlenitude(d.posicao)}
          />
        ))}
      </div>
    </div>
  );
}

export function TurnoverCard(props: { readonly turnover: TurnoverPageData | null }): JSX.Element {
  const t = props.turnover;
  const resumo = t?.resumo ?? null;
  const rolling = t?.rolling12m ?? null;
  const abs = (saidas: number, percentual: number): string => `${saidas} (${fmt(percentual, 1)}%)`;
  const item = (valor: string, rotulo: string): JSX.Element => (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text.primary }}>{valor}</div>
      <div style={{ ...LABEL, fontSize: 11 }}>{rotulo}</div>
    </div>
  );
  return (
    <div style={CARD}>
      <div style={{ ...LABEL, marginBottom: 10 }}>Turnover</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {item(resumo === null ? '—' : abs(resumo.total.saidas, resumo.total.percentual), 'Total')}
        {item(
          resumo === null ? '—' : abs(resumo.voluntario.saidas, resumo.voluntario.percentual),
          'Voluntário',
        )}
        {item(
          resumo === null ? '—' : abs(resumo.involuntario.saidas, resumo.involuntario.percentual),
          'Involuntário',
        )}
        {item(rolling === null ? '—' : `${fmt(rolling.percentual, 1)}%`, '12 meses')}
      </div>
    </div>
  );
}

export function IqlLiderCard(props: { readonly iqlLider: IqlLiderBloco }): JSX.Element {
  const q = props.iqlLider;
  const dims = [
    { label: 'Direcionamento e clareza', v: q.direcionamentoClareza },
    { label: 'Desenvolvimento e apoio', v: q.desenvolvimentoApoio },
    { label: 'Relacionamento e confiança', v: q.relacionamentoConfianca },
    { label: 'Gestão de resultados', v: q.gestaoResultados },
  ];
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text.primary }}>IQL</span>
        <span style={{ fontSize: 10.5, color: COLORS.text.tertiary }}>
          (Índice de Qualidade da Liderança)
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: corIql(q.iql) }}>{fmt(q.iql, 1)}</span>
        <span style={{ fontSize: 12, color: COLORS.text.tertiary }}>
          geral · {q.countRespondentes} respondentes
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          marginTop: 12,
        }}
      >
        {dims.map((d) => (
          <Gauge
            key={d.label}
            titulo={d.label}
            arcValue={d.v}
            texto={fmt(d.v, 1)}
            cor={corIql(d.v)}
          />
        ))}
      </div>
    </div>
  );
}

function sinal(v: number | null): string {
  if (v === null) {
    return '—';
  }
  const s = v > 0 ? '+' : '';
  return `${s}${fmt(v, 1)}`;
}

export function Movimento9BoxCard(props: { readonly movimento: Movimento9Box }): JSX.Element {
  const m = props.movimento;
  const semBase = m.trimestreAnterior === null;
  const seta =
    !semBase && m.posicaoXAtual !== null && m.posicaoYAtual !== null
      ? derivarSeta(m.posicaoXAtual, m.posicaoYAtual, m.posicaoXAnterior, m.posicaoYAnterior)
      : { char: '', color: '', label: '' };
  let veredito: string;
  let setaGrande: string;
  let cor: string;
  if (semBase) {
    veredito = 'Sem base anterior';
    setaGrande = '•';
    cor = COLORS.text.tertiary;
  } else if (seta.char.length === 0) {
    veredito = 'Manteve';
    setaGrande = '=';
    cor = NEUTRO;
  } else {
    veredito = seta.label;
    setaGrande = seta.char;
    cor = seta.color;
  }
  // Frase de transição no sentido do movimento: de onde veio -> para
  // onde está (anterior -> atual). §8.06.6a.
  let frase: string;
  if (m.quadranteAtual === null) {
    frase = '—';
  } else if (m.quadranteAnterior !== null) {
    frase = `${m.quadranteAnterior} → ${m.quadranteAtual}`;
  } else {
    frase = m.quadranteAtual;
  }
  return (
    <div style={CARD}>
      <div style={{ ...LABEL, marginBottom: 8 }}>Movimento no 9-Box</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{veredito}</div>
          <div style={{ fontSize: 14, color: COLORS.text.secondary, marginTop: 4 }}>{frase}</div>
        </div>
        <span style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, color: cor }}>
          {setaGrande}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 40, marginTop: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...LABEL, fontSize: 11 }}>Δ Desempenho</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text.primary, marginTop: 4 }}>
            {sinal(m.deltaX)}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...LABEL, fontSize: 11 }}>Δ Plenitude</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text.primary, marginTop: 4 }}>
            {sinal(m.deltaY)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MensagemVazio(): JSX.Element {
  return (
    <div style={CARD}>
      <span style={{ fontSize: 13, color: COLORS.text.secondary }}>
        Nenhum trimestre fechado ainda. O dashboard agregado abre quando o primeiro trimestre fecha.
      </span>
    </div>
  );
}

export function MensagemPiso(props: { readonly headcount: number }): JSX.Element {
  const { headcount } = props;
  return (
    <div style={CARD}>
      <span style={{ fontSize: 13, color: COLORS.text.secondary }}>
        Amostra insuficiente no trimestre ({headcount} classificado
        {headcount === 1 ? '' : 's'}). O agregado exige ao menos 2 colaboradores.
      </span>
    </div>
  );
}
