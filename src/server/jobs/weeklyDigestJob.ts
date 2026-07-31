// ROIP APP 9BOX — worker canonico `runWeeklyDigestJob` +
// `processDigestForCompany` (ME-060 §11.4 + §11.5).
//
// Origem canonica:
// - DOC 06 §11.4 (worker `runWeeklyDigestJob` cron horario UTC).
// - DOC 06 §11.5 (funcao `processDigestForCompany`).
// - DOC 06 §11.8 (idempotencia canonica via
//   `digestExecutionLog(companyId, weekStart)` UNIQUE).
// - DOC 06 §12.7 (Template B canonico).
// - DOC 01 §12.8 (schema `digestExecutionLog`).
//
// Contrato canonico:
// - Cron horario UTC. Para cada empresa cadastrada, verifica se hora
//   local via `companies.timezone` (fallback `America/Sao_Paulo`) e
//   segunda-feira 08:00. Se sim, consulta `digestExecutionLog` para
//   idempotencia; se ja executado nesta semana, pula.
// - `processDigestForCompany(companyId)`:
//     1. Calcula `weekStart`/`weekEnd`.
//     2. Busca linhas em `emailQueue` da empresa com
//        `tipoEnvio='digest_semanal'`, `status='pendente'`,
//        `scheduledFor BETWEEN weekStart AND weekEnd`.
//     3. Agrupa por `destinatarioEmail`.
//     4. Para cada destinatario:
//        - Sem alertas apos agregacao → silencio canonico (§11.5 passo 4a).
//        - Com alertas → renderiza template B, envia, grava
//          `emailNotifications`, marca `emailQueue.status='enviado'`.
//     5. Grava linha em `digestExecutionLog` (mesmo com
//        `emailsEnviados=0` para rastreabilidade, §11.5 passo 5).
// - Idempotencia canonica via UNIQUE `(companyId, weekStart)`: reexecucao
//   no mesmo horario canonico salta a empresa.
// - Empresa desativada (§11.6): pula sem tocar retries.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `WeeklyDigestJobResult` (tipo) → `runWeeklyDigestJob` + testes.
//   - `DigestOutcome` (tipo) → `processDigestForCompany` + testes.
//   - `WeeklyDigestJobDependencies` (tipo) → `runWeeklyDigestJob` +
//     testes.
//   - `processDigestForCompany` → `runWeeklyDigestJob` + testes.
//   - `runWeeklyDigestJob` → testes de integracao.

import { and, asc, between, eq, inArray } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  alerts,
  companies,
  digestExecutionLog,
  emailQueue,
  employees,
  superAdmins,
} from '../../db/schema';
import {
  filterAndSortAlertsForTemplateB,
  formatWeekRangeDDMMYYYY,
  getEmojiSeveridade,
  getRotuloLegivel,
  getWeekBounds,
  isMondayEightAmLocal,
  renderTemplateB,
  resolveContextoCurto,
  sendEmailViaSmtp,
  type AlertEmailContext,
  type AlertMetadadosRaw,
  type SmtpEnvelope,
  type SmtpSendResult,
} from '../../lib/email';
import { resolveLinkDestino, type LinkResolverContext } from '../../lib/alerts/linkResolver';
import { assertTipoCanonico, type AlertTipo } from '../../lib/alerts/typeDictionary';
import { TIMEZONE_FALLBACK } from '../../lib/alerts/pipeline/nextWeeklyDigestDate';
import { insertEmailNotification } from '../services/emailNotifications';
import { markEmailQueueProcessing, markEmailQueueSent } from '../services/emailQueue';

/** Resultado canonico por destinatario dentro de uma empresa. */
export type DigestOutcome = 'enviado' | 'silencio' | 'sem_alertas' | 'claim_perdido';

/** Resultado canonico agregado do `runWeeklyDigestJob`. */
export interface WeeklyDigestJobResult {
  readonly empresasVisitadas: number;
  readonly empresasProcessadas: number;
  readonly empresasPuladasIdempotencia: number;
  readonly empresasPuladasHorario: number;
  readonly empresasPuladasDesativadas: number;
  readonly emailsEnviados: number;
  readonly silencios: number;
}

