/* eslint-disable @stylistic/max-len -- templates HTML canonicos com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — Template B canonico (Digest semanal) — ME-060.
//
// Origem canonica:
// - DOC 06 §12.7 (Template B — Digest semanal).
// - DOC 06 §11.1 (Handlebars T5 canonizada; HTML inline).
// - DOC 06 §6.5 (severidade + canal — filtragem canonica).
//
// Reproducoes bit-exact obrigatorias:
// - Assunto: "[ROIP APP] {nome_empresa} — Resumo semanal de alertas
//            ({weekStart_DD/MM/YYYY} a {weekEnd_DD/MM/YYYY})"
// - Corpo canonico literal:
//     Ola, {primeiroNome},
//
//     Este e o resumo dos alertas acumulados na semana de
//     {weekStart_DD/MM} a {weekEnd_DD/MM} para {nome_empresa}.
//
//     {N} atencao · {M} observacao
//
//     Atencao
//     {lista_atencao}
//
//     Observacao
//     {lista_observacao}
//
//     Acesse o historico completo em https://app.roip.com.br/notificacoes.
//     Este e-mail foi enviado automaticamente. Nao responda.
//
// Regras canonicas de composicao (§12.7):
// - `critico` NAO aparece no digest (foi enviado como imediato).
// - `info` NAO aparece no digest (apenas sino).
// - `atencao` NA lista canonica de override (§6.5) tambem NAO aparece —
//   ja foi enviado como imediato.
// - Renderizacao dos alertas identica ao template A (badge + contexto +
//   link) — reutilizamos o formato de badge canonico.
// - Contadores refletem SOMENTE os alertas efetivamente presentes.
// - Datas em `DD/MM/YYYY` (U7).
//
// Nota canonica sobre "atencao override": a decisao canonica de override
// para imediato acontece no motor ME-059 (`m6-channel.ts` +
// `severity.ts`). O que chega ao template B via `emailQueue` com
// `tipoEnvio='digest_semanal'` ja e o conjunto canonico correto — nao ha
// filtragem residual necessaria. Aplicamos apenas o filtro por severidade
// (`atencao` OU `observacao`) como salvaguarda canonica.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `TEMPLATE_B_ID` → `renderTemplateB` + testes.
//   - `TEMPLATE_B_URL_NOTIFICACOES` → `renderTemplateB` + testes.
//   - `filterAndSortAlertsForTemplateB` → `jobs/weeklyDigestJob.ts` +
//     testes.
//   - `buildAssuntoTemplateB` → `renderTemplateB` + testes.
//   - `renderTemplateB` → `jobs/weeklyDigestJob.ts` + testes.

import { renderTemplate } from '../handlebarsCompiler';
import type { AlertEmailContext, RenderedEmail, TemplateBPayload } from '../types';

/** Chave canonica de cache Handlebars. */
export const TEMPLATE_B_ID = 'roip.template.B.weeklyDigest' as const;

/** URL canonica do historico completo (§12.7 linha 1448). */
export const TEMPLATE_B_URL_NOTIFICACOES = 'https://app.roip.com.br/notificacoes' as const;

/**
 * Filtra e ordena alertas canonicamente para o template B (§12.7):
 * - Remove `critico` (foi imediato) e `info` (nao vai para e-mail).
 * - Mantem `atencao` e `observacao`.
 * - Ordena: primeiro `atencao`, depois `observacao`.
 * - Dentro de cada severidade, preserva ordem de entrada.
 */
export function filterAndSortAlertsForTemplateB(
  alerts: readonly AlertEmailContext[],
): readonly AlertEmailContext[] {
  const atencoes = alerts.filter((a) => a.severidade === 'atencao');
  const observacoes = alerts.filter((a) => a.severidade === 'observacao');
  return [...atencoes, ...observacoes];
}

