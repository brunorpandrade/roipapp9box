// ROIP APP 9BOX — schema Drizzle canonico (ME-002).
// Transpilacao linha-a-linha de migrations/0000_canonical.sql, que por sua vez
// e transpilacao canonica do DOC 01 pos-CC001. Ordem M001 -> M014.
// Convencoes:
//   - Uma tabela por bloco, na ordem exata da migration.
//   - Enums transversais §15 importados de ./enums (fonte unica).
//   - Enums locais (nao §15) declarados inline na coluna, literais da migration.
//   - CHECK constraints vivem SO na migration (S004): RV-12 proibe sql`` em src/;
//     Drizzle 0.45 exige sql`` para CHECK. Integridade e garantida pelo DB.
//   - FKs, UNIQUEs e indexes replicados literalmente da migration.
//   - Largura maxima 100 col, 1 statement por linha (RV-14).

import {
  boolean,
  char,
  date,
  decimal,
  index,
  int,
  json,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

import {
  ABA_UNLOCK_VALUES,
  DEPARTAMENTO_VALUES,
  JOB_FAMILY_VALUES,
  MOTIVO_TERMINATION_VALUES,
  NIVEL_HIERARQUICO_VALUES,
  ONBOARDING_ESTAGIO_VALUES,
  SEVERIDADE_VALUES,
  TIPO_ACESSO_VALUES,
  TIPO_CICLO_VALUES,
} from './enums';

// =====================================================================
// M001 — Nucleo cadastral
// =====================================================================

export const superAdmins = mysqlTable('superAdmins', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('passwordHash', { length: 255 }).notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
});

export const companies = mysqlTable('companies', {
  id: int('id').autoincrement().primaryKey(),
  razaoSocial: varchar('razaoSocial', { length: 255 }).notNull(),
  nomeFantasia: varchar('nomeFantasia', { length: 255 }).notNull(),
  cnpj: varchar('cnpj', { length: 14 }).notNull().unique(),
  telefone: varchar('telefone', { length: 20 }).notNull(),
  endereco: varchar('endereco', { length: 255 }).notNull(),
  cidade: varchar('cidade', { length: 100 }).notNull(),
  estado: char('estado', { length: 2 }).notNull(),
  logoUrl: varchar('logoUrl', { length: 500 }),
  contatoPrincipalNome: varchar('contatoPrincipalNome', { length: 255 }).notNull(),
  contatoPrincipalEmail: varchar('contatoPrincipalEmail', { length: 255 }).notNull(),
  contatoRHNome: varchar('contatoRHNome', { length: 255 }).notNull(),
  contatoRHEmail: varchar('contatoRHEmail', { length: 255 }).notNull(),
  segmento: mysqlEnum('segmento', [
    'Serviço',
    'Comércio',
    'Indústria',
    'Serviço+Comércio',
    'Serviço+Indústria',
    'Indústria+Comércio',
    'Serviço+Comércio+Indústria',
  ]).notNull(),
  tipoAtividade: varchar('tipoAtividade', { length: 255 }).notNull(),
  descricaoAtividade: text('descricaoAtividade').notNull(),
  contextoMercado: text('contextoMercado').notNull(),
  metaROIOperacional: decimal('metaROIOperacional', { precision: 5, scale: 2 }),
  metaROITatico: decimal('metaROITatico', { precision: 5, scale: 2 }),
  metaROIEstrategico: decimal('metaROIEstrategico', { precision: 5, scale: 2 }),
  roiSegmentoMinimo: decimal('roiSegmentoMinimo', { precision: 5, scale: 2 }),
  roiSegmentoMaximo: decimal('roiSegmentoMaximo', { precision: 5, scale: 2 }),
  folhaPercMinima: decimal('folhaPercMinima', { precision: 4, scale: 1 }),
  folhaPercMaxima: decimal('folhaPercMaxima', { precision: 4, scale: 1 }),
  thresholdDesempenhoBaixo: int('thresholdDesempenhoBaixo').default(60),
  thresholdDesempenhoMedio: int('thresholdDesempenhoMedio').default(85),
  thresholdPlenitudeBaixo: int('thresholdPlenitudeBaixo').default(50),
  thresholdPlenitudeMedio: int('thresholdPlenitudeMedio').default(75),
  modoAnoFiscal: mysqlEnum('modoAnoFiscal', ['padrao', 'customizado']).notNull().default('padrao'),
  mesInicioAnoFiscal: int('mesInicioAnoFiscal').notNull().default(1),
  mesKickoff: int('mesKickoff').notNull(),
  timezone: varchar('timezone', { length: 50 }).notNull().default('America/Sao_Paulo'),
  encarregadoLgpdNome: varchar('encarregadoLgpdNome', { length: 255 }),
  encarregadoLgpdEmail: varchar('encarregadoLgpdEmail', { length: 255 }),
  encarregadoLgpdTelefone: varchar('encarregadoLgpdTelefone', { length: 20 }),
  encarregadoLgpdPoliticaUrl: varchar('encarregadoLgpdPoliticaUrl', { length: 500 }),
  status: mysqlEnum('status', ['ativa', 'inativa']).default('inativa'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
});

export const companyMonthlyData = mysqlTable(
  'companyMonthlyData',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    mes: varchar('mes', { length: 7 }).notNull(),
    faturamentoBruto: decimal('faturamentoBruto', { precision: 15, scale: 2 }),
    diasUteis: int('diasUteis'),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqCompanyMonthly: uniqueIndex('uq_companyMonthly').on(t.companyId, t.mes),
  }),
);

export const cLevelMembers = mysqlTable(
  'cLevelMembers',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 255 }).notNull(),
    cpf: varchar('cpf', { length: 11 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    photoUrl: varchar('photoUrl', { length: 500 }),
    dataNascimento: date('dataNascimento').notNull(),
    dataAdmissao: date('dataAdmissao').notNull(),
    cargo: varchar('cargo', { length: 100 }).notNull(),
    descricaoCargo: text('descricaoCargo').notNull(),
    departamento: mysqlEnum('departamento', DEPARTAMENTO_VALUES).notNull(),
    custoMensal: decimal('custoMensal', { precision: 12, scale: 2 }).notNull(),
    acessoTotal: boolean('acessoTotal').default(true),
    isResponsavelFinanceiro: boolean('isResponsavelFinanceiro').notNull().default(false),
    status: mysqlEnum('status', ['ativo', 'inativo']).default('ativo'),
    passwordHash: varchar('passwordHash', { length: 255 }),
    passwordSet: boolean('passwordSet').default(false),
    lastActivity: timestamp('lastActivity'),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqClevelCpf: uniqueIndex('uq_clevel_cpf').on(t.companyId, t.cpf),
  }),
);

export const employees = mysqlTable(
  'employees',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 255 }).notNull(),
    cpf: varchar('cpf', { length: 11 }).notNull(),
    email: varchar('email', { length: 255 }),
    photoUrl: varchar('photoUrl', { length: 500 }),
    dataNascimento: date('dataNascimento').notNull(),
    dataAdmissao: date('dataAdmissao').notNull(),
    cbo: varchar('cbo', { length: 10 }).notNull(),
    descricaoCBO: varchar('descricaoCBO', { length: 255 }).notNull(),
    jobFamily: mysqlEnum('jobFamily', JOB_FAMILY_VALUES).notNull(),
    senioridade: mysqlEnum('senioridade', ['junior', 'pleno', 'senior']).notNull(),
    nivelHierarquico: mysqlEnum('nivelHierarquico', NIVEL_HIERARQUICO_VALUES).notNull(),
    departamento: mysqlEnum('departamento', DEPARTAMENTO_VALUES).notNull(),
    status: mysqlEnum('status', ['ativo', 'inativo']).default('ativo'),
    isRH: boolean('isRH').default(false),
    isLider: boolean('isLider').default(false),
    isResponsavelFinanceiro: boolean('isResponsavelFinanceiro').notNull().default(false),
    onboardingEstagio: mysqlEnum('onboardingEstagio', ONBOARDING_ESTAGIO_VALUES).default('treinar'),
    onboardingUltimoEstagio: mysqlEnum('onboardingUltimoEstagio', ONBOARDING_ESTAGIO_VALUES),
    passwordHash: varchar('passwordHash', { length: 255 }),
    passwordSet: boolean('passwordSet').default(false),
    lastActivity: timestamp('lastActivity'),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqEmployeeCpf: uniqueIndex('uq_employee_cpf').on(t.companyId, t.cpf),
  }),
);

