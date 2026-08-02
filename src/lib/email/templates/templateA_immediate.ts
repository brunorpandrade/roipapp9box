/* eslint-disable @stylistic/max-len -- templates HTML canonicos com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — Template A canonico (Alerta imediato consolidado)
// — ME-060.
//
// Origem canonica:
// - DOC 06 §12.6 (Template A — Alerta imediato consolidado).
// - DOC 06 §11.1 (Handlebars T5 canonizada; HTML inline).
// - DOC 06 §6.5 (regra de severidade + canal — filtragem canonica).
//
// Reproducoes bit-exact obrigatorias:
// - Assunto (1 alerta):   "[ROIP APP] {nome_empresa} — {tipo_legivel}"
// - Assunto (N alertas):  "[ROIP APP] {nome_empresa} — {N} novos alertas"
// - Corpo canonico literal (estrutura fixa):
//     Olá, {primeiroNome},
//
//     Você tem {N} novo(s) alerta(s) da plataforma ROIP APP.
//
//     {lista_segmentada_por_severidade}
//
//     Acesse seu painel de controle em https://app.roip.com.br/painel-{perfil}.
//     Este e-mail foi enviado automaticamente. Não responda.
//
// Regras canonicas de segmentacao (§12.6):
// - Ordem: primeiro `critico`, depois `atencao`.
// - `observacao` NAO aparece em template A (apenas digest).
// - `info` NAO aparece em nenhum template (apenas sino).
// - Para cada alerta:
//     - Badge canonica: emoji + rotulo legivel.
//     - Contexto curto (`contextoCurto` resolvido por
//       `contextResolvers.ts`).
//     - Link `[Ver detalhes →]` para `linkDestino`. Sem `target="_blank"`
//       (B3).
//
// Regra canonica de perfil no rodape (§12.6 linha 1411):
// - `perfil='rh'` → https://app.roip.com.br/painel-rh
// - `perfil='clevel'` → https://app.roip.com.br/painel-clevel
// - `perfil='financeiro'` → https://app.roip.com.br/painel-financeiro
// - `perfil='super_admin'` → https://app.roip.com.br/super-admin
//
// Contrato canonico:
// - `filterAndSortAlertsForTemplateA` aplica as regras canonicas de
//   segmentacao ANTES do caller invocar `renderTemplateA`. E o worker
//   `runEmailQueueJob` que orquestra o filtro + render.
// - `renderTemplateA` assume que a lista ja veio filtrada e ordenada
//   canonicamente pelo caller — nao re-aplica filtro (economia de
//   invariantes duplicados).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `TEMPLATE_A_ID` → `renderTemplateA` + testes.
//   - `TEMPLATE_A_URL_BASE_PAINEL` → `resolvePainelUrl` + testes.
//   - `resolvePainelUrl` → `renderTemplateA` + testes.
//   - `buildAssuntoTemplateA` → `renderTemplateA` + testes.
//   - `filterAndSortAlertsForTemplateA` → `jobs/emailQueueJob.ts` +
//     testes.
//   - `renderTemplateA` → `jobs/emailQueueJob.ts` + testes.

import { renderTemplate } from '../handlebarsCompiler';
import type { AlertEmailContext, PerfilPainel, RenderedEmail, TemplateAPayload } from '../types';

/** Chave canonica de cache Handlebars. */
export const TEMPLATE_A_ID = 'roip.template.A.immediate' as const;

/** URL base canonica do painel (§12.6 linha 1399). */
export const TEMPLATE_A_URL_BASE_PAINEL = 'https://app.roip.com.br' as const;

/**
 * Resolve URL canonica do painel por perfil (§12.6 linha 1411).
 * `super_admin` aponta para `/super-admin` — todos os outros para
 * `/painel-{perfil}`.
 */
export function resolvePainelUrl(perfil: PerfilPainel): string {
  if (perfil === 'super_admin') {
    return `${TEMPLATE_A_URL_BASE_PAINEL}/super-admin`;
  }
  return `${TEMPLATE_A_URL_BASE_PAINEL}/painel-${perfil}`;
}

/**
 * Constroi assunto canonico. Distingue 1 alerta (uso literal do rotulo do
 * tipo) vs N > 1 alertas (contagem numerica).
 */
export function buildAssuntoTemplateA(
  nomeEmpresa: string,
  alerts: readonly AlertEmailContext[],
): string {
  if (alerts.length === 1) {
    const first = alerts[0];
    if (first === undefined) {
      // Nunca ocorre canonicamente (length === 1 garante o indice), mas
      // TS narrowing exige a checagem — retorno neutro preserva safety.
      return `[ROIP APP] ${nomeEmpresa} — sem alertas`;
    }
    return `[ROIP APP] ${nomeEmpresa} — ${first.rotuloLegivel}`;
  }
  return `[ROIP APP] ${nomeEmpresa} — ${alerts.length} novos alertas`;
}

