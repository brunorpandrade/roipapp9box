// ROIP APP 9BOX — myData router (ME-082).
//
// Origem canonica: DOC 02 §4.6 (/meus-dados H1a/H1b) + DOC 05 §14.5.
//
// Procs canonicas:
//   - getForCurrentUser(): retorna payload H1a (super_admin) ou H1b
//     (rh/rh_lider/clevel/lider) conforme perfil da sessao.
//   - updateName(input): atualiza displayName do super_admin. Restrito
//     via requireSuperAdmin (H1a apenas — H1b nao permite edicao).
//
// Reaproveitamentos canonicos:
//   - getSuperAdminById, updateSuperAdminName -> services/superAdmins.ts
//   - getEmployeeById -> services/employees.ts
//   - getCLevelMemberById -> services/cLevelMembers.ts
//   - resolveMicrocopyAlterarEmail, resolveBadgePapel ->
//     app/meus-dados/internals.ts (helpers puros compartilhados).
//
// **RV-12.** 100% Drizzle tipado via helpers dos services. Sem SQL cru.
// **RV-13.** Router acoplado ao appRouter em routers/index.ts na mesma
// ME. Procs consumidas por app/meus-dados/page.tsx (loader) e
// actions.ts (atualizacao de nome).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { employeeLeaderHistory } from '../../db/schema';
import { requireSuperAdmin } from '../../lib/routes/requireSuperAdmin';
import type { RoipDatabase } from '../../db/client';
import {
  MSG_NOME_ATUALIZADO,
  NOME_MAX_LENGTH,
  resolveBadgePapel,
  resolveMicrocopyAlterarEmail,
  type H1bVinculo,
  type MeusDadosH1aPayload,
  type MeusDadosH1bPayload,
  type MeusDadosPayload,
} from '../../app/meus-dados/internals';
import { getCLevelMemberById } from '../services/cLevelMembers';
import { getEmployeeById } from '../services/employees';
import { getSuperAdminById, updateSuperAdminName } from '../services/superAdmins';
import { protectedProcedure, router } from '../trpc';

// -----------------------------------------------------------------------
// Contratos canonicos
// -----------------------------------------------------------------------

/**
 * Input canonico de myData.updateName. Validacao canonica DOC 05
 * §14.5 H1a fluxo edicao: `trim().length > 0 && length <= 100`.
 * A validacao de `trim().length > 0` fica no `.refine` pois zod min(1)
 * apenas cobre string.length. `max(100)` cobre length canonico.
 */
const updateNameInput = z.object({
  nome: z
    .string()
    .max(NOME_MAX_LENGTH, `O nome deve ter no máximo ${NOME_MAX_LENGTH} caracteres.`)
    .refine((v) => v.trim().length > 0, {
      message: 'O nome é obrigatório.',
    }),
});

/**
 * Resposta canonica de myData.updateName. `msg` literal canonico
 * §14.5. `novoNome` retornado para o cliente propagar imediatamente
 * no card, header e avatar (recalculo das iniciais) sem re-fetch.
 */
export interface UpdateNameResult {
  readonly msg: string;
  readonly novoNome: string;
}

// -----------------------------------------------------------------------
// Auxiliares canonicos
// -----------------------------------------------------------------------

/**
 * Serializa Date do driver mysql2 (coluna `date` do Drizzle) para
 * string ISO 8601 "YYYY-MM-DD". Aceita string quando o driver ja
 * devolveu formatada. Padrao canonico compartilhado com
 * `services/lgpdPortability.ts:151`.
 */
function toYYYYMMDD(d: Date | string): string {
  if (typeof d === 'string') return d;
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Busca nome do lider direto do employee via employeeLeaderHistory
 * (DOC 01 §4.7 — dataFim IS NULL identifica vinculo ativo). Prefere
 * liderId (employee -> employee); se ausente, tenta clevelId
 * (employee -> C-level).
 *
 * Retorna string vazia quando nao ha vinculo ativo.
 */
async function findLiderDiretoName(db: RoipDatabase, employeeId: number): Promise<string | null> {
  const rows = await db
    .select({
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
    })
    .from(employeeLeaderHistory)
    .where(
      and(eq(employeeLeaderHistory.employeeId, employeeId), isNull(employeeLeaderHistory.dataFim)),
    )
    .orderBy(desc(employeeLeaderHistory.dataInicio))
    .limit(1);
  const vinculo = rows[0];
  if (vinculo === undefined) {
    return null;
  }
  if (vinculo.liderId !== null) {
    const lider = await getEmployeeById(db, vinculo.liderId);
    return lider?.name ?? null;
  }
  if (vinculo.clevelId !== null) {
    const clevel = await getCLevelMemberById(db, vinculo.clevelId);
    return clevel?.name ?? null;
  }
  return null;
}

/**
 * Mapa canonico papelPlataforma a partir do role platform + isRH +
 * isLider. Usado apenas para H1b Secao 2 (Vinculo profissional).
 *
 * Regra canonica DOC 05 §14.5 Secao 2: espelha o badge Secao 1.
 */
function resolvePapelPlataformaEmployee(role: 'rh' | 'rh_lider' | 'lider'): string {
  switch (role) {
    case 'rh':
      return 'RH';
    case 'rh_lider':
      return 'RH e Líder';
    case 'lider':
      return 'Líder';
  }
}

// -----------------------------------------------------------------------
// Loaders canonicos por perfil
// -----------------------------------------------------------------------

/**
 * Loader canonico H1a — Super Admin.
 */
async function loadH1a(db: RoipDatabase, superAdminId: number): Promise<MeusDadosH1aPayload> {
  const admin = await getSuperAdminById(db, superAdminId);
  if (admin === undefined) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
  }
  const contaCriadaEm = admin.createdAt === null ? '' : admin.createdAt.toISOString();
  return {
    kind: 'h1a',
    displayName: admin.name,
    email: admin.email,
    contaCriadaEm,
  };
}

