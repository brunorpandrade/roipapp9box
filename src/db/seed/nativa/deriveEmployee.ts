// ROIP APP 9BOX — derivacoes canonicas de campos ausentes no MD Nativa v1.1 (ME-068).
//
// O MD Nativa v1.1 fornece nome, cargo, familia, nivel, custoMensalReferencia,
// datas de admissao/inativacao dos 66 employees + 3 C-levels. O schema real
// (DOC 01 §4.5) exige campos adicionais que sao derivados canonicamente aqui:
// dataNascimento, cbo, descricaoCBO, senioridade, isRH, isLider, departamento.
//
// Todas as derivacoes sao determinasticas puramente a partir de (id, cargoCodigo,
// nomeCompleto, dataAdmissao). RV-15: cada regra e explicita e auditavel.
//
// RV-13: consumido por src/db/seed/nativa/loadFixtures.ts + tests/unit/nativa/
// deriveEmployee.test.ts.

import type { NativaCargoCodigo, NativaEmployeeRow } from './constants';

/**
 * Retorna o `departamento` canonico (enum de 19 valores DOC 01 §15.1) a partir
 * do codigo de departamento interno usado no MD Nativa §4 (DIR/FIN/ADM/QUA/
 * PRO/LOG/COM/RH).
 *
 * O codigo interno esta implicito no cargo — cada `cargoCodigo` mapeia para um
 * departamento canonico. Este map e a fonte unica bit-exact do mapeamento.
 */
export function deriveDepartamento(cargoCodigo: NativaCargoCodigo, nomeCompleto: string): string {
  // Casos especificos por cargo (o cargo determina o departamento canonico).
  // Excecao unica: lider_f6 (Familia 6) — 9 lideres distribuidos por
  // departamento; mapping por nome explicito.
  if (cargoCodigo === 'lider_f6') {
    const liderPorNome: Record<string, string> = {
      'Juliana Freitas': 'Financeiro',
      'Fernando Salles': 'Produção',
      'Camila Batista': 'Produção',
      'Marcelo Vieira': 'Qualidade',
      'Gustavo Almeida': 'Logística',
      'Márcio Fernandes': 'Logística',
      'Bianca Martins': 'Comercial',
      'Thiago Costa': 'Comercial',
      'Renata Lima': 'Recursos Humanos',
    };
    const dep = liderPorNome[nomeCompleto];
    if (dep === undefined) {
      throw new Error(`deriveDepartamento: lider_f6 sem mapping para nome='${nomeCompleto}'`);
    }
    return dep;
  }

  const mapaCargoParaDep: Record<Exclude<NativaCargoCodigo, 'lider_f6'>, string> = {
    op_senior: 'Produção',
    op_pleno: 'Produção',
    op_junior: 'Produção',
    aux_pleno: 'Produção',
    aux_junior: 'Produção',
    aux_qual_jr: 'Qualidade',
    anl_fin_p: 'Financeiro',
    asst_fin_j: 'Financeiro',
    aux_adm_p: 'Administrativo',
    aux_adm_j: 'Administrativo',
    anl_rh_p: 'Recursos Humanos',
    asst_rh_j: 'Recursos Humanos',
    apoio_sr: 'Administrativo',
    apoio_p: 'Administrativo',
    apoio_j: 'Administrativo',
    conf_p: 'Logística',
    conf_j: 'Logística',
    aux_exp_j: 'Logística',
    exec_p: 'Comercial',
    exec_j: 'Comercial',
    anl_qual_p: 'Qualidade',
  };

  const dep = mapaCargoParaDep[cargoCodigo as Exclude<NativaCargoCodigo, 'lider_f6'>];
  if (dep === undefined) {
    throw new Error(`deriveDepartamento: cargoCodigo desconhecido='${cargoCodigo}'`);
  }
  return dep;
}

