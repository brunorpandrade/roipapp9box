// ROIP APP 9BOX — Painel de controle do Lider (ME-056 Bloco D).
//
// Origem canonica:
// - DOC 05 §5.1 (estrutura comum), §5.6 (Painel Lider `/painel-lider`
//   Cenarios 1 e 2), §5.9-§5.10 (zonas 9-Box e Status), §4 (Header),
//   §3.6-§3.7 (Menus).
// - DOC 02 §5.2 (sliding 8h), §10.3 (matriz — `/painel-lider`
//   acessivel a lider; Bruno redirect a /super-admin; RH-Lider
//   redirect a /painel-rh §2.3 precedencia; RH puro/C-level recebem
//   §9.4).
// - S306 (mínimo canonico D-A Opcao A): total de liderados diretos
//   (Cenario 1) + total cadeia completa (Cenario 2) como cards
//   estruturais; demais em estado §5.2.
// - §5.6 Cenario 1: Radar da empresa AUSENTE (Lider C1 puro nao ve
//   IQL nem Clima — regra canonica FASE_3B §10.2/§10.3 revisada).

import { redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { createDbClient } from '../../db/client';
import { companies, employees, employeeLeaderHistory } from '../../db/schema';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession } from '../../server/session/serverSession';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

interface LiderFlags {
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly hasDescendingChain: boolean;
}

interface LiderPanelData {
  readonly liderarDiretosCount: number;
}

async function loadLiderFlagsAndData(
  userId: number,
): Promise<{ flags: LiderFlags; data: LiderPanelData; companyLogoUrl: string | null } | null> {
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .select({
        isRH: employees.isRH,
        isLider: employees.isLider,
        isResponsavelFinanceiro: employees.isResponsavelFinanceiro,
        companyId: employees.companyId,
      })
      .from(employees)
      .where(eq(employees.id, userId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    // Liderados diretos ativos §5.6 Cenario 1 — count.
    const diretosRows = await client.db
      .select({ count: sql<number>`count(*)` })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
      .where(
        and(
          eq(employeeLeaderHistory.liderId, userId),
          isNull(employeeLeaderHistory.dataFim),
          eq(employees.status, 'ativo'),
        ),
      );

    // Cadeia descendente §5.6 Cenario 2 — existe liderado direto
    // que tambem e lider?
    const chainRows = await client.db
      .select({ liderId: employees.id })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
      .where(
        and(
          eq(employeeLeaderHistory.liderId, userId),
          isNull(employeeLeaderHistory.dataFim),
          eq(employees.isLider, true),
          eq(employees.status, 'ativo'),
        ),
      )
      .limit(1);

    const companyRows = await client.db
      .select({ logoUrl: companies.logoUrl })
      .from(companies)
      .where(eq(companies.id, row.companyId))
      .limit(1);

    return {
      flags: {
        isRH: row.isRH === true,
        isLider: row.isLider === true,
        isResponsavelFinanceiro: row.isResponsavelFinanceiro === true,
        hasDescendingChain: chainRows.length > 0,
      },
      data: {
        liderarDiretosCount: Number(diretosRows[0]?.count ?? 0),
      },
      companyLogoUrl: companyRows[0]?.logoUrl ?? null,
    };
  } finally {
    await client.pool.end();
  }
}

// -----------------------------------------------------------------------
// Fragmentos canonicos de UI (locais — evita coupling entre paineis)
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
// Rota canonica /painel-lider (§5.6)
// -----------------------------------------------------------------------

export default async function PainelLiderPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'platform') {
    redirect('/super-admin');
  }
  // ME-080b Dispatch 3 — gate canonico "primeiro acesso".
  if (session.passwordSet === false) {
    redirect('/alterar-senha');
  }
  if (session.role !== 'lider') {
    // rh_lider → §2.3 precedencia canonica → /painel-rh (middleware
    // ja resolve; defense-in-depth aqui).
    if (session.role === 'rh_lider' || session.role === 'rh') {
      redirect('/painel-rh');
    }
    redirect('/');
  }

  const result = await loadLiderFlagsAndData(session.userId);
  if (result === null) {
    redirect('/');
  }
  const { flags, data, companyLogoUrl } = result;

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

  const isCenario2 = profileKey === 'lider_c2';

  return (
    <Layout
      menuItems={menuItems}
      header={{
        leftMode: 'in_company',
        companyDisplayName: session.companyDisplayName,
        companyLogoUrl: companyLogoUrl ?? undefined,
        user: { displayName: session.displayName },
        // Regra Q1 canonica §4.1: Lider NAO tem sino (S474).
        showNotificationBell: false,
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
        Painel de controle
      </h1>

      {/* Secao 1 — Visao geral §5.6 */}
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
            title="Liderados diretos"
            value={String(data.liderarDiretosCount)}
            sub="Cadeia direta ativa"
          />
          <ComingSoonBlock
            title="Status dados do mês — liderados diretos"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="Status da plataforma"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="9-Box"
            canonicalText={
              isCenario2
                ? 'Disponível a partir da Fase 3. Esta zona se tornará o ponto de entrada do ' +
                  'dashboard da sua equipe (com navegação para a cadeia abaixo).'
                : 'Disponível a partir da Fase 3. Esta zona se tornará o ponto de entrada do ' +
                  'dashboard da sua equipe direta.'
            }
          />
          {isCenario2 ? (
            <>
              <ComingSoonBlock
                title="Total de colaboradores na cadeia completa"
                canonicalText="Coleta de dados em andamento"
              />
              <ComingSoonBlock
                title="Status dados do mês — líderes da cadeia"
                canonicalText="Coleta de dados em andamento"
              />
            </>
          ) : null}
        </div>
      </section>

      {/* Secao 2 — Minha equipe §5.6 (herdada). */}
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
            title="Status dos liderados diretos"
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

      {/* Secao 3 — Cadeia indireta §5.6 (apenas Cenario 2). */}
      {isCenario2 ? (
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
          <ComingSoonBlock title="Líderes da cadeia" canonicalText="Coleta de dados em andamento" />
        </section>
      ) : null}

      {/* Secao 4 — Meu portal §5.6 (herdada) */}
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

      {/* Secao 5 — Radar da empresa §5.6: Cenario 1 AUSENTE; Cenario
          2 exibe apenas Tabela IQL escopo cadeia. */}
      {isCenario2 ? (
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
          <ComingSoonBlock
            title="Tabela IQL — cadeia"
            canonicalText="Coleta de dados em andamento"
          />
        </section>
      ) : null}
    </Layout>
  );
}
