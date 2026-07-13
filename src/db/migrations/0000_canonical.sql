-- ROIP APP 9BOX — migration canônica única (ME-002).
-- Gerada por Claude do DOC 01 (CAMADA_DADOS.md) pós-CC001.
-- Ordem de criação: M001 → M015 (§17.2 do DOC 01).
-- Nenhuma tabela, coluna, enum, FK, CHECK, índice ou seed fora do que está aqui.

-- =====================================================================
-- M001 — Núcleo cadastral
-- =====================================================================

CREATE TABLE `superAdmins` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) UNIQUE NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `companies` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `razaoSocial` VARCHAR(255) NOT NULL,
  `nomeFantasia` VARCHAR(255) NOT NULL,
  `cnpj` VARCHAR(14) UNIQUE NOT NULL,
  `telefone` VARCHAR(20) NOT NULL,
  `endereco` VARCHAR(255) NOT NULL,
  `cidade` VARCHAR(100) NOT NULL,
  `estado` CHAR(2) NOT NULL,
  `logoUrl` VARCHAR(500) DEFAULT NULL,
  `contatoPrincipalNome` VARCHAR(255) NOT NULL,
  `contatoPrincipalEmail` VARCHAR(255) NOT NULL,
  `contatoRHNome` VARCHAR(255) NOT NULL,
  `contatoRHEmail` VARCHAR(255) NOT NULL,
  `segmento` ENUM('Serviço','Comércio','Indústria','Serviço+Comércio','Serviço+Indústria','Indústria+Comércio','Serviço+Comércio+Indústria') NOT NULL,
  `tipoAtividade` VARCHAR(255) NOT NULL,
  `descricaoAtividade` TEXT NOT NULL,
  `contextoMercado` TEXT NOT NULL,
  `metaROIOperacional` DECIMAL(5,2) DEFAULT NULL,
  `metaROITatico` DECIMAL(5,2) DEFAULT NULL,
  `metaROIEstrategico` DECIMAL(5,2) DEFAULT NULL,
  `roiSegmentoMinimo` DECIMAL(5,2) DEFAULT NULL,
  `roiSegmentoMaximo` DECIMAL(5,2) DEFAULT NULL,
  `folhaPercMinima` DECIMAL(4,1) DEFAULT NULL,
  `folhaPercMaxima` DECIMAL(4,1) DEFAULT NULL,
  `thresholdDesempenhoBaixo` INT DEFAULT 60,
  `thresholdDesempenhoMedio` INT DEFAULT 85,
  `thresholdPlenitudeBaixo` INT DEFAULT 50,
  `thresholdPlenitudeMedio` INT DEFAULT 75,
  `modoAnoFiscal` ENUM('padrao','customizado') NOT NULL DEFAULT 'padrao',
  `mesInicioAnoFiscal` INT NOT NULL DEFAULT 1,
  `mesKickoff` INT NOT NULL,
  `timezone` VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  `encarregadoLgpdNome` VARCHAR(255) DEFAULT NULL,
  `encarregadoLgpdEmail` VARCHAR(255) DEFAULT NULL,
  `encarregadoLgpdTelefone` VARCHAR(20) DEFAULT NULL,
  `encarregadoLgpdPoliticaUrl` VARCHAR(500) DEFAULT NULL,
  `status` ENUM('ativa','inativa') DEFAULT 'inativa',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `companyMonthlyData` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `mes` VARCHAR(7) NOT NULL,
  `faturamentoBruto` DECIMAL(15,2) DEFAULT NULL,
  `diasUteis` INT DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_companyMonthly` (`companyId`, `mes`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `cLevelMembers` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `cpf` VARCHAR(11) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `photoUrl` VARCHAR(500) DEFAULT NULL,
  `dataNascimento` DATE NOT NULL,
  `dataAdmissao` DATE NOT NULL,
  `cargo` VARCHAR(100) NOT NULL,
  `descricaoCargo` TEXT NOT NULL,
  `departamento` ENUM('Comercial','Marketing','Operações','Produção','Logística','Compras','Financeiro','Contabilidade','Recursos Humanos','Tecnologia da Informação','Jurídico','Qualidade','Manutenção','Projetos','Atendimento ao Cliente','Pós-venda','Administrativo','Diretoria','Outros') NOT NULL,
  `custoMensal` DECIMAL(12,2) NOT NULL,
  `acessoTotal` BOOLEAN DEFAULT true,
  `isResponsavelFinanceiro` BOOLEAN NOT NULL DEFAULT false,
  `status` ENUM('ativo','inativo') DEFAULT 'ativo',
  `passwordHash` VARCHAR(255) DEFAULT NULL,
  `passwordSet` BOOLEAN DEFAULT false,
  `lastActivity` TIMESTAMP DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_clevel_cpf` (`companyId`, `cpf`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `employees` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `cpf` VARCHAR(11) NOT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `photoUrl` VARCHAR(500) DEFAULT NULL,
  `dataNascimento` DATE NOT NULL,
  `dataAdmissao` DATE NOT NULL,
  `cbo` VARCHAR(10) NOT NULL,
  `descricaoCBO` VARCHAR(255) NOT NULL,
  `jobFamily` ENUM('vendas_comercial','producao_operacoes','tecnico_especialista','administrativo_suporte','atendimento_relacionamento','lideranca_gestao') NOT NULL,
  `senioridade` ENUM('junior','pleno','senior') NOT NULL,
  `nivelHierarquico` ENUM('operacional','tatico','estrategico') NOT NULL,
  `departamento` ENUM('Comercial','Marketing','Operações','Produção','Logística','Compras','Financeiro','Contabilidade','Recursos Humanos','Tecnologia da Informação','Jurídico','Qualidade','Manutenção','Projetos','Atendimento ao Cliente','Pós-venda','Administrativo','Diretoria','Outros') NOT NULL,
  `status` ENUM('ativo','inativo') DEFAULT 'ativo',
  `isRH` BOOLEAN DEFAULT false,
  `isLider` BOOLEAN DEFAULT false,
  `isResponsavelFinanceiro` BOOLEAN NOT NULL DEFAULT false,
  `onboardingEstagio` ENUM('treinar','em_treinamento','treinado','reciclagem') DEFAULT 'treinar',
  `onboardingUltimoEstagio` ENUM('treinar','em_treinamento','treinado','reciclagem') DEFAULT NULL,
  `passwordHash` VARCHAR(255) DEFAULT NULL,
  `passwordSet` BOOLEAN DEFAULT false,
  `lastActivity` TIMESTAMP DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_employee_cpf` (`companyId`, `cpf`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `employeeLeaderHistory` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `employeeId` INT NOT NULL,
  `liderId` INT DEFAULT NULL,
  `clevelId` INT DEFAULT NULL,
  `dataInicio` DATE NOT NULL,
  `dataFim` DATE DEFAULT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `transferBatchId` CHAR(36) NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_elh_employee_fim` (`employeeId`, `dataFim`),
  INDEX `idx_elh_batch` (`transferBatchId`),
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`liderId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`clevelId`) REFERENCES `cLevelMembers`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `employeeGoals` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `employeeId` INT NOT NULL,
  `jobFamily` ENUM('vendas_comercial','producao_operacoes','tecnico_especialista','administrativo_suporte','atendimento_relacionamento','lideranca_gestao') NOT NULL,
  `variableIndex` INT NOT NULL,
  `variableName` VARCHAR(255) NOT NULL,
  `unit` VARCHAR(50) NOT NULL,
  `weight` DECIMAL(5,2) NOT NULL,
  `goal` DECIMAL(15,2) NOT NULL,
  `updatedBy` ENUM('rh','lider','super_admin') NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_goal` (`employeeId`, `variableIndex`),
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `accessTokens` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `userType` ENUM('employee','clevel','super_admin') NOT NULL,
  `userId` INT NOT NULL,
  `token` VARCHAR(255) UNIQUE NOT NULL,
  `type` ENUM('first_access','password_reset') NOT NULL,
  `usedAt` TIMESTAMP DEFAULT NULL,
  `expiresAt` TIMESTAMP NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `individualProfilePlaceholders` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `userType` ENUM('employee','clevel') NOT NULL,
  `userId` INT NOT NULL,
  `status` ENUM('pendente','em_andamento','respondido','inconsistente','aguardando_nova_resposta') NOT NULL DEFAULT 'pendente',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `respondidoEm` TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

-- =====================================================================
-- M002 — Papéis funcionais
-- =====================================================================

CREATE TABLE `responsavelFinanceiroTransferLog` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `previousHolderType` ENUM('employee','cLevel','none') NOT NULL,
  `previousHolderId` INT DEFAULT NULL,
  `newHolderType` ENUM('employee','cLevel','none') NOT NULL,
  `newHolderId` INT DEFAULT NULL,
  `actorSuperAdminId` INT NOT NULL,
  `eventType` ENUM('atribuido','transferido','removido') NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`actorSuperAdminId`) REFERENCES `superAdmins`(`id`) ON DELETE RESTRICT
);

