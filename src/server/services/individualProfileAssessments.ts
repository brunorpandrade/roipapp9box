// ROIP APP 9BOX — service `individualProfileAssessments` (ME-015).
//
// Repositorio tipado da tabela canonica `individualProfileAssessments`
// (DOC 01 §9.1). Respostas brutas e controle de tentativas do
// instrumento de Perfil Individual de 80 itens (S423). Tabela MUTAVEL
// com ciclo de vida em fases distintas, cada uma com setter dedicado:
//
// - Preenchimento: `blocoAtual` (1-10), `blocosCompletos` (JSON) e
//   `respostas` (JSON { "ITEM_001": 4, ... }) avancam a cada bloco
//   salvo (`updateIndividualProfileProgresso`).
// - Envio: `status` passa a `enviado` e `enviadoEm` e gravado
//   (`updateIndividualProfileEnvio`).
// - Resultado da Camada 1 do motor deterministico (DOC 03):
//   `confiabilidadeNivel` + os 5 indices de confiabilidade (`ia_att`,
//   `ia_soc`, `ia_acq`, `ia_cons`, `ia_ext`) + `calculadoEm`; quando a
//   confiabilidade e baixa o motor para na Camada 1 e o `status` vira
//   `inconsistente` (`updateIndividualProfileResultado`).
// - Liberacao de reteste: `retesteLiberadoPor` polimorfico por
//   `retesteLiberadoTipo` (`rh` -> employees.id; `super_admin` ->
//   superAdmins.id) + `retesteLiberadoEm`
//   (`updateIndividualProfileReteste`).
//
// Polimorfismo padrao B (§2.3) no titular: `userType` enum
// (`employee` | `clevel`) + `userId` sem FK formal — integridade
// validada na aplicacao. Nova tentativa = novo registro com `tentativa`
// incrementada; a UNIQUE `uq_ipa_tentativa` (companyId, userType,
// userId, tentativa) impede duplicacao por tentativa.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { individualProfileAssessments } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewIndividualProfileAssessment = typeof individualProfileAssessments.$inferInsert;

/**
 * Insere uma tentativa de avaliacao de perfil individual. Retorna o
 * `id` autogerado. Erros de FK (`companyId`) e de UNIQUE
 * (`uq_ipa_tentativa`) sobem como excecoes do mysql2. A integridade do
 * par (userType, userId) e responsabilidade do caller (padrao B).
 */
export async function insertIndividualProfileAssessment(
  db: RoipDatabase,
  data: NewIndividualProfileAssessment,
): Promise<number> {
  const [result] = await db.insert(individualProfileAssessments).values(data).$returningId();
  if (!result) {
    throw new Error(
      'insertIndividualProfileAssessment: insert retornou sem id (estado inconsistente)',
    );
  }
  return result.id;
}

