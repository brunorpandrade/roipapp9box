// ROIP APP 9BOX — constantes canonicas da fixture Nativa Alimentos Ltda. (ME-068).
//
// Fonte: extraidas literalmente do gerador Python S362 (`gerar_fase53_v5.py`
// e `gerar_fase55.py`) preservados no zip de proveniencia D077.
// SHA-256 do MD canonico: 346e647b6b674db7550ee658893223d1bdac7e78c716acd44caafd8d1fcee09b
//
// RV-15: todos os numeros medidos e mantidos bit-exact. Alteracao aqui requer
// atualizacao correspondente do MD Nativa e reeavalicao dos SHA-256 pinados dos
// 20 JSONs em tests/fixtures/nativa/manifest.sha256.ts.
//
// RV-13: consumido por src/db/seed/nativa/loadFixtures.ts e por testes unitarios
// em tests/unit/nativa/*.test.ts.

/**
 * Codigo canonico dos cargos internos da fixture Nativa (22 valores).
 * Mapeia para (jobFamily, senioridade, descricaoCBO, cbo) via NATIVA_CARGO_DERIVACAO.
 */
export type NativaCargoCodigo =
  | 'op_senior'
  | 'op_pleno'
  | 'op_junior'
  | 'aux_pleno'
  | 'aux_junior'
  | 'aux_qual_jr'
  | 'anl_fin_p'
  | 'asst_fin_j'
  | 'aux_adm_p'
  | 'aux_adm_j'
  | 'anl_rh_p'
  | 'asst_rh_j'
  | 'apoio_sr'
  | 'apoio_p'
  | 'apoio_j'
  | 'conf_p'
  | 'conf_j'
  | 'aux_exp_j'
  | 'exec_p'
  | 'exec_j'
  | 'anl_qual_p'
  | 'lider_f6';

/** Estrutura de um employee canonico da fixture Nativa. */
export interface NativaEmployeeRow {
  readonly id: number;
  readonly nomeCompleto: string;
  readonly cargoCodigo: NativaCargoCodigo;
  readonly arcoNarrativo: string;
  readonly custoMensalReferencia: number;
  readonly dataAdmissao: string; // ISO 'YYYY-MM-DD'
  readonly dataInativacao: string | null; // ISO 'YYYY-MM-DD' ou null se ativo
}

/**
 * 66 employees canonicos da fixture Nativa Alimentos Ltda.
 * - 48 iniciais (dataAdmissao < 2026-01-01)
 * - 18 pos-kickoff (dataAdmissao >= 2026-01-01)
 * - 13 inativados no escopo 2026-2027
 * - 53 ativos em 2027-12-31
 */
