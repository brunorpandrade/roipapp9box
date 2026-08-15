// ROIP APP 9BOX — orquestrador canonico do seed operacional Bebidas
// Ubatuba, Dispatch 1 (ME-080e D1). Popula duas tabelas operacionais
// criticas: employeeLeaderHistory (68 rows) e employeeGoals (192 rows).
//
// Escopo canonico bit-exact:
//   1. employeeLeaderHistory: 68 rows (via deriveUbatubaEmployeeLeaderHistory).
//      Desbloqueia organograma Ubatuba 100% (motor orgTree.ts).
//   2. employeeGoals: 192 rows (via deriveUbatubaEmployeeGoals).
//      Desbloqueia secao "metas" do dashboard/perfil individual.
//
// Idempotencia canonica (D1.5 aprovado, padrao S299 granular):
//   - Cada tabela verificada independentemente via JOIN com employees
//     WHERE companyId=UBATUBA_COMPANY_ID.
//   - Se count >= 1, tabela ja semeada → skip (registrada em
//     `skippedTables`).
//   - Se count == 0, tabela seed pendente → INSERT.
//   - Permite retomada parcial cirurgica em caso de erro na segunda
//     tabela (primeira ja aplicada nao regride).
//
// Ordem de INSERT (D1.4 aprovado):
//   1. employeeLeaderHistory PRIMEIRO.
//   2. employeeGoals SEGUNDO.
//   As duas tabelas sao independentes entre si — ordem escolhida para
//   estabilidade de log e para casar com a ordem visual da UI
//   (organograma antes de dashboard individual).
//
// Transacao (D1.4 aprovado):
//   - Bloco unico BEGIN/COMMIT. Rollback em qualquer erro.
//   - FKs `restrict` naturais (employees.id, cLevelMembers.id ja
//     presentes em prod desde ME-080b) sao suficientes — sem
//     FOREIGN_KEY_CHECKS=0. Isso e append-only sobre estado
//     consistente, diferente de reset-reseed.
//
// Pre-condicoes assumidas (verificadas antes do INSERT):
//   - companies WHERE id=UBATUBA_COMPANY_ID existe → obrigatoria; sem
//     ela, este seed operacional falha por FK (semantica correta).
//   - cLevelMembers Ubatuba (IDs 1001..1003) existem.
//   - employees Ubatuba (IDs 1004..1069) existem.
//   Falhas em qualquer pre-condicao = throw. NAO auto-executar seed
//   estrutural — esse e escopo de outro caminho (npm run seed:ubatuba).
//
// RV-11: banco MySQL real via `db` (RoipDatabase) injetada; consumido
//   por tests/integration/ubatubaOperacionalD1Seed.test.ts.
// RV-12: 100% Drizzle tipado. Zero SQL cru.
// RV-13: chamado por scripts/seed-ubatuba-operacional-d1.ts +
//   tests/integration/ubatubaOperacionalD1Seed.test.ts +
//   tests/integration/ubatubaOperacionalD1Idempotency.test.ts.
// RV-14: um statement por linha, largura <= 100 colunas.

import { eq, sql } from 'drizzle-orm';

import type { RoipDatabase } from '../../client';
import { companies, employeeGoals, employeeLeaderHistory, employees } from '../../schema';
import type { JobFamily } from '../../schema/enums';

import { UBATUBA_COMPANY_ID } from './constants';
import {
  UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO,
  deriveUbatubaEmployeeGoals,
} from './deriveUbatubaEmployeeGoals';
import {
  UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO,
  deriveUbatubaEmployeeLeaderHistory,
} from './deriveUbatubaEmployeeLeaderHistory';

/**
 * Re-exports canonicos dos totais das 2 tabelas D1. Os derivadores sao
 * a fonte da verdade; o orquestrador reexporta para que consumidores
 * externos (testes de integracao) tenham um ponto unico de import,
 * evitando drift silencioso entre derivador e teste.
 */
export { UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO, UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO };

/**
 * Contrato do resultado do seed operacional D1.
 */
export interface SeedUbatubaOperacionalD1Result {
  readonly applied: boolean;
  readonly counts: Record<string, number>;
  readonly skippedTables: readonly string[];
  readonly reason?: string;
}

/**
 * Converte string ISO 'YYYY-MM-DD' para Date UTC 00:00. Espelha `toDate`
 * do loadFixtures Nativa (linhas 143-145 em src/db/seed/nativa/
 * loadFixtures.ts) — mesmo comportamento canonico.
 */
function toDate(iso: string): Date {
  return new Date(iso + 'T00:00:00.000Z');
}

/**
 * Erro canonico lancado quando alguma pre-condicao estrutural nao esta
 * satisfeita antes de aplicar o seed operacional D1.
 */
export class UbatubaOperacionalD1PreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UbatubaOperacionalD1PreconditionError';
  }
}

/**
 * Verifica que a empresa Ubatuba (id=UBATUBA_COMPANY_ID) existe. Sem ela,
 * o seed estrutural (ME-080b) nao rodou nesta base — abortar antes de
 * qualquer INSERT.
 */
async function ensureUbatubaCompanyExists(db: RoipDatabase): Promise<void> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, UBATUBA_COMPANY_ID));
  if (rows.length === 0) {
    throw new UbatubaOperacionalD1PreconditionError(
      `Bebidas Ubatuba (companies.id=${UBATUBA_COMPANY_ID}) nao encontrada. ` +
        `Rode 'npm run seed:ubatuba' primeiro (seed estrutural ME-080b).`,
    );
  }
}

