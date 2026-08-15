// ROIP APP 9BOX — derivacao canonica dos 66 employees da Bebidas Ubatuba
// (ME-080b Dispatch 5).
//
// Clone estrutural dos 66 employees da Nativa Alimentos: mesmos nomes,
// cargos, familias, senioridades, departamentos, datas de admissao/nascimento
// e todas as flags derivadas (isRH, isLider, isResponsavelFinanceiro,
// onboardingEstagio). Alteracoes canonicas isoladas:
//   - `id`: shift +NATIVA_EMPLOYEE_COUNT (4..69 -> 70..135).
//   - `companyId`: UBATUBA_COMPANY_ID.
//   - `cpf`: derivado por generateUniqueCpfs (seed dedicada, faixa "1xx").
//   - `email`: derivado do email da fixture Nativa (quando presente) com
//     substituicao de dominio; ou derivado do nome se ausente (regra
//     canonica: `primeiro.ultimo@bebidasubatuba.com.br` normalizado).
//   - `matricula`: gerada deterministicamente via matriculaGenerator (seed
//     dedicada); unica por companyId.
//   - `passwordHash`: bcrypt de senha inicial deterministica via
//     passwordGenerator, aplicada APENAS a acessos (isLider || isRH ||
//     isResponsavelFinanceiro); demais recebem passwordHash=null.
//   - `passwordSet`: false para todos os acessos (gate de primeiro acesso
//     do Dispatch 3 obriga troca antes de qualquer navegacao).
//
// A senha em plain text NAO e retornada por esta funcao — ela e persistida
// apenas como hash. Se um dia a UI de reset+reseed exigir exibicao das
// senhas iniciais, este derivador exporta uma variante que devolve o par
// { row, plainPassword }; nao e necessario no Dispatch 5 (rodagem via CLI
// standalone).
//
// RV-13: consumido por `src/db/seed/ubatuba/loadUbatubaFixtures.ts` +
// `tests/unit/ubatuba/deriveUbatubaEmployees.test.ts`.

import type {
  Departamento,
  JobFamily,
  NivelHierarquico,
  OnboardingEstagio,
} from '../../schema/enums';

import { createCpfPrng, generateUniqueCpfs } from '../../../lib/auth/cpfGenerator';
import {
  createMatriculaPrng,
  generateUniqueMatriculas,
} from '../../../lib/auth/matriculaGenerator';
import { createPasswordPrng, generateInitialPasswords } from '../../../lib/auth/passwordGenerator';
import { deriveEmployeeRow } from '../nativa/deriveEmployee';
import { NATIVA_EMPLOYEES, type NativaEmployeeRow } from '../nativa/constants';
import {
  UBATUBA_COMPANY_ID,
  UBATUBA_CPF_SEED,
  UBATUBA_EMAIL_DOMAIN,
  UBATUBA_EMPLOYEE_ID_SHIFT,
  UBATUBA_MATRICULA_SEED,
  UBATUBA_PASSWORD_SEED,
} from './constants';

/**
 * Offset canonico da seed de CPF para employees (isolamento vs C-levels).
 * C-levels usam UBATUBA_CPF_SEED (3 CPFs); employees usam +1000 para nunca
 * compartilhar sequencia. Escolha de 1000 e arbitraria mas larga o suficiente
 * para futuras extensoes (ate 1000 CPFs adicionais de C-level sem colisao).
 */
export const UBATUBA_EMPLOYEE_CPF_SEED_OFFSET = 1000;

/**
 * Estrutura canonica de um employee Ubatuba derivado (row-ready).
 * Espelha o INSERT canonico do loadFixtures Nativa (linhas 258-284 do
 * `src/db/seed/nativa/loadFixtures.ts`): campo `cargo` NAO e passado porque
 * o schema tem `.default('')` e a convencao canonica preserva esse default.
 * Ubatuba adiciona `matricula` (populada obrigatoria por Dispatch 1).
 */
export interface DerivedUbatubaEmployeeRow {
  readonly id: number;
  readonly companyId: number;
  readonly name: string;
  readonly cpf: string;
  readonly email: string;
  readonly photoUrl: null;
  readonly dataNascimento: string;
  readonly dataAdmissao: string;
  readonly cbo: string;
  readonly descricaoCBO: string;
  readonly jobFamily: JobFamily;
  readonly senioridade: 'junior' | 'pleno' | 'senior';
  readonly nivelHierarquico: NivelHierarquico;
  readonly departamento: Departamento;
  readonly status: 'ativo' | 'inativo';
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly onboardingEstagio: OnboardingEstagio;
  readonly passwordHash: string | null;
  readonly passwordSet: boolean;
  readonly matricula: string;
  readonly createdAt: Date;
}

/**
 * Contrato canonico do hasher bcrypt. Passado por injecao para permitir teste
 * unit com hasher stub (rapido, deterministico) sem executar bcrypt real.
 */
export type PasswordHasher = (plain: string) => Promise<string>;

/**
 * Normaliza um nome pessoal em prefixo de email canonico:
 * "Juliana Freitas" -> "juliana.freitas"; "Marcos Silva Junior" -> "marcos.silva.junior".
 * Remove acentos, normaliza para minusculas, substitui espacos por ponto.
 *
 * @param nomeCompleto nome canonico da fixture Nativa.
 * @returns prefixo canonico do email (parte antes do '@').
 */
function derivarPrefixoEmail(nomeCompleto: string): string {
  return nomeCompleto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacriticos
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .join('.');
}