export const NATIVA_EMPLOYEES: readonly NativaEmployeeRow[] = [
  {
    id: 4,
    nomeCompleto: 'Juliana Freitas',
    cargoCodigo: 'lider_f6',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 14500.0,
    dataAdmissao: '2020-02-10',
    dataInativacao: null,
  },
  {
    id: 5,
    nomeCompleto: 'Fernando Salles',
    cargoCodigo: 'lider_f6',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 16000.0,
    dataAdmissao: '2018-06-01',
    dataInativacao: null,
  },
  {
    id: 6,
    nomeCompleto: 'Camila Batista',
    cargoCodigo: 'lider_f6',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 8500.0,
    dataAdmissao: '2015-09-15',
    dataInativacao: null,
  },
  {
    id: 7,
    nomeCompleto: 'Marcelo Vieira',
    cargoCodigo: 'lider_f6',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 8500.0,
    dataAdmissao: '2022-04-01',
    dataInativacao: null,
  },
  {
    id: 8,
    nomeCompleto: 'Gustavo Almeida',
    cargoCodigo: 'lider_f6',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 13500.0,
    dataAdmissao: '2021-08-15',
    dataInativacao: null,
  },
  {
    id: 9,
    nomeCompleto: 'Márcio Fernandes',
    cargoCodigo: 'lider_f6',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 7500.0,
    dataAdmissao: '2022-09-01',
    dataInativacao: null,
  },
  {
    id: 10,
    nomeCompleto: 'Bianca Martins',
    cargoCodigo: 'lider_f6',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 15000.0,
    dataAdmissao: '2019-03-01',
    dataInativacao: null,
  },
  {
    id: 11,
    nomeCompleto: 'Thiago Costa',
    cargoCodigo: 'lider_f6',
    arcoNarrativo: 'medio_baixo',
    custoMensalReferencia: 9000.0,
    dataAdmissao: '2024-11-01',
    dataInativacao: null,
  },
  {
    id: 12,
    nomeCompleto: 'Renata Lima',
    cargoCodigo: 'lider_f6',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 11500.0,
    dataAdmissao: '2019-05-15',
    dataInativacao: null,
  },
  {
    id: 13,
    nomeCompleto: 'Bruno Cardoso',
    cargoCodigo: 'anl_fin_p',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 7000.0,
    dataAdmissao: '2021-05-10',
    dataInativacao: null,
  },
  {
    id: 14,
    nomeCompleto: 'Denise Rocha',
    cargoCodigo: 'asst_fin_j',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 4200.0,
    dataAdmissao: '2023-08-01',
    dataInativacao: null,
  },
  {
    id: 15,
    nomeCompleto: 'Claudia Nascimento',
    cargoCodigo: 'aux_adm_p',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3200.0,
    dataAdmissao: '2020-11-15',
    dataInativacao: null,
  },
  {
    id: 16,
    nomeCompleto: 'Marisa Oliveira',
    cargoCodigo: 'aux_adm_p',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 3200.0,
    dataAdmissao: '2022-03-01',
    dataInativacao: null,
  },
  {
    id: 17,
    nomeCompleto: 'Roberto Santos',
    cargoCodigo: 'aux_adm_j',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3200.0,
    dataAdmissao: '2024-06-15',
    dataInativacao: null,
  },
  {
    id: 18,
    nomeCompleto: 'Everton Nunes',
    cargoCodigo: 'aux_adm_p',
    arcoNarrativo: 'desal',
    custoMensalReferencia: 3200.0,
    dataAdmissao: '2021-09-01',
    dataInativacao: '2027-10-20',
  },
  {
    id: 19,
    nomeCompleto: 'André Luiz Costa',
    cargoCodigo: 'op_senior',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2016-04-15',
    dataInativacao: null,
  },
  {
    id: 20,
    nomeCompleto: 'Tiago Martins',
    cargoCodigo: 'op_senior',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2017-08-01',
    dataInativacao: null,
  },
  {
    id: 21,
    nomeCompleto: 'Paulo Henrique Lima',
    cargoCodigo: 'op_pleno',
    arcoNarrativo: 'precisa_apoio',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2019-01-15',
    dataInativacao: null,
  },
  {
    id: 22,
    nomeCompleto: 'Sérgio Moura',
    cargoCodigo: 'op_pleno',
    arcoNarrativo: 'desal',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2019-10-01',
    dataInativacao: '2027-02-05',
  },
  {
    id: 23,
    nomeCompleto: 'Lucas Ferreira',
    cargoCodigo: 'op_pleno',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2020-05-15',
    dataInativacao: null,
  },
  {
    id: 24,
    nomeCompleto: 'Caio Santos',
    cargoCodigo: 'op_pleno',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2021-03-01',
    dataInativacao: null,
  },
  {
    id: 25,
    nomeCompleto: 'Rafael Teixeira',
    cargoCodigo: 'op_pleno',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2022-08-15',
    dataInativacao: null,
  },
  {
    id: 26,
    nomeCompleto: 'Gabriel Oliveira',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'alto_desc',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2023-02-01',
    dataInativacao: '2027-04-30',
  },
  {
    id: 27,
    nomeCompleto: 'Vinícius Ribeiro',
    cargoCodigo: 'op_pleno',
    arcoNarrativo: 'baixo',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2023-09-01',
    dataInativacao: '2026-10-25',
  },
  {
    id: 28,
    nomeCompleto: 'Bruno Henrique Alves',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'baixo',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2024-01-15',
    dataInativacao: '2026-11-18',
  },
  {
    id: 29,
    nomeCompleto: 'José Carlos Pereira',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'alto_desc',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2024-07-01',
    dataInativacao: '2027-07-25',
  },
  {
    id: 30,
    nomeCompleto: 'Felipe Barros',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'baixo',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2025-02-01',
    dataInativacao: '2026-08-10',
  },
  {
    id: 31,
    nomeCompleto: 'Marcos Vinícius Souza',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'pessoal',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2025-08-01',
    dataInativacao: '2026-05-15',
  },
  {
    id: 51,
    nomeCompleto: 'Cristiano Barbosa',
    cargoCodigo: 'op_pleno',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2020-08-15',
    dataInativacao: null,
  },
  {
    id: 32,
    nomeCompleto: 'Danilo Azevedo',
    cargoCodigo: 'aux_pleno',
    arcoNarrativo: 'baixo',
    custoMensalReferencia: 2900.0,
    dataAdmissao: '2020-11-01',
    dataInativacao: '2027-03-15',
  },
  {
    id: 33,
    nomeCompleto: 'Aline Prado',
    cargoCodigo: 'aux_pleno',
    arcoNarrativo: 'burnout',
    custoMensalReferencia: 2900.0,
    dataAdmissao: '2021-06-15',
    dataInativacao: '2027-06-10',
  },
  {
    id: 34,
    nomeCompleto: 'Sônia Cardoso',
    cargoCodigo: 'aux_pleno',
    arcoNarrativo: 'potencial_represado',
    custoMensalReferencia: 2900.0,
    dataAdmissao: '2022-01-15',
    dataInativacao: null,
  },
  {
    id: 35,
    nomeCompleto: 'Renata Campos',
    cargoCodigo: 'aux_junior',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 2900.0,
    dataAdmissao: '2023-04-01',
    dataInativacao: null,
  },
  {
    id: 36,
    nomeCompleto: 'Jéssica Moura',
    cargoCodigo: 'aux_junior',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 2900.0,
    dataAdmissao: '2024-05-01',
    dataInativacao: null,
  },
  {
    id: 37,
    nomeCompleto: 'Paula Ribeiro',
    cargoCodigo: 'aux_junior',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 2900.0,
    dataAdmissao: '2025-06-01',
    dataInativacao: null,
  },
  {
    id: 38,
    nomeCompleto: 'Renato Silva',
    cargoCodigo: 'conf_p',
    arcoNarrativo: 'desal',
    custoMensalReferencia: 3400.0,
    dataAdmissao: '2022-11-01',
    dataInativacao: '2027-02-20',
  },
  {
    id: 39,
    nomeCompleto: 'Daniel Moraes',
    cargoCodigo: 'conf_j',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 3400.0,
    dataAdmissao: '2024-02-15',
    dataInativacao: null,
  },
  {
    id: 40,
    nomeCompleto: 'Everton Lima',
    cargoCodigo: 'aux_exp_j',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3000.0,
    dataAdmissao: '2023-07-01',
    dataInativacao: null,
  },
  {
    id: 41,
    nomeCompleto: 'Adriano Souza',
    cargoCodigo: 'aux_exp_j',
    arcoNarrativo: 'alto_desc',
    custoMensalReferencia: 3000.0,
    dataAdmissao: '2024-10-15',
    dataInativacao: '2026-07-20',
  },
  {
    id: 42,
    nomeCompleto: 'Jonas Rocha',
    cargoCodigo: 'aux_exp_j',
    arcoNarrativo: 'engajado_subutilizado',
    custoMensalReferencia: 3000.0,
    dataAdmissao: '2025-04-01',
    dataInativacao: null,
  },
  {
    id: 43,
    nomeCompleto: 'Leonardo Pires',
    cargoCodigo: 'exec_p',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 6500.0,
    dataAdmissao: '2023-05-15',
    dataInativacao: null,
  },
  {
    id: 44,
    nomeCompleto: 'Fábio Henrique',
    cargoCodigo: 'exec_j',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 6500.0,
    dataAdmissao: '2024-03-01',
    dataInativacao: null,
  },
  {
    id: 45,
    nomeCompleto: 'Pedro Augusto',
    cargoCodigo: 'exec_j',
    arcoNarrativo: 'pessoal',
    custoMensalReferencia: 6500.0,
    dataAdmissao: '2025-01-15',
    dataInativacao: '2026-12-15',
  },
  {
    id: 46,
    nomeCompleto: 'Marina Lopes',
    cargoCodigo: 'anl_rh_p',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 5500.0,
    dataAdmissao: '2022-06-01',
    dataInativacao: null,
  },
  {
    id: 47,
    nomeCompleto: 'Tatiane Freitas',
    cargoCodigo: 'asst_rh_j',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3500.0,
    dataAdmissao: '2024-09-01',
    dataInativacao: null,
  },
  {
    id: 48,
    nomeCompleto: 'Carlos Eduardo Mendes',
    cargoCodigo: 'apoio_sr',
    arcoNarrativo: 'alto',
    custoMensalReferencia: 2800.0,
    dataAdmissao: '2018-11-01',
    dataInativacao: null,
  },
  {
    id: 49,
    nomeCompleto: 'João Pedro Ramos',
    cargoCodigo: 'apoio_p',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 2800.0,
    dataAdmissao: '2020-04-15',
    dataInativacao: null,
  },
  {
    id: 50,
    nomeCompleto: 'Alexandre Gouveia',
    cargoCodigo: 'apoio_j',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 2800.0,
    dataAdmissao: '2023-01-15',
    dataInativacao: null,
  },
  {
    id: 52,
    nomeCompleto: 'Ademir Prado',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2026-06-01',
    dataInativacao: null,
  },
  {
    id: 53,
    nomeCompleto: 'Isabela Rezende',
    cargoCodigo: 'anl_qual_p',
    arcoNarrativo: 'ascendente',
    custoMensalReferencia: 5500.0,
    dataAdmissao: '2026-07-15',
    dataInativacao: null,
  },
  {
    id: 54,
    nomeCompleto: 'Wanderson Alves',
    cargoCodigo: 'aux_exp_j',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3000.0,
    dataAdmissao: '2026-08-01',
    dataInativacao: null,
  },
  {
    id: 55,
    nomeCompleto: 'Fernanda Correia',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2026-08-25',
    dataInativacao: null,
  },
  {
    id: 56,
    nomeCompleto: 'Diego Ferraz',
    cargoCodigo: 'aux_qual_jr',
    arcoNarrativo: 'ascendente',
    custoMensalReferencia: 3200.0,
    dataAdmissao: '2026-09-15',
    dataInativacao: null,
  },
  {
    id: 57,
    nomeCompleto: 'Vitor Ramos',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2026-10-15',
    dataInativacao: null,
  },
  {
    id: 58,
    nomeCompleto: 'Cauê Fonseca',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2026-11-05',
    dataInativacao: null,
  },
  {
    id: 59,
    nomeCompleto: 'Beatriz Nogueira',
    cargoCodigo: 'exec_j',
    arcoNarrativo: 'medio_baixo',
    custoMensalReferencia: 6500.0,
    dataAdmissao: '2026-12-01',
    dataInativacao: null,
  },
  {
    id: 60,
    nomeCompleto: 'Igor Beltrão',
    cargoCodigo: 'op_pleno',
    arcoNarrativo: 'medio_baixo',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2027-02-20',
    dataInativacao: null,
  },
  {
    id: 61,
    nomeCompleto: 'Rodrigo Oliveira',
    cargoCodigo: 'op_pleno',
    arcoNarrativo: 'ascendente',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2027-02-20',
    dataInativacao: null,
  },
  {
    id: 62,
    nomeCompleto: 'Vinicius Nogueira',
    cargoCodigo: 'conf_j',
    arcoNarrativo: 'medio',
    custoMensalReferencia: 3400.0,
    dataAdmissao: '2027-03-05',
    dataInativacao: null,
  },
  {
    id: 63,
    nomeCompleto: 'Larissa Mendes',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'medio_baixo',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2027-05-05',
    dataInativacao: null,
  },
  {
    id: 64,
    nomeCompleto: 'Márcia Silveira',
    cargoCodigo: 'aux_pleno',
    arcoNarrativo: 'ascendente',
    custoMensalReferencia: 2900.0,
    dataAdmissao: '2027-05-15',
    dataInativacao: null,
  },
  {
    id: 65,
    nomeCompleto: 'Camila Duarte',
    cargoCodigo: 'aux_junior',
    arcoNarrativo: 'medio_baixo',
    custoMensalReferencia: 2900.0,
    dataAdmissao: '2027-06-20',
    dataInativacao: null,
  },
  {
    id: 66,
    nomeCompleto: 'Wesley Duarte',
    cargoCodigo: 'op_pleno',
    arcoNarrativo: 'ascendente',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2027-08-10',
    dataInativacao: null,
  },
  {
    id: 67,
    nomeCompleto: 'Otávio Braga',
    cargoCodigo: 'op_junior',
    arcoNarrativo: 'medio_baixo',
    custoMensalReferencia: 3800.0,
    dataAdmissao: '2027-08-15',
    dataInativacao: null,
  },
  {
    id: 68,
    nomeCompleto: 'Marina Peixoto',
    cargoCodigo: 'aux_adm_j',
    arcoNarrativo: 'ascendente',
    custoMensalReferencia: 3200.0,
    dataAdmissao: '2027-10-15',
    dataInativacao: null,
  },
  {
    id: 69,
    nomeCompleto: 'Rafaela Torres',
    cargoCodigo: 'aux_pleno',
    arcoNarrativo: 'medio_baixo',
    custoMensalReferencia: 2900.0,
    dataAdmissao: '2027-11-25',
    dataInativacao: null,
  },
];

