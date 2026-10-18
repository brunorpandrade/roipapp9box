-- ROIP APP 9BOX — migration 0011 (ME-1.13, Conversa 4b, Despacho B).
--
-- Separa fato (data civil do desligamento) de registro (timestamp
-- sistemico da inativacao). Opcao A canonica: manter AMBAS as datas,
-- aparecer no relatorio de motivo e na tabela de turnover. Decisao
-- executiva de Bruno em 18/10/2026 meio-dia + canonizada na Conversa
-- 4b (ROADMAP_V5 item 1.13 + OPERACAO_V15 §5 D-B1).
--
-- Nullable: colaboradores ativos nao tem data de desligamento.
--
-- Backfill canonico idempotente (segunda execucao e no-op pela clausula
-- WHERE): para cada employee inativo com uma inativacao registrada em
-- employeeTerminationEvents, preenche dataDesligamento com a DATE
-- (truncando o timestamp) do evento mais recente. Casos sem evento (ex:
-- empresas-demo antigas sem o fluxo canonico) permanecem com NULL — nao
-- forca valor arbitrario.
--
-- RV-11: SQL manual no Railway Console, uma instrucao por bloco (duas
-- execucoes separadas).

ALTER TABLE `employees`
  ADD COLUMN `dataDesligamento` DATE DEFAULT NULL AFTER `dataAdmissao`;

UPDATE `employees` e
JOIN (
  SELECT `employeeId`, MAX(`dataInativacao`) AS maxData
  FROM `employeeTerminationEvents`
  GROUP BY `employeeId`
) t ON t.`employeeId` = e.`id`
SET e.`dataDesligamento` = DATE(t.maxData)
WHERE e.`dataDesligamento` IS NULL AND e.`status` = 'inativo';
