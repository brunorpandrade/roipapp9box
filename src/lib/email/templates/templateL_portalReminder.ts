/* eslint-disable @stylistic/max-len -- templates HTML canonicos com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — Template L canonico (Lembrete de portal) — ME-063a.
//
// Origem canonica:
// - DOC 06 §12.8 (Template L — Lembrete de portal, canonizacao S481).
// - DOC 06 §11.1 (Handlebars T5 canonizada; HTML inline).
// - DOC 06 §11.11 (UTF-8 obrigatorio; S353 ME-063a).
// - DOC 06 §12.9 (enfileiramento canonico transacional; templateId='L').
//
// Reproducoes bit-exact obrigatorias (§12.8):
// - Assunto: "Você tem instrumentos pendentes no portal ROIP APP"
// - Corpo canonico (texto):
//     Olá, {primeiroNome},
//
//     Você tem instrumentos pendentes no portal ROIP APP. Acesse-o para
//     respondê-los antes do prazo.
//
//     Instrumentos pendentes:
//     {lista_instrumentos_pendentes}
//
//     [Acessar portal →]  → link: {baseUrl}/colaborador
//
//     Este e-mail foi enviado automaticamente. Não responda.
//
//     Atenciosamente,
//     Equipe ROIP APP
//
// Estrutura canonica de `{lista_instrumentos_pendentes}` (§12.8 — uma
// linha por instrumento pendente):
// - Instrumento A: "• Autoavaliação — {status} · Prazo original: {prazo_DD/MM/YYYY}"
// - Instrumento C: "• Avaliação da liderança direta — {status} · Prazo original: {prazo_DD/MM/YYYY}"
// - Instrumento D: "• Avaliação do colaborador direto / seu líder — {status} · Prazo original: {prazo_DD/MM/YYYY}"
// - Instrumento B (Radar NR-1): "• Radar NR-1 — {status} · Prazo original: {prazo_DD/MM/YYYY}"
// - Perfil Individual: "• Meu perfil — {status}" (sem prazo, one-shot)
//
// `{status}` canonico e "Pendente" ou "Atrasado" conforme calculo do
// backend (Fase 7 §7.2). Caller fornece bit-exact — o template nao
// deriva; apenas renderiza.
//
// Contrato canonico:
// - `renderTemplateL` recebe `TemplateLPayload` e devolve `RenderedEmail`
//   com assunto + corpoTexto + corpoHtml.
// - Variaveis canonicas: `{primeiroNome}`, `{baseUrl}`,
//   `listaInstrumentos` (array estruturado — o template renderiza
//   bit-exact as linhas canonicas de §12.8, preservando fonte unica do
//   formato).
// - Gatilho canonico: job cron `runDailyInstrumentStatusJob` (ME-063b)
//   OU envio manual RH — em ambos, o caller monta o payload agregando
//   instrumentos pendentes do colaborador (Fase 7 §7.2 — calculo de
//   status Pendente/Atrasado).
// - Enfileiramento canonico via `emailDispatcher.enqueueTransactional`
//   com `templateId='L'` (§12.9).
// - Sem `target="_blank"` (canonizacao B3).
//
// Renderizacao canonica da lista:
// - `renderTemplateL` pre-renderiza `listaFormatadaTexto` e
//   `listaFormatadaHtml` a partir do array `listaInstrumentos`;
//   ambas sao passadas como variaveis Handlebars, com `listaFormatadaHtml`
//   injetada via triple-braces `{{{listaFormatadaHtml}}}` para preservar
//   o HTML canonico. Escape canonico dos campos primitivos (`primeiroNome`,
//   `baseUrl`) permanece via Handlebars default (`noEscape: false`).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `TEMPLATE_L_ID` → `renderTemplateL` + testes.
//   - `TEMPLATE_L_ASSUNTO` → `renderTemplateL` + testes.
//   - `TEMPLATE_L_CORPO_TEXTO` → `renderTemplateL` + testes.
//   - `TEMPLATE_L_CORPO_HTML` → `renderTemplateL` + testes.
//   - `renderTemplateL` → `jobs/emailQueueJob.ts` + testes.
//   - `renderListaInstrumentosTexto` → `renderTemplateL` + testes.
//   - `renderListaInstrumentosHtml` → `renderTemplateL` + testes.
//   - `TEMPLATE_L_INSTRUMENTO_ROTULO` → `renderListaInstrumentos*` +
//     testes.

import { renderTemplate } from '../handlebarsCompiler';
import type {
  RenderedEmail,
  TemplateLInstrumentoPendente,
  TemplateLInstrumentoTipo,
  TemplateLPayload,
} from '../types';

/** Chave canonica de cache Handlebars. */
export const TEMPLATE_L_ID = 'roip.template.L.portalReminder' as const;

