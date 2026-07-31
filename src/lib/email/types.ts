// ROIP APP 9BOX — tipos canonicos do modulo de e-mail (ME-060).
//
// Origem canonica:
// - DOC 06 §11 (Sistema canonico de disparo de e-mails).
// - DOC 06 §12 (Templates canonicos de e-mail).
// - DOC 06 §12.9 (Enfileiramento canonico dos templates transacionais).
//
// Contrato canonico:
// - Interfaces canonicas compartilhadas por `emailDispatcher`, templates
//   (`templates/*.ts`), workers (`jobs/*.ts`) e testes.
// - Zero I/O — arquivo puramente declarativo.
// - Templates 2 (primeiro acesso) e L (portal reminder) diferidos por
//   RV-13 (D068 NOVA e D067 respectivamente) — nao aparecem no enum
//   canonico desta ME.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `TransactionalTemplateId` (tipo) → `emailDispatcher.ts` +
//     `templates/*.ts` + `jobs/emailQueueJob.ts` + testes.
//   - `TransactionalMarker` (tipo) → `emailDispatcher.ts` +
//     `jobs/emailQueueJob.ts` + testes.
//   - `TRANSACTIONAL_MARKER_HEAD` → `emailDispatcher.ts` +
//     `jobs/emailQueueJob.ts` + testes.
//   - `RenderedEmail` (tipo) → `templates/*.ts` + `nodemailerAdapter.ts` +
//     `jobs/emailQueueJob.ts` + testes.
//   - `AlertEmailContext` (tipo) → `templates/templateA*.ts` +
//     `templates/templateB*.ts` + `contextResolvers.ts` +
//     `jobs/emailQueueJob.ts` + `jobs/weeklyDigestJob.ts` + testes.
//   - `Template1Payload` (tipo) → `templates/template1_resetPassword.ts` +
//     `emailDispatcher.ts` + `auth.ts` religacao + testes.
//   - `Template3Payload` (tipo) → `templates/template3_emailChangeConfirm.ts` +
//     `emailDispatcher.ts` + `auth.ts` religacao + testes.
//   - `Template4Payload` (tipo) → `templates/template4_emailChangeSecurity.ts` +
//     `emailDispatcher.ts` + `auth.ts` religacao + testes.
//   - `TemplateAPayload` (tipo) → `templates/templateA_immediate.ts` +
//     `jobs/emailQueueJob.ts` + testes.
//   - `TemplateBPayload` (tipo) → `templates/templateB_weeklyDigest.ts` +
//     `jobs/weeklyDigestJob.ts` + testes.
//   - `PerfilPainel` (tipo) → `templates/templateA_immediate.ts` +
//     `emailDispatcher.ts` + testes.
//   - `TransactionalPayloadUnion` (tipo) → `emailDispatcher.ts` +
//     `jobs/emailQueueJob.ts` + testes.

import type { AlertSeveridade, AlertTipo } from '../alerts/typeDictionary';

// -----------------------------------------------------------------------
// Templates transacionais canonicos (5 templates da ME-060: 1, 3, 4)
// -----------------------------------------------------------------------

/**
 * Identificador canonico dos templates transacionais enfileirados via
 * `emailDispatcher.enqueueTransactional` (§12.9). Templates com gatilho
 * canonico no repo baseline pos-ME-059:
 * - `'1'` — Reset de senha (§12.2) — religado a `auth.forgotPassword`.
 * - `'3'` — Confirmacao de alteracao de e-mail (§12.4) — religado a
 *   `auth.requestEmailChange`.
 * - `'4'` — Notificacao de seguranca pos-alteracao (§12.5) — religado a
 *   `auth.confirmEmailChange`.
 *
 * **Templates diferidos por RV-13:**
 * - `'2'` — Primeiro acesso (§12.3): D068 NOVA. Diferido ao momento em
 *   que os cadastros de RH/C-level/Lider emitirem tokens `first_access`.
 * - `'L'` — Portal reminder (§12.8): D067. Diferido a ME-063 (B6 sub-e)
 *   junto ao `runDailyInstrumentStatusJob`.
 */
export type TransactionalTemplateId = '1' | '3' | '4';

/**
 * Cabecalho canonico do marker transacional (§12.9). Sempre a primeira
 * posicao do array `emailQueue.alertIds` quando `tipoEnvio='imediato'`
 * e o e-mail e transacional (nao consumido por alertas).
 */
export const TRANSACTIONAL_MARKER_HEAD = '__transactional__' as const;