export interface WeeklyDigestJobDependencies {
  readonly sendEmail: (envelope: SmtpEnvelope) => Promise<SmtpSendResult>;
}

const DEFAULT_DEPENDENCIES: WeeklyDigestJobDependencies = {
  sendEmail: sendEmailViaSmtp,
};

function logDigestEvent(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: 'email.digest.process', ...payload }));
}

function logDigestWarn(payload: Record<string, unknown>): void {
  console.warn(JSON.stringify({ event: 'email.digest.warn', ...payload }));
}

interface DigestQueueRow {
  readonly id: number;
  readonly destinatarioTipo: 'rh' | 'bruno';
  readonly destinatarioEmail: string;
  readonly destinatarioEmployeeId: number | null;
  readonly alertIds: unknown;
  readonly retries: number;
}

async function loadDigestPendingRows(
  db: RoipDatabase,
  companyId: number,
  weekStart: Date,
  weekEnd: Date,
): Promise<DigestQueueRow[]> {
  const rows = await db
    .select({
      id: emailQueue.id,
      destinatarioTipo: emailQueue.destinatarioTipo,
      destinatarioEmail: emailQueue.destinatarioEmail,
      destinatarioEmployeeId: emailQueue.destinatarioEmployeeId,
      alertIds: emailQueue.alertIds,
      retries: emailQueue.retries,
    })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.companyId, companyId),
        eq(emailQueue.tipoEnvio, 'digest_semanal'),
        eq(emailQueue.status, 'pendente'),
        between(emailQueue.scheduledFor, weekStart, weekEnd),
      ),
    )
    .orderBy(asc(emailQueue.scheduledFor), asc(emailQueue.id));
  return rows as DigestQueueRow[];
}

interface AlertRow {
  readonly id: number;
  readonly tipo: string;
  readonly severidade: 'info' | 'observacao' | 'atencao' | 'critico' | null;
  readonly metadados: unknown;
  readonly escopoEmployeeId: number | null;
  readonly cicloDbId: number | null;
  readonly fatorId: number | null;
}

async function loadAlertsByIds(db: RoipDatabase, ids: readonly number[]): Promise<AlertRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: alerts.id,
      tipo: alerts.tipo,
      severidade: alerts.severidade,
      metadados: alerts.metadados,
      escopoEmployeeId: alerts.escopoEmployeeId,
      cicloDbId: alerts.cicloDbId,
      fatorId: alerts.fatorId,
    })
    .from(alerts)
    .where(inArray(alerts.id, [...ids]))
    .orderBy(asc(alerts.id));
  return rows as AlertRow[];
}

function buildAlertContext(
  row: AlertRow,
  destinatarioTipo: 'rh' | 'bruno',
  companyId: number,
): AlertEmailContext | null {
  try {
    assertTipoCanonico(row.tipo);
  } catch {
    return null;
  }
  const tipo = row.tipo as AlertTipo;
  const severidade = row.severidade ?? 'info';
  let metadados: AlertMetadadosRaw = {};
  if (row.metadados !== null && typeof row.metadados === 'object') {
    metadados = row.metadados as AlertMetadadosRaw;
  }
  const contexto = resolveContextoCurto(tipo, metadados);
  const linkCtx: LinkResolverContext = {
    companyId,
    employeeId: row.escopoEmployeeId,
    trimestre: typeof metadados['trimestre'] === 'string' ? metadados['trimestre'] : null,
    mes: typeof metadados['mes'] === 'string' ? metadados['mes'] : null,
    cicloDbId: row.cicloDbId,
    fatorId: row.fatorId,
  };
  let linkDestino: string;
  try {
    linkDestino = resolveLinkDestino(tipo, destinatarioTipo, linkCtx);
  } catch {
    return null;
  }
  return {
    tipo,
    rotuloLegivel: getRotuloLegivel(tipo),
    severidade,
    emojiSeveridade: getEmojiSeveridade(severidade),
    contextoCurto: contexto,
    linkDestino,
  };
}

