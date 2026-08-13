'use client';

// ROIP APP 9BOX — client component canonico da rota Bruno
// `/super-admin/empresa/[id]` (landing §5.4, ME-074).
//
// Renderiza o corpo canonico bit-exact abaixo do Layout: cabecalho da
// empresa (logo + nome + badge status + botao [Dados cadastrais]) +
// aviso amarelo condicional §5.7 CAMADA_NEGOCIO + 8 cards de indicadores
// clicaveis §5.4 + miniatura kanban §21.3 + bloco de 6 acoes §5.4 +
// zonas placeholder §5.9-§5.10.
//
// Client component canonico apenas pela interatividade dos cards e da
// miniatura kanban (Link do Next 15 precisa arvore de renderizacao
// client para prefetch). Sem estado local — 100% renderizacao a partir
// das props passadas pelo server component.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.
// **RV-13 canonica.** Componente e chamador real de todos os imports.

import Link from 'next/link';
import type { JSX } from 'react';

import { COLORS } from '../../../../lib/design-tokens/colors';

import type {
  CompanyLandingInfo,
  DepartmentCount,
  LandingCounts,
  LandingOnboardingSummary,
  MesAtualClosureStatus,
} from './internals';
import { formatFaturamentoMedio, formatTrimestre } from './internals';

// -----------------------------------------------------------------------
// Props canonicas bit-exact
// -----------------------------------------------------------------------

export interface CompanyLandingClientProps {
  readonly company: CompanyLandingInfo;
  readonly counts: LandingCounts;
  readonly departmentCounts: readonly DepartmentCount[];
  readonly onboardingSummary: LandingOnboardingSummary;
  readonly lastQuarter: string | null;
  readonly lastQuarterFaturamentoMedio: number | null;
  readonly mesAtualClosure: MesAtualClosureStatus;
}

// -----------------------------------------------------------------------
// Constantes canonicas
// -----------------------------------------------------------------------

/** Texto canonico bit-exact do aviso amarelo §5.4 + §5.7 CAMADA_NEGOCIO. */
export const AVISO_SEM_RF_TEXTO =
  '⚠ Empresa sem Responsável financeiro atribuído. Nomeie um antes do primeiro fechamento mensal.';

/**
 * Nota canonica bit-exact do toggle status read-only na v1 (ME-074).
 * Remove dependencia forcada de `company.setStatus` que so nascera na
 * ME-075 (D086). Alinhado bit-exact com decisao D091 canonica bit-exact
 * ME-074.
 */
export const NOTA_TOGGLE_READ_ONLY = 'Alteração disponível a partir da tela de Parâmetros.';

/**
 * Texto canonico bit-exact do placeholder ROI global §5.4 card 3 —
 * disponivel a partir da Fase 2, conforme §5.4 + Master §3.1.
 */
export const NOTA_ROI_GLOBAL_PLACEHOLDER = 'Disponível a partir do primeiro trimestre calculado.';

/**
 * Texto canonico bit-exact da zona 9-Box §5.9 no perfil
 * `super_admin_in_company` (idem RH — Bruno ve empresa inteira).
 */
export const ZONA_9BOX_TEXTO =
  'Disponível a partir da Fase 3. Esta zona se tornará o ponto de entrada ' +
  'do dashboard global da empresa.';

// -----------------------------------------------------------------------
// Fragmentos canonicos de UI
// -----------------------------------------------------------------------

function CompanyHeader(props: { readonly company: CompanyLandingInfo }): JSX.Element {
  const { company } = props;
  const isAtiva = company.status === 'ativa';
  return (
    <section
      aria-label="Cabeçalho da empresa"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        background: COLORS.background.card,
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        marginBottom: 16,
      }}
    >
      {company.logoUrl !== null ? (
        <img
          src={company.logoUrl}
          alt={`Logo ${company.nomeFantasia}`}
          width={48}
          height={48}
          style={{ borderRadius: 6, objectFit: 'contain' }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: 6,
            background: COLORS.background.elevated,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 700,
            color: COLORS.text.tertiary,
          }}
        >
          {company.nomeFantasia.slice(0, 1)}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: COLORS.text.primary,
            margin: 0,
          }}
        >
          {company.nomeFantasia}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              color: isAtiva ? COLORS.badge.successText : COLORS.text.tertiary,
              background: isAtiva ? COLORS.badge.successBg : COLORS.border.default,
            }}
          >
            {isAtiva ? 'Ativa' : 'Inativa'}
          </span>
          {company.isDemo ? (
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#FFFFFF',
                background: COLORS.primary.navy,
              }}
            >
              DEMO
            </span>
          ) : null}
        </div>
      </div>
      <Link
        href={`/super-admin/empresa/${company.id}/parametros`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '8px 16px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          color: COLORS.primary.navy,
          background: COLORS.background.card,
          border: `1px solid ${COLORS.primary.navy}`,
          textDecoration: 'none',
        }}
      >
        Dados cadastrais
      </Link>
    </section>
  );
}

