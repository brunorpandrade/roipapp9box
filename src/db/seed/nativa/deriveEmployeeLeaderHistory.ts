// ROIP APP 9BOX — derivacao canonica de employeeLeaderHistory (ME-068).
//
// Regra canonica bit-exact (E-068-13 fechada em Opcao X — MD Nativa v1.1 §4.3):
//   - 66 linhas iniciais: uma por employee, criada no cadastro (reason canonico
//     literal 'Atribuicao inicial no cadastro').
//   - +2 linhas por transferencia disparada por promocao:
//       * Marina Lopes (promovida 2027-07-01) recebe Tatiane Freitas como
//         liderada direta (antes reportava a Renata Lima).
//       * Leonardo Pires (promovido 2027-04-01) recebe Beatriz Nogueira como
//         liderada direta (antes reportava a Thiago Costa).
//   - As 2 linhas ORIGINAIS de Tatiane e Beatriz sao fechadas com `dataFim` = dia
//     anterior a promocao. Todas as demais 64 originais permanecem com
//     `dataFim = null`.
//
// Total canonico bit-exact: 66 + 2 = 68 linhas.
//   - 2 com dataFim NOT NULL (Tatiane, Beatriz — pre-promocao)
//   - 66 com dataFim NULL:
//       * 13 de employees inativos (regra DOC 01 §4.6: inativacao NAO fecha
//         vinculo automaticamente; a linha permanece aberta e queries filtram
//         por employees.status).
//       * 53 de employees ativos (51 originais nao promovidas + 2 novas
//         pos-promocao). Isso resulta em exatamente 53 ativos com vinculo
//         aberto em 2027-12-31 — bate bit-exact com invariante MD §18.4 v1.1.
//
// Mapping canonico do vinculo inicial de cada employee (MD §4.3):
//   Patricia (id=2, C-level) → Juliana Freitas, Bruno Cardoso, Denise Rocha
//   Ricardo (id=3, C-level)  → Fernando, Gustavo, Bianca, Renata, Carlos,
//                                Joao Pedro, Alexandre
//   Juliana (id=4)           → Claudia, Marisa, Roberto, Everton,
//                                Marina Peixoto (a partir de T8)
//   Fernando (id=5)          → Camila Batista, Marcelo Vieira
//   Camila Batista (id=6)    → 20+ liderados da Producao (todos operadores/aux)
//   Marcelo Vieira (id=7)    → Isabela Rezende (T3), Diego Ferraz (T3)
//   Gustavo (id=8)           → Marcio Fernandes
//   Marcio Fernandes (id=9)  → Renato, Daniel, Everton Lima, Adriano, Jonas, e substitutos
//   Bianca (id=10)           → Thiago, Leonardo (ate T5, entao vira lider)
//   Thiago (id=11)           → Fabio, Pedro Augusto (ate T4), Beatriz (ate T5)
//   Renata (id=12)           → Marina Lopes, Tatiane (Tatiane muda para Marina em T7)
//
// RV-13: consumido por src/db/seed/nativa/loadFixtures.ts + tests/unit/nativa/
// deriveEmployeeLeaderHistory.test.ts.

import { randomUUID } from 'node:crypto';

import { NATIVA_EMPLOYEES } from './constants';

/**
 * Estrutura canonica bit-exact para INSERT em employeeLeaderHistory
 * (DOC 01 §4.6).
 */
export interface DerivedEmployeeLeaderHistory {
  readonly employeeId: number;
  readonly liderId: number | null; // employees.id (nao C-level)
  readonly clevelId: number | null; // cLevelMembers.id (nao lider employee)
  readonly dataInicio: string; // 'YYYY-MM-DD'
  readonly dataFim: string | null; // 'YYYY-MM-DD' ou null se aberto
  readonly reason: string; // 100-500 chars canonicos
  readonly transferBatchId: string; // UUID v4 unico por batch
  readonly createdAt: Date; // timestamp historico
}

/**
 * Mapping canonico bit-exact do vinculo inicial de cada employee.
 * Chave: employeeId. Valor: `{ tipo, id }` — tipo='clevel' ou 'lider'.
 *
 * Derivado da §4.3 do MD Nativa v1.1. Consumido pela geracao das 66 linhas
 * originais.
 */
