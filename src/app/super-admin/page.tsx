// ROIP APP 9BOX — Painel Super Admin global (ME-056 Bloco C).
//
// Origem canonica:
// - DOC 05 §5.1 (estrutura comum), §5.3 (Painel do Super Admin
//   `/super-admin` global), §5.9-§5.10 (zonas 9-Box e Status),
//   §4 (Header canonico), §3.1 (Menu §3.1 super_admin_global — 11 itens).
// - DOC 02 §5.1 (sessao Super Admin sem `exp`), §10.3 (matriz de
//   paineis — Bruno acessa `/super-admin`, todos os demais recebem
//   AccessDeniedPage §9.1 pelo middleware).
// - CC041 (errata operacional): §5.3 real e o painel Bruno canonico
//   deste arquivo (comando de abertura citou "§6.1" — inexistente).
// - S306 (mínimo canonico D-A Opcao A N7/S226): cards estruturais
//   simples (`count(*)` sobre `companies` + `employees` +
//   `cLevelMembers` filtrados por `status='ativa/ativo'`) + estado
//   canonico §5.2 "Coleta de dados em andamento" para cards de
//   agregado analitico que dependem de motores de fase futura.
//
// **Server component App Router Next 15.** Consome `getServerSession`
// (Bloco A) → `resolveProfileKey` (Bloco B) → `resolveMenuItems` (ME-055b).
// O middleware canonico §10.3 ja rewrite para /access-denied quando
// role nao e super_admin; este arquivo aplica defense-in-depth: se
// session for null ou role divergir, redirect para `/login-super-admin`
// (§5.1). Nao renderiza AccessDeniedPage por conta propria — o
// middleware e a fonte canonica.
//
// **RV-11:** queries via Drizzle tipado contra MySQL real; tests
// integration em `tests/integration/me056-panels.test.ts` cobrem faixa
// principal 10100..10109 e faixa auxiliar 10110..10119 (S310).
//
// **RV-13:** este componente e chamador real de `getServerSession`,
// `resolveProfileKey`, `resolveMenuItems` e `Layout`. Todos os quatro
// nascem com consumidor real na propria ME-056.

import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { createDbClient } from '../../db/client';
import { cLevelMembers, companies, employees } from '../../db/schema';
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

interface SuperAdminPanelData {
  readonly companiesActiveCount: number;
  readonly companiesInactiveCount: number;
  readonly collaboratorsActiveCount: number;
  readonly activeCompanies: readonly {
    readonly id: number;
    readonly nomeFantasia: string;
    readonly cnpj: string;
    readonly createdAt: Date | null;
    readonly employeeCount: number;
  }[];
}