function extractPrimeiroNome(nomeCompleto: string): string {
  const trimmed = nomeCompleto.trim();
  if (trimmed === '') return '';
  const parts = trimmed.split(/\s+/);
  return parts[0] ?? trimmed;
}

async function resolvePrimeiroNome(
  db: RoipDatabase,
  destinatarioTipo: 'rh' | 'bruno',
  destinatarioEmployeeId: number | null,
  destinatarioEmail: string,
): Promise<string> {
  if (destinatarioTipo === 'bruno') {
    const rows = await db
      .select({ name: superAdmins.name })
      .from(superAdmins)
      .where(eq(superAdmins.email, destinatarioEmail))
      .limit(1);
    const nomeCompleto = rows[0]?.name ?? destinatarioEmail.split('@')[0] ?? 'Bruno';
    return extractPrimeiroNome(nomeCompleto);
  }
  if (destinatarioEmployeeId !== null) {
    const rows = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, destinatarioEmployeeId))
      .limit(1);
    const nomeCompleto = rows[0]?.name ?? destinatarioEmail.split('@')[0] ?? '';
    return extractPrimeiroNome(nomeCompleto);
  }
  return extractPrimeiroNome(destinatarioEmail.split('@')[0] ?? '');
}

/**
 * Processa canonicamente o digest de UMA empresa (§11.5). Assumido que
 * o caller (`runWeeklyDigestJob`) ja verificou idempotencia — a gravacao
 * final em `digestExecutionLog` e feita aqui.
 *
 * Retorna a decisao canonica por destinatario processado + agregados
 * finais para o `digestExecutionLog`.
 */