export const employeeLeaderHistory = mysqlTable(
  'employeeLeaderHistory',
  {
    id: int('id').autoincrement().primaryKey(),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    liderId: int('liderId').references(() => employees.id, { onDelete: 'restrict' }),
    clevelId: int('clevelId').references(() => cLevelMembers.id, { onDelete: 'restrict' }),
    dataInicio: date('dataInicio').notNull(),
    dataFim: date('dataFim'),
    reason: varchar('reason', { length: 500 }).notNull(),
    transferBatchId: char('transferBatchId', { length: 36 }).notNull(),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    idxElhEmployeeFim: index('idx_elh_employee_fim').on(t.employeeId, t.dataFim),
    idxElhBatch: index('idx_elh_batch').on(t.transferBatchId),
  }),
);

export const employeeGoals = mysqlTable(
  'employeeGoals',
  {
    id: int('id').autoincrement().primaryKey(),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    jobFamily: mysqlEnum('jobFamily', JOB_FAMILY_VALUES).notNull(),
    variableIndex: int('variableIndex').notNull(),
    variableName: varchar('variableName', { length: 255 }).notNull(),
    unit: varchar('unit', { length: 50 }).notNull(),
    weight: decimal('weight', { precision: 5, scale: 2 }).notNull(),
    goal: decimal('goal', { precision: 15, scale: 2 }).notNull(),
    updatedBy: mysqlEnum('updatedBy', ['rh', 'lider', 'super_admin']).notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqGoal: uniqueIndex('uq_goal').on(t.employeeId, t.variableIndex),
  }),
);

export const accessTokens = mysqlTable('accessTokens', {
  id: int('id').autoincrement().primaryKey(),
  userType: mysqlEnum('userType', ['employee', 'clevel', 'super_admin']).notNull(),
  userId: int('userId').notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  type: mysqlEnum('type', ['first_access', 'password_reset']).notNull(),
  usedAt: timestamp('usedAt'),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
});

export const individualProfilePlaceholders = mysqlTable('individualProfilePlaceholders', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('companyId')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }),
  userType: mysqlEnum('userType', ['employee', 'clevel']).notNull(),
  userId: int('userId').notNull(),
  status: mysqlEnum('status', [
    'pendente',
    'em_andamento',
    'respondido',
    'inconsistente',
    'aguardando_nova_resposta',
  ])
    .notNull()
    .default('pendente'),
  createdAt: timestamp('createdAt').defaultNow(),
  respondidoEm: timestamp('respondidoEm'),
});

// =====================================================================
// M002 — Papeis funcionais
// =====================================================================

export const responsavelFinanceiroTransferLog = mysqlTable('responsavelFinanceiroTransferLog', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('companyId')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }),
  previousHolderType: mysqlEnum('previousHolderType', ['employee', 'cLevel', 'none']).notNull(),
  previousHolderId: int('previousHolderId'),
  newHolderType: mysqlEnum('newHolderType', ['employee', 'cLevel', 'none']).notNull(),
  newHolderId: int('newHolderId'),
  actorSuperAdminId: int('actorSuperAdminId')
    .notNull()
    .references(() => superAdmins.id, { onDelete: 'restrict' }),
  eventType: mysqlEnum('eventType', ['atribuido', 'transferido', 'removido']).notNull(),
  reason: varchar('reason', { length: 500 }).notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
});

// =====================================================================
// M003 — Referencia de departamentos (seed das 19 linhas na migration).
// =====================================================================

export const departments = mysqlTable('departments', {
  id: int('id').autoincrement().primaryKey(),
  nome: varchar('nome', { length: 100 }).notNull().unique(),
  createdAt: timestamp('createdAt').defaultNow(),
});

// =====================================================================
// M004 — Desempenho e diagnostico
// (monthlyUnlockLog nasce SEM unlockRequestId; adicionado em M012 §17.2 —
// declaramos com a coluna ja presente, pois o schema TS reflete o estado final).
// =====================================================================

export const performanceData = mysqlTable(
  'performanceData',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    mes: varchar('mes', { length: 7 }).notNull(),
    custoTotalMes: decimal('custoTotalMes', { precision: 12, scale: 2 }),
    faltas: int('faltas').default(0),
    diasUteis: int('diasUteis'),
    assiduidade: decimal('assiduidade', { precision: 5, scale: 2 }),
    indiceDesempenho: decimal('indiceDesempenho', { precision: 6, scale: 4 }),
    calculadoEm: timestamp('calculadoEm'),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqPerfData: uniqueIndex('uq_perfData').on(t.companyId, t.employeeId, t.mes),
  }),
);

export const performanceVariableData = mysqlTable(
  'performanceVariableData',
  {
    id: int('id').autoincrement().primaryKey(),
    performanceDataId: int('performanceDataId')
      .notNull()
      .references(() => performanceData.id, { onDelete: 'cascade' }),
    variableIndex: int('variableIndex').notNull(),
    demanda: decimal('demanda', { precision: 15, scale: 2 }),
    executado: decimal('executado', { precision: 15, scale: 2 }),
    desempenho: decimal('desempenho', { precision: 6, scale: 4 }),
    peso: decimal('peso', { precision: 5, scale: 2 }),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    uqPerfVar: uniqueIndex('uq_perfVar').on(t.performanceDataId, t.variableIndex),
  }),
);

export const performanceQuarterlyData = mysqlTable(
  'performanceQuarterlyData',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    trimestre: varchar('trimestre', { length: 7 }).notNull(),
    indiceDesempenho: decimal('indiceDesempenho', { precision: 6, scale: 4 }),
    scoreDesempenho: decimal('scoreDesempenho', { precision: 6, scale: 2 }),
    capacidadeOciosa: decimal('capacidadeOciosa', { precision: 5, scale: 2 }),
    faixaDesempenho: mysqlEnum('faixaDesempenho', ['baixo', 'medio', 'alto']),
    custoMedioTrimestral: decimal('custoMedioTrimestral', { precision: 12, scale: 2 }),
    metaROI: decimal('metaROI', { precision: 5, scale: 2 }),
    retornoPotencial: decimal('retornoPotencial', { precision: 15, scale: 2 }),
    participacao: decimal('participacao', { precision: 8, scale: 6 }),
    retornoEstimado: decimal('retornoEstimado', { precision: 15, scale: 2 }),
    roiEstimado: decimal('roiEstimado', { precision: 6, scale: 4 }),
    percMetaAtingida: decimal('percMetaAtingida', { precision: 6, scale: 2 }),
    diagnosticoIA: text('diagnosticoIA'),
    diagnosticoIAgeradoEm: timestamp('diagnosticoIAgeradoEm'),
    calculadoEm: timestamp('calculadoEm').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqPerfQuarter: uniqueIndex('uq_perfQuarter').on(t.companyId, t.employeeId, t.trimestre),
  }),
);

