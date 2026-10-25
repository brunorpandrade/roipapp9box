-- ROIP APP 9BOX — migration 0012 (ME-1.17, Conversa 5 — Famílias de
-- função 100% customizáveis).
--
-- Opcao A canonica (Eixo 1): nova tabela `companyRoleFamilySettings`
-- com chave unica (companyId, jobFamily). 1 linha POR FAMILIA (nao
-- por variavel — variaveis ja vivem em `companyJobFamilies`).
--
-- Decisao executiva de Bruno em 24/10/2026 (Conversa 5):
--   - 6 canonicas mantidas como seed universal pre-populado.
--   - 20 slots `custom1..custom20` reservados como capacidade.
--   - Todas as familias sao renomeaveis, reordenaveis e desativaveis
--     (via tabela nova), EXCETO `lideranca_gestao` — trava canonica
--     absoluta (nome fixo, 4 variaveis fixas, unidade fixa, pesos
--     editaveis com soma = 100; UI nao expoe botao de desativar,
--     renomear nem reordenar — nem desabilitado, simplesmente nao
--     existe no DOM).
--   - Nenhum benchmark cross-empresa planejado — resolver pode
--     retornar nome customizado em qualquer superficie sem reserva.
--
-- Backfill canonico idempotente: segunda execucao e no-op pela
-- clausula INSERT IGNORE sobre a chave unica (companyId, jobFamily).
-- Para cada empresa existente, insere as 6 canonicas ativas com
-- nomeCustomizado=NULL e ordem=1..6. updatedBy=1 (super admin
-- canonico semeado em M015).
--
-- RV-11: SQL manual no Railway Console, uma instrucao por bloco
-- (quatro execucoes separadas abaixo).

-- Bloco 1 — ALTER ENUM da coluna `employees.jobFamily`: expansao de
-- 6 para 26 valores (6 canonicas + 20 custom slots).
ALTER TABLE `employees`
  MODIFY COLUMN `jobFamily` ENUM(
    'vendas_comercial',
    'producao_operacoes',
    'tecnico_especialista',
    'administrativo_suporte',
    'atendimento_relacionamento',
    'lideranca_gestao',
    'custom1','custom2','custom3','custom4','custom5',
    'custom6','custom7','custom8','custom9','custom10',
    'custom11','custom12','custom13','custom14','custom15',
    'custom16','custom17','custom18','custom19','custom20'
  ) NOT NULL;

-- Bloco 2 — ALTER ENUM da coluna `employeeGoals.jobFamily`: mesma
-- expansao canonica bit-exact ao bloco 1.
ALTER TABLE `employeeGoals`
  MODIFY COLUMN `jobFamily` ENUM(
    'vendas_comercial',
    'producao_operacoes',
    'tecnico_especialista',
    'administrativo_suporte',
    'atendimento_relacionamento',
    'lideranca_gestao',
    'custom1','custom2','custom3','custom4','custom5',
    'custom6','custom7','custom8','custom9','custom10',
    'custom11','custom12','custom13','custom14','custom15',
    'custom16','custom17','custom18','custom19','custom20'
  ) NOT NULL;

-- Bloco 3 — ALTER ENUM da coluna `companyJobFamilies.jobFamily`:
-- mesma expansao canonica bit-exact ao bloco 1.
ALTER TABLE `companyJobFamilies`
  MODIFY COLUMN `jobFamily` ENUM(
    'vendas_comercial',
    'producao_operacoes',
    'tecnico_especialista',
    'administrativo_suporte',
    'atendimento_relacionamento',
    'lideranca_gestao',
    'custom1','custom2','custom3','custom4','custom5',
    'custom6','custom7','custom8','custom9','custom10',
    'custom11','custom12','custom13','custom14','custom15',
    'custom16','custom17','custom18','custom19','custom20'
  ) NOT NULL;

-- Bloco 4 — CREATE TABLE `companyRoleFamilySettings`.
CREATE TABLE `companyRoleFamilySettings` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `companyId` INT NOT NULL,
  `jobFamily` ENUM(
    'vendas_comercial',
    'producao_operacoes',
    'tecnico_especialista',
    'administrativo_suporte',
    'atendimento_relacionamento',
    'lideranca_gestao',
    'custom1','custom2','custom3','custom4','custom5',
    'custom6','custom7','custom8','custom9','custom10',
    'custom11','custom12','custom13','custom14','custom15',
    'custom16','custom17','custom18','custom19','custom20'
  ) NOT NULL,
  `nomeCustomizado` VARCHAR(100) DEFAULT NULL,
  `ativo` BOOLEAN NOT NULL DEFAULT TRUE,
  `ordem` INT NOT NULL,
  `updatedBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_crfs` (`companyId`, `jobFamily`),
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`updatedBy`) REFERENCES `superAdmins`(`id`) ON DELETE RESTRICT
);

-- Bloco 5 — Seed canonico idempotente das 6 canonicas por empresa
-- existente. INSERT IGNORE: segunda execucao e no-op para linhas ja
-- presentes (chave UNIQUE `uq_crfs(companyId, jobFamily)`).
INSERT IGNORE INTO `companyRoleFamilySettings`
  (`companyId`, `jobFamily`, `nomeCustomizado`, `ativo`, `ordem`, `updatedBy`)
SELECT c.`id`, 'vendas_comercial', NULL, TRUE, 1, 1 FROM `companies` c
UNION ALL
SELECT c.`id`, 'producao_operacoes', NULL, TRUE, 2, 1 FROM `companies` c
UNION ALL
SELECT c.`id`, 'tecnico_especialista', NULL, TRUE, 3, 1 FROM `companies` c
UNION ALL
SELECT c.`id`, 'administrativo_suporte', NULL, TRUE, 4, 1 FROM `companies` c
UNION ALL
SELECT c.`id`, 'atendimento_relacionamento', NULL, TRUE, 5, 1 FROM `companies` c
UNION ALL
SELECT c.`id`, 'lideranca_gestao', NULL, TRUE, 6, 1 FROM `companies` c;
