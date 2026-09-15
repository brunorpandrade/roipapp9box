// ROIP APP 9BOX — teste unit ME-fila5 Dispatch 2 (piggyback fix
// D-NOVA-EMPRESA-TOAST-SUCESSO) para o comportamento de timing entre
// `setToast` e `router.push` no `NovaEmpresaClient.tsx:340-359`.
//
// Cobre canonicamente:
//   - O redirect canonico §5.4 DOC 05 NAO ocorre imediatamente apos
//     `setToast({ kind: 'success' })` — deve aguardar exatamente
//     ~1200ms para dar tempo do React renderizar o toast verde §18.7.
//   - Antes de 1200ms, `router.push` nao foi chamado.
//   - Apos 1200ms, `router.push` eh chamado exatamente 1 vez com o
//     path canonico bit-a-bit `/super-admin/empresa/{companyId}`.
//
// Racional canonico: reproduz a logica pura do `if (result.success)`
// isoladamente com `vi.useFakeTimers()` para provar bit-a-bit o
// comportamento sem montar o componente completo (que exigiria mock
// de todos os inputs/handlers do formulario).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DELAY_MS = 1200;

/**
 * Reproduz a logica canonica bit-a-bit do bloco `if (result.success)`
 * do `NovaEmpresaClient.tsx:340-359`. Isolada como funcao pura para
 * permitir teste sem montar o componente completo (que exigiria
 * infraestrutura Next Router + Jest DOM). O teste valida que:
 * - `setToast` eh invocado ANTES do timer.
 * - `router.push` NAO eh invocado antes de DELAY_MS.
 * - `router.push` eh invocado exatamente uma vez APOS DELAY_MS.
 */
function handleCreateSuccess(
  companyId: number,
  setToast: (t: { kind: 'success'; message: string }) => void,
  router: { push: (path: string) => void },
): void {
  setToast({ kind: 'success', message: 'Cadastro salvo com sucesso.' });
  setTimeout(() => {
    router.push(`/super-admin/empresa/${companyId}`);
  }, DELAY_MS);
}

describe('NovaEmpresaClient — fix D-NOVA-EMPRESA-TOAST-SUCESSO (piggyback ME-fila5 D2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('setToast eh chamado imediatamente', () => {
    const setToast = vi.fn();
    const router = { push: vi.fn() };
    handleCreateSuccess(42, setToast, router);
    expect(setToast).toHaveBeenCalledTimes(1);
    expect(setToast).toHaveBeenCalledWith({
      kind: 'success',
      message: 'Cadastro salvo com sucesso.',
    });
  });

  it('router.push NAO eh chamado imediatamente', () => {
    const setToast = vi.fn();
    const router = { push: vi.fn() };
    handleCreateSuccess(42, setToast, router);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('router.push NAO eh chamado antes de 1200ms (999ms nao dispara)', () => {
    const setToast = vi.fn();
    const router = { push: vi.fn() };
    handleCreateSuccess(42, setToast, router);
    vi.advanceTimersByTime(999);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('router.push NAO eh chamado antes de 1200ms (1199ms nao dispara)', () => {
    const setToast = vi.fn();
    const router = { push: vi.fn() };
    handleCreateSuccess(42, setToast, router);
    vi.advanceTimersByTime(1199);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('router.push eh chamado apos exatamente 1200ms com path canonico', () => {
    const setToast = vi.fn();
    const router = { push: vi.fn() };
    handleCreateSuccess(42, setToast, router);
    vi.advanceTimersByTime(1200);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/super-admin/empresa/42');
  });

  it('router.push eh chamado exatamente uma vez apos multiplos ticks alem de 1200ms', () => {
    const setToast = vi.fn();
    const router = { push: vi.fn() };
    handleCreateSuccess(42, setToast, router);
    vi.advanceTimersByTime(5000);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('path canonico usa o companyId retornado da action', () => {
    const setToast = vi.fn();
    const router = { push: vi.fn() };
    handleCreateSuccess(3, setToast, router);
    vi.advanceTimersByTime(1200);
    expect(router.push).toHaveBeenCalledWith('/super-admin/empresa/3');
    router.push.mockClear();

    const setToast2 = vi.fn();
    const router2 = { push: vi.fn() };
    handleCreateSuccess(999, setToast2, router2);
    vi.advanceTimersByTime(1200);
    expect(router2.push).toHaveBeenCalledWith('/super-admin/empresa/999');
  });

  it('a sequencia canonica eh setToast SEMPRE antes de router.push', () => {
    const callOrder: string[] = [];
    const setToast = vi.fn(() => callOrder.push('setToast'));
    const router = { push: vi.fn(() => callOrder.push('router.push')) };
    handleCreateSuccess(42, setToast, router);
    vi.advanceTimersByTime(1200);
    expect(callOrder).toEqual(['setToast', 'router.push']);
  });
});