/**
 * Formato canonico do marker transacional gravado em `emailQueue.alertIds`
 * (§12.9). Tupla literal de 3 posicoes:
 *   `['__transactional__', TemplateId, JSON.stringify(payload)]`.
 *
 * O worker `runEmailQueueJob` distingue no processamento:
 * - Se `alertIds[0] === TRANSACTIONAL_MARKER_HEAD` → template transacional.
 * - Caso contrario → array numerico de `alerts.id` (template A ou B por
 *   `tipoEnvio`).
 */
export type TransactionalMarker = readonly [
  typeof TRANSACTIONAL_MARKER_HEAD,
  TransactionalTemplateId,
  string,
];

// -----------------------------------------------------------------------
// Saida canonica dos templates
// -----------------------------------------------------------------------

/**
 * E-mail canonico renderizado, pronto para o `nodemailerAdapter`. Os tres
 * campos sao obrigatorios canonicamente (§12.11 exige HTML + texto plano
 * como fallback canonico Fase 1).
 */
export interface RenderedEmail {
  readonly assunto: string;
  readonly corpoTexto: string;
  readonly corpoHtml: string;
}

// -----------------------------------------------------------------------
// Payloads canonicos dos templates transacionais (1, 3, 4)
// -----------------------------------------------------------------------

/** Payload canonico do Template 1 (§12.2). */
export interface Template1Payload {
  readonly nomeDoUsuario: string;
  readonly baseUrl: string;
  readonly jwtToken: string;
}

/** Payload canonico do Template 3 (§12.4). */
export interface Template3Payload {
  readonly nomeDoBruno: string;
  readonly baseUrl: string;
  readonly jwtToken: string;
}

/**
 * Payload canonico do Template 4 (§12.5). `dataHora` no formato canonico
 * `DD/MM/YYYY as HH:mm` — o caller (auth.ts) formata antes de enfileirar.
 */
export interface Template4Payload {
  readonly nomeDoBruno: string;
  readonly dataHora: string;
  readonly novoEmail: string;
}

/**
 * Uniao canonica de todos os payloads transacionais. Consumida pelo
 * dispatcher para narrowing type-safe por `templateId`.
 */
export type TransactionalPayloadUnion =
  | { readonly templateId: '1'; readonly payload: Template1Payload }
  | { readonly templateId: '3'; readonly payload: Template3Payload }
  | { readonly templateId: '4'; readonly payload: Template4Payload };

// -----------------------------------------------------------------------
// Payloads canonicos dos templates de alerta (A, B)
// -----------------------------------------------------------------------

/**
 * Perfil canonico do destinatario para composicao do rodape do template A
 * (§12.6 linha 1399: `https://app.roip.com.br/painel-{perfil}`).
 *
 * - `'rh'` → `painel-rh`.
 * - `'clevel'` → `painel-clevel`.
 * - `'financeiro'` → `painel-financeiro`.
 * - `'super_admin'` → rodape aponta para `/super-admin` (§12.6 nota
 *   canonica linha 1411).
 */
export type PerfilPainel = 'rh' | 'clevel' | 'financeiro' | 'super_admin';

/**
 * Contexto canonico de um alerta pronto para renderizacao em template A
 * ou B. Consolida `alerts.tipo` + `alerts.severidade` + `alerts.metadados`
 * ja resolvidos por `contextResolvers.ts` + `linkDestino` ja calculado
 * por `linkResolver.ts` da ME-059.
 */
export interface AlertEmailContext {
  readonly tipo: AlertTipo;
  readonly rotuloLegivel: string;
  readonly severidade: AlertSeveridade;
  readonly emojiSeveridade: string;
  readonly contextoCurto: string;
  readonly linkDestino: string;
}

/**
 * Payload canonico do Template A (§12.6). Alertas ja pre-filtrados pelo
 * caller (worker `runEmailQueueJob`) para incluir apenas `critico` e
 * `atencao` (§12.6 regras de segmentacao). Ordem canonica preservada.
 */
export interface TemplateAPayload {
  readonly primeiroNome: string;
  readonly nomeEmpresa: string;
  readonly perfil: PerfilPainel;
  readonly alerts: readonly AlertEmailContext[];
}

/**
 * Payload canonico do Template B (§12.7). Alertas ja pre-filtrados pelo
 * caller (worker `weeklyDigestJob`) para incluir apenas `atencao` (sem
 * override para imediato) e `observacao` (§12.7 regras de composicao).
 * `weekStart`/`weekEnd` no formato canonico `DD/MM/YYYY`.
 */
export interface TemplateBPayload {
  readonly primeiroNome: string;
  readonly nomeEmpresa: string;
  readonly weekStartFormatted: string;
  readonly weekEndFormatted: string;
  readonly alerts: readonly AlertEmailContext[];
}