export const performanceMultiplierLog = mysqlTable('performanceMultiplierLog', {
  id: int('id').autoincrement().primaryKey(),
  quarterlyDataId: int('quarterlyDataId')
    .notNull()
    .references(() => performanceQuarterlyData.id, { onDelete: 'cascade' }),
  employeeId: int('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'restrict' }),
  trimestre: varchar('trimestre', { length: 7 }).notNull(),
  nivelHierarquico: mysqlEnum('nivelHierarquico', NIVEL_HIERARQUICO_VALUES).notNull(),
  metaROIUsada: decimal('metaROIUsada', { precision: 5, scale: 2 }).notNull(),
  ajusteRetroativo: boolean('ajusteRetroativo').default(false),
  calculadoEm: timestamp('calculadoEm').defaultNow(),
  createdAt: timestamp('createdAt').defaultNow(),
});

export const companyEconomicDiagnosis = mysqlTable(
  'companyEconomicDiagnosis',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    trimestre: varchar('trimestre', { length: 7 }).notNull(),
    faturamentoMedioTrimestral: decimal('faturamentoMedioTrimestral', {
      precision: 15,
      scale: 2,
    }).notNull(),
    folhaTotalMedia: decimal('folhaTotalMedia', { precision: 15, scale: 2 }).notNull(),
    faturamentoPotencial: decimal('faturamentoPotencial', { precision: 15, scale: 2 }),
    roiEmpresa: decimal('roiEmpresa', { precision: 6, scale: 4 }).notNull(),
    folhaPorcentagem: decimal('folhaPorcentagem', { precision: 5, scale: 2 }).notNull(),
    roiSegmentoMinimo: decimal('roiSegmentoMinimo', { precision: 5, scale: 2 }),
    roiSegmentoMaximo: decimal('roiSegmentoMaximo', { precision: 5, scale: 2 }),
    roiMuitoBom: decimal('roiMuitoBom', { precision: 5, scale: 2 }),
    faturamentoIdeal: decimal('faturamentoIdeal', { precision: 15, scale: 2 }),
    statusDiagnostico: mysqlEnum('statusDiagnostico', [
      'excelente',
      'muito_bom',
      'aceitavel',
      'critico',
      'sem_referencia',
    ]).notNull(),
    calculadoEm: timestamp('calculadoEm').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqEconDiag: uniqueIndex('uq_econDiag').on(t.companyId, t.trimestre),
  }),
);

export const monthlyClosureStatus = mysqlTable(
  'monthlyClosureStatus',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    mes: varchar('mes', { length: 7 }).notNull(),
    status: mysqlEnum('status', ['aberto', 'fechado', 'desbloqueado']).notNull().default('aberto'),
    dataFechamento: timestamp('dataFechamento'),
    processadoEm: timestamp('processadoEm'),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqClosure: uniqueIndex('uq_closure').on(t.companyId, t.mes),
  }),
);

export const monthlyUnlockLog = mysqlTable('monthlyUnlockLog', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('companyId')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }),
  mes: varchar('mes', { length: 7 }).notNull(),
  aba: mysqlEnum('aba', ABA_UNLOCK_VALUES).notNull(),
  liderId: int('liderId'),
  liderTipo: mysqlEnum('liderTipo', ['employee', 'clevel']),
  desbloqueadoPor: int('desbloqueadoPor')
    .notNull()
    .references(() => superAdmins.id, { onDelete: 'restrict' }),
  justificativa: varchar('justificativa', { length: 500 }).notNull(),
  desbloqueadoEm: timestamp('desbloqueadoEm').defaultNow(),
  expiraEm: timestamp('expiraEm').notNull(),
  houveAlteracao: boolean('houveAlteracao').default(false),
  // unlockRequestId: adicionado via ALTER em M012; FK resolvida abaixo.
  unlockRequestId: int('unlockRequestId'),
  createdAt: timestamp('createdAt').defaultNow(),
});

// =====================================================================
// M005 — Instrumentos e 9-Box
// (chk_iC_avaliador_unico vive na migration — S004)
// =====================================================================

export const instrumentA_responses = mysqlTable(
  'instrumentA_responses',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    trimestre: varchar('trimestre', { length: 7 }).notNull(),
    dimensao: tinyint('dimensao').notNull(),
    itemIndex: tinyint('itemIndex').notNull(),
    valor: tinyint('valor').notNull(),
    respondidoEm: timestamp('respondidoEm').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    uqIAUnicaResposta: uniqueIndex('uq_iA_unica_resposta').on(
      t.employeeId,
      t.trimestre,
      t.dimensao,
      t.itemIndex,
    ),
  }),
);

export const instrumentC_assessments = mysqlTable(
  'instrumentC_assessments',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    liderId: int('liderId').references(() => employees.id, { onDelete: 'restrict' }),
    clevelId: int('clevelId').references(() => cLevelMembers.id, { onDelete: 'restrict' }),
    trimestre: varchar('trimestre', { length: 7 }).notNull(),
    dimensao: tinyint('dimensao').notNull(),
    itemIndex: tinyint('itemIndex').notNull(),
    valor: tinyint('valor').notNull(),
    respondidoEm: timestamp('respondidoEm').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    uqICUnicaAvaliacao: uniqueIndex('uq_iC_unica_avaliacao').on(
      t.employeeId,
      t.trimestre,
      t.dimensao,
      t.itemIndex,
    ),
  }),
);

export const plenitudeData = mysqlTable(
  'plenitudeData',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    trimestre: varchar('trimestre', { length: 7 }).notNull(),
    scoreA: decimal('scoreA', { precision: 5, scale: 2 }),
    scoreC: decimal('scoreC', { precision: 5, scale: 2 }),
    plenitudeScore: decimal('plenitudeScore', { precision: 5, scale: 2 }),
    faixaPlenitude: mysqlEnum('faixaPlenitude', ['baixa', 'media', 'alta']),
    divergencia: decimal('divergencia', { precision: 5, scale: 2 }),
    alertaDivergencia: boolean('alertaDivergencia').default(false),
    engajamentoA: decimal('engajamentoA', { precision: 5, scale: 2 }),
    engajamentoC: decimal('engajamentoC', { precision: 5, scale: 2 }),
    desenvolvimentoA: decimal('desenvolvimentoA', { precision: 5, scale: 2 }),
    desenvolvimentoC: decimal('desenvolvimentoC', { precision: 5, scale: 2 }),
    pertencimentoA: decimal('pertencimentoA', { precision: 5, scale: 2 }),
    pertencimentoC: decimal('pertencimentoC', { precision: 5, scale: 2 }),
    realizacaoA: decimal('realizacaoA', { precision: 5, scale: 2 }),
    realizacaoC: decimal('realizacaoC', { precision: 5, scale: 2 }),
    calculadoEm: timestamp('calculadoEm').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqPlenitude: uniqueIndex('uq_plenitude').on(t.companyId, t.employeeId, t.trimestre),
  }),
);

export const nineBoxClassifications = mysqlTable(
  'nineBoxClassifications',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    trimestre: varchar('trimestre', { length: 7 }).notNull(),
    scoreDesempenho: decimal('scoreDesempenho', { precision: 6, scale: 2 }),
    plenitudeScore: decimal('plenitudeScore', { precision: 5, scale: 2 }),
    posicaoX: mysqlEnum('posicaoX', ['baixo', 'medio', 'alto']).notNull(),
    posicaoY: mysqlEnum('posicaoY', ['baixa', 'media', 'alta']).notNull(),
    quadrante: mysqlEnum('quadrante', [
      'ALTO IMPACTO',
      'DESEMPENHO REPRESADO',
      'POTENCIAL SUBUTILIZADO',
      'ALTA ENTREGA',
      'EQUILÍBRIO FRÁGIL',
      'DESEMPENHO CRÍTICO',
      'RISCO DE ESGOTAMENTO',
      'DESGASTE OCULTO',
      'RISCO CRÍTICO',
    ]).notNull(),
    quadranteAnterior: varchar('quadranteAnterior', { length: 50 }),
    direcaoMovimento: mysqlEnum('direcaoMovimento', [
      'subiu',
      'desceu',
      'lateral',
      'estavel',
      'primeira_vez',
    ]),
    calculadoEm: timestamp('calculadoEm').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqNineBox: uniqueIndex('uq_nineBox').on(t.companyId, t.employeeId, t.trimestre),
  }),
);