/**
 * Deriva o email canonico Ubatuba a partir do nome do employee.
 *
 * Regra: 'primeiro.demais@bebidasubatuba.com.br' (sem acentos, minusculo).
 * Nao consulta o email da fixture Nativa — a fixture Nativa preenche email
 * apenas para os 14 acessos e null para os demais 52. Na Ubatuba, ao contrario,
 * TODOS os employees recebem email derivado do nome (S515 exige email para
 * qualquer employee com papel isLider/isRH/isResponsavelFinanceiro, e o
 * schema aceita email em qualquer employee — derivar para todos e canonico
 * e simplifica derivadores futuros que possam precisar de email).
 *
 * @param nomeCompleto nome canonico da fixture Nativa.
 * @returns email canonico Ubatuba.
 */
export function derivarEmailUbatuba(nomeCompleto: string): string {
  return `${derivarPrefixoEmail(nomeCompleto)}@${UBATUBA_EMAIL_DOMAIN}`;
}

/**
 * Deriva os 66 employees canonicos da Bebidas Ubatuba a partir dos 66 da
 * Nativa Alimentos. Ordem preservada. CPFs, matriculas e senhas
 * deterministicos via seeds canonicas separadas (T3 + D5.5).
 *
 * @param opts.hashPassword hasher bcrypt (real ou stub); permite injecao para
 *                          testes rapidos sem custo bcrypt.
 * @param opts.cpfPrngSeed  semente do PRNG de CPFs. Default: seed dedicada de
 *                          employees (UBATUBA_CPF_SEED + offset).
 * @param opts.matriculaPrngSeed semente do PRNG de matriculas.
 * @param opts.passwordPrngSeed  semente do PRNG de senhas iniciais.
 * @returns array com 66 employees canonicos Ubatuba prontos para INSERT.
 */
export async function deriveUbatubaEmployees(opts: {
  hashPassword: PasswordHasher;
  cpfPrngSeed?: number;
  matriculaPrngSeed?: number;
  passwordPrngSeed?: number;
}): Promise<DerivedUbatubaEmployeeRow[]> {
  const cpfSeed = opts.cpfPrngSeed ?? UBATUBA_CPF_SEED + UBATUBA_EMPLOYEE_CPF_SEED_OFFSET;
  const matriculaSeed = opts.matriculaPrngSeed ?? UBATUBA_MATRICULA_SEED;
  const passwordSeed = opts.passwordPrngSeed ?? UBATUBA_PASSWORD_SEED;

  const cpfPrng = createCpfPrng(cpfSeed);
  const matriculaPrng = createMatriculaPrng(matriculaSeed);
  const passwordPrng = createPasswordPrng(passwordSeed);

  const cpfs = generateUniqueCpfs(NATIVA_EMPLOYEES.length, cpfPrng);
  const matriculas = generateUniqueMatriculas(NATIVA_EMPLOYEES.length, matriculaPrng);
  // Uma senha por employee (mesmo os sem acesso — descarta as nao-usadas para
  // manter contagem determinista da sequencia PRNG).
  const senhasCandidatas = generateInitialPasswords(NATIVA_EMPLOYEES.length, passwordPrng);

  // Deriva PRIMEIRO todas as flags via deriveEmployeeRow (para saber quem tem
  // acesso), depois aplica hash SOMENTE para os que tem acesso. Assim, mudar
  // NATIVA_EMPLOYEES nao desloca hashes dos que continuam com acesso.
  const derivedRows: DerivedUbatubaEmployeeRow[] = [];
  for (let index = 0; index < NATIVA_EMPLOYEES.length; index++) {
    const emp = NATIVA_EMPLOYEES[index] as NativaEmployeeRow;
    const derived = deriveEmployeeRow(emp, UBATUBA_COMPANY_ID);

    const isAcessoHabilitado = derived.isLider || derived.isRH || derived.isResponsavelFinanceiro;
    const senhaPlain = senhasCandidatas[index];
    if (senhaPlain === undefined) {
      throw new Error(`deriveUbatubaEmployees: senha ausente no index ${index}.`);
    }
    const passwordHash: string | null = isAcessoHabilitado
      ? await opts.hashPassword(senhaPlain)
      : null;

    const cpfDerivado = cpfs[index];
    const matriculaDerivada = matriculas[index];
    if (cpfDerivado === undefined || matriculaDerivada === undefined) {
      throw new Error(`deriveUbatubaEmployees: cpf/matricula ausente no index ${index}.`);
    }

    derivedRows.push({
      id: derived.id + UBATUBA_EMPLOYEE_ID_SHIFT,
      companyId: UBATUBA_COMPANY_ID,
      name: derived.name,
      cpf: cpfDerivado,
      email: derivarEmailUbatuba(emp.nomeCompleto),
      photoUrl: null,
      dataNascimento: derived.dataNascimento,
      dataAdmissao: derived.dataAdmissao,
      cbo: derived.cbo,
      descricaoCBO: derived.descricaoCBO,
      jobFamily: derived.jobFamily as JobFamily,
      senioridade: derived.senioridade,
      nivelHierarquico: derived.nivelHierarquico as NivelHierarquico,
      departamento: derived.departamento as Departamento,
      status: derived.status,
      isRH: derived.isRH,
      isLider: derived.isLider,
      isResponsavelFinanceiro: derived.isResponsavelFinanceiro,
      onboardingEstagio: derived.onboardingEstagio as OnboardingEstagio,
      passwordHash,
      passwordSet: false,
      matricula: matriculaDerivada,
      createdAt: derived.createdAt,
    });
  }

  return derivedRows;
}