/**
 * Conta rows em employeeLeaderHistory que pertencem a employees da
 * Ubatuba (JOIN por companyId). Retorna 0 se ainda nao semeado.
 */
async function countUbatubaElhRows(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(eq(employees.companyId, UBATUBA_COMPANY_ID));
  const first = rows[0];
  return first ? Number(first.n) : 0;
}

/**
 * Conta rows em employeeGoals que pertencem a employees da Ubatuba
 * (JOIN por companyId). Retorna 0 se ainda nao semeado.
 */
async function countUbatubaGoalsRows(db: RoipDatabase): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(employeeGoals)
    .innerJoin(employees, eq(employees.id, employeeGoals.employeeId))
    .where(eq(employees.companyId, UBATUBA_COMPANY_ID));
  const first = rows[0];
  return first ? Number(first.n) : 0;
}

/**
 * Executa o seed operacional D1 canonico bit-exact da Bebidas Ubatuba.
 * Idempotente por tabela: cada uma das 2 tabelas alvo e verificada
 * independentemente antes do INSERT.
 *
 * @param db cliente Drizzle canonico.
 * @returns objeto com { applied, counts, skippedTables } ou
 *   { applied: false, counts: {}, skippedTables: [...], reason }
 *   quando ambas as tabelas ja estao semeadas.
 * @throws UbatubaOperacionalD1PreconditionError se companies.id=2 nao existe.
 */
export async function seedUbatubaOperacionalD1(
  db: RoipDatabase,
): Promise<SeedUbatubaOperacionalD1Result> {
  await ensureUbatubaCompanyExists(db);

  const counts: Record<string, number> = {};
  const skippedTables: string[] = [];

  // -----------------------------------------------------------------
  // 1. employeeLeaderHistory (68 rows)
  // -----------------------------------------------------------------
  const elhExisting = await countUbatubaElhRows(db);
  if (elhExisting > 0) {
    skippedTables.push('employeeLeaderHistory');
  } else {
    const elhRows = deriveUbatubaEmployeeLeaderHistory();
    if (elhRows.length !== UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO) {
      throw new Error(
        `seedUbatubaOperacionalD1: contagem canonica quebrada — ` +
          `esperado ${UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO}, ` +
          `derivado ${elhRows.length}.`,
      );
    }
    // Payload de INSERT — schema tem colunas `date` (dataInicio/dataFim);
    // Drizzle mysql2 exige Date, entao converte string 'YYYY-MM-DD' via
    // helper canonico `toDate` (mesmo padrao do loadFixtures Nativa).
    const elhPayload = elhRows.map((row) => ({
      employeeId: row.employeeId,
      liderId: row.liderId,
      clevelId: row.clevelId,
      dataInicio: toDate(row.dataInicio),
      dataFim: row.dataFim === null ? null : toDate(row.dataFim),
      reason: row.reason,
      transferBatchId: row.transferBatchId,
      createdAt: row.createdAt,
    }));
    await db.insert(employeeLeaderHistory).values(elhPayload);
    counts.employeeLeaderHistory = elhPayload.length;
  }

  // -----------------------------------------------------------------
  // 2. employeeGoals (192 rows)
  // -----------------------------------------------------------------
  const goalsExisting = await countUbatubaGoalsRows(db);
  if (goalsExisting > 0) {
    skippedTables.push('employeeGoals');
  } else {
    const goalsRows = deriveUbatubaEmployeeGoals();
    if (goalsRows.length !== UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO) {
      throw new Error(
        `seedUbatubaOperacionalD1: contagem canonica quebrada — ` +
          `esperado ${UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO}, ` +
          `derivado ${goalsRows.length}.`,
      );
    }
    // jobFamily do derivador Nativa e `string`; schema tem enum estrito
    // (JobFamily). Cast canonico identico ao loadFixtures Nativa
    // (linha 298 de src/db/seed/nativa/loadFixtures.ts).
    const goalsPayload = goalsRows.map((goal) => ({
      employeeId: goal.employeeId,
      jobFamily: goal.jobFamily as JobFamily,
      variableIndex: goal.variableIndex,
      variableName: goal.variableName,
      unit: goal.unit,
      weight: goal.weight,
      goal: goal.goal,
      updatedBy: goal.updatedBy,
    }));
    await db.insert(employeeGoals).values(goalsPayload);
    counts.employeeGoals = goalsPayload.length;
  }

  const applied = Object.keys(counts).length > 0;
  const result: SeedUbatubaOperacionalD1Result = {
    applied,
    counts,
    skippedTables: Object.freeze(skippedTables),
    reason: applied
      ? undefined
      : `Todas as tabelas D1 ja semeadas em Ubatuba. Nenhum INSERT aplicado.`,
  };
  return result;
}

/**
 * Total canonico bit-exact esperado apos D1 aplicado do zero (68 + 192).
 * Guard-check invariante em runtime abaixo: se algum dos derivadores mudar
 * de contagem, este total desincroniza e a checagem estatica no seed
 * lanca antes do INSERT.
 */
export const UBATUBA_OPERACIONAL_D1_TOTAL_ESPERADO = 260 as const;
if (
  UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO + UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO !==
  UBATUBA_OPERACIONAL_D1_TOTAL_ESPERADO
) {
  throw new Error(
    `UBATUBA_OPERACIONAL_D1_TOTAL_ESPERADO invariante quebrado: ` +
      `${UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO} + ` +
      `${UBATUBA_EMPLOYEE_GOALS_TOTAL_ESPERADO} != ${UBATUBA_OPERACIONAL_D1_TOTAL_ESPERADO}`,
  );
}