export const instrumentUnlockLog = mysqlTable('instrumentUnlockLog', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('companyId')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }),
  employeeId: int('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'restrict' }),
  trimestre: varchar('trimestre', { length: 7 }).notNull(),
  instrumento: mysqlEnum('instrumento', ['A', 'C']).notNull(),
  desbloqueadoPor: int('desbloqueadoPor')
    .notNull()
    .references(() => superAdmins.id, { onDelete: 'restrict' }),
  justificativa: text('justificativa').notNull(),
  desbloqueadoEm: timestamp('desbloqueadoEm').defaultNow(),
  expiraEm: timestamp('expiraEm').notNull(),
  houveAlteracao: boolean('houveAlteracao').default(false),
  ajusteRetroativo: boolean('ajusteRetroativo').default(false),
  createdAt: timestamp('createdAt').defaultNow(),
});

export const nineBoxCalculationLog = mysqlTable('nineBoxCalculationLog', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('companyId')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }),
  employeeId: int('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'restrict' }),
  trimestre: varchar('trimestre', { length: 7 }).notNull(),
  status: mysqlEnum('status', [
    'calculado',
    'eixo_x_ausente',
    'eixo_y_ausente',
    'ambos_ausentes',
  ]).notNull(),
  observacao: text('observacao'),
  registradoEm: timestamp('registradoEm').defaultNow(),
  createdAt: timestamp('createdAt').defaultNow(),
});

// =====================================================================
// M006 — Instrumento D, IQL e Clima
// (chk_iD_avaliado_unico e chk_iqlData_avaliado_unico vivem na migration — S004)
// =====================================================================

export const instrumentD_responses = mysqlTable(
  'instrumentD_responses',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    respondenteId: int('respondenteId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    liderId: int('liderId').references(() => employees.id, { onDelete: 'restrict' }),
    clevelId: int('clevelId').references(() => cLevelMembers.id, { onDelete: 'restrict' }),
    trimestre: varchar('trimestre', { length: 7 }).notNull(),
    dimensao: tinyint('dimensao').notNull(),
    itemIndex: tinyint('itemIndex').notNull(),
    valor: tinyint('valor').notNull(),
    versaoInstrumento: tinyint('versaoInstrumento').notNull().default(1),
    respondidoEm: timestamp('respondidoEm').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    uqIDUnicaResposta: uniqueIndex('uq_iD_unica_resposta').on(
      t.respondenteId,
      t.trimestre,
      t.dimensao,
      t.itemIndex,
    ),
    idxIDLiderTrim: index('idx_iD_lider_trim').on(t.liderId, t.trimestre),
    idxIDClevelTrim: index('idx_iD_clevel_trim').on(t.clevelId, t.trimestre),
    idxIDRespTrim: index('idx_iD_resp_trim').on(t.respondenteId, t.trimestre),
  }),
);

export const iqlData = mysqlTable(
  'iqlData',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    liderId: int('liderId').references(() => employees.id, { onDelete: 'restrict' }),
    clevelId: int('clevelId').references(() => cLevelMembers.id, { onDelete: 'restrict' }),
    trimestre: varchar('trimestre', { length: 7 }).notNull(),
    scoreDirecionamentoClareza: decimal('scoreDirecionamentoClareza', { precision: 5, scale: 2 }),
    scoreDesenvolvimentoApoio: decimal('scoreDesenvolvimentoApoio', { precision: 5, scale: 2 }),
    scoreRelacionamentoConfianca: decimal('scoreRelacionamentoConfianca', {
      precision: 5,
      scale: 2,
    }),
    scoreGestaoResultados: decimal('scoreGestaoResultados', { precision: 5, scale: 2 }),
    iql: decimal('iql', { precision: 5, scale: 2 }),
    countRespondentes: int('countRespondentes').notNull().default(0),
    countRespondentesElegiveis: int('countRespondentesElegiveis').notNull().default(0),
    calculadoEm: timestamp('calculadoEm').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqIqlDataLider: uniqueIndex('uq_iqlData_lider').on(t.companyId, t.liderId, t.trimestre),
    uqIqlDataClevel: uniqueIndex('uq_iqlData_clevel').on(t.companyId, t.clevelId, t.trimestre),
  }),
);

export const climateEngagementData = mysqlTable(
  'climateEngagementData',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    escopo: mysqlEnum('escopo', ['empresa', 'departamento', 'equipe']).notNull(),
    departamento: varchar('departamento', { length: 120 }),
    liderId: int('liderId').references(() => employees.id, { onDelete: 'restrict' }),
    trimestre: varchar('trimestre', { length: 7 }).notNull(),
    notaClima: decimal('notaClima', { precision: 4, scale: 2 }),
    adesao: decimal('adesao', { precision: 5, scale: 2 }),
    countCobertura: int('countCobertura').notNull().default(0),
    countTotal: int('countTotal').notNull().default(0),
    notaEngajamento: decimal('notaEngajamento', { precision: 4, scale: 2 }),
    notaDesenvolvimento: decimal('notaDesenvolvimento', { precision: 4, scale: 2 }),
    notaPertencimento: decimal('notaPertencimento', { precision: 4, scale: 2 }),
    notaRealizacao: decimal('notaRealizacao', { precision: 4, scale: 2 }),
    notaQuestao01: decimal('notaQuestao01', { precision: 4, scale: 2 }),
    notaQuestao02: decimal('notaQuestao02', { precision: 4, scale: 2 }),
    notaQuestao03: decimal('notaQuestao03', { precision: 4, scale: 2 }),
    notaQuestao04: decimal('notaQuestao04', { precision: 4, scale: 2 }),
    notaQuestao05: decimal('notaQuestao05', { precision: 4, scale: 2 }),
    notaQuestao06: decimal('notaQuestao06', { precision: 4, scale: 2 }),
    notaQuestao07: decimal('notaQuestao07', { precision: 4, scale: 2 }),
    notaQuestao08: decimal('notaQuestao08', { precision: 4, scale: 2 }),
    notaQuestao09: decimal('notaQuestao09', { precision: 4, scale: 2 }),
    notaQuestao10: decimal('notaQuestao10', { precision: 4, scale: 2 }),
    notaQuestao11: decimal('notaQuestao11', { precision: 4, scale: 2 }),
    notaQuestao12: decimal('notaQuestao12', { precision: 4, scale: 2 }),
    notaQuestao13: decimal('notaQuestao13', { precision: 4, scale: 2 }),
    notaQuestao14: decimal('notaQuestao14', { precision: 4, scale: 2 }),
    notaQuestao15: decimal('notaQuestao15', { precision: 4, scale: 2 }),
    notaQuestao16: decimal('notaQuestao16', { precision: 4, scale: 2 }),
    notaQuestao17: decimal('notaQuestao17', { precision: 4, scale: 2 }),
    notaQuestao18: decimal('notaQuestao18', { precision: 4, scale: 2 }),
    notaQuestao19: decimal('notaQuestao19', { precision: 4, scale: 2 }),
    notaQuestao20: decimal('notaQuestao20', { precision: 4, scale: 2 }),
    calculadoEm: timestamp('calculadoEm').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqClimateEscopo: uniqueIndex('uq_climate_escopo').on(
      t.companyId,
      t.escopo,
      t.departamento,
      t.liderId,
      t.trimestre,
    ),
  }),
);

