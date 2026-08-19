// ROIP APP 9BOX — pagina AccessDeniedPage (ME-023; refactor ME-055c
// CC040; refactor D064 ME-056 S308).
//
// Rota alvo do rewrite server-side do `middleware.ts` (S033) para
// quando um perfil autenticado tenta acessar rota fora do proprio
// escopo (§10). URL na barra permanece a rota original tentada — o
// rewrite preserva.
//
// Estrutura canonica §8.1:
//   - Layout: sidebar canonica do perfil autenticado (sem item ativo
//     — AccessDeniedPage nao e rota do menu) + header canonico
//     contextualizado por perfil + card central 480px.
//   - Icone: cadeado 72px em circulo âmbar (#FEF3C7 fundo, #D97706
//     cor). SVG inline.
//   - Titulo canonico unico: "Acesso negado."
//   - Corpo: mensagem canonica de §9 (ou §11.5, ou derivada S039)
//     resolvida por `?rota=<key>` publicado pelo middleware.
//   - CTA: botao primario navy `[Ir para meu painel]`.
//
// **ME-056 S308 canoniza D064: refactor Opcao A N7/S226.** O card
// central canonico e envolvido pelo Layout perfil-agnostic da
// ME-055b. A sessao real e consultada via `getServerSession`
// (ME-056 Bloco A). Flags de perfil (`isRH`, `isLider`,
// `hasDescendingChain`, `acessoTotal`, `cLevelCount`,
// `isResponsavelFinanceiro`) sao carregadas via queries dedicadas
// para resolver o `ProfileKey` canonico §3.1-§3.10 e o menu
// via `resolveMenuItems`.
//
// **Fallback canonico §8.3 (sessao expirada / ausente):** quando
// `getServerSession` devolve `null`, o middleware ja teria emitido
// redirect para `/` ou `/login-super-admin`; se por algum motivo
// chegamos aqui sem sessao valida, renderizamos o card central em
// modo standalone (sem shell — o consumidor tipico e um teste ou
// rewrite direto sem middleware). Mantem funcionalidade e nao
// quebra a rota.
//
// **CC040 (ME-055c preservada bit-exact):** hexes tokenizados via
// `COLORS.*`.

import { redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { createDbClient } from '../../db/client';
import { cLevelMembers, companies, employees, employeeLeaderHistory } from '../../db/schema';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import {
  ACCESS_DENIED_TITLE,
  resolveAccessDeniedMessage,
} from '../../lib/routes/accessDeniedMessages';
import { ALL_GUARD_ROLES, type GuardRole } from '../../lib/routes/matrix';
import { panelPathForRole } from '../../lib/routes/redirectByRole';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession, type ServerSession } from '../../server/session/serverSession';

interface AccessDeniedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function normalizeRoleParam(raw: string | string[] | undefined): GuardRole | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return (ALL_GUARD_ROLES as readonly string[]).includes(value) ? (value as GuardRole) : null;
}

function normalizeRotaParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

// -----------------------------------------------------------------------
// Flags por role — mesmo pattern das rotas de painel (Blocos C+D)
// -----------------------------------------------------------------------

interface AccessDeniedFlags {
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly acessoTotal: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly hasDescendingChain: boolean;
  readonly cLevelCount: number;
  readonly companyLogoUrl: string | null;
}

async function loadFlagsForSession(session: ServerSession): Promise<AccessDeniedFlags | null> {
  if (session.kind === 'super_admin') {
    return {
      isRH: false,
      isLider: false,
      acessoTotal: false,
      isResponsavelFinanceiro: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      companyLogoUrl: null,
    };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    if (session.role === 'clevel') {
      const memberRows = await client.db
        .select({
          acessoTotal: cLevelMembers.acessoTotal,
          isResponsavelFinanceiro: cLevelMembers.isResponsavelFinanceiro,
        })
        .from(cLevelMembers)
        .where(eq(cLevelMembers.id, session.userId))
        .limit(1);
      const member = memberRows[0];
      if (member === undefined) {
        return null;
      }

      const [countRows, companyRows] = await Promise.all([
        client.db
          .select({ count: sql<number>`count(*)` })
          .from(cLevelMembers)
          .where(
            and(eq(cLevelMembers.companyId, session.companyId), eq(cLevelMembers.status, 'ativo')),
          ),
        client.db
          .select({ logoUrl: companies.logoUrl })
          .from(companies)
          .where(eq(companies.id, session.companyId))
          .limit(1),
      ]);

      return {
        isRH: false,
        isLider: false,
        acessoTotal: member.acessoTotal === true,
        isResponsavelFinanceiro: member.isResponsavelFinanceiro === true,
        hasDescendingChain: false,
        cLevelCount: Number(countRows[0]?.count ?? 0),
        companyLogoUrl: companyRows[0]?.logoUrl ?? null,
      };
    }

    // role IN ('rh', 'rh_lider', 'lider')
    const empRows = await client.db
      .select({
        isRH: employees.isRH,
        isLider: employees.isLider,
        isResponsavelFinanceiro: employees.isResponsavelFinanceiro,
      })
      .from(employees)
      .where(eq(employees.id, session.userId))
      .limit(1);
    const emp = empRows[0];
    if (emp === undefined) {
      return null;
    }

    const chainRows = await client.db
      .select({ liderId: employees.id })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
      .where(
        and(
          eq(employeeLeaderHistory.liderId, session.userId),
          isNull(employeeLeaderHistory.dataFim),
          eq(employees.isLider, true),
          eq(employees.status, 'ativo'),
        ),
      )
      .limit(1);

    const companyRows = await client.db
      .select({ logoUrl: companies.logoUrl })
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    return {
      isRH: emp.isRH === true,
      isLider: emp.isLider === true,
      acessoTotal: false,
      isResponsavelFinanceiro: emp.isResponsavelFinanceiro === true,
      hasDescendingChain: chainRows.length > 0,
      cLevelCount: 0,
      companyLogoUrl: companyRows[0]?.logoUrl ?? null,
    };
  } finally {
    await client.pool.end();
  }
}

