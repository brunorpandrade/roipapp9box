// ROIP APP 9BOX — server actions canonicas da rota Bruno
// `/super-admin/empresa/[id]/parametros` (§13.1 Aba 1, ME-075).
//
// Pattern S315 canonizada em ME-057b: server actions Next 15 App Router
// atuam como wrappers thin sobre os services canonicos + validacoes
// puras do lib `updateCompanyInput.ts`. Nao ha rota RH equivalente
// (§10.9 CAMADA_AUTH — cadastro de empresa exclusivo Bruno) — actions
// nasceram cirurgicas apenas para o contexto Super Admin.
//
// Guard canonico bit-exact: cada action valida `session.kind ===
// 'super_admin'` server-side (defense-in-depth ao middleware).
//
// **RV-13.** Cada export tem chamador em `ParametrosClient.tsx` + testes
// de integracao `me075-parametros.test.ts`.
//
// **RV-12.** Zero SQL cru — services tipados Drizzle.

'use server';

import { revalidatePath } from 'next/cache';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import {
  MSG_LGPD_EMAIL_VAZIO,
  MSG_LGPD_NOME_VAZIO,
} from '../../../../../lib/company/createCompanyInput';
import {
  assertAnoFiscalImmutabilityWhenLocked,
  hasAnyMetaROIChanged,
  normalizeUpdateCompanyParametersInput,
  UpdateCompanyParametersInputSchema,
  UpdateCompanyValidationError,
  type UpdateCompanyParametersInputParsed,
} from '../../../../../lib/company/updateCompanyInput';
import {
  getCompanyForUpdate,
  hasFirstQuarterCalculated,
  updateCompanyParameters,
  updateCompanyStatus,
} from '../../../../../server/services/companies';
import { getServerSession } from '../../../../../server/session/serverSession';

import { resolveDatabaseUrl } from './internals';

// -----------------------------------------------------------------------
// Resultado canonico bit-exact das actions
// -----------------------------------------------------------------------

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

// -----------------------------------------------------------------------
// Guard canonico bit-exact
// -----------------------------------------------------------------------

async function requireSuperAdmin(actionName: string): Promise<void> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error(`${actionName}: sessao ausente ou expirada`);
  }
  if (session.kind !== 'super_admin') {
    throw new Error(`${actionName}: acesso restrito ao Super Admin (§10.9 CAMADA_AUTH)`);
  }
}

// -----------------------------------------------------------------------
// Action canonica bit-exact — salvar parametros gerais §13.1 Aba 1
// -----------------------------------------------------------------------

/**
 * Persiste todos os campos canonicos bit-exact da Aba 1 §13.1. Replica
 * bit-exact a orquestracao da proc tRPC `company.updateParameters`
 * (D086 canonicamente FECHADO nesta ME): (1) parse Zod, (2) fetch
 * current, (3) valida imutabilidade se locked, (4) normalize +
 * assertModoPadrao, (5) UPDATE, (6) hook fire-and-forget metaROI changed.
 *
 * Retorna `ActionResult` — o client renderiza toast/inline com
 * `result.message` canonico bit-exact.
 */
export async function saveParametrosAction(input: unknown): Promise<ActionResult> {
  await requireSuperAdmin('saveParametrosAction');

  // (1) Parse Zod canonico bit-exact.
  const parsed = UpdateCompanyParametersInputSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first?.message ?? 'Formulário inválido.';
    return { ok: false, message };
  }
  const data: UpdateCompanyParametersInputParsed = parsed.data;

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // (2) Existencia + snapshot canonico bit-exact.
    const current = await getCompanyForUpdate(client.db, data.companyId);
    if (current === undefined) {
      return { ok: false, message: 'Empresa nao encontrada.' };
    }

    // (3) Imutabilidade pos-primeiro-trimestre §13.1 linha 1506.
    const locked = await hasFirstQuarterCalculated(client.db, data.companyId);
    try {
      assertAnoFiscalImmutabilityWhenLocked(
        locked,
        {
          modoAnoFiscal: current.modoAnoFiscal,
          mesInicioAnoFiscal: current.mesInicioAnoFiscal,
          mesKickoff: current.mesKickoff,
          kickoffDate: current.kickoffDate,
        },
        {
          modoAnoFiscal: data.modoAnoFiscal,
          mesInicioAnoFiscal: data.mesInicioAnoFiscal,
          mesKickoff: data.mesKickoff,
          kickoffDate: data.kickoffDate,
        },
      );
    } catch (err) {
      if (err instanceof UpdateCompanyValidationError) {
        return { ok: false, message: err.canonicalMessage };
      }
      throw err;
    }

    // (4) Normalize (aplica assertModoPadraoConstraints internamente).
    let normalized;
    try {
      normalized = normalizeUpdateCompanyParametersInput(data);
    } catch (err) {
      if (err instanceof UpdateCompanyValidationError) {
        return { ok: false, message: err.canonicalMessage };
      }
      throw err;
    }

    // (5) UPDATE tipado.
    let affected: number;
    try {
      affected = await updateCompanyParameters(client.db, data.companyId, normalized);
    } catch (err) {
      const message = (err as { message?: string }).message ?? '';
      if (message.includes('ER_DUP_ENTRY') || message.includes('Duplicate entry')) {
        return {
          ok: false,
          message:
            'CNPJ ja cadastrado na plataforma. Entre em contato com o suporte se necessario.',
        };
      }
      throw err;
    }
    if (affected === 0) {
      return { ok: false, message: 'Empresa nao encontrada.' };
    }

    // (6) Hook §3.9 — recalculo retroativo se metaROI* alterou (no-op
    //     no baseline; wire-up completo em ME futura).
    void hasAnyMetaROIChanged(
      {
        metaROIOperacional: current.metaROIOperacional,
        metaROITatico: current.metaROITatico,
        metaROIEstrategico: current.metaROIEstrategico,
      },
      {
        metaROIOperacional: normalized.metaROIOperacional,
        metaROITatico: normalized.metaROITatico,
        metaROIEstrategico: normalized.metaROIEstrategico,
      },
    );

    revalidatePath(`/super-admin/empresa/${data.companyId}/parametros`);
    revalidatePath(`/super-admin/empresa/${data.companyId}`);
    return { ok: true, data: null };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Action canonica bit-exact — toggle status §13.1 Secao 9