/**
 * Loader canonico H1b para employees (rh, rh_lider, lider).
 */
async function loadH1bEmployee(
  db: RoipDatabase,
  employeeId: number,
  role: 'rh' | 'rh_lider' | 'lider',
): Promise<MeusDadosH1bPayload> {
  const emp = await getEmployeeById(db, employeeId);
  if (emp === undefined) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
  }
  const liderDireto = await findLiderDiretoName(db, employeeId);
  const vinculo: H1bVinculo = {
    tipo: 'employee',
    papelPlataforma: resolvePapelPlataformaEmployee(role),
    cargo: emp.cargo,
    cbo: emp.cbo,
    descricaoCBO: emp.descricaoCBO,
    familiaFuncao: emp.jobFamily,
    senioridade: emp.senioridade,
    nivelHierarquico: emp.nivelHierarquico,
    departamento: emp.departamento,
    liderDireto,
  };
  return {
    kind: 'h1b',
    displayName: emp.name,
    badgePapel: resolveBadgePapel(role),
    cpfCompleto: emp.cpf,
    dataNascimento: toYYYYMMDD(emp.dataNascimento),
    dataAdmissao: toYYYYMMDD(emp.dataAdmissao),
    statusAtivo: (emp.status ?? 'ativo') === 'ativo',
    vinculo,
    email: emp.email,
    microcopyAlterarEmail: resolveMicrocopyAlterarEmail(role),
  };
}

/**
 * Loader canonico H1b para C-level.
 */
async function loadH1bClevel(db: RoipDatabase, clevelId: number): Promise<MeusDadosH1bPayload> {
  const clevel = await getCLevelMemberById(db, clevelId);
  if (clevel === undefined) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
  }
  const escopoVisualizacao =
    (clevel.acessoTotal ?? true)
      ? ('Empresa inteira' as const)
      : ('Própria cadeia descendente' as const);
  const vinculo: H1bVinculo = {
    tipo: 'clevel',
    papelPlataforma: 'C-level',
    cargo: clevel.cargo,
    descricaoCargo: clevel.descricaoCargo,
    departamento: clevel.departamento,
    escopoVisualizacao,
  };
  return {
    kind: 'h1b',
    displayName: clevel.name,
    badgePapel: 'C-level',
    cpfCompleto: clevel.cpf,
    dataNascimento: toYYYYMMDD(clevel.dataNascimento),
    dataAdmissao: toYYYYMMDD(clevel.dataAdmissao),
    statusAtivo: (clevel.status ?? 'ativo') === 'ativo',
    vinculo,
    email: clevel.email,
    microcopyAlterarEmail: resolveMicrocopyAlterarEmail('clevel'),
  };
}

// -----------------------------------------------------------------------
// Router canonico
// -----------------------------------------------------------------------

export const myDataRouter = router({
  /**
   * Retorna o payload canonico H1a ou H1b conforme perfil da sessao
   * autenticada. Consumido pelo loader inline de
   * src/app/meus-dados/page.tsx.
   *
   * Colaborador puro nao chega aqui — a rota bloqueia via matrix.ts
   * §10.2 antes do middleware trpc.
   */
  getForCurrentUser: protectedProcedure.query(async ({ ctx }): Promise<MeusDadosPayload> => {
    if (ctx.user.role === 'super_admin') {
      return loadH1a(ctx.db, ctx.user.superAdminId);
    }
    if (ctx.user.role === 'clevel') {
      return loadH1bClevel(ctx.db, ctx.user.userId);
    }
    // role = 'rh' | 'rh_lider' | 'lider'
    return loadH1bEmployee(ctx.db, ctx.user.userId, ctx.user.role);
  }),
  /**
   * Atualiza o displayName do Super Admin. Restrito via
   * requireSuperAdmin — H1b (rh/rh_lider/clevel/lider) nao permite
   * edicao inline do nome.
   *
   * DOC 05 §14.5 H1a fluxo edicao itens 3 e 4:
   *   - Validacao client-side + server-side: trim().length > 0 &&
   *     length <= 100. Server-side redundante (zod .max(100) +
   *     .refine).
   *   - Sucesso: retorna { msg: 'Nome atualizado.', novoNome }. Cliente
   *     propaga no card, header, avatar.
   */
  updateName: protectedProcedure
    .input(updateNameInput)
    .mutation(async ({ ctx, input }): Promise<UpdateNameResult> => {
      // Narrowing canonico: requireSuperAdmin lanca FORBIDDEN se
      // qualquer outro perfil chegar aqui. Redundante ao guard client
      // (H1b nao renderiza [Editar]), mas defense-in-depth server-side.
      // Convertemos ServerSession do ctx trpc (ctx.user) para o formato
      // legado — o requireSuperAdmin le apenas kind + superAdminId.
      const session =
        ctx.user.role === 'super_admin'
          ? {
              kind: 'super_admin' as const,
              superAdminId: ctx.user.superAdminId,
              displayName: '',
            }
          : null;
      const admin = requireSuperAdmin(session);
      const trimmed = input.nome.trim();
      const affected = await updateSuperAdminName(ctx.db, admin.superAdminId, trimmed);
      if (affected === 0) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Falha ao atualizar o nome.',
        });
      }
      return { msg: MSG_NOME_ATUALIZADO, novoNome: trimmed };
    }),
});

export type MyDataRouter = typeof myDataRouter;
