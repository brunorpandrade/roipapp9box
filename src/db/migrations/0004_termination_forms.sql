-- ROIP APP 9BOX — migration incremental 0004 (ME-fila6 D2).
--
-- Escopo: especificacao "Turnover e desligamento — especificacao de
-- conteudo e fluxo" §3 e §4. Cria as tabelas 1:1 com
-- `employeeTerminationEvents` que guardam o Formulario A (entrevista de
-- desligamento voluntario) e o Formulario B (justificativa de
-- desligamento involuntario).
--
-- Efeitos:
--   1. Nenhuma alteracao em tabelas existentes (eventos antigos seguem
--      validos, sem formulario associado).
--   2. `0000_canonical.sql` recebe os mesmos 2 CREATE TABLE (bases novas
--      e testes).
--
-- Aplicacao em producao (Railway Console, RV-11): um CREATE TABLE por
-- bloco, na ordem deste arquivo.

CREATE TABLE IF NOT EXISTS `terminationVoluntaryInterviews` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `terminationEventId` INT NOT NULL,
  `motivoPrincipal` ENUM('remuneracao_beneficios','falta_perspectiva_carreira','relacao_lideranca_direta','sobrecarga_desequilibrio','cultura_clima','proposta_externa','motivo_pessoal_familiar','retorno_estudos','motivo_saude','outro') NOT NULL,
  `motivoSecundario1` ENUM('remuneracao_beneficios','falta_perspectiva_carreira','relacao_lideranca_direta','sobrecarga_desequilibrio','cultura_clima','proposta_externa','motivo_pessoal_familiar','retorno_estudos','motivo_saude','outro') DEFAULT NULL,
  `motivoSecundario2` ENUM('remuneracao_beneficios','falta_perspectiva_carreira','relacao_lideranca_direta','sobrecarga_desequilibrio','cultura_clima','proposta_externa','motivo_pessoal_familiar','retorno_estudos','motivo_saude','outro') DEFAULT NULL,
  `notaConfiancaLideranca` TINYINT NOT NULL,
  `notaReconhecimento` TINYINT NOT NULL,
  `notaRemuneracaoJusta` TINYINT NOT NULL,
  `notaOportunidadeCrescimento` TINYINT NOT NULL,
  `notaClarezaExpectativas` TINYINT NOT NULL,
  `notaAmbienteEquipe` TINYINT NOT NULL,
  `voltariaTrabalhar` ENUM('sim','nao','talvez') NOT NULL,
  `recomendariaEmpresa` ENUM('sim','nao','talvez') NOT NULL,
  `destino` ENUM('mesmo_setor','setor_diferente','empreendedorismo_autonomo','nao_buscando_emprego','prefere_nao_informar') NOT NULL,
  `oQuePoderiaReter` VARCHAR(500) NOT NULL,
  `comentariosAdicionais` VARCHAR(500) DEFAULT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_tvi_event` (`terminationEventId`),
  FOREIGN KEY (`terminationEventId`) REFERENCES `employeeTerminationEvents`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `terminationInvoluntaryJustifications` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `terminationEventId` INT NOT NULL,
  `categoria` ENUM('desempenho_abaixo','violacao_conduta','desalinhamento_cultural','reducao_quadro','fim_contrato_experiencia','extincao_funcao_custo','outro') NOT NULL,
  `houveFeedbackFormal` ENUM('sim','nao','nao_aplicavel') NOT NULL,
  `nivelDocumentacao` TINYINT NOT NULL,
  `justificativa` VARCHAR(500) NOT NULL,
  `necessidadeReposicao` BOOLEAN NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_tij_event` (`terminationEventId`),
  FOREIGN KEY (`terminationEventId`) REFERENCES `employeeTerminationEvents`(`id`) ON DELETE CASCADE
);