// =====================================================================
// M007 — Dialogos e IA
// =====================================================================

export const developmentDialogs = mysqlTable(
  'developmentDialogs',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    liderId: int('liderId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    titulo: varchar('titulo', { length: 255 }),
    corpo: text('corpo'),
    status: mysqlEnum('status', ['verde', 'vermelho']).notNull().default('verde'),
    pendencia: boolean('pendencia').notNull().default(false),
    arquivado: boolean('arquivado').notNull().default(false),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    idxDdLiderEmp: index('idx_dd_lider_emp').on(t.liderId, t.employeeId),
    idxDdEmpArq: index('idx_dd_emp_arq').on(t.employeeId, t.arquivado),
    idxDdLiderPend: index('idx_dd_lider_pend').on(t.liderId, t.pendencia, t.arquivado),
  }),
);

export const aiConversations = mysqlTable(
  'aiConversations',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    userId: int('userId').notNull(),
    userType: mysqlEnum('userType', ['employee', 'clevel', 'super_admin']).notNull(),
    dashboardLevel: mysqlEnum('dashboardLevel', [
      'global',
      'departamento',
      'equipe',
      'individual',
    ]).notNull(),
    contextId: int('contextId'),
    role: mysqlEnum('role', ['user', 'assistant']).notNull(),
    content: text('content').notNull(),
    trimestre: varchar('trimestre', { length: 7 }),
    archivedAt: timestamp('archivedAt'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (t) => ({
    idxAcUserCtx: index('idx_ac_user_ctx').on(
      t.userId,
      t.userType,
      t.dashboardLevel,
      t.contextId,
      t.archivedAt,
    ),
    idxAcArchived: index('idx_ac_archived').on(t.archivedAt),
  }),
);

// =====================================================================
// M008 — Perfil Individual
// =====================================================================

export const individualProfileAssessments = mysqlTable(
  'individualProfileAssessments',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    userType: mysqlEnum('userType', ['employee', 'clevel']).notNull(),
    userId: int('userId').notNull(),
    tentativa: int('tentativa').notNull().default(1),
    status: mysqlEnum('status', ['em_andamento', 'enviado', 'inconsistente'])
      .notNull()
      .default('em_andamento'),
    blocoAtual: int('blocoAtual').notNull().default(1),
    blocosCompletos: json('blocosCompletos'),
    respostas: json('respostas'),
    confiabilidadeNivel: mysqlEnum('confiabilidadeNivel', ['alta', 'moderada', 'baixa']),
    ia_att: decimal('ia_att', { precision: 4, scale: 2 }),
    ia_soc: decimal('ia_soc', { precision: 4, scale: 2 }),
    ia_acq: decimal('ia_acq', { precision: 4, scale: 2 }),
    ia_cons: decimal('ia_cons', { precision: 4, scale: 2 }),
    ia_ext: decimal('ia_ext', { precision: 4, scale: 2 }),
    retesteLiberadoPor: int('retesteLiberadoPor'),
    retesteLiberadoTipo: mysqlEnum('retesteLiberadoTipo', ['rh', 'super_admin']),
    retesteLiberadoEm: timestamp('retesteLiberadoEm'),
    enviadoEm: timestamp('enviadoEm'),
    calculadoEm: timestamp('calculadoEm'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqIpaTentativa: uniqueIndex('uq_ipa_tentativa').on(
      t.companyId,
      t.userType,
      t.userId,
      t.tentativa,
    ),
    idxIpaStatus: index('idx_ipa_status').on(t.companyId, t.status),
    idxIpaUser: index('idx_ipa_user').on(t.companyId, t.userType, t.userId),
  }),
);

export const individualProfileScores = mysqlTable(
  'individualProfileScores',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    userType: mysqlEnum('userType', ['employee', 'clevel']).notNull(),
    userId: int('userId').notNull(),
    assessmentId: int('assessmentId')
      .notNull()
      .references(() => individualProfileAssessments.id, { onDelete: 'restrict' }),
    tentativa: int('tentativa').notNull().default(1),
    post_assert: decimal('post_assert', { precision: 5, scale: 2 }),
    post_tarefas: decimal('post_tarefas', { precision: 5, scale: 2 }),
    post_pessoas: decimal('post_pessoas', { precision: 5, scale: 2 }),
    post_pressao: decimal('post_pressao', { precision: 5, scale: 2 }),
    est_abert: decimal('est_abert', { precision: 5, scale: 2 }),
    est_disc: decimal('est_disc', { precision: 5, scale: 2 }),
    est_ext: decimal('est_ext', { precision: 5, scale: 2 }),
    est_amab: decimal('est_amab', { precision: 5, scale: 2 }),
    est_estab: decimal('est_estab', { precision: 5, scale: 2 }),
    mot_maestria: decimal('mot_maestria', { precision: 5, scale: 2 }),
    mot_lideranca: decimal('mot_lideranca', { precision: 5, scale: 2 }),
    mot_autonomia: decimal('mot_autonomia', { precision: 5, scale: 2 }),
    mot_seguranca: decimal('mot_seguranca', { precision: 5, scale: 2 }),
    mot_proposito: decimal('mot_proposito', { precision: 5, scale: 2 }),
    equ_autocons: decimal('equ_autocons', { precision: 5, scale: 2 }),
    equ_autogest: decimal('equ_autogest', { precision: 5, scale: 2 }),
    equ_leitura: decimal('equ_leitura', { precision: 5, scale: 2 }),
    equ_influencia: decimal('equ_influencia', { precision: 5, scale: 2 }),
    equ_indice: decimal('equ_indice', { precision: 5, scale: 2 }),
    ass_sabed: decimal('ass_sabed', { precision: 5, scale: 2 }),
    ass_coragem: decimal('ass_coragem', { precision: 5, scale: 2 }),
    ass_humanid: decimal('ass_humanid', { precision: 5, scale: 2 }),
    ass_justica: decimal('ass_justica', { precision: 5, scale: 2 }),
    ass_temper: decimal('ass_temper', { precision: 5, scale: 2 }),
    ass_transc: decimal('ass_transc', { precision: 5, scale: 2 }),
    perfilComportamental: varchar('perfilComportamental', { length: 60 }),
    vetorDominante: varchar('vetorDominante', { length: 30 }),
    vetorSustentacao: varchar('vetorSustentacao', { length: 30 }),
    vetorNegligenciado: varchar('vetorNegligenciado', { length: 30 }),
    top3Assinatura: json('top3Assinatura'),
    flags: json('flags'),
    resumoJson: json('resumoJson'),
    expandidoJson: json('expandidoJson'),
    resumoGeradoEm: timestamp('resumoGeradoEm'),
    expandidoGeradoEm: timestamp('expandidoGeradoEm'),
    exibirConfirmacaoAte: timestamp('exibirConfirmacaoAte'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqIpsTentativa: uniqueIndex('uq_ips_tentativa').on(
      t.companyId,
      t.userType,
      t.userId,
      t.tentativa,
    ),
    idxIpsUser: index('idx_ips_user').on(t.companyId, t.userType, t.userId),
  }),
);

// =====================================================================
// M009 — Radar NR-1 (depende de M003 departments)
// (chk_datas, chk_fator, chk_itemIndex, chk_valor, chk_score_fator,
//  chk_score_range vivem na migration — S004)
// =====================================================================

