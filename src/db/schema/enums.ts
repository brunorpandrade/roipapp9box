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

// §15.3 — jobFamily (26 valores: 6 canonicas + 20 slots customizaveis).
//
// Expansao canonica em ME-1.17 (Conversa 5 — Famílias de função 100%
// customizáveis): as 6 canonicas permanecem como seed universal pre-
// populado para toda empresa; a tabela `companyRoleFamilySettings`
// (nova em ME-1.17) permite por empresa: renomear o nome exibido
// (campo `nomeCustomizado`), reordenar (`ordem`), e desativar as
// canonicas 5 ajustaveis — a familia `lideranca_gestao` tem trava
// canonica absoluta (nunca desativavel, nome fixo, 4 variaveis fixas,
// unidade fixa; apenas os pesos sao editaveis, sempre com soma = 100).
//
// Os 20 slots `custom1..custom20` sao reservas de capacidade: cada
// empresa pode ocupar ate 20 familias totalmente customizaveis (nome
// via `nomeCustomizado` + 4 variaveis em `companyJobFamilies` nascem
// com nomes `Variável 1..4`, unidade vazia e pesos 25% cada). Slots
// nao ocupados nao aparecem em cadastro de colaborador nem em nenhuma
// outra superficie.
//
// Comparacao cross-empresa (benchmarks setoriais) continua ancorada
// nas chaves canonicas (`vendas_comercial`, ...); `nomeCustomizado`
// pertence apenas a superficie da propria empresa (decisao executiva
// de Bruno em 24/10/2026: nao ha planos de benchmark cross-empresa,
// agora nem no futuro — resolver pode retornar nome customizado em
// qualquer superficie sem reserva).
export const JOB_FAMILY_VALUES = [
  'vendas_comercial',
  'producao_operacoes',
  'tecnico_especialista',
  'administrativo_suporte',
  'atendimento_relacionamento',
  'lideranca_gestao',
  'custom1',
  'custom2',
  'custom3',
  'custom4',
  'custom5',
  'custom6',
  'custom7',
  'custom8',
  'custom9',
  'custom10',
  'custom11',
  'custom12',
  'custom13',
  'custom14',
  'custom15',
  'custom16',
  'custom17',
  'custom18',
  'custom19',
  'custom20',
] as const;
export type JobFamily = (typeof JOB_FAMILY_VALUES)[number];

/**
 * As 6 familias canonicas (seed universal pre-populado em toda empresa).
 * Narrow do tipo `JobFamily` que exclui os slots `custom*`. Consumido
 * pelo resolver `getJobFamilyLabel` e por validacoes server-side que
 * precisam distinguir "canonica" de "custom".
 */
export const JOB_FAMILY_CANONICAL_VALUES = [
  'vendas_comercial',
  'producao_operacoes',
  'tecnico_especialista',
  'administrativo_suporte',
  'atendimento_relacionamento',
  'lideranca_gestao',
] as const;
export type JobFamilyCanonical = (typeof JOB_FAMILY_CANONICAL_VALUES)[number];

/**
 * Os 20 slots customizaveis (reserva de capacidade por empresa).
 * Narrow do tipo `JobFamily` que inclui apenas slots `custom*`.
 * Consumido pela UI de /familias (listagem de slots disponiveis) e
 * pelo service `companyRoleFamilySettings.activateCustomSlot`.
 */
export const JOB_FAMILY_CUSTOM_VALUES = [
  'custom1',
  'custom2',
  'custom3',
  'custom4',
  'custom5',
  'custom6',
  'custom7',
  'custom8',
  'custom9',
  'custom10',
  'custom11',
  'custom12',
  'custom13',
  'custom14',
  'custom15',
  'custom16',
  'custom17',
  'custom18',
  'custom19',
  'custom20',
] as const;
export type JobFamilyCustom = (typeof JOB_FAMILY_CUSTOM_VALUES)[number];

/**
 * Guard canonico: `true` se o valor e um dos 20 slots `custom*`.
 * Resolve ambiguidade "canônica vs. custom" em código que precisa
 * aplicar logica diferenciada (trava de `lideranca_gestao`, decisao
 * de qual label mostrar quando `nomeCustomizado` e NULL, etc).
 */