-- =====================================================================
-- M003 — Referência de departamentos + seed das 19 linhas
-- =====================================================================

CREATE TABLE `departments` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `nome` VARCHAR(100) UNIQUE NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO `departments` (`id`, `nome`) VALUES
  (1,  'Comercial'),
  (2,  'Marketing'),
  (3,  'Operações'),
  (4,  'Produção'),
  (5,  'Logística'),
  (6,  'Compras'),
  (7,  'Financeiro'),
  (8,  'Contabilidade'),
  (9,  'Recursos Humanos'),
  (10, 'Tecnologia da Informação'),
  (11, 'Jurídico'),
  (12, 'Qualidade'),
  (13, 'Manutenção'),
  (14, 'Projetos'),
  (15, 'Atendimento ao Cliente'),
  (16, 'Pós-venda'),
  (17, 'Administrativo'),
  (18, 'Diretoria'),
  (19, 'Outros');

-- =====================================================================
-- M004 — Desempenho e diagnóstico
-- (monthlyUnlockLog nasce SEM unlockRequestId; adicionado em M012 §17.2)
-- =====================================================================

CREATE TABLE `performanceData` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `mes` VARCHAR(7) NOT NULL,
  `custoTotalMes` DECIMAL(12,2) DEFAULT NULL,
  `faltas` INT DEFAULT 0,
  `diasUteis` INT DEFAULT NULL,
  `assiduidade` DECIMAL(5,2) DEFAULT NULL,
  `indiceDesempenho` DECIMAL(6,4) DEFAULT NULL,
  `calculadoEm` TIMESTAMP DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_perfData` (`companyId`, `employeeId`, `mes`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `performanceVariableData` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `performanceDataId` INT NOT NULL,
  `variableIndex` INT NOT NULL,
  `demanda` DECIMAL(15,2) DEFAULT NULL,
  `executado` DECIMAL(15,2) DEFAULT NULL,
  `desempenho` DECIMAL(6,4) DEFAULT NULL,
  `peso` DECIMAL(5,2) DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_perfVar` (`performanceDataId`, `variableIndex`),
  FOREIGN KEY (`performanceDataId`) REFERENCES `performanceData`(`id`) ON DELETE CASCADE
);

