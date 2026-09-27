// ROIP APP 9BOX — guard canonico de operacoes RH (ME 3.5 Dispatch 2).
//
// Substituto de `roleProcedure(['super_admin','rh','rh_lider'])` para os
// ~15 procs administrativos que operam funcoes de RH (upload de
// colaboradores, dados mensais RH, onboarding de lideres, transferencias
// de lideranca). Aceita as tres roles historicas MAIS a nova combinacao
// canonicamente aprovada pela ME 3.5:
//
//   - super_admin (Bruno)
//   - platform.role === 'rh'
//   - platform.role === 'rh_lider'
//   - platform.role === 'clevel' AND cLevelMembers.isRH === true
//
// A quarta linha e a novidade desta ME. O C-level com o flag `isRH`
// ativado (setado apenas pelo Super Admin — regua §12 DOC 02 herdada do
// guard `roleProcedure(['super_admin'])` em cLevelMembers.create/update)
// ganha acesso as rotas RH sem alterar `session.role`. Isso preserva o
// contrato canonico `session.role` (5 valores fechados §2.2 DOC 02) e a
// dupla identidade (dashboards C-level + operacoes RH) e organizada
// visualmente pelo toggle "Painel C-level / Painel RH" (Dispatch 4).
//
// Regua §2.4 (isolamento por empresa): NAO reimplementada aqui — os
// consumidores continuam chamando `assertUserCompanyScope`/`assertCompany
// Scope` normalmente sobre o `input.companyId` recebido. O guard so
// decide "esta sessao pode operar RH?"; nao decide "sobre qual empresa".
//
// Escopo do C-level restrito (acessoTotal=false): herdado do
// `assertUserCompanyScope` + guards de cadeia descendente ja aplicados em
// cada handler. RH de C-level restrito enxerga apenas a cadeia dele
// (opcao A canonizada em bloco na abertura desta ME).
//
// **RV-12.** Zero SQL cru — persistencia via Drizzle tipado
// (`loadCLevelSessionContext`, fonte unica).
// **RV-13.** Consumidor real desta helper e substituido `roleProcedure` em
// employees, monthlyData, spreadsheets, leaderOnboarding, leadership
// Transfer (Dispatch 2). MSG_RH_ALLOWED_FORBIDDEN e `decideRhAllowed`
// reusados em `tests/unit/me-3-5-d2-rh-allowed-decision.test.ts`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { TRPCError } from '@trpc/server';

import { loadCLevelSessionContext } from '../../lib/session/cLevelSessionContext';
import { protectedProcedure, type AuthenticatedUser } from '../trpc';

/**
 * Mensagem canonica de FORBIDDEN emitida quando a sessao autenticada nao
 * satisfaz a matriz `super_admin | rh | rh_lider | clevel-with-isRH`.
 * Preserva o vocabulario do guard historico `roleProcedure` (§8.3 DOC 02).
 */
export const MSG_RH_ALLOWED_FORBIDDEN = 'Perfil sem permissao para a rota.' as const;

/** Veredito canonico da decisao de acesso RH (RV-13 — testado). */
export type RhAllowedDecision = 'allow' | 'forbid';

/**
 * Decisao pura canonica (RV-13 — testavel sem tRPC nem banco). Recebe o
 * usuario autenticado e o valor de `cLevelMembers.isRH` do titular quando
 * `user.role === 'clevel'` (para as demais roles, o parametro e ignorado
 * e o caller pode passar `null`).
 *
 * Regras canonicas:
 *   - super_admin → allow (Bruno atravessa tudo).
 *   - rh, rh_lider → allow (comportamento historico preservado).
 *   - clevel + clevelIsRH === true → allow (ME 3.5 D2).
 *   - clevel + clevelIsRH === false | null → forbid.
 *   - lider → forbid.
 */
export function decideRhAllowed(
  user: AuthenticatedUser,
  clevelIsRH: boolean | null,
): RhAllowedDecision {
  if (user.role === 'super_admin') {
    return 'allow';
  }
  if (user.role === 'rh' || user.role === 'rh_lider') {
    return 'allow';
  }
  if (user.role === 'clevel' && clevelIsRH === true) {
    return 'allow';
  }
  return 'forbid';
}

/**
 * Guard canonico RH-allowed para procedures do transporte tRPC. Uso
 * bit-exact ao `roleProcedure(...)` — o handler que consome recebe o
 * mesmo `ctx.user` tipado e o mesmo contrato de `.input(...)`/`.mutation`
 * ou `.query`.
 *
 * O custo de I/O do SELECT em `cLevelMembers.isRH` (via `loadCLevelSession
 * Context`) e pago apenas quando `ctx.user.role === 'clevel'` — para as
 * demais roles, a decisao e sincrona e sem banco.
 */
export function rhAllowedProcedure() {
  return protectedProcedure.use(async ({ ctx, next }) => {
    let clevelIsRH: boolean | null = null;
    if (ctx.user.role === 'clevel') {
      const cctx = await loadCLevelSessionContext(ctx.db, ctx.user.companyId, ctx.user.userId);
      clevelIsRH = cctx === null ? null : cctx.isRH;
    }
    const decision = decideRhAllowed(ctx.user, clevelIsRH);
    if (decision === 'forbid') {
      throw new TRPCError({ code: 'FORBIDDEN', message: MSG_RH_ALLOWED_FORBIDDEN });
    }
    return next({ ctx });
  });
}
