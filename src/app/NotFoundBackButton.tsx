// ROIP APP 9BOX — NotFoundBackButton (ME-080d Onda 1b).
//
// Origem canonica: DOC 05 §16.2 (Pagina nao encontrada) + DOC 02 §13.9
// (Contexto do 404 e resolucao do CTA primario).
//
// Correcao mecanica canonica desta ME:
// -------------------------------------
// O botao [Voltar] (CTA outline canonico do 404 §16.2) originalmente
// renderizava como `<a href="javascript:history.back()">`. Esse padrao
// e bloqueado pelo Content Security Policy (CSP) padrao do Next 15 em
// producao — schemes `javascript:` sao classificados como inline scripts
// e violam a diretiva `script-src` sem `'unsafe-inline'`. Consequencia
// observada em producao Railway (ME-080d validacao e2e por Bruno):
// cursor mudava sobre o botao mas o clique nao disparava nenhuma acao.
//
// Fix canonico: extrair o botao em client component e invocar
// `window.history.back()` via `onClick`. Preserva a semantica canonica
// do CTA (voltar a rota anterior no historico do browser) sem violar
// CSP. O texto e o estilo permanecem bit-exact ao original.
//
// Chamador exclusivo: `src/app/not-found.tsx` (server component pai que
// resolve o CTA primario via cookie de sessao).

'use client';

import type { JSX } from 'react';

import { COLORS } from '../lib/design-tokens/colors';

/**
 * Label canonico do CTA outline §16.2 exportado para consumo em testes
 * bit-exact. Espelha o valor original de `NOT_FOUND_CTA_BACK_LABEL` de
 * `not-found.tsx`.
 */
export const NOT_FOUND_BACK_LABEL = 'Voltar';

/**
 * Botao [Voltar] client-side do 404 canonico §16.2.
 *
 * Semantica canonica bit-exact ao original: chama `window.history.back()`
 * ao clicar. Guarda contra ambientes sem `window.history` (SSR / pre-render)
 * — em teoria nao alcancavel apos hidratacao, mas guarda defensiva
 * preserva integridade.
 *
 * Estilo bit-exact ao original: outline navy 12px 24px, radius 6, fonte
 * 15px 600. Sem hover explicito (padrao inline styles como todo o
 * restante do 404).
 */
export function NotFoundBackButton(): JSX.Element {
  return (
    <button
      type="button"
      data-testid="not-found-cta-back"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back();
        }
      }}
      style={{
        display: 'inline-block',
        padding: '12px 24px',
        background: 'transparent',
        color: COLORS.primary.navy,
        borderRadius: 6,
        border: `1px solid ${COLORS.primary.navy}`,
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {NOT_FOUND_BACK_LABEL}
    </button>
  );
}
