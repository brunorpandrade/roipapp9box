-- ROIP APP 9BOX — migration incremental 0005 (ME 3.5 D1).
--
-- Escopo: item 3.5 da Etapa 0 (§4 do operacao POS_FILA_v14). Adiciona
-- coluna `isRH` em `cLevelMembers` para permitir que um C-level opere
-- funcoes de RH na plataforma via toggle "Painel C-level / Painel RH"
-- (D2 aprovado em bloco).
--
-- Efeitos:
--   1. `cLevelMembers` ganha coluna `isRH BOOLEAN NOT NULL DEFAULT FALSE`.
--      Idempotente: usa `ADD COLUMN IF NOT EXISTS` para nao reprovar em
--      re-execucao sobre base ja migrada.
--   2. Nenhum C-level existente e afetado — todos recebem `false` por
--      default, comportamento identico ao anterior a esta migration.
--
-- Aplicacao em producao (Railway Console, RV-11): executar como bloco
-- unico. Zero risco para as duas empresas demo ja cadastradas (Nativa
-- companyId=1 e Ubatuba companyId=2).

ALTER TABLE `cLevelMembers`
  ADD COLUMN IF NOT EXISTS `isRH` BOOLEAN NOT NULL DEFAULT FALSE;
