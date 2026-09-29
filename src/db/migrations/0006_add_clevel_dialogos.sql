-- ROIP APP 9BOX — migration incremental 0006 (ME Etapa 1 — patch v6).
--
-- Escopo canonico: reescreve §10.1 do DOC 01. Segue precedente §4.6
-- (employeeLeaderHistory: liderId XOR clevelId). C-level lider direto
-- passa a poder criar dialogos de desenvolvimento canonicamente
-- (canonizacao Bruno 2026-09-28: "C-level Cenario 1/2 e simetrico a
-- Lider Cenario 1/2 em permissoes").
--
-- Efeitos:
--   1. `developmentDialogs.liderId` relaxa `NOT NULL` (agora nullable).
--   2. `developmentDialogs` ganha coluna `clevelId INT NULL FK
--      cLevelMembers(id) ON DELETE RESTRICT`.
--   3. Dois indices novos:
--        - `idx_dd_clevel_emp` (clevelId, employeeId) — espelha
--          `idx_dd_lider_emp` para consulta canonica por par
--          (C-level, colaborador).
--        - `idx_dd_clevel_pend` (clevelId, pendencia, arquivado) —
--          espelha `idx_dd_lider_pend` para o card canonico de
--          pendencias no painel do C-level (ME-PAINEL-PENDENCIAS-DIALOGOS
--          futura).
--   4. Restricao XOR (liderId XOR clevelId) e canonicamente imposta pelo
--      caller (service/router) — nao ha CHECK constraint SQL (padrao
--      canonico do repo).
--
-- Compatibilidade retroativa:
--   - Linhas existentes tem `liderId NOT NULL` preenchido — continuam
--     validas apos o relaxamento (semantica XOR: liderId preenchido +
--     clevelId NULL).
--   - Nenhuma migracao de dados necessaria.
--
-- Aplicacao em producao (Railway Console, RV-11): executar como bloco
-- unico. Zero risco para as empresas demo Nativa (companyId=1) e
-- Ubatuba (companyId=2) — nenhum dialogo existente e afetado.

ALTER TABLE `developmentDialogs`
  MODIFY COLUMN `liderId` INT NULL;

ALTER TABLE `developmentDialogs`
  ADD COLUMN `clevelId` INT NULL,
  ADD CONSTRAINT `developmentDialogs_clevelId_cLevelMembers_id_fk`
    FOREIGN KEY (`clevelId`) REFERENCES `cLevelMembers`(`id`) ON DELETE RESTRICT;

CREATE INDEX `idx_dd_clevel_emp`
  ON `developmentDialogs` (`clevelId`, `employeeId`);

CREATE INDEX `idx_dd_clevel_pend`
  ON `developmentDialogs` (`clevelId`, `pendencia`, `arquivado`);