/** Busca uma tentativa pelo `id`. Retorna `undefined` se nao existir. */
export async function getIndividualProfileAssessmentById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(individualProfileAssessments)
    .where(eq(individualProfileAssessments.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca uma tentativa pela chave logica UNIQUE (`companyId`,
 * `userType`, `userId`, `tentativa`). Retorna `undefined` se nao
 * existir.
 */
export async function getIndividualProfileAssessmentByTentativa(
  db: RoipDatabase,
  companyId: number,
  userType: 'employee' | 'clevel',
  userId: number,
  tentativa: number,
) {
  const rows = await db
    .select()
    .from(individualProfileAssessments)
    .where(
      and(
        eq(individualProfileAssessments.companyId, companyId),
        eq(individualProfileAssessments.userType, userType),
        eq(individualProfileAssessments.userId, userId),
        eq(individualProfileAssessments.tentativa, tentativa),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista as tentativas de um titular, ordenadas por `tentativa`
 * ascendente. Cobre o indice `idx_ipa_user`.
 */
export async function listIndividualProfileAssessmentsByUser(
  db: RoipDatabase,
  companyId: number,
  userType: 'employee' | 'clevel',
  userId: number,
) {
  return await db
    .select()
    .from(individualProfileAssessments)
    .where(
      and(
        eq(individualProfileAssessments.companyId, companyId),
        eq(individualProfileAssessments.userType, userType),
        eq(individualProfileAssessments.userId, userId),
      ),
    )
    .orderBy(asc(individualProfileAssessments.tentativa));
}

/**
 * Lista as tentativas de uma empresa em um dado `status`, ordenadas por
 * `id` ascendente. Cobre o indice `idx_ipa_status` — consumida pelas
 * telas de acompanhamento do RH.
 */
export async function listIndividualProfileAssessmentsByCompanyStatus(
  db: RoipDatabase,
  companyId: number,
  status: 'em_andamento' | 'enviado' | 'inconsistente',
) {
  return await db
    .select()
    .from(individualProfileAssessments)
    .where(
      and(
        eq(individualProfileAssessments.companyId, companyId),
        eq(individualProfileAssessments.status, status),
      ),
    )
    .orderBy(asc(individualProfileAssessments.id));
}

/**
 * Grava o progresso do preenchimento (bloco atual, blocos completos e
 * respostas acumuladas). Retorna o numero de linhas afetadas.
 */
export async function updateIndividualProfileProgresso(
  db: RoipDatabase,
  id: number,
  patch: {
    blocoAtual: number;
    blocosCompletos: unknown;
    respostas: unknown;
  },
): Promise<number> {
  const [result] = await db
    .update(individualProfileAssessments)
    .set({
      blocoAtual: patch.blocoAtual,
      blocosCompletos: patch.blocosCompletos,
      respostas: patch.respostas,
    })
    .where(eq(individualProfileAssessments.id, id));
  return result.affectedRows;
}

/**
 * Marca o envio da tentativa (`status='enviado'` + `enviadoEm`).
 * Retorna o numero de linhas afetadas.
 */
export async function updateIndividualProfileEnvio(
  db: RoipDatabase,
  id: number,
  enviadoEm: Date,
): Promise<number> {
  const [result] = await db
    .update(individualProfileAssessments)
    .set({ status: 'enviado', enviadoEm })
    .where(eq(individualProfileAssessments.id, id));
  return result.affectedRows;
}

/**
 * Grava o resultado da Camada 1 do motor deterministico: nivel de
 * confiabilidade, os 5 indices e `calculadoEm`. O `status` resultante e
 * decidido pelo motor (`enviado` mantido quando confiavel;
 * `inconsistente` quando o motor para na Camada 1). Retorna o numero de
 * linhas afetadas.
 */
export async function updateIndividualProfileResultado(
  db: RoipDatabase,
  id: number,
  patch: {
    status: 'enviado' | 'inconsistente';
    confiabilidadeNivel: 'alta' | 'moderada' | 'baixa';
    ia_att: string;
    ia_soc: string;
    ia_acq: string;
    ia_cons: string;
    ia_ext: string;
    calculadoEm: Date;
  },
): Promise<number> {
  const [result] = await db
    .update(individualProfileAssessments)
    .set({
      status: patch.status,
      confiabilidadeNivel: patch.confiabilidadeNivel,
      ia_att: patch.ia_att,
      ia_soc: patch.ia_soc,
      ia_acq: patch.ia_acq,
      ia_cons: patch.ia_cons,
      ia_ext: patch.ia_ext,
      calculadoEm: patch.calculadoEm,
    })
    .where(eq(individualProfileAssessments.id, id));
  return result.affectedRows;
}

/**
 * Registra a liberacao de reteste sobre a tentativa vigente
 * (polimorfismo padrao B: `retesteLiberadoTipo='rh'` -> employees.id;
 * `'super_admin'` -> superAdmins.id). Retorna o numero de linhas
 * afetadas.
 */
export async function updateIndividualProfileReteste(
  db: RoipDatabase,
  id: number,
  patch: {
    retesteLiberadoPor: number;
    retesteLiberadoTipo: 'rh' | 'super_admin';
    retesteLiberadoEm: Date;
  },
): Promise<number> {
  const [result] = await db
    .update(individualProfileAssessments)
    .set({
      retesteLiberadoPor: patch.retesteLiberadoPor,
      retesteLiberadoTipo: patch.retesteLiberadoTipo,
      retesteLiberadoEm: patch.retesteLiberadoEm,
    })
    .where(eq(individualProfileAssessments.id, id));
  return result.affectedRows;
}

/**
 * Remove uma tentativa pelo `id`. Somente para teardown de testes — em
 * producao a tabela e retentiva (o ON DELETE RESTRICT de
 * `individualProfileScores.assessmentId` bloqueia quando ha scores).
 * Retorna o numero de linhas afetadas.
 */
export async function deleteIndividualProfileAssessmentById(
  db: RoipDatabase,
  id: number,
): Promise<number> {
  const [result] = await db
    .delete(individualProfileAssessments)
    .where(eq(individualProfileAssessments.id, id));
  return result.affectedRows;
}
