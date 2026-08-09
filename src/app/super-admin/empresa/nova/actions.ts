// ROIP APP 9BOX — server actions /super-admin/empresa/nova
// (ME-Rota-C-D074 — fechamento canonico bit-exact de D074).
//
// Origem canonica:
// - DOC 05 §13.1 (Aba 1 "Parametros gerais" — save unico bit-exact).
// - DOC 05 §5.4 (redirect canonico pos-save para /super-admin/empresa/[id]).
// - DOC 05 §18.7 (mensagens canonicas literais bit-exact).
// - DOC 02 §10.3 + §9.1 — exclusivo Bruno; guard defense-in-depth (S317).
// - Padrao canonico do repo: server action com guard proprio (padrao
//   /pendencias-portal/actions.ts).
//
// Escopo canonico bit-exact:
// - `criarEmpresaAction(input)` — server action canonica bit-exact que
//   valida sessao Super Admin, normaliza input (§DOC 01 §4.2 linha 180),
//   executa INSERT via helper puro `executeCreateCompany`, e retorna
//   `{ companyId }` para o client fazer o redirect canonico bit-exact
//   §5.4 DOC 05.
//
// **RV-13.** Cada export publico tem chamador na propria ME:
// - `criarEmpresaAction` → `NovaEmpresaClient.tsx` (submit do form) +
//   `tests/integration/companyCreate.test.ts` (assercoes bit-exact via
//   caller factory testam a procedure `company.create` que compartilha
//   o mesmo helper `executeCreateCompany`).

'use server';

import { closeDbClient, createDbClient } from '../../../../db/client';
import {
  CnpjDuplicateError,
  CreateCompanyInputSchema,
  CreateCompanyValidationError,
  executeCreateCompany,
  normalizeCreateCompanyInput,
  type CreateCompanyInputParsed,
} from '../../../../lib/company/createCompanyInput';
import { getServerSession } from '../../../../server/session/serverSession';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Guard canonico bit-exact (S317 defense-in-depth). Bruno EXCLUSIVO
 * (§DOC 02 §10.3 — `/super-admin/*` matchPrefix). Throw imediato se
 * sessao ausente ou role divergente — o cliente `use server` transforma
 * em erro navegavel ao browser.
 */
async function requireSuperAdminSession(actionName: string): Promise<void> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error(`${actionName}: sessao ausente ou expirada`);
  }
  if (session.kind !== 'super_admin') {
    throw new Error(`${actionName}: acesso restrito a Super Admin (§10.3 DOC 02)`);
  }
}

/**
 * Resultado canonico bit-exact do `criarEmpresaAction`. Discriminante
 * `success` para o client renderizar canonicamente bit-exact:
 * - `success=true` → toast verde §18.7 + redirect §5.4.
 * - `success=false` → toast vermelho com `canonicalMessage` (mensagens
 *   literais bit-exact §18.7).
 */
export type CriarEmpresaResult =
  | { readonly success: true; readonly companyId: number }
  | { readonly success: false; readonly canonicalMessage: string };

/**
 * Server action canonica bit-exact para o botao `[Salvar alteracoes]`
 * do formulario §13.1 (`NovaEmpresaClient.tsx`). Executa bit-exact:
 * 1. Guard Bruno EXCLUSIVO (§10.3 DOC 02).
 * 2. Parse Zod canonico bit-exact `CreateCompanyInputSchema`.
 * 3. Normalizacao canonica bit-exact §DOC 01 §4.2 (linha 180).
 * 4. INSERT canonico bit-exact via `executeCreateCompany`.
 * 5. Retorno canonico bit-exact `{ success, companyId }` ou
 *    `{ success:false, canonicalMessage }`.
 *
 * Erros nao-canonicos (erro de conexao, timeout) sao propagados (throw)
 * — o cliente `use server` os expoe como erro navegavel ao browser.
 */
export async function criarEmpresaAction(
  input: CreateCompanyInputParsed,
): Promise<CriarEmpresaResult> {
  await requireSuperAdminSession('criarEmpresaAction');

  // Parse canonico bit-exact — captura Zod errors com mensagens §18.7.
  const parseResult = CreateCompanyInputSchema.safeParse(input);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    const canonicalMessage = firstIssue?.message ?? 'Dados de entrada inválidos.';
    return { success: false, canonicalMessage };
  }

  // Normalizacao canonica bit-exact §DOC 01 §4.2 (linha 180).
  let normalized;
  try {
    normalized = normalizeCreateCompanyInput(parseResult.data);
  } catch (err) {
    if (err instanceof CreateCompanyValidationError) {
      return { success: false, canonicalMessage: err.canonicalMessage };
    }
    throw err;
  }

  // INSERT canonico bit-exact via helper puro.
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const { companyId } = await executeCreateCompany(client.db, normalized);
    return { success: true, companyId };
  } catch (err) {
    if (err instanceof CnpjDuplicateError) {
      return { success: false, canonicalMessage: err.canonicalMessage };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}
