// ROIP APP 9BOX — helper canonico de sessao server-side (ME-056 Bloco A).
//
// Origem canonica:
// - DOC 02 §5.1 (Super Admin — JWT sem `exp`).
// - DOC 02 §5.2 (perfis administrativos — JWT sliding 8h).
// - DOC 02 §8.1 (Layout perfil-agnostic requer `displayName` +
//   `companyDisplayName` — nao carregados pelo JWT; queridos ao banco).
// - DOC 01 §4.2 (`superAdmins.name`), §4.3 (`companies.nomeFantasia`,
//   `companies.logoUrl`), §4.5 (`employees.name`), §4.5 clevel
//   (`cLevelMembers.name`).
// - S298 + D064 canonizada nesta ME.
//
// Contrato canonico:
// - `getServerSession()` — helper de conveniencia consumido por server
//   components e Route Handlers do App Router Next 15. Le cookie
//   canonico `session` via `cookies()`, verifica JWT via `verifyToken`,
//   e enriquece com `displayName` + `companyDisplayName` +
//   `companyLogoUrl` via query tipada Drizzle. Retorna
//   `ServerSession | null`.
// - `resolveServerSession(token, db)` — funcao pura testavel. Recebe o
//   token bruto (ou null) + instancia Drizzle, devolve a mesma
//   `ServerSession | null`. E o corpo canonico; o wrapper
//   `getServerSession` apenas resolve `token` do cookie e `db` do
//   ambiente. Separacao existe para permitir teste unit sem depender
//   de `cookies()` do Next e sem singleton de banco (S205 Facade DI).
//
// **D064 (fecha nesta ME).** Pattern canonico de leitura de sessao
// server-side reutilizado por: `access-denied/page.tsx` (refactor
// desta ME); rotas de painel (Blocos C+D); rotas transversais
// futuras (B5.3). Cookie `session` corresponde a constante local do
// `middleware.ts` (S040/S037) e do `not-found.tsx` — este modulo NAO
// exporta a constante para nao criar dependencia inversa; e literal.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `getServerSession` → consumido por `super-admin/page.tsx`,
//     `painel-rh/page.tsx`, `painel-clevel/page.tsx`,
//     `painel-lider/page.tsx`, `access-denied/page.tsx`.
//   - `resolveServerSession` → consumido por
//     `getServerSession` (mesmo arquivo) e por
//     `tests/unit/serverSession.test.ts` (RV-13 aceita test como
//     chamador nao-motor).
//   - `ServerSession` (tipo) → consumido por
//     `resolveProfileKey` (Bloco B), pelas 4 rotas de painel e pelo
//     refactor do AccessDenied.

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';

import { createDbClient, type RoipDatabase } from '../../db/client';
import { cLevelMembers, companies, employees, superAdmins } from '../../db/schema';
import { verifyToken } from '../auth/jwt';

// -----------------------------------------------------------------------
// Tipos canonicos
// -----------------------------------------------------------------------

/**
 * Uniao discriminada por `kind` — refletindo a discriminacao canonica do
 * `VerifiedToken` da ME-020 (`kind: 'platform' | 'super_admin'`). Consumidor
 * faz narrowing por `session.kind` antes de acessar campos especificos.
 *
 * Ausencia de campos `companyDisplayName` / `companyLogoUrl` no ramo
 * `super_admin` e canonica (§4 estrutura comum + §4.2): quando o
 * Super Admin esta em `/super-admin` global, o header exibe apenas
 * "Area do Super Admin" (leftMode 'super_admin_global'). Quando esta
 * dentro-de-empresa (`/super-admin/empresa/[id]/...`), o consumidor
 * deve fazer query adicional para obter os dados da empresa alvo
 * (fora do escopo desta ME — B5.3+).
 */
export type ServerSession =
  | {
      readonly kind: 'super_admin';
      readonly superAdminId: number;
      readonly displayName: string;
    }
  | {
      readonly kind: 'platform';
      readonly role: 'rh' | 'rh_lider' | 'clevel' | 'lider';
      readonly userId: number;
      readonly companyId: number;
      readonly displayName: string;
      readonly companyDisplayName: string;
      readonly companyLogoUrl: string | null;
    };

// -----------------------------------------------------------------------
// Constantes locais
// -----------------------------------------------------------------------

/**
 * Nome canonico do cookie de sessao — S040 (middleware) e S037
 * (not-found). Duplicacao canonica intencional: cada consumidor
 * declara localmente para evitar dependencia inversa entre camadas
 * (middleware Edge NAO importa modulo Node; server components podem).
 */
const SESSION_COOKIE = 'session';

// -----------------------------------------------------------------------
// Funcao pura (nucleo)
// -----------------------------------------------------------------------