export function isJobFamilyCustom(v: JobFamily): v is JobFamilyCustom {
  return (JOB_FAMILY_CUSTOM_VALUES as readonly string[]).includes(v);
}

/**
 * Guard canonico: `true` se o valor e `lideranca_gestao`. Familia
 * estrutural com trava canonica absoluta (ME-1.17): nunca desativavel,
 * nome fixo "Liderança e gestão", 4 variaveis fixas, unidade fixa
 * "pontos (1-5)", apenas pesos editaveis com soma = 100.
 */
export function isJobFamilyStructural(v: JobFamily): v is 'lideranca_gestao' {
  return v === 'lideranca_gestao';
}

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

// §15.3 — eventType (responsavelFinanceiroTransferLog). Extracao canonica
// do enum inline de tables.ts:279 realizada em ME-057b. Consumido pela
// rota /super-admin/logs/responsavel-financeiro (§14.20) para narrowing
// de filtro no dropdown e mapeamento canonico label + badge color.
export const RF_EVENT_TYPE_VALUES = ['atribuido', 'transferido', 'removido'] as const;
export type RfEventType = (typeof RF_EVENT_TYPE_VALUES)[number];

// §15.3 — motivo (employeeTerminationEvents).
export const MOTIVO_TERMINATION_VALUES = ['voluntario', 'involuntario'] as const;
export type MotivoTermination = (typeof MOTIVO_TERMINATION_VALUES)[number];

// ME-fila6 D2 — especificacao "Turnover e desligamento" §3 (Formulario A,
// entrevista de desligamento voluntario). Rotulos em
// `src/lib/shared/terminationForms.ts`.
export const MOTIVO_SAIDA_VOLUNTARIA_VALUES = [
  'remuneracao_beneficios',
  'falta_perspectiva_carreira',
  'relacao_lideranca_direta',
  'sobrecarga_desequilibrio',
  'cultura_clima',
  'proposta_externa',
  'motivo_pessoal_familiar',
  'retorno_estudos',
  'motivo_saude',
  'outro',
] as const;
export type MotivoSaidaVoluntaria = (typeof MOTIVO_SAIDA_VOLUNTARIA_VALUES)[number];

export const RESPOSTA_SIM_NAO_TALVEZ_VALUES = ['sim', 'nao', 'talvez'] as const;
export type RespostaSimNaoTalvez = (typeof RESPOSTA_SIM_NAO_TALVEZ_VALUES)[number];

export const DESTINO_SAIDA_VALUES = [
  'mesmo_setor',
  'setor_diferente',
  'empreendedorismo_autonomo',
  'nao_buscando_emprego',
  'prefere_nao_informar',
] as const;
export type DestinoSaida = (typeof DESTINO_SAIDA_VALUES)[number];

// ME-fila6 D2 — especificacao §4 (Formulario B, justificativa de
// desligamento involuntario).
export const CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_VALUES = [
  'desempenho_abaixo',
  'violacao_conduta',
  'desalinhamento_cultural',
  'reducao_quadro',
  'fim_contrato_experiencia',
  'extincao_funcao_custo',
  'outro',
] as const;
export type CategoriaDesligamentoInvoluntario =
  (typeof CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_VALUES)[number];

export const RESPOSTA_SIM_NAO_NA_VALUES = ['sim', 'nao', 'nao_aplicavel'] as const;
export type RespostaSimNaoNa = (typeof RESPOSTA_SIM_NAO_NA_VALUES)[number];

// §15.3 — instrumentType (portalReminderLog + filtro §14.23). Extracao
// canonica do enum inline de tables.ts:1234 realizada em ME-058 (padrao
// bit-exact da extracao RF_EVENT_TYPE_VALUES em ME-057b). Consumido pela
// rota /pendencias-portal (§14.23) para narrowing do filtro dropdown,
// pelo motor `pendenciasEngine.ts` (agregacao cross-instrumento) e pelos
// mappings canonicos (label + coluna 6 da tabela).
export const PORTAL_INSTRUMENT_VALUES = [
  'meuPerfil',
  'autoAvaliacao',
  'avaliacaoLiderancaDireta',
  'radarNR1',
] as const;
export type PortalInstrumentType = (typeof PORTAL_INSTRUMENT_VALUES)[number];

