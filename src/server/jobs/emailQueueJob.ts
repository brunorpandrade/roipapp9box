// ROIP APP 9BOX — worker canonico `runEmailQueueJob` (ME-060 §11.2 +
// ME-063a extensao canonica templates 2 e L).
//
// Origem canonica:
// - DOC 06 §11.2 (worker `runEmailQueueJob` cron 1 min).
// - DOC 06 §11.6 (empresa desativada — pular sem incrementar retries).
// - DOC 06 §11.7 (empresa sem RH ativo — motor ja tratou).
// - DOC 06 §11.9 (rastreabilidade canonica cross-tabela).
// - DOC 06 §12.6 (Template A canonico).
// - DOC 06 §12.9 (marker transacional canonico).
// - DOC 06 §12.10 (comportamento canonico de retries e falha).
//
// Contrato canonico:
// - Cron 1 min. Cada rodada processa ate 50 linhas pendentes.
// - Bloqueio otimista canonico via UPDATE guard: substitui a semantica
//   `FOR UPDATE SKIP LOCKED` (§11.2) por `UPDATE ... SET
//   status='processando' WHERE id=? AND status='pendente'`. Preserva a
//   propriedade canonica de "batches disjuntos sem contencao": se dois
//   workers competirem pela mesma linha, apenas um consegue affectedRows=1
//   (a transacao unica do UPDATE e serializada pelo MySQL). Escolha
//   canonica RV-12 (100% Drizzle tipado) — SQL cru para FOR UPDATE SKIP
//   LOCKED nao e canonicamente necessario dado que a propriedade canonica
//   e preservada.
// - Distingue payload por `alertIds[0]`:
//     - `'__transactional__'` → template 1, 3, 4 renderizado a partir do
//       payload embutido (§12.9).
//     - Array de int → template A (`tipoEnvio='imediato'`) ou B
//       (`tipoEnvio='digest_semanal'`).
// - Retry policy canonica (§12.10):
//     - Falha e `novoRetries < 3` → `markEmailQueueRetry` (CC051) volta
//       linha a `pendente` com retries incrementado.
//     - Falha e `novoRetries >= 3` → `markEmailQueueFailed` marca linha
//       como `falhou` e emite warning canonico.
// - Empresa desativada (§11.6): pula sem tocar retries — a linha volta a
//   ficar disponivel automaticamente quando `companies.status='ativa'`.
// - Log estruturado canonico (padrao ME-059 logging.ts).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `EmailQueueJobResult` (tipo) → `runEmailQueueJob` + testes.
//   - `EmailQueueJobItemOutcome` (tipo) → `runEmailQueueJob` + testes.
//   - `EmailQueueJobDependencies` (tipo) → `runEmailQueueJob` + testes.
//   - `EMAIL_QUEUE_JOB_BATCH_LIMIT` → `runEmailQueueJob` + testes.
//   - `EMAIL_QUEUE_JOB_BORDA_SEGURANCA_MS` → `runEmailQueueJob` + testes.
//   - `EMAIL_QUEUE_JOB_MAX_RETRIES` → `runEmailQueueJob` + testes.
//   - `runEmailQueueJob` → testes de integracao (Bloco 3 desta ME).

import { and, asc, desc, eq, inArray, lte, lt } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { alerts, companies, emailQueue, employees, superAdmins } from '../../db/schema';
import {
  D050_NAO_RENDERIZA_MOTIVO,
  filterAndSortAlertsForTemplateA,
  getEmojiSeveridade,
  getRotuloLegivel,
  renderTemplate1,
  renderTemplate2,
  renderTemplate3,
  renderTemplate4,
  renderTemplateA,
  renderTemplateL,
  resolveContextoCurto,
  sendEmailViaSmtp,
  TRANSACTIONAL_MARKER_HEAD,
  type AlertEmailContext,
  type AlertMetadadosRaw,
  type PerfilPainel,
  type RenderedEmail,
  type SmtpEnvelope,
  type SmtpSendResult,
  type Template1Payload,
  type Template2Payload,
  type Template3Payload,
  type Template4Payload,
  type TemplateLPayload,
  type TransactionalTemplateId,
} from '../../lib/email';
import { resolveLinkDestino, type LinkResolverContext } from '../../lib/alerts/linkResolver';
import { assertTipoCanonico, type AlertTipo } from '../../lib/alerts/typeDictionary';
import { insertEmailNotification } from '../services/emailNotifications';
import {
  markEmailQueueFailed,
  markEmailQueueProcessing,
  markEmailQueueRetry,
  markEmailQueueSent,
} from '../services/emailQueue';

