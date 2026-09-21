// ROIP APP 9BOX — dashboard agregado da empresa (ESPEC §7 empresa + §10
// + §14.25). Reaproveita o LAYOUT do dashboard individual (§10.7): mesma
// grade de duas colunas, o mesmo 9-Box colorido com os rotulos de
// quadrante (NINE_BOX_GRID) e os mesmos cards de Eixo X/Y e financeiro.
// A unica diferenca do coletivo (§10.3): o 9-Box mostra a contagem por
// celula (heatmap) com o centro de massa destacado, no lugar da bolha
// unica; e o financeiro traz a razao dos brutos (§10.8). Sem Chat IA e
// sem Dialogos (§10.6). Componente de apresentacao (sem estado).
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
  rowIndexFor,
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

const FAIXA_X: Readonly<Record<PosicaoX, string>> = {
  alto: 'Alto desempenho',
  medio: 'Médio desempenho',
  baixo: 'Baixo desempenho',
};

const FAIXA_Y: Readonly<Record<PosicaoY, string>> = {
  alta: 'Alta plenitude',
  media: 'Média plenitude',
  baixa: 'Baixa plenitude',
};

function fmt(v: number | null, dec: number): string {
  if (v === null) {
    return '—';
  }
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function pct(v: number | null): string {
  return v === null ? '—' : `${fmt(v, 1)}%`;
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              ...LABEL,
              fontSize: 10,
            }}
          >
            PLENITUDE ↑
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
                      minHeight: 96,
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
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.03em' }}>
                      {cell.quadrante}
                    </span>
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
      <div style={{ fontSize: 12, color: COLORS.text.secondary, marginTop: 12 }}>
        Centro de massa: desempenho {fmt(agg.centroMassa.x, 1)} · plenitude{' '}
        {fmt(agg.centroMassa.y, 1)}
        {agg.centroMassa.quadrante !== null ? ` — ${agg.centroMassa.quadrante}` : ''}
      </div>
    </div>
  );
}

function EixosCard(props: { readonly agg: AggregateResult }): JSX.Element {
  const { agg } = props;
  const faixaX = agg.centroMassa.posicaoX === null ? '—' : FAIXA_X[agg.centroMassa.posicaoX];
  const faixaY = agg.centroMassa.posicaoY === null ? '—' : FAIXA_Y[agg.centroMassa.posicaoY];
  const item = (titulo: string, valor: string, faixa: string): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={LABEL}>{titulo}</span>
      <span style={{ fontSize: 26, fontWeight: 700, color: COLORS.text.primary }}>{valor}</span>
      <span style={{ fontSize: 12, color: COLORS.text.secondary }}>{faixa}</span>
    </div>
  );
  return (
    <div style={CARD}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {item('Eixo X — Desempenho', fmt(agg.desempenhoScore, 1), faixaX)}
        {item('Eixo Y — Plenitude', fmt(agg.eixoY, 1), faixaY)}
        {item('Ociosidade média', pct(agg.ociosidade), `Índice ${fmt(agg.indiceDesempenho, 2)}`)}
      </div>
    </div>
  );
}

function FinanceiroCard(props: { readonly agg: AggregateResult }): JSX.Element {
  const { agg } = props;
  const item = (titulo: string, valor: string): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 13, color: COLORS.text.tertiary }}>{titulo}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: COLORS.text.primary }}>{valor}</span>
    </div>
  );
  return (
    <div style={CARD}>
      <div style={LABEL}>Dados financeiros — razão dos brutos</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginTop: 12,
        }}
      >
        {item('ROI', agg.roi === null ? '—' : `${fmt(agg.roi, 2)}×`)}
        {item('Retorno estimado', brl(agg.retornoTotal))}
        {item('Custo do trimestre', brl(agg.custoTotal))}
      </div>
    </div>
  );
}

function DimensoesCard(props: { readonly agg: AggregateResult }): JSX.Element {
  return (
    <div style={CARD}>
      <div style={LABEL}>Plenitude por dimensão (A / C)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {props.agg.dimensoes.map((d) => (
          <div
            key={d.label}
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
          >
            <span style={{ color: COLORS.text.secondary }}>{d.label}</span>
            <span style={{ color: COLORS.text.primary }}>
              {fmt(d.a, 1)} / {fmt(d.c, 1)}
            </span>
          </div>
        ))}
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
          <EixosCard agg={agg} />
          <FinanceiroCard agg={agg} />
          <DimensoesCard agg={agg} />
        </div>
      </div>
    </div>
  );
}
