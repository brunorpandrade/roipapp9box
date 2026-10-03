-- ROIP APP 9BOX — migration 0010 (ME-B9.3 Bloco B9).
--
-- Eleva as colunas canônicas de foto (`photoUrl`) de employees e
-- cLevelMembers de VARCHAR(500) para MEDIUMTEXT, pelo mesmo motivo que
-- a migration 0009 fez para `companies.logoUrl` em ME-B9.2: a decisão
-- canônica B9.3 persiste a foto como data URL base64 inline (saída real
-- 50-200KB), muito acima do cap VARCHAR(500) herdado da estrutura
-- original quando a decisão D3 do ME-078b era "avatar auto-gerado por
-- iniciais" (D3 agora canonicamente superada por D-B9.3 em 03/10/2026).
--
-- RV-11: SQL manual no Railway Console, uma instrução por bloco (duas
-- execuções separadas).

ALTER TABLE `employees` MODIFY COLUMN `photoUrl` MEDIUMTEXT NULL;

ALTER TABLE `cLevelMembers` MODIFY COLUMN `photoUrl` MEDIUMTEXT NULL;
