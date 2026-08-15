// ROIP APP 9BOX — derivacao canonica bit-exact de employeeLeaderHistory
// da Bebidas Ubatuba (ME-080e Dispatch 1).
//
// Estrategia canonica: consome deriveNativaEmployeeLeaderHistory() como
// fonte da verdade e aplica tres transformacoes puras sobre cada row:
//   1. employeeId += UBATUBA_EMPLOYEE_ID_SHIFT (=1000, D5.9).
//   2. liderId    += UBATUBA_EMPLOYEE_ID_SHIFT (=1000, D5.9) quando nao-null.
//   3. clevelId   += UBATUBA_CLEVEL_ID_SHIFT   (=1000, D5.9) quando nao-null.
//   4. transferBatchId: RECRIADO deterministicamente via UUID v5 seedado
//      por indice canonico. Nativa usa randomUUID() (nao-determinista);
//      Ubatuba redefine bit-exact aqui.
//   5. dataInicio, dataFim, reason, createdAt: preservados bit-exact
//      da fixture Nativa (mesma linha do tempo canonica MD Nativa §4.3).
//
// Justificativa canonica do reuso: VINCULO_INICIAL e regras de fechamento
// dataFim (Tatiane 2027-06-30, Beatriz 2027-03-31) sao invariantes
// estruturais da fixture Nativa. Como Ubatuba e clone estrutural bit-exact
// (mesmos nomes, cargos, admissoes, promocoes — §6.90 ME-080b), o mesmo
// organograma se aplica com IDs deslocados. Duplicar VINCULO_INICIAL
// aqui abriria drift silencioso; reusar a fonte Nativa preserva
// bit-exact indefinidamente.
//
// Total canonico bit-exact: 68 rows (66 iniciais + 2 pos-promocao).
//   - 2 rows com dataFim NOT NULL: Tatiane (employeeId=1047, dataFim=
//     2027-06-30) + Beatriz (employeeId=1059, dataFim=2027-03-31).
//   - 66 rows com dataFim NULL:
//       * 13 employees inativos (regra §4.6: inativacao nao fecha vinculo).
//       * 53 employees ativos (51 originais nao promovidas + 2 novas
//         pos-promocao) — bate MD §18.4 v1.1.
//
// Faixa de IDs esperada:
//   - employeeId: 1004..1069 (66 iniciais) + reuso 1047 e 1059 nas 2
//     promocoes → conjunto de 66 valores distintos, 2 aparecem 2×.
//   - liderId (quando nao-null): valores em {1004..1012} (lideres) +
//     {1043, 1046} (novos lideres pos-promocao).
//   - clevelId (quando nao-null): valores em {1002, 1003} (nunca 1001).
//
// D1.1 (aprovado): variant isolada Ubatuba, nao parametriza Nativa.
// D1.2 (aprovado): UUID v5 determinista via SHA-1(namespace + name)
//   truncado + bits de versao (0x50) e variante (0x80) conforme RFC 4122
//   §4.3. Namespace canonico: UBATUBA_ELH_UUID_NAMESPACE_SEED. Name
//   canonico por row: "elh:{indexRow}" com indexRow=0..67.
// D1.3 (aprovado): 68 rows bit-exact.
//
// RV-12: 100% Drizzle-ready via consumidor loadFixtures.
// RV-13: consumido por src/db/seed/ubatuba/seedUbatubaOperacionalD1.ts +
//   tests/unit/ubatuba/deriveEmployeeLeaderHistory.test.ts.
// RV-14: um statement por linha, largura <= 100 colunas.
// RV-15: contagem 68 medida e exportada como constante canonica.

import { createHash } from 'node:crypto';

import {
  deriveNativaEmployeeLeaderHistory,
  type DerivedEmployeeLeaderHistory,
  NATIVA_EMPLOYEE_LEADER_HISTORY_COUNT,
} from '../nativa/deriveEmployeeLeaderHistory';

import {
  UBATUBA_CLEVEL_ID_SHIFT,
  UBATUBA_ELH_UUID_NAMESPACE_SEED,
  UBATUBA_EMPLOYEE_ID_SHIFT,
} from './constants';

