// ROIP APP 9BOX — seed canonico de climateEngagementData Ubatuba
// (ME-B2-01a.1.3 — refactor pos-Q1=A/Q3=A1).
//
// Refactor canonico de 30/09/2026: substitui a derivacao via PRNG
// (padrao original ME-080b Dispatch 5, com bug canonico de escala 0-4
// Likert bruta em vez de 0-10 §9.4) por chamada ao motor real
// `climateCalculationEngine.recalculateAggregates`. Fonte unica
// canonica: os agregados sao gerados pelo mesmo motor que roda em
// producao a cada gravacao de `scoreA` (hook §9.10 S170).
//
// Consequencias canonicas do refactor:
//   - Bug de escala 0-4 do PDF Clima e engajamento Ubatuba fica
//     resolvido bit-a-bit — o motor real produz 0-10 conforme §9.4.
//   - Zero drift entre seed e producao — impossibilitado por
//     construcao. Precedente canonico consolidado para tabelas
//     derivadas (`iqlData`, `plenitudeData`) que ja seguem esse
//     padrao.
//   - Agregados C-level (novo canonico ME-B2-01a.1.2 — Q3=A1) sao
//     gerados canonicamente pelo mesmo motor sem codigo adicional
//     no seed.
//
// Pre-requisitos canonicos (ordem em `loadUbatubaFixtures.ts`):
//   1. `instrumentA_responses` populado (fonte das notas por questao).
//   2. `plenitudeData` populado (fonte de `scoreA` e 4 scores por
//      dimensao — §9.1/§9.4).
//   3. `employeeLeaderHistory` populado (fonte da cadeia canonica
//      §9.2 — inclui vinculos employee-lider E C-level-lider).
//
// Nota canonica sobre tamanho do resultado (RV-15 medido):
//   - Numero de linhas geradas depende de: (a) quantidade de
//     departamentos com >=1 employee ativo; (b) quantidade de
//     employees `isLider=true` com >=1 subordinado direto; (c)
//     quantidade de C-levels com >=1 subordinado direto. Nao ha
//     numero fixo pre-calculado — a assercao canonica em
//     `loadUbatubaFixtures.ts` usa piso minimo qualitativo
//     (`UBATUBA_CLIMATE_TOTAL_MINIMO`) em vez de valor exato,
//     e o teste dedicado
//     `tests/integration/ubatuba/seedClimateEngagementDataViaMotor.test.ts`
//     mede o valor real bit-a-bit a cada rodada.
//
// RV-13: consumido por `src/db/seed/ubatuba/loadUbatubaFixtures.ts`
// + `tests/integration/ubatuba/seedClimateEngagementDataViaMotor.test.ts`.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../client';
import { climateEngagementData } from '../../schema';
import { recalculateAggregates } from '../../../server/services/climateCalculationEngine';
import { UBATUBA_COMPANY_ID, UBATUBA_REFERENCE_DATE } from './constants';

/**
 * Trimestres canonicos do escopo Ubatuba (formato varchar(7) do schema).
 * Preservado como export canonico da API antiga (§4.6) — consumido em
 * assercoes de teste que validam distribuicao por trimestre.
 */
export const UBATUBA_CLIMATE_TRIMESTRES = ['2027Q1', '2027Q2', '2027Q3', '2027Q4'] as const;
export type UbatubaClimateTrimestre = (typeof UBATUBA_CLIMATE_TRIMESTRES)[number];

/**
 * Departamentos canonicos com escopo=departamento no climate. Referencia
 * canonica preservada da API antiga — a lista real de departamentos com
 * agregados persistidos vem do proprio motor (S176 estendido §9.10) e
 * pode variar conforme employees ativos.
 */
export const UBATUBA_CLIMATE_DEPARTAMENTOS = [
  'Produção',
  'Comercial',
  'Logística',
  'Financeiro',
  'Administrativo',
  'Qualidade',
] as const;

/**
 * Seed canonico via motor real. Chama `recalculateAggregates` para cada
 * trimestre canonico da fixture Ubatuba, permitindo que o motor
 * `climateCalculationEngine` produza os agregados pela mesma
 * canonicidade §9.4 usada em producao. Retorna a contagem de linhas
 * canonicas gravadas em `climateEngagementData` da empresa Ubatuba.
 *
 * Pre-condicao canonica: fixtures dependentes ja populadas
 * (`plenitudeData`, `instrumentA_responses`, `employeeLeaderHistory`)
 * — sem elas o motor grava linhas com `countCobertura=0` e as
 * asserçoes qualitativas do teste vao falhar canonicamente.
 *
 * @param db  cliente Drizzle canonico da RoipDatabase.
 * @param now timestamp canonico do `calculadoEm` (default:
 *            `UBATUBA_REFERENCE_DATE` — bit-exact idempotente).
 */
export async function seedClimateEngagementDataViaMotor(
  db: RoipDatabase,
  now: Date = UBATUBA_REFERENCE_DATE,
): Promise<number> {
  for (const trimestre of UBATUBA_CLIMATE_TRIMESTRES) {
    await recalculateAggregates(db, UBATUBA_COMPANY_ID, trimestre, now);
  }
  const rows = await db
    .select({ id: climateEngagementData.id })
    .from(climateEngagementData)
    .where(eq(climateEngagementData.companyId, UBATUBA_COMPANY_ID));
  return rows.length;
}
