// ROIP APP 9BOX — dashboard agregado da empresa (ESPEC §7 empresa + §10
// + §11 + §14.25). Reaproveita a linguagem do individual (§10.7): 9-Box
// colorido com rotulos de quadrante (NINE_BOX_GRID), agora com contagem
// por celula e centro de massa destacado (§10.3). Eixos, ociosidade,
// assiduidade e as 4 dimensoes do Eixo Y aparecem como mostradores
// coloridos por faixa (semaforo). Financeiro: folha media, faturamento
// medio e ROI = faturamento / folha (§11.1). Turnover integrado (§11.2).
// Sem Chat IA e sem Dialogos (§10.6). Componente de apresentacao.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import Link from 'next/link';
import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import type { AggregateResult } from '../../../../../server/services/aggregationEngine';
import type { CompanyAggregatePage } from '../../../../../server/services/companyAggregate';
import {
  NINE_BOX_GRID,
  colIndexFor,
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

export interface EmpresaDashboardClientProps {
  readonly data: CompanyAggregatePage;
  readonly basePath: string;
}

const CARD: CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
};

const LABEL: CSSProperties = {
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

function fmt(v: number | null, dec: number): string {
  if (v === null) {
    return '—';
  }
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function brl(v: number | null): string {
  if (v === null) {
    return '—';
  }
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
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

function TrimestreNav(props: {
  readonly data: CompanyAggregatePage;
  readonly basePath: string;
}): JSX.Element {
  const { data, basePath } = props;
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
      {data.trimestreAnterior !== null ? (
        <Link href={`${basePath}?trimestre=${data.trimestreAnterior}`} style={pill}>
          ‹ Anterior
        </Link>
      ) : (
        <span style={inativo}>‹ Anterior</span>
      )}
      <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text.primary }}>
        {data.label ?? '—'}
      </span>
      {data.trimestreSeguinte !== null ? (
        <Link href={`${basePath}?trimestre=${data.trimestreSeguinte}`} style={pill}>
          Próximo ›
        </Link>
      ) : (
        <span style={inativo}>Próximo ›</span>
      )}
    </div>
  );
}

function NineBoxColetivo(props: { readonly agg: AggregateResult }): JSX.Element {
  const { agg } = props;
  const cmRow = agg.centroMassa.posicaoY === null ? -1 : rowIndexFor(agg.centroMassa.posicaoY);
  const cmCol = agg.centroMassa.posicaoX === null ? -1 : colIndexFor(agg.centroMassa.posicaoX);
  return (
    <div style={CARD}>
      <div style={LABEL}>9-Box — distribuição do coletivo</div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span
            style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              ...LABEL,
              fontSize: 11,
            }}
          >
            Plenitude ↑
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {NINE_BOX_GRID.map((row, r) =>
              row.map((cell, c) => {
                const centro = r === cmRow && c === cmCol;
                const n = agg.heatmap[r]![c]!;
                return (
                  <div
                    key={cell.quadrante}
                    style={{
                      background: cell.bg,
                      color: cell.text,
                      borderRadius: 10,
                      minHeight: 88,
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      textAlign: 'center',
                      outline: centro ? `2px solid ${COLORS.text.primary}` : 'none',
                      outlineOffset: centro ? 1 : 0,
                      opacity: centro ? 1 : 0.75,
                    }}
                  >
                    <span style={{ fontSize: 22, fontWeight: 700 }}>{n}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}>
                      {cell.quadrante}
                    </span>
                  </div>
                );
              }),
            )}
          </div>
          <div style={{ textAlign: 'center', ...LABEL, marginTop: 8, fontSize: 11 }}>
            Desempenho →
          </div>
        </div>
      </div>
    </div>
  );
}

function FinanceiroCard(props: { readonly data: CompanyAggregatePage }): JSX.Element {
  const f = props.data.financeiro;
  const item = (titulo: string, valor: string): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, color: COLORS.text.tertiary }}>{titulo}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.text.primary }}>{valor}</span>
    </div>
  );
  return (
    <div style={CARD}>
      <div style={LABEL}>Dados financeiros</div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}
      >
        {item('ROI', f?.roi == null ? '—' : `${fmt(f.roi, 2)}×`)}
        {item('Folha média mensal', brl(f?.folhaMedia ?? null))}
        {item('Faturamento médio', brl(f?.faturamentoMedio ?? null))}
      </div>
    </div>
  );
}

function MostradoresCard(props: {
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

function DimensoesCard(props: { readonly agg: AggregateResult }): JSX.Element {
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

function TurnoverCard(props: { readonly data: CompanyAggregatePage }): JSX.Element {
  const t = props.data.turnover;
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

export function EmpresaDashboardClient(props: EmpresaDashboardClientProps): JSX.Element {
  const { data, basePath } = props;
  if (data.trimestre === null || data.aggregate === null) {
    return (
      <div style={CARD}>
        <span style={{ fontSize: 13, color: COLORS.text.secondary }}>
          Nenhum trimestre fechado ainda. O dashboard agregado abre quando o primeiro trimestre
          fecha.
        </span>
      </div>
    );
  }
  const agg = data.aggregate;
  if (agg.abaixoDoPiso) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TrimestreNav data={data} basePath={basePath} />
        <div style={CARD}>
          <span style={{ fontSize: 13, color: COLORS.text.secondary }}>
            Amostra insuficiente no trimestre ({agg.headcount} classificado
            {agg.headcount === 1 ? '' : 's'}). O agregado exige ao menos 2 colaboradores.
          </span>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TrimestreNav data={data} basePath={basePath} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={CARD}>
            <div style={LABEL}>Coletivo</div>
            <div
              style={{ fontSize: 26, fontWeight: 700, color: COLORS.text.primary, marginTop: 4 }}
            >
              {agg.headcount} colaboradores
            </div>
            <div style={{ fontSize: 13, color: COLORS.text.secondary, marginTop: 4 }}>
              Quadrante do centro de massa: {agg.centroMassa.quadrante ?? '—'}
            </div>
          </div>
          <NineBoxColetivo agg={agg} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FinanceiroCard data={data} />
          <MostradoresCard agg={agg} assiduidade={data.assiduidade} />
          <DimensoesCard agg={agg} />
          <TurnoverCard data={data} />
        </div>
      </div>
    </div>
  );
}
