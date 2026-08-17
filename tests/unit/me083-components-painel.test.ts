// ROIP APP 9BOX — teste unitario ME-083 (componentes canonicos extraidos
// para `src/components/painel/`).
//
// Cobre canonicamente:
//   1. Import canonico dos 3 componentes extraidos:
//      - `OnboardingKanbanMini` (D-ME083-6).
//      - `ClickableIndicatorCard` (D-ME083-7).
//      - `ZonaPlaceholder` (D-ME083-7).
//   2. Import canonico dos exports publicos de `painel-rh/PainelRHClient`:
//      constantes literais §5.5 (ZONA_9BOX_TEXTO_RH,
//      MINHA_EQUIPE_VAZIO_TEXTO, CADEIA_INDIRETA_VAZIO_TEXTO,
//      MEU_PORTAL_VAZIO_TEXTO, MEU_PORTAL_BOTAO_LABEL).
//   3. Prova canonica que as constantes bit-exact §5.5 do painel RH
//      estao presentes e literalmente corretas (RV-14).
//
// Sem MySQL: teste puramente de importacao/asserts sobre constantes
// canonicas (RV-11 nao se aplica).

import { describe, expect, it } from 'vitest';

import { ClickableIndicatorCard } from '../../src/components/painel/ClickableIndicatorCard';
import { OnboardingKanbanMini } from '../../src/components/painel/OnboardingKanbanMini';
import { ZonaPlaceholder } from '../../src/components/painel/ZonaPlaceholder';
import {
  CADEIA_INDIRETA_VAZIO_TEXTO,
  MEU_PORTAL_BOTAO_LABEL,
  MEU_PORTAL_VAZIO_TEXTO,
  MINHA_EQUIPE_VAZIO_TEXTO,
  ZONA_9BOX_TEXTO_RH,
} from '../../src/app/painel-rh/PainelRHClient';

describe('ME-083 — componentes canonicos extraidos e constantes literais §5.5', () => {
  it('OnboardingKanbanMini exportado bit-exact', () => {
    expect(typeof OnboardingKanbanMini).toBe('function');
    expect(OnboardingKanbanMini.name).toBe('OnboardingKanbanMini');
  });

  it('ClickableIndicatorCard exportado bit-exact', () => {
    expect(typeof ClickableIndicatorCard).toBe('function');
    expect(ClickableIndicatorCard.name).toBe('ClickableIndicatorCard');
  });

  it('ZonaPlaceholder exportado bit-exact', () => {
    expect(typeof ZonaPlaceholder).toBe('function');
    expect(ZonaPlaceholder.name).toBe('ZonaPlaceholder');
  });

  it('ZONA_9BOX_TEXTO_RH canonico bit-exact §5.9 painel RH', () => {
    expect(ZONA_9BOX_TEXTO_RH).toBe(
      'Disponível a partir da Fase 3. Esta zona se tornará o ponto de entrada ' +
        'do dashboard global da empresa.',
    );
  });

  it('MINHA_EQUIPE_VAZIO_TEXTO canonico bit-exact §5.5 Secao 2', () => {
    expect(MINHA_EQUIPE_VAZIO_TEXTO).toBe(
      'Você não tem liderados diretos ativos. Fale com o RH para incluir ' +
        'colaboradores em sua equipe.',
    );
  });

  it('CADEIA_INDIRETA_VAZIO_TEXTO canonico bit-exact §5.5 Secao 3', () => {
    expect(CADEIA_INDIRETA_VAZIO_TEXTO).toBe(
      'Você não tem cadeia indireta — nenhum dos seus liderados diretos é líder.',
    );
  });

  it('MEU_PORTAL_VAZIO_TEXTO canonico bit-exact §5.5 Secao 4', () => {
    expect(MEU_PORTAL_VAZIO_TEXTO).toBe('Você não tem pendências no portal.');
  });

  it('MEU_PORTAL_BOTAO_LABEL canonico bit-exact §5.5 Secao 4', () => {
    expect(MEU_PORTAL_BOTAO_LABEL).toBe('Acessar o portal com meu CPF →');
  });
});
