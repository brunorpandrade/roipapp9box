// ROIP APP 9BOX — barrel canonico do modulo de e-mail (ME-060 + ME-063a).
//
// Origem canonica:
// - DOC 06 §11 (Sistema canonico de disparo de e-mails).
// - DOC 06 §12 (Templates canonicos).
//
// Contrato canonico:
// - API publica do modulo — consumida por `emailDispatcher.ts`,
//   `jobs/emailQueueJob.ts`, `jobs/weeklyDigestJob.ts`,
//   `jobs/scheduler.ts` (ME-063a), `routers/auth.ts` (religacao) e
//   testes.
// - Reexporta apenas o que precisa ser consumido fora de `src/lib/email/`.
//   Utilitarios internos (escapeHtml, s(), etc.) permanecem privados aos
//   arquivos onde vivem.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - Tipos → dispatcher + workers + scheduler + auth.ts + testes.
//   - Funcoes de render → workers + testes.
//   - Funcoes de filtragem/ordenacao → workers + testes.
//   - Utilitarios de formato → workers + auth.ts + testes.

export type {
  AlertEmailContext,
  PerfilPainel,
  RenderedEmail,
  Template1Payload,
  Template2Payload,
  Template3Payload,
  Template4Payload,
  TemplateAPayload,
  TemplateBPayload,
  TemplateLInstrumentoPendente,
  TemplateLInstrumentoTipo,
  TemplateLPayload,
  TransactionalMarker,
  TransactionalPayloadUnion,
  TransactionalTemplateId,
} from './types';
export { TRANSACTIONAL_MARKER_HEAD } from './types';

export { formatAlertBadge, getEmojiSeveridade, getRotuloLegivel } from './typeLabels';

export { resolveContextoCurto, D050_NAO_RENDERIZA_MOTIVO } from './contextResolvers';
export type { AlertMetadadosRaw } from './contextResolvers';

export {
  formatWeekRangeDDMM,
  formatWeekRangeDDMMYYYY,
  getWeekBounds,
  isMondayEightAmLocal,
} from './weeklyDigestDate';

export {
  buildFromHumanizado,
  resolveSmtpConfig,
  sendEmailViaSmtp,
  sendEmailViaTransport,
  SmtpConfigError,
  _resetSmtpTransportCache,
} from './nodemailerAdapter';
export type { SmtpConfig, SmtpEnvelope, SmtpSendResult } from './nodemailerAdapter';

export { _resetHandlebarsCache, compileTemplateOnce, renderTemplate } from './handlebarsCompiler';

export {
  renderTemplate1,
  TEMPLATE_1_ASSUNTO,
  TEMPLATE_1_CORPO_HTML,
  TEMPLATE_1_CORPO_TEXTO,
  TEMPLATE_1_ID,
} from './templates/template1_resetPassword';

export {
  renderTemplate2,
  TEMPLATE_2_ASSUNTO,
  TEMPLATE_2_CORPO_HTML,
  TEMPLATE_2_CORPO_TEXTO,
  TEMPLATE_2_ID,
} from './templates/template2_firstAccess';

export {
  renderTemplate3,
  TEMPLATE_3_ASSUNTO,
  TEMPLATE_3_CORPO_HTML,
  TEMPLATE_3_CORPO_TEXTO,
  TEMPLATE_3_ID,
} from './templates/template3_emailChangeConfirm';

export {
  formatDataHoraCanonica,
  renderTemplate4,
  TEMPLATE_4_ASSUNTO,
  TEMPLATE_4_CORPO_HTML,
  TEMPLATE_4_CORPO_TEXTO,
  TEMPLATE_4_ID,
} from './templates/template4_emailChangeSecurity';

export {
  buildAssuntoTemplateA,
  filterAndSortAlertsForTemplateA,
  renderTemplateA,
  resolvePainelUrl,
  TEMPLATE_A_ID,
  TEMPLATE_A_URL_BASE_PAINEL,
} from './templates/templateA_immediate';

export {
  buildAssuntoTemplateB,
  filterAndSortAlertsForTemplateB,
  renderTemplateB,
  TEMPLATE_B_ID,
  TEMPLATE_B_URL_NOTIFICACOES,
} from './templates/templateB_weeklyDigest';

export {
  renderListaInstrumentosHtml,
  renderListaInstrumentosTexto,
  renderTemplateL,
  TEMPLATE_L_ASSUNTO,
  TEMPLATE_L_CORPO_HTML,
  TEMPLATE_L_CORPO_TEXTO,
  TEMPLATE_L_ID,
  TEMPLATE_L_INSTRUMENTO_ROTULO,
} from './templates/templateL_portalReminder';