/**
 * Nucleo canonico de resolucao de sessao. Puro nas dependencias:
 * recebe `token` bruto (ou null) e instancia Drizzle `db`; retorna
 * `ServerSession | null`.
 *
 * Regras canonicas:
 * - `token === null` (sem cookie) → `null`.
 * - Token invalido/expirado (`verifyToken` retorna `{ valid: false }`) → `null`.
 * - `kind === 'super_admin'`: query `superAdmins` por `superAdminId` do
 *   JWT (`sub`). Se registro ausente → `null` (registro deletado
 *   entre emissao e verificacao — canonico DOC 02 §5.1 pressupoe
 *   existencia atual).
 * - `kind === 'platform'` role `rh|rh_lider|lider`: query INNER JOIN
 *   `employees × companies` por `userId` do JWT. Se ausente → `null`.
 * - `kind === 'platform'` role `clevel`: query INNER JOIN
 *   `cLevelMembers × companies` por `userId` do JWT. Se ausente → `null`.
 *
 * NAO consulta status da empresa (§5.6 — enforcement do middleware
 * `authed` do tRPC ja cobre; aqui replicar cria duplicacao). NAO
 * consulta `isRH`, `isLider`, `acessoTotal`, `isResponsavelFinanceiro`,
 * `hasDescendingChain`, `cLevelCount` — sao entrada do
 * `resolveProfileKey` (ME-056 Bloco B), calculadas pelo consumidor via
 * queries dedicadas.
 */
export async function resolveServerSession(
  token: string | null,
  db: RoipDatabase,
): Promise<ServerSession | null> {
  if (token === null || token.length === 0) {
    return null;
  }
  const verified = await verifyToken(token);
  if (!verified.valid) {
    return null;
  }
  const inner = verified.token;

  if (inner.kind === 'super_admin') {
    const rows = await db
      .select({ name: superAdmins.name })
      .from(superAdmins)
      .where(eq(superAdmins.id, inner.claims.superAdminId))
      .limit(1);
    const superRow = rows[0];
    if (superRow === undefined) {
      return null;
    }
    return {
      kind: 'super_admin',
      superAdminId: inner.claims.superAdminId,
      displayName: superRow.name,
    };
  }

  // inner.kind === 'platform'
  const platformClaims = inner.claims;
  if (platformClaims.role === 'clevel') {
    const rows = await db
      .select({
        name: cLevelMembers.name,
        nomeFantasia: companies.nomeFantasia,
        logoUrl: companies.logoUrl,
      })
      .from(cLevelMembers)
      .innerJoin(companies, eq(companies.id, cLevelMembers.companyId))
      .where(eq(cLevelMembers.id, platformClaims.userId))
      .limit(1);
    const clevelRow = rows[0];
    if (clevelRow === undefined) {
      return null;
    }
    return {
      kind: 'platform',
      role: 'clevel',
      userId: platformClaims.userId,
      companyId: platformClaims.companyId,
      displayName: clevelRow.name,
      companyDisplayName: clevelRow.nomeFantasia,
      companyLogoUrl: clevelRow.logoUrl,
    };
  }

  // role IN ('rh', 'rh_lider', 'lider') → employees
  const rows = await db
    .select({
      name: employees.name,
      nomeFantasia: companies.nomeFantasia,
      logoUrl: companies.logoUrl,
    })
    .from(employees)
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .where(eq(employees.id, platformClaims.userId))
    .limit(1);
  const empRow = rows[0];
  if (empRow === undefined) {
    return null;
  }
  return {
    kind: 'platform',
    role: platformClaims.role,
    userId: platformClaims.userId,
    companyId: platformClaims.companyId,
    displayName: empRow.name,
    companyDisplayName: empRow.nomeFantasia,
    companyLogoUrl: empRow.logoUrl,
  };
}

// -----------------------------------------------------------------------
// Helper de conveniencia (wrapper)
// -----------------------------------------------------------------------

/**
 * Resolve `DATABASE_URL` do ambiente. Falha ruidosa se ausente — o
 * server component em producao nao pode operar sem base configurada.
 * Padrao canonico do repo (trpc.ts, route handlers de reports).
 */
function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Wrapper canonico consumido pelos server components e Route Handlers.
 * Le cookie `session` via `cookies()` do Next 15 e resolve via
 * `resolveServerSession`. Cria cliente Drizzle por invocacao — cada
 * render de server component em Next 15 e isolado; nao ha singleton
 * util nesse escopo. O pool `mysql2` e criado e fechado dentro da
 * chamada para nao pendurar conexoes.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  const token = cookie === undefined ? null : cookie.value;

  const client = createDbClient(resolveDatabaseUrl());
  try {
    return await resolveServerSession(token, client.db);
  } finally {
    await client.pool.end();
  }
}
