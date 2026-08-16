// ROIP APP 9BOX — teste de integração ME-080d Onda 2.
//
// Cobre bit-exact D5=A — bug do "Relatório executivo trimestral" que
// prometia notificação no sino e nunca acontecia.
//
// Descoberta canonica (S502 desta ME):
// - Motor `generateExecutiveReport` e SINCRONO. Quando retorna
//   `{ kind: 'ok' }`, PDF ja esta em disco + cache DB. Nao ha job
//   assincrono nem worker.
// - Faltavam duas pecas: (a) proc/action que assine
//   `pdfEphemeralToken` com scope=`executive_report`,
//   (b) client que dispare download imediato apos sucesso.
//
// Fix canonico desta Onda 2:
// - Nova action `startExecutiveReportDownloadTokenAction` em `actions.ts`.
// - Tipo de retorno de `generateRelatorioExecutivoAction` ampliado
//   para propagar `cacheId` + `filename` + `message` (era `{ status: string }`).
// - Client trocou toast falso "notificaremos no sino" por download
//   imediato via `window.open(downloadUrl, '_blank')`.
//
// Estrategia canonica: assercao sobre exports das actions (funcao pura)
// + leitura do source-code do Client (grep-style).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as actions from '../../src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/actions';

const CLIENT_PATH = join(
  process.cwd(),
  'src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/RelatoriosClient.tsx',
);

describe('ME-080d Onda 2 — actions.ts (D5=A backend)', () => {
  it('exporta startExecutiveReportDownloadTokenAction', () => {
    expect(typeof actions.startExecutiveReportDownloadTokenAction).toBe('function');
  });

  it('exporta generateRelatorioExecutivoAction (preservado)', () => {
    expect(typeof actions.generateRelatorioExecutivoAction).toBe('function');
  });

  it('exporta startReportDownloadTokenAction (snapshot/board preservado)', () => {
    expect(typeof actions.startReportDownloadTokenAction).toBe('function');
  });
});

describe('ME-080d Onda 2 — RelatoriosClient.tsx (D5=A client fix)', () => {
  const source = readFileSync(CLIENT_PATH, 'utf8');

  it('importa startExecutiveReportDownloadTokenAction', () => {
    expect(source).toContain('startExecutiveReportDownloadTokenAction');
  });

  it('toast falso "notificado no sino" removido do JSX', () => {
    // Toast original: setToast('...notificado no sino quando estiver pronto.')
    // Detectamos string literal dentro de setToast(...), ignorando comentario.
    expect(source).not.toMatch(/setToast\(['"][^'"]*notificado no[^'"]*['"]/);
    expect(source).not.toMatch(/setToast\([^)]*quando estiver pronto/);
  });

  it('toast novo "Download iniciado em nova aba" presente', () => {
    expect(source).toContain('Download iniciado em nova aba');
  });

  it('window.open(downloadUrl) presente para disparar download', () => {
    expect(source).toMatch(/window\.open\(tokenResult\.data\.downloadUrl/);
  });

  it('guarda para status != ok / cacheId ausente presente', () => {
    expect(source).toMatch(/result\.data\.status\s*!==\s*['"]ok['"]/);
    expect(source).toMatch(/result\.data\.cacheId\s*===\s*undefined/);
  });
});