export const copsoqCycles = mysqlTable(
  'copsoqCycles',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    ciclo: varchar('ciclo', { length: 20 }).notNull(),
    dataAbertura: date('dataAbertura').notNull(),
    dataFechamento: date('dataFechamento').notNull(),
    status: mysqlEnum('status', ['agendado', 'aberto', 'fechado']).notNull().default('agendado'),
    configuradoPorEmployeeId: int('configuradoPorEmployeeId').references(() => employees.id, {
      onDelete: 'restrict',
    }),
    configuradoPorSuperAdminId: int('configuradoPorSuperAdminId').references(() => superAdmins.id, {
      onDelete: 'restrict',
    }),
    configuradoEm: timestamp('configuradoEm').defaultNow(),
    dataFechamentoOriginal: date('dataFechamentoOriginal'),
    ultimaEdicaoPorEmployeeId: int('ultimaEdicaoPorEmployeeId').references(() => employees.id, {
      onDelete: 'restrict',
    }),
    ultimaEdicaoPorSuperAdminId: int('ultimaEdicaoPorSuperAdminId').references(
      () => superAdmins.id,
      { onDelete: 'restrict' },
    ),
    ultimaEdicaoEm: timestamp('ultimaEdicaoEm'),
    ultimaEdicaoJustificativa: text('ultimaEdicaoJustificativa'),
    abertoEm: timestamp('abertoEm'),
    fechadoEm: timestamp('fechadoEm'),
    departamentoCriticoDepartamentoId: int('departamentoCriticoDepartamentoId').references(
      () => departments.id,
      { onDelete: 'set null' },
    ),
    departamentoCriticoDepartamentoNome: varchar('departamentoCriticoDepartamentoNome', {
      length: 200,
    }),
    departamentosAmostraInsuficiente: json('departamentosAmostraInsuficiente'),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqCopsoqCyclesCiclo: uniqueIndex('uq_copsoqCycles_ciclo').on(t.companyId, t.ciclo),
    idxCopsoqCyclesCompanyStatus: index('idx_copsoqCycles_company_status').on(
      t.companyId,
      t.status,
    ),
    idxCopsoqCyclesStatusDataAbertura: index('idx_copsoqCycles_status_dataAbertura').on(
      t.status,
      t.dataAbertura,
    ),
    idxCopsoqCyclesStatusDataFechamento: index('idx_copsoqCycles_status_dataFechamento').on(
      t.status,
      t.dataFechamento,
    ),
  }),
);

export const copsoqCycleSnapshot = mysqlTable(
  'copsoqCycleSnapshot',
  {
    id: int('id').autoincrement().primaryKey(),
    cicloDbId: int('cicloDbId')
      .notNull()
      .references(() => copsoqCycles.id, { onDelete: 'cascade' }),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    departamentoId: int('departamentoId').references(() => departments.id, {
      onDelete: 'set null',
    }),
    snapshotEm: timestamp('snapshotEm').defaultNow(),
    respondeu: boolean('respondeu').default(false),
    respondidoEm: timestamp('respondidoEm'),
    tempoRespostaSegundos: int('tempoRespostaSegundos'),
    respostaInvalida: boolean('respostaInvalida').default(false),
    motivoInvalidade: mysqlEnum('motivoInvalidade', ['uniformidade', 'tempo_baixo']),
    inativadoAposSnapshot: boolean('inativadoAposSnapshot').default(false),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    uqSnapshot: uniqueIndex('uq_snapshot').on(t.cicloDbId, t.employeeId),
    idxSnapshotCicloDept: index('idx_snapshot_ciclo_dept').on(t.cicloDbId, t.departamentoId),
  }),
);

export const copsoq_responses = mysqlTable(
  'copsoq_responses',
  {
    id: int('id').autoincrement().primaryKey(),
    cicloDbId: int('cicloDbId')
      .notNull()
      .references(() => copsoqCycles.id, { onDelete: 'cascade' }),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    fator: tinyint('fator').notNull(),
    itemIndex: tinyint('itemIndex').notNull(),
    valor: tinyint('valor').notNull(),
    versaoInstrumento: varchar('versaoInstrumento', { length: 20 })
      .notNull()
      .default('placeholder_MVP_v1'),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    uqResposta: uniqueIndex('uq_resposta').on(t.cicloDbId, t.employeeId, t.fator, t.itemIndex),
    idxResponsesCicloEmployee: index('idx_responses_ciclo_employee').on(t.cicloDbId, t.employeeId),
    idxResponsesCicloFator: index('idx_responses_ciclo_fator').on(t.cicloDbId, t.fator),
  }),
);

export const copsoqFactorScores = mysqlTable(
  'copsoqFactorScores',
  {
    id: int('id').autoincrement().primaryKey(),
    cicloDbId: int('cicloDbId')
      .notNull()
      .references(() => copsoqCycles.id, { onDelete: 'cascade' }),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    escopo: mysqlEnum('escopo', ['empresa', 'departamento', 'agregacao']).notNull(),
    escopoDepartamentoId: int('escopoDepartamentoId').references(() => departments.id, {
      onDelete: 'set null',
    }),
    escopoNomeAgregacao: varchar('escopoNomeAgregacao', { length: 500 }),
    agregadoDe: json('agregadoDe'),
    fator: tinyint('fator').notNull(),
    score: decimal('score', { precision: 5, scale: 2 }).notNull(),
    countRespondentes: int('countRespondentes').notNull(),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    uqScore: uniqueIndex('uq_score').on(
      t.cicloDbId,
      t.escopo,
      t.escopoDepartamentoId,
      t.escopoNomeAgregacao,
      t.fator,
    ),
    idxScoresCiclo: index('idx_scores_ciclo').on(t.cicloDbId),
    idxScoresCompanyFator: index('idx_scores_company_fator').on(t.companyId, t.fator),
  }),
);

export const nr1AreaDivergenceAnalysis = mysqlTable(
  'nr1AreaDivergenceAnalysis',
  {
    id: int('id').autoincrement().primaryKey(),
    cicloDbId: int('cicloDbId')
      .notNull()
      .references(() => copsoqCycles.id, { onDelete: 'cascade' }),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    escopo: mysqlEnum('escopo', ['departamento', 'agregacao']).notNull(),
    escopoDepartamentoId: int('escopoDepartamentoId').references(() => departments.id, {
      onDelete: 'set null',
    }),
    escopoNomeAgregacao: varchar('escopoNomeAgregacao', { length: 500 }),
    classificacao: mysqlEnum('classificacao', [
      'convergente',
      'divergencia_critica',
      'divergencia_positiva',
    ]).notNull(),
    fatoresDivergentesCriticos: json('fatoresDivergentesCriticos'),
    fatoresDivergentesPositivos: json('fatoresDivergentesPositivos'),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    uqDivergence: uniqueIndex('uq_divergence').on(
      t.cicloDbId,
      t.escopo,
      t.escopoDepartamentoId,
      t.escopoNomeAgregacao,
    ),
  }),
);

export const radarNR1Reports = mysqlTable('radarNR1Reports', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('companyId').references(() => companies.id, { onDelete: 'cascade' }),
  cicloDbId: int('cicloDbId').references(() => copsoqCycles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').defaultNow(),
});

// =====================================================================
// M010 — Alertas e notificacoes (depende de M003 e M009)
// (tipo e VARCHAR(50) no schema; enum logico validado no emitAlert)
// =====================================================================

