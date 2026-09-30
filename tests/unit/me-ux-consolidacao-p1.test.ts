// ROIP APP 9BOX — teste unitario ME-UX-CONSOLIDACAO-P1 (D1 chips +
// D2 rotulo/tooltip canonicos do Assistente de lideranca).
//
// Cobre bit-a-bit:
//   - D1: exportacao canonica `AI_CHAT_CHIPS_INDIVIDUAL` com 3 perguntas
//     canonicas literais, na ordem canonica.
//   - D2: exportacao canonica `AI_CHAT_ROTULO_CANONICO` com valor
//     'Assistente de lideranca'.
//   - Botao flutuante do `DashboardIndividualClient.tsx` usa o rotulo
//     canonico em `aria-label`, `title` e no texto visivel abaixo do
//     icone (assercao textual sobre o source no padrao dos demais
//     testes estruturais do repo).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AI_CHAT_CHIPS_INDIVIDUAL,
  AI_CHAT_ROTULO_CANONICO,
} from '../../src/app/dashboard-individual/[id]/AiChatDrawer';

const ROOT = resolve(__dirname, '..', '..');

function readSrc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

describe('ME-UX-CONSOLIDACAO-P1 — D1 chips canonicos individual', () => {
  it('exporta 3 chips canonicos', () => {
    expect(AI_CHAT_CHIPS_INDIVIDUAL).toHaveLength(3);
  });

  it('chip 1 canonico: roteiro para proxima conversa de feedback', () => {
    expect(AI_CHAT_CHIPS_INDIVIDUAL[0]).toBe(
      'Monte um roteiro para minha próxima conversa de feedback com esse colaborador.',
    );
  });

  it('chip 2 canonico: 15 minutos com este colaborador', () => {
    expect(AI_CHAT_CHIPS_INDIVIDUAL[1]).toBe(
      'Se eu tivesse 15 minutos com este colaborador sobre o que deveria falar?',
    );
  });

  it('chip 3 canonico: perfil individual e desempenho no trimestre', () => {
    expect(AI_CHAT_CHIPS_INDIVIDUAL[2]).toBe(
      'Qual a relação entre o perfil individual e o desempenho desse colaborador nesse trimestre?',
    );
  });
});

describe('ME-UX-CONSOLIDACAO-P1 — D2 rotulo canonico Assistente de liderança', () => {
  it('exporta rotulo canonico bit-exact', () => {
    expect(AI_CHAT_ROTULO_CANONICO).toBe('Assistente de liderança');
  });

  it('DashboardIndividualClient usa o rotulo em aria-label', () => {
    const src = readSrc('src/app/dashboard-individual/[id]/DashboardIndividualClient.tsx');
    expect(src).toContain('aria-label="Assistente de liderança"');
  });

  it('DashboardIndividualClient usa o rotulo em title (tooltip)', () => {
    const src = readSrc('src/app/dashboard-individual/[id]/DashboardIndividualClient.tsx');
    expect(src).toContain('title="Assistente de liderança"');
  });

  it('DashboardIndividualClient exibe o texto "Assistente" visivel', () => {
    const src = readSrc('src/app/dashboard-individual/[id]/DashboardIndividualClient.tsx');
    expect(src).toContain('<span>Assistente</span>');
  });

  it('AiChatDrawer usa AI_CHAT_ROTULO_CANONICO no header (nao mais "Chat IA" literal)', () => {
    const src = readSrc('src/app/dashboard-individual/[id]/AiChatDrawer.tsx');
    expect(src).toContain('{AI_CHAT_ROTULO_CANONICO}');
    expect(src).not.toContain('<div style={HEADER_TITLE}>Chat IA</div>');
  });
});