/** Assunto canonico literal (§12.8). */
export const TEMPLATE_L_ASSUNTO = 'Você tem instrumentos pendentes no portal ROIP APP' as const;

/**
 * Rotulo canonico literal por tipo de instrumento (§12.8). Uso interno
 * pelos renderizadores de lista texto/HTML.
 */
export const TEMPLATE_L_INSTRUMENTO_ROTULO: Readonly<Record<TemplateLInstrumentoTipo, string>> = {
  A: 'Autoavaliação',
  C: 'Avaliação da liderança direta',
  D: 'Avaliação do colaborador direto / seu líder',
  B_NR1: 'Radar NR-1',
  PerfilIndividual: 'Meu perfil',
} as const;

/**
 * Corpo canonico literal em texto plano (§12.8). Reproducao bit-exact
 * das linhas do §12.8. `\n` entre linhas; sem trailing whitespace.
 * `{{{listaFormatadaTexto}}}` (triple braces) preserva os `\n`
 * canonicos da lista pre-renderizada por `renderListaInstrumentosTexto`.
 */
export const TEMPLATE_L_CORPO_TEXTO = `Olá, {{primeiroNome}},

Você tem instrumentos pendentes no portal ROIP APP. Acesse-o para respondê-los antes do prazo.

Instrumentos pendentes:
{{{listaFormatadaTexto}}}

[Acessar portal →]  → link: {{baseUrl}}/colaborador

Este e-mail foi enviado automaticamente. Não responda.

Atenciosamente,
Equipe ROIP APP` as const;

/**
 * Corpo canonico HTML inline (§12.1: HTML inline; sem
 * `<link rel="stylesheet">` externo). Estrutura canonica com botao
 * `[Acessar portal →]` como link estilizado inline. Sem `target="_blank"`.
 * Lista renderizada como `<ul>` canonico via triple-braces
 * `{{{listaFormatadaHtml}}}` (o HTML da lista e pre-renderizado por
 * `renderListaInstrumentosHtml` que ja escapa campos dinamicos).
 * Encoding UTF-8 preserva caracteres pt-BR (§11.11 + S353 ME-063a).
 */
