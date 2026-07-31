// ROIP APP 9BOX — compilador canonico de templates Handlebars (ME-060).
//
// Origem canonica:
// - DOC 06 §11.1 (Handlebars T5 canonizada; templates compilados no boot
//   da aplicacao — sem compilacao a cada envio).
// - DOC 06 §12.1 canonica T5.
//
// Contrato canonico:
// - Cache global de templates compilados por chave canonica (`templateId`).
// - `compileTemplateOnce(templateId, source)` retorna sempre a mesma
//   funcao compilada por `templateId`; o `source` e ignorado apos a
//   primeira invocacao (semantica de "compilar uma unica vez").
// - `renderTemplate(templateId, source, data)` chama
//   `compileTemplateOnce` e aplica os dados.
// - `_resetHandlebarsCache` para uso exclusivo em testes.
// - Zero I/O — nao le arquivos do disco. Os templates canonicos vivem
//   como strings inline nos proprios arquivos `templates/*.ts`, o que
//   preserva RV-14 (auditoria linha a linha) e RV-11 (produto contra
//   canonico bit-exact).
// - Sem partials ou helpers customizados nesta ME. Se precisos em MEs
//   futuras, adicionar helpers via `registerHelperOnce` (nao exposto
//   ate haver caller).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `compileTemplateOnce` → `renderTemplate` + testes.
//   - `renderTemplate` → `templates/*.ts` + testes.
//   - `_resetHandlebarsCache` → testes.

import Handlebars from 'handlebars';

type CompiledTemplate = HandlebarsTemplateDelegate<Record<string, unknown>>;

const templateCache = new Map<string, CompiledTemplate>();

/**
 * Compila `source` como template Handlebars sob a chave `templateId` e
 * cacheia. Chamadas subsequentes com o mesmo `templateId` reutilizam a
 * versao compilada — o `source` novo e ignorado silenciosamente (padrao
 * canonico "compilar uma unica vez no boot").
 */
export function compileTemplateOnce(templateId: string, source: string): CompiledTemplate {
  const cached = templateCache.get(templateId);
  if (cached !== undefined) return cached;
  // `noEscape: false` (default) mantem escape HTML canonico das variaveis
  // — protege contra injecao acidental (mesmo em pt-BR curto).
  const compiled = Handlebars.compile<Record<string, unknown>>(source, { noEscape: false });
  templateCache.set(templateId, compiled);
  return compiled;
}

/**
 * Renderiza `data` aplicado ao template `source` cacheado sob
 * `templateId`. Retorno canonico: string exata do template preenchido.
 */
export function renderTemplate(
  templateId: string,
  source: string,
  data: Record<string, unknown>,
): string {
  const compiled = compileTemplateOnce(templateId, source);
  return compiled(data);
}

/**
 * Reset canonico do cache. Uso exclusivo em testes — em producao o cache
 * fica vivo durante todo o processo.
 */
export function _resetHandlebarsCache(): void {
  templateCache.clear();
}
