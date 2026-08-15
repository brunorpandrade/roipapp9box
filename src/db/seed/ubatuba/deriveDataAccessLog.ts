// ROIP APP 9BOX — derivacao canonica de dataAccessLog Ubatuba
// (ME-080b Dispatch 5).
//
// Escopo canonico DOC 04 §14.2 (LGPD art. 37): registro de acesso a dados
// pessoais de titulares (employees) por agentes com prerrogativa
// (super_admin, rh, lider, clevel).
//
// Volume canonico: aproximadamente 200 registros distribuidos ao longo do
// ciclo 2026-2027. Regra de derivacao:
//   - Cada employee ativo (~53 na Nativa/Ubatuba) recebe 2 acessos historicos
//     ao seu dashboard individual pelo RH: 2 × 53 = 106.
//   - Cada lider (~11 lideres employees) recebe 3 acessos a relatorios de
//     perfil individual dos seus liderados: (numero de liderados/lider
//     medio ~4) × 3 × 11 ≈ 132. Aplicamos amostragem: 40 acessos.
//   - Super admin ocasional: 30 acessos a exportacao_planilha (auditoria
//     regulatoria simulada).
//   - CEO (clevel): 24 acessos a dashboards individuais dos diretos.
//   Total canonico: 106 + 40 + 30 + 24 = 200 registros.
//
// createdAt: EXPLICITO (T4a) — distribuidos deterministicamente entre
// 2026-01-15 e 2027-12-31 via avanco em passos derivados do PRNG.
//
// Idempotencia bit-exact: mesma seed produz mesmos timestamps e mesma
// distribuicao. Rodar 2x produz SHA-256 identico.
//
// RV-13: consumido por `src/db/seed/ubatuba/loadUbatubaFixtures.ts` +
// `tests/unit/ubatuba/deriveDataAccessLog.test.ts`.

import { createSeededPrng, randomInt } from '../../../lib/auth/prng';
import type { TipoAcesso } from '../../schema/enums';
import type { DerivedUbatubaEmployeeRow } from './deriveUbatubaEmployees';
import type { DerivedUbatubaCLevelRow } from './deriveUbatubaCLevels';
import { UBATUBA_COMPANY_ID, UBATUBA_DAL_SEED, UBATUBA_SUPER_ADMIN_ID } from './constants';

/** Estrutura row-ready para INSERT em dataAccessLog. */
export interface DerivedDataAccessLogRow {
  readonly companyId: number;
  readonly agentType: 'super_admin' | 'rh' | 'lider' | 'clevel';
  readonly agentId: number;
  readonly titularEmployeeId: number;
  readonly tipoAcesso: TipoAcesso;
  readonly contexto: string | null;
  readonly createdAt: Date;
}

/** Volume canonico total esperado (para RV-15 e teste de invariante). */
export const UBATUBA_DAL_TOTAL_ESPERADO = 200 as const;

/** Data inicial canonica dos acessos (Ubatuba entrou 15/01/2026). */
const DAL_START = new Date('2026-01-15T09:00:00.000Z').getTime();

/** Data final canonica (fim do ciclo Ubatuba). */
const DAL_END = new Date('2027-12-31T18:00:00.000Z').getTime();

/**
 * Gera um timestamp canonico dentro do intervalo [DAL_START, DAL_END] usando
 * o PRNG dado. Passo deterministico — mesmo estado do PRNG produz mesmo Date.
 */
function gerarTimestamp(prng: () => number): Date {
  const span = DAL_END - DAL_START;
  const offset = Math.floor(prng() * span);
  return new Date(DAL_START + offset);
}

/**
 * Deriva os 200 registros canonicos de dataAccessLog Ubatuba. Ordem canonica:
 *   1. 106 acessos RH -> dashboard_individual (2 por employee ativo).
 *   2. 40 acessos Lider -> relatorio_perfil_individual (amostragem).
 *   3. 30 acessos SuperAdmin -> exportacao_planilha (auditoria).
 *   4. 24 acessos CEO(clevel) -> dashboard_individual.
 *
 * @param ubatubaEmployees derivados (todos os 66, filtramos ativos aqui).
 * @param ubatubaCLevels   derivados (3 C-levels, o CEO faz os acessos).
 * @param seed             semente PRNG (default UBATUBA_DAL_SEED).
 * @returns array com ~200 rows canonicas em ordem determinista.
 */