/** Limite canonico de batch por rodada (§11.2 `LIMIT 50`). */
export const EMAIL_QUEUE_JOB_BATCH_LIMIT = 50 as const;

/** Borda de seguranca canonica U1 (§11.2 `NOW() + INTERVAL 1 MINUTE`). */
export const EMAIL_QUEUE_JOB_BORDA_SEGURANCA_MS = 60_000 as const;

/** Numero canonico maximo de retries (§11.2 `retries < 3`). */
export const EMAIL_QUEUE_JOB_MAX_RETRIES = 3 as const;

/** Resultado canonico por item processado. */
export type EmailQueueJobItemOutcome =
  | 'enviado'
  | 'retry_agendado'
  | 'falha_final'
  | 'empresa_desativada'
  | 'claim_perdido'
  | 'payload_invalido'
  | 'sem_alertas';

/** Resultado agregado de uma rodada do worker. */
export interface EmailQueueJobResult {
  readonly candidatosLidos: number;
  readonly outcomes: Readonly<Record<EmailQueueJobItemOutcome, number>>;
}

/**
 * Dependencias injetaveis do worker. Facilita testes com transport
 * stub. Em producao, o caller usa `sendEmailViaSmtp` do adapter canonico.
 */
export interface EmailQueueJobDependencies {
  readonly sendEmail: (envelope: SmtpEnvelope) => Promise<SmtpSendResult>;
}

const DEFAULT_DEPENDENCIES: EmailQueueJobDependencies = {
  sendEmail: sendEmailViaSmtp,
};

function emptyOutcomes(): Record<EmailQueueJobItemOutcome, number> {
  return {
    enviado: 0,
    retry_agendado: 0,
    falha_final: 0,
    empresa_desativada: 0,
    claim_perdido: 0,
    payload_invalido: 0,
    sem_alertas: 0,
  };
}

function logQueueEvent(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: 'email.queue.process', ...payload }));
}

function logQueueWarn(payload: Record<string, unknown>): void {
  console.warn(JSON.stringify({ event: 'email.queue.warn', ...payload }));
}

interface CompanyInfo {
  readonly companyId: number;
  readonly razaoSocial: string;
  readonly timezone: string;
  readonly status: string | null;
}

async function loadCompanyInfo(
  db: RoipDatabase,
  companyId: number,
): Promise<CompanyInfo | undefined> {
  const rows = await db
    .select({
      companyId: companies.id,
      razaoSocial: companies.razaoSocial,
      timezone: companies.timezone,
      status: companies.status,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return rows[0];
}

interface DestinatarioInfo {
  readonly primeiroNome: string;
  readonly perfil: PerfilPainel;
}

async function resolveDestinatarioInfo(
  db: RoipDatabase,
  destinatarioTipo: 'rh' | 'bruno',
  destinatarioEmployeeId: number | null,
  destinatarioEmail: string,
): Promise<DestinatarioInfo> {
  if (destinatarioTipo === 'bruno') {
    const rows = await db
      .select({ name: superAdmins.name })
      .from(superAdmins)
      .where(eq(superAdmins.email, destinatarioEmail))
      .orderBy(desc(superAdmins.id))
      .limit(1);
    const nomeCompleto = rows[0]?.name ?? destinatarioEmail.split('@')[0] ?? 'Bruno';
    return {
      primeiroNome: extractPrimeiroNome(nomeCompleto),
      perfil: 'super_admin',
    };
  }
  // destinatarioTipo === 'rh'
  if (destinatarioEmployeeId !== null) {
    const rows = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, destinatarioEmployeeId))
      .limit(1);
    const nomeCompleto = rows[0]?.name ?? destinatarioEmail.split('@')[0] ?? '';
    return { primeiroNome: extractPrimeiroNome(nomeCompleto), perfil: 'rh' };
  }
  // Fallback canonico: nome derivado do local-part do e-mail.
  const fallback = destinatarioEmail.split('@')[0] ?? '';
  return { primeiroNome: extractPrimeiroNome(fallback), perfil: 'rh' };
}

