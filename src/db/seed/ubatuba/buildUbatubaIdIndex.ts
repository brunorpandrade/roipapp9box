// ROIP APP 9BOX — helper canonico para resolver `nome -> id Ubatuba`
// nos derivadores D4-final (instrumentos, IQL, NR-1 snapshots/responses).
//
// Estrategia canonica: os mappers Nativa (loadFixtures.ts) resolvem
// `nome` via idx.byName/cLevelByName. Ubatuba precisa do MESMO shape,
// mas com IDs ja shiftados (+1000). Este helper constroi um indice
// unico com IDs pos-shift, permitindo replicar os mappers Nativa com
// substituicao trivial de idx.
//
// RV-13: consumido por deriveUbatubaInstrument{A,C,D}, IQL, Copsoq
// snapshot/responses.
// RV-14: um statement por linha, largura <= 100 colunas.

import { NATIVA_CLEVELS, NATIVA_EMPLOYEES } from '../nativa/constants';

import { UBATUBA_CLEVEL_ID_SHIFT, UBATUBA_EMPLOYEE_ID_SHIFT } from './constants';

/**
 * Indice canonico bit-exact: nome (completo ou alias curto) -> id Ubatuba.
 * `byName` cobre employees; `cLevelByName` cobre C-levels. Alias curto =
 * primeiro + segundo nome (mesmo padrao buildIdIndex Nativa).
 */
export interface UbatubaIdIndex {
  readonly byName: ReadonlyMap<string, number>;
  readonly cLevelByName: ReadonlyMap<string, number>;
}

/**
 * Constroi o indice canonico Ubatuba a partir dos constants Nativa
 * (mesmos nomes, IDs shiftados).
 */
export function buildUbatubaIdIndex(): UbatubaIdIndex {
  const byName = new Map<string, number>();
  for (const emp of NATIVA_EMPLOYEES) {
    const ubatubaId = emp.id + UBATUBA_EMPLOYEE_ID_SHIFT;
    byName.set(emp.nomeCompleto, ubatubaId);
    const partes = emp.nomeCompleto.split(' ');
    if (partes.length >= 2) {
      const alias = `${partes[0]!} ${partes[1]!}`;
      if (!byName.has(alias)) {
        byName.set(alias, ubatubaId);
      }
    }
  }

  const cLevelByName = new Map<string, number>();
  for (const cl of NATIVA_CLEVELS) {
    const ubatubaId = cl.id + UBATUBA_CLEVEL_ID_SHIFT;
    cLevelByName.set(cl.nomeCompleto, ubatubaId);
    const partes = cl.nomeCompleto.split(' ');
    if (partes.length >= 2) {
      const alias = `${partes[0]!} ${partes[1]!}`;
      if (!cLevelByName.has(alias)) {
        cLevelByName.set(alias, ubatubaId);
      }
    }
  }

  return { byName, cLevelByName };
}

/** Resolve id de employee Ubatuba por nome. Throw se ausente. */
export function resolveEmployeeIdUbatuba(nome: string, idx: UbatubaIdIndex): number {
  const id = idx.byName.get(nome);
  if (id === undefined) {
    throw new Error(`resolveEmployeeIdUbatuba: nome nao encontrado='${nome}'`);
  }
  return id;
}

/** Resolve id de C-level Ubatuba por nome. Throw se ausente. */
export function resolveCLevelIdUbatuba(nome: string, idx: UbatubaIdIndex): number {
  const id = idx.cLevelByName.get(nome);
  if (id === undefined) {
    throw new Error(`resolveCLevelIdUbatuba: nome nao encontrado='${nome}'`);
  }
  return id;
}