/** Uma variavel canonica dentro de metas por cargo (4 por cargo). */
export interface NativaMetaVariavel {
  readonly variableIndex: number; // 0..3
  readonly goal: number;
  readonly weight: number; // 0..100 (soma 100 por cargo)
}

/**
 * Metas canonicas por cargo interno (Familia 6 usa lider_f6; demais mapeiam para as 5
 * outras familias). Cada cargo tem 4 variaveis; os nomes/unidades das variaveis ficam
 * em NATIVA_JOB_FAMILY_VARIABLES (por familia).
 */
export const NATIVA_METAS_POR_CARGO: Readonly<
  Record<NativaCargoCodigo, readonly NativaMetaVariavel[]>
> = {
  op_senior: [
    { variableIndex: 0, goal: 9500.0, weight: 45.0 },
    { variableIndex: 1, goal: 22.0, weight: 30.0 },
    { variableIndex: 2, goal: 8900.0, weight: 15.0 },
    { variableIndex: 3, goal: 165.0, weight: 10.0 },
  ],
  op_pleno: [
    { variableIndex: 0, goal: 8000.0, weight: 45.0 },
    { variableIndex: 1, goal: 18.0, weight: 30.0 },
    { variableIndex: 2, goal: 7400.0, weight: 15.0 },
    { variableIndex: 3, goal: 155.0, weight: 10.0 },
  ],
  op_junior: [
    { variableIndex: 0, goal: 6500.0, weight: 45.0 },
    { variableIndex: 1, goal: 15.0, weight: 30.0 },
    { variableIndex: 2, goal: 6000.0, weight: 15.0 },
    { variableIndex: 3, goal: 145.0, weight: 10.0 },
  ],
  aux_pleno: [
    { variableIndex: 0, goal: 5500.0, weight: 45.0 },
    { variableIndex: 1, goal: 13.0, weight: 30.0 },
    { variableIndex: 2, goal: 5000.0, weight: 15.0 },
    { variableIndex: 3, goal: 150.0, weight: 10.0 },
  ],
  aux_junior: [
    { variableIndex: 0, goal: 4500.0, weight: 45.0 },
    { variableIndex: 1, goal: 10.0, weight: 30.0 },
    { variableIndex: 2, goal: 4100.0, weight: 15.0 },
    { variableIndex: 3, goal: 140.0, weight: 10.0 },
  ],
  aux_qual_jr: [
    { variableIndex: 0, goal: 3000.0, weight: 45.0 },
    { variableIndex: 1, goal: 25.0, weight: 30.0 },
    { variableIndex: 2, goal: 2800.0, weight: 15.0 },
    { variableIndex: 3, goal: 155.0, weight: 10.0 },
  ],
  anl_fin_p: [
    { variableIndex: 0, goal: 220.0, weight: 40.0 },
    { variableIndex: 1, goal: 45.0, weight: 30.0 },
    { variableIndex: 2, goal: 60.0, weight: 20.0 },
    { variableIndex: 3, goal: 4.0, weight: 10.0 },
  ],
  asst_fin_j: [
    { variableIndex: 0, goal: 180.0, weight: 40.0 },
    { variableIndex: 1, goal: 30.0, weight: 30.0 },
    { variableIndex: 2, goal: 45.0, weight: 20.0 },
    { variableIndex: 3, goal: 3.0, weight: 10.0 },
  ],
  aux_adm_p: [
    { variableIndex: 0, goal: 200.0, weight: 40.0 },
    { variableIndex: 1, goal: 35.0, weight: 30.0 },
    { variableIndex: 2, goal: 55.0, weight: 20.0 },
    { variableIndex: 3, goal: 3.0, weight: 10.0 },
  ],
  aux_adm_j: [
    { variableIndex: 0, goal: 170.0, weight: 40.0 },
    { variableIndex: 1, goal: 28.0, weight: 30.0 },
    { variableIndex: 2, goal: 45.0, weight: 20.0 },
    { variableIndex: 3, goal: 2.0, weight: 10.0 },
  ],
  anl_rh_p: [
    { variableIndex: 0, goal: 160.0, weight: 40.0 },
    { variableIndex: 1, goal: 40.0, weight: 30.0 },
    { variableIndex: 2, goal: 70.0, weight: 20.0 },
    { variableIndex: 3, goal: 4.0, weight: 10.0 },
  ],
  asst_rh_j: [
    { variableIndex: 0, goal: 130.0, weight: 40.0 },
    { variableIndex: 1, goal: 25.0, weight: 30.0 },
    { variableIndex: 2, goal: 55.0, weight: 20.0 },
    { variableIndex: 3, goal: 3.0, weight: 10.0 },
  ],
  apoio_sr: [
    { variableIndex: 0, goal: 150.0, weight: 40.0 },
    { variableIndex: 1, goal: 20.0, weight: 30.0 },
    { variableIndex: 2, goal: 65.0, weight: 20.0 },
    { variableIndex: 3, goal: 3.0, weight: 10.0 },
  ],
  apoio_p: [
    { variableIndex: 0, goal: 140.0, weight: 40.0 },
    { variableIndex: 1, goal: 18.0, weight: 30.0 },
    { variableIndex: 2, goal: 60.0, weight: 20.0 },
    { variableIndex: 3, goal: 2.0, weight: 10.0 },
  ],
  apoio_j: [
    { variableIndex: 0, goal: 120.0, weight: 40.0 },
    { variableIndex: 1, goal: 15.0, weight: 30.0 },
    { variableIndex: 2, goal: 55.0, weight: 20.0 },
    { variableIndex: 3, goal: 2.0, weight: 10.0 },
  ],
  conf_p: [
    { variableIndex: 0, goal: 240.0, weight: 40.0 },
    { variableIndex: 1, goal: 50.0, weight: 30.0 },
    { variableIndex: 2, goal: 40.0, weight: 20.0 },
    { variableIndex: 3, goal: 2.0, weight: 10.0 },
  ],
  conf_j: [
    { variableIndex: 0, goal: 200.0, weight: 40.0 },
    { variableIndex: 1, goal: 42.0, weight: 30.0 },
    { variableIndex: 2, goal: 35.0, weight: 20.0 },
    { variableIndex: 3, goal: 2.0, weight: 10.0 },
  ],
  aux_exp_j: [
    { variableIndex: 0, goal: 260.0, weight: 40.0 },
    { variableIndex: 1, goal: 20.0, weight: 30.0 },
    { variableIndex: 2, goal: 30.0, weight: 20.0 },
    { variableIndex: 3, goal: 2.0, weight: 10.0 },
  ],
  exec_p: [
    { variableIndex: 0, goal: 180000.0, weight: 55.0 },
    { variableIndex: 1, goal: 4.0, weight: 20.0 },
    { variableIndex: 2, goal: 55.0, weight: 15.0 },
    { variableIndex: 3, goal: 22.0, weight: 10.0 },
  ],
  exec_j: [
    { variableIndex: 0, goal: 130000.0, weight: 55.0 },
    { variableIndex: 1, goal: 3.0, weight: 20.0 },
    { variableIndex: 2, goal: 42.0, weight: 15.0 },
    { variableIndex: 3, goal: 18.0, weight: 10.0 },
  ],
  anl_qual_p: [
    { variableIndex: 0, goal: 55.0, weight: 45.0 },
    { variableIndex: 1, goal: 90.0, weight: 25.0 },
    { variableIndex: 2, goal: 12.0, weight: 20.0 },
    { variableIndex: 3, goal: 6.0, weight: 10.0 },
  ],
  lider_f6: [
    { variableIndex: 0, goal: 5.0, weight: 25.0 },
    { variableIndex: 1, goal: 5.0, weight: 25.0 },
    { variableIndex: 2, goal: 5.0, weight: 25.0 },
    { variableIndex: 3, goal: 5.0, weight: 25.0 },
  ],
};