export const TEMPLATE_L_CORPO_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Você tem instrumentos pendentes no portal ROIP APP</title>
</head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5; margin: 0; padding: 20px;">
<p>Olá, {{primeiroNome}},</p>
<p>Você tem instrumentos pendentes no portal ROIP APP. Acesse-o para respondê-los antes do prazo.</p>
<p><strong>Instrumentos pendentes:</strong></p>
{{{listaFormatadaHtml}}}
<p><a href="{{baseUrl}}/colaborador" style="display: inline-block; padding: 12px 24px; background-color: #1a56db; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Acessar portal →</a></p>
<p>Este e-mail foi enviado automaticamente. Não responda.</p>
<p>Atenciosamente,<br>Equipe ROIP APP</p>
</body>
</html>` as const;

/**
 * Escape HTML canonico minimalista. Usado pelo renderizador de lista
 * HTML para escapar valores dinamicos (`status`, `prazoDdMmYyyy`) antes
 * de compor cada `<li>` — como o HTML final entra no template via
 * triple-braces (sem escape do Handlebars), a responsabilidade de
 * escapar recai neste renderizador. Padrao bit-exact ao helper
 * canonico ja usado em `templateA_immediate.ts` / `templateB_weeklyDigest.ts`
 * mas mantido local para evitar acoplamento cruzado (RV-13 fica clara —
 * este arquivo tem escopo autonomo).
 */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renderiza uma linha canonica de instrumento em texto plano (§12.8).
 * Formato bit-exact:
 * - A/C/D/B_NR1: "• {rotulo} — {status} · Prazo original: {prazo}"
 * - PerfilIndividual: "• {rotulo} — {status}" (sem prazo)
 */
function renderLinhaInstrumentoTexto(item: TemplateLInstrumentoPendente): string {
  const rotulo = TEMPLATE_L_INSTRUMENTO_ROTULO[item.tipo];
  if (item.tipo === 'PerfilIndividual') {
    return `• ${rotulo} — ${item.status}`;
  }
  return `• ${rotulo} — ${item.status} · Prazo original: ${item.prazoDdMmYyyy}`;
}

/**
 * Renderiza uma linha canonica de instrumento em HTML (§12.8) como
 * `<li>...</li>` com escape canonico dos campos dinamicos.
 */
function renderLinhaInstrumentoHtml(item: TemplateLInstrumentoPendente): string {
  const rotulo = escapeHtml(TEMPLATE_L_INSTRUMENTO_ROTULO[item.tipo]);
  const status = escapeHtml(item.status);
  if (item.tipo === 'PerfilIndividual') {
    return `<li>${rotulo} — ${status}</li>`;
  }
  const prazo = escapeHtml(item.prazoDdMmYyyy);
  return `<li>${rotulo} — ${status} · Prazo original: ${prazo}</li>`;
}

/**
 * Pre-renderiza `listaFormatadaTexto` canonica. Uma linha por
 * instrumento, separadas por `\n`. Ordem canonica preservada bit-exact
 * ao array de entrada (o caller controla a ordem — os instrumentos
 * aparecem no e-mail na ordem em que o caller os enfileira).
 */
export function renderListaInstrumentosTexto(
  listaInstrumentos: readonly TemplateLInstrumentoPendente[],
): string {
  return listaInstrumentos.map(renderLinhaInstrumentoTexto).join('\n');
}

/**
 * Pre-renderiza `listaFormatadaHtml` canonica como `<ul>` com
 * `<li>` por instrumento. Estilo canonico bit-exact ao padrao dos
 * demais templates (padding zerado no `<ul>`, marker canonico `disc`
 * dentro do `<li>` implicito pelo browser).
 */
export function renderListaInstrumentosHtml(
  listaInstrumentos: readonly TemplateLInstrumentoPendente[],
): string {
  const linhas = listaInstrumentos.map(renderLinhaInstrumentoHtml).join('');
  return `<ul style="margin: 8px 0 16px 20px; padding: 0;">${linhas}</ul>`;
}

/**
 * Renderiza o Template L canonico. Pre-renderiza as duas versoes da
 * lista (texto/HTML) a partir de `listaInstrumentos`, aplica as
 * variaveis canonicas e devolve `RenderedEmail` pronto para o adapter
 * SMTP.
 */
export function renderTemplateL(payload: TemplateLPayload): RenderedEmail {
  const listaFormatadaTexto = renderListaInstrumentosTexto(payload.listaInstrumentos);
  const listaFormatadaHtml = renderListaInstrumentosHtml(payload.listaInstrumentos);
  const data: Record<string, unknown> = {
    primeiroNome: payload.primeiroNome,
    baseUrl: payload.baseUrl,
    listaFormatadaTexto,
    listaFormatadaHtml,
  };
  return {
    assunto: TEMPLATE_L_ASSUNTO,
    corpoTexto: renderTemplate(`${TEMPLATE_L_ID}.texto`, TEMPLATE_L_CORPO_TEXTO, data),
    corpoHtml: renderTemplate(`${TEMPLATE_L_ID}.html`, TEMPLATE_L_CORPO_HTML, data),
  };
}