/**
 * Retorna a `jobFamily` canonica (enum DOC 01 §15.3 — 6 valores) a partir do
 * codigo interno de cargo. Fixa por cargo.
 */
export function deriveJobFamily(cargoCodigo: NativaCargoCodigo): string {
  if (cargoCodigo === 'lider_f6') return 'lideranca_gestao';
  if (cargoCodigo === 'anl_qual_p' || cargoCodigo === 'aux_qual_jr') {
    return 'tecnico_especialista';
  }
  if (cargoCodigo === 'exec_p' || cargoCodigo === 'exec_j') {
    return 'vendas_comercial';
  }
  if (
    cargoCodigo === 'op_senior' ||
    cargoCodigo === 'op_pleno' ||
    cargoCodigo === 'op_junior' ||
    cargoCodigo === 'aux_pleno' ||
    cargoCodigo === 'aux_junior'
  ) {
    return 'producao_operacoes';
  }
  // Demais: administrativo_suporte (analistas fin/rh, aux adm, apoio, conferentes, exp)
  return 'administrativo_suporte';
}

/**
 * Retorna a `senioridade` canonica (enum DOC 01 §15.3 — junior/pleno/senior) a
 * partir do sufixo do codigo interno de cargo.
 */
export function deriveSenioridade(cargoCodigo: NativaCargoCodigo): 'junior' | 'pleno' | 'senior' {
  const c = cargoCodigo;
  if (c.endsWith('_senior') || c === 'apoio_sr') return 'senior';
  if (c.endsWith('_junior') || c.endsWith('_j') || c.endsWith('_jr')) return 'junior';
  // op_pleno, aux_pleno, anl_fin_p, aux_adm_p, anl_rh_p, apoio_p, conf_p,
  // exec_p, anl_qual_p, lider_f6 (default pleno canonico para lideres F6)
  return 'pleno';
}

/**
 * Retorna o `nivelHierarquico` canonico a partir do codigo de cargo interno.
 * lider_f6 → tatico; demais → operacional (o motor eixo X so aplica capacidadeOciosa
 * a nao-F6, confirmando canonicamente esta binaria).
 */
export function deriveNivelHierarquico(
  cargoCodigo: NativaCargoCodigo,
): 'operacional' | 'tatico' | 'estrategico' {
  if (cargoCodigo === 'lider_f6') return 'tatico';
  return 'operacional';
}

/**
 * Retorna `isRH` canonico. RH puros: Renata Lima (Coordenadora), Marina Lopes
 * (Analista), Tatiane Freitas (Assistente). Coordenadora tambem e lider_f6.
 */
export function deriveIsRH(nomeCompleto: string): boolean {
  return (
    nomeCompleto === 'Renata Lima' ||
    nomeCompleto === 'Marina Lopes' ||
    nomeCompleto === 'Tatiane Freitas'
  );
}

/**
 * Retorna `isLider` canonico. Verdadeiro para todos os 9 lider_f6.
 */
export function deriveIsLider(cargoCodigo: NativaCargoCodigo): boolean {
  return cargoCodigo === 'lider_f6';
}

/**
 * Retorna `dataNascimento` canonica derivada deterministicamente do `id`.
 * Regra canonica bit-exact: idade na admissao = 26 + (id % 22), portanto entre
 * 26 e 47 anos. dataNascimento = dataAdmissao − (idade em anos).
 *
 * Racional: idade coerente com carreira; determinismo garante que reexecucao
 * do seed produz o mesmo valor.
 */
export function deriveDataNascimento(id: number, dataAdmissao: string): string {
  const idadeAnos = 26 + (id % 22);
  const partes = dataAdmissao.split('-').map((s) => parseInt(s, 10));
  if (partes.length !== 3 || partes.some((n) => Number.isNaN(n))) {
    throw new Error(`deriveDataNascimento: dataAdmissao invalida='${dataAdmissao}'`);
  }
  const ano = partes[0]!;
  const mes = partes[1]!;
  const dia = partes[2]!;
  // Evita edge case de 29/02 em ano bissexto: se admissao == 29/02, usa 28/02.
  const diaNasc = mes === 2 && dia === 29 ? 28 : dia;
  const anoNasc = ano - idadeAnos;
  const mmS = String(mes).padStart(2, '0');
  const ddS = String(diaNasc).padStart(2, '0');
  return `${anoNasc}-${mmS}-${ddS}`;
}

