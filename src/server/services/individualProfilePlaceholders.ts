// ROIP APP 9BOX — service `individualProfilePlaceholders` (ME-011;
// estendido em ME-fila3-reteste-ui).
//
// Repositorio tipado da tabela `individualProfilePlaceholders` (DOC 01
// §4.9). Registra pendencia do Perfil Individual no portal. Ator
// polimorfico padrao B (`userType` + `userId` sem FK formal). Transicoes de
// `status` vivem nos fluxos de Perfil Individual do Bloco B3 (DOC 03).
//
// ME-fila3-reteste-ui adiciona `listInconsistentesEnriquecidoByCompany`
// para consumo canonico da Secao 6 §5.5 nova (Perfil Individual
// inconsistente) — enriquece cada placeholder com nome/cargo do titular
// e tentativa/reteste da assessment mais recente.

import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
} from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
type NewIndividualProfilePlaceholder = typeof individualProfilePlaceholders.$inferInsert;

/** Enum canonico de `status` (§4.9). */
type PlaceholderStatus =
  'pendente' | 'em_andamento' | 'respondido' | 'inconsistente' | 'aguardando_nova_resposta';

/**
 * Cria um placeholder de Perfil Individual. Em producao, e chamado
 * automaticamente no cadastro de colaborador ou C-level (§4.9 regra 1).
 * Retorna o `id` autogerado.
 */
