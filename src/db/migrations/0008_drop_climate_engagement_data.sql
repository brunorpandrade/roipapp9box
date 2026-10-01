-- ROIP APP 9BOX — migration 0008: DROP TABLE climateEngagementData
-- (ME-B2-01b Q1=D — aposentar cache de agregados de Clima).
--
-- A tabela derivada `climateEngagementData` foi aposentada
-- permanentemente. Agregados do Bloco Clima e Engajamento sao
-- computados sob demanda pelo motor puro
-- `climateCalculationEngine.computeClimateBlock` a cada leitura,
-- direto de `plenitudeData` + `instrumentA_responses` +
-- `employeeLeaderHistory`. Zero cache, zero drift permanente.
--
-- Ordem canonica de operacoes:
--   1. DROP FK constraints da tabela (companyId, liderId, clevelId).
--   2. DROP UNIQUE INDEX uq_climate_escopo.
--   3. DROP TABLE climateEngagementData.
--
-- Reversibilidade: irreversivel por design (dados perdidos podem
-- ser regenerados via motor a qualquer momento — motor e a fonte
-- unica canonica pos-Q1=D).

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `climateEngagementData`;
SET FOREIGN_KEY_CHECKS = 1;