/** Faturamento bruto mensal canonico da Nativa. 24 registros (2026-01 a 2027-12). */
export interface NativaFaturamentoMensal {
  readonly ano: number;
  readonly mes: number;
  readonly mesRef: string; // 'YYYY-MM'
  readonly faturamentoBruto: number;
}

export const NATIVA_FATURAMENTO_MENSAL: readonly NativaFaturamentoMensal[] = [
  { ano: 2026, mes: 1, mesRef: '2026-01', faturamentoBruto: 1380000.0 },
  { ano: 2026, mes: 2, mesRef: '2026-02', faturamentoBruto: 1500000.0 },
  { ano: 2026, mes: 3, mesRef: '2026-03', faturamentoBruto: 1620000.0 },
  { ano: 2026, mes: 4, mesRef: '2026-04', faturamentoBruto: 1660000.0 },
  { ano: 2026, mes: 5, mesRef: '2026-05', faturamentoBruto: 1480000.0 },
  { ano: 2026, mes: 6, mesRef: '2026-06', faturamentoBruto: 1600000.0 },
  { ano: 2026, mes: 7, mesRef: '2026-07', faturamentoBruto: 1840000.0 },
  { ano: 2026, mes: 8, mesRef: '2026-08', faturamentoBruto: 1640000.0 },
  { ano: 2026, mes: 9, mesRef: '2026-09', faturamentoBruto: 1680000.0 },
  { ano: 2026, mes: 10, mesRef: '2026-10', faturamentoBruto: 1730000.0 },
  { ano: 2026, mes: 11, mesRef: '2026-11', faturamentoBruto: 1840000.0 },
  { ano: 2026, mes: 12, mesRef: '2026-12', faturamentoBruto: 1890000.0 },
  { ano: 2027, mes: 1, mesRef: '2027-01', faturamentoBruto: 1700000.0 },
  { ano: 2027, mes: 2, mesRef: '2027-02', faturamentoBruto: 1850000.0 },
  { ano: 2027, mes: 3, mesRef: '2027-03', faturamentoBruto: 2000000.0 },
  { ano: 2027, mes: 4, mesRef: '2027-04', faturamentoBruto: 2050000.0 },
  { ano: 2027, mes: 5, mesRef: '2027-05', faturamentoBruto: 1830000.0 },
  { ano: 2027, mes: 6, mesRef: '2027-06', faturamentoBruto: 1970000.0 },
  { ano: 2027, mes: 7, mesRef: '2027-07', faturamentoBruto: 2150000.0 },
  { ano: 2027, mes: 8, mesRef: '2027-08', faturamentoBruto: 1920000.0 },
  { ano: 2027, mes: 9, mesRef: '2027-09', faturamentoBruto: 1960000.0 },
  { ano: 2027, mes: 10, mesRef: '2027-10', faturamentoBruto: 1970000.0 },
  { ano: 2027, mes: 11, mesRef: '2027-11', faturamentoBruto: 2110000.0 },
  { ano: 2027, mes: 12, mesRef: '2027-12', faturamentoBruto: 2160000.0 },
];