/**
 * Retorna `(cbo, descricaoCBO)` canonicos por codigo de cargo interno.
 * CBOs referem-se a Classificacao Brasileira de Ocupacoes.
 */
export function deriveCbo(cargoCodigo: NativaCargoCodigo): { cbo: string; descricaoCBO: string } {
  const mapa: Record<NativaCargoCodigo, { cbo: string; descricaoCBO: string }> = {
    op_senior: {
      cbo: '8425-15',
      descricaoCBO: 'Operador de máquinas de produção alimentícia (sênior)',
    },
    op_pleno: {
      cbo: '8425-15',
      descricaoCBO: 'Operador de máquinas de produção alimentícia (pleno)',
    },
    op_junior: {
      cbo: '8425-15',
      descricaoCBO: 'Operador de máquinas de produção alimentícia (júnior)',
    },
    aux_pleno: { cbo: '8425-25', descricaoCBO: 'Auxiliar de produção alimentícia (pleno)' },
    aux_junior: { cbo: '8425-25', descricaoCBO: 'Auxiliar de produção alimentícia (júnior)' },
    aux_qual_jr: { cbo: '3221-10', descricaoCBO: 'Auxiliar de controle de qualidade' },
    anl_fin_p: { cbo: '2522-10', descricaoCBO: 'Analista financeiro (pleno)' },
    asst_fin_j: { cbo: '4132-15', descricaoCBO: 'Assistente financeiro (júnior)' },
    aux_adm_p: { cbo: '4110-05', descricaoCBO: 'Auxiliar administrativo (pleno)' },
    aux_adm_j: { cbo: '4110-05', descricaoCBO: 'Auxiliar administrativo (júnior)' },
    anl_rh_p: { cbo: '2524-05', descricaoCBO: 'Analista de recursos humanos (pleno)' },
    asst_rh_j: { cbo: '4211-25', descricaoCBO: 'Assistente de recursos humanos (júnior)' },
    apoio_sr: { cbo: '4110-15', descricaoCBO: 'Apoio administrativo geral (sênior)' },
    apoio_p: { cbo: '4110-15', descricaoCBO: 'Apoio administrativo geral (pleno)' },
    apoio_j: { cbo: '4110-15', descricaoCBO: 'Apoio administrativo geral (júnior)' },
    conf_p: { cbo: '4141-05', descricaoCBO: 'Conferente de logística (pleno)' },
    conf_j: { cbo: '4141-05', descricaoCBO: 'Conferente de logística (júnior)' },
    aux_exp_j: { cbo: '4141-15', descricaoCBO: 'Auxiliar de expedição (júnior)' },
    exec_p: { cbo: '3541-30', descricaoCBO: 'Executivo comercial (pleno)' },
    exec_j: { cbo: '3541-30', descricaoCBO: 'Executivo comercial (júnior)' },
    anl_qual_p: { cbo: '2523-05', descricaoCBO: 'Analista de qualidade (pleno)' },
    lider_f6: { cbo: '1421-05', descricaoCBO: 'Líder de área — Família 6 (liderança e gestão)' },
  };
  return mapa[cargoCodigo];
}

/**
 * Retorna o email canonico do employee no dominio nativa.com.br.
 * Formato: primeiro_nome.primeiro_sobrenome@nativa.com.br (normalizado sem
 * acentos e em lowercase).
 */
