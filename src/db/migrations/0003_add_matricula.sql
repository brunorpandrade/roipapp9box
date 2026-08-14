-- ROIP APP 9BOX — migration incremental 0003 (ME-080b Dispatch 1).
--
-- Escopo canonico: adicionar coluna `matricula` VARCHAR(4) NULL em
-- `employees` e `cLevelMembers`, com indice UNIQUE (companyId, matricula)
-- em ambas. Habilita segundo fator de autenticacao do portal do
-- colaborador (CPF + matricula) canonizado na ME-080b (S515/S516).
--
-- Fonte canonica: N7/S226 ME-080b travado + Dispatch 1 aprovado.
--
-- Semantica:
--   - Formato canonico: ^[A-Z]{2}[0-9]{2}$ (2 letras + 2 digitos, upper).
--   - Case-insensitive no login: normalizacao para uppercase antes de
--     buscar (armazenamento sempre uppercase).
--   - UNIQUE por empresa: MySQL InnoDB aceita multiplos NULL em UNIQUE
--     composto, permitindo migracao gradual (colaboradores existentes
--     ficam com matricula NULL ate serem repopulados pelo reseed no
--     Dispatch 5).
--   - C-level tambem recebe matricula: acessa o portal para preencher
--     Perfil Individual, Instrumento C (como lider) e IQL.
--
-- Idempotencia: MySQL 8 aceita ADD COLUMN IF NOT EXISTS e ADD UNIQUE
-- KEY nomeado — a segunda execucao vira no-op (mesmo indice ja existe).
--
-- Migracao de dados: DEFAULT NULL aplicado aos registros existentes.
-- A Nativa (unica empresa em producao) sera repopulada pelo reseed
-- completo do Dispatch 5, quando todas as matriculas dos 66 employees
-- e 3 C-levels serao geradas deterministicamente.

ALTER TABLE `employees`
  ADD COLUMN IF NOT EXISTS `matricula` VARCHAR(4) DEFAULT NULL;

ALTER TABLE `employees`
  ADD UNIQUE KEY `uq_employee_matricula` (`companyId`, `matricula`);

ALTER TABLE `cLevelMembers`
  ADD COLUMN IF NOT EXISTS `matricula` VARCHAR(4) DEFAULT NULL;

ALTER TABLE `cLevelMembers`
  ADD UNIQUE KEY `uq_clevel_matricula` (`companyId`, `matricula`);
