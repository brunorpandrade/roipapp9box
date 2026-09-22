// ROIP APP 9BOX — dashboard agregado da empresa (ESPEC §7 empresa + §10
// + §11 + §14.25). Reaproveita as peças comuns dos agregados (_agregado/
// shared): navegação de trimestre, coletivo, 9-Box, mostradores e
// dimensões. Acrescenta os cards exclusivos da empresa (§11): financeiro
// (folha, faturamento, ROI = faturamento / folha) e turnover. Sem Chat
// IA e sem Diálogos (§10.6). Componente de apresentação.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import type { JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import type { CompanyAggregatePage } from '../../../../../server/services/companyAggregate';
import {
  CARD,
  ColetivoCard,
  DimensoesCard,
  LABEL,
  MensagemPiso,
  MensagemVazio,
  MostradoresCard,
  NineBoxColetivo,
  TrimestreNav,
  TurnoverCard,
  fmt,
} from '../_agregado/shared';

export interface EmpresaDashboardClientProps {
  readonly data: CompanyAggregatePage;
  readonly basePath: string;
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

export function EmpresaDashboardClient(props: EmpresaDashboardClientProps): JSX.Element {
  const { data, basePath } = props;
  if (data.trimestre === null || data.aggregate === null) {
    return <MensagemVazio />;
  }
  const agg = data.aggregate;
  const nav = (
    <TrimestreNav
      label={data.label}
      anterior={data.trimestreAnterior}
      seguinte={data.trimestreSeguinte}
      basePath={basePath}
    />
  );
  if (agg.abaixoDoPiso) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {nav}
        <MensagemPiso headcount={agg.headcount} />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {nav}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ColetivoCard agg={agg} />
          <NineBoxColetivo agg={agg} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FinanceiroCard data={data} />
          <MostradoresCard agg={agg} assiduidade={data.assiduidade} />
          <DimensoesCard agg={agg} />
          <TurnoverCard turnover={data.turnover} />
        </div>
      </div>
    </div>
  );
}