CREATE TABLE `performanceQuarterlyData` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `indiceDesempenho` DECIMAL(6,4) DEFAULT NULL,
  `scoreDesempenho` DECIMAL(6,2) DEFAULT NULL,
  `capacidadeOciosa` DECIMAL(5,2) DEFAULT NULL,
  `faixaDesempenho` ENUM('baixo','medio','alto') DEFAULT NULL,
  `custoMedioTrimestral` DECIMAL(12,2) DEFAULT NULL,
  `metaROI` DECIMAL(5,2) DEFAULT NULL,
  `retornoPotencial` DECIMAL(15,2) DEFAULT NULL,
  `participacao` DECIMAL(8,6) DEFAULT NULL,
  `retornoEstimado` DECIMAL(15,2) DEFAULT NULL,
  `roiEstimado` DECIMAL(6,4) DEFAULT NULL,
  `percMetaAtingida` DECIMAL(6,2) DEFAULT NULL,
  `diagnosticoIA` TEXT DEFAULT NULL,
  `diagnosticoIAgeradoEm` TIMESTAMP DEFAULT NULL,
  `calculadoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_perfQuarter` (`companyId`, `employeeId`, `trimestre`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `performanceMultiplierLog` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `quarterlyDataId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `nivelHierarquico` ENUM('operacional','tatico','estrategico') NOT NULL,
  `metaROIUsada` DECIMAL(5,2) NOT NULL,
  `ajusteRetroativo` BOOLEAN DEFAULT false,
  `calculadoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`quarterlyDataId`) REFERENCES `performanceQuarterlyData`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `companyEconomicDiagnosis` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `faturamentoMedioTrimestral` DECIMAL(15,2) NOT NULL,
  `folhaTotalMedia` DECIMAL(15,2) NOT NULL,
  `faturamentoPotencial` DECIMAL(15,2) DEFAULT NULL,
  `roiEmpresa` DECIMAL(6,4) NOT NULL,
  `folhaPorcentagem` DECIMAL(5,2) NOT NULL,
  `roiSegmentoMinimo` DECIMAL(5,2) DEFAULT NULL,
  `roiSegmentoMaximo` DECIMAL(5,2) DEFAULT NULL,
  `roiMuitoBom` DECIMAL(5,2) DEFAULT NULL,
  `faturamentoIdeal` DECIMAL(15,2) DEFAULT NULL,
  `statusDiagnostico` ENUM('excelente','muito_bom','aceitavel','critico','sem_referencia') NOT NULL,
  `calculadoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_econDiag` (`companyId`, `trimestre`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `monthlyClosureStatus` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `mes` VARCHAR(7) NOT NULL,
  `status` ENUM('aberto','fechado','desbloqueado') NOT NULL DEFAULT 'aberto',
  `dataFechamento` TIMESTAMP DEFAULT NULL,
  `processadoEm` TIMESTAMP DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_closure` (`companyId`, `mes`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `monthlyUnlockLog` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `mes` VARCHAR(7) NOT NULL,
  `aba` ENUM('rh','lider','faturamento') NOT NULL,
  `liderId` INT DEFAULT NULL,
  `liderTipo` ENUM('employee','clevel') DEFAULT NULL,
  `desbloqueadoPor` INT NOT NULL,
  `justificativa` VARCHAR(500) NOT NULL,
  `desbloqueadoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `expiraEm` TIMESTAMP NOT NULL,
  `houveAlteracao` BOOLEAN DEFAULT false,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`desbloqueadoPor`) REFERENCES `superAdmins`(`id`) ON DELETE RESTRICT
);

-- =====================================================================
-- M005 — Instrumentos e 9-Box
-- =====================================================================

