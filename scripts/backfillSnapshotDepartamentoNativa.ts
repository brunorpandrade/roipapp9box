// ROIP APP 9BOX — backfill cirurgico canonico (ME-1.3c CC079-v5).
//
// Corrige o estado em producao do snapshot do ciclo NR-1 da Nativa que
// foi gravado com `departamentoId=null` em todos os registros (bug raiz
// em `loadFixtures.ts:671` da leva anterior, corrigido na v5). Faz um
// UPDATE direcionado apenas na coluna `departamentoId` dos snapshots da
// Nativa que estao `null`, resolvendo pelo nome do enum
// `employees.departamento` contra `departments.nome`. Zero mudanca em
// nenhuma outra coluna, nenhum reseed destrutivo. Idempotente: segunda
// execucao atualiza 0 linhas.
//
// RV-11 integral: executa contra MySQL real; aceite com totais colados
// pelo integrador. RV-12 integral: 100% Drizzle tipado, zero SQL cru.
// RV-13: chamador exclusivo e o integrador em producao via
// `npx tsx scripts/backfillSnapshotDepartamentoNativa.ts`.
// Teste unitario: `tests/unit/nr1BackfillDepartamento.test.ts`
// exercita `derivarUpdatesBackfillDepartamento` com dados sinteticos.
//
// Saida canonica em stdout:
//   [backfill] encontrados N snapshots com departamentoId=null
//   [backfill] atualizados K (nao resolvido: N-K)
//   [backfill] DONE

import { and, eq, isNull } from 'drizzle-orm';

import { closeDbClient, createDbClient } from '../src/db/client';
import { copsoqCycleSnapshot, departments, employees } from '../src/db/schema';

const NATIVA_COMPANY_ID = 1 as const;

/**
 * Linha de snapshot a ser atualizada. Shape minimo canonico suficiente
 * para o algoritmo de resolucao.
 */
export interface SnapshotNullRow {
  readonly id: number;
  readonly employeeId: number;
}

/** Linha de employee minima para a resolucao do nome de departamento. */
export interface EmployeeNomeDepartamentoRow {
  readonly id: number;
  readonly departamento: string;
}

/** Linha de departament canonico para o map nome -> id. */
export interface DepartamentoRow {
  readonly id: number;
  readonly nome: string;
}

/** Update derivado para aplicar via Drizzle. */
export interface BackfillUpdate {
  readonly snapshotId: number;
  readonly departamentoId: number;
}

/** Diagnostico canonico da derivacao. */
export interface BackfillDerivation {
  readonly updates: readonly BackfillUpdate[];
  readonly naoResolvidosEmployeeAusente: number;
  readonly naoResolvidosNomeDepartamentoAusente: number;
}

/**
 * Deriva, a partir das 3 listas carregadas do banco, o conjunto de
 * UPDATEs necessarios para corrigir o `departamentoId=null` dos
 * snapshots da Nativa. Funcao pura: zero IO, totalmente testavel.
 */
export function derivarUpdatesBackfillDepartamento(
  snapshotsNull: readonly SnapshotNullRow[],
  employeesRows: readonly EmployeeNomeDepartamentoRow[],
  departamentosRows: readonly DepartamentoRow[],
): BackfillDerivation {
  const departamentoPorEmployeeId = new Map<number, string>(
    employeesRows.map((e) => [e.id, e.departamento]),
  );
  const idPorNomeDepartamento = new Map<string, number>(
    departamentosRows.map((d) => [d.nome, d.id]),
  );
  const updates: BackfillUpdate[] = [];
  let naoResolvidosEmployeeAusente = 0;
  let naoResolvidosNomeDepartamentoAusente = 0;
  for (const snap of snapshotsNull) {
    const nomeDept = departamentoPorEmployeeId.get(snap.employeeId);
    if (nomeDept === undefined) {
      naoResolvidosEmployeeAusente += 1;
      continue;
    }
    const depId = idPorNomeDepartamento.get(nomeDept);
    if (depId === undefined) {
      naoResolvidosNomeDepartamentoAusente += 1;
      continue;
    }
    updates.push({ snapshotId: snap.id, departamentoId: depId });
  }
  return {
    updates,
    naoResolvidosEmployeeAusente,
    naoResolvidosNomeDepartamentoAusente,
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida.');
    process.exit(2);
  }

  console.log('[backfill] Iniciando backfill cirurgico de departamentoId...');
  const client = createDbClient(url);

  try {
    const nullSnapshots = await client.db
      .select({
        id: copsoqCycleSnapshot.id,
        employeeId: copsoqCycleSnapshot.employeeId,
      })
      .from(copsoqCycleSnapshot)
      .where(
        and(
          eq(copsoqCycleSnapshot.companyId, NATIVA_COMPANY_ID),
          isNull(copsoqCycleSnapshot.departamentoId),
        ),
      );
    console.log(`[backfill] encontrados ${nullSnapshots.length} snapshots com departamentoId=null`);

    if (nullSnapshots.length === 0) {
      console.log('[backfill] nada a atualizar — base ja consistente.');
      console.log('[backfill] DONE');
      process.exit(0);
    }

    const employeeRows = await client.db
      .select({ id: employees.id, departamento: employees.departamento })
      .from(employees);
    const todosDepartamentos = await client.db
      .select({ id: departments.id, nome: departments.nome })
      .from(departments);

    const deriv = derivarUpdatesBackfillDepartamento(
      nullSnapshots,
      employeeRows,
      todosDepartamentos,
    );

    for (const u of deriv.updates) {
      await client.db
        .update(copsoqCycleSnapshot)
        .set({ departamentoId: u.departamentoId })
        .where(eq(copsoqCycleSnapshot.id, u.snapshotId));
    }

    const naoResolvidosTotal =
      deriv.naoResolvidosEmployeeAusente + deriv.naoResolvidosNomeDepartamentoAusente;
    console.log(
      `[backfill] atualizados ${deriv.updates.length} (nao resolvido: ${naoResolvidosTotal})`,
    );
    if (naoResolvidosTotal > 0) {
      console.log(
        `[backfill]   - employee ausente: ${deriv.naoResolvidosEmployeeAusente}, ` +
          `nome de departamento ausente: ${deriv.naoResolvidosNomeDepartamentoAusente}`,
      );
    }
    console.log('[backfill] DONE');
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`FAIL backfill: ${msg}`);
    if (stack) console.error(stack);
    process.exit(1);
  } finally {
    await closeDbClient(client);
  }
}

// Entry point: so executa como script (quando chamado via `tsx scripts/...`),
// nunca quando importado como modulo pelo teste unit (`import.meta.main`
// nao e canonico em Node; usamos o nome do arquivo em process.argv[1]).
const isMain =
  process.argv[1] !== undefined &&
  process.argv[1].endsWith('backfillSnapshotDepartamentoNativa.ts');
if (isMain) {
  void main();
}
