// ROIP APP 9BOX — adapter canonico Nodemailer (ME-060).
//
// Origem canonica:
// - DOC 06 §11.1 (stack canonica: Nodemailer + config das variaveis de
//   ambiente da plataforma; SMTP global; configuracao por empresa fora
//   do escopo canonico).
// - DOC 06 §12.11 (envio via Nodemailer):
//     - Remetente canonico: `SMTP_FROM` variavel de ambiente.
//     - From humanizado literal: "ROIP APP <{SMTP_FROM}>".
//     - Encoding UTF-8 obrigatorio (pt-BR).
//     - Format HTML + texto plano (fallback canonico Fase 1).
//     - `smtpMessageId` retornado persistido em
//       `emailNotifications.smtpMessageId`.
//     - Sem Reply-To (one-way).
//
// Contrato canonico:
// - Camada fina sobre `nodemailer.createTransport`. Expoe uma unica funcao
//   `sendEmailViaSmtp` consumida pelo worker `runEmailQueueJob`.
// - Config canonica lida uma unica vez do `process.env` no primeiro
//   `sendEmailViaSmtp` (cache lazy — evita I/O na importacao).
// - Erros do transport sobem como excecoes tipadas para o worker aplicar
//   a policy de retry (§11.2 passo 6).
// - Testes injetam transport customizado via `sendEmailViaTransport`
//   para nao depender de rede real; o worker sempre usa `sendEmailViaSmtp`
//   (que resolve o transport canonico global).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `SmtpConfig` (tipo) → testes + `sendEmailViaTransport`.
//   - `SmtpEnvelope` (tipo) → `sendEmailViaSmtp` +
//     `sendEmailViaTransport` + `jobs/emailQueueJob.ts` + testes.
//   - `SmtpSendResult` (tipo) → `sendEmailViaSmtp` +
//     `sendEmailViaTransport` + `jobs/emailQueueJob.ts` + testes.
//   - `SmtpConfigError` (classe) → `resolveSmtpConfig` + testes.
//   - `resolveSmtpConfig` → `sendEmailViaSmtp` + testes.
//   - `buildFromHumanizado` → `sendEmailViaSmtp` +
//     `sendEmailViaTransport` + testes.
//   - `sendEmailViaSmtp` → `jobs/emailQueueJob.ts` + testes.
//   - `sendEmailViaTransport` → `sendEmailViaSmtp` + testes de
//     integracao (com transport stub).

import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Config canonica SMTP resolvida a partir de variaveis de ambiente
 * (§11.1). Todas obrigatorias no boot da aplicacao.
 */
export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly password: string;
  readonly from: string;
}

/** Envelope canonico do e-mail a enviar. */
export interface SmtpEnvelope {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * Resultado canonico do envio SMTP. `smtpMessageId` e persistido em
 * `emailNotifications.smtpMessageId` (§11.9 rastreabilidade externa).
 */
export interface SmtpSendResult {
  readonly smtpMessageId: string;
}

/**
 * Erro canonico de config SMTP faltante. Lancado no boot (primeiro envio)
 * se qualquer variavel de ambiente canonica esta ausente. Nao e retryable
 * — indica falha de configuracao, nao falha de rede.
 */
export class SmtpConfigError extends Error {
  constructor(public readonly variavelAusente: string) {
    super(
      `SmtpConfigError: variavel de ambiente canonica ausente: ${variavelAusente}. ` +
        'Configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM.',
    );
    this.name = 'SmtpConfigError';
  }
}

/**
 * Resolve config canonica do `process.env`. Lanca `SmtpConfigError` se
 * qualquer variavel ausente. Sem cache — o caller (`sendEmailViaSmtp`)
 * mantem cache lazy do transport ja construido.
 */
export function resolveSmtpConfig(
  env: Record<string, string | undefined> = process.env,
): SmtpConfig {
  // Aceita override do env parametro para testes; producao usa
  // `process.env` diretamente.
  const localEnv = env;
  const host = localEnv['SMTP_HOST'];
  const portRaw = localEnv['SMTP_PORT'];
  const secureRaw = localEnv['SMTP_SECURE'];
  const user = localEnv['SMTP_USER'];
  const password = localEnv['SMTP_PASSWORD'];
  const from = localEnv['SMTP_FROM'];

  if (host === undefined || host === '') throw new SmtpConfigError('SMTP_HOST');
  if (portRaw === undefined || portRaw === '') throw new SmtpConfigError('SMTP_PORT');
  if (secureRaw === undefined || secureRaw === '') throw new SmtpConfigError('SMTP_SECURE');
  if (user === undefined || user === '') throw new SmtpConfigError('SMTP_USER');
  if (password === undefined || password === '') throw new SmtpConfigError('SMTP_PASSWORD');
  if (from === undefined || from === '') throw new SmtpConfigError('SMTP_FROM');

  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new SmtpConfigError('SMTP_PORT');
  }
  const secure = secureRaw === 'true' || secureRaw === '1';

  return { host, port, secure, user, password, from };
}

/**
 * Constroi o campo `From` humanizado canonico (§12.11: "ROIP APP
 * <{SMTP_FROM}>").
 */
export function buildFromHumanizado(from: string): string {
  return `ROIP APP <${from}>`;
}

/**
 * Envio canonico via transport injetado. Interface principal para
 * testes — o worker usa `sendEmailViaSmtp` que resolve o transport
 * canonico global. Nao lanca em caso de sucesso; se o transport
 * rejeitar, a excecao sobe para o caller aplicar retry policy.
 */
export async function sendEmailViaTransport(
  transport: Transporter,
  from: string,
  envelope: SmtpEnvelope,
): Promise<SmtpSendResult> {
  const info = await transport.sendMail({
    from: buildFromHumanizado(from),
    to: envelope.to,
    subject: envelope.subject,
    text: envelope.text,
    html: envelope.html,
    // UTF-8 canonico obrigatorio (§12.11) — Nodemailer usa UTF-8 por
    // padrao mas explicitamos para preservar canonizacao literal.
    encoding: 'utf-8',
  });
  const messageId = typeof info.messageId === 'string' ? info.messageId : '';
  return { smtpMessageId: messageId };
}

// Cache lazy do transport canonico. Reset entre testes via
// `_resetSmtpTransportCache` (nao exportado publicamente).
let cachedTransport: Transporter | null = null;
let cachedConfig: SmtpConfig | null = null;

/**
 * Reset canonico do cache de transport. Uso exclusivo em testes —
 * NAO deve ser chamado em producao (o transport global fica ativo
 * durante todo o processo).
 */
export function _resetSmtpTransportCache(): void {
  cachedTransport = null;
  cachedConfig = null;
}

/**
 * Envio canonico via transport global (config lida do `process.env`).
 * Consumido pelo worker `runEmailQueueJob`. Lazy — a primeira invocacao
 * resolve config + cria transport; invocacoes subsequentes reutilizam
 * o transport canonico ate o processo terminar.
 */
export async function sendEmailViaSmtp(envelope: SmtpEnvelope): Promise<SmtpSendResult> {
  if (cachedTransport === null || cachedConfig === null) {
    const cfg = resolveSmtpConfig();
    cachedConfig = cfg;
    cachedTransport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.user,
        pass: cfg.password,
      },
    });
  }
  return sendEmailViaTransport(cachedTransport, cachedConfig.from, envelope);
}