function AvisoSemRfBanner(): JSX.Element {
  return (
    <section
      role="alert"
      aria-label="Aviso: empresa sem Responsável financeiro"
      style={{
        padding: '12px 16px',
        background: COLORS.badge.warningBg,
        color: COLORS.badge.warningText,
        border: `1px solid ${COLORS.semantic.warning}`,
        borderRadius: 6,
        marginBottom: 16,
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {AVISO_SEM_RF_TEXTO}
    </section>
  );
}

function ClickableIndicatorCard(props: {
  readonly title: string;
  readonly value: string;
  readonly sub?: string;
  readonly href?: string;
  readonly ariaLabel?: string;
}): JSX.Element {
  const { title, value, sub, href, ariaLabel } = props;
  const cardStyle = {
    background: COLORS.background.card,
    border: `1px solid ${COLORS.border.default}`,
    borderRadius: 8,
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    textDecoration: 'none',
    color: 'inherit',
  };
  const body = (
    <>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
        }}
      >
        {title}
      </span>
      <span
        style={{
          // ME-080a — fontSize responsivo + overflowWrap para valores
          // longos (ex.: "R$ 999.999,00") em cards com largura mínima
          // via `minmax(180px,1fr)`. clamp evita overflow do card.
          fontSize: 'clamp(16px, 3.2vw, 24px)',
          fontWeight: 700,
          color: COLORS.text.primary,
          overflowWrap: 'anywhere',
          lineHeight: 1.15,
        }}
      >
        {value}
      </span>
      {sub !== undefined ? (
        <span style={{ fontSize: 12, color: COLORS.text.secondary }}>{sub}</span>
      ) : null}
    </>
  );
  if (href === undefined) {
    return <div style={cardStyle}>{body}</div>;
  }
  return (
    <Link href={href} style={cardStyle} aria-label={ariaLabel ?? title}>
      {body}
    </Link>
  );
}