export function deriveEmail(nomeCompleto: string): string {
  const partes = nomeCompleto.split(' ');
  const primeiro = normalizar(partes[0]!);
  const ultimo = normalizar(partes[partes.length - 1]!);
  return `${primeiro}.${ultimo}@nativa.com.br`;
}

/**
 * Retorna o CPF sintetico canonico do employee. Regra: '1' + id em 8 digitos.
 * Ex: id=4 → '100000004'. Faixa aprovada em ME-067 S362 Opcao CPF-A. Sao 11
 * digitos com V1V2 calculados por Receita Federal modulo 11.
 */
export function deriveCpf(id: number): string {
  // Formata '1' + id (7 zeros a esquerda para totalizar 8 digitos apos '1') = 9 digitos base
  const base = '1' + String(id).padStart(8, '0'); // 9 digitos
  const digito1 = calcularDigitoV1(base);
  const digito2 = calcularDigitoV2(base + digito1);
  return base + String(digito1) + String(digito2);
}

function calcularDigitoV1(base: string): number {
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(base[i]!, 10) * (10 - i);
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function calcularDigitoV2(baseComV1: string): number {
  let soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(baseComV1[i]!, 10) * (11 - i);
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/**
 * Estrutura final de um employee derivado — pronta para INSERT em employees.
 */
export interface DerivedEmployee {
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
  readonly jobFamily: string;
  readonly senioridade: 'junior' | 'pleno' | 'senior';
  readonly nivelHierarquico: 'operacional' | 'tatico' | 'estrategico';
  readonly departamento: string;
  readonly status: 'ativo' | 'inativo';
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly onboardingEstagio: 'treinar' | 'em_treinamento' | 'treinado' | 'reciclagem';
  readonly passwordSet: boolean;
  readonly passwordHash: string | null;
  readonly createdAt: Date;
}

/**
 * Consolida um employee canonico bit-exact para INSERT. `status` reflete o
 * snapshot final (2027-12-31): se inativacao ocorreu, status='inativo'.
 * `isResponsavelFinanceiro` = true para Juliana Freitas (id=4) — canonizada
 * como RF titular apos transferencia 2027-01-15.
 * `passwordHash` fica null aqui — o caller (loadFixtures) preenche com bcrypt
 * runtime para os 14 acessos habilitados (14 identidades + os 3 C-levels).
 */
export function deriveEmployeeRow(emp: NativaEmployeeRow, companyId: number): DerivedEmployee {
  const inativado = emp.dataInativacao !== null;
  const isLider = deriveIsLider(emp.cargoCodigo);
  const isRH = deriveIsRH(emp.nomeCompleto);
  const cbo = deriveCbo(emp.cargoCodigo);
  const isRFTitular = emp.nomeCompleto === 'Juliana Freitas';

  return {
    id: emp.id,
    companyId,
    name: emp.nomeCompleto,
    cpf: deriveCpf(emp.id),
    email: deriveEmail(emp.nomeCompleto),
    photoUrl: null,
    dataNascimento: deriveDataNascimento(emp.id, emp.dataAdmissao),
    dataAdmissao: emp.dataAdmissao,
    cbo: cbo.cbo,
    descricaoCBO: cbo.descricaoCBO,
    jobFamily: deriveJobFamily(emp.cargoCodigo),
    senioridade: deriveSenioridade(emp.cargoCodigo),
    nivelHierarquico: deriveNivelHierarquico(emp.cargoCodigo),
    departamento: deriveDepartamento(emp.cargoCodigo, emp.nomeCompleto),
    status: inativado ? 'inativo' : 'ativo',
    isRH,
    isLider,
    isResponsavelFinanceiro: isRFTitular,
    onboardingEstagio: isLider ? 'treinado' : 'treinar',
    passwordSet: false,
    passwordHash: null,
    // Timestamp historico: data de admissao 00:00 UTC (canoniza historico
    // coerente conforme D1 aprovado).
    createdAt: new Date(emp.dataAdmissao + 'T00:00:00.000Z'),
  };
}