CREATE TABLE `instrumentA_responses` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `dimensao` TINYINT NOT NULL,
  `itemIndex` TINYINT NOT NULL,
  `valor` TINYINT NOT NULL,
  `respondidoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_iA_unica_resposta` (`employeeId`, `trimestre`, `dimensao`, `itemIndex`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `instrumentC_assessments` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `liderId` INT DEFAULT NULL,
  `clevelId` INT DEFAULT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `dimensao` TINYINT NOT NULL,
  `itemIndex` TINYINT NOT NULL,
  `valor` TINYINT NOT NULL,
  `respondidoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_iC_unica_avaliacao` (`employeeId`, `trimestre`, `dimensao`, `itemIndex`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`liderId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`clevelId`) REFERENCES `cLevelMembers`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_iC_avaliador_unico` CHECK (
    (`liderId` IS NOT NULL AND `clevelId` IS NULL) OR
    (`liderId` IS NULL AND `clevelId` IS NOT NULL)
  )
);

CREATE TABLE `plenitudeData` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `scoreA` DECIMAL(5,2) DEFAULT NULL,
  `scoreC` DECIMAL(5,2) DEFAULT NULL,
  `plenitudeScore` DECIMAL(5,2) DEFAULT NULL,
  `faixaPlenitude` ENUM('baixa','media','alta') DEFAULT NULL,
  `divergencia` DECIMAL(5,2) DEFAULT NULL,
  `alertaDivergencia` BOOLEAN DEFAULT false,
  `engajamentoA` DECIMAL(5,2) DEFAULT NULL,
  `engajamentoC` DECIMAL(5,2) DEFAULT NULL,
  `desenvolvimentoA` DECIMAL(5,2) DEFAULT NULL,
  `desenvolvimentoC` DECIMAL(5,2) DEFAULT NULL,
  `pertencimentoA` DECIMAL(5,2) DEFAULT NULL,
  `pertencimentoC` DECIMAL(5,2) DEFAULT NULL,
  `realizacaoA` DECIMAL(5,2) DEFAULT NULL,
  `realizacaoC` DECIMAL(5,2) DEFAULT NULL,
  `calculadoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_plenitude` (`companyId`, `employeeId`, `trimestre`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `nineBoxClassifications` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `scoreDesempenho` DECIMAL(6,2) DEFAULT NULL,
  `plenitudeScore` DECIMAL(5,2) DEFAULT NULL,
  `posicaoX` ENUM('baixo','medio','alto') NOT NULL,
  `posicaoY` ENUM('baixa','media','alta') NOT NULL,
  `quadrante` ENUM('ALTO IMPACTO','DESEMPENHO REPRESADO','POTENCIAL SUBUTILIZADO','ALTA ENTREGA','EQUILÍBRIO FRÁGIL','DESEMPENHO CRÍTICO','RISCO DE ESGOTAMENTO','DESGASTE OCULTO','RISCO CRÍTICO') NOT NULL,
  `quadranteAnterior` VARCHAR(50) DEFAULT NULL,
  `direcaoMovimento` ENUM('subiu','desceu','lateral','estavel','primeira_vez') DEFAULT NULL,
  `calculadoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_nineBox` (`companyId`, `employeeId`, `trimestre`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `instrumentUnlockLog` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `instrumento` ENUM('A','C') NOT NULL,
  `desbloqueadoPor` INT NOT NULL,
  `justificativa` TEXT NOT NULL,
  `desbloqueadoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `expiraEm` TIMESTAMP NOT NULL,
  `houveAlteracao` BOOLEAN DEFAULT false,
  `ajusteRetroativo` BOOLEAN DEFAULT false,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`desbloqueadoPor`) REFERENCES `superAdmins`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `nineBoxCalculationLog` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `status` ENUM('calculado','eixo_x_ausente','eixo_y_ausente','ambos_ausentes') NOT NULL,
  `observacao` TEXT DEFAULT NULL,
  `registradoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);

-- =====================================================================
-- M006 — Instrumento D, IQL e Clima
-- =====================================================================

CREATE TABLE `instrumentD_responses` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `respondenteId` INT NOT NULL,
  `liderId` INT DEFAULT NULL,
  `clevelId` INT DEFAULT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `dimensao` TINYINT NOT NULL,
  `itemIndex` TINYINT NOT NULL,
  `valor` TINYINT NOT NULL,
  `versaoInstrumento` TINYINT NOT NULL DEFAULT 1,
  `respondidoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_iD_unica_resposta` (`respondenteId`, `trimestre`, `dimensao`, `itemIndex`),
  INDEX `idx_iD_lider_trim` (`liderId`, `trimestre`),
  INDEX `idx_iD_clevel_trim` (`clevelId`, `trimestre`),
  INDEX `idx_iD_resp_trim` (`respondenteId`, `trimestre`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`respondenteId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`liderId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`clevelId`) REFERENCES `cLevelMembers`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_iD_avaliado_unico` CHECK (
    (`liderId` IS NOT NULL AND `clevelId` IS NULL) OR
    (`liderId` IS NULL AND `clevelId` IS NOT NULL)
  )
);

CREATE TABLE `iqlData` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `liderId` INT DEFAULT NULL,
  `clevelId` INT DEFAULT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `scoreDirecionamentoClareza` DECIMAL(5,2) DEFAULT NULL,
  `scoreDesenvolvimentoApoio` DECIMAL(5,2) DEFAULT NULL,
  `scoreRelacionamentoConfianca` DECIMAL(5,2) DEFAULT NULL,
  `scoreGestaoResultados` DECIMAL(5,2) DEFAULT NULL,
  `iql` DECIMAL(5,2) DEFAULT NULL,
  `countRespondentes` INT NOT NULL DEFAULT 0,
  `countRespondentesElegiveis` INT NOT NULL DEFAULT 0,
  `calculadoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_iqlData_lider` (`companyId`, `liderId`, `trimestre`),
  UNIQUE KEY `uq_iqlData_clevel` (`companyId`, `clevelId`, `trimestre`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`liderId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`clevelId`) REFERENCES `cLevelMembers`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_iqlData_avaliado_unico` CHECK (
    (`liderId` IS NOT NULL AND `clevelId` IS NULL) OR
    (`liderId` IS NULL AND `clevelId` IS NOT NULL)
  )
);

CREATE TABLE `climateEngagementData` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `escopo` ENUM('empresa','departamento','equipe') NOT NULL,
  `departamento` VARCHAR(120) DEFAULT NULL,
  `liderId` INT DEFAULT NULL,
  `trimestre` VARCHAR(7) NOT NULL,
  `notaClima` DECIMAL(4,2) DEFAULT NULL,
  `adesao` DECIMAL(5,2) DEFAULT NULL,
  `countCobertura` INT NOT NULL DEFAULT 0,
  `countTotal` INT NOT NULL DEFAULT 0,
  `notaEngajamento` DECIMAL(4,2) DEFAULT NULL,
  `notaDesenvolvimento` DECIMAL(4,2) DEFAULT NULL,
  `notaPertencimento` DECIMAL(4,2) DEFAULT NULL,
  `notaRealizacao` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao01` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao02` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao03` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao04` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao05` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao06` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao07` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao08` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao09` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao10` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao11` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao12` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao13` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao14` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao15` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao16` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao17` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao18` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao19` DECIMAL(4,2) DEFAULT NULL,
  `notaQuestao20` DECIMAL(4,2) DEFAULT NULL,
  `calculadoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_climate_escopo` (`companyId`, `escopo`, `departamento`, `liderId`, `trimestre`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`liderId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);

-- =====================================================================
-- M007 — Diálogos e IA
-- =====================================================================

CREATE TABLE `developmentDialogs` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `liderId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `titulo` VARCHAR(255) DEFAULT NULL,
  `corpo` TEXT DEFAULT NULL,
  `status` ENUM('verde','vermelho') NOT NULL DEFAULT 'verde',
  `pendencia` BOOLEAN NOT NULL DEFAULT false,
  `arquivado` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_dd_lider_emp` (`liderId`, `employeeId`),
  INDEX `idx_dd_emp_arq` (`employeeId`, `arquivado`),
  INDEX `idx_dd_lider_pend` (`liderId`, `pendencia`, `arquivado`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`liderId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `aiConversations` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `userId` INT NOT NULL,
  `userType` ENUM('employee','clevel','super_admin') NOT NULL,
  `dashboardLevel` ENUM('global','departamento','equipe','individual') NOT NULL,
  `contextId` INT DEFAULT NULL,
  `role` ENUM('user','assistant') NOT NULL,
  `content` TEXT NOT NULL,
  `trimestre` VARCHAR(7) DEFAULT NULL,
  `archivedAt` TIMESTAMP DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ac_user_ctx` (`userId`, `userType`, `dashboardLevel`, `contextId`, `archivedAt`),
  INDEX `idx_ac_archived` (`archivedAt`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

-- =====================================================================
-- M008 — Perfil Individual
-- =====================================================================

CREATE TABLE `individualProfileAssessments` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `userType` ENUM('employee','clevel') NOT NULL,
  `userId` INT NOT NULL,
  `tentativa` INT NOT NULL DEFAULT 1,
  `status` ENUM('em_andamento','enviado','inconsistente') NOT NULL DEFAULT 'em_andamento',
  `blocoAtual` INT NOT NULL DEFAULT 1,
  `blocosCompletos` JSON DEFAULT NULL,
  `respostas` JSON DEFAULT NULL,
  `confiabilidadeNivel` ENUM('alta','moderada','baixa') DEFAULT NULL,
  `ia_att` DECIMAL(4,2) DEFAULT NULL,
  `ia_soc` DECIMAL(4,2) DEFAULT NULL,
  `ia_acq` DECIMAL(4,2) DEFAULT NULL,
  `ia_cons` DECIMAL(4,2) DEFAULT NULL,
  `ia_ext` DECIMAL(4,2) DEFAULT NULL,
  `retesteLiberadoPor` INT DEFAULT NULL,
  `retesteLiberadoTipo` ENUM('rh','super_admin') DEFAULT NULL,
  `retesteLiberadoEm` TIMESTAMP NULL DEFAULT NULL,
  `enviadoEm` TIMESTAMP NULL DEFAULT NULL,
  `calculadoEm` TIMESTAMP NULL DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_ipa_tentativa` UNIQUE (`companyId`, `userType`, `userId`, `tentativa`),
  INDEX `idx_ipa_status` (`companyId`, `status`),
  INDEX `idx_ipa_user` (`companyId`, `userType`, `userId`),
  CONSTRAINT `fk_ipa_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `individualProfileScores` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `userType` ENUM('employee','clevel') NOT NULL,
  `userId` INT NOT NULL,
  `assessmentId` INT NOT NULL,
  `tentativa` INT NOT NULL DEFAULT 1,
  `post_assert` DECIMAL(5,2) DEFAULT NULL,
  `post_tarefas` DECIMAL(5,2) DEFAULT NULL,
  `post_pessoas` DECIMAL(5,2) DEFAULT NULL,
  `post_pressao` DECIMAL(5,2) DEFAULT NULL,
  `est_abert` DECIMAL(5,2) DEFAULT NULL,
  `est_disc` DECIMAL(5,2) DEFAULT NULL,
  `est_ext` DECIMAL(5,2) DEFAULT NULL,
  `est_amab` DECIMAL(5,2) DEFAULT NULL,
  `est_estab` DECIMAL(5,2) DEFAULT NULL,
  `mot_maestria` DECIMAL(5,2) DEFAULT NULL,
  `mot_lideranca` DECIMAL(5,2) DEFAULT NULL,
  `mot_autonomia` DECIMAL(5,2) DEFAULT NULL,
  `mot_seguranca` DECIMAL(5,2) DEFAULT NULL,
  `mot_proposito` DECIMAL(5,2) DEFAULT NULL,
  `equ_autocons` DECIMAL(5,2) DEFAULT NULL,
  `equ_autogest` DECIMAL(5,2) DEFAULT NULL,
  `equ_leitura` DECIMAL(5,2) DEFAULT NULL,
  `equ_influencia` DECIMAL(5,2) DEFAULT NULL,
  `equ_indice` DECIMAL(5,2) DEFAULT NULL,
  `ass_sabed` DECIMAL(5,2) DEFAULT NULL,
  `ass_coragem` DECIMAL(5,2) DEFAULT NULL,
  `ass_humanid` DECIMAL(5,2) DEFAULT NULL,
  `ass_justica` DECIMAL(5,2) DEFAULT NULL,
  `ass_temper` DECIMAL(5,2) DEFAULT NULL,
  `ass_transc` DECIMAL(5,2) DEFAULT NULL,
  `perfilComportamental` VARCHAR(60) DEFAULT NULL,
  `vetorDominante` VARCHAR(30) DEFAULT NULL,
  `vetorSustentacao` VARCHAR(30) DEFAULT NULL,
  `vetorNegligenciado` VARCHAR(30) DEFAULT NULL,
  `top3Assinatura` JSON DEFAULT NULL,
  `flags` JSON DEFAULT NULL,
  `resumoJson` JSON DEFAULT NULL,
  `expandidoJson` JSON DEFAULT NULL,
  `resumoGeradoEm` TIMESTAMP NULL DEFAULT NULL,
  `expandidoGeradoEm` TIMESTAMP NULL DEFAULT NULL,
  `exibirConfirmacaoAte` TIMESTAMP NULL DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uq_ips_tentativa` UNIQUE (`companyId`, `userType`, `userId`, `tentativa`),
  INDEX `idx_ips_user` (`companyId`, `userType`, `userId`),
  CONSTRAINT `fk_ips_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ips_assessment` FOREIGN KEY (`assessmentId`) REFERENCES `individualProfileAssessments`(`id`) ON DELETE RESTRICT
);

-- =====================================================================
-- M009 — Radar NR-1 (depende de M003 departments)
-- =====================================================================

CREATE TABLE `copsoqCycles` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `ciclo` VARCHAR(20) NOT NULL,
  `dataAbertura` DATE NOT NULL,
  `dataFechamento` DATE NOT NULL,
  `status` ENUM('agendado','aberto','fechado') NOT NULL DEFAULT 'agendado',
  `configuradoPorEmployeeId` INT DEFAULT NULL,
  `configuradoPorSuperAdminId` INT DEFAULT NULL,
  `configuradoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `dataFechamentoOriginal` DATE DEFAULT NULL,
  `ultimaEdicaoPorEmployeeId` INT DEFAULT NULL,
  `ultimaEdicaoPorSuperAdminId` INT DEFAULT NULL,
  `ultimaEdicaoEm` TIMESTAMP DEFAULT NULL,
  `ultimaEdicaoJustificativa` TEXT DEFAULT NULL,
  `abertoEm` TIMESTAMP DEFAULT NULL,
  `fechadoEm` TIMESTAMP DEFAULT NULL,
  `departamentoCriticoDepartamentoId` INT DEFAULT NULL,
  `departamentoCriticoDepartamentoNome` VARCHAR(200) DEFAULT NULL,
  `departamentosAmostraInsuficiente` JSON DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_copsoqCycles_ciclo` (`companyId`, `ciclo`),
  INDEX `idx_copsoqCycles_company_status` (`companyId`, `status`),
  INDEX `idx_copsoqCycles_status_dataAbertura` (`status`, `dataAbertura`),
  INDEX `idx_copsoqCycles_status_dataFechamento` (`status`, `dataFechamento`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`configuradoPorEmployeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`configuradoPorSuperAdminId`) REFERENCES `superAdmins`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`ultimaEdicaoPorEmployeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`ultimaEdicaoPorSuperAdminId`) REFERENCES `superAdmins`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`departamentoCriticoDepartamentoId`) REFERENCES `departments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_datas` CHECK (`dataAbertura` < `dataFechamento`)
);