function extractPrimeiroNome(nomeCompleto: string): string {
  const trimmed = nomeCompleto.trim();
  if (trimmed === '') return '';
  const parts = trimmed.split(/\s+/);
  return parts[0] ?? trimmed;
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

/**
 * Constroi contexto canonico de e-mail a partir de linha de `alerts` +
 * `destinatarioTipo`. Consumido para renderizar template A ou B.
 *
 * Aplica canonicamente:
 * - Tipo → rotulo legivel (`typeDictionary`).
 * - Severidade → emoji (§6.2).
 * - Metadados JSON → contexto curto (`contextResolvers`).
 * - Metadados JSON → `linkDestino` (`linkResolver`).
 */
function buildAlertContext(
  row: AlertRow,
  destinatarioTipo: 'rh' | 'bruno',
  companyId: number,
): AlertEmailContext | null {
  // Validacao canonica: `tipo` deve estar no enum dos 17 canonicos.
  try {
    assertTipoCanonico(row.tipo);
  } catch {
    return null;
  }
  const tipo = row.tipo as AlertTipo;
  const severidade = row.severidade ?? 'info';

  // Parse canonico dos metadados como objeto raw.
  let metadados: AlertMetadadosRaw = {};
  if (row.metadados !== null && typeof row.metadados === 'object') {
    metadados = row.metadados as AlertMetadadosRaw;
  }
  const contexto = resolveContextoCurto(tipo, metadados);

  // Monta contexto canonico para o linkResolver a partir dos campos
  // canonicos do alerta + metadados.
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

interface QueueItem {
  readonly id: number;
  readonly companyId: number | null;
  readonly destinatarioTipo: 'rh' | 'bruno';
  readonly destinatarioEmail: string;
  readonly destinatarioEmployeeId: number | null;
  readonly tipoEnvio: 'imediato' | 'digest_semanal';
  readonly alertIds: unknown;
  readonly retries: number;
}

async function loadCandidateBatch(db: RoipDatabase, now: Date): Promise<QueueItem[]> {
  const scheduledCutoff = new Date(now.getTime() + EMAIL_QUEUE_JOB_BORDA_SEGURANCA_MS);
  const rows = await db
    .select({
      id: emailQueue.id,
      companyId: emailQueue.companyId,
      destinatarioTipo: emailQueue.destinatarioTipo,
      destinatarioEmail: emailQueue.destinatarioEmail,
      destinatarioEmployeeId: emailQueue.destinatarioEmployeeId,
      tipoEnvio: emailQueue.tipoEnvio,
      alertIds: emailQueue.alertIds,
      retries: emailQueue.retries,
    })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, 'pendente'),
        lte(emailQueue.scheduledFor, scheduledCutoff),
        lt(emailQueue.retries, EMAIL_QUEUE_JOB_MAX_RETRIES),
      ),
    )
    .orderBy(asc(emailQueue.scheduledFor), asc(emailQueue.id))
    .limit(EMAIL_QUEUE_JOB_BATCH_LIMIT);
  return rows as QueueItem[];
}

interface TransactionalDecoded {
  readonly kind: 'transactional';
  readonly templateId: TransactionalTemplateId;
  readonly payload:
    Template1Payload | Template2Payload | Template3Payload | Template4Payload | TemplateLPayload;
}

interface AlertDecoded {
  readonly kind: 'alerts';
  readonly alertIds: readonly number[];
}

type PayloadDecoded = TransactionalDecoded | AlertDecoded | { readonly kind: 'invalido' };

function decodeAlertIds(alertIds: unknown): PayloadDecoded {
  if (!Array.isArray(alertIds)) return { kind: 'invalido' };
  if (alertIds.length === 0) return { kind: 'alerts', alertIds: [] };
  const head = alertIds[0];
  if (head === TRANSACTIONAL_MARKER_HEAD) {
    if (alertIds.length !== 3) return { kind: 'invalido' };
    const templateIdRaw = alertIds[1];
    const payloadJson = alertIds[2];
    if (
      templateIdRaw !== '1' &&
      templateIdRaw !== '2' &&
      templateIdRaw !== '3' &&
      templateIdRaw !== '4' &&
      templateIdRaw !== 'L'
    ) {
      return { kind: 'invalido' };
    }
    if (typeof payloadJson !== 'string') {
      return { kind: 'invalido' };
    }
    try {
      const parsed = JSON.parse(payloadJson) as
        | Template1Payload
        | Template2Payload
        | Template3Payload
        | Template4Payload
        | TemplateLPayload;
      return {
        kind: 'transactional',
        templateId: templateIdRaw as TransactionalTemplateId,
        payload: parsed,
      };
    } catch {
      return { kind: 'invalido' };
    }
  }
  // Espera-se array de int
  const allInts = alertIds.every((v): v is number => typeof v === 'number' && Number.isInteger(v));
  if (!allInts) return { kind: 'invalido' };
  return { kind: 'alerts', alertIds: alertIds as readonly number[] };
}

