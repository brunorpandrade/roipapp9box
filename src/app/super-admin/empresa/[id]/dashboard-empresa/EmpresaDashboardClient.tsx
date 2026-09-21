// ROIP APP 9BOX — dashboard agregado da empresa (ESPEC §7 empresa + §10
// + §14.25). Reaproveita a linguagem visual do dashboard individual, mas
// substitui a bolha unica do 9-Box pelo heatmap 3x3 (contagem por celula)
// com o centro de massa do coletivo, e troca os multiplos financeiros
// pela razao dos brutos. Sem Chat IA e sem Dialogos (§10.6). Componente
// de apresentacao (sem estado); navegacao por trimestre via Link.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import Link from 'next/link';
import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import type { CompanyAggregatePage } from '../../../../../server/services/companyAggregate';
import type { AggregateResult } from '../../../../../server/services/aggregationEngine';

export interface EmpresaDashboardClientProps {
  readonly data: CompanyAggregatePage;
  readonly basePath: string;
}

const CARD: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 16,
  borderRadius: 10,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
};

const ROTULO: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: COLORS.text.tertiary,
};

const VALOR: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: COLORS.text.primary,
};

const LINHA_X: readonly string[] = ['Baixo', 'Médio', 'Alto'];
const LINHA_Y: readonly string[] = ['Alta', 'Média', 'Baixa'];
const IDX_X: Readonly<Record<string, number>> = { baixo: 0, medio: 1, alto: 2 };
const IDX_Y: Readonly<Record<string, number>> = { alta: 0, media: 1, baixa: 2 };

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

function Indicador(props: {
  readonly titulo: string;
  readonly valor: string;
  readonly sub?: string;
}): JSX.Element {
  return (
    <div style={CARD}>
      <span style={ROTULO}>{props.titulo}</span>
      <span style={VALOR}>{props.valor}</span>
      {props.sub !== undefined ? (
        <span style={{ fontSize: 12, color: COLORS.text.secondary }}>{props.sub}</span>
      ) : null}
    </div>
  );
}

function Heatmap(props: { readonly agg: AggregateResult }): JSX.Element {
  const { agg } = props;
  const cmX = agg.centroMassa.posicaoX === null ? -1 : (IDX_X[agg.centroMassa.posicaoX] ?? -1);
  const cmY = agg.centroMassa.posicaoY === null ? -1 : (IDX_Y[agg.centroMassa.posicaoY] ?? -1);
  return (
    <div style={CARD}>
      <span style={ROTULO}>9-Box — distribuição do coletivo</span>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-around',
            fontSize: 11,
            color: COLORS.text.tertiary,
          }}
        >
          {LINHA_Y.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {agg.heatmap.map((linha, row) =>
              linha.map((n, col) => {
                const centro = row === cmY && col === cmX;
                return (
                  <div
                    key={`${row}-${col}`}
                    style={{
                      aspectRatio: '1 / 1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      fontSize: 18,
                      fontWeight: 700,
                      color: n > 0 ? COLORS.text.primary : COLORS.text.quaternary,
                      background: COLORS.background.elevated,
                      border: centro
                        ? `2px solid ${COLORS.accent.teal}`
                        : `1px solid ${COLORS.border.default}`,
                    }}
                  >
                    {n}
                  </div>
                );
              }),
            )}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              marginTop: 4,
              fontSize: 11,
              color: COLORS.text.tertiary,
              textAlign: 'center',
            }}
          >
            {LINHA_X.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
      </div>
      <span style={{ fontSize: 12, color: COLORS.text.secondary, marginTop: 8 }}>
        Centro de massa: desempenho {fmt(agg.centroMassa.x, 1)} · plenitude{' '}
        {fmt(agg.centroMassa.y, 1)}
        {agg.centroMassa.quadrante !== null ? ` — ${agg.centroMassa.quadrante}` : ''}
      </span>
    </div>
  );
}

function TrimestreNav(props: {
  readonly data: CompanyAggregatePage;
  readonly basePath: string;
}): JSX.Element {
  const { data, basePath } = props;
  const link = (tri: string | null, txt: string): JSX.Element => {
    if (tri === null) {
      return <span style={{ color: COLORS.text.quaternary, fontSize: 13 }}>{txt}</span>;
    }
    return (
      <Link
        href={`${basePath}?trimestre=${tri}`}
        style={{ color: COLORS.accent.teal, fontSize: 13 }}
      >
        {txt}
      </Link>
    );
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {link(data.trimestreAnterior, '← Anterior')}
      <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text.primary }}>
        {data.label ?? '—'}
      </span>
      {link(data.trimestreSeguinte, 'Seguinte →')}
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <Indicador titulo="Colaboradores" valor={String(agg.headcount)} />
        <Indicador titulo="Desempenho (score)" valor={fmt(agg.desempenhoScore, 1)} />
        <Indicador titulo="Índice de desempenho" valor={fmt(agg.indiceDesempenho, 2)} />
        <Indicador titulo="Ociosidade média" valor={pct(agg.ociosidade)} />
        <Indicador titulo="Plenitude" valor={fmt(agg.eixoY, 1)} />
        <Indicador
          titulo="ROI"
          valor={agg.roi === null ? '—' : `${fmt(agg.roi, 2)}×`}
          sub={`Retorno ${brl(agg.retornoTotal)} · Custo ${brl(agg.custoTotal)}`}
        />
      </div>
      <Heatmap agg={agg} />
      <div style={CARD}>
        <span style={ROTULO}>Plenitude por dimensão (A / C)</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {agg.dimensoes.map((d) => (
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
    </div>
  );
}
