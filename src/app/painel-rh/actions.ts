'use server';

// ROIP APP 9BOX — server actions canonicas da rota `/painel-rh`
// (ME-fila3-reteste-ui).
//
// Origem canonica:
// - DOC 03 §10.7 (mecanica completa da liberacao de reteste — INSERT
//   nova tentativa + UPDATE placeholder + audit trail).
// - DOC 02 §11.1 (PC1a — RH restrito ao proprio companyId).
// - Padrao arquitetural bit-a-bit ao precedente `/nr1/actions.ts`
//   (ME-088): `requireRH` -> `createCallerFactory` com bearerToken
//   do cookie -> `router.releaseRetest(input)`.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.
// **RV-13 canonica.** Export `liberarRetesteAction` consumido pela
// `page.tsx` do `/painel-rh` (injecao em `PerfilInconsistenteBox`
// via prop `actions.liberarReteste`) e pela `page.tsx` da rota preview
// `/super-admin/empresa/[id]/painel-rh-preview` (canal unico canonico
// DOC 03 §10.6 pt.6).

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../db/client';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { createIndividualProfileRouter } from '../../server/routers/individualProfile';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

const SESSION_COOKIE = 'session';

/**
 * Guard canonico local — a matriz DOC 02 §10.3 do painel RH permite
 * Bruno (via preview), RH e RH-Lider. Super Admin autenticado como
 * Bruno em `/painel-rh` cai no fluxo espelho de `page.tsx` (preview);
 * aqui o discriminante e sobre `session.kind`.
 */
async function requireRHOrSuperAdmin(): Promise<{ token: string }> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind === 'super_admin') {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
    if (token === null) {
      redirect('/');
    }
    return { token };
  }
  const isRH = session.role === 'rh' || session.role === 'rh_lider';
  if (!isRH) {
    redirect('/access-denied?rota=/painel-rh');
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (token === null) {
    redirect('/');
  }
  return { token };
}

/**
 * Server action canonica que dispara `individualProfile.releaseRetest`
 * (DOC 03 §10.7). Erros canonicos do proc (ex.: `MSG_RETESTE_PRECONDICAO`,
 * `FORBIDDEN` por PC1e em C-level) sao propagados como `error` no
 * retorno para o modal de confirmacao apresentar ao usuario.
 *
 * Revalidacao canonica: apos sucesso, `revalidatePath('/painel-rh')`
 * e `revalidatePath('/super-admin/empresa/[id]/painel-rh-preview',
 * 'page')` para refresh do SSR da Secao 6 sem full reload manual.
 */
export async function liberarRetesteAction(input: {
  companyId: number;
  userType: 'employee' | 'clevel';
  userId: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { token } = await requireRHOrSuperAdmin();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    // Factory canonica com defaults — `releaseRetest` nao utiliza a
    // Facade de geracao IA nem o PDF renderer, entao o no-op default
    // e suficiente e evita instanciar dependencias irrelevantes.
    const router = createIndividualProfileRouter();
    const caller = createCallerFactory(router)(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    await caller.releaseRetest(input);
    // Refresh canonico da Secao 6 nas duas superficies simetricas.
    revalidatePath('/painel-rh');
    revalidatePath('/super-admin/empresa/[id]/painel-rh-preview', 'page');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao liberar reteste.';
    return { ok: false, error: message };
  } finally {
    await closeDbClient(client);
  }
}