/**
 * Filtra e ordena alertas canonicamente para o template A (§12.6):
 * - Remove `observacao` e `info`.
 * - Ordena: primeiro `critico`, depois `atencao`.
 * - Dentro de cada severidade, preserva a ordem de entrada.
 */
export function filterAndSortAlertsForTemplateA(
  alerts: readonly AlertEmailContext[],
): readonly AlertEmailContext[] {
  const filtered = alerts.filter((a) => a.severidade === 'critico' || a.severidade === 'atencao');
  // Ordena estavel: critico antes de atencao. `sort` em muitos engines V8
  // e estavel (Node 12+); usamos `sort` direto e confiamos na semantica
  // canonica.
  const criticos = filtered.filter((a) => a.severidade === 'critico');
  const atencoes = filtered.filter((a) => a.severidade === 'atencao');
  return [...criticos, ...atencoes];
}

/** Assunto e corpo canonicos passam pelo Handlebars via wrapper. */
function renderCorpoTexto(payload: TemplateAPayload, painelUrl: string): string {
  const lista = payload.alerts
    .map((a) => {
      const badge = `${a.emojiSeveridade} ${a.rotuloLegivel}`;
      const linhas: string[] = [badge];
      if (a.contextoCurto !== '') linhas.push(a.contextoCurto);
      linhas.push(`[Ver detalhes →] ${a.linkDestino}`);
      return linhas.join('\n');
    })
    .join('\n\n');

  const corpo = `Olá, {{primeiroNome}},

Você tem {{N}} novo(s) alerta(s) da plataforma ROIP APP.

${lista}

Acesse seu painel de controle em {{painelUrl}}. Este e-mail foi enviado automaticamente. Não responda.`;

  return renderTemplate(`${TEMPLATE_A_ID}.texto`, corpo, {
    primeiroNome: payload.primeiroNome,
    N: payload.alerts.length,
    painelUrl,
  });
}

function renderCorpoHtml(payload: TemplateAPayload, painelUrl: string): string {
  const listaHtml = payload.alerts
    .map((a) => {
      const contextoHtml =
        a.contextoCurto !== ''
          ? `<p style="margin: 4px 0 0 24px; color: #555;">${escapeHtml(a.contextoCurto)}</p>`
          : '';
      return (
        `<div style="margin: 16px 0; padding: 12px; border-left: 4px solid #1a56db; background: #f9fafb;">` +
        `<p style="margin: 0; font-weight: bold;">${escapeHtml(a.emojiSeveridade)} ${escapeHtml(a.rotuloLegivel)}</p>` +
        contextoHtml +
        `<p style="margin: 8px 0 0 24px;"><a href="${escapeHtml(a.linkDestino)}" style="color: #1a56db; text-decoration: none;">[Ver detalhes →]</a></p>` +
        `</div>`
      );
    })
    .join('\n');

  const corpo = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Novos alertas ROIP APP</title>
</head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5; margin: 0; padding: 20px;">
<p>Olá, {{primeiroNome}},</p>
<p>Você tem {{N}} novo(s) alerta(s) da plataforma ROIP APP.</p>
${listaHtml}
<p>Acesse seu painel de controle em <a href="{{painelUrl}}" style="color: #1a56db;">{{painelUrl}}</a>.</p>
<p style="color: #888; font-size: 12px;">Este e-mail foi enviado automaticamente. Não responda.</p>
</body>
</html>`;

  return renderTemplate(`${TEMPLATE_A_ID}.html`, corpo, {
    primeiroNome: payload.primeiroNome,
    N: payload.alerts.length,
    painelUrl,
  });
}

/**
 * Escape HTML canonico (letras basicas). Reproducao de `Handlebars.Utils.escapeExpression`
 * mas aplicado ao lado do dado *antes* do template — necessario porque
 * as strings inline no HTML (contextoCurto, badges) entram direto no
 * texto do template compilado, nao como variavel Handlebars.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Renderiza o Template A canonico. Assume que `payload.alerts` ja veio
 * filtrado e ordenado por `filterAndSortAlertsForTemplateA` no worker.
 * Zero alertas nao e caso canonico — o worker canonicamente nao invoca
 * `renderTemplateA` para lista vazia (verificacao previa canonica).
 */
export function renderTemplateA(payload: TemplateAPayload): RenderedEmail {
  const painelUrl = resolvePainelUrl(payload.perfil);
  return {
    assunto: buildAssuntoTemplateA(payload.nomeEmpresa, payload.alerts),
    corpoTexto: renderCorpoTexto(payload, painelUrl),
    corpoHtml: renderCorpoHtml(payload, painelUrl),
  };
}