export const alerts = mysqlTable(
  'alerts',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    tipo: varchar('tipo', { length: 50 }).notNull(),
    severidade: mysqlEnum('severidade', SEVERIDADE_VALUES).default('info'),
    escopo: mysqlEnum('escopo', ['empresa', 'departamento', 'colaborador']),
    escopoDepartamentoId: int('escopoDepartamentoId').references(() => departments.id, {
      onDelete: 'set null',
    }),
    escopoEmployeeId: int('escopoEmployeeId').references(() => employees.id, {
      onDelete: 'cascade',
    }),
    suprimidoPorCooldown: boolean('suprimidoPorCooldown').notNull().default(false),
    cicloDbId: int('cicloDbId').references(() => copsoqCycles.id, { onDelete: 'cascade' }),
    fatorId: tinyint('fatorId'),
    scoreValor: decimal('scoreValor', { precision: 5, scale: 2 }),
    metadados: json('metadados'),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    idxAlertsCompanyCreated: index('idx_alerts_company_created').on(t.companyId, t.createdAt),
    idxAlertsTipo: index('idx_alerts_tipo').on(t.tipo),
    idxAlertsTipoEmployeeCreated: index('idx_alerts_tipo_employee_created').on(
      t.tipo,
      t.escopoEmployeeId,
      t.createdAt,
    ),
    idxAlertsTipoDeptCreated: index('idx_alerts_tipo_dept_created').on(
      t.tipo,
      t.escopoDepartamentoId,
      t.createdAt,
    ),
  }),
);

export const notifications = mysqlTable(
  'notifications',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId').references(() => companies.id, { onDelete: 'cascade' }),
    destinatarioTipo: mysqlEnum('destinatarioTipo', ['rh', 'bruno']).notNull(),
    destinatarioEmployeeId: int('destinatarioEmployeeId').references(() => employees.id, {
      onDelete: 'cascade',
    }),
    tipo: varchar('tipo', { length: 50 }).notNull(),
    alertId: int('alertId').references(() => alerts.id, { onDelete: 'set null' }),
    titulo: varchar('titulo', { length: 300 }).notNull(),
    subtitulo: varchar('subtitulo', { length: 500 }),
    linkDestino: varchar('linkDestino', { length: 500 }),
    severidade: mysqlEnum('severidade', SEVERIDADE_VALUES).default('info'),
    lidaEm: timestamp('lidaEm'),
    arquivadaEm: timestamp('arquivadaEm'),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    idxNotifDestinatarioNaoLida: index('idx_notifications_destinatario_naoLida').on(
      t.destinatarioTipo,
      t.destinatarioEmployeeId,
      t.lidaEm,
    ),
    idxNotifCompanyCreated: index('idx_notifications_company_created').on(t.companyId, t.createdAt),
    idxNotifArquivada: index('idx_notifications_arquivada').on(
      t.destinatarioTipo,
      t.destinatarioEmployeeId,
      t.arquivadaEm,
    ),
    idxNotifAlertId: index('idx_notifications_alertId').on(t.alertId),
  }),
);

// =====================================================================
// M011 — Pendencias e familias
// =====================================================================

export const portalReminderLog = mysqlTable(
  'portalReminderLog',
  {
    id: char('id', { length: 36 }).primaryKey(),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    instrumentType: mysqlEnum('instrumentType', [
      'meuPerfil',
      'autoAvaliacao',
      'avaliacaoLiderancaDireta',
      'radarNR1',
    ]).notNull(),
    cycleReference: varchar('cycleReference', { length: 20 }),
    sentAt: timestamp('sentAt').notNull().defaultNow(),
    sentBy: varchar('sentBy', { length: 36 }).notNull(),
    sentByType: mysqlEnum('sentByType', ['employee', 'superAdmin']).notNull(),
    success: boolean('success').notNull(),
    failReason: varchar('failReason', { length: 255 }),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (t) => ({
    idxPrlCooldown: index('idx_prl_cooldown').on(
      t.employeeId,
      t.instrumentType,
      t.cycleReference,
      t.sentAt,
    ),
  }),
);

export const companyJobFamilies = mysqlTable(
  'companyJobFamilies',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    jobFamily: mysqlEnum('jobFamily', JOB_FAMILY_VALUES).notNull(),
    variableIndex: int('variableIndex').notNull(),
    variableName: varchar('variableName', { length: 255 }).notNull(),
    unit: varchar('unit', { length: 50 }).notNull(),
    weight: decimal('weight', { precision: 5, scale: 2 }).notNull(),
    updatedBy: int('updatedBy')
      .notNull()
      .references(() => superAdmins.id, { onDelete: 'restrict' }),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqCjf: uniqueIndex('uq_cjf').on(t.companyId, t.jobFamily, t.variableIndex),
  }),
);

// =====================================================================
// M012 — Notificacoes por e-mail e ciclos
// Nota: a FK monthlyUnlockLog.unlockRequestId -> cycleUnlockRequests(id)
// vive apenas na migration (ALTER TABLE em M012). tables.ts declara a
// coluna sem FK para evitar dependencia circular (RV-14 legibilidade).
// =====================================================================

export const emailNotifications = mysqlTable(
  'emailNotifications',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    notificationId: int('notificationId').references(() => notifications.id, {
      onDelete: 'set null',
    }),
    destinatarioTipo: mysqlEnum('destinatarioTipo', ['rh', 'bruno']).notNull(),
    destinatarioEmail: varchar('destinatarioEmail', { length: 255 }).notNull(),
    destinatarioEmployeeId: int('destinatarioEmployeeId').references(() => employees.id, {
      onDelete: 'set null',
    }),
    assunto: varchar('assunto', { length: 300 }).notNull(),
    corpoTexto: text('corpoTexto').notNull(),
    corpoHtml: mediumtext('corpoHtml'),
    tipoEnvio: mysqlEnum('tipoEnvio', ['imediato', 'digest_semanal', 'digest_diario']).notNull(),
    eventoIds: json('eventoIds'),
    enviadoEm: timestamp('enviadoEm'),
    success: boolean('success').notNull().default(false),
    failReason: varchar('failReason', { length: 255 }),
    smtpMessageId: varchar('smtpMessageId', { length: 255 }),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    idxEnCompanyCreated: index('idx_emailNotifications_company_created').on(
      t.companyId,
      t.createdAt,
    ),
    idxEnDestinatario: index('idx_emailNotifications_destinatario').on(
      t.destinatarioTipo,
      t.destinatarioEmail,
      t.enviadoEm,
    ),
  }),
);

export const cycleSchedule = mysqlTable(
  'cycleSchedule',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    tipoCiclo: mysqlEnum('tipoCiclo', TIPO_CICLO_VALUES).notNull(),
    cicloReferencia: varchar('cicloReferencia', { length: 20 }).notNull(),
    dataAbertura: timestamp('dataAbertura'),
    dataCorte: timestamp('dataCorte'),
    dataFechamento: timestamp('dataFechamento'),
    status: mysqlEnum('status', ['aberto', 'atrasado', 'fechado']).notNull().default('aberto'),
    totalElegiveis: int('totalElegiveis'),
    totalRespondidos: int('totalRespondidos'),
    origemDbId: int('origemDbId'),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    ukCycleScheduleCiclo: uniqueIndex('uk_cycleSchedule_ciclo').on(
      t.companyId,
      t.tipoCiclo,
      t.cicloReferencia,
    ),
    idxCycleScheduleCompanyTipoStatus: index('idx_cycleSchedule_company_tipo_status').on(
      t.companyId,
      t.tipoCiclo,
      t.status,
    ),
    idxCycleScheduleStatusDataCorte: index('idx_cycleSchedule_status_dataCorte').on(
      t.status,
      t.dataCorte,
    ),
  }),
);

