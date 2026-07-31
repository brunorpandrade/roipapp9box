// ROIP APP 9BOX — resolvedor canonico de destinatarios do motor de alertas (ME-059).
//
// Origem canonica:
// - DOC 06 §7.1 (trilha padrao — todos os RHs ativos + todos os Super
//   Admins ativos, com deduplicacao por e-mail).
// - DOC 06 §7.2 (escopoDepartamentoId nao filtra destinatarios na
//   trilha padrao — usado apenas para contexto visual do e-mail).
// - DOC 06 §7.3 (trilhas exclusivas D049 apenas-bruno e D050 apenas-RF).
// - DOC 06 §7.4 (fallback zero destinatarios: array vazio = warning +
//   descarte silencioso; apenas Bruno = grava normalmente sob T2).
//
// Contrato canonico:
// - Funcao com I/O. Recebe `db`, `companyId`, `tipo`, e opcionalmente
//   contexto de D050 (`novoResponsavelId` + `novoResponsavelTipo`).
// - Retorna array (possivelmente vazio) de destinatarios canonicos com
//   { destinatarioTipo, destinatarioEmail, destinatarioEmployeeId }.
// - Deduplicacao canonica por e-mail na trilha padrao: se um Super
//   Admin coincidentemente for RH da mesma empresa (mesmo e-mail),
//   prevalece o registro 'bruno' — o registro 'rh' e descartado.
// - `superAdmins.status` nao existe no schema real; T2 canonizada:
//   COALESCE gera default 'ativo' — como a coluna nao existe, todos os
//   registros sao considerados ativos automaticamente.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `Destinatario` (tipo) → consumido por `pipeline/m5-insertNotifications.ts`,
//     `pipeline/m7-enqueue.ts`, `emitAlert.ts`, testes de integracao.
//   - `ResolverContexto` (tipo) → consumido por `emitAlert.ts` e testes.
//   - `resolveDestinatarios` → consumido por `pipeline/m5-insertNotifications.ts`
//     e testes de integracao.

import { and, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers, employees, superAdmins } from '../../db/schema';
import type { NotificationDestinatarioTipo } from '../../db/schema/enums';

import { type AlertTipo, getTipoMetadata } from './typeDictionary';

/**
 * Destinatario canonico resolvido. Estrutura estavel usada por M5
 * (INSERT em `notifications`) e M7 (agrupamento em `emailQueue`).
 *
 * - `destinatarioTipo`: 'rh' | 'bruno'. Nota canonica §7.3 sobre D050:
 *   quando o RF nomeado e um colaborador ou C-level, o registro em
 *   `notifications` usa `destinatarioTipo='rh'` como marcador de
 *   "destinatario administrativo intracompanhia com sino proprio" —
 *   nao significa que o RF seja RH da empresa.
 * - `destinatarioEmail`: e-mail canonico para envio SMTP.
 * - `destinatarioEmployeeId`: para 'rh' preenche o id em `employees`
 *   ou em `cLevelMembers` (para RF C-level em D050); para 'bruno'
 *   preenche `null` (Super Admin nao esta em `employees`).
 */
export interface Destinatario {
  readonly destinatarioTipo: NotificationDestinatarioTipo;
  readonly destinatarioEmail: string;
  readonly destinatarioEmployeeId: number | null;
}

/**
 * Contexto opcional passado ao resolvedor. Aplicavel apenas ao tipo
 * `responsavel_financeiro_nomeado` (D050 — trilha `apenas_rf`).
 *
 * - `novoResponsavelId`: id em `employees` ou em `cLevelMembers`
 *   conforme `novoResponsavelTipo`.
 * - `novoResponsavelTipo`: 'employee' | 'clevel' (canonizacao §7.3).
 *
 * Para outros tipos, este contexto e ignorado e pode ser omitido.
 */
export interface ResolverContexto {
  readonly novoResponsavelId?: number;
  readonly novoResponsavelTipo?: 'employee' | 'clevel';
}

// -----------------------------------------------------------------------
// Consultas canonicas por trilha
// -----------------------------------------------------------------------