async function loadPanelData(): Promise<SuperAdminPanelData> {
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const [companiesActiveRows, companiesInactiveRows, employeesActiveRows, cLevelActiveRows] =
      await Promise.all([
        client.db
          .select({ count: sql<number>`count(*)` })
          .from(companies)
          .where(eq(companies.status, 'ativa')),
        client.db
          .select({ count: sql<number>`count(*)` })
          .from(companies)
          .where(eq(companies.status, 'inativa')),
        client.db
          .select({ count: sql<number>`count(*)` })
          .from(employees)
          .where(eq(employees.status, 'ativo')),
        client.db
          .select({ count: sql<number>`count(*)` })
          .from(cLevelMembers)
          .where(eq(cLevelMembers.status, 'ativo')),
      ]);

    const activeCompaniesList = await client.db
      .select({
        id: companies.id,
        nomeFantasia: companies.nomeFantasia,
        cnpj: companies.cnpj,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .where(eq(companies.status, 'ativa'))
      .orderBy(companies.nomeFantasia);

    // Contagem de employees ativos por empresa (subquery agregada).
    const employeesByCompany = await client.db
      .select({
        companyId: employees.companyId,
        count: sql<number>`count(*)`,
      })
      .from(employees)
      .where(eq(employees.status, 'ativo'))
      .groupBy(employees.companyId);

    const cLevelByCompany = await client.db
      .select({
        companyId: cLevelMembers.companyId,
        count: sql<number>`count(*)`,
      })
      .from(cLevelMembers)
      .where(eq(cLevelMembers.status, 'ativo'))
      .groupBy(cLevelMembers.companyId);

    const countByCompany = new Map<number, number>();
    for (const row of employeesByCompany) {
      countByCompany.set(row.companyId, Number(row.count));
    }
    for (const row of cLevelByCompany) {
      const prev = countByCompany.get(row.companyId) ?? 0;
      countByCompany.set(row.companyId, prev + Number(row.count));
    }

    return {
      companiesActiveCount: Number(companiesActiveRows[0]?.count ?? 0),
      companiesInactiveCount: Number(companiesInactiveRows[0]?.count ?? 0),
      collaboratorsActiveCount:
        Number(employeesActiveRows[0]?.count ?? 0) + Number(cLevelActiveRows[0]?.count ?? 0),
      activeCompanies: activeCompaniesList.map((c) => ({
        id: c.id,
        nomeFantasia: c.nomeFantasia,
        cnpj: c.cnpj,
        createdAt: c.createdAt,
        employeeCount: countByCompany.get(c.id) ?? 0,
      })),
    };
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
// Rota canonica /super-admin (§5.3)
// -----------------------------------------------------------------------

export default async function SuperAdminGlobalPanel(): Promise<JSX.Element> {
  const session = await getServerSession();
  // Defense-in-depth §10.3: middleware canonico ja bloqueia, aqui
  // apenas cobrimos o cenario de sessao ausente/corrompida.
  if (session === null) {
    redirect('/login-super-admin');
  }
  if (session.kind !== 'super_admin') {
    // Role incorreta chegando a esta rota: redirect canonico §2.3 vai
    // ao painel do proprio perfil via mapa `panelPathForRole` — aqui
    // o middleware ja teria emitido; guard defensivo redireciona ao
    // login para nao tentar renderizar Layout com role errada.
    redirect('/');
  }

  const profileKey = resolveProfileKey({
    session,
    // Super Admin nunca carrega essas flags canonicamente — passamos
    // valores neutros. `super_admin_global` e o unico resultado
    // possivel para esta rota.
    isRH: false,
    isLider: false,
    acessoTotal: false,
    hasDescendingChain: false,
    cLevelCount: 0,
    isSuperAdminInCompany: false,
  });

  // Bruno nunca e Responsavel financeiro (DOC 02 §3.1 canonico:
  // atribuivel apenas a employees ou cLevelMembers).
  const menuItems = resolveMenuItems(profileKey, false);
  if (menuItems === null) {
    // Impossivel canonicamente (super_admin_global tem menu §3.1),
    // mas TS exige nao-null para o Layout.
    throw new Error('Menu canonico ausente para super_admin_global — inconsistencia §3.1');
  }

  const data = await loadPanelData();

  const inactiveSub =
    data.companiesInactiveCount === 0
      ? 'Nenhuma inativa'
      : `${data.companiesInactiveCount} inativa${data.companiesInactiveCount === 1 ? '' : 's'}`;

  return (
    <Layout
      menuItems={menuItems}
      header={{
        leftMode: 'super_admin_global',
        user: { displayName: session.displayName },
        // Regra Q1 canonica §4.1: sino visivel apenas para Bruno e RH.
        showNotificationBell: true,
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
        Painel Super Admin
      </h1>

      {/* Bloco "Painel de metricas" §5.3: cards + zona extensivel. */}
      <section style={{ marginTop: 24 }} aria-label="Painel de métricas">
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
          Painel de métricas
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          <StructuralCard
            title="Empresas ativas"
            value={String(data.companiesActiveCount)}
            sub={inactiveSub}
          />
          <StructuralCard
            title="Colaboradores ativos"
            value={String(data.collaboratorsActiveCount)}
            sub="Total na plataforma"
          />
          <ComingSoonBlock
            title="Crescimento da base"
            canonicalText="Coleta de dados em andamento"
          />
        </div>
      </section>

      {/* Botao canonico §5.3: `[+ Cadastrar nova empresa]`. Rota
          `/super-admin/empresa/nova` entra em ME futura (B5.3); aqui
          fica como link canonico com estilo primario teal. */}
      <section style={{ marginTop: 32 }}>
        <a
          href="/super-admin/empresa/nova"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            color: '#FFFFFF',
            background: COLORS.accent.teal,
            textDecoration: 'none',
          }}
        >
          + Cadastrar nova empresa
        </a>
      </section>

      {/* Lista canonica de empresas §5.3. Estado default: apenas
          ativas. Toggle 3 estados (ativas / ativas+inativas /
          inativas) e ME futura B5.3. */}
      <section style={{ marginTop: 32 }} aria-label="Lista de empresas">
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: COLORS.text.primary,
            margin: '0 0 12px 0',
          }}
        >
          Empresas ativas ({data.companiesActiveCount})
        </h2>
        {data.activeCompanies.length === 0 ? (
          <p style={{ fontSize: 13, color: COLORS.text.secondary, margin: 0 }}>
            Nenhuma empresa ativa cadastrada.
          </p>
        ) : (
          <div
            style={{
              border: `1px solid ${COLORS.border.default}`,
              borderRadius: 8,
              background: COLORS.background.card,
              overflow: 'hidden',
            }}
          >
            {data.activeCompanies.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr',
                  gap: 12,
                  padding: '12px 16px',
                  fontSize: 13,
                  borderTop: i === 0 ? 'none' : `1px solid ${COLORS.border.default}`,
                  color: COLORS.text.primary,
                }}
              >
                <span style={{ fontWeight: 500 }}>{c.nomeFantasia}</span>
                <span style={{ color: COLORS.text.secondary }}>{c.cnpj}</span>
                <span style={{ color: COLORS.text.secondary }}>
                  {c.employeeCount} colaboradores
                </span>
                <span style={{ color: COLORS.text.tertiary, fontSize: 12 }}>
                  {c.createdAt !== null ? c.createdAt.toISOString().slice(0, 10) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
