// ROIP APP 9BOX — server actions `/pendencias-portal` (ME-058 §14.23).
//
// Origem canonica:
// - DOC 05 §14.23 — 3 acoes canonicas via server action:
//   - `atualizarAction` — re-fetch em mudanca de filtro/paginacao.
//   - `enviarLembreteAction` — envio individual de 1 lembrete com
//     cooldown 72h (§14.23 linha 2652).
//   - `enviarLembretesEmMassaAction` — envio de N lembretes com skip
//     automatico de itens em cooldown (§14.23 linha 2662-2670).
// - DOC 02 §10.4 + §9.9 — guard defense-in-depth: `rh` OU `rh_lider`
//   OU `super_admin`. C-level e Lider recebem redirect via middleware
//   (matrix.ts); as actions revalidam para prevenir chamada direta via
//   fetch spoof.
// - S299/S315/S317: 1 conversa = 1 sub-ME = 1 commit; guard `session.kind`
//   no inicio da action (S317 canonizada em ME-057b).
// - DOC 01 §M004 `portalReminderLog` — chave semantica (employeeId,
//   instrumentType, cycleReference); cada envio bem-sucedido grava 1
//   linha; cooldown = ultima linha com `success = true` dentro de 72h.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `atualizarAction` → `PendenciasClient.tsx` (onChange filtros e
//     paginacao) + `me058-pendencias.test.ts`.
//   - `enviarLembreteAction` → `PendenciasClient.tsx` (modal
//     individual §14.23 linhas 2643-2658) + `me058-pendencias.test.ts`.
//   - `enviarLembretesEmMassaAction` → `PendenciasClient.tsx` (modal
//     massivo §14.23 linhas 2660-2680) + `me058-pendencias.test.ts`.

'use server';

import { randomUUID } from 'node:crypto';

import { and, eq, gte } from 'drizzle-orm';

import { closeDbClient, createDbClient } from '../../db/client';
import { employees, portalReminderLog } from '../../db/schema';
import type { PortalInstrumentType } from '../../db/schema/enums';
import {
  loadPendenciasPage,
  type PendenciasLoadResult,
} from '../../lib/pendencias/pendenciasEngine';
import { getServerSession } from '../../server/session/serverSession';

import { type PendenciasFilters } from './filters';
import { COOLDOWN_LEMBRETE_MS } from './mappings';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Guard canonico (S317 defense-in-depth). Retorna a sessao autenticada
 * quando o perfil pode operar `/pendencias-portal` (RH puro, RH-Lider,
 * ou Super Admin). Caso contrario, throw imediato — o cliente `use server`
 * transforma em erro navegavel ao browser.
 *
 * Racional: matrix.ts (`/pendencias-portal`) permite `super_admin`, `rh`
 * e `rh_lider`. C-level e Lider recebem redirect Server-Side via
 * middleware antes de qualquer action ser chamada.
 */
async function requireAuthorizedSession(actionName: string): Promise<{
  readonly companyIdOverride: number | null;
  readonly actorId: string;
  readonly actorType: 'employee' | 'superAdmin';
}> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error(`${actionName}: sessao ausente ou expirada`);
  }
  if (session.kind === 'super_admin') {
    return {
      companyIdOverride: null,
      actorId: String(session.superAdminId),
      actorType: 'superAdmin',
    };
  }
  // platform: apenas rh e rh_lider (S317).
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    throw new Error(`${actionName}: acesso restrito a RH e Super Admin (§9.9 / §10.4)`);
  }
  return {
    companyIdOverride: session.companyId,
    actorId: String(session.userId),
    actorType: 'employee',
  };
}

/**
 * Parametros canonicos do re-fetch. `companyId` opcional canonico:
 * - Rota RH puro (`/pendencias-portal`): companyId ausente → derivado da
 *   sessao (session.companyId).
 * - Rota Bruno (`/super-admin/empresa/[id]/pendencias-portal`): companyId
 *   explicito no parametro (Bruno nao tem session.companyId).
 */
export interface AtualizarPendenciasInput {
  readonly companyId: number | null;
  readonly filters: PendenciasFilters;
  readonly page: number;
  readonly pageSize: 25 | 50 | 100;
}

/**
 * Re-fetch canonico de `/pendencias-portal` em mudanca de filtro ou
 * paginacao. Cross-tenant safe: RH puro/RH-Lider consomem companyId da
 * sessao; Bruno passa companyId explicito e action valida `session.kind
 * === 'super_admin'` para aceitar override.
 */