export async function processDigestForCompany(
  db: RoipDatabase,
  companyId: number,
  now: Date,
  timezone: string,
  razaoSocial: string,
  deps: WeeklyDigestJobDependencies = DEFAULT_DEPENDENCIES,
): Promise<{
  readonly weekStart: Date;
  readonly weekEnd: Date;
  readonly destinatariosCount: number;
  readonly emailsEnviados: number;
  readonly alertsConsolidados: number;
  readonly outcomesPorDestinatario: readonly {
    readonly destinatarioEmail: string;
    readonly outcome: DigestOutcome;
    readonly alertsCount: number;
  }[];
}> {
  const { weekStart, weekEnd } = getWeekBounds(now, timezone);
  const pending = await loadDigestPendingRows(db, companyId, weekStart, weekEnd);

  // Agrupa por destinatarioEmail
  interface Grouped {
    readonly destinatarioTipo: 'rh' | 'bruno';
    readonly destinatarioEmail: string;
    readonly destinatarioEmployeeId: number | null;
    readonly queueIds: number[];
    readonly alertIdsAll: number[];
  }
  const byEmail = new Map<string, Grouped>();
  for (const row of pending) {
    const key = `${row.destinatarioEmail}::${row.destinatarioTipo}`;
    let group = byEmail.get(key);
    if (group === undefined) {
      group = {
        destinatarioTipo: row.destinatarioTipo,
        destinatarioEmail: row.destinatarioEmail,
        destinatarioEmployeeId: row.destinatarioEmployeeId,
        queueIds: [],
        alertIdsAll: [],
      };
      byEmail.set(key, group);
    }
    group.queueIds.push(row.id);
    if (Array.isArray(row.alertIds)) {
      for (const v of row.alertIds) {
        if (typeof v === 'number' && Number.isInteger(v)) {
          group.alertIdsAll.push(v);
        }
      }
    }
  }

  const outcomes: {
    destinatarioEmail: string;
    outcome: DigestOutcome;
    alertsCount: number;
  }[] = [];
  let emailsEnviados = 0;
  let alertsConsolidados = 0;

  const { startFull, endFull } = formatWeekRangeDDMMYYYY(weekStart, weekEnd, timezone);

  for (const group of byEmail.values()) {
    if (group.alertIdsAll.length === 0) {
      outcomes.push({
        destinatarioEmail: group.destinatarioEmail,
        outcome: 'sem_alertas',
        alertsCount: 0,
      });
      continue;
    }
    // Claim canonico: marca todas as linhas da fila como processando.
    let anyClaimed = false;
    for (const qid of group.queueIds) {
      const claimed = await markEmailQueueProcessing(db, qid, now);
      if (claimed > 0) anyClaimed = true;
    }
    if (!anyClaimed) {
      outcomes.push({
        destinatarioEmail: group.destinatarioEmail,
        outcome: 'claim_perdido',
        alertsCount: 0,
      });
      continue;
    }

    const alertRows = await loadAlertsByIds(db, group.alertIdsAll);
    const contexts: AlertEmailContext[] = [];
    for (const row of alertRows) {
      const ctx = buildAlertContext(row, group.destinatarioTipo, companyId);
      if (ctx !== null && ctx.tipo !== 'responsavel_financeiro_nomeado') {
        contexts.push(ctx);
      }
    }
    const filtered = filterAndSortAlertsForTemplateB(contexts);
    if (filtered.length === 0) {
      // Silencio canonico (§11.5 passo 4a): nada a enviar. As linhas em
      // emailQueue permanecem em `processando` (claimed acima) — sem
      // envio, sem gravacao em emailNotifications. Marca como enviadas
      // com emailNotificationId=null (schema aceita — CC052 canonizada +
      // markEmailQueueSent ampliado) para preservar rastreabilidade
      // "linhas ja foram vistas neste ciclo canonico".
      for (const qid of group.queueIds) {
        await markEmailQueueSent(db, qid, null);
      }
      outcomes.push({
        destinatarioEmail: group.destinatarioEmail,
        outcome: 'silencio',
        alertsCount: 0,
      });
      continue;
    }

    const primeiroNome = await resolvePrimeiroNome(
      db,
      group.destinatarioTipo,
      group.destinatarioEmployeeId,
      group.destinatarioEmail,
    );
    const rendered = renderTemplateB({
      primeiroNome,
      nomeEmpresa: razaoSocial,
      weekStartFormatted: startFull,
      weekEndFormatted: endFull,
      alerts: filtered,
    });

    try {
      const sendResult = await deps.sendEmail({
        to: group.destinatarioEmail,
        subject: rendered.assunto,
        text: rendered.corpoTexto,
        html: rendered.corpoHtml,
      });
      const notificationId = await insertEmailNotification(db, {
        companyId,
        notificationId: null,
        destinatarioTipo: group.destinatarioTipo,
        destinatarioEmail: group.destinatarioEmail,
        destinatarioEmployeeId: group.destinatarioEmployeeId,
        assunto: rendered.assunto,
        corpoTexto: rendered.corpoTexto,
        corpoHtml: rendered.corpoHtml,
        tipoEnvio: 'digest_semanal',
        eventoIds: group.alertIdsAll,
        enviadoEm: now,
        success: true,
        smtpMessageId: sendResult.smtpMessageId,
      });
      for (const qid of group.queueIds) {
        await markEmailQueueSent(db, qid, notificationId);
      }
      emailsEnviados += 1;
      alertsConsolidados += filtered.length;
      outcomes.push({
        destinatarioEmail: group.destinatarioEmail,
        outcome: 'enviado',
        alertsCount: filtered.length,
      });
      logDigestEvent({
        companyId,
        destinatarioEmail: group.destinatarioEmail,
        outcome: 'enviado',
        alertsCount: filtered.length,
        smtpMessageId: sendResult.smtpMessageId,
      });
    } catch (err) {
      // Falha no digest e canonicamente rara. Deixa linhas em processando
      // — o `resetStuckEmailQueue` devolve a `pendente` apos 10min.
      logDigestWarn({
        companyId,
        destinatarioEmail: group.destinatarioEmail,
        outcome: 'falha_envio',
        failReason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    weekStart,
    weekEnd,
    destinatariosCount: byEmail.size,
    emailsEnviados,
    alertsConsolidados,
    outcomesPorDestinatario: outcomes,
  };
}

/**
 * Worker canonico `runWeeklyDigestJob`. Cron horario UTC. Itera empresas
 * cadastradas, filtra pelas que estao em segunda 08h local, aplica
 * idempotencia via `digestExecutionLog`, e processa cada empresa via
 * `processDigestForCompany`.
 */
export async function runWeeklyDigestJob(
  db: RoipDatabase,
  now: Date,
  deps: WeeklyDigestJobDependencies = DEFAULT_DEPENDENCIES,
): Promise<WeeklyDigestJobResult> {
  const empresas = await db
    .select({
      id: companies.id,
      razaoSocial: companies.razaoSocial,
      timezone: companies.timezone,
      status: companies.status,
    })
    .from(companies)
    .orderBy(asc(companies.id));

  let empresasProcessadas = 0;
  let empresasPuladasIdempotencia = 0;
  let empresasPuladasHorario = 0;
  let empresasPuladasDesativadas = 0;
  let emailsEnviados = 0;
  let silencios = 0;

  for (const empresa of empresas) {
    if (empresa.status !== 'ativa') {
      empresasPuladasDesativadas += 1;
      continue;
    }
    const tz = empresa.timezone && empresa.timezone !== '' ? empresa.timezone : TIMEZONE_FALLBACK;
    if (!isMondayEightAmLocal(now, tz)) {
      empresasPuladasHorario += 1;
      continue;
    }
    const { weekStart } = getWeekBounds(now, tz);
    // Idempotencia canonica (§11.8): consulta digestExecutionLog.
    const weekStartDateStr = formatDateOnly(weekStart);
    const existing = await db
      .select({ id: digestExecutionLog.id })
      .from(digestExecutionLog)
      .where(
        and(
          eq(digestExecutionLog.companyId, empresa.id),
          eq(digestExecutionLog.weekStart, weekStartDateStr as unknown as Date),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      empresasPuladasIdempotencia += 1;
      continue;
    }

    try {
      const result = await processDigestForCompany(
        db,
        empresa.id,
        now,
        tz,
        empresa.razaoSocial,
        deps,
      );
      // Grava linha canonica em digestExecutionLog (§11.5 passo 5).
      // Date fields em MySQL Drizzle exigem string YYYY-MM-DD (mysql2
      // nao converte Date para DATE via toISOString automaticamente).
      await db.insert(digestExecutionLog).values({
        companyId: empresa.id,
        weekStart: formatDateOnly(result.weekStart) as unknown as Date,
        weekEnd: formatDateOnly(result.weekEnd) as unknown as Date,
        destinatariosCount: result.destinatariosCount,
        emailsEnviados: result.emailsEnviados,
        alertsConsolidados: result.alertsConsolidados,
      });
      empresasProcessadas += 1;
      emailsEnviados += result.emailsEnviados;
      for (const o of result.outcomesPorDestinatario) {
        if (o.outcome === 'silencio' || o.outcome === 'sem_alertas') silencios += 1;
      }
      logDigestEvent({
        companyId: empresa.id,
        emailsEnviados: result.emailsEnviados,
        alertsConsolidados: result.alertsConsolidados,
        destinatariosCount: result.destinatariosCount,
      });
    } catch (err) {
      logDigestWarn({
        companyId: empresa.id,
        outcome: 'processDigestForCompany_falhou',
        failReason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    empresasVisitadas: empresas.length,
    empresasProcessadas,
    empresasPuladasIdempotencia,
    empresasPuladasHorario,
    empresasPuladasDesativadas,
    emailsEnviados,
    silencios,
  };
}

/**
 * Formata `Date` como `YYYY-MM-DD` (formato canonico do MySQL DATE) em
 * UTC. Necessario porque `weekStart`/`weekEnd` sao instantes UTC e o
 * schema de `digestExecutionLog.weekStart` e `DATE` (sem componente de
 * hora). Reduz canonicamente para o dia UTC. Nota canonica: o driver
 * mysql2 nao converte Date → YYYY-MM-DD automaticamente para campos
 * MySQL DATE (usa `.toString()` que produz formato invalido para SQL);
 * portanto o worker faz a conversao explicita antes do INSERT/WHERE.
 */
function formatDateOnly(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