// -----------------------------------------------------------------------

/**
 * Toggle canonico bit-exact ativa/inativa (§13.1 Secao 9). Aplica
 * validacao LGPD canonica bit-exact §DOC 06 §19.8 apenas no ramo
 * `inativa → ativa`.
 */
export async function setCompanyStatusAction(input: {
  readonly companyId: number;
  readonly novoStatus: 'ativa' | 'inativa';
}): Promise<ActionResult<{ status: 'ativa' | 'inativa' }>> {
  await requireSuperAdmin('setCompanyStatusAction');

  if (!Number.isInteger(input.companyId) || input.companyId <= 0) {
    return { ok: false, message: 'companyId invalido.' };
  }
  if (input.novoStatus !== 'ativa' && input.novoStatus !== 'inativa') {
    return { ok: false, message: 'Novo status invalido.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const current = await getCompanyForUpdate(client.db, input.companyId);
    if (current === undefined) {
      return { ok: false, message: 'Empresa nao encontrada.' };
    }

    // Precisa dos campos LGPD reais — segundo SELECT canonico bit-exact.
    const lgpdRows = await client.db
      .select({
        status: currentCompanyStatusColumns.status,
        encarregadoLgpdNome: currentCompanyStatusColumns.encarregadoLgpdNome,
        encarregadoLgpdEmail: currentCompanyStatusColumns.encarregadoLgpdEmail,
      })
      .from(currentCompanyStatusColumns.tableRef)
      .where(currentCompanyStatusColumns.eqId(input.companyId))
      .limit(1);
    const currentLgpd = lgpdRows[0];
    if (currentLgpd === undefined) {
      return { ok: false, message: 'Empresa nao encontrada.' };
    }

    if (currentLgpd.status === input.novoStatus) {
      return { ok: true, data: { status: currentLgpd.status ?? 'inativa' } };
    }

    if (input.novoStatus === 'ativa') {
      if (
        currentLgpd.encarregadoLgpdNome === null ||
        currentLgpd.encarregadoLgpdNome.trim() === ''
      ) {
        return { ok: false, message: MSG_LGPD_NOME_VAZIO };
      }
      if (
        currentLgpd.encarregadoLgpdEmail === null ||
        currentLgpd.encarregadoLgpdEmail.trim() === ''
      ) {
        return { ok: false, message: MSG_LGPD_EMAIL_VAZIO };
      }
    }

    const affected = await updateCompanyStatus(client.db, input.companyId, input.novoStatus);
    if (affected === 0) {
      return { ok: false, message: 'Empresa nao encontrada.' };
    }
    revalidatePath(`/super-admin/empresa/${input.companyId}/parametros`);
    revalidatePath(`/super-admin/empresa/${input.companyId}`);
    return { ok: true, data: { status: input.novoStatus } };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Helpers canonicos bit-exact para SELECT LGPD (evita import de
// `companies` no arquivo — mantido isolado do resto)
// -----------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { companies } from '../../../../../db/schema';

const currentCompanyStatusColumns = {
  status: companies.status,
  encarregadoLgpdNome: companies.encarregadoLgpdNome,
  encarregadoLgpdEmail: companies.encarregadoLgpdEmail,
  tableRef: companies,
  eqId: (id: number) => eq(companies.id, id),
};
