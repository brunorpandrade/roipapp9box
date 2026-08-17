'use client';

// ROIP APP 9BOX — client component canonico da rota `/painel-rh`
// (Painel do RH §5.5, ME-083).
//
// Origem canonica:
// - DOC 05 §5.5 (Painel RH — 5 secoes canonicas com variacao por cenario
//   RH puro / RH-Lider C1 / RH-Lider C2).
// - DOC 05 §5.1 (estrutura comum).
// - DOC 05 §5.2 (estado "Coleta de dados em andamento" — Radar da empresa
//   IQL+Clima renderiza placeholder no B9 — D-B9-CLIMA-IQL-PLACEHOLDER).
// - DOC 05 §5.8 (Card resumo "Pendencias no portal") + PendenciasPortalCard.
// - DOC 05 §5.9 (zona reservada "9-Box" — texto canonico bit-exact para
//   painel RH: "Disponivel a partir da Fase 3. Esta zona se tornara o
//   ponto de entrada do dashboard global da empresa.").
// - DOC 05 §5.10 (bloco "Status da plataforma").
// - Mockup canonico primario: `painel_principal_fase7_v5.html`.
//
// Client component canonico apenas pela interatividade dos cards (Link
// do Next 15 precisa arvore de renderizacao client para prefetch). Sem
// estado local — 100% renderizacao a partir das props passadas pelo
// server component.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.
// **RV-13 canonica.** Componente e chamador real de todos os imports.

import Link from 'next/link';
import type { JSX } from 'react';

import { ClickableIndicatorCard } from '../../components/painel/ClickableIndicatorCard';
import { OnboardingKanbanMini } from '../../components/painel/OnboardingKanbanMini';
import { ZonaPlaceholder } from '../../components/painel/ZonaPlaceholder';
import { COLORS } from '../../lib/design-tokens/colors';
import {
  CARD_58_LINK,
  CARD_58_SUB_POSITIVE,
  CARD_58_SUB_ZERO,
  CARD_58_TITLE,
  CARD_COLOR_PENDENCIAS,
} from '../pendencias-portal/mappings';
import type {
  DepartmentCount,
  LandingCounts,
  LandingOnboardingSummary,
  MesAtualClosureStatus,
} from '../super-admin/empresa/[id]/internals';

import type {
  CadeiaIndiretaData,
  MinhaEquipeData,
  MeuPortalData,
  RhCompanyInfo,
} from './internals';

// -----------------------------------------------------------------------
// Props canonicas bit-exact
// -----------------------------------------------------------------------

export interface PainelRHClientProps {
  readonly company: RhCompanyInfo;
  readonly counts: LandingCounts;
  readonly departmentCounts: readonly DepartmentCount[];
  readonly onboardingSummary: LandingOnboardingSummary;
  readonly mesAtualClosure: MesAtualClosureStatus;
  readonly totalPendenciasPortal: number;
  readonly showsMinhaEquipe: boolean;
  readonly showsCadeiaIndireta: boolean;
  readonly minhaEquipe: MinhaEquipeData | null;
  readonly cadeiaIndireta: CadeiaIndiretaData | null;
  readonly meuPortal: MeuPortalData;
}

// -----------------------------------------------------------------------
// Constantes canonicas literais §5.5
// -----------------------------------------------------------------------

/**
 * Texto canonico bit-exact da zona 9-Box §5.9 para painel RH (equivale a
 * Super Admin dentro-de-empresa — RH ve escopo empresa inteira).
 */
export const ZONA_9BOX_TEXTO_RH =
  'Disponível a partir da Fase 3. Esta zona se tornará o ponto de entrada ' +
  'do dashboard global da empresa.';

/**
 * Texto canonico bit-exact do estado vazio da Secao 2 §5.5. Aplica-se
 * quando RH-Lider (C1/C2) nao tem liderados diretos ativos.
 */
export const MINHA_EQUIPE_VAZIO_TEXTO =
  'Você não tem liderados diretos ativos. Fale com o RH para incluir ' +
  'colaboradores em sua equipe.';

/**
 * Texto canonico bit-exact do estado vazio da Secao 3 §5.5. Aplica-se
 * quando RH-Lider C2 tem hasDescendingChain=true mas por algum motivo a
 * lista veio vazia (defensive).
 */
export const CADEIA_INDIRETA_VAZIO_TEXTO =
  'Você não tem cadeia indireta — nenhum dos seus liderados diretos é líder.';

