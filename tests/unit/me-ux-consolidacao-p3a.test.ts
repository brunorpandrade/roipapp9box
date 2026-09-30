// ROIP APP 9BOX — teste unitario ME-UX-CONSOLIDACAO-P3a (D3 chat IA
// no dashboard-recorte/equipe).
//
// Cobre:
//   - Chips canonicos da equipe (3 perguntas literais na ordem canonica).
//   - `AI_CHAT_CHIPS_INDIVIDUAL` continua exportado de AiChatDrawer via
//     re-export do modulo canonico (compat com teste P1).
//   - `AI_CHAT_CHIPS_INDIVIDUAL` e `AI_CHAT_CHIPS_EQUIPE` sao acessados
//     canonicamente de `src/lib/chat-ia/chatIaChips.ts`.
//   - `AiChatDrawerEquipe` importa chips canonicos + actions da equipe.
//   - `AiChatLauncherEquipe` renderiza o rotulo canonico "Assistente
//     de lideranca" no `aria-label` + `title` + texto visivel.
//   - `dashboard-recorte/[tipo]/[alvo]/page.tsx` (nativo + super-admin)
//     renderiza o launcher quando `alvo.tipo === 'equipe'` e
//     `alvo.leader.tipo === 'employee'`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AI_CHAT_CHIPS_EQUIPE, AI_CHAT_CHIPS_INDIVIDUAL } from '../../src/lib/chat-ia/chatIaChips';

const ROOT = resolve(__dirname, '..', '..');

function readSrc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

describe('ME-UX-CONSOLIDACAO-P3a — chips canonicos consolidados', () => {
  it('AI_CHAT_CHIPS_INDIVIDUAL preservado bit-a-bit (compat P1)', () => {
    expect(AI_CHAT_CHIPS_INDIVIDUAL).toHaveLength(3);
    expect(AI_CHAT_CHIPS_INDIVIDUAL[0]).toBe(
      'Monte um roteiro para minha próxima conversa de feedback com esse colaborador.',
    );
  });

  it('AI_CHAT_CHIPS_EQUIPE tem 3 perguntas canonicas', () => {
    expect(AI_CHAT_CHIPS_EQUIPE).toHaveLength(3);
  });

  it('AI_CHAT_CHIPS_EQUIPE chip 1 — diagnostico geral', () => {
    expect(AI_CHAT_CHIPS_EQUIPE[0]).toBe(
      'Qual é o diagnóstico geral da minha equipe neste trimestre?',
    );
  });

  it('AI_CHAT_CHIPS_EQUIPE chip 2 — conversas individuais urgentes', () => {
    expect(AI_CHAT_CHIPS_EQUIPE[1]).toBe(
      'Quais colaboradores da equipe precisam de conversa individual urgente?',
    );
  });

  it('AI_CHAT_CHIPS_EQUIPE chip 3 — roteiro para conversa com a equipe', () => {
    expect(AI_CHAT_CHIPS_EQUIPE[2]).toBe(
      'Monte um roteiro para minha próxima conversa com a equipe.',
    );
  });

  it('AiChatDrawer reexporta AI_CHAT_CHIPS_INDIVIDUAL do modulo canonico', () => {
    const src = readSrc('src/app/dashboard-individual/[id]/AiChatDrawer.tsx');
    expect(src).toContain(
      "import { AI_CHAT_CHIPS_INDIVIDUAL } from '../../../lib/chat-ia/chatIaChips';",
    );
    expect(src).toContain('export { AI_CHAT_CHIPS_INDIVIDUAL }');
  });
});

describe('ME-UX-CONSOLIDACAO-P3a — AiChatDrawerEquipe + AiChatLauncherEquipe', () => {
  it('AiChatDrawerEquipe importa chips e actions canonicos da equipe', () => {
    const src = readSrc('src/app/dashboard-recorte/[tipo]/[alvo]/AiChatDrawerEquipe.tsx');
    expect(src).toContain(
      "import { AI_CHAT_CHIPS_EQUIPE } from '../../../../lib/chat-ia/chatIaChips';",
    );
    expect(src).toContain('chatIaEquipeGetHistoryAction');
    expect(src).toContain('chatIaEquipeSendMessageAction');
    expect(src).toContain('chatIaEquipeGetArchivedHistoryAction');
  });

  it('AiChatDrawerEquipe exporta AiChatDrawerEquipe (nao AiChatDrawer)', () => {
    const src = readSrc('src/app/dashboard-recorte/[tipo]/[alvo]/AiChatDrawerEquipe.tsx');
    expect(src).toContain('export function AiChatDrawerEquipe(');
    expect(src).not.toContain('export function AiChatDrawer(');
  });

  it('AiChatDrawerEquipe subtitulo canonico "Equipe — {leaderName}"', () => {
    const src = readSrc('src/app/dashboard-recorte/[tipo]/[alvo]/AiChatDrawerEquipe.tsx');
    expect(src).toContain('Equipe — {props.leaderName}');
    expect(src).not.toContain('Individual — {props.leaderName}');
  });

  it('AiChatLauncherEquipe usa aria-label + title canonicos', () => {
    const src = readSrc('src/app/dashboard-recorte/[tipo]/[alvo]/AiChatLauncherEquipe.tsx');
    expect(src).toContain('aria-label="Assistente de liderança"');
    expect(src).toContain('title="Assistente de liderança"');
    expect(src).toContain('<span>Assistente</span>');
  });

  it('AiChatLauncherEquipe renderiza AiChatDrawerEquipe quando open', () => {
    const src = readSrc('src/app/dashboard-recorte/[tipo]/[alvo]/AiChatLauncherEquipe.tsx');
    expect(src).toContain('<AiChatDrawerEquipe');
    expect(src).toContain('leaderId={props.leaderId}');
    expect(src).toContain('leaderName={props.leaderName}');
  });
});

describe('ME-UX-CONSOLIDACAO-P3a — integracao pages de recorte', () => {
  it('page.tsx nativo renderiza launcher quando equipe + leader employee', () => {
    const src = readSrc('src/app/dashboard-recorte/[tipo]/[alvo]/page.tsx');
    expect(src).toContain("import { AiChatLauncherEquipe } from './AiChatLauncherEquipe';");
    expect(src).toContain("alvo.tipo === 'equipe' && alvo.leader.tipo === 'employee'");
    expect(src).toContain('leaderId={alvo.leader.id}');
    expect(src).toContain('leaderName={resolvido.nomeAlvo}');
  });

  it('page.tsx super-admin tambem renderiza o launcher canonicamente', () => {
    const src = readSrc(
      'src/app/super-admin/empresa/[id]/dashboard-recorte/[tipo]/[alvo]/page.tsx',
    );
    expect(src).toContain('AiChatLauncherEquipe');
    expect(src).toContain("alvo.tipo === 'equipe' && alvo.leader.tipo === 'employee'");
    expect(src).toContain('leaderName={resolvido.nomeAlvo}');
  });

  it('resolveRecorteAlvo retorna nomeAlvo (para consumo pelo launcher)', () => {
    const src = readSrc('src/server/services/recorteAccess.ts');
    expect(src).toContain('readonly nomeAlvo: string;');
    expect(src).toContain('nomeAlvo: dept');
    expect(src).toContain('nomeAlvo: registro.name');
  });
});