export async function atualizarPendenciasAction(
  input: AtualizarPendenciasInput,
): Promise<PendenciasLoadResult> {
  const auth = await requireAuthorizedSession('atualizarPendenciasAction');

  // Resolucao canonica de companyId (cross-tenant safety).
  let effectiveCompanyId: number;
  if (auth.companyIdOverride !== null) {
    // RH/RH-Lider — sempre usar companyId da sessao, ignorar input.
    effectiveCompanyId = auth.companyIdOverride;
  } else {
    // Super Admin — usar companyId do input (contexto dentro-de-empresa).
    if (input.companyId === null || !Number.isInteger(input.companyId) || input.companyId <= 0) {
      throw new Error('atualizarPendenciasAction: companyId obrigatorio para Super Admin');
    }
    effectiveCompanyId = input.companyId;
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    return await loadPendenciasPage({
      db: client.db,
      companyId: effectiveCompanyId,
      filters: input.filters,
      page: input.page,
      pageSize: input.pageSize,
    });
  } finally {
    await closeDbClient(client);
  }
}

/**
 * Parametros canonicos do envio individual §14.23 linha 2643-2658.
 */
export interface EnviarLembreteInput {
  readonly companyId: number | null;
  readonly employeeId: number;
  readonly instrumento: PortalInstrumentType;
  readonly cicloReferencia: string | null;
}

/**
 * Resultado canonico do envio individual. `success = true` grava 1
 * linha em `portalReminderLog` e devolve `sentAt` para o cliente
 * atualizar o cooldown na linha. `success = false` com `reason` para
 * mensagem canonica no toast.
 */
export interface EnviarLembreteResult {
  readonly success: boolean;
  readonly sentAt: Date | null;
  readonly reason: 'ok' | 'cooldown' | 'employee_not_found' | 'cross_tenant';
}

/**
 * Envio canonico individual de lembrete §14.23. Executa:
 * 1. Guard defense-in-depth (session + role).
 * 2. Cross-tenant check: employees.companyId === effectiveCompanyId.
 * 3. Cooldown check: nenhum envio bem-sucedido nas ultimas 72h para
 *    (employeeId, instrumentType, cycleReference).
 * 4. Grava linha em portalReminderLog com `success = true`.
 *
 * **Nao envia email/push real nesta ME** — o campo `success` marca
 * apenas registro da acao (contrato canonico do log de auditoria). A
 * emissao efetiva de notificacao push/email fica para ME futura de
 * infraestrutura de mensageria; a semantica de "lembrete enviado" no
 * §14.23 opera sobre `portalReminderLog` (que e o unico ponto de
 * verdade canonico do cooldown).
 */
export async function enviarLembreteAction(
  input: EnviarLembreteInput,
): Promise<EnviarLembreteResult> {
  const auth = await requireAuthorizedSession('enviarLembreteAction');

  let effectiveCompanyId: number;
  if (auth.companyIdOverride !== null) {
    effectiveCompanyId = auth.companyIdOverride;
  } else {
    if (input.companyId === null || !Number.isInteger(input.companyId) || input.companyId <= 0) {
      throw new Error('enviarLembreteAction: companyId obrigatorio para Super Admin');
    }
    effectiveCompanyId = input.companyId;
  }

  if (!Number.isInteger(input.employeeId) || input.employeeId <= 0) {
    throw new Error('enviarLembreteAction: employeeId invalido');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // Cross-tenant: valida que o colaborador pertence a empresa efetiva.
    const empRows = await client.db
      .select({ id: employees.id, companyId: employees.companyId })
      .from(employees)
      .where(eq(employees.id, input.employeeId))
      .limit(1);
    const empRow = empRows[0];
    if (empRow === undefined) {
      return { success: false, sentAt: null, reason: 'employee_not_found' };
    }
    if (empRow.companyId !== effectiveCompanyId) {
      return { success: false, sentAt: null, reason: 'cross_tenant' };
    }

    // Cooldown 72h: existe log de sucesso nas ultimas 72h para a tripla?
    const now = new Date();
    const cooldownWindow = new Date(now.getTime() - COOLDOWN_LEMBRETE_MS);
    const cooldownRows = await client.db
      .select({ id: portalReminderLog.id })
      .from(portalReminderLog)
      .where(
        and(
          eq(portalReminderLog.employeeId, input.employeeId),
          eq(portalReminderLog.instrumentType, input.instrumento),
          eq(portalReminderLog.success, true),
          gte(portalReminderLog.sentAt, cooldownWindow),
        ),
      )
      .limit(1);
    if (cooldownRows.length > 0) {
      return { success: false, sentAt: null, reason: 'cooldown' };
    }

    // Grava log canonico.
    const sentAt = new Date();
    await client.db.insert(portalReminderLog).values({
      id: randomUUID(),
      employeeId: input.employeeId,
      instrumentType: input.instrumento,
      cycleReference: input.cicloReferencia,
      sentAt,
      sentBy: auth.actorId,
      sentByType: auth.actorType,
      success: true,
      failReason: null,
    });
    return { success: true, sentAt, reason: 'ok' };
  } finally {
    await closeDbClient(client);
  }
}