CREATE TABLE `copsoqCycleSnapshot` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `cicloDbId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `departamentoId` INT DEFAULT NULL,
  `snapshotEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `respondeu` BOOLEAN DEFAULT false,
  `respondidoEm` TIMESTAMP DEFAULT NULL,
  `tempoRespostaSegundos` INT DEFAULT NULL,
  `respostaInvalida` BOOLEAN DEFAULT false,
  `motivoInvalidade` ENUM('uniformidade','tempo_baixo') DEFAULT NULL,
  `inativadoAposSnapshot` BOOLEAN DEFAULT false,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_snapshot` (`cicloDbId`, `employeeId`),
  INDEX `idx_snapshot_ciclo_dept` (`cicloDbId`, `departamentoId`),
  FOREIGN KEY (`cicloDbId`) REFERENCES `copsoqCycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`departamentoId`) REFERENCES `departments`(`id`) ON DELETE SET NULL
);

CREATE TABLE `copsoq_responses` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `cicloDbId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `fator` TINYINT NOT NULL,
  `itemIndex` TINYINT NOT NULL,
  `valor` TINYINT NOT NULL,
  `versaoInstrumento` VARCHAR(20) NOT NULL DEFAULT 'placeholder_MVP_v1',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_resposta` (`cicloDbId`, `employeeId`, `fator`, `itemIndex`),
  INDEX `idx_responses_ciclo_employee` (`cicloDbId`, `employeeId`),
  INDEX `idx_responses_ciclo_fator` (`cicloDbId`, `fator`),
  FOREIGN KEY (`cicloDbId`) REFERENCES `copsoqCycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_fator` CHECK (`fator` BETWEEN 1 AND 8),
  CONSTRAINT `chk_itemIndex` CHECK (`itemIndex` BETWEEN 1 AND 4),
  CONSTRAINT `chk_valor` CHECK (`valor` BETWEEN 0 AND 4)
);

