// ROIP APP 9BOX — catalogo canonico de enums transversais (DOC 01 §15).
// Fonte unica; qualquer enum em tables.ts referencia daqui, sem duplicar literais.
// Ordem e grafia identicas ao DOC 01 pos-CC001. Nao editar sem CC dedicada.

// §15.1 — departamento (19 valores; dados cadastrais).
// Espelhado pela tabela `departments` e usado em `employees.departamento`
// e `cLevelMembers.departamento`. Enum fixo, nao configuravel.
export const DEPARTAMENTO_VALUES = [
  'Comercial',
  'Marketing',
  'Operações',
  'Produção',
  'Logística',
  'Compras',
  'Financeiro',
  'Contabilidade',
  'Recursos Humanos',
  'Tecnologia da Informação',
  'Jurídico',
  'Qualidade',
  'Manutenção',
  'Projetos',
  'Atendimento ao Cliente',
  'Pós-venda',
  'Administrativo',
  'Diretoria',
  'Outros',
] as const;
export type Departamento = (typeof DEPARTAMENTO_VALUES)[number];

// §15.2 — tipo de notifications/alerts (17 valores nomeados; S417 Opção A).
// Composicao canonica: 2 NR-1 + 13 Fase 8 + 2 Responsavel financeiro = 17.
// Enum logico; a coluna e VARCHAR(50) e a validacao e server-side no emitAlert.
export const NOTIFICATION_TIPO_VALUES = [
  // Radar NR-1 (2)
  'nr1_fator_critico',
  'nr1_ciclo_fechado',
  // Fase 8 (13)
  'desempenho_queda_brusca',
  'desempenho_estagnacao',
  'desempenho_queda_isolada',
  'assiduidade_baixa',
  'divergencia_a_c',
  'perfil_inconsistente_primeira',
  'perfil_retest_consistente',
  'perfil_retest_reincidente',
  'desbloqueio_solicitado',
  'desbloqueio_aprovado',
  'desbloqueio_recusado',
  'ciclo_instrumento_encerrado',
  'ciclo_mensal_fechado',
  // Responsavel financeiro (2 — D049/D050)
  'fechamento_bloqueado_sem_resp_financeiro',
  'responsavel_financeiro_nomeado',
] as const;
export type NotificationTipo = (typeof NOTIFICATION_TIPO_VALUES)[number];

// §15.3 — severidade (alerts, notifications).
export const SEVERIDADE_VALUES = ['info', 'observacao', 'atencao', 'critico'] as const;
export type Severidade = (typeof SEVERIDADE_VALUES)[number];

// §15.3 — escopo (alerts).
export const ESCOPO_ALERT_VALUES = ['empresa', 'departamento', 'colaborador'] as const;
export type EscopoAlert = (typeof ESCOPO_ALERT_VALUES)[number];

// §15.3 — aba (monthlyUnlockLog, cycleUnlockRequests). Inclui 'faturamento' (S421/D052).
export const ABA_UNLOCK_VALUES = ['rh', 'lider', 'faturamento'] as const;
export type AbaUnlock = (typeof ABA_UNLOCK_VALUES)[number];

// §15.3 — nivelHierarquico.
export const NIVEL_HIERARQUICO_VALUES = ['operacional', 'tatico', 'estrategico'] as const;
export type NivelHierarquico = (typeof NIVEL_HIERARQUICO_VALUES)[number];

// §15.3 — jobFamily (6 familias fixas, hard-coded, nao configuraveis).
// Customizacao por empresa em companyJobFamilies altera nomes/unidades/pesos
// de variaveis, nunca as familias.
export const JOB_FAMILY_VALUES = [
  'vendas_comercial',
  'producao_operacoes',
  'tecnico_especialista',
  'administrativo_suporte',
  'atendimento_relacionamento',
  'lideranca_gestao',
] as const;
export type JobFamily = (typeof JOB_FAMILY_VALUES)[number];

// §15.3 — tipoCiclo (cycleSchedule).
export const TIPO_CICLO_VALUES = [
  'instrumento_a',
  'instrumento_c',
  'instrumento_d',
  'radar_nr1',
  'fechamento_mensal',
] as const;
export type TipoCiclo = (typeof TIPO_CICLO_VALUES)[number];

// §15.3 — estagios de onboarding de lideres (4 fixos).
export const ONBOARDING_ESTAGIO_VALUES = [
  'treinar',
  'em_treinamento',
  'treinado',
  'reciclagem',
] as const;
export type OnboardingEstagio = (typeof ONBOARDING_ESTAGIO_VALUES)[number];

// §15.3 — tipoAcesso (dataAccessLog).
export const TIPO_ACESSO_VALUES = [
  'dashboard_individual',
  'relatorio_perfil_individual',
  'exportacao_planilha',
] as const;
export type TipoAcesso = (typeof TIPO_ACESSO_VALUES)[number];

// §15.3 — motivo (employeeTerminationEvents).
export const MOTIVO_TERMINATION_VALUES = ['voluntario', 'involuntario'] as const;
export type MotivoTermination = (typeof MOTIVO_TERMINATION_VALUES)[number];

// Guardas canonicas de contagem (RV-15: nenhum numero sem medicao — estas
// constantes sao as fontes literais das §15.1 e §15.2, contadas do proprio
// array pelo TypeScript).
export const DEPARTAMENTO_COUNT = 19 as const;
export const NOTIFICATION_TIPO_COUNT = 17 as const;

// Verificacao em tempo de compilacao: se alguem adicionar/remover valor sem
// mexer no COUNT correspondente, o TypeScript falha (largura tuple != numero).
type _AssertDepartamentoCount = (typeof DEPARTAMENTO_VALUES)['length'] extends 19 ? true : never;
type _AssertNotificationTipoCount = (typeof NOTIFICATION_TIPO_VALUES)['length'] extends 17
  ? true
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CHECK_DEPARTAMENTO: _AssertDepartamentoCount = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CHECK_NOTIFICATION_TIPO: _AssertNotificationTipoCount = true;
