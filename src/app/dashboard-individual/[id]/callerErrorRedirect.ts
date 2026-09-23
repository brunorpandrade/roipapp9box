// ROIP APP 9BOX — traducao do erro de um caller tRPC do dashboard individual
// em navegacao do App Router. Fonte unica consumida por `page.tsx` nas duas
// chamadas a `getEmployeeDashboard` (carga inicial + snapshot de trimestre).
//
// Motivacao: a pagina delega a autorizacao ao resolver. Alem de FORBIDDEN
// (acesso negado) e NOT_FOUND (alvo inexistente), o middleware de sessao pode
// lancar UNAUTHORIZED quando a sessao foi invalidada (§5.7 — troca de senha/
// e-mail, reset). Sem tratamento, esse UNAUTHORIZED sobe como 500 "Erro
// interno"; o correto e redirecionar ao login, como o `getServerSession`
// nulo ja faz. Qualquer outro erro permanece propagando.
//
// **RV-13.** Consumido por `page.tsx` + `tests/unit/dashboardCallerErrorRedirect.test.ts`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { TRPCError } from '@trpc/server';
import { notFound, redirect } from 'next/navigation';

/** Tipo de sessao ja resolvido pela pagina (plataforma ou Super Admin). */
export type DashboardSessionKind = 'platform' | 'super_admin';

/**
 * Rota de login por tipo de sessao (§5.7 — sessao invalidada volta ao login):
 * plataforma -> `/` (login unificado); Super Admin -> `/login-super-admin`.
 */
export function loginRedirectPath(kind: DashboardSessionKind): string {
  return kind === 'super_admin' ? '/login-super-admin' : '/';
}

/**
 * Traduz o erro de um caller tRPC do dashboard individual:
 *   - FORBIDDEN   -> `/access-denied?rota=/dashboard-individual`;
 *   - NOT_FOUND   -> `notFound()` (404);
 *   - UNAUTHORIZED-> login (§5.7), nunca 500 "Erro interno";
 *   - qualquer outro erro -> re-lancado.
 * Retorna `never`: `redirect`/`notFound` do Next lancam controle de fluxo, e
 * o ramo final re-lanca. Provado nos dois sentidos (RV-03) no teste unitario.
 */
export function translateDashboardCallerError(err: unknown, kind: DashboardSessionKind): never {
  if (err instanceof TRPCError) {
    if (err.code === 'FORBIDDEN') {
      redirect('/access-denied?rota=/dashboard-individual');
    }
    if (err.code === 'NOT_FOUND') {
      notFound();
    }
    if (err.code === 'UNAUTHORIZED') {
      redirect(loginRedirectPath(kind));
    }
  }
  throw err;
}