export async function insertPlaceholder(
  db: RoipDatabase,
  data: NewIndividualProfilePlaceholder,
): Promise<number> {
  const [result] = await db.insert(individualProfilePlaceholders).values(data).$returningId();
  if (!result) {
    throw new Error('insertPlaceholder: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Retorna o placeholder de um titular (userType + userId). Retorna
 * `undefined` se nao existir. Usado pelos motores do Perfil Individual
 * antes de transicionar status.
 */
export async function getPlaceholderByUser(
  db: RoipDatabase,
  companyId: number,
  userType: 'employee' | 'clevel',
  userId: number,
) {
  const rows = await db
    .select()
    .from(individualProfilePlaceholders)
    .where(
      and(
        eq(individualProfilePlaceholders.companyId, companyId),
        eq(individualProfilePlaceholders.userType, userType),
        eq(individualProfilePlaceholders.userId, userId),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os placeholders de uma empresa em ordem crescente de `id`.
 * Consumida pelo dashboard de pendencias do RH e Bruno.
 */
export async function listPlaceholdersByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(individualProfilePlaceholders)
    .where(eq(individualProfilePlaceholders.companyId, companyId))
    .orderBy(asc(individualProfilePlaceholders.id));
}

/**
 * Atualiza o `status` de um placeholder. Quando o status alvo e
 * `respondido`, o caller deve fornecer o timestamp em `respondidoEm` (o
 * schema aceita NULL — a semantica de "quando" fica com o caller).
 * Retorna o numero de linhas afetadas.
 */
export async function updatePlaceholderStatus(
  db: RoipDatabase,
  id: number,
  status: PlaceholderStatus,
  respondidoEm: Date | null = null,
): Promise<number> {
  const [result] = await db
    .update(individualProfilePlaceholders)
    .set({ status, respondidoEm })
    .where(eq(individualProfilePlaceholders.id, id));
  return result.affectedRows;
}

/**
 * Linha canonica retornada por `listInconsistentesEnriquecidoByCompany`
 * (ME-fila3-reteste-ui). Consumida pelo SSR da Secao 6 §5.5 nova
 * ("Perfil Individual inconsistente") no `PainelRHClient`.
 *
 * Campos enriquecidos:
 * - `userDisplayName` + `cargo`: extraidos de `employees` ou
 *   `cLevelMembers` conforme `userType`.
 * - `tentativaAtual`: `MAX(tentativa)` de `individualProfileAssessments`
 *   do titular na empresa (sempre >= 1 quando o placeholder existe em
 *   `inconsistente` ou `aguardando_nova_resposta` — nenhum titular
 *   chega nesses estados sem ter respondido ao menos uma vez).
 * - `ultimaTentativaEnviadaEm`: `enviadoEm` da assessment com a maior
 *   `tentativa`. Pode ser `null` quando a assessment mais recente e a
 *   nova aberta pelo `releaseRetest` (status='em_andamento').
 * - `retesteLiberadoEm`: `retesteLiberadoEm` da assessment mais recente
 *   quando ela foi aberta via reteste (`retesteLiberadoTipo` !== null).
 *   Utilizado apenas quando o placeholder esta `aguardando_nova_resposta`.
 */
export interface PerfilInconsistenteRow {
  readonly placeholderId: number;
  readonly userType: 'employee' | 'clevel';
  readonly userId: number;
  readonly userDisplayName: string;
  readonly cargo: string;
  readonly placeholderStatus: 'inconsistente' | 'aguardando_nova_resposta';
  readonly tentativaAtual: number;
  readonly ultimaTentativaEnviadaEm: Date | null;
  readonly retesteLiberadoEm: Date | null;
}

/**
 * Lista placeholders da empresa em estado `inconsistente` ou
 * `aguardando_nova_resposta`, enriquecidos com nome/cargo do titular e
 * metadados da assessment mais recente. Consumida pelo SSR da Secao 6
 * §5.5 nova do painel do RH (ME-fila3-reteste-ui).
 *
 * Estrategia canonica: 3 queries sequenciais Drizzle tipadas (RV-12).
 * 1. Placeholders da empresa nos dois estados de interesse.
 * 2. Identidades (employees + cLevelMembers) dos titulares retornados.
 * 3. Assessments do titular com `tentativa` maxima — para o payload
 *    canonico do §10.7 (tentativaAtual + ultimaTentativaEnviadaEm +
 *    retesteLiberadoEm).
 *
 * Ordenacao canonica de saida: `placeholderId` ASC (estavel; espelha
 * ordem de aparicao no box canonico do §5.5).
 */
export async function listInconsistentesEnriquecidoByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<readonly PerfilInconsistenteRow[]> {
  // (1) Placeholders nos dois estados de interesse do §10.6/§10.7.
  const placeholderRows = await db
    .select({
      id: individualProfilePlaceholders.id,
      userType: individualProfilePlaceholders.userType,
      userId: individualProfilePlaceholders.userId,
      status: individualProfilePlaceholders.status,
    })
    .from(individualProfilePlaceholders)
    .where(
      and(
        eq(individualProfilePlaceholders.companyId, companyId),
        or(
          eq(individualProfilePlaceholders.status, 'inconsistente'),
          eq(individualProfilePlaceholders.status, 'aguardando_nova_resposta'),
        ),
      ),
    )
    .orderBy(asc(individualProfilePlaceholders.id));

  if (placeholderRows.length === 0) {
    return [];
  }

  // (2) Identidades — separadas por `userType` (dois SELECT INs).
  const employeeIds = placeholderRows.filter((p) => p.userType === 'employee').map((p) => p.userId);
  const clevelIds = placeholderRows.filter((p) => p.userType === 'clevel').map((p) => p.userId);

  const employeeIdentities =
    employeeIds.length > 0
      ? await db
          .select({
            id: employees.id,
            name: employees.name,
            cargo: employees.cargo,
          })
          .from(employees)
          .where(and(eq(employees.companyId, companyId), inArray(employees.id, employeeIds)))
      : [];

  const clevelIdentities =
    clevelIds.length > 0
      ? await db
          .select({
            id: cLevelMembers.id,
            name: cLevelMembers.name,
            cargo: cLevelMembers.cargo,
          })
          .from(cLevelMembers)
          .where(and(eq(cLevelMembers.companyId, companyId), inArray(cLevelMembers.id, clevelIds)))
      : [];

  const employeeById = new Map<number, { name: string; cargo: string }>();
  for (const e of employeeIdentities) {
    employeeById.set(e.id, { name: e.name, cargo: e.cargo });
  }
  const clevelById = new Map<number, { name: string; cargo: string }>();
  for (const c of clevelIdentities) {
    clevelById.set(c.id, { name: c.name, cargo: c.cargo });
  }

  // (3) Assessments do titular — buscamos as linhas do titular com
  //     `tentativa` maxima. Drizzle nao expõe `DISTINCT ON` para
  //     MySQL; solucao canonica: buscar todas as assessments dos
  //     titulares em questao e resolver o `MAX(tentativa)` em JS
  //     (volume O(n) — n dezenas por empresa em PMEs).
  const assessmentRows = await db
    .select({
      userType: individualProfileAssessments.userType,
      userId: individualProfileAssessments.userId,
      tentativa: individualProfileAssessments.tentativa,
      enviadoEm: individualProfileAssessments.enviadoEm,
      retesteLiberadoEm: individualProfileAssessments.retesteLiberadoEm,
    })
    .from(individualProfileAssessments)
    .where(eq(individualProfileAssessments.companyId, companyId))
    .orderBy(desc(individualProfileAssessments.tentativa));

  // Reduz para "assessment com maior tentativa por (userType,userId)".
  const latestByKey = new Map<
    string,
    { tentativa: number; enviadoEm: Date | null; retesteLiberadoEm: Date | null }
  >();
  for (const a of assessmentRows) {
    const key = `${a.userType}:${a.userId}`;
    if (latestByKey.has(key)) {
      continue;
    }
    latestByKey.set(key, {
      tentativa: a.tentativa,
      enviadoEm: a.enviadoEm,
      retesteLiberadoEm: a.retesteLiberadoEm,
    });
  }

  // Monta payload canonico bit-a-bit.
  const out: PerfilInconsistenteRow[] = [];
  for (const p of placeholderRows) {
    const identity =
      p.userType === 'employee' ? employeeById.get(p.userId) : clevelById.get(p.userId);
    if (identity === undefined) {
      // Titular desligado ou removido — filtra silenciosamente.
      // Placeholder orfao e patologia esperada por edge case; o box
      // do §5.5 nao expoe linhas sem identidade valida.
      continue;
    }
    const key = `${p.userType}:${p.userId}`;
    const latest = latestByKey.get(key);
    const tentativaAtual = latest?.tentativa ?? 1;
    const ultimaTentativaEnviadaEm = latest?.enviadoEm ?? null;
    // `retesteLiberadoEm` so faz sentido enquanto o placeholder esta
    // `aguardando_nova_resposta` (nova tentativa aberta pelo release).
    const retesteLiberadoEm =
      p.status === 'aguardando_nova_resposta' ? (latest?.retesteLiberadoEm ?? null) : null;
    // Narrow canonico do status para o subset de interesse.
    const placeholderStatus: 'inconsistente' | 'aguardando_nova_resposta' =
      p.status === 'aguardando_nova_resposta' ? 'aguardando_nova_resposta' : 'inconsistente';
    out.push({
      placeholderId: p.id,
      userType: p.userType,
      userId: p.userId,
      userDisplayName: identity.name,
      cargo: identity.cargo,
      placeholderStatus,
      tentativaAtual,
      ultimaTentativaEnviadaEm,
      retesteLiberadoEm,
    });
  }
  return out;
}
