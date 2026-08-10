-- ROIP APP 9BOX — migration incremental 0001 (ME-068).
--
-- Escopo canonico: adicionar coluna `isDemo` em `companies` como flag
-- booleana nao-nula com default false. Habilita segregacao canonica de
-- empresas-demo (Nativa Alimentos Ltda. + futuras) do fluxo canonico
-- das empresas reais.
--
-- Fonte canonica: E-068-11 (bloco N7/S226 ME-068 aprovado).
--
-- Efeitos:
--   1. Motores automaticos (cycleScheduleEngine, monthlyClosureOrchestrator,
--      alertas, e-mails) filtram `isDemo = false` antes de processar.
--   2. Contadores e graficos do painel Super Admin §5.3 filtram
--      `isDemo = false` antes de agregar.
--   3. Lista de empresas do toggle §5.3 filtra `isDemo = false` (aba
--      dedicada "Empresas demo" fica para ME-068c).
--
-- Idempotencia: MySQL 8 aceita ADD COLUMN IF NOT EXISTS.
--
-- Nao ha migracao de dados: todas as empresas existentes ficam com
-- `isDemo = false` por default. A Nativa (seed subsequente em ME-068)
-- entra com `isDemo = true` explicito no INSERT.

ALTER TABLE `companies`
  ADD COLUMN IF NOT EXISTS `isDemo` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS `idx_companies_isDemo` ON `companies` (`isDemo`);
