/* eslint-disable @stylistic/max-len -- templates HTML canonicos com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — Template 1 canonico (Reset de senha) — ME-060.
//
// Origem canonica:
// - DOC 06 §12.2 (Template 1 — Reset de senha).
// - DOC 06 §11.1 (Handlebars T5 canonizada; HTML inline).
//
// Reproducoes bit-exact obrigatorias:
// - Assunto: "[ROIP APP] Redefinição de senha"
// - Corpo canonico (texto):
//     Olá, {nomeDoUsuario}!
//
//     Recebemos uma solicitação de redefinição de senha para sua conta na
//     plataforma ROIP APP.
//
//     Clique no botão abaixo para escolher uma nova senha. O link é válido
//     por 24 horas.
//
//     [Redefinir senha]  → link: {baseUrl}/reset-password?token={jwtToken}
//
//     Se você não solicitou essa alteração, ignore este e-mail. Sua senha
//     permanecerá inalterada.
//
//     Atenciosamente,
//     Equipe ROIP APP
//
// Contrato canonico:
// - `renderTemplate1` recebe `Template1Payload` e devolve `RenderedEmail`
//   com assunto + corpoTexto + corpoHtml.
// - Variaveis canonicas: `{nomeDoUsuario}`, `{baseUrl}`, `{jwtToken}`.
// - Gatilho canonico: `auth.forgotPassword` (§4.4 DOC 02).
// - Enfileiramento canonico via `emailDispatcher.enqueueTransactional`
//   com `templateId='1'` (§12.9).
// - Sem `target="_blank"` (canonizacao B3 do §12.6 aplicavel a todos os
//   templates com link).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `TEMPLATE_1_ID` → `renderTemplate1` + testes.
//   - `TEMPLATE_1_ASSUNTO` → `renderTemplate1` + testes.
//   - `TEMPLATE_1_CORPO_TEXTO` → `renderTemplate1` + testes.
//   - `TEMPLATE_1_CORPO_HTML` → `renderTemplate1` + testes.
//   - `renderTemplate1` → `jobs/emailQueueJob.ts` + testes.

import { renderTemplate } from '../handlebarsCompiler';
import type { RenderedEmail, Template1Payload } from '../types';

/** Chave canonica de cache Handlebars. */
export const TEMPLATE_1_ID = 'roip.template.1.resetPassword' as const;

/** Assunto canonico literal (§12.2). */
export const TEMPLATE_1_ASSUNTO = '[ROIP APP] Redefinição de senha' as const;

/**
 * Corpo canonico literal em texto plano (§12.2). Reproducao bit-exact
 * das linhas do §12.2. `\n` entre linhas; sem trailing whitespace.
 */
export const TEMPLATE_1_CORPO_TEXTO = `Olá, {{nomeDoUsuario}}!

Recebemos uma solicitação de redefinição de senha para sua conta na plataforma ROIP APP.

Clique no botão abaixo para escolher uma nova senha. O link é válido por 24 horas.

[Redefinir senha]  → link: {{baseUrl}}/reset-password?token={{jwtToken}}

Se você não solicitou essa alteração, ignore este e-mail. Sua senha permanecerá inalterada.

Atenciosamente,
Equipe ROIP APP` as const;

/**
 * Corpo canonico HTML inline (§12.1: HTML inline; sem
 * `<link rel="stylesheet">` externo). Estrutura canonica com botao
 * `[Redefinir senha]` como link estilizado inline. Sem `target="_blank"`.
 */
export const TEMPLATE_1_CORPO_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Redefinição de senha</title>
</head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5; margin: 0; padding: 20px;">
<p>Olá, {{nomeDoUsuario}}!</p>
<p>Recebemos uma solicitação de redefinição de senha para sua conta na plataforma ROIP APP.</p>
<p>Clique no botão abaixo para escolher uma nova senha. O link é válido por 24 horas.</p>
<p><a href="{{baseUrl}}/reset-password?token={{jwtToken}}" style="display: inline-block; padding: 12px 24px; background-color: #1a56db; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Redefinir senha</a></p>
<p>Se você não solicitou essa alteração, ignore este e-mail. Sua senha permanecerá inalterada.</p>
<p>Atenciosamente,<br>Equipe ROIP APP</p>
</body>
</html>` as const;

/**
 * Renderiza o Template 1 canonico. Aplica variaveis do payload aos tres
 * campos canonicos e devolve `RenderedEmail` pronto para o adapter SMTP.
 */
export function renderTemplate1(payload: Template1Payload): RenderedEmail {
  const data: Record<string, unknown> = {
    nomeDoUsuario: payload.nomeDoUsuario,
    baseUrl: payload.baseUrl,
    jwtToken: payload.jwtToken,
  };
  return {
    assunto: TEMPLATE_1_ASSUNTO,
    corpoTexto: renderTemplate(`${TEMPLATE_1_ID}.texto`, TEMPLATE_1_CORPO_TEXTO, data),
    corpoHtml: renderTemplate(`${TEMPLATE_1_ID}.html`, TEMPLATE_1_CORPO_HTML, data),
  };
}