/** Promocao canonica que altera nivelHierarquico e custoMensalReferencia. */
export interface NativaPromocao {
  readonly nomeCompleto: string;
  readonly dataPromocao: string; // 'YYYY-MM-DD'
  readonly novoNivel: 'operacional' | 'tatico' | 'estrategico';
  readonly novoCustoMensal: number;
}

/** 2 promocoes canonicas ao longo de 2027 (Arco A e Arco B). */
export const NATIVA_PROMOCOES: readonly NativaPromocao[] = [
  {
    nomeCompleto: 'Leonardo Pires',
    dataPromocao: '2027-04-01',
    novoNivel: 'tatico',
    novoCustoMensal: 9000.0,
  },
  {
    nomeCompleto: 'Marina Lopes',
    dataPromocao: '2027-07-01',
    novoNivel: 'tatico',
    novoCustoMensal: 8000.0,
  },
];

/** Custo mensal canonico dos 3 C-levels (nao alterado por promocao — sao imutaveis no escopo). */
export const NATIVA_CLEVEL_CUSTO_MENSAL: Readonly<Record<string, number>> = {
  'Eduardo Almeida': 38000.0,
  'Patrícia Menezes': 28000.0,
  'Ricardo Nogueira': 28000.0,
};

/**
 * Configuracao canonica da empresa Nativa Alimentos Ltda. (companies.id=1).
 * Fonte: EMPRESA_DEMO_NATIVA.md §2 v1.1 (corrigida em ME-068 conforme E-068-13/Opcao X).
 *
 * Campos que o MD Nativa nao fornece explicitamente foram derivados canonicamente
 * do proprio MD (endereco, telefone, contatos) e do schema real (segmento como enum,
 * encarregadoLgpd* como renomeio canonico de dpo*).
 */