// §15.3 — destinatarioTipo (notifications, emailQueue, emailNotifications).
// Extracao canonica do enum inline realizada em ME-059 (padrao bit-exact
// L98 estabelecido em ME-057b/ME-058). Consumido pelo motor de alertas
// `resolveDestinatarios` (3 trilhas — RH+Bruno padrao, apenas Bruno para
// D049, apenas RF para D050), pelo pipeline M5 (INSERT em notifications),
// pelo pipeline M7 (agrupamento em emailQueue), pelo endpoint canonico
// do sino `/api/notifications` (§10.2 filtro de contagem/lista) e por
// todos os testes de integracao do motor.
export const NOTIFICATION_DESTINATARIO_TIPO_VALUES = ['rh', 'bruno'] as const;
export type NotificationDestinatarioTipo = (typeof NOTIFICATION_DESTINATARIO_TIPO_VALUES)[number];

// §15.3 — tipoEnvio (emailQueue — 2 valores canonicos MVP). Extracao
// canonica do enum inline realizada em ME-059 (padrao L98 bit-exact).
// A tabela `emailNotifications.tipoEnvio` inclui o valor extra
// 'digest_diario' como reserva canonica de extensibilidade (§6.6), fora
// do escopo do motor de alertas ME-059 (o pipeline M7 nunca enfileira
// digest_diario). Consumido pelo pipeline M7, pelos testes de motor e
// pelo helper `nextWeeklyDigestDate` (calculo canonico de scheduledFor).
export const EMAIL_QUEUE_KIND_VALUES = ['imediato', 'digest_semanal'] as const;
export type EmailQueueKind = (typeof EMAIL_QUEUE_KIND_VALUES)[number];

// Guardas canonicas de contagem (RV-15: nenhum numero sem medicao — estas
// constantes sao as fontes literais das §15.1 e §15.2, contadas do proprio
// array pelo TypeScript).
export const DEPARTAMENTO_COUNT = 19 as const;
export const NOTIFICATION_TIPO_COUNT = 17 as const;
export const JOB_FAMILY_COUNT = 26 as const;
export const JOB_FAMILY_CANONICAL_COUNT = 6 as const;
export const JOB_FAMILY_CUSTOM_COUNT = 20 as const;

// Verificacao em tempo de compilacao: se alguem adicionar/remover valor sem
// mexer no COUNT correspondente, o TypeScript falha (largura tuple != numero).
type _AssertDepartamentoCount = (typeof DEPARTAMENTO_VALUES)['length'] extends 19 ? true : never;
type _AssertNotificationTipoCount = (typeof NOTIFICATION_TIPO_VALUES)['length'] extends 17
  ? true
  : never;
type _AssertNotificationDestinatarioTipoCount =
  (typeof NOTIFICATION_DESTINATARIO_TIPO_VALUES)['length'] extends 2 ? true : never;
type _AssertEmailQueueKindCount = (typeof EMAIL_QUEUE_KIND_VALUES)['length'] extends 2
  ? true
  : never;
type _AssertJobFamilyCount = (typeof JOB_FAMILY_VALUES)['length'] extends 26 ? true : never;
type _AssertJobFamilyCanonicalCount = (typeof JOB_FAMILY_CANONICAL_VALUES)['length'] extends 6
  ? true
  : never;
type _AssertJobFamilyCustomCount = (typeof JOB_FAMILY_CUSTOM_VALUES)['length'] extends 20
  ? true
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CHECK_DEPARTAMENTO: _AssertDepartamentoCount = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CHECK_NOTIFICATION_TIPO: _AssertNotificationTipoCount = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CHECK_NOTIFICATION_DESTINATARIO_TIPO: _AssertNotificationDestinatarioTipoCount = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CHECK_EMAIL_QUEUE_KIND: _AssertEmailQueueKindCount = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CHECK_JOB_FAMILY: _AssertJobFamilyCount = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CHECK_JOB_FAMILY_CANONICAL: _AssertJobFamilyCanonicalCount = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CHECK_JOB_FAMILY_CUSTOM: _AssertJobFamilyCustomCount = true;