// -----------------------------------------------------------------------
// Card central canonico §8.1 (extraido como componente puro)
// -----------------------------------------------------------------------

function AccessDeniedCard(props: {
  readonly message: string;
  readonly painelHref: string;
}): JSX.Element {
  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        width: '100%',
        maxWidth: 480,
        margin: '48px auto',
        background: COLORS.background.card,
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        padding: '40px 32px',
        textAlign: 'center',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: COLORS.badge.warningBg,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <svg
          width={36}
          height={36}
          viewBox="0 0 24 24"
          fill="none"
          stroke={COLORS.semantic.warning}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <h1
        style={{
          margin: '0 0 16px 0',
          fontSize: 24,
          fontWeight: 700,
          color: COLORS.text.primary,
          lineHeight: 1.3,
        }}
      >
        {ACCESS_DENIED_TITLE}
      </h1>

      <p
        data-testid="access-denied-message"
        style={{
          margin: '0 0 32px 0',
          fontSize: 15,
          lineHeight: 1.6,
          color: COLORS.text.secondary,
        }}
      >
        {props.message}
      </p>

      <a
        href={props.painelHref}
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: COLORS.primary.navy,
          color: '#FFFFFF',
          borderRadius: 6,
          textDecoration: 'none',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Ir para meu painel
      </a>
    </div>
  );
}

// -----------------------------------------------------------------------
// Rota canonica /access-denied (§8.1)
// -----------------------------------------------------------------------

export default async function AccessDeniedPage({
  searchParams,
}: AccessDeniedPageProps): Promise<JSX.Element> {
  const params = await searchParams;
  const rotaKey = normalizeRotaParam(params['rota']);
  const messageEntry = resolveAccessDeniedMessage(rotaKey);
  const roleParam = normalizeRoleParam(params['role']);

  const session = await getServerSession();

  // Fallback canonico §8.3: sessao ausente/invalida → card standalone
  // sem shell. O middleware §10.3 tipicamente emite redirect para `/`
  // antes de chegar aqui; este path e defense-in-depth.
  if (session === null) {
    const painelHref = roleParam === null ? '/' : panelPathForRole(roleParam);
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: COLORS.background.page,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif',
        }}
      >
        <AccessDeniedCard message={messageEntry.message} painelHref={painelHref} />
      </main>
    );
  }

  const flags = await loadFlagsForSession(session);
  if (flags === null) {
    // Registro deletado entre emissao e verificacao — sessao invalida.
    redirect('/');
  }

  const profileKey = resolveProfileKey({
    session,
    isRH: flags.isRH,
    isLider: flags.isLider,
    acessoTotal: flags.acessoTotal,
    hasDescendingChain: flags.hasDescendingChain,
    cLevelCount: flags.cLevelCount,
    isSuperAdminInCompany: false,
  });

  const menuItems = resolveMenuItems(profileKey, flags.isResponsavelFinanceiro);
  if (menuItems === null) {
    throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
  }

  // §8.1: CTA aponta ao painel canonico do proprio perfil autenticado.
  const painelHref =
    session.kind === 'super_admin' ? '/super-admin' : panelPathForRole(session.role);

  // Header canonico §4:
  // - Super Admin em /access-denied → leftMode global (Bruno saindo
  //   fora de qualquer empresa).
  // - Platform → in_company (§4).
  const headerLeftMode: 'super_admin_global' | 'in_company' =
    session.kind === 'super_admin' ? 'super_admin_global' : 'in_company';

  // Sino: regra Q1 canonica §4.1 — apenas Bruno e RH.
  const showNotificationBell =
    session.kind === 'super_admin' ||
    (session.kind === 'platform' && (session.role === 'rh' || session.role === 'rh_lider'));

  return (
    <Layout
      menuItems={menuItems}
      header={{
        leftMode: headerLeftMode,
        companyDisplayName: session.kind === 'platform' ? session.companyDisplayName : undefined,
        companyLogoUrl:
          session.kind === 'platform' && flags.companyLogoUrl !== null
            ? flags.companyLogoUrl
            : undefined,
        user: { displayName: session.displayName },
        showNotificationBell,
      }}
    >
      <AccessDeniedCard message={messageEntry.message} painelHref={painelHref} />
    </Layout>
  );
}
