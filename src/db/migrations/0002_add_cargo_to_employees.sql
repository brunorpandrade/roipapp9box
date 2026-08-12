-- ROIP APP 9BOX — migration incremental 0002 (ME-078b).
--
-- Escopo canonico: adicionar coluna `cargo` VARCHAR(100) NOT NULL em
-- `employees`. Fecha divergencia canonica DIV-01 detectada em RV-09
-- dirigida (7a aplicacao L116): mockup canonico `cadastro_colaborador_v1.html`
-- linha 831-833 + CAMADA_UI §13.4 Secao 2 + CAMADA_DADOS §4.5 canonicos
-- documentais preveem coluna `cargo` — schema Drizzle pre-existente
-- tinha apenas `cbo` + `descricaoCBO`. `cargo` e semanticamente
-- distinto do `descricaoCBO` (Cargo = titulo livre "Analista Comercial
-- Senior"; descricaoCBO = descricao oficial da tabela CBO federal).
--
-- Fonte canonica: D1 do bloco N7/S226 ME-078b aprovado.
--
-- Idempotencia: MySQL 8 aceita ADD COLUMN IF NOT EXISTS.
--
-- Migracao de dados: DEFAULT '' aplicado aos registros existentes (base
-- de producao Railway nao tem colaboradores reais na abertura da
-- ME-078b — primeiro cliente entra em ME-Primeiro-Cliente). Novos INSERTs
-- via `employees.create` obrigam `cargo` nao-vazio via zod
-- `CREATE_EMPLOYEE_INPUT_SCHEMA.cargo.min(1)`.

ALTER TABLE `employees`
  ADD COLUMN IF NOT EXISTS `cargo` VARCHAR(100) NOT NULL DEFAULT '';