CREATE TABLE `copsoqFactorScores` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `cicloDbId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `escopo` ENUM('empresa','departamento','agregacao') NOT NULL,
  `escopoDepartamentoId` INT DEFAULT NULL,
  `escopoNomeAgregacao` VARCHAR(500) DEFAULT NULL,
  `agregadoDe` JSON DEFAULT NULL,
  `fator` TINYINT NOT NULL,
  `score` DECIMAL(5,2) NOT NULL,
  `countRespondentes` INT NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_score` (`cicloDbId`, `escopo`, `escopoDepartamentoId`, `escopoNomeAgregacao`, `fator`),
  INDEX `idx_scores_ciclo` (`cicloDbId`),
  INDEX `idx_scores_company_fator` (`companyId`, `fator`),
  FOREIGN KEY (`cicloDbId`) REFERENCES `copsoqCycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`escopoDepartamentoId`) REFERENCES `departments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_score_fator` CHECK (`fator` BETWEEN 1 AND 8),
  CONSTRAINT `chk_score_range` CHECK (`score` BETWEEN 0 AND 100)
);

CREATE TABLE `nr1AreaDivergenceAnalysis` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `cicloDbId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `escopo` ENUM('departamento','agregacao') NOT NULL,
  `escopoDepartamentoId` INT DEFAULT NULL,
  `escopoNomeAgregacao` VARCHAR(500) DEFAULT NULL,
  `classificacao` ENUM('convergente','divergencia_critica','divergencia_positiva') NOT NULL,
  `fatoresDivergentesCriticos` JSON DEFAULT NULL,
  `fatoresDivergentesPositivos` JSON DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_divergence` (`cicloDbId`, `escopo`, `escopoDepartamentoId`, `escopoNomeAgregacao`),
  FOREIGN KEY (`cicloDbId`) REFERENCES `copsoqCycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`escopoDepartamentoId`) REFERENCES `departments`(`id`) ON DELETE SET NULL
);

CREATE TABLE `radarNR1Reports` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT DEFAULT NULL,
  `cicloDbId` INT DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`cicloDbId`) REFERENCES `copsoqCycles`(`id`) ON DELETE CASCADE
);

-- =====================================================================
-- M010 — Alertas e notificações (depende de M003 e M009)
-- =====================================================================

CREATE TABLE `alerts` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `tipo` VARCHAR(50) NOT NULL,
  `severidade` ENUM('info','observacao','atencao','critico') DEFAULT 'info',
  `escopo` ENUM('empresa','departamento','colaborador') DEFAULT NULL,
  `escopoDepartamentoId` INT DEFAULT NULL,
  `escopoEmployeeId` INT DEFAULT NULL,
  `suprimidoPorCooldown` BOOLEAN NOT NULL DEFAULT false,
  `cicloDbId` INT DEFAULT NULL,
  `fatorId` TINYINT DEFAULT NULL,
  `scoreValor` DECIMAL(5,2) DEFAULT NULL,
  `metadados` JSON DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_alerts_company_created` (`companyId`, `createdAt`),
  INDEX `idx_alerts_tipo` (`tipo`),
  INDEX `idx_alerts_tipo_employee_created` (`tipo`, `escopoEmployeeId`, `createdAt` DESC),
  INDEX `idx_alerts_tipo_dept_created` (`tipo`, `escopoDepartamentoId`, `createdAt` DESC),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`escopoDepartamentoId`) REFERENCES `departments`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`escopoEmployeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`cicloDbId`) REFERENCES `copsoqCycles`(`id`) ON DELETE CASCADE
);

