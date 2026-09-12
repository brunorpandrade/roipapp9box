// ROIP APP 9BOX — smoke test do PerfilIndividualFormShell
// (ME-B10-04, S255).
//
// Nao usa renderizacao React — o repo nao instalou jsdom nem
// @testing-library/react intencionalmente (padrao herdado do Bloco A
// e dos smoke tests da ME-B10-02 `likert-form-shell.test.ts` e
// ME-B10-03 `nr1-form-shell.test.ts`). Este teste verifica:
//
// - Identidade estrutural minima do componente (funcao React
//   exportada, nome canonico).
// - Reuso bit-a-bit da mesma import pelas 2 paginas de formulario
//   (portal `/colaborador/responder/perfil-individual` + platform
//   `/meu-portal/perfil-individual`, S246-C).
// - Assertivas de contrato canonico consumido pelo shell:
//   endpoints backend (`/api/portal/session-token`,
//   `/api/portal/profile-form-state`, `/api/portal/save-profile-block`,
//   `/api/portal/submit-profile-assessment`), literais canonicos
//   do DOC 05 §7.5 (titulo, botoes, tela de confirmacao,
//   instrucao do bloco 1), comportamento canonico do bloco 10
//   (some [X] e [Salvar depois] do header, footer vira [Enviar
//   respostas]), e a regra canonica de "volta unica" front-only.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @stylistic/max-len -- import atomico (prettier)
import { PerfilIndividualFormShell } from '../../src/components/instruments/PerfilIndividualFormShell';

const REPO_ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf-8');
}

describe('PerfilIndividualFormShell — smoke RV-13 (componente exportado)', () => {
  it('PerfilIndividualFormShell e uma funcao componente exportada', () => {
    expect(typeof PerfilIndividualFormShell).toBe('function');
    expect(PerfilIndividualFormShell.name).toBe('PerfilIndividualFormShell');
  });
});

describe('PerfilIndividualFormShell — reuso bit-a-bit portal + platform (S246-C)', () => {
  it('pagina portal importa o PerfilIndividualFormShell canonico', () => {
    const portal = readSrc('src/app/colaborador/responder/perfil-individual/page.tsx');
    expect(portal).toContain('PerfilIndividualFormShell');
    expect(portal).toContain('canalAutenticacao="portal"');
    expect(portal).toContain('/colaborador/pendencias');
  });

  it('pagina platform importa o PerfilIndividualFormShell canonico', () => {
    const platform = readSrc('src/app/meu-portal/perfil-individual/page.tsx');
    expect(platform).toContain('PerfilIndividualFormShell');
    expect(platform).toContain('canalAutenticacao="platform"');
    expect(platform).toContain('/meu-portal');
  });

  it('pagina platform e server component autenticado (getServerSession + guard)', () => {
    const platform = readSrc('src/app/meu-portal/perfil-individual/page.tsx');
    expect(platform).not.toContain("'use client'");
    expect(platform).toContain('getServerSession');
    expect(platform).toContain("session.kind !== 'platform'");
    expect(platform).toContain('redirect');
  });

  it('pagina portal e client component com guard de sessionStorage', () => {
    const portal = readSrc('src/app/colaborador/responder/perfil-individual/page.tsx');
    expect(portal).toContain("'use client'");
    expect(portal).toContain('portalToken');
    expect(portal).toContain('/colaborador');
  });
});

describe('PerfilIndividualFormShell — endpoints canonicos DOC 03 §10.13', () => {
  const src = readSrc('src/components/instruments/PerfilIndividualFormShell.tsx');

  it('consome POST /api/portal/session-token para canal platform (S247-Alfa)', () => {
    expect(src).toContain('/api/portal/session-token');
  });

  it('consome POST /api/portal/profile-form-state para carregar estado', () => {
    expect(src).toContain('/api/portal/profile-form-state');
  });

  it('consome POST /api/portal/save-profile-block para salvar por bloco', () => {
    expect(src).toContain('/api/portal/save-profile-block');
  });

  it('consome POST /api/portal/submit-profile-assessment no bloco 10', () => {
    expect(src).toContain('/api/portal/submit-profile-assessment');
  });
});