const VINCULO_INICIAL: ReadonlyMap<number, { tipo: 'clevel' | 'lider'; id: number }> = new Map([
  // Patricia (C-level id=2) recebe
  [4, { tipo: 'clevel', id: 2 }], // Juliana Freitas
  [13, { tipo: 'clevel', id: 2 }], // Bruno Cardoso
  [14, { tipo: 'clevel', id: 2 }], // Denise Rocha
  // Ricardo (C-level id=3) recebe
  [5, { tipo: 'clevel', id: 3 }], // Fernando Salles
  [8, { tipo: 'clevel', id: 3 }], // Gustavo Almeida
  [10, { tipo: 'clevel', id: 3 }], // Bianca Martins
  [12, { tipo: 'clevel', id: 3 }], // Renata Lima
  [48, { tipo: 'clevel', id: 3 }], // Carlos Eduardo Mendes
  [49, { tipo: 'clevel', id: 3 }], // Joao Pedro Ramos
  [50, { tipo: 'clevel', id: 3 }], // Alexandre Gouveia
  // Juliana (id=4) recebe
  [15, { tipo: 'lider', id: 4 }], // Claudia Nascimento
  [16, { tipo: 'lider', id: 4 }], // Marisa Oliveira
  [17, { tipo: 'lider', id: 4 }], // Roberto Santos
  [18, { tipo: 'lider', id: 4 }], // Everton Nunes
  [68, { tipo: 'lider', id: 4 }], // Marina Peixoto (pos-kickoff, cadastrada 2027-09-15)
  // Fernando (id=5) recebe
  [6, { tipo: 'lider', id: 5 }], // Camila Batista
  [7, { tipo: 'lider', id: 5 }], // Marcelo Vieira
  // Camila Batista (id=6) recebe operadores/aux de PRO — ids 19..37 + entrantes pos-kickoff
  [19, { tipo: 'lider', id: 6 }],
  [20, { tipo: 'lider', id: 6 }],
  [21, { tipo: 'lider', id: 6 }],
  [22, { tipo: 'lider', id: 6 }],
  [23, { tipo: 'lider', id: 6 }],
  [24, { tipo: 'lider', id: 6 }],
  [25, { tipo: 'lider', id: 6 }],
  [26, { tipo: 'lider', id: 6 }],
  [27, { tipo: 'lider', id: 6 }],
  [28, { tipo: 'lider', id: 6 }],
  [29, { tipo: 'lider', id: 6 }],
  [30, { tipo: 'lider', id: 6 }],
  [31, { tipo: 'lider', id: 6 }],
  [32, { tipo: 'lider', id: 6 }],
  [33, { tipo: 'lider', id: 6 }],
  [34, { tipo: 'lider', id: 6 }],
  [35, { tipo: 'lider', id: 6 }],
  [36, { tipo: 'lider', id: 6 }],
  [37, { tipo: 'lider', id: 6 }],
  [51, { tipo: 'lider', id: 6 }],
  // Entrantes pos-kickoff da Producao — sob Camila Batista
  [52, { tipo: 'lider', id: 6 }],
  [55, { tipo: 'lider', id: 6 }],
  [57, { tipo: 'lider', id: 6 }],
  [58, { tipo: 'lider', id: 6 }],
  [60, { tipo: 'lider', id: 6 }],
  [61, { tipo: 'lider', id: 6 }],
  [63, { tipo: 'lider', id: 6 }],
  [64, { tipo: 'lider', id: 6 }],
  [65, { tipo: 'lider', id: 6 }],
  [66, { tipo: 'lider', id: 6 }],
  [67, { tipo: 'lider', id: 6 }],
  [69, { tipo: 'lider', id: 6 }],
  // Marcelo Vieira (id=7) recebe Qualidade (entrantes)
  [53, { tipo: 'lider', id: 7 }], // Isabela Rezende
  [56, { tipo: 'lider', id: 7 }], // Diego Ferraz
  // Gustavo (id=8) recebe Marcio
  [9, { tipo: 'lider', id: 8 }], // Marcio Fernandes
  // Marcio Fernandes (id=9) recebe Logistica
  [38, { tipo: 'lider', id: 9 }], // Renato Silva
  [39, { tipo: 'lider', id: 9 }], // Daniel Moraes
  [40, { tipo: 'lider', id: 9 }], // Everton Lima
  [41, { tipo: 'lider', id: 9 }], // Adriano Souza
  [42, { tipo: 'lider', id: 9 }], // Jonas Rocha
  [54, { tipo: 'lider', id: 9 }], // Wanderson Alves
  [62, { tipo: 'lider', id: 9 }], // Vinicius Nogueira
  // Bianca (id=10) recebe Comercial
  [11, { tipo: 'lider', id: 10 }], // Thiago Costa
  [43, { tipo: 'lider', id: 10 }], // Leonardo Pires (ate promocao 2027-04-01)
  // Thiago (id=11) recebe Comercial junior
  [44, { tipo: 'lider', id: 11 }], // Fabio Henrique
  [45, { tipo: 'lider', id: 11 }], // Pedro Augusto
  [59, { tipo: 'lider', id: 11 }], // Beatriz Nogueira (ate promocao Leonardo 2027-04-01)
  // Renata (id=12) recebe RH
  [46, { tipo: 'lider', id: 12 }], // Marina Lopes
  [47, { tipo: 'lider', id: 12 }], // Tatiane Freitas (ate promocao Marina 2027-07-01)
]);