function OnboardingKanbanMini(props: {
  readonly companyId: number;
  readonly summary: LandingOnboardingSummary;
}): JSX.Element {
  const { companyId, summary } = props;
  const columns: readonly {
    readonly key: keyof LandingOnboardingSummary;
    readonly label: string;
    readonly color: string;
  }[] = [
    { key: 'treinar', label: 'Treinar', color: COLORS.semantic.danger },
    { key: 'em_treinamento', label: 'Em treinamento', color: COLORS.semantic.warning },
    { key: 'treinado', label: 'Treinado', color: COLORS.semantic.success },
    { key: 'reciclagem', label: 'Reciclagem', color: COLORS.primary.navy },
  ];
  return (
    <Link
      href={`/super-admin/empresa/${companyId}/onboarding-lideres`}
      aria-label="Abrir kanban de onboarding de líderes"
      style={{
        display: 'block',
        background: COLORS.background.card,
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        padding: '16px 20px',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <h2
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
          margin: '0 0 12px 0',
        }}
      >
        Onboarding de líderes
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            style={{
              padding: '10px 8px',
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              borderTop: `3px solid ${col.color}`,
              background: COLORS.background.elevated,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: COLORS.text.tertiary,
              }}
            >
              {col.label}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary }}>
              {summary[col.key]}
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function AcoesBlock(props: {
  readonly companyId: number;
  readonly status: 'ativa' | 'inativa';
}): JSX.Element {
  const { companyId, status } = props;
  const buttonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 16px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    color: '#FFFFFF',
    background: COLORS.primary.navy,
    textDecoration: 'none',
  };
  return (
    <section
      aria-label="Ações da empresa"
      style={{
        background: COLORS.background.card,
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        padding: '16px 20px',
        marginTop: 16,
      }}
    >
      <h2
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
          margin: '0 0 12px 0',
        }}
      >
        Ações
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Link href="/painel-rh" style={buttonStyle}>
          Painel de controle do RH
        </Link>
        <Link href={`/super-admin/empresa/${companyId}/clevel-rh`} style={buttonStyle}>
          C-level
        </Link>
        <Link href={`/super-admin/empresa/${companyId}/clevel-rh?tab=rh`} style={buttonStyle}>
          RH
        </Link>
        <Link href={`/super-admin/empresa/${companyId}/dados-mensais`} style={buttonStyle}>
          Dados mensais
        </Link>
        <Link href={`/super-admin/empresa/${companyId}/organograma`} style={buttonStyle}>
          Organograma
        </Link>
      </div>
      <div
        style={{
          marginTop: 16,
          padding: '10px 12px',
          background: COLORS.background.elevated,
          border: `1px solid ${COLORS.border.default}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.text.secondary,
            }}
          >
            Status da empresa
          </span>
          <span style={{ fontSize: 11, color: COLORS.text.tertiary }}>{NOTA_TOGGLE_READ_ONLY}</span>
        </div>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 700,
            color: status === 'ativa' ? COLORS.badge.successText : COLORS.text.tertiary,
            background: status === 'ativa' ? COLORS.badge.successBg : COLORS.border.default,
          }}
        >
          {status === 'ativa' ? 'Ativa' : 'Inativa'}
        </span>
      </div>
    </section>
  );
}

function ZonaPlaceholder(props: { readonly title: string; readonly texto: string }): JSX.Element {
  return (
    <div
      style={{
        background: COLORS.background.card,
        border: `1px dashed ${COLORS.border.default}`,
        borderRadius: 8,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <h2
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
          margin: 0,
        }}
      >
        {props.title}
      </h2>
      <p
        style={{
          fontSize: 13,
          color: COLORS.text.secondary,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {props.texto}
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------
// Componente canonico principal
// -----------------------------------------------------------------------

export function CompanyLandingClient(props: CompanyLandingClientProps): JSX.Element {
  const {
    company,
    counts,
    departmentCounts,
    onboardingSummary,
    lastQuarter,
    lastQuarterFaturamentoMedio,
    mesAtualClosure,
  } = props;

  const totalColaboradoresHref = `/super-admin/empresa/${company.id}/todos-os-colaboradores`;

  const rhSub = mesAtualClosure.rhPreenchido
    ? `Preenchido (limite ${mesAtualClosure.dataLimiteRh})`
    : `Pendente (limite ${mesAtualClosure.dataLimiteRh})`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <CompanyHeader company={company} />

      {counts.hasResponsavelFinanceiro ? null : <AvisoSemRfBanner />}

      <section
        aria-label="Indicadores da empresa"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <ClickableIndicatorCard
          title="Colaboradores ativos"
          value={String(counts.totalColaboradoresAtivos)}
          sub="Total"
          href={totalColaboradoresHref}
          ariaLabel="Ver todos os colaboradores ativos"
        />
        <ClickableIndicatorCard title="ROI global" value="—" sub={NOTA_ROI_GLOBAL_PLACEHOLDER} />
        <ClickableIndicatorCard
          title="Faturamento médio mensal"
          value={formatFaturamentoMedio(lastQuarterFaturamentoMedio)}
          sub={
            lastQuarter === null ? undefined : `Último trimestre: ${formatTrimestre(lastQuarter)}`
          }
        />
        <ClickableIndicatorCard
          title="C-levels ativos"
          value={String(counts.totalCLevelsAtivos)}
          href={`/super-admin/empresa/${company.id}/clevel-rh`}
          ariaLabel="Abrir gestão de C-levels"
        />
        <ClickableIndicatorCard
          title="Último trimestre calculado"
          value={formatTrimestre(lastQuarter)}
        />
        <ClickableIndicatorCard
          title="Dados do mês — RH"
          value={mesAtualClosure.rhPreenchido ? 'Preenchido' : 'Pendente'}
          sub={rhSub}
          href={`/super-admin/empresa/${company.id}/dados-mensais`}
          ariaLabel="Abrir dados mensais RH"
        />
        <ClickableIndicatorCard
          title="Dados do mês — Líderes"
          value="Coleta de dados em andamento"
          sub={`Mês ${mesAtualClosure.mesAtual}`}
          href={`/super-admin/empresa/${company.id}/dados-mensais?tab=lider`}
          ariaLabel="Abrir dados mensais de líderes"
        />
      </section>

      {departmentCounts.length > 0 ? (
        <section
          aria-label="Colaboradores por departamento"
          style={{
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: COLORS.text.tertiary,
              margin: '0 0 8px 0',
            }}
          >
            Colaboradores por departamento
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 8,
            }}
          >
            {departmentCounts.map((d) => (
              <ClickableIndicatorCard
                key={d.departamento}
                title={d.departamento}
                value={String(d.total)}
                sub="Ativos"
                href={
                  `/super-admin/empresa/${company.id}/todos-os-colaboradores` +
                  `?dept=${encodeURIComponent(d.departamento)}`
                }
                ariaLabel={`Ver colaboradores do departamento ${d.departamento}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      <OnboardingKanbanMini companyId={company.id} summary={onboardingSummary} />

      <AcoesBlock companyId={company.id} status={company.status} />

      <section
        aria-label="Zonas placeholder Fase 1"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        <ZonaPlaceholder title="9-Box" texto={ZONA_9BOX_TEXTO} />
        <ZonaPlaceholder title="Status da plataforma" texto="Coleta de dados em andamento" />
      </section>
    </div>
  );
}