CREATE TABLE `notifications` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT DEFAULT NULL,
  `destinatarioTipo` ENUM('rh','bruno') NOT NULL,
  `destinatarioEmployeeId` INT DEFAULT NULL,
  `tipo` VARCHAR(50) NOT NULL,
  `alertId` INT DEFAULT NULL,
  `titulo` VARCHAR(300) NOT NULL,
  `subtitulo` VARCHAR(500) DEFAULT NULL,
  `linkDestino` VARCHAR(500) DEFAULT NULL,
  `severidade` ENUM('info','observacao','atencao','critico') DEFAULT 'info',
  `lidaEm` TIMESTAMP DEFAULT NULL,
  `arquivadaEm` TIMESTAMP DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_notifications_destinatario_naoLida` (`destinatarioTipo`, `destinatarioEmployeeId`, `lidaEm`),
  INDEX `idx_notifications_company_created` (`companyId`, `createdAt`),
  INDEX `idx_notifications_arquivada` (`destinatarioTipo`, `destinatarioEmployeeId`, `arquivadaEm`),
  INDEX `idx_notifications_alertId` (`alertId`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`destinatarioEmployeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`alertId`) REFERENCES `alerts`(`id`) ON DELETE SET NULL
);

-- =====================================================================
-- M011 — Pendências e famílias
-- =====================================================================

CREATE TABLE `portalReminderLog` (
  `id` CHAR(36) PRIMARY KEY,
  `employeeId` INT NOT NULL,
  `instrumentType` ENUM('meuPerfil','autoAvaliacao','avaliacaoLiderancaDireta','radarNR1') NOT NULL,
  `cycleReference` VARCHAR(20) DEFAULT NULL,
  `sentAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sentBy` VARCHAR(36) NOT NULL,
  `sentByType` ENUM('employee','superAdmin') NOT NULL,
  `success` BOOLEAN NOT NULL,
  `failReason` VARCHAR(255) DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_prl_cooldown` (`employeeId`, `instrumentType`, `cycleReference`, `sentAt` DESC),
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);

CREATE TABLE `companyJobFamilies` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `jobFamily` ENUM('vendas_comercial','producao_operacoes','tecnico_especialista','administrativo_suporte','atendimento_relacionamento','lideranca_gestao') NOT NULL,
  `variableIndex` INT NOT NULL,
  `variableName` VARCHAR(255) NOT NULL,
  `unit` VARCHAR(50) NOT NULL,
  `weight` DECIMAL(5,2) NOT NULL,
  `updatedBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_cjf` (`companyId`, `jobFamily`, `variableIndex`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`updatedBy`) REFERENCES `superAdmins`(`id`) ON DELETE RESTRICT
);

-- =====================================================================
-- M012 — Notificações por e-mail e ciclos
-- Inclui ALTER TABLE monthlyUnlockLog ADD COLUMN unlockRequestId
-- =====================================================================

CREATE TABLE `emailNotifications` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `notificationId` INT DEFAULT NULL,
  `destinatarioTipo` ENUM('rh','bruno') NOT NULL,
  `destinatarioEmail` VARCHAR(255) NOT NULL,
  `destinatarioEmployeeId` INT DEFAULT NULL,
  `assunto` VARCHAR(300) NOT NULL,
  `corpoTexto` TEXT NOT NULL,
  `corpoHtml` MEDIUMTEXT DEFAULT NULL,
  `tipoEnvio` ENUM('imediato','digest_semanal','digest_diario') NOT NULL,
  `eventoIds` JSON DEFAULT NULL,
  `enviadoEm` TIMESTAMP DEFAULT NULL,
  `success` BOOLEAN NOT NULL DEFAULT false,
  `failReason` VARCHAR(255) DEFAULT NULL,
  `smtpMessageId` VARCHAR(255) DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_emailNotifications_company_created` (`companyId`, `createdAt`),
  INDEX `idx_emailNotifications_destinatario` (`destinatarioTipo`, `destinatarioEmail`, `enviadoEm`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`destinatarioEmployeeId`) REFERENCES `employees`(`id`) ON DELETE SET NULL
);

CREATE TABLE `cycleSchedule` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `tipoCiclo` ENUM('instrumento_a','instrumento_c','instrumento_d','radar_nr1','fechamento_mensal') NOT NULL,
  `cicloReferencia` VARCHAR(20) NOT NULL,
  `dataAbertura` TIMESTAMP DEFAULT NULL,
  `dataCorte` TIMESTAMP DEFAULT NULL,
  `dataFechamento` TIMESTAMP DEFAULT NULL,
  `status` ENUM('aberto','atrasado','fechado') NOT NULL DEFAULT 'aberto',
  `totalElegiveis` INT DEFAULT NULL,
  `totalRespondidos` INT DEFAULT NULL,
  `origemDbId` INT DEFAULT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_cycleSchedule_ciclo` (`companyId`, `tipoCiclo`, `cicloReferencia`),
  INDEX `idx_cycleSchedule_company_tipo_status` (`companyId`, `tipoCiclo`, `status`),
  INDEX `idx_cycleSchedule_status_dataCorte` (`status`, `dataCorte`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE
);

CREATE TABLE `emailQueue` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `destinatarioTipo` ENUM('rh','bruno') NOT NULL,
  `destinatarioEmail` VARCHAR(255) NOT NULL,
  `destinatarioEmployeeId` INT DEFAULT NULL,
  `tipoEnvio` ENUM('imediato','digest_semanal') NOT NULL,
  `alertIds` JSON NOT NULL,
  `scheduledFor` TIMESTAMP NOT NULL,
  `processedAt` TIMESTAMP DEFAULT NULL,
  `status` ENUM('pendente','processando','enviado','falhou') NOT NULL DEFAULT 'pendente',
  `emailNotificationId` INT DEFAULT NULL,
  `retries` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_emailQueue_status_scheduledFor` (`status`, `scheduledFor`),
  INDEX `idx_emailQueue_company_destinatario` (`companyId`, `destinatarioEmail`, `status`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`destinatarioEmployeeId`) REFERENCES `employees`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`emailNotificationId`) REFERENCES `emailNotifications`(`id`) ON DELETE SET NULL
);

