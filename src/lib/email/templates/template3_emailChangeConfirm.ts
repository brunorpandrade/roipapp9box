/* eslint-disable @stylistic/max-len -- templates HTML canonicos com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — Template 3 canonico (Confirmacao de alteracao de
// e-mail) — ME-060.
//
// Origem canonica:
// - DOC 06 §12.4 (Template 3 — Confirmacao de alteracao de e-mail).
// - DOC 06 §11.1 (Handlebars T5 canonizada; HTML inline).
// - DOC 06 §12.4 nota canonica: variavel `{nomeDoBruno}` e literal do
//   canonico original (Fase M P1 §12.3.3) — Super Admin do MVP e sempre
//   Bruno. Reproducao literal obrigatoria.
//
// Reproducoes bit-exact obrigatorias:
// - Assunto: "[ROIP APP] Confirme a alteracao do seu e-mail de acesso"
// - Corpo canonico:
//     Ola, {nomeDoBruno}!
//
//     Recebemos uma solicitacao para alterar o e-mail de acesso a
//     plataforma ROIP APP para este endereco.
//
//     Clique no botao abaixo para confirmar a alteracao. O link e valido
//     por 24 horas.
//
//     [Confirmar alteracao]  → link: {baseUrl}/confirmar-alteracao-email?token={jwtToken}
//
//     Se voce nao solicitou essa alteracao, ignore este e-mail. Nenhuma
//     modificacao sera feita.
//
//     Atenciosamente,
//     Equipe ROIP APP
//
// Contrato canonico:
// - Gatilho canonico: `auth.requestEmailChange` (§4.8 DOC 02, exclusivo
//   Super Admin no MVP).
// - Envio para o NOVO e-mail (que ainda precisa confirmar a mudanca).
// - Variaveis canonicas: `{nomeDoBruno}`, `{baseUrl}`, `{jwtToken}`.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `TEMPLATE_3_ID` → `renderTemplate3` + testes.
//   - `TEMPLATE_3_ASSUNTO` → `renderTemplate3` + testes.
//   - `TEMPLATE_3_CORPO_TEXTO` → `renderTemplate3` + testes.
//   - `TEMPLATE_3_CORPO_HTML` → `renderTemplate3` + testes.
//   - `renderTemplate3` → `jobs/emailQueueJob.ts` + testes.

import { renderTemplate } from '../handlebarsCompiler';
import type { RenderedEmail, Template3Payload } from '../types';

/** Chave canonica de cache Handlebars. */
export const TEMPLATE_3_ID = 'roip.template.3.emailChangeConfirm' as const;

/** Assunto canonico literal (§12.4). */
export const TEMPLATE_3_ASSUNTO =
  '[ROIP APP] Confirme a alteracao do seu e-mail de acesso' as const;

/** Corpo canonico literal em texto plano (§12.4). Reproducao bit-exact. */
export const TEMPLATE_3_CORPO_TEXTO = `Ola, {{nomeDoBruno}}!

Recebemos uma solicitacao para alterar o e-mail de acesso a plataforma ROIP APP para este endereco.

Clique no botao abaixo para confirmar a alteracao. O link e valido por 24 horas.

[Confirmar alteracao]  → link: {{baseUrl}}/confirmar-alteracao-email?token={{jwtToken}}

Se voce nao solicitou essa alteracao, ignore este e-mail. Nenhuma modificacao sera feita.

Atenciosamente,
Equipe ROIP APP` as const;

/** Corpo canonico HTML inline (§12.1). Sem `target="_blank"` (B3). */
export const TEMPLATE_3_CORPO_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Confirmacao de alteracao de e-mail</title>
</head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5; margin: 0; padding: 20px;">
<p>Ola, {{nomeDoBruno}}!</p>
<p>Recebemos uma solicitacao para alterar o e-mail de acesso a plataforma ROIP APP para este endereco.</p>
<p>Clique no botao abaixo para confirmar a alteracao. O link e valido por 24 horas.</p>
<p><a href="{{baseUrl}}/confirmar-alteracao-email?token={{jwtToken}}" style="display: inline-block; padding: 12px 24px; background-color: #1a56db; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Confirmar alteracao</a></p>
<p>Se voce nao solicitou essa alteracao, ignore este e-mail. Nenhuma modificacao sera feita.</p>
<p>Atenciosamente,<br>Equipe ROIP APP</p>
</body>
</html>` as const;

/**
 * Renderiza o Template 3 canonico. Aplica variaveis do payload aos tres
 * campos canonicos e devolve `RenderedEmail` pronto para o adapter SMTP.
 */
export function renderTemplate3(payload: Template3Payload): RenderedEmail {
  const data: Record<string, unknown> = {
    nomeDoBruno: payload.nomeDoBruno,
    baseUrl: payload.baseUrl,
    jwtToken: payload.jwtToken,
  };
  return {
    assunto: TEMPLATE_3_ASSUNTO,
    corpoTexto: renderTemplate(`${TEMPLATE_3_ID}.texto`, TEMPLATE_3_CORPO_TEXTO, data),
    corpoHtml: renderTemplate(`${TEMPLATE_3_ID}.html`, TEMPLATE_3_CORPO_HTML, data),
  };
}
