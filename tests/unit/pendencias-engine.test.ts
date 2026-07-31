// ROIP APP 9BOX — testes unit dos helpers puros do motor canonico de
// `/pendencias-portal` (ME-058 §14.23).
//
// Cobertura canonica dos helpers exportados diretamente:
// - PERFIL_INDIVIDUAL_THRESHOLD_DIAS constante bit-exact.
//
// Cobertura via loadPendenciasPage com db mockado nao e viavel — o motor
// depende de operacoes especificas do driver mysql2 via Drizzle
// (Promise.all, alias, sql`COUNT(*)`). Testes de integracao em
// `me058-pendencias.test.ts` cobrem semantica end-to-end contra MySQL
// real (RV-11 canonica).
//
// Estes testes unit cobrem apenas o contrato canonico das constantes
// exportadas.

import { describe, expect, it } from 'vitest';

import { PERFIL_INDIVIDUAL_THRESHOLD_DIAS } from '../../src/lib/pendencias/pendenciasEngine';

describe('PERFIL_INDIVIDUAL_THRESHOLD_DIAS — constante canonica S330', () => {
  it('valor canonico = 30 dias', () => {
    expect(PERFIL_INDIVIDUAL_THRESHOLD_DIAS).toBe(30);
  });

  it('valor e numero (nao string)', () => {
    expect(typeof PERFIL_INDIVIDUAL_THRESHOLD_DIAS).toBe('number');
  });

  it('valor e finito e positivo', () => {
    expect(Number.isFinite(PERFIL_INDIVIDUAL_THRESHOLD_DIAS)).toBe(true);
    expect(PERFIL_INDIVIDUAL_THRESHOLD_DIAS).toBeGreaterThan(0);
  });
});
