// ROIP APP 9BOX — Painel de controle do RH (ME-056 Bloco D).
//
// Origem canonica:
// - DOC 05 §5.1 (estrutura comum), §5.5 (Painel RH `/painel-rh`),
//   §5.8 (Card resumo "Pendencias no portal" — RH puro/RHL1/RHL2),
//   §5.9-§5.10 (zonas 9-Box e Status), §4 (Header), §3.3-§3.5 (Menus).
// - DOC 02 §5.2 (sessao sliding 8h), §10.3 (matriz de paineis —
//   `/painel-rh` acessivel a rh + rh_lider; Bruno redirect a
//   /super-admin; C-level e Lider recebem §9.2).
// - S306 (mínimo canonico D-A Opcao A): total colaboradores ativos
//   (guarda PC1c §11.3 — inclui C-levels no agregado); demais cards
//   em estado §5.2 "Coleta de dados em andamento".
// - PC1c (§11.3): contadores exibidos ao RH INCLUEM C-levels
//   (agregado analitico protegido).

import { redirect } from 'next/navigation';
import { eq, sql, and } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { createDbClient } from '../../db/client';
import { cLevelMembers, companies, employees, employeeLeaderHistory } from '../../db/schema';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { countPendenciasEmpresa } from '../../lib/pendencias/pendenciasEngine';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession } from '../../server/session/serverSession';
import {
  CARD_58_LINK,
  CARD_58_SUB_POSITIVE,
  CARD_58_SUB_ZERO,
  CARD_58_TITLE,
  CARD_COLOR_PENDENCIAS,
} from '../pendencias-portal/mappings';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

interface RhFlags {
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly hasDescendingChain: boolean;
}

interface RhPanelData {
  readonly totalCollaborators: number;
  readonly totalCLevels: number;
}

async function loadRhFlags(userId: number): Promise<RhFlags | null> {
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .select({
        isRH: employees.isRH,
        isLider: employees.isLider,
        isResponsavelFinanceiro: employees.isResponsavelFinanceiro,
      })
      .from(employees)
      .where(eq(employees.id, userId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    // Cadeia descendente §5.5 Cenario 2 e §3.5: existe ao menos um
    // liderado direto do RH-Lider que tambem e lider? Query canonica
    // JOIN employeeLeaderHistory (dataFim IS NULL) x employees.isLider.
    const chainRows = await client.db
      .select({ liderId: employees.id })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
      .where(
        and(
          eq(employeeLeaderHistory.liderId, userId),
          sql`${employeeLeaderHistory.dataFim} IS NULL`,
          eq(employees.isLider, true),
          eq(employees.status, 'ativo'),
        ),
      )
      .limit(1);

    return {
      isRH: row.isRH === true,
      isLider: row.isLider === true,
      isResponsavelFinanceiro: row.isResponsavelFinanceiro === true,
      hasDescendingChain: chainRows.length > 0,
    };
  } finally {
    await client.pool.end();
  }
}

async function loadRhPanelData(companyId: number): Promise<RhPanelData> {
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const [employeeRows, cLevelRows] = await Promise.all([
      client.db
        .select({ count: sql<number>`count(*)` })
        .from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo'))),
      client.db
        .select({ count: sql<number>`count(*)` })
        .from(cLevelMembers)
        .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.status, 'ativo'))),
    ]);
    return {
      totalCollaborators: Number(employeeRows[0]?.count ?? 0) + Number(cLevelRows[0]?.count ?? 0),
      totalCLevels: Number(cLevelRows[0]?.count ?? 0),
    };
  } finally {
    await client.pool.end();
  }
}

async function loadCompanyLogo(companyId: number): Promise<string | null> {
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .select({ logoUrl: companies.logoUrl })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    return rows[0]?.logoUrl ?? null;
  } finally {
    await client.pool.end();
  }
}

// -----------------------------------------------------------------------
// Fragmentos canonicos de UI
// -----------------------------------------------------------------------

function StructuralCard(props: {
  readonly title: string;
  readonly value: string;
  readonly sub?: string;
}): JSX.Element {
  return (
    <div
      style={{
        background: COLORS.background.card,
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
        }}
      >
        {props.title}
      </span>
      <span style={{ fontSize: 28, fontWeight: 700, color: COLORS.text.primary }}>
        {props.value}
      </span>
      {props.sub !== undefined ? (
        <span style={{ fontSize: 13, color: COLORS.text.secondary }}>{props.sub}</span>
      ) : null}
    </div>
  );
}