export const NATIVA_COMPANY_ROW = {
  id: 1,
  razaoSocial: 'Nativa Alimentos Ltda.',
  nomeFantasia: 'Nativa Alimentos',
  cnpj: '50700200000150',
  telefone: '(16) 3232-8100',
  endereco: 'Av. Presidente Vargas, 2500 — Jardim Sumaré',
  cidade: 'Ribeirão Preto',
  estado: 'SP' as const,
  logoUrl: null,
  contatoPrincipalNome: 'Eduardo Almeida da Silva',
  contatoPrincipalEmail: 'eduardo.almeida@nativa.com.br',
  contatoRHNome: 'Renata Lima',
  contatoRHEmail: 'renata.lima@nativa.com.br',
  segmento: 'Indústria+Comércio' as const,
  tipoAtividade: 'Indústria alimentícia',
  descricaoAtividade:
    'Fabricação e comercialização de produtos alimentícios industrializados. Portfólio ' +
    'inclui linhas de conservas, molhos, congelados e alimentos prontos para consumo, ' +
    'comercializados via varejo regional e distribuição direta a médias redes.',
  contextoMercado:
    'PME alimentícia com 12 anos de operação (fundada em 2014) no interior paulista. ' +
    'Objetivo canônico: profissionalizar a gestão de pessoas para sustentar crescimento e ' +
    'reduzir turnover em Produção. Sazonalidade típica do setor (Páscoa +12%, festas juninas ' +
    '+8%, Natal +15%) preservada nos dados de faturamento.',
  metaROIOperacional: '3.00',
  metaROITatico: '6.00',
  metaROIEstrategico: '9.00',
  roiSegmentoMinimo: '3.50',
  roiSegmentoMaximo: '6.00',
  folhaPercMinima: '16.0',
  folhaPercMaxima: '25.0',
  thresholdDesempenhoBaixo: 60,
  thresholdDesempenhoMedio: 85,
  thresholdPlenitudeBaixo: 50,
  thresholdPlenitudeMedio: 75,
  modoAnoFiscal: 'padrao' as const,
  mesInicioAnoFiscal: 1,
  mesKickoff: 1,
  kickoffDate: '2026-01-01',
  timezone: 'America/Sao_Paulo',
  encarregadoLgpdNome: 'Fernanda Almeida Torres',
  encarregadoLgpdEmail: 'dpo@nativa.com.br',
  encarregadoLgpdTelefone: '(16) 3232-8100',
  encarregadoLgpdPoliticaUrl: null,
  status: 'ativa' as const,
  isDemo: true,
  createdAt: new Date('2025-11-15T10:00:00Z'),
} as const;