/**
 * Parametros canonicos do envio em massa §14.23 linhas 2660-2680. O
 * cliente monta a lista a partir do resultado atual filtrado. A action
 * itera aplicando o cooldown check individualmente (semantica canonica:
 * itens em cooldown sao pulados silenciosamente; nao sao erro).
 */
export interface EnviarLembretesEmMassaInput {
  readonly companyId: number | null;
  readonly alvos: readonly {
    readonly employeeId: number;
    readonly instrumento: PortalInstrumentType;
    readonly cicloReferencia: string | null;
  }[];
}

/**
 * Resultado canonico do envio em massa §14.23 linha 2668-2670:
 * - `enviados` — total de linhas em portalReminderLog gravadas com sucesso.
 * - `puladosCooldown` — total de alvos em cooldown (skip silencioso).
 * - `falhas` — total de alvos com erro (employee not found, cross-tenant).
 * O cliente exibe toast canonico: `Lembretes enviados: {enviados}.
 * Pulados por cooldown: {puladosCooldown}.`
 */
export interface EnviarLembretesEmMassaResult {
  readonly enviados: number;
  readonly puladosCooldown: number;
  readonly falhas: number;
}

/**
 * Envio em massa canonico §14.23. Iterativo (nao paralelo) para
 * preservar determinismo do cooldown check (uma insert por vez —
 * MySQL auto-commit isolado, sem transacao envolvente). Total esperado
 * por chamada < 500 alvos (upper bound de 1 empresa media com todas
 * pendencias); custo aceitavel.
 */
export async function enviarLembretesEmMassaAction(
  input: EnviarLembretesEmMassaInput,
): Promise<EnviarLembretesEmMassaResult> {
  const auth = await requireAuthorizedSession('enviarLembretesEmMassaAction');

  let effectiveCompanyId: number;
  if (auth.companyIdOverride !== null) {
    effectiveCompanyId = auth.companyIdOverride;
  } else {
    if (input.companyId === null || !Number.isInteger(input.companyId) || input.companyId <= 0) {
      throw new Error('enviarLembretesEmMassaAction: companyId obrigatorio para Super Admin');
    }
    effectiveCompanyId = input.companyId;
  }

  if (input.alvos.length === 0) {
    return { enviados: 0, puladosCooldown: 0, falhas: 0 };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    let enviados = 0;
    let puladosCooldown = 0;
    let falhas = 0;
    const now = new Date();
    const cooldownWindow = new Date(now.getTime() - COOLDOWN_LEMBRETE_MS);

    for (const alvo of input.alvos) {
      if (!Number.isInteger(alvo.employeeId) || alvo.employeeId <= 0) {
        falhas += 1;
        continue;
      }

      // Cross-tenant check por alvo.
      const empRows = await client.db
        .select({ id: employees.id, companyId: employees.companyId })
        .from(employees)
        .where(eq(employees.id, alvo.employeeId))
        .limit(1);
      const empRow = empRows[0];
      if (empRow === undefined || empRow.companyId !== effectiveCompanyId) {
        falhas += 1;
        continue;
      }

      // Cooldown check.
      const cooldownRows = await client.db
        .select({ id: portalReminderLog.id })
        .from(portalReminderLog)
        .where(
          and(
            eq(portalReminderLog.employeeId, alvo.employeeId),
            eq(portalReminderLog.instrumentType, alvo.instrumento),
            eq(portalReminderLog.success, true),
            gte(portalReminderLog.sentAt, cooldownWindow),
          ),
        )
        .limit(1);
      if (cooldownRows.length > 0) {
        puladosCooldown += 1;
        continue;
      }

      // Grava log.
      await client.db.insert(portalReminderLog).values({
        id: randomUUID(),
        employeeId: alvo.employeeId,
        instrumentType: alvo.instrumento,
        cycleReference: alvo.cicloReferencia,
        sentAt: new Date(),
        sentBy: auth.actorId,
        sentByType: auth.actorType,
        success: true,
        failReason: null,
      });
      enviados += 1;
    }

    return { enviados, puladosCooldown, falhas };
  } finally {
    await closeDbClient(client);
  }
}