CREATE TABLE `digestExecutionLog` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `executedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `weekStart` DATE NOT NULL,
  `weekEnd` DATE NOT NULL,
  `destinatariosCount` INT NOT NULL DEFAULT 0,
  `emailsEnviados` INT NOT NULL DEFAULT 0,
  `alertsConsolidados` INT NOT NULL DEFAULT 0,
  UNIQUE KEY `uk_digestExecutionLog_week` (`companyId`, `weekStart`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE
);

CREATE TABLE `cycleUnlockRequests` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `solicitanteTipo` ENUM('employee','clevel') NOT NULL,
  `solicitanteId` INT NOT NULL,
  `mes` VARCHAR(7) NOT NULL,
  `aba` ENUM('rh','lider','faturamento') NOT NULL,
  `liderId` INT DEFAULT NULL,
  `liderTipo` ENUM('employee','clevel') DEFAULT NULL,
  `justificativa` VARCHAR(500) NOT NULL,
  `status` ENUM('pendente','aprovada','recusada','cancelada') NOT NULL DEFAULT 'pendente',
  `decididoPor` INT DEFAULT NULL,
  `decididoEm` TIMESTAMP DEFAULT NULL,
  `motivoRecusa` VARCHAR(500) DEFAULT NULL,
  `comentarioAprovacao` VARCHAR(500) DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_cycleUnlockRequests_status_created` (`status`, `createdAt` DESC),
  INDEX `idx_cycleUnlockRequests_company_mes` (`companyId`, `mes`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`decididoPor`) REFERENCES `superAdmins`(`id`) ON DELETE SET NULL
);

-- Adição diferida em M012 (§17.2): FK depende de cycleUnlockRequests
ALTER TABLE `monthlyUnlockLog`
  ADD COLUMN `unlockRequestId` INT DEFAULT NULL AFTER `houveAlteracao`,
  ADD CONSTRAINT `fk_mul_unlockRequestId` FOREIGN KEY (`unlockRequestId`) REFERENCES `cycleUnlockRequests`(`id`) ON DELETE SET NULL;

-- =====================================================================
-- M013 — Exportáveis e logs administrativos
-- =====================================================================

CREATE TABLE `employeeTerminationEvents` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `employeeId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `dataInativacao` TIMESTAMP NOT NULL,
  `motivo` ENUM('voluntario','involuntario') NOT NULL,
  `nivelHierarquicoSnapshot` ENUM('operacional','tatico','estrategico') NOT NULL,
  `departamentoSnapshot` VARCHAR(255) NOT NULL,
  `actorTipo` ENUM('employee','superAdmin') NOT NULL,
  `actorId` INT NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ete_company_data` (`companyId`, `dataInativacao`),
  INDEX `idx_ete_employee` (`employeeId`),
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `executiveReportCache` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `escopoTipo` ENUM('empresa','departamento','equipe') NOT NULL,
  `escopoReferencia` VARCHAR(255) DEFAULT NULL,
  `trimestre` VARCHAR(10) NOT NULL,
  `conteudoPdfUrl` VARCHAR(500) NOT NULL,
  `geradoPorTipo` ENUM('employee','clevel','superAdmin') NOT NULL,
  `geradoPorId` INT NOT NULL,
  `geradoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_erc_chave` (`companyId`, `escopoTipo`, `escopoReferencia`, `trimestre`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

CREATE TABLE `apiUsageLog` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `tipo` ENUM('relatorio_executivo') NOT NULL,
  `dataUso` DATE NOT NULL,
  `contador` INT DEFAULT 1,
  UNIQUE KEY `uq_apiUsage` (`companyId`, `tipo`, `dataUso`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT
);

-- =====================================================================
-- M014 — LGPD e onboarding de líderes
-- =====================================================================

CREATE TABLE `lgpdConsents` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT DEFAULT NULL,
  `clevelId` INT DEFAULT NULL,
  `versaoTermoAceita` VARCHAR(10) NOT NULL,
  `aceitoEm` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_lgpd_employee` (`employeeId`, `versaoTermoAceita`),
  UNIQUE KEY `uq_lgpd_clevel` (`clevelId`, `versaoTermoAceita`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`clevelId`) REFERENCES `cLevelMembers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_lgpd_titular_unico` CHECK (
    (`employeeId` IS NOT NULL AND `clevelId` IS NULL) OR
    (`employeeId` IS NULL AND `clevelId` IS NOT NULL)
  )
);

CREATE TABLE `dataAccessLog` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `agentType` ENUM('super_admin','rh','lider','clevel') NOT NULL,
  `agentId` INT NOT NULL,
  `titularEmployeeId` INT NOT NULL,
  `tipoAcesso` ENUM('dashboard_individual','relatorio_perfil_individual','exportacao_planilha') NOT NULL,
  `contexto` VARCHAR(255) DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_dal_company` (`companyId`, `createdAt`),
  INDEX `idx_dal_titular` (`titularEmployeeId`, `createdAt`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`titularEmployeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);

CREATE TABLE `leaderOnboardingNotes` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `autorTipo` ENUM('super_admin','rh') NOT NULL,
  `autorId` INT NOT NULL,
  `texto` VARCHAR(500) NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_lon_employee` (`employeeId`, `createdAt`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);

CREATE TABLE `leaderOnboardingStageLog` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `employeeId` INT NOT NULL,
  `estagioAnterior` ENUM('treinar','em_treinamento','treinado','reciclagem') DEFAULT NULL,
  `estagioNovo` ENUM('treinar','em_treinamento','treinado','reciclagem') NOT NULL,
  `autorTipo` ENUM('super_admin','rh') NOT NULL,
  `autorId` INT NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_losl_employee` (`employeeId`, `createdAt`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);

-- =====================================================================
-- M015 — Seed do Super Admin
-- Executado pelo scripts/seed-super-admin.mjs no deploy real, com
-- SEED_SUPER_ADMIN_PASSWORD via variavel de ambiente (§18.1).
-- NAO gravar hash aqui: deploy falha se a variavel nao estiver definida.
-- =====================================================================