/** 3 C-levels canonicos da Nativa. Todos admitidos em 2014-03-15 (fundacao). */
export interface NativaCLevelRow {
  readonly id: number;
  readonly companyId: number;
  readonly nomeCompleto: string;
  readonly cpf: string;
  readonly email: string;
  readonly cargo: string;
  readonly descricaoCargo: string;
  readonly departamento: 'Diretoria';
  readonly acessoTotal: boolean;
  readonly isResponsavelFinanceiro: boolean; // no snapshot final (apos transferencia)
  readonly custoMensal: number;
  readonly dataAdmissao: '2014-03-15';
  readonly dataNascimento: string;
}

export const NATIVA_CLEVELS: readonly NativaCLevelRow[] = [
  {
    id: 1,
    companyId: 1,
    nomeCompleto: 'Eduardo Almeida da Silva',
    cpf: '10000000108',
    email: 'eduardo.almeida@nativa.com.br',
    cargo: 'CEO',
    descricaoCargo: 'Chief Executive Officer — direção executiva da Nativa Alimentos Ltda.',
    departamento: 'Diretoria',
    acessoTotal: true,
    isResponsavelFinanceiro: false,
    custoMensal: 38000,
    dataAdmissao: '2014-03-15',
    dataNascimento: '1976-04-18',
  },
  {
    id: 2,
    companyId: 1,
    nomeCompleto: 'Patrícia Menezes Ferreira',
    cpf: '10000000280',
    email: 'patricia.menezes@nativa.com.br',
    cargo: 'CFO',
    descricaoCargo:
      'Chief Financial Officer — direção financeira. Papel funcional de Responsável ' +
      'Financeiro transferido a Juliana Freitas em 15/01/2027 (Patrícia manteve título CFO).',
    departamento: 'Diretoria',
    acessoTotal: true,
    isResponsavelFinanceiro: false,
    custoMensal: 28000,
    dataAdmissao: '2014-03-15',
    dataNascimento: '1979-11-22',
  },
  {
    id: 3,
    companyId: 1,
    nomeCompleto: 'Ricardo Nogueira Prado',
    cpf: '10000000361',
    email: 'ricardo.nogueira@nativa.com.br',
    cargo: 'COO',
    descricaoCargo:
      'Chief Operating Officer — direção operacional (Produção, Logística, Comercial). ' +
      'acessoTotal=false: escopo restrito à cadeia operacional (aproximadamente 44-50 pessoas).',
    departamento: 'Diretoria',
    acessoTotal: false,
    isResponsavelFinanceiro: false,
    custoMensal: 28000,
    dataAdmissao: '2014-03-15',
    dataNascimento: '1974-08-05',
  },
];

