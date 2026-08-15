// ROIP APP 9BOX — derivacao canonica de alerts Ubatuba (ME-080b Dispatch 5).
//
// Escopo canonico DOC 06 M1-M7 (Alertas): tipos canonicos que a plataforma
// emite. Volume canonico do Dispatch 5: 13 alerts distribuidos assim:
//   - 6 alerts `nr1_fator_critico` — 1 por fator NR-1 em risco (existem 6
//     divergencias canonicas na fixture nr1_divergencias.json).
//   - 3 alerts `performance_baixa` — 1 por trimestre 2027Q2..Q4 (aponta
//     colaborador em faixa baixa persistente).
//   - 2 alerts `plenitude_baixa` — 1 por semestre 2027 (aponta employee
//     com plenitude <50 nas dimensoes A+C).
//   - 1 alert `turnover_alto` — departamento Producao (canonico Nativa).
//   - 1 alert `iql_critico` — lider com IQL <3.5 no trimestre.
//
// Cada alert:
//   - `tipo`: varchar(50), valor canonico do dominio.
//   - `severidade`: enum ('info' | 'observacao' | 'atencao' | 'critico').
//   - `escopo`: enum ('empresa' | 'departamento' | 'colaborador').
//   - `escopoDepartamentoId`: FK opcional para departments.
//   - `escopoEmployeeId`: FK opcional para employees.
//   - `metadados`: JSON canonico com detalhes especificos do tipo.
//   - `createdAt`: EXPLICITO (T4a) — timestamp derivado do trimestre.
//
// IMPORTANTE: alerts referencia `cicloDbId` para tipos NR-1, mas Ubatuba
// nao tem copsoqCycles seedados nesta ME (fica out-of-scope; a fixture
// COPSOQ e clonada apenas por FK a companyId=1 nos JSONs pinados). Para
// evitar FK violation, `cicloDbId` fica null nos alerts NR-1 Ubatuba.
// Consequencia semantica: alerts NR-1 aparecem como "gerado externamente"
// sem ciclo vinculado — aceitavel para demo, documentado em BACKLOG-07
// para reseed completo COPSOQ em ME futura.
//
// RV-13: consumido por `src/db/seed/ubatuba/loadUbatubaFixtures.ts` +
// `tests/unit/ubatuba/deriveAlerts.test.ts`.

import { createSeededPrng, randomInt } from '../../../lib/auth/prng';
import type { DerivedUbatubaEmployeeRow } from './deriveUbatubaEmployees';
import { UBATUBA_ALERTS_SEED, UBATUBA_COMPANY_ID } from './constants';

/** Estrutura row-ready para INSERT em alerts (retorna id apos INSERT). */
export interface DerivedAlertRow {
  readonly companyId: number;
  readonly tipo: string;
  readonly severidade: 'info' | 'observacao' | 'atencao' | 'critico';
  readonly escopo: 'empresa' | 'departamento' | 'colaborador' | null;
  readonly escopoDepartamentoId: number | null;
  readonly escopoEmployeeId: number | null;
  readonly suprimidoPorCooldown: boolean;
  readonly cicloDbId: number | null;
  readonly fatorId: number | null;
  readonly scoreValor: string | null;
  readonly metadados: Record<string, unknown> | null;
  readonly createdAt: Date;
}

/** Volume canonico total (RV-15). */
export const UBATUBA_ALERTS_TOTAL_ESPERADO = 13 as const;

/**
 * Mapping canonico dos 19 departamentos seed (migration 0000_canonical.sql
 * linhas 218-238). Usamos como fonte para FK escopoDepartamentoId.
 * Duplicar dessa forma isola o derivador de mudancas futuras na migration
 * (mudou a migration, o teste unit falha aqui — sinalizador canonico).
 */
export const DEPARTMENT_ID_MAP: Readonly<Record<string, number>> = {
  Comercial: 1,
  Marketing: 2,
  Operações: 3,
  Produção: 4,
  Logística: 5,
  Compras: 6,
  Financeiro: 7,
  Contabilidade: 8,
  'Recursos Humanos': 9,
  'Tecnologia da Informação': 10,
  Jurídico: 11,
  Qualidade: 12,
  Manutenção: 13,
  Projetos: 14,
  'Atendimento ao Cliente': 15,
  'Pós-venda': 16,
  Administrativo: 17,
  Diretoria: 18,
  Outros: 19,
};

/**
 * Deriva os 13 alerts canonicos Ubatuba em ordem determinista.
 *
 * @param ubatubaEmployees derivados (para escopoEmployeeId sorteado).
 * @param seed             semente PRNG (default UBATUBA_ALERTS_SEED).
 * @returns array com 13 rows canonicas.
 */