async function trilhaPadrao(db: RoipDatabase, companyId: number): Promise<Destinatario[]> {
  // Consulta 1 — RHs ativos da empresa (§7.1 SQL literal linhas 626-633)
  const rhs = await db
    .select({
      destinatarioEmployeeId: employees.id,
      destinatarioEmail: employees.email,
    })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.isRH, true),
        eq(employees.status, 'ativo'),
      ),
    );

  // Consulta 2 — Super Admins ativos (§7.1 SQL literal linhas 636-641).
  // T2 canonizada: `superAdmins.status` nao existe no schema real, entao
  // COALESCE canonico se resolve como 'ativo' automaticamente — devolve
  // todos os registros.
  const brunos = await db
    .select({
      destinatarioEmail: superAdmins.email,
    })
    .from(superAdmins);

  // Uniao + deduplicacao canonica por e-mail (§7.1 linha 645):
  // se `Bruno.email` coincidir com `RH.email`, prevalece o registro
  // 'bruno' — o 'rh' e descartado.
  const emailsBruno = new Set(brunos.map((b) => b.destinatarioEmail));

  const result: Destinatario[] = [];
  for (const rh of rhs) {
    // Filtragem canonica RV-12: `employees.email` e nullable no schema —
    // RH sem e-mail configurado nunca deveria ser enviado (RH sem
    // credencial nao acessa a plataforma) e nao entra em destinatarios.
    if (rh.destinatarioEmail === null) continue;
    if (emailsBruno.has(rh.destinatarioEmail)) {
      continue; // deduplicacao canonica — prevalece bruno
    }
    result.push({
      destinatarioTipo: 'rh',
      destinatarioEmail: rh.destinatarioEmail,
      destinatarioEmployeeId: rh.destinatarioEmployeeId,
    });
  }
  for (const b of brunos) {
    result.push({
      destinatarioTipo: 'bruno',
      destinatarioEmail: b.destinatarioEmail,
      destinatarioEmployeeId: null,
    });
  }
  return result;
}

async function trilhaApenasBruno(db: RoipDatabase): Promise<Destinatario[]> {
  // §7.3 D049 — apenas Bruno. T2 canonica aplicada (sem coluna status).
  const brunos = await db
    .select({
      destinatarioEmail: superAdmins.email,
    })
    .from(superAdmins);

  return brunos.map((b) => ({
    destinatarioTipo: 'bruno' as const,
    destinatarioEmail: b.destinatarioEmail,
    destinatarioEmployeeId: null,
  }));
}

async function trilhaApenasRf(db: RoipDatabase, ctx: ResolverContexto): Promise<Destinatario[]> {
  if (ctx.novoResponsavelId === undefined || ctx.novoResponsavelTipo === undefined) {
    // Contexto invalido — fallback zero destinatarios.
    return [];
  }
  if (ctx.novoResponsavelTipo === 'employee') {
    // §7.3 SQL literal linhas 669-675
    const rows = await db
      .select({
        destinatarioEmployeeId: employees.id,
        destinatarioEmail: employees.email,
      })
      .from(employees)
      .where(and(eq(employees.id, ctx.novoResponsavelId), eq(employees.status, 'ativo')));
    const first = rows[0];
    if (first === undefined || first.destinatarioEmail === null) return [];
    return [
      {
        destinatarioTipo: 'rh',
        destinatarioEmail: first.destinatarioEmail,
        destinatarioEmployeeId: first.destinatarioEmployeeId,
      },
    ];
  }
  // §7.3 SQL literal linhas 678-684 (C-level).
  //
  // **CC050 (ME-059).** A FK `notifications.destinatarioEmployeeId →
  // employees.id ON DELETE CASCADE` do DOC 01 §12.4 impede gravar o
  // `cLevelMembers.id` no campo. §7.3 do DOC 06 canoniza persistir o
  // ID do C-level, mas isso conflita com FK dura. Interpretacao
  // canonica segura: como §10.1 (Q1) determina que C-level NAO tem
  // sino, o campo `destinatarioEmployeeId` nao e consumido para
  // C-level em nenhuma leitura canonica. Portanto persistir `null` e
  // seguro — rastreabilidade do titular C-level fica preservada via
  // `alerts.metadados.novoResponsavelId` + `alerts.metadados.novoResponsavelTipo`
  // populados pelo hook chamador.
  const rows = await db
    .select({
      id: cLevelMembers.id,
      destinatarioEmail: cLevelMembers.email,
    })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.id, ctx.novoResponsavelId), eq(cLevelMembers.status, 'ativo')));
  const first = rows[0];
  if (first === undefined || first.destinatarioEmail === null) return [];
  return [
    {
      destinatarioTipo: 'rh',
      destinatarioEmail: first.destinatarioEmail,
      destinatarioEmployeeId: null, // CC050 — FK impede cLevelMembers.id
    },
  ];
}

// -----------------------------------------------------------------------
// Entrypoint canonico
// -----------------------------------------------------------------------

/**
 * Resolve destinatarios canonicos por tipo, aplicando a trilha
 * correspondente do `TIPO_DICTIONARY`. Fallback zero destinatarios
 * (array vazio) e responsabilidade do CALLER (M5) — este resolvedor
 * apenas devolve o array vazio quando aplicavel.
 */
export async function resolveDestinatarios(
  db: RoipDatabase,
  companyId: number,
  tipo: AlertTipo,
  ctx: ResolverContexto = {},
): Promise<Destinatario[]> {
  const meta = getTipoMetadata(tipo);
  switch (meta.trilha) {
    case 'padrao':
      return trilhaPadrao(db, companyId);
    case 'apenas_bruno':
      return trilhaApenasBruno(db);
    case 'apenas_rf':
      return trilhaApenasRf(db, ctx);
  }
}