/**
 * Texto canonico bit-exact do estado vazio da Secao 4 §5.5.
 */
export const MEU_PORTAL_VAZIO_TEXTO = 'Você não tem pendências no portal.';

/**
 * Label canonico bit-exact do botao da Secao 4 §5.5 — abre `/colaborador`
 * em nova aba (identificacao por CPF acontece no proprio portal).
 */
export const MEU_PORTAL_BOTAO_LABEL = 'Acessar o portal com meu CPF →';

// -----------------------------------------------------------------------
// Fragmentos canonicos de UI
// -----------------------------------------------------------------------

function SectionTitle(props: { readonly children: string }): JSX.Element {
  return (
    <h2
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: COLORS.text.secondary,
        margin: '0 0 12px 0',
      }}
    >
      {props.children}
    </h2>
  );
}

/**
 * Card canonico bit-exact §5.8 "Pendencias no portal" preservado do
 * pattern §5.4 e da versao S306 original. Cores literais §5.8 linhas
 * 648-649: verde `#16A34A` quando zero + sub-texto "Empresa em dia..."
 * (sem link); laranja `#D97706` quando > 0 + link "Ver detalhamento →".
 */
function PendenciasPortalCard(props: { readonly totalPendencias: number }): JSX.Element {
  const isZero = props.totalPendencias === 0;
  const cor = isZero ? CARD_COLOR_PENDENCIAS.zero : CARD_COLOR_PENDENCIAS.positive;
  return (
    <div
      style={{
        background: COLORS.background.card,
        border: `1px solid ${COLORS.border.default}`,
        borderLeft: `4px solid ${cor}`,
        borderRadius: 8,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
        }}
      >
        {CARD_58_TITLE}
      </span>
      <span style={{ display: 'block', fontSize: 32, fontWeight: 700, color: cor, lineHeight: 1 }}>
        {props.totalPendencias}
      </span>
      <span style={{ display: 'block', fontSize: 13, color: COLORS.text.secondary }}>
        {isZero ? CARD_58_SUB_ZERO : CARD_58_SUB_POSITIVE}
      </span>
      {!isZero ? (
        <a
          href="/pendencias-portal"
          style={{
            fontSize: 13,
            color: COLORS.accent.teal,
            textDecoration: 'none',
            fontWeight: 500,
            marginTop: 4,
          }}
        >
          {CARD_58_LINK}
        </a>
      ) : null}
    </div>
  );
}