/**
 * Estrutura canonica bit-exact para INSERT em employeeLeaderHistory da
 * Ubatuba. Mesmo shape do DerivedEmployeeLeaderHistory Nativa — apenas
 * IDs deslocados e transferBatchId recriado deterministicamente.
 *
 * Alias curto (`DerivedElhRow`) usado internamente para caber em 100
 * colunas nas assinaturas de retorno; export publico preserva o nome
 * canonico verboso.
 */
export type DerivedUbatubaEmployeeLeaderHistory = DerivedEmployeeLeaderHistory;
type DerivedElhRow = DerivedUbatubaEmployeeLeaderHistory;

/**
 * Gera um UUID v5 determinista via SHA-1(namespaceSeed || name),
 * marcando bits de versao (0x50) e variante RFC (0x80) conforme
 * RFC 4122 §4.3. Bit-exact para mesma dupla (namespaceSeed, name).
 *
 * Nao usa a biblioteca `uuid` (deprecada uuid@8) — implementacao
 * autocontida via node:crypto para zero dependencia adicional.
 *
 * @param namespaceSeed string canonica de namespace (ex.: UBATUBA_ELH_UUID_NAMESPACE_SEED).
 * @param name string canonica identificando o item dentro do namespace.
 * @returns UUID no formato 8-4-4-4-12.
 */
export function derivarUuidV5Deterministico(namespaceSeed: string, name: string): string {
  const namespaceHash = createHash('sha1').update(namespaceSeed).digest();
  const namespaceBytes = namespaceHash.subarray(0, 16);
  const combined = Buffer.concat([namespaceBytes, Buffer.from(name, 'utf8')]);
  const hashed = createHash('sha1').update(combined).digest();
  const bytes = Buffer.from(hashed.subarray(0, 16));
  const b6 = bytes[6];
  const b8 = bytes[8];
  if (b6 === undefined || b8 === undefined) {
    throw new Error('derivarUuidV5Deterministico: SHA-1 produziu buffer < 16 bytes.');
  }
  bytes[6] = (b6 & 0x0f) | 0x50;
  bytes[8] = (b8 & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  const seg1 = hex.slice(0, 8);
  const seg2 = hex.slice(8, 12);
  const seg3 = hex.slice(12, 16);
  const seg4 = hex.slice(16, 20);
  const seg5 = hex.slice(20, 32);
  return `${seg1}-${seg2}-${seg3}-${seg4}-${seg5}`;
}

/**
 * Deriva os 68 employeeLeaderHistory canonicos bit-exact da Bebidas
 * Ubatuba (companies.id=2). Consome a fonte canonica Nativa e aplica
 * shift em IDs + UUID v5 determinista em transferBatchId.
 *
 * @returns array congelado de exatamente 68 registros, ordem preservada
 *   da fonte Nativa (66 iniciais na ordem NATIVA_EMPLOYEES + 2
 *   promocoes na ordem Marina, Leonardo).
 */
export function deriveUbatubaEmployeeLeaderHistory(): readonly DerivedElhRow[] {
  const nativaRows = deriveNativaEmployeeLeaderHistory();
  const ubatubaRows: DerivedElhRow[] = nativaRows.map((row, indexRow) => ({
    employeeId: row.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT,
    liderId: row.liderId === null ? null : row.liderId + UBATUBA_EMPLOYEE_ID_SHIFT,
    clevelId: row.clevelId === null ? null : row.clevelId + UBATUBA_CLEVEL_ID_SHIFT,
    dataInicio: row.dataInicio,
    dataFim: row.dataFim,
    reason: row.reason,
    transferBatchId: derivarUuidV5Deterministico(
      UBATUBA_ELH_UUID_NAMESPACE_SEED,
      `elh:${indexRow}`,
    ),
    createdAt: row.createdAt,
  }));
  return Object.freeze(ubatubaRows);
}

/**
 * Contagem canonica bit-exact esperada em Ubatuba (mesma da Nativa —
 * espelho estrutural declarado em §6.90 ME-080b).
 */
export const UBATUBA_EMPLOYEE_LEADER_HISTORY_TOTAL_ESPERADO = NATIVA_EMPLOYEE_LEADER_HISTORY_COUNT;