export function deriveAlerts(
  ubatubaEmployees: readonly DerivedUbatubaEmployeeRow[],
  seed: number = UBATUBA_ALERTS_SEED,
): DerivedAlertRow[] {
  const prng = createSeededPrng(seed);
  const rows: DerivedAlertRow[] = [];
  const ativos = ubatubaEmployees.filter((e) => e.status === 'ativo');
  const producaoAtivos = ativos.filter((e) => e.departamento === 'Produção');
  const lideresAtivos = ativos.filter((e) => e.isLider);
  const producaoDeptId = DEPARTMENT_ID_MAP['Produção']!;

  const ts2027Q2 = new Date('2027-06-30T18:00:00.000Z');
  const ts2027Q3 = new Date('2027-09-30T18:00:00.000Z');
  const ts2027Q4 = new Date('2027-12-31T18:00:00.000Z');

  // 1. 6 alerts NR-1 fator critico (fatorId 1..6, escopo=departamento).
  const departamentosNr1 = [
    'Produção',
    'Logística',
    'Comercial',
    'Financeiro',
    'Qualidade',
    'Administrativo',
  ];
  for (let fatorId = 1; fatorId <= 6; fatorId++) {
    const depNome = departamentosNr1[fatorId - 1]!;
    const depId = DEPARTMENT_ID_MAP[depNome]!;
    const score = (2.0 + prng() * 0.9).toFixed(2); // faixa 2.0-2.9 = critico
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      tipo: 'nr1_fator_critico',
      severidade: 'atencao',
      escopo: 'departamento',
      escopoDepartamentoId: depId,
      escopoEmployeeId: null,
      suprimidoPorCooldown: false,
      cicloDbId: null,
      fatorId,
      scoreValor: score,
      metadados: { departamentoNome: depNome, fatorId, thresholdCritico: '2.99' },
      createdAt: ts2027Q4,
    });
  }

  // 2. 3 alerts performance_baixa (Q2, Q3, Q4 2027; colaborador amostrado).
  for (const tri of [ts2027Q2, ts2027Q3, ts2027Q4]) {
    if (producaoAtivos.length === 0) continue;
    const emp = producaoAtivos[randomInt(prng, producaoAtivos.length)]!;
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      tipo: 'performance_baixa',
      severidade: 'observacao',
      escopo: 'colaborador',
      escopoDepartamentoId: null,
      escopoEmployeeId: emp.id,
      suprimidoPorCooldown: false,
      cicloDbId: null,
      fatorId: null,
      scoreValor: (45 + prng() * 15).toFixed(2), // faixa desempenho baixa
      metadados: {
        trimestre: tri.toISOString().slice(0, 7),
        employeeName: emp.name,
        thresholdBaixo: 60,
      },
      createdAt: tri,
    });
  }

  // 3. 2 alerts plenitude_baixa (2027H1, 2027H2).
  const semestresPlenitude = [
    { ts: new Date('2027-06-30T18:00:00.000Z'), label: '2027H1' },
    { ts: new Date('2027-12-31T18:00:00.000Z'), label: '2027H2' },
  ];
  for (const sem of semestresPlenitude) {
    if (ativos.length === 0) continue;
    const emp = ativos[randomInt(prng, ativos.length)]!;
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      tipo: 'plenitude_baixa',
      severidade: 'observacao',
      escopo: 'colaborador',
      escopoDepartamentoId: null,
      escopoEmployeeId: emp.id,
      suprimidoPorCooldown: false,
      cicloDbId: null,
      fatorId: null,
      scoreValor: (35 + prng() * 12).toFixed(2), // <50 = baixa
      metadados: {
        semestre: sem.label,
        employeeName: emp.name,
        thresholdBaixo: 50,
      },
      createdAt: sem.ts,
    });
  }

  // 4. 1 alert turnover_alto (departamento Producao).
  rows.push({
    companyId: UBATUBA_COMPANY_ID,
    tipo: 'turnover_alto',
    severidade: 'atencao',
    escopo: 'departamento',
    escopoDepartamentoId: producaoDeptId,
    escopoEmployeeId: null,
    suprimidoPorCooldown: false,
    cicloDbId: null,
    fatorId: null,
    scoreValor: (18 + prng() * 6).toFixed(2), // % turnover
    metadados: {
      departamentoNome: 'Produção',
      periodoRolling: '12m',
      thresholdAlto: '15.00',
    },
    createdAt: ts2027Q4,
  });

  // 5. 1 alert iql_critico (lider com IQL <3.5).
  if (lideresAtivos.length > 0) {
    const lider = lideresAtivos[randomInt(prng, lideresAtivos.length)]!;
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      tipo: 'iql_critico',
      severidade: 'critico',
      escopo: 'colaborador',
      escopoDepartamentoId: null,
      escopoEmployeeId: lider.id,
      suprimidoPorCooldown: false,
      cicloDbId: null,
      fatorId: null,
      scoreValor: (2.5 + prng() * 0.9).toFixed(2), // <3.5 = critico
      metadados: {
        liderName: lider.name,
        trimestre: '2027Q4',
        thresholdCritico: '3.50',
      },
      createdAt: ts2027Q4,
    });
  }

  return rows;
}
