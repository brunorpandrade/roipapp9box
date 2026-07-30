// ROIP APP 9BOX — teste unitario `MODAL_VARIANT_SPECS` (ME-055c).
//
// Prova RV-03 dirigida (M2/S201) — alvo canonico: constante
// `MODAL_VARIANT_SPECS` de `src/components/ui/Modal.tsx`. Toda a
// especificacao canonica das 5 variantes do Modal §2.9 e cruzada
// bit-exact contra os valores canonicos DOC 05 §2.9.
//
// A prova RV-03 dirigida esta demonstrada assim:
// - Caso bom (arquivo canonico gerado): RC=0, todos os asserts passam.
// - Caso ruim (defeito estruturalmente irrecuperavel): alterar
//   `confirmation.width` de 420 para qualquer outro valor reprova o
//   assert dedicado + o `MODAL_VARIANT_SPECS_COUNT_KEYS` assert (se
//   a chave for renomeada) e o teste de estrutura completa. Escolha do
//   defeito canonico da RV-03 desta ME: `confirmation.width = 999` (nao
//   sofre coincidencia aritmetica — 999 nao aparece em nenhum valor
//   canonico §2.9).
//
// Cobertura canonica bit-exact:
// - 5 variantes canonicas exatas (Opcao A aprovada em N7/S226).
// - Comportamento canonico de fechamento (canCloseOnEsc,
//   canCloseOnOverlay) — chave da variante `blocking` §2.9.
// - Dimensoes canonicas (largura 420 confirmation, min/max popup80).
// - z-index e overlay canonicos §2.9 por variante.

import { describe, expect, it } from 'vitest';

import { MODAL_VARIANT_SPECS } from '../../src/components/ui/Modal';

describe('MODAL_VARIANT_SPECS — RV-03 dirigida bit-exact §2.9 (ME-055c)', () => {
  it('exporta exatamente 5 variantes canonicas (Opção A)', () => {
    const keys = Object.keys(MODAL_VARIANT_SPECS).sort();
    expect(keys).toHaveLength(5);
    expect(keys).toStrictEqual([
      'blocking',
      'centered',
      'confirmation',
      'fullscreenMobile',
      'popup80',
    ]);
  });

  it('nao inclui variante "aviso" (correcao canonica vs comando de abertura)', () => {
    expect(Object.keys(MODAL_VARIANT_SPECS)).not.toContain('aviso');
  });

  it('centered §2.9 bit-exact: radius 12, overlay rgba(0,0,0,0.5), z 100', () => {
    expect(MODAL_VARIANT_SPECS.centered).toStrictEqual({
      width: 'auto',
      height: 'auto',
      radius: 12,
      overlay: 'rgba(0,0,0,0.5)',
      zIndex: 100,
      canCloseOnEsc: true,
      canCloseOnOverlay: true,
    });
  });

  it('confirmation §2.9 bit-exact: largura 420, ESC/overlay fecham', () => {
    expect(MODAL_VARIANT_SPECS.confirmation).toStrictEqual({
      width: 420,
      height: 'auto',
      radius: 12,
      overlay: 'rgba(0,0,0,0.5)',
      zIndex: 100,
      canCloseOnEsc: true,
      canCloseOnOverlay: true,
    });
  });

  it('blocking §2.9 bit-exact: ESC e overlay NAO fecham (modal obrigatorio)', () => {
    expect(MODAL_VARIANT_SPECS.blocking.canCloseOnEsc).toBe(false);
    expect(MODAL_VARIANT_SPECS.blocking.canCloseOnOverlay).toBe(false);
    expect(MODAL_VARIANT_SPECS.blocking.overlay).toBe('rgba(0,0,0,0.6)');
    expect(MODAL_VARIANT_SPECS.blocking.zIndex).toBe(150);
  });

  it('popup80 §2.9 bit-exact: 80vw/80vh clamp 900x640 a 1080x800, r14, overlay .55', () => {
    expect(MODAL_VARIANT_SPECS.popup80).toStrictEqual({
      width: 'auto',
      height: 'auto',
      minWidth: 900,
      minHeight: 640,
      maxWidth: 1080,
      maxHeight: 800,
      radius: 14,
      overlay: 'rgba(0,0,0,0.55)',
      zIndex: 200,
      canCloseOnEsc: true,
      canCloseOnOverlay: true,
    });
  });

  it('fullscreenMobile §19 bit-exact: comportamento base como centered', () => {
    expect(MODAL_VARIANT_SPECS.fullscreenMobile).toStrictEqual({
      width: 'auto',
      height: 'auto',
      radius: 12,
      overlay: 'rgba(0,0,0,0.5)',
      zIndex: 100,
      canCloseOnEsc: true,
      canCloseOnOverlay: true,
    });
  });

  it('z-index §2.9 hierarquia: centered 100 < blocking 150 < popup80 200', () => {
    expect(MODAL_VARIANT_SPECS.centered.zIndex).toBeLessThan(MODAL_VARIANT_SPECS.blocking.zIndex);
    expect(MODAL_VARIANT_SPECS.blocking.zIndex).toBeLessThan(MODAL_VARIANT_SPECS.popup80.zIndex);
  });
});