/** Constroi assunto canonico (§12.7). */
export function buildAssuntoTemplateB(
  nomeEmpresa: string,
  weekStartFull: string,
  weekEndFull: string,
): string {
  return `[ROIP APP] ${nomeEmpresa} — Resumo semanal de alertas (${weekStartFull} a ${weekEndFull})`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function renderListaTexto(alerts: readonly AlertEmailContext[]): string {
  if (alerts.length === 0) return '(nenhum)';
  return alerts
    .map((a) => {
      const badge = `${a.emojiSeveridade} ${a.rotuloLegivel}`;
      const linhas: string[] = [badge];
      if (a.contextoCurto !== '') linhas.push(a.contextoCurto);
      linhas.push(`[Ver detalhes →] ${a.linkDestino}`);
      return linhas.join('\n');
    })
    .join('\n\n');
}

function renderListaHtml(alerts: readonly AlertEmailContext[]): string {
  if (alerts.length === 0) {
    return `<p style="color: #888; margin: 8px 0 0 0;">(nenhum)</p>`;
  }
  return alerts
    .map((a) => {
      const contextoHtml =
        a.contextoCurto !== ''
          ? `<p style="margin: 4px 0 0 24px; color: #555;">${escapeHtml(a.contextoCurto)}</p>`
          : '';
      return (
        `<div style="margin: 12px 0; padding: 10px; border-left: 4px solid #f59e0b; background: #f9fafb;">` +
        `<p style="margin: 0; font-weight: bold;">${escapeHtml(a.emojiSeveridade)} ${escapeHtml(a.rotuloLegivel)}</p>` +
        contextoHtml +
        `<p style="margin: 8px 0 0 24px;"><a href="${escapeHtml(a.linkDestino)}" style="color: #1a56db; text-decoration: none;">[Ver detalhes →]</a></p>` +
        `</div>`
      );
    })
    .join('\n');
}

function renderCorpoTexto(
  payload: TemplateBPayload,
  atencoes: readonly AlertEmailContext[],
  observacoes: readonly AlertEmailContext[],
  weekStartShort: string,
  weekEndShort: string,
): string {
  const listaAtencao = renderListaTexto(atencoes);
  const listaObservacao = renderListaTexto(observacoes);

  const corpo = `Ola, {{primeiroNome}},

Este e o resumo dos alertas acumulados na semana de {{weekStartShort}} a {{weekEndShort}} para {{nomeEmpresa}}.

{{N}} atencao · {{M}} observacao

Atencao
${listaAtencao}

Observacao
${listaObservacao}

Acesse o historico completo em ${TEMPLATE_B_URL_NOTIFICACOES}. Este e-mail foi enviado automaticamente. Nao responda.`;

  return renderTemplate(`${TEMPLATE_B_ID}.texto`, corpo, {
    primeiroNome: payload.primeiroNome,
    nomeEmpresa: payload.nomeEmpresa,
    weekStartShort,
    weekEndShort,
    N: atencoes.length,
    M: observacoes.length,
  });
}

function renderCorpoHtml(
  payload: TemplateBPayload,
  atencoes: readonly AlertEmailContext[],
  observacoes: readonly AlertEmailContext[],
  weekStartShort: string,
  weekEndShort: string,
): string {
  const listaAtencaoHtml = renderListaHtml(atencoes);
  const listaObservacaoHtml = renderListaHtml(observacoes);

  const corpo = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Resumo semanal de alertas</title>
</head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5; margin: 0; padding: 20px;">
<p>Ola, {{primeiroNome}},</p>
<p>Este e o resumo dos alertas acumulados na semana de {{weekStartShort}} a {{weekEndShort}} para {{nomeEmpresa}}.</p>
<p style="font-weight: bold;">{{N}} atencao · {{M}} observacao</p>
<h3 style="margin-top: 24px; color: #92400e;">Atencao</h3>
${listaAtencaoHtml}
<h3 style="margin-top: 24px; color: #4b5563;">Observacao</h3>
${listaObservacaoHtml}
<p style="margin-top: 24px;">Acesse o historico completo em <a href="${TEMPLATE_B_URL_NOTIFICACOES}" style="color: #1a56db;">${TEMPLATE_B_URL_NOTIFICACOES}</a>.</p>
<p style="color: #888; font-size: 12px;">Este e-mail foi enviado automaticamente. Nao responda.</p>
</body>
</html>`;

  return renderTemplate(`${TEMPLATE_B_ID}.html`, corpo, {
    primeiroNome: payload.primeiroNome,
    nomeEmpresa: payload.nomeEmpresa,
    weekStartShort,
    weekEndShort,
    N: atencoes.length,
    M: observacoes.length,
  });
}

/**
 * Renderiza o Template B canonico. `payload.alerts` deve vir ja filtrado
 * por `filterAndSortAlertsForTemplateB` (o worker garante).
 * `weekStartFormatted`/`weekEndFormatted` vem no formato canonico
 * `DD/MM/YYYY` (do `weeklyDigestDate.formatWeekRangeDDMMYYYY`).
 * `weekStartShort`/`weekEndShort` (formato `DD/MM`) sao derivados dos
 * mesmos parametros — nao aceitamos como parametro extra para preservar
 * um unico ponto de conversao canonica.
 */
export function renderTemplateB(payload: TemplateBPayload): RenderedEmail {
  const atencoes = payload.alerts.filter((a) => a.severidade === 'atencao');
  const observacoes = payload.alerts.filter((a) => a.severidade === 'observacao');

  // Deriva formato curto DD/MM a partir do formato canonico DD/MM/YYYY.
  const weekStartShort = payload.weekStartFormatted.slice(0, 5);
  const weekEndShort = payload.weekEndFormatted.slice(0, 5);

  return {
    assunto: buildAssuntoTemplateB(
      payload.nomeEmpresa,
      payload.weekStartFormatted,
      payload.weekEndFormatted,
    ),
    corpoTexto: renderCorpoTexto(payload, atencoes, observacoes, weekStartShort, weekEndShort),
    corpoHtml: renderCorpoHtml(payload, atencoes, observacoes, weekStartShort, weekEndShort),
  };
}
