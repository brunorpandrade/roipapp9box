// ROIP APP 9BOX — derivacao canonica do ciclo NR-1 CORRENTE aberto
// da Nativa Alimentos Ltda. (ME-fila2-seed — D2 aprovada Opcao B).
//
// Contexto canonico: `EMPRESA_DEMO_NATIVA.md` §5.3+§5.4 canonicamente
// declaravam 1 ciclo NR-1 unico (historico 2026-Q4, status='fechado'
// entre 2026-10-20 e 2026-11-30). Isso invalidava a superficie canonica
// de resposta ao Radar NR-1 (portal do colaborador §14.19+§14.20 + card
// canonico em `/meu-portal` e `/colaborador/pendencias`) porque
// `pendenciasEngine.ts` linha 401 filtra por
// `status='aberto'` — sem ciclo aberto, nenhum card materializa.
//
// A intervencao manual §7.24 do HISTORICO_POS_B8_v23.md corrigiu
// pontualmente em produccao via `INSERT copsoqCycleSnapshot + UPDATE
// copsoqCycles.status='aberto'` em regime L114, replicando bit-a-bit a
// logica de `openScheduledNr1Cycles` do motor. Essa fixture materializa
// o mesmo comportamento como parte canonica do seed, para que futuras
// aplicacoes idempotentes da fixture Nativa ja abram com ciclo NR-1
// corrente disponivel.
//
// Cronologia canonica bit-a-bit da ME-fila2-seed:
//   - ciclo canonico: '2026-Q3-CORRENTE'
//   - dataAbertura: 2026-09-15
//   - dataFechamento: 2026-10-30 (~6 semanas)
//   - status: 'aberto'
//   - abertoEm: 2026-09-15T00:00:00Z
//   - configuradoPorSuperAdminId: NATIVA_SUPER_ADMIN_ID (=1)
// Coerencia canonica com a "data corrente" da demo (Setembro/2026, per
// telas dos dashboards RH e Lider §14.13+§14.14 nas empresas demo).
//
// Snapshot canonico: derivado pelo `loadFixtures.ts` apos o INSERT dos
// employees + termination events, filtrando `dataAdmissao <= 2026-09-15
// E NAO desligado antes de 2026-09-15`. Aplica o mesmo predicado
// canonico do `activeInMonthWhere` (`src/lib/scope/activeInMonth.ts`)
// materializado inline no consumidor (o seed nao chama routers).
//
// D2.4 aprovada (Ubatuba mantida sem ciclo NR-1 aberto por decisao
// canonica §7.24.9 — empresa demo do C-level puro).
//
// RV-13: consumido por `loadFixtures.ts` da Nativa + teste
//   `me-fila2-seed-open-nr1-cycle.test.ts`.
// RV-14: um statement por linha, largura <= 100 colunas.

// NATIVA_SUPER_ADMIN_ID vive canonicamente em `loadFixtures.ts` (id=1).
// Evitamos import circular declarando o mesmo valor localmente com
// invariante bit-a-bit.
const NATIVA_SUPER_ADMIN_ID = 1 as const;

/**
 * Shape canonico para INSERT em `copsoqCycles` (schema tables.ts:967).
 */
export interface DerivedOpenNr1CycleRow {
  readonly companyId: number;
  readonly ciclo: string;
  readonly dataAbertura: Date;
  readonly dataFechamento: Date;
  readonly status: 'aberto';
  readonly configuradoPorSuperAdminId: number;
  readonly abertoEm: Date;
  readonly createdAt: Date;
}

/**
 * Deriva a row canonica do ciclo NR-1 CORRENTE aberto da Nativa.
 * Idempotente por design — mesmos parametros produzem mesma row.
 *
 * @param companyId — canonicamente NATIVA_COMPANY_ID (=1).
 * @returns row canonica pronta para INSERT.
 */
export function deriveOpenNr1Cycle(companyId: number): DerivedOpenNr1CycleRow {
  const dataAbertura = new Date('2026-09-15T00:00:00.000Z');
  const dataFechamento = new Date('2026-10-30T00:00:00.000Z');
  const abertoEm = new Date('2026-09-15T00:00:00.000Z');
  return {
    companyId,
    ciclo: '2026-Q3-CORRENTE',
    dataAbertura,
    dataFechamento,
    status: 'aberto',
    configuradoPorSuperAdminId: NATIVA_SUPER_ADMIN_ID,
    abertoEm,
    createdAt: abertoEm,
  };
}

/**
 * Data canonica da abertura do ciclo NR-1 corrente. Exportada porque
 * `loadFixtures.ts` precisa usar como limite temporal para derivar o
 * snapshot canonico (employees ativos em 2026-09-15).
 */
export const NATIVA_OPEN_NR1_DATA_ABERTURA = '2026-09-15' as const;
