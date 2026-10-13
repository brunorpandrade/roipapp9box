// ROIP APP 9BOX — service `individualProfilePlaceholders` (ME-011;
// estendido em ME-fila3-reteste-ui; ampliado em ME-1.11 do ROADMAP_V3).
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
//
// ME-1.11 do ROADMAP_V3 amplia a `PerfilInconsistenteRow` com o campo
// `motivoInconsistencia: readonly MotivoRotulado[]`, humanizando os
// motivos pelos quais o motor marcou a tentativa como `baixa`
// confiabilidade. A query (3) seleciona tambem as 5 colunas `ia_*` +
// `status` e a reducao mantem simultaneamente a ultima assessment
// (para `tentativaAtual` + `retesteLiberadoEm`) e a ultima com
// `status='inconsistente'` (para `motivoInconsistencia` +
// `ultimaTentativaEnviadaEm`). Essa dupla reducao garante que
// placeholders em `aguardando_nova_resposta` continuem mostrando os
// motivos e a data da ultima tentativa que caiu em inconsistente, nao
// da nova tentativa em `em_andamento` aberta pelo `releaseRetest`.

import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
} from '../../db/schema';
import {
  classificarMotivosInconsistencia,
  type MotivoRotulado,
} from '../../lib/instruments/individualProfileReliabilityLabels';

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
 * (ME-fila3-reteste-ui; ampliada em ME-1.11). Consumida pelo SSR da
 * Secao 6 §5.5 nova ("Perfil Individual inconsistente") no
 * `PainelRHClient` + preview Super Admin via CORR1 do ME-B9-fechamento.
 *
 * Campos enriquecidos:
 * - `userDisplayName` + `cargo`: extraidos de `employees` ou
 *   `cLevelMembers` conforme `userType`.
 * - `tentativaAtual`: `MAX(tentativa)` de `individualProfileAssessments`
 *   do titular na empresa (sempre >= 1 quando o placeholder existe em
 *   `inconsistente` ou `aguardando_nova_resposta` — nenhum titular
 *   chega nesses estados sem ter respondido ao menos uma vez).
 * - `ultimaTentativaEnviadaEm`: `enviadoEm` da assessment canonica da
 *   ultima tentativa que o motor marcou como `inconsistente` — nos
 *   dois estados do placeholder, essa e a ultima resposta real do
 *   colaborador que caiu em baixa confiabilidade. Preenchido para
 *   tentativas pos-ME-1.11 (parte 3) e para historicos backfilled via
 *   SQL pontual do Railway Console. Pode ser `null` quando a tentativa
 *   anterior a ME-1.11 nao foi coberta pelo backfill.
 * - `retesteLiberadoEm`: `retesteLiberadoEm` da assessment mais recente
 *   quando ela foi aberta via reteste (`retesteLiberadoTipo` !== null).
 *   Utilizado apenas quando o placeholder esta `aguardando_nova_resposta`.
 * - `motivoInconsistencia` (ME-1.11): lista humanizada dos motivos pelos
 *   quais o motor classificou a ultima tentativa `inconsistente` como
 *   `baixa` confiabilidade. Reaproveita os 5 scores `ia_*` ja persistidos
 *   em `individualProfileAssessments` (DOC 01 §9.1) — zero migration,
 *   zero recalculo. Ordem canonica: `critico` antes de `medio` (modulo
 *   `individualProfileReliabilityLabels.ts`). Para placeholders em
 *   `aguardando_nova_resposta`, exibe os motivos da ultima tentativa
 *   `inconsistente`, nao da nova tentativa em `em_andamento`. Pode ser
 *   vazio quando o titular nao tem assessment `inconsistente` em
 *   historico (defensiva — nao esperado em producao).
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
  readonly motivoInconsistencia: readonly MotivoRotulado[];
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
  //
  //     ME-1.11: seleciona tambem `status` + 5 scores `ia_*` + reduz
  //     para dois mapas: (a) `latestByKey` — ultima assessment overall
  //     (para `tentativaAtual` + `retesteLiberadoEm`); (b)
  //     `latestInconsistenteByKey` — ultima assessment com
  //     `status='inconsistente'` (para `motivoInconsistencia` +
  //     `ultimaTentativaEnviadaEm`). Dupla reducao garante que
  //     placeholders em `aguardando_nova_resposta` mostrem os motivos
  //     da ultima inconsistente, nao da nova em_andamento aberta pelo
  //     releaseRetest.
  const assessmentRows = await db
    .select({
      userType: individualProfileAssessments.userType,
      userId: individualProfileAssessments.userId,
      tentativa: individualProfileAssessments.tentativa,
      status: individualProfileAssessments.status,
      enviadoEm: individualProfileAssessments.enviadoEm,
      retesteLiberadoEm: individualProfileAssessments.retesteLiberadoEm,
      ia_att: individualProfileAssessments.ia_att,
      ia_soc: individualProfileAssessments.ia_soc,
      ia_acq: individualProfileAssessments.ia_acq,
      ia_cons: individualProfileAssessments.ia_cons,
      ia_ext: individualProfileAssessments.ia_ext,
    })
    .from(individualProfileAssessments)
    .where(eq(individualProfileAssessments.companyId, companyId))
    .orderBy(desc(individualProfileAssessments.tentativa));

  // Reduz para "assessment com maior tentativa por (userType,userId)".
  const latestByKey = new Map<
    string,
    { tentativa: number; enviadoEm: Date | null; retesteLiberadoEm: Date | null }
  >();
  // Reduz para "assessment inconsistente com maior tentativa por
  // (userType,userId)" — ME-1.11.
  const latestInconsistenteByKey = new Map<
    string,
    {
      tentativa: number;
      enviadoEm: Date | null;
      ia_att: string | null;
      ia_soc: string | null;
      ia_acq: string | null;
      ia_cons: string | null;
      ia_ext: string | null;
    }
  >();
  for (const a of assessmentRows) {
    const key = `${a.userType}:${a.userId}`;
    if (!latestByKey.has(key)) {
      latestByKey.set(key, {
        tentativa: a.tentativa,
        enviadoEm: a.enviadoEm,
        retesteLiberadoEm: a.retesteLiberadoEm,
      });
    }
    if (a.status === 'inconsistente' && !latestInconsistenteByKey.has(key)) {
      latestInconsistenteByKey.set(key, {
        tentativa: a.tentativa,
        enviadoEm: a.enviadoEm,
        ia_att: a.ia_att,
        ia_soc: a.ia_soc,
        ia_acq: a.ia_acq,
        ia_cons: a.ia_cons,
        ia_ext: a.ia_ext,
      });
    }
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
    const latestInconsistente = latestInconsistenteByKey.get(key);
    const tentativaAtual = latest?.tentativa ?? 1;
    // `ultimaTentativaEnviadaEm` canonicamente aponta para a ultima
    // assessment `inconsistente` — ME-1.11. Em ambos os estados do
    // placeholder, essa e a ultima resposta real do colaborador.
    const ultimaTentativaEnviadaEm = latestInconsistente?.enviadoEm ?? null;
    // `retesteLiberadoEm` so faz sentido enquanto o placeholder esta
    // `aguardando_nova_resposta` (nova tentativa aberta pelo release).
    const retesteLiberadoEm =
      p.status === 'aguardando_nova_resposta' ? (latest?.retesteLiberadoEm ?? null) : null;
    // Narrow canonico do status para o subset de interesse.
    const placeholderStatus: 'inconsistente' | 'aguardando_nova_resposta' =
      p.status === 'aguardando_nova_resposta' ? 'aguardando_nova_resposta' : 'inconsistente';
    // ME-1.11: classifica motivos a partir dos 5 scores `ia_*` da
    // ultima assessment `inconsistente`. Zero migration, zero
    // recalculo. Vazio quando nao ha historico de inconsistente
    // (defensiva — nao esperado em producao canonica).
    const motivoInconsistencia: readonly MotivoRotulado[] =
      latestInconsistente === undefined
        ? []
        : classificarMotivosInconsistencia({
            ia_att: latestInconsistente.ia_att,
            ia_soc: latestInconsistente.ia_soc,
            ia_acq: latestInconsistente.ia_acq,
            ia_cons: latestInconsistente.ia_cons,
            ia_ext: latestInconsistente.ia_ext,
          });
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
      motivoInconsistencia,
    });
  }
  return out;
}