/** Variavel canonica dentro de uma familia (nome e unidade constantes por familia). */
export interface NativaJobFamilyVariable {
  readonly variableIndex: number; // 0..3
  readonly variableName: string;
  readonly unit: string;
}

export type NativaJobFamily =
  | 'producao_operacoes'
  | 'administrativo_suporte'
  | 'vendas_comercial'
  | 'tecnico_especialista'
  | 'lideranca_gestao';

/** 5 familias ocupacionais efetivas × 4 variaveis = 20 registros em companyJobFamilies. */
export const NATIVA_JOB_FAMILY_VARIABLES: Readonly<
  Record<NativaJobFamily, readonly NativaJobFamilyVariable[]>
> = {
  producao_operacoes: [
    { variableIndex: 0, variableName: 'Volume produzido', unit: 'kg' },
    { variableIndex: 1, variableName: 'Lotes aprovados', unit: 'unidades' },
    { variableIndex: 2, variableName: 'Matéria-prima aproveitada', unit: 'kg' },
    { variableIndex: 3, variableName: 'Horas produtivas', unit: 'horas' },
  ],
  administrativo_suporte: [
    { variableIndex: 0, variableName: 'Demandas processadas', unit: 'unidades' },
    { variableIndex: 1, variableName: 'Documentos gerados', unit: 'unidades' },
    { variableIndex: 2, variableName: 'Atendimentos internos', unit: 'unidades' },
    { variableIndex: 3, variableName: 'Contribuições em projetos', unit: 'unidades' },
  ],
  vendas_comercial: [
    { variableIndex: 0, variableName: 'Faturamento bruto', unit: 'R$' },
    { variableIndex: 1, variableName: 'Novos clientes', unit: 'unidades' },
    { variableIndex: 2, variableName: 'Pedidos fechados', unit: 'unidades' },
    { variableIndex: 3, variableName: 'Visitas técnicas', unit: 'unidades' },
  ],
  tecnico_especialista: [
    { variableIndex: 0, variableName: 'Laudos emitidos', unit: 'unidades' },
    { variableIndex: 1, variableName: 'Lotes analisados', unit: 'unidades' },
    { variableIndex: 2, variableName: 'Não-conformidades detectadas', unit: 'unidades' },
    { variableIndex: 3, variableName: 'Treinamentos ministrados', unit: 'horas' },
  ],
  lideranca_gestao: [
    { variableIndex: 0, variableName: 'Direcionamento e clareza', unit: 'pontos (1-5)' },
    { variableIndex: 1, variableName: 'Desenvolvimento e apoio', unit: 'pontos (1-5)' },
    { variableIndex: 2, variableName: 'Relacionamento e confiança', unit: 'pontos (1-5)' },
    { variableIndex: 3, variableName: 'Gestão e resultados', unit: 'pontos (1-5)' },
  ],
};