export function deriveDataAccessLog(
  ubatubaEmployees: readonly DerivedUbatubaEmployeeRow[],
  ubatubaCLevels: readonly DerivedUbatubaCLevelRow[],
  seed: number = UBATUBA_DAL_SEED,
): DerivedDataAccessLogRow[] {
  const prng = createSeededPrng(seed);
  const rows: DerivedDataAccessLogRow[] = [];
  const ativos = ubatubaEmployees.filter((e) => e.status === 'ativo');
  const rhAtivos = ativos.filter((e) => e.isRH);
  const lideresAtivos = ativos.filter((e) => e.isLider);
  const ceoUbatuba = ubatubaCLevels.find((c) => c.cargo === 'CEO');
  if (ceoUbatuba === undefined) {
    throw new Error('deriveDataAccessLog: CEO ausente em ubatubaCLevels.');
  }
  if (rhAtivos.length === 0) {
    throw new Error('deriveDataAccessLog: nenhum RH ativo em ubatubaEmployees.');
  }

  // 1. RH -> dashboard_individual (2 por employee ativo).
  for (const emp of ativos) {
    for (let i = 0; i < 2; i++) {
      const rhAgent = rhAtivos[randomInt(prng, rhAtivos.length)]!;
      rows.push({
        companyId: UBATUBA_COMPANY_ID,
        agentType: 'rh',
        agentId: rhAgent.id,
        titularEmployeeId: emp.id,
        tipoAcesso: 'dashboard_individual',
        contexto: `Auditoria RH — revisao de dashboard (${i + 1}/2)`,
        createdAt: gerarTimestamp(prng),
      });
    }
  }

  // 2. Lider -> relatorio_perfil_individual (40 acessos, amostragem canonica).
  for (let i = 0; i < 40; i++) {
    const lider = lideresAtivos[randomInt(prng, lideresAtivos.length)]!;
    const liderados = ativos.filter(
      (e) => e.departamento === lider.departamento && e.id !== lider.id,
    );
    if (liderados.length === 0) {
      continue; // lider isolado (sem liderados no departamento) — pula.
    }
    const titular = liderados[randomInt(prng, liderados.length)]!;
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      agentType: 'lider',
      agentId: lider.id,
      titularEmployeeId: titular.id,
      tipoAcesso: 'relatorio_perfil_individual',
      contexto: `Consulta de perfil individual pelo lider (${lider.name})`,
      createdAt: gerarTimestamp(prng),
    });
  }

  // 3. SuperAdmin -> exportacao_planilha (30 acessos, titular sorteado).
  for (let i = 0; i < 30; i++) {
    const titular = ativos[randomInt(prng, ativos.length)]!;
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      agentType: 'super_admin',
      agentId: UBATUBA_SUPER_ADMIN_ID,
      titularEmployeeId: titular.id,
      tipoAcesso: 'exportacao_planilha',
      contexto: 'Exportacao regulatoria — auditoria interna',
      createdAt: gerarTimestamp(prng),
    });
  }

  // 4. CEO(clevel) -> dashboard_individual (24 acessos, foco em diretos).
  // Diretos do CEO no modelo canonico: outros C-levels (nao aplicavel via
  // titularEmployeeId, que exige employees) + lideres. Aqui restringimos a
  // lideres employees.
  for (let i = 0; i < 24; i++) {
    const titular = lideresAtivos[randomInt(prng, lideresAtivos.length)]!;
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      agentType: 'clevel',
      agentId: ceoUbatuba.id,
      titularEmployeeId: titular.id,
      tipoAcesso: 'dashboard_individual',
      contexto: 'Acompanhamento executivo — CEO',
      createdAt: gerarTimestamp(prng),
    });
  }

  return rows;
}