function ColaboradorListItem(props: {
  readonly nome: string;
  readonly cargo: string;
  readonly departamento: string;
  readonly photoUrl: string | null;
}): JSX.Element {
  const { nome, cargo, departamento, photoUrl } = props;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 6,
        background: COLORS.background.elevated,
      }}
    >
      {photoUrl !== null ? (
        <img
          src={photoUrl}
          alt=""
          width={32}
          height={32}
          style={{ borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: COLORS.border.default,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: COLORS.text.tertiary,
          }}
        >
          {nome.slice(0, 1)}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.text.primary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {nome}
        </span>
        <span
          style={{
            fontSize: 11,
            color: COLORS.text.tertiary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {cargo} · {departamento}
        </span>
      </div>
    </div>
  );
}

function EmptyState(props: { readonly texto: string }): JSX.Element {
  return (
    <div
      style={{
        padding: '20px 24px',
        borderRadius: 8,
        border: `1px dashed ${COLORS.border.default}`,
        background: COLORS.background.card,
        fontSize: 13,
        color: COLORS.text.secondary,
        lineHeight: 1.5,
      }}
    >
      {props.texto}
    </div>
  );
}

// -----------------------------------------------------------------------
// Client component canonico principal
// -----------------------------------------------------------------------

export function PainelRHClient(props: PainelRHClientProps): JSX.Element {
  const {
    counts,
    departmentCounts,
    onboardingSummary,
    mesAtualClosure,
    totalPendenciasPortal,
    showsMinhaEquipe,
    showsCadeiaIndireta,
    minhaEquipe,
    cadeiaIndireta,
    meuPortal,
  } = props;

  const rhCardSub = mesAtualClosure.rhPreenchido
    ? `Preenchido (limite ${mesAtualClosure.dataLimiteRh})`
    : `Pendente (limite ${mesAtualClosure.dataLimiteRh})`;

  // ME-083 D-ME083-9 — card §5.5 "Status dados do mes — Lideres" renderiza
  // placeholder §5.2 enquanto `lideresPreenchidos` for `null` (definicao
  // canonica pendente). Contudo `lideresTotal` ja e exibivel como sub.
  const lideresCardValue =
    mesAtualClosure.lideresPreenchidos === null
      ? 'Coleta de dados em andamento'
      : `${mesAtualClosure.lideresPreenchidos}/${mesAtualClosure.lideresTotal}`;
  const lideresCardSub = (() => {
    if (mesAtualClosure.lideresPreenchidos === null) {
      return `Mês ${mesAtualClosure.mesAtual}`;
    }
    const denom = Math.max(mesAtualClosure.lideresTotal, 1);
    const pct = Math.round((mesAtualClosure.lideresPreenchidos / denom) * 100);
    return `${pct}% dos ${mesAtualClosure.lideresTotal} líderes`;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: COLORS.text.primary,
          margin: '0 0 20px 0',
        }}
      >
        Painel de controle
      </h1>

      {/* Secao 1 — Visao geral §5.5 */}
      <section aria-label="Visão geral">
        <SectionTitle>Visão geral</SectionTitle>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <ClickableIndicatorCard
            title="Total de colaboradores ativos"
            value={String(counts.totalColaboradoresAtivos + counts.totalCLevelsAtivos)}
            sub={
              `Inclui ${counts.totalCLevelsAtivos} ` +
              `C-level${counts.totalCLevelsAtivos === 1 ? '' : 's'} (PC1c)`
            }
            href="/todos-os-colaboradores"
            ariaLabel="Ver todos os colaboradores ativos"
          />
          <ClickableIndicatorCard
            title="Status dados do mês — RH"
            value={mesAtualClosure.rhPreenchido ? 'Preenchido' : 'Pendente'}
            sub={rhCardSub}
            href="/dados-mensais"
            ariaLabel="Abrir dados mensais RH"
          />
          <ClickableIndicatorCard
            title="Status dados do mês — Líderes"
            value={lideresCardValue}
            sub={lideresCardSub}
            href="/dados-mensais?tab=lider"
            ariaLabel="Abrir dados mensais de líderes"
          />
          <PendenciasPortalCard totalPendencias={totalPendenciasPortal} />
          <ClickableIndicatorCard
            title="Radar NR-1"
            value="Ver módulo"
            href="/nr1"
            ariaLabel="Abrir módulo Radar NR-1"
          />
        </div>
      </section>

      {departmentCounts.length > 0 ? (
        <section aria-label="Colaboradores por departamento" style={{ marginTop: 20 }}>
          <SectionTitle>Colaboradores por departamento</SectionTitle>
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
                href={`/todos-os-colaboradores?dept=${encodeURIComponent(d.departamento)}`}
                ariaLabel={`Ver colaboradores do departamento ${d.departamento}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Miniatura canonica Onboarding de lideres §5.5 (3 cenarios RH) */}
      <section aria-label="Onboarding de líderes" style={{ marginTop: 20 }}>
        <OnboardingKanbanMini summary={onboardingSummary} href="/onboarding-lideres" />
      </section>

      {/* Zonas placeholder §5.9 (9-Box) + §5.10 (Status da plataforma) */}
      <section
        aria-label="Zonas placeholder Fase 1"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
          marginTop: 20,
        }}
      >
        <ZonaPlaceholder title="9-Box" texto={ZONA_9BOX_TEXTO_RH} />
        <ZonaPlaceholder title="Status da plataforma" texto="Coleta de dados em andamento" />
      </section>

      {/* Secao 2 — Minha equipe §5.5 (RH-Lider C1 e C2) */}
      {showsMinhaEquipe ? (
        <section aria-label="Minha equipe" style={{ marginTop: 32 }}>
          <SectionTitle>Minha equipe</SectionTitle>
          {minhaEquipe !== null && minhaEquipe.totalLideradosDiretos > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  background: COLORS.background.card,
                  border: `1px solid ${COLORS.border.default}`,
                  borderRadius: 8,
                  padding: '16px 20px',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: COLORS.text.tertiary,
                    marginBottom: 4,
                  }}
                >
                  Liderados diretos
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 22,
                    fontWeight: 700,
                    color: COLORS.text.primary,
                  }}
                >
                  {minhaEquipe.totalLideradosDiretos}
                </span>
              </div>
              <div
                style={{
                  background: COLORS.background.card,
                  border: `1px solid ${COLORS.border.default}`,
                  borderRadius: 8,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {minhaEquipe.primeiros5.map((liderado) => (
                  <ColaboradorListItem
                    key={liderado.id}
                    nome={liderado.nome}
                    cargo={liderado.cargo}
                    departamento={liderado.departamento}
                    photoUrl={liderado.photoUrl}
                  />
                ))}
                <Link
                  href="/minha-equipe"
                  style={{
                    fontSize: 13,
                    color: COLORS.accent.teal,
                    textDecoration: 'none',
                    fontWeight: 500,
                    marginTop: 4,
                    alignSelf: 'flex-end',
                  }}
                >
                  Ver tabela completa →
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState texto={MINHA_EQUIPE_VAZIO_TEXTO} />
          )}
        </section>
      ) : null}

      {/* Secao 3 — Cadeia indireta §5.5 (apenas RH-Lider C2) */}
      {showsCadeiaIndireta ? (
        <section aria-label="Cadeia indireta" style={{ marginTop: 32 }}>
          <SectionTitle>Cadeia indireta</SectionTitle>
          {cadeiaIndireta !== null && cadeiaIndireta.totalCadeiaCompleta > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  background: COLORS.background.card,
                  border: `1px solid ${COLORS.border.default}`,
                  borderRadius: 8,
                  padding: '16px 20px',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: COLORS.text.tertiary,
                    marginBottom: 4,
                  }}
                >
                  Líderes na cadeia descendente
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 22,
                    fontWeight: 700,
                    color: COLORS.text.primary,
                  }}
                >
                  {cadeiaIndireta.totalCadeiaCompleta}
                </span>
              </div>
              <div
                style={{
                  background: COLORS.background.card,
                  border: `1px solid ${COLORS.border.default}`,
                  borderRadius: 8,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {cadeiaIndireta.primeiros5Lideres.map((lider) => (
                  <ColaboradorListItem
                    key={lider.id}
                    nome={lider.nome}
                    cargo={lider.cargo}
                    departamento={lider.departamento}
                    photoUrl={lider.photoUrl}
                  />
                ))}
                <Link
                  href="/cadeia-indireta"
                  style={{
                    fontSize: 13,
                    color: COLORS.accent.teal,
                    textDecoration: 'none',
                    fontWeight: 500,
                    marginTop: 4,
                    alignSelf: 'flex-end',
                  }}
                >
                  Ver tabela completa →
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState texto={CADEIA_INDIRETA_VAZIO_TEXTO} />
          )}
        </section>
      ) : null}

      {/* Secao 4 — Meu portal §5.5 (todos os cenarios RH) */}
      <section aria-label="Meu portal" style={{ marginTop: 32 }}>
        <SectionTitle>Meu portal</SectionTitle>
        {meuPortal.pendencias.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <EmptyState texto={MEU_PORTAL_VAZIO_TEXTO} />
            <a
              href="/colaborador"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '10px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                color: '#FFFFFF',
                background: COLORS.primary.navy,
                textDecoration: 'none',
              }}
            >
              {MEU_PORTAL_BOTAO_LABEL}
            </a>
          </div>
        ) : (
          <div
            style={{
              background: COLORS.background.card,
              border: `1px solid ${COLORS.border.default}`,
              borderRadius: 8,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {meuPortal.pendencias.map((p) => (
              <div
                key={p.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: COLORS.background.elevated,
                }}
              >
                <span style={{ fontSize: 13, color: COLORS.text.primary }}>
                  {p.instrumentoLabel}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                    color:
                      p.status === 'atrasado' ? COLORS.badge.dangerText : COLORS.badge.warningText,
                    background:
                      p.status === 'atrasado' ? COLORS.badge.dangerBg : COLORS.badge.warningBg,
                  }}
                >
                  {p.status === 'atrasado' ? 'Atrasado' : 'Pendente'}
                </span>
              </div>
            ))}
            <a
              href="/colaborador"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '10px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                color: '#FFFFFF',
                background: COLORS.primary.navy,
                textDecoration: 'none',
                marginTop: 4,
              }}
            >
              {MEU_PORTAL_BOTAO_LABEL}
            </a>
          </div>
        )}
      </section>

      {/* Secao 5 — Radar da empresa §5.5 (Tabela IQL + Clima) — placeholder */}
      <section aria-label="Radar da empresa" style={{ marginTop: 32 }}>
        <SectionTitle>Radar da empresa</SectionTitle>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          <ZonaPlaceholder title="Tabela IQL" texto="Coleta de dados em andamento" />
          <ZonaPlaceholder title="Clima e Engajamento" texto="Coleta de dados em andamento" />
        </div>
      </section>
    </div>
  );
}
