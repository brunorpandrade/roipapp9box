// ROIP APP 9BOX — derivacao canonica dos 3 C-levels da Bebidas Ubatuba
// (ME-080b Dispatch 5).
//
// Clone estrutural dos 3 C-levels da Nativa Alimentos: mesmos nomes, cargos,
// descricoes, datas de nascimento/admissao, custoMensal, acessoTotal,
// isResponsavelFinanceiro. Alteracoes canonicas isoladas:
//   - `id`: shift +NATIVA_CLEVEL_COUNT (1,2,3 -> 4,5,6).
//   - `companyId`: UBATUBA_COMPANY_ID (2 em vez de 1).
//   - `cpf`: derivado por generateUniqueCpfs (faixa "1xx", deterministico).
//   - `email`: substituicao de dominio '@nativa.com.br' -> '@bebidasubatuba.com.br'.
//
// Ordem canonica preservada: mesma ordem dos indices em NATIVA_CLEVELS
// garante determinismo bit-exact entre reseeds.
//
// RV-13: consumido por `src/db/seed/ubatuba/loadUbatubaFixtures.ts` +
// `tests/unit/ubatuba/deriveUbatubaCLevels.test.ts`.

import { createCpfPrng, generateUniqueCpfs } from '../../../lib/auth/cpfGenerator';
import { NATIVA_CLEVELS, type NativaCLevelRow } from '../nativa/constants';
import {
  UBATUBA_CLEVEL_ID_SHIFT,
  UBATUBA_COMPANY_ID,
  UBATUBA_CPF_SEED,
  UBATUBA_EMAIL_DOMAIN,
} from './constants';

/** Estrutura canonica de um C-level Ubatuba derivado. */
export interface DerivedUbatubaCLevelRow {
  readonly id: number;
  readonly companyId: number;
  readonly nomeCompleto: string;
  readonly cpf: string;
  readonly email: string;
  readonly cargo: string;
  readonly descricaoCargo: string;
  readonly departamento: 'Diretoria';
  readonly acessoTotal: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly custoMensal: number;
  readonly dataAdmissao: '2014-03-15';
  readonly dataNascimento: string;
}

/**
 * Substitui o dominio do email do Nativa para o dominio canonico Ubatuba.
 * Preserva o prefixo (parte antes do '@'), que carrega a identidade da
 * pessoa (ex: 'eduardo.almeida').
 *
 * @param originalEmail email na fixture Nativa (formato user@nativa.com.br).
 * @returns email equivalente no dominio Ubatuba.
 */
function rewriteEmailDomain(originalEmail: string): string {
  const atIndex = originalEmail.indexOf('@');
  if (atIndex === -1) {
    throw new Error(`rewriteEmailDomain: email invalido (sem '@'): '${originalEmail}'`);
  }
  const localPart = originalEmail.slice(0, atIndex);
  return `${localPart}@${UBATUBA_EMAIL_DOMAIN}`;
}

/**
 * Deriva os 3 C-levels canonicos da Bebidas Ubatuba a partir dos 3 C-levels
 * da Nativa Alimentos. Ordem preservada. CPFs deterministicos via seed
 * canonica UBATUBA_CPF_SEED.
 *
 * NOTA: esta funcao consome parte do PRNG de CPF. Se `deriveUbatubaEmployees`
 * tambem consome, os dois DEVEM compartilhar o mesmo PRNG na mesma ordem
 * (C-levels primeiro, employees depois) para determinismo bit-exact do
 * loader — ou cada um cria seu proprio PRNG a partir de seeds distintas.
 * Optamos pela segunda: cada derivador chama `createCpfPrng` com uma seed
 * derivada (base + indice) para isolamento total. Ver o parametro
 * `cpfPrngSeed`.
 *
 * @param cpfPrngSeed semente do PRNG de CPFs (default: UBATUBA_CPF_SEED).
 *                    C-levels usam a seed base; employees usam base+1000.
 * @returns array com 3 C-levels canonicos Ubatuba, prontos para INSERT.
 */
export function deriveUbatubaCLevels(
  cpfPrngSeed: number = UBATUBA_CPF_SEED,
): DerivedUbatubaCLevelRow[] {
  const prng = createCpfPrng(cpfPrngSeed);
  const cpfs = generateUniqueCpfs(NATIVA_CLEVELS.length, prng);

  return NATIVA_CLEVELS.map((cl: NativaCLevelRow, index: number): DerivedUbatubaCLevelRow => {
    const shiftedId = cl.id + UBATUBA_CLEVEL_ID_SHIFT;
    const derivedCpf = cpfs[index];
    if (derivedCpf === undefined) {
      throw new Error(`deriveUbatubaCLevels: CPF ausente no index ${index}.`);
    }
    return {
      id: shiftedId,
      companyId: UBATUBA_COMPANY_ID,
      nomeCompleto: cl.nomeCompleto,
      cpf: derivedCpf,
      email: rewriteEmailDomain(cl.email),
      cargo: cl.cargo,
      descricaoCargo: cl.descricaoCargo,
      departamento: cl.departamento,
      acessoTotal: cl.acessoTotal,
      isResponsavelFinanceiro: cl.isResponsavelFinanceiro,
      custoMensal: cl.custoMensal,
      dataAdmissao: cl.dataAdmissao,
      dataNascimento: cl.dataNascimento,
    };
  });
}