/**
 * Card canonico §5.8 "Pendencias no portal" — refactor S321/S312
 * canonizada em ME-058. Cores literais §5.8 linhas 648-649:
 * - `#16A34A` (verde) quando total === 0 + sub "Empresa em dia..."
 * - `#D97706` (laranja) quando total > 0 + link "Ver detalhamento →"
 * Ambos os textos consumidos via constantes canonicas de mappings.
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
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
        }}
      >
        {CARD_58_TITLE}
      </span>
      <span style={{ fontSize: 32, fontWeight: 700, color: cor, lineHeight: 1 }}>
        {props.totalPendencias}
      </span>
      <span style={{ fontSize: 13, color: COLORS.text.secondary }}>
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

function ComingSoonBlock(props: {
  readonly title: string;
  readonly canonicalText: string;
}): JSX.Element {
  return (
    <div
      style={{
        background: COLORS.background.card,
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
        }}
      >
        {props.title}
      </span>
      <span style={{ fontSize: 14, color: COLORS.text.secondary, lineHeight: 1.5 }}>
        {props.canonicalText}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------
// Rota canonica /painel-rh (§5.5)
// -----------------------------------------------------------------------

export default async function PainelRhPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'platform') {
    redirect('/super-admin');
  }
  // Middleware §10.3 ja bloqueia C-level/Lider aqui — defense-in-depth.
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    redirect('/');
  }

  const flags = await loadRhFlags(session.userId);
  if (flags === null) {
    // Registro deletado entre emissao e verificacao — sessao invalida.
    redirect('/');
  }

  const profileKey = resolveProfileKey({
    session,
    isRH: flags.isRH,
    isLider: flags.isLider,
    acessoTotal: false,
    hasDescendingChain: flags.hasDescendingChain,
    cLevelCount: 0,
    isSuperAdminInCompany: false,
  });

  const menuItems = resolveMenuItems(profileKey, flags.isResponsavelFinanceiro);
  if (menuItems === null) {
    throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
  }

  const client = createDbClient(resolveDatabaseUrl());
  const [data, companyLogoUrl, totalPendenciasPortal] = await Promise.all([
    loadRhPanelData(session.companyId),
    loadCompanyLogo(session.companyId),
    countPendenciasEmpresa({ db: client.db, companyId: session.companyId }),
  ]).finally(() => {
    void client.pool.end();
  });

  const showsMinhaEquipe = profileKey === 'rh_lider_c1' || profileKey === 'rh_lider_c2';
  const showsCadeiaIndireta = profileKey === 'rh_lider_c2';

  return (
    <Layout
      menuItems={menuItems}
      header={{
        leftMode: 'in_company',
        companyDisplayName: session.companyDisplayName,
        companyLogoUrl: companyLogoUrl ?? undefined,
        user: { displayName: session.displayName },
        // Regra Q1 canonica §4.1: sino para Bruno e RH.
        showNotificationBell: true,
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
        Painel de controle
      </h1>

      {/* Secao 1 — Visao geral §5.5 */}
      <section style={{ marginTop: 24 }} aria-label="Visão geral">
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
          Visão geral
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          <StructuralCard
            title="Total de colaboradores ativos"
            value={String(data.totalCollaborators)}
            sub={`Inclui ${data.totalCLevels} C-level${data.totalCLevels === 1 ? '' : 's'} (PC1c)`}
          />
          <ComingSoonBlock
            title="Status dados do mês — RH"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="Status dados do mês — Líderes"
            canonicalText="Coleta de dados em andamento"
          />
          <PendenciasPortalCard totalPendencias={totalPendenciasPortal} />
          <ComingSoonBlock title="Radar NR-1" canonicalText="Coleta de dados em andamento" />
          <ComingSoonBlock
            title="Status da plataforma"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="9-Box"
            canonicalText={
              'Disponível a partir da Fase 3. Esta zona se tornará o ponto de entrada do ' +
              'dashboard global da empresa.'
            }
          />
        </div>
      </section>

      {/* Secao 2 — Minha equipe §5.5 (apenas RH-Lider C1 e C2) */}
      {showsMinhaEquipe ? (
        <section style={{ marginTop: 32 }} aria-label="Minha equipe">
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
            Minha equipe
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            <ComingSoonBlock
              title="Liderados diretos"
              canonicalText="Coleta de dados em andamento"
            />
            <ComingSoonBlock
              title="Pendências dos meus liderados no portal"
              canonicalText="Coleta de dados em andamento"
            />
            <ComingSoonBlock
              title="Diálogos de desenvolvimento — pendências"
              canonicalText="Coleta de dados em andamento"
            />
          </div>
        </section>
      ) : null}

      {/* Secao 3 — Cadeia indireta §5.5 (apenas RH-Lider C2) */}
      {showsCadeiaIndireta ? (
        <section style={{ marginTop: 32 }} aria-label="Cadeia indireta">
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
            Cadeia indireta
          </h2>
          <ComingSoonBlock
            title="Cadeia descendente"
            canonicalText="Coleta de dados em andamento"
          />
        </section>
      ) : null}

      {/* Secao 4 — Meu portal §5.5 */}
      <section style={{ marginTop: 32 }} aria-label="Meu portal">
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
          Meu portal
        </h2>
        <ComingSoonBlock
          title="Pendências do portal"
          canonicalText="Coleta de dados em andamento"
        />
      </section>

      {/* Secao 5 — Radar da empresa §5.5 */}
      <section style={{ marginTop: 32 }} aria-label="Radar da empresa">
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
          Radar da empresa
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <ComingSoonBlock title="Tabela IQL" canonicalText="Coleta de dados em andamento" />
          <ComingSoonBlock
            title="Clima e Engajamento"
            canonicalText="Coleta de dados em andamento"
          />
        </div>
      </section>
    </Layout>
  );
}
