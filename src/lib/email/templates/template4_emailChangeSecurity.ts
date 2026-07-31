/* eslint-disable @stylistic/max-len -- templates HTML canonicos com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — Template 4 canonico (Notificacao de seguranca
// pos-alteracao) — ME-060.
//
// Origem canonica:
// - DOC 06 §12.5 (Template 4 — Notificacao de seguranca pos-alteracao).
// - DOC 06 §11.1 (Handlebars T5 canonizada; HTML inline).
//
// Reproducoes bit-exact obrigatorias:
// - Assunto: "[ROIP APP] Seu e-mail de acesso foi alterado"
// - Corpo canonico:
//     Ola, {nomeDoBruno}!
//
//     Este e um aviso de seguranca. Seu e-mail de acesso a plataforma ROIP
//     APP foi alterado em {dataHora}.
//
//     Novo e-mail: {novoEmail}
//
//     Se foi voce quem realizou essa alteracao, nenhuma acao e necessaria.
//     A partir de agora, faca login usando o novo e-mail.
//
//     Se nao foi voce, contate imediatamente o suporte para restaurar a
//     conta.
//
//     Atenciosamente,
//     Equipe ROIP APP
//
// Contrato canonico:
// - Gatilho canonico: `auth.confirmEmailChange` (§4.9 DOC 02).
// - Envio para o e-mail ANTIGO **apos** conclusao bem-sucedida da
//   alteracao (§12.5 gatilho literal).
// - Variaveis canonicas: `{nomeDoBruno}`, `{dataHora}` no formato canonico
//   `DD/MM/YYYY as HH:mm`, `{novoEmail}`.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `TEMPLATE_4_ID` → `renderTemplate4` + testes.
//   - `TEMPLATE_4_ASSUNTO` → `renderTemplate4` + testes.
//   - `TEMPLATE_4_CORPO_TEXTO` → `renderTemplate4` + testes.
//   - `TEMPLATE_4_CORPO_HTML` → `renderTemplate4` + testes.
//   - `renderTemplate4` → `jobs/emailQueueJob.ts` + testes.
//   - `formatDataHoraCanonica` → `auth.ts` religacao + testes.

import { renderTemplate } from '../handlebarsCompiler';
import type { RenderedEmail, Template4Payload } from '../types';

/** Chave canonica de cache Handlebars. */
export const TEMPLATE_4_ID = 'roip.template.4.emailChangeSecurity' as const;

/** Assunto canonico literal (§12.5). */
export const TEMPLATE_4_ASSUNTO = '[ROIP APP] Seu e-mail de acesso foi alterado' as const;

/** Corpo canonico literal em texto plano (§12.5). Reproducao bit-exact. */
export const TEMPLATE_4_CORPO_TEXTO = `Ola, {{nomeDoBruno}}!

Este e um aviso de seguranca. Seu e-mail de acesso a plataforma ROIP APP foi alterado em {{dataHora}}.

Novo e-mail: {{novoEmail}}

Se foi voce quem realizou essa alteracao, nenhuma acao e necessaria. A partir de agora, faca login usando o novo e-mail.

Se nao foi voce, contate imediatamente o suporte para restaurar a conta.

Atenciosamente,
Equipe ROIP APP` as const;

/** Corpo canonico HTML inline (§12.1). */
export const TEMPLATE_4_CORPO_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Aviso de seguranca — e-mail alterado</title>
</head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5; margin: 0; padding: 20px;">
<p>Ola, {{nomeDoBruno}}!</p>
<p>Este e um aviso de seguranca. Seu e-mail de acesso a plataforma ROIP APP foi alterado em {{dataHora}}.</p>
<p><strong>Novo e-mail:</strong> {{novoEmail}}</p>
<p>Se foi voce quem realizou essa alteracao, nenhuma acao e necessaria. A partir de agora, faca login usando o novo e-mail.</p>
<p>Se nao foi voce, contate imediatamente o suporte para restaurar a conta.</p>
<p>Atenciosamente,<br>Equipe ROIP APP</p>
</body>
</html>` as const;

/**
 * Formata Date UTC para o formato canonico `DD/MM/YYYY as HH:mm` no fuso
 * `America/Sao_Paulo` (canonico §11.1 T7 + §12.5). Consumido pelo caller
 * (`auth.confirmEmailChange`) antes de enfileirar.
 *
 * Formato canonico literal: "31/07/2026 as 14:30" — com zero-padding em
 * dia, mes, hora e minuto; ano com 4 digitos; separador " as " literal.
 */
export function formatDataHoraCanonica(date: Date, timezone: string = 'America/Sao_Paulo'): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const day = byType.get('day') ?? '01';
  const month = byType.get('month') ?? '01';
  const year = byType.get('year') ?? '1970';
  // `Intl.DateTimeFormat` com `hour12: false` pode devolver "24" para
  // meia-noite; normalizamos para "00" para preservar formato canonico.
  const hourRaw = byType.get('hour') ?? '00';
  const hour = hourRaw === '24' ? '00' : hourRaw;
  const minute = byType.get('minute') ?? '00';
  return `${day}/${month}/${year} as ${hour}:${minute}`;
}

/**
 * Renderiza o Template 4 canonico. Aplica variaveis do payload aos tres
 * campos canonicos e devolve `RenderedEmail` pronto para o adapter SMTP.
 */
export function renderTemplate4(payload: Template4Payload): RenderedEmail {
  const data: Record<string, unknown> = {
    nomeDoBruno: payload.nomeDoBruno,
    dataHora: payload.dataHora,
    novoEmail: payload.novoEmail,
  };
  return {
    assunto: TEMPLATE_4_ASSUNTO,
    corpoTexto: renderTemplate(`${TEMPLATE_4_ID}.texto`, TEMPLATE_4_CORPO_TEXTO, data),
    corpoHtml: renderTemplate(`${TEMPLATE_4_ID}.html`, TEMPLATE_4_CORPO_HTML, data),
  };
}
