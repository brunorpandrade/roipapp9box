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
import { zonaFolhaPercentual, type ZonaFolha } from '../../../../../lib/folhaFaturamento';
import type { StatusDiagnostico } from '../../../../../lib/roiFormulas';
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

// §11.1 + DOC 02 §3.3 — rótulos e cor do status do diagnóstico econômico
// (superfície DOC 05): excelente/muito bom em verde, aceitável em amarelo,
// crítico em vermelho, sem referência em neutro.
const STATUS_LABEL: Record<StatusDiagnostico, string> = {
  excelente: 'Excelente',
  muito_bom: 'Muito bom',
  aceitavel: 'Aceitável',
  critico: 'Crítico',
  sem_referencia: 'Sem referência',
};

const STATUS_COLOR: Record<StatusDiagnostico, string> = {
  excelente: COLORS.semantic.success,
  muito_bom: COLORS.semantic.success,
  aceitavel: COLORS.semantic.warning,
  critico: COLORS.semantic.danger,
  sem_referencia: COLORS.text.tertiary,
};

// §11.1 — zona de cor da % folha sobre faturamento.
const ZONA_COLOR: Record<ZonaFolha, string> = {
  verde: COLORS.semantic.success,
  amarelo: COLORS.semantic.warning,
  vermelho: COLORS.semantic.danger,
  neutro: COLORS.text.primary,
};

function FinanceiroCard(props: { readonly data: CompanyAggregatePage }): JSX.Element {
  const f = props.data.financeiro;
  const item = (
    titulo: string,
    valor: string,
    opts?: { readonly color?: string; readonly subtexto?: string },
  ): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, color: COLORS.text.tertiary }}>{titulo}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: opts?.color ?? COLORS.text.primary }}>
        {valor}
      </span>
      {opts?.subtexto !== undefined && (
        <span style={{ fontSize: 11, color: COLORS.text.quaternary }}>{opts.subtexto}</span>
      )}
    </div>
  );
  const pct = f?.folhaPorcentagem ?? null;
  const zona = zonaFolhaPercentual(pct, f?.folhaPercMaxima ?? null);
  const min = f?.folhaPercMinima ?? null;
  const max = f?.folhaPercMaxima ?? null;
  const faixa = min !== null && max !== null ? `faixa ${fmt(min, 1)} a ${fmt(max, 1)}%` : undefined;
  const status = f?.statusDiagnostico ?? null;
  return (
    <div style={CARD}>
      <div style={LABEL}>Dados financeiros</div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}
      >
        {item('ROI', f?.roi == null ? '—' : `${fmt(f.roi, 2)}×`)}
        {item('Folha média mensal', brl(f?.folhaMedia ?? null), {
          subtexto: 'inclui alta liderança',
        })}
        {item('Faturamento médio', brl(f?.faturamentoMedio ?? null))}
        {item('% folha / faturamento', pct === null ? '—' : `${fmt(pct, 1)}%`, {
          color: ZONA_COLOR[zona],
          subtexto: faixa,
        })}
        {item('Status diagnóstico econômico', status === null ? '—' : STATUS_LABEL[status], {
          color: status === null ? undefined : STATUS_COLOR[status],
        })}
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
