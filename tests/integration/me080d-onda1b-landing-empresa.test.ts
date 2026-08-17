// ROIP APP 9BOX — teste de integração ME-080d Onda 1b.
//
// Cobre bit-exact as duas mutacoes canonicas do
// `CompanyLandingClient.tsx`:
//
// 1. D12=A — botao "Painel de controle do RH" removido da secao
//    "Acoes" da landing empresa. Rota `/painel-rh` lia
//    `session.companyId`, que Super Admin nao possui — usuario era
//    redirecionado a `/super-admin` (matriz DOC 02 §10.3). Debito
//    D-RH-IMPERSONATION registrado para ME futura dedicada.
//
// 2. Fix visual card ROI global — spans `title`/`value`/`sub` do
//    `ClickableIndicatorCard` renderizavam inline (defaults do span
//    HTML), o que colava "—" com "Disponivel a partir do primeiro
//    trimestre calculado." no card ROI global. Adicionado
//    `display: 'block'` explicito nos 3 spans.
//
// Estrategia canonica: leitura do source-code como texto (grep-style),
// evitando render via jsdom.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const LANDING_PATH = join(
  process.cwd(),
  'src/app/super-admin/empresa/[id]/CompanyLandingClient.tsx',
);
// ME-083 D-ME083-7 — ClickableIndicatorCard extraido para componente
// canonico compartilhado `src/components/painel/ClickableIndicatorCard.
// tsx`. Fix ROI card §5.4 preservado bit-exact no novo arquivo. O teste
// bit-exact continua valido — apenas a origem do source mudou.
const CLICKABLE_CARD_PATH = join(process.cwd(), 'src/components/painel/ClickableIndicatorCard.tsx');

describe('ME-080d Onda 1b — CompanyLandingClient (D12 + fix ROI card)', () => {
  const source = readFileSync(LANDING_PATH, 'utf8');
  // ME-083 D-ME083-7 — source do ClickableIndicatorCard agora vem do
  // arquivo extraido (componente canonico compartilhado). Fix ROI card
  // bit-exact preservado.
  const clickableCardSource = readFileSync(CLICKABLE_CARD_PATH, 'utf8');

  it('D12=A — botao "Painel de controle do RH" removido do JSX renderizado', () => {
    // O botao original renderizava exatamente:
    //   <Link href="/painel-rh" style={buttonStyle}>
    //     Painel de controle do RH
    //   </Link>
    // Sem detectar o comentario canonico documental (que descreve o
    // debito D-RH-IMPERSONATION), buscamos padrao JSX ativo:
    expect(source).not.toMatch(/<Link\s+href=["']\/painel-rh["']/);
    expect(source).not.toMatch(/>\s*Painel de controle do RH\s*</);
  });

  it('D12=A — os 4 outros botoes de Acoes permanecem intactos', () => {
    expect(source).toContain('/clevel-rh');
    expect(source).toContain('/dados-mensais');
    expect(source).toContain('/organograma');
    expect(source).toContain('?tab=rh');
  });

  it('fix ROI card — ClickableIndicatorCard spans usam display: block', () => {
    // Os 3 spans (title, value, sub) do componente devem ter
    // `display: 'block'` no seu inline style.
    // Contamos as ocorrencias exatas dentro do bloco `const body = (`
    // ate o proximo `);` para escopo estreito.
    // ME-083 D-ME083-7 — leitura do componente canonico compartilhado.
    const bodyMatch = clickableCardSource.match(/const body = \(\s*<>([\s\S]*?)<\/>\s*\);/);
    expect(bodyMatch).not.toBeNull();
    const bodyBlock = bodyMatch?.[1] ?? '';
    expect(bodyBlock.length).toBeGreaterThan(0);
    const occurrences = (bodyBlock.match(/display: 'block'/g) ?? []).length;
    expect(occurrences).toBe(3);
  });

  it('fix ROI card — NOTA_ROI_GLOBAL_PLACEHOLDER preservado bit-exact', () => {
    // Garante que a mensagem canonica nao foi alterada por engano.
    expect(source).toContain(
      "NOTA_ROI_GLOBAL_PLACEHOLDER = 'Disponível a partir do primeiro trimestre calculado.'",
    );
  });
});