/**
 * Deriva as 68 linhas canonicas bit-exact de employeeLeaderHistory.
 * @returns array congelado de exatamente 68 registros.
 */
export function deriveNativaEmployeeLeaderHistory(): readonly DerivedEmployeeLeaderHistory[] {
  const rows: DerivedEmployeeLeaderHistory[] = [];

  const REASON_INICIAL =
    'Atribuicao inicial no cadastro do colaborador. Vinculo canonico bit-exact ' +
    'conforme organograma inicial da fixture demo Nativa Alimentos Ltda. ' +
    'Origem: MD Nativa §4.3 v1.1.';
  const REASON_PROMOCAO_MARINA =
    'Transferencia por promocao canonica bit-exact de Marina Lopes (id=46) a ' +
    'Coordenadora Adjunta de RH em 2027-07-01. Nova vinculo canonico: Tatiane ' +
    'Freitas (id=47) reporta agora a Marina, antes reportava a Renata Lima ' +
    '(id=12). Fonte: MD Nativa §4.2 Arco A v1.1.';
  const REASON_PROMOCAO_LEONARDO =
    'Transferencia por promocao canonica bit-exact de Leonardo Pires (id=43) a ' +
    'Supervisor Comercial em 2027-04-01. Nova vinculo canonico: Beatriz Nogueira ' +
    '(id=59) reporta agora a Leonardo, antes reportava a Thiago Costa (id=11). ' +
    'Fonte: MD Nativa §4.2 Arco B v1.1.';

  // 66 linhas iniciais — uma por employee no cadastro dele.
  for (const emp of NATIVA_EMPLOYEES) {
    const vinculo = VINCULO_INICIAL.get(emp.id);
    if (vinculo === undefined) {
      throw new Error(
        `deriveNativaEmployeeLeaderHistory: employee id=${emp.id} ` +
          `(${emp.nomeCompleto}) sem vinculo inicial no mapping canonico`,
      );
    }

    // Fechamento da linha original apenas para Tatiane (47) e Beatriz (59),
    // que sao transferidas nas promocoes.
    let dataFim: string | null = null;
    if (emp.id === 47) {
      dataFim = '2027-06-30'; // pre-promocao Marina (2027-07-01)
    } else if (emp.id === 59) {
      dataFim = '2027-03-31'; // pre-promocao Leonardo (2027-04-01)
    }

    rows.push({
      employeeId: emp.id,
      liderId: vinculo.tipo === 'lider' ? vinculo.id : null,
      clevelId: vinculo.tipo === 'clevel' ? vinculo.id : null,
      dataInicio: emp.dataAdmissao,
      dataFim,
      reason: REASON_INICIAL,
      transferBatchId: randomUUID(),
      createdAt: new Date(emp.dataAdmissao + 'T00:00:00.000Z'),
    });
  }

  // +2 linhas por transferencia via promocao — mesmo batch por promocao.
  const batchMarina = randomUUID();
  rows.push({
    employeeId: 47, // Tatiane Freitas
    liderId: 46, // Marina Lopes (promovida)
    clevelId: null,
    dataInicio: '2027-07-01',
    dataFim: null,
    reason: REASON_PROMOCAO_MARINA,
    transferBatchId: batchMarina,
    createdAt: new Date('2027-07-01T00:00:00.000Z'),
  });

  const batchLeonardo = randomUUID();
  rows.push({
    employeeId: 59, // Beatriz Nogueira
    liderId: 43, // Leonardo Pires (promovido)
    clevelId: null,
    dataInicio: '2027-04-01',
    dataFim: null,
    reason: REASON_PROMOCAO_LEONARDO,
    transferBatchId: batchLeonardo,
    createdAt: new Date('2027-04-01T00:00:00.000Z'),
  });

  return Object.freeze(rows);
}

/** Contagem canonica bit-exact esperada. */
export const NATIVA_EMPLOYEE_LEADER_HISTORY_COUNT = 68 as const;