export const emailQueue = mysqlTable(
  'emailQueue',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    destinatarioTipo: mysqlEnum('destinatarioTipo', ['rh', 'bruno']).notNull(),
    destinatarioEmail: varchar('destinatarioEmail', { length: 255 }).notNull(),
    destinatarioEmployeeId: int('destinatarioEmployeeId').references(() => employees.id, {
      onDelete: 'set null',
    }),
    tipoEnvio: mysqlEnum('tipoEnvio', ['imediato', 'digest_semanal']).notNull(),
    alertIds: json('alertIds').notNull(),
    scheduledFor: timestamp('scheduledFor').notNull(),
    processedAt: timestamp('processedAt'),
    status: mysqlEnum('status', ['pendente', 'processando', 'enviado', 'falhou'])
      .notNull()
      .default('pendente'),
    emailNotificationId: int('emailNotificationId').references(() => emailNotifications.id, {
      onDelete: 'set null',
    }),
    retries: int('retries').notNull().default(0),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    idxEmailQueueStatusScheduledFor: index('idx_emailQueue_status_scheduledFor').on(
      t.status,
      t.scheduledFor,
    ),
    idxEmailQueueCompanyDestinatario: index('idx_emailQueue_company_destinatario').on(
      t.companyId,
      t.destinatarioEmail,
      t.status,
    ),
  }),
);

export const digestExecutionLog = mysqlTable(
  'digestExecutionLog',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    executedAt: timestamp('executedAt').defaultNow(),
    weekStart: date('weekStart').notNull(),
    weekEnd: date('weekEnd').notNull(),
    destinatariosCount: int('destinatariosCount').notNull().default(0),
    emailsEnviados: int('emailsEnviados').notNull().default(0),
    alertsConsolidados: int('alertsConsolidados').notNull().default(0),
  },
  (t) => ({
    ukDigestExecutionLogWeek: uniqueIndex('uk_digestExecutionLog_week').on(
      t.companyId,
      t.weekStart,
    ),
  }),
);

export const cycleUnlockRequests = mysqlTable(
  'cycleUnlockRequests',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    solicitanteTipo: mysqlEnum('solicitanteTipo', ['employee', 'clevel']).notNull(),
    solicitanteId: int('solicitanteId').notNull(),
    mes: varchar('mes', { length: 7 }).notNull(),
    aba: mysqlEnum('aba', ABA_UNLOCK_VALUES).notNull(),
    liderId: int('liderId'),
    liderTipo: mysqlEnum('liderTipo', ['employee', 'clevel']),
    justificativa: varchar('justificativa', { length: 500 }).notNull(),
    status: mysqlEnum('status', ['pendente', 'aprovada', 'recusada', 'cancelada'])
      .notNull()
      .default('pendente'),
    decididoPor: int('decididoPor').references(() => superAdmins.id, { onDelete: 'set null' }),
    decididoEm: timestamp('decididoEm'),
    motivoRecusa: varchar('motivoRecusa', { length: 500 }),
    comentarioAprovacao: varchar('comentarioAprovacao', { length: 500 }),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow(),
  },
  (t) => ({
    idxCurStatusCreated: index('idx_cycleUnlockRequests_status_created').on(t.status, t.createdAt),
    idxCurCompanyMes: index('idx_cycleUnlockRequests_company_mes').on(t.companyId, t.mes),
  }),
);

// =====================================================================
// M013 — Exportaveis e logs administrativos
// =====================================================================

export const employeeTerminationEvents = mysqlTable(
  'employeeTerminationEvents',
  {
    id: int('id').autoincrement().primaryKey(),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    dataInativacao: timestamp('dataInativacao').notNull(),
    motivo: mysqlEnum('motivo', MOTIVO_TERMINATION_VALUES).notNull(),
    nivelHierarquicoSnapshot: mysqlEnum(
      'nivelHierarquicoSnapshot',
      NIVEL_HIERARQUICO_VALUES,
    ).notNull(),
    departamentoSnapshot: varchar('departamentoSnapshot', { length: 255 }).notNull(),
    actorTipo: mysqlEnum('actorTipo', ['employee', 'superAdmin']).notNull(),
    actorId: int('actorId').notNull(),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    idxEteCompanyData: index('idx_ete_company_data').on(t.companyId, t.dataInativacao),
    idxEteEmployee: index('idx_ete_employee').on(t.employeeId),
  }),
);

export const executiveReportCache = mysqlTable(
  'executiveReportCache',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    escopoTipo: mysqlEnum('escopoTipo', ['empresa', 'departamento', 'equipe']).notNull(),
    escopoReferencia: varchar('escopoReferencia', { length: 255 }),
    trimestre: varchar('trimestre', { length: 10 }).notNull(),
    conteudoPdfUrl: varchar('conteudoPdfUrl', { length: 500 }).notNull(),
    geradoPorTipo: mysqlEnum('geradoPorTipo', ['employee', 'clevel', 'superAdmin']).notNull(),
    geradoPorId: int('geradoPorId').notNull(),
    geradoEm: timestamp('geradoEm').defaultNow(),
  },
  (t) => ({
    uqErcChave: uniqueIndex('uq_erc_chave').on(
      t.companyId,
      t.escopoTipo,
      t.escopoReferencia,
      t.trimestre,
    ),
  }),
);

export const apiUsageLog = mysqlTable(
  'apiUsageLog',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    tipo: mysqlEnum('tipo', ['relatorio_executivo']).notNull(),
    dataUso: date('dataUso').notNull(),
    contador: int('contador').default(1),
  },
  (t) => ({
    uqApiUsage: uniqueIndex('uq_apiUsage').on(t.companyId, t.tipo, t.dataUso),
  }),
);

// =====================================================================
// M014 — LGPD e onboarding de lideres
// (chk_lgpd_titular_unico vive na migration — S004)
// =====================================================================

export const lgpdConsents = mysqlTable(
  'lgpdConsents',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId').references(() => employees.id, { onDelete: 'cascade' }),
    clevelId: int('clevelId').references(() => cLevelMembers.id, { onDelete: 'cascade' }),
    versaoTermoAceita: varchar('versaoTermoAceita', { length: 10 }).notNull(),
    aceitoEm: timestamp('aceitoEm').defaultNow(),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    uqLgpdEmployee: uniqueIndex('uq_lgpd_employee').on(t.employeeId, t.versaoTermoAceita),
    uqLgpdClevel: uniqueIndex('uq_lgpd_clevel').on(t.clevelId, t.versaoTermoAceita),
  }),
);

export const dataAccessLog = mysqlTable(
  'dataAccessLog',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    agentType: mysqlEnum('agentType', ['super_admin', 'rh', 'lider', 'clevel']).notNull(),
    agentId: int('agentId').notNull(),
    titularEmployeeId: int('titularEmployeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    tipoAcesso: mysqlEnum('tipoAcesso', TIPO_ACESSO_VALUES).notNull(),
    contexto: varchar('contexto', { length: 255 }),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    idxDalCompany: index('idx_dal_company').on(t.companyId, t.createdAt),
    idxDalTitular: index('idx_dal_titular').on(t.titularEmployeeId, t.createdAt),
  }),
);

export const leaderOnboardingNotes = mysqlTable(
  'leaderOnboardingNotes',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    autorTipo: mysqlEnum('autorTipo', ['super_admin', 'rh']).notNull(),
    autorId: int('autorId').notNull(),
    texto: varchar('texto', { length: 500 }).notNull(),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    idxLonEmployee: index('idx_lon_employee').on(t.employeeId, t.createdAt),
  }),
);

export const leaderOnboardingStageLog = mysqlTable(
  'leaderOnboardingStageLog',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('companyId')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    employeeId: int('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    estagioAnterior: mysqlEnum('estagioAnterior', ONBOARDING_ESTAGIO_VALUES),
    estagioNovo: mysqlEnum('estagioNovo', ONBOARDING_ESTAGIO_VALUES).notNull(),
    autorTipo: mysqlEnum('autorTipo', ['super_admin', 'rh']).notNull(),
    autorId: int('autorId').notNull(),
    createdAt: timestamp('createdAt').defaultNow(),
  },
  (t) => ({
    idxLoslEmployee: index('idx_losl_employee').on(t.employeeId, t.createdAt),
  }),
);
