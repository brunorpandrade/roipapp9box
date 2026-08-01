/* eslint-disable @stylistic/max-len -- templates HTML canonicos com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — Template 2 canonico (Primeiro acesso) — ME-063a.
//
// Origem canonica:
// - DOC 06 §12.3 (Template 2 — Primeiro acesso).
// - DOC 06 §11.1 (Handlebars T5 canonizada; HTML inline).
// - DOC 06 §11.11 (UTF-8 obrigatorio para preservar caracteres pt-BR;
//   S353 canonizada em ME-063a — ortografia canonica com acentos).
//
// Reproducoes bit-exact obrigatorias (§12.3):
// - Assunto: "[ROIP APP] Bem-vindo(a) — defina sua senha"
// - Corpo canonico (texto):
//     Olá, {nomeDoUsuario}!
//
//     Sua conta na plataforma ROIP APP foi criada. Para concluir o primeiro
//     acesso, escolha sua senha clicando no botão abaixo.
//
//     [Definir senha]  → link: {baseUrl}/first-access?token={jwtToken}
//
//     O link é válido por 24 horas. Após esse prazo, contate {contatoAdmin}
//     para receber um novo.
//
//     Seu identificador de acesso será:
//     {identificador}
//
//     Atenciosamente,
//     Equipe ROIP APP
//
// Contrato canonico:
// - `renderTemplate2` recebe `Template2Payload` e devolve `RenderedEmail`
//   com assunto + corpoTexto + corpoHtml.
// - Variaveis canonicas: `{nomeDoUsuario}`, `{baseUrl}`, `{jwtToken}`,
//   `{contatoAdmin}` (RH da empresa ou Super Admin conforme perfil
//   criado), `{identificador}` (CPF formatado para RH/C-level/Lider;
//   e-mail para Super Admin).
// - Gatilho canonico: cadastro de RH, C-level ou Lider via superficies
//   canonicas (Fase M Parte 2, Parte 3, Parte 4) — religacao real do
//   gatilho em ME futura de cadastro.
// - Enfileiramento canonico via `emailDispatcher.enqueueTransactional`
//   com `templateId='2'` (§12.9).
// - Sem `target="_blank"` (canonizacao B3 do §12.6 aplicavel a todos os
//   templates com link).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `TEMPLATE_2_ID` → `renderTemplate2` + testes.
//   - `TEMPLATE_2_ASSUNTO` → `renderTemplate2` + testes.
//   - `TEMPLATE_2_CORPO_TEXTO` → `renderTemplate2` + testes.
//   - `TEMPLATE_2_CORPO_HTML` → `renderTemplate2` + testes.
//   - `renderTemplate2` → `jobs/emailQueueJob.ts` + testes.

import { renderTemplate } from '../handlebarsCompiler';
import type { RenderedEmail, Template2Payload } from '../types';

/** Chave canonica de cache Handlebars. */
export const TEMPLATE_2_ID = 'roip.template.2.firstAccess' as const;

/** Assunto canonico literal (§12.3). */
export const TEMPLATE_2_ASSUNTO = '[ROIP APP] Bem-vindo(a) — defina sua senha' as const;

/**
 * Corpo canonico literal em texto plano (§12.3). Reproducao bit-exact
 * das linhas do §12.3. `\n` entre linhas; sem trailing whitespace.
 */
export const TEMPLATE_2_CORPO_TEXTO = `Olá, {{nomeDoUsuario}}!

Sua conta na plataforma ROIP APP foi criada. Para concluir o primeiro acesso, escolha sua senha clicando no botão abaixo.

[Definir senha]  → link: {{baseUrl}}/first-access?token={{jwtToken}}

O link é válido por 24 horas. Após esse prazo, contate {{contatoAdmin}} para receber um novo.

Seu identificador de acesso será:
{{identificador}}

Atenciosamente,
Equipe ROIP APP` as const;

/**
 * Corpo canonico HTML inline (§12.1: HTML inline; sem
 * `<link rel="stylesheet">` externo). Estrutura canonica com botao
 * `[Definir senha]` como link estilizado inline. Sem `target="_blank"`.
 * Identificador exibido em bloco monoespacado canonicamente destacado
 * (padrao bit-exact ao Template 1 baseline). Encoding UTF-8 preserva
 * caracteres pt-BR (§11.11 canonico + S353 ME-063a).
 */
export const TEMPLATE_2_CORPO_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Bem-vindo(a) — defina sua senha</title>
</head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5; margin: 0; padding: 20px;">
<p>Olá, {{nomeDoUsuario}}!</p>
<p>Sua conta na plataforma ROIP APP foi criada. Para concluir o primeiro acesso, escolha sua senha clicando no botão abaixo.</p>
<p><a href="{{baseUrl}}/first-access?token={{jwtToken}}" style="display: inline-block; padding: 12px 24px; background-color: #1a56db; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Definir senha</a></p>
<p>O link é válido por 24 horas. Após esse prazo, contate {{contatoAdmin}} para receber um novo.</p>
<p>Seu identificador de acesso será:<br><span style="display: inline-block; font-family: 'Courier New', Courier, monospace; background-color: #f3f4f6; padding: 6px 10px; border-radius: 4px; font-weight: bold;">{{identificador}}</span></p>
<p>Atenciosamente,<br>Equipe ROIP APP</p>
</body>
</html>` as const;

/**
 * Renderiza o Template 2 canonico. Aplica variaveis do payload aos tres
 * campos canonicos e devolve `RenderedEmail` pronto para o adapter SMTP.
 */
export function renderTemplate2(payload: Template2Payload): RenderedEmail {
  const data: Record<string, unknown> = {
    nomeDoUsuario: payload.nomeDoUsuario,
    baseUrl: payload.baseUrl,
    jwtToken: payload.jwtToken,
    contatoAdmin: payload.contatoAdmin,
    identificador: payload.identificador,
  };
  return {
    assunto: TEMPLATE_2_ASSUNTO,
    corpoTexto: renderTemplate(`${TEMPLATE_2_ID}.texto`, TEMPLATE_2_CORPO_TEXTO, data),
    corpoHtml: renderTemplate(`${TEMPLATE_2_ID}.html`, TEMPLATE_2_CORPO_HTML, data),
  };
}