describe('PerfilIndividualFormShell — literais canonicos DOC 05 §7.5', () => {
  const src = readSrc('src/components/instruments/PerfilIndividualFormShell.tsx');

  it('titulo canonico "Perfil Individual"', () => {
    expect(src).toContain('Perfil Individual');
  });

  it('botao canonico "Salvar e continuar depois" (some no bloco 10)', () => {
    expect(src).toContain('Salvar e continuar depois');
  });

  it('botao canonico "Bloco anterior" (regra de volta unica)', () => {
    expect(src).toContain('Bloco anterior');
  });

  it('botao canonico "Proximo bloco" nos blocos 1..9', () => {
    expect(src).toContain('Próximo bloco');
  });

  it('botao canonico "Enviar respostas" no bloco 10', () => {
    expect(src).toContain('Enviar respostas');
  });

  it('tela de confirmacao canonica pos-envio (§7.5)', () => {
    expect(src).toContain('Suas respostas foram enviadas!');
    expect(src).toContain('registradas com sucesso');
  });

  it('instrucao canonica no bloco 1 (§7.5) — fragmentos por RV-14 max-len', () => {
    // A string canonica esta quebrada em concatenacao por RV-14
    // (max 100 cols). Verificamos por fragmentos canonicos.
    expect(src).toContain('Instrução:');
    expect(src).toContain('não como');
    expect(src).toContain('gostaria de ser');
    expect(src).toContain('1 (Nunca) a 5');
    expect(src).toContain('Sempre');
  });

  it('label canonico "Progresso geral" no header', () => {
    expect(src).toContain('Progresso geral');
  });
});

describe('PerfilIndividualFormShell — comportamento canonico', () => {
  const src = readSrc('src/components/instruments/PerfilIndividualFormShell.tsx');

  it('respeita canalAutenticacao portal | platform', () => {
    expect(src).toContain("'portal'");
    expect(src).toContain("'platform'");
    expect(src).toContain('canalAutenticacao');
  });

  it('estado union discriminada com 6 kinds canonicos (L130-03)', () => {
    expect(src).toContain("kind: 'inicializando'");
    expect(src).toContain("kind: 'carregando'");
    expect(src).toContain("kind: 'pronto'");
    expect(src).toContain("kind: 'enviando'");
    expect(src).toContain("kind: 'enviado'");
    expect(src).toContain("kind: 'erro_fatal'");
  });

  it('respeita 10 blocos e 8 itens canonicos (espelho do engine)', () => {
    expect(src).toContain('PERFIL_INDIVIDUAL_TOTAL_BLOCOS');
    expect(src).toContain('PERFIL_INDIVIDUAL_ITENS_POR_BLOCO');
    expect(src).toContain('PERFIL_INDIVIDUAL_TOTAL_ITENS');
  });

  it('renderiza 3 tipos de item canonicos via catalogo (Likert + EF + Cenario)', () => {
    // Os 3 tipos sao dispatched pelo shell via `item.tipo` do catalogo.
    // Nao ha badge visivel de tipo no formulario (DOC 05 §7.5 —
    // enunciado + opcoes apenas). Verificamos que o dispatch por tipo
    // esta implementado.
    expect(src).toContain("item.tipo === 'likert'");
    expect(src).toContain('LikertOpcoes');
    expect(src).toContain('AlternativaOpcoes');
  });

  it('bloco 10 (ehBlocoFinal) troca comportamento do header + footer', () => {
    expect(src).toContain('ehBlocoFinal');
    expect(src).toContain('PERFIL_INDIVIDUAL_TOTAL_BLOCOS');
  });

  it('regra de volta unica implementada (voltouUmaVez flag)', () => {
    expect(src).toContain('voltouUmaVez');
  });

  it('layout pop-up modal 80% desktop (§7.5)', () => {
    // overlay com background semi-transparente + modal centralizado
    expect(src).toContain('rgba(0,0,0,0.5)');
    expect(src).toContain("width: '80%'");
    expect(src).toContain('maxWidth: 760');
  });
});