function renderTransactionalEmail(decoded: TransactionalDecoded): RenderedEmail {
  switch (decoded.templateId) {
    case '1':
      return renderTemplate1(decoded.payload as Template1Payload);
    case '2':
      return renderTemplate2(decoded.payload as Template2Payload);
    case '3':
      return renderTemplate3(decoded.payload as Template3Payload);
    case '4':
      return renderTemplate4(decoded.payload as Template4Payload);
    case 'L':
      return renderTemplateL(decoded.payload as TemplateLPayload);
  }
}

/**
 * Worker canonico `runEmailQueueJob`. Ver `Contrato canonico` no topo do
 * arquivo. Retorna sumario canonico da rodada. Nao lanca — cada item e
 * isolado com try/catch.
 */
export async function runEmailQueueJob(
  db: RoipDatabase,
  now: Date,
  deps: EmailQueueJobDependencies = DEFAULT_DEPENDENCIES,
): Promise<EmailQueueJobResult> {
  const outcomes = emptyOutcomes();
  const items = await loadCandidateBatch(db, now);

  for (const item of items) {
    try {
      // Passo 1 canonico: claim otimista via UPDATE guard.
      const claimed = await markEmailQueueProcessing(db, item.id, now);
      if (claimed === 0) {
        outcomes.claim_perdido += 1;
        logQueueEvent({ id: item.id, outcome: 'claim_perdido' });
        continue;
      }

      // Passo 1a canonico (CC052 ME-060): empresa desativada (§11.6)
      // aplica apenas quando companyId != null. Transacionais de Super
      // Admin usam companyId=null e nao passam pela checagem de status.
      let companyInfo: CompanyInfo | undefined = undefined;
      if (item.companyId !== null) {
        companyInfo = await loadCompanyInfo(db, item.companyId);
        if (companyInfo === undefined || companyInfo.status !== 'ativa') {
          // Volta a `pendente` com o mesmo retries. Preserva estado canonico
          // para reprocessamento ao reativar (§11.6).
          await markEmailQueueRetry(db, item.id, item.retries);
          outcomes.empresa_desativada += 1;
          logQueueEvent({
            id: item.id,
            companyId: item.companyId,
            outcome: 'empresa_desativada',
          });
          continue;
        }
      }

      // Passo 2 canonico: decodifica alertIds.
      const decoded = decodeAlertIds(item.alertIds);
      if (decoded.kind === 'invalido') {
        // Payload invalido — marca como falha final para investigacao (nao
        // retryable canonicamente).
        await markEmailQueueFailed(db, item.id, item.retries + 1);
        outcomes.payload_invalido += 1;
        logQueueWarn({
          id: item.id,
          companyId: item.companyId,
          outcome: 'payload_invalido',
        });
        continue;
      }

      // Passo 3 canonico: renderiza template + envia.
      let rendered: RenderedEmail;
      if (decoded.kind === 'transactional') {
        rendered = renderTransactionalEmail(decoded);
      } else {
        // decoded.kind === 'alerts'
        // Invariante canonica CC052: linhas com kind='alerts' SEMPRE vem
        // com companyId != null (o motor ME-059 grava alertas por
        // empresa; companyId=null e reservado a transacionais Super Admin
        // §12.9). Se essa invariante quebra, marca como payload invalido.
        if (item.companyId === null || companyInfo === undefined) {
          await markEmailQueueFailed(db, item.id, item.retries + 1);
          outcomes.payload_invalido += 1;
          logQueueWarn({
            id: item.id,
            outcome: 'kind_alerts_sem_companyId',
          });
          continue;
        }
        const companyIdNonNull = item.companyId;
        const companyInfoResolved = companyInfo;
        const alertRows = await loadAlertsByIds(db, decoded.alertIds);
        // Constroi contextos canonicos (§12.6).
        const contexts: AlertEmailContext[] = [];
        for (const row of alertRows) {
          const ctx = buildAlertContext(row, item.destinatarioTipo, companyIdNonNull);
          if (ctx !== null) {
            // D050 nao renderiza corpo (§12.6 linha 1428).
            if (ctx.tipo === 'responsavel_financeiro_nomeado') {
              logQueueEvent({
                id: item.id,
                alertId: row.id,
                skipReason: D050_NAO_RENDERIZA_MOTIVO,
              });
              continue;
            }
            contexts.push(ctx);
          }
        }
        if (item.tipoEnvio === 'imediato') {
          const filtered = filterAndSortAlertsForTemplateA(contexts);
          if (filtered.length === 0) {
            // Sem alertas renderizaveis apos filtro canonico — marca como
            // enviado (sem envio real, sem emailNotifications) para nao
            // ficar preso na fila. emailNotificationId=null (CC052 +
            // markEmailQueueSent ampliado).
            await markEmailQueueSent(db, item.id, null);
            outcomes.sem_alertas += 1;
            logQueueEvent({
              id: item.id,
              companyId: companyIdNonNull,
              outcome: 'sem_alertas_imediato',
            });
            continue;
          }
          const destInfo = await resolveDestinatarioInfo(
            db,
            item.destinatarioTipo,
            item.destinatarioEmployeeId,
            item.destinatarioEmail,
          );
          rendered = renderTemplateA({
            primeiroNome: destInfo.primeiroNome,
            nomeEmpresa: companyInfoResolved.razaoSocial,
            perfil: destInfo.perfil,
            alerts: filtered,
          });
        } else {
          // tipoEnvio === 'digest_semanal' — digest e responsabilidade
          // canonica do weeklyDigestJob (§11.4/§11.5). Se uma linha
          // digest chega aqui, algo esta errado — o digestJob deveria
          // ter marcado como enviada. Marca como falha para investigacao.
          await markEmailQueueFailed(db, item.id, item.retries + 1);
          outcomes.payload_invalido += 1;
          logQueueWarn({
            id: item.id,
            companyId: companyIdNonNull,
            outcome: 'digest_semanal_no_immediate_worker',
          });
          continue;
        }
      }

      // Passo 4 canonico: envia via adapter SMTP.
      const sendResult = await deps.sendEmail({
        to: item.destinatarioEmail,
        subject: rendered.assunto,
        text: rendered.corpoTexto,
        html: rendered.corpoHtml,
      });

      // Passo 5 canonico: grava emailNotifications + marca enviado.
      const eventoIdsForNotification = decoded.kind === 'alerts' ? [...decoded.alertIds] : null;
      const notificationId = await insertEmailNotification(db, {
        companyId: item.companyId,
        notificationId: null,
        destinatarioTipo: item.destinatarioTipo,
        destinatarioEmail: item.destinatarioEmail,
        destinatarioEmployeeId: item.destinatarioEmployeeId,
        assunto: rendered.assunto,
        corpoTexto: rendered.corpoTexto,
        corpoHtml: rendered.corpoHtml,
        tipoEnvio: item.tipoEnvio,
        eventoIds: eventoIdsForNotification,
        enviadoEm: now,
        success: true,
        smtpMessageId: sendResult.smtpMessageId,
      });
      await markEmailQueueSent(db, item.id, notificationId);
      outcomes.enviado += 1;
      logQueueEvent({
        id: item.id,
        companyId: item.companyId,
        outcome: 'enviado',
        smtpMessageId: sendResult.smtpMessageId,
      });
    } catch (err) {
      // Passo 6 canonico: retry policy (§11.2 passo 6 + §12.10).
      const novoRetries = item.retries + 1;
      const failReason = err instanceof Error ? err.message : String(err);
      if (novoRetries >= EMAIL_QUEUE_JOB_MAX_RETRIES) {
        await markEmailQueueFailed(db, item.id, novoRetries);
        outcomes.falha_final += 1;
        logQueueWarn({
          id: item.id,
          companyId: item.companyId,
          destinatarioEmail: item.destinatarioEmail,
          failReason,
          outcome: 'falha_final',
          retries: novoRetries,
        });
      } else {
        await markEmailQueueRetry(db, item.id, novoRetries);
        outcomes.retry_agendado += 1;
        logQueueEvent({
          id: item.id,
          companyId: item.companyId,
          outcome: 'retry_agendado',
          retries: novoRetries,
          failReason,
        });
      }
    }
  }

  return { candidatosLidos: items.length, outcomes };
}
