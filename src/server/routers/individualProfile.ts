// ROIP APP 9BOX — sub-router `individualProfile` (ME-049b).
//
// Vigesima-quinta ME de codigo do Bloco B3. Fecha a superficie de
// LEITURA e de RETESTE do Perfil Individual (DOC 03 §10.7-§10.13). O
// motor deterministico das 5 camadas (§10.4-§10.6) e as 3 pontas de
// escrita do portal nasceram na ME-049a; este sub-router expoe o que
// o motor materializou e o unico ato administrativo do §10: liberar
// nova tentativa quando a confiabilidade veio baixa.
//
// Procedures canonicas (§10.13):
//   - `individualProfile.getReport`     — metadados do relatorio da
//     tentativa vigente + textos quando ja gerados.
//   - `individualProfile.releaseRetest` — libera reteste (§10.7).
//
// Fora do escopo desta ME por E04/S224: `individualProfile.generatePDF`
// (§10.10) e qualquer chamada a Claude API. O gatilho de geracao dos
// textos entra aqui como hook DI no-op (S210), religado ao wrapper
// real na ME-050/51 por [EDIT] cirurgico unico (S224).
//
// --------------------------------------------------------------
// Decisoes canonicas desta ME
// --------------------------------------------------------------
//
// S210 — `getReport` e 100% deterministico no Bloco B3. Le a linha de
//   `individualProfileScores`, devolve os textos quando preenchidos e,
//   quando `NULL`, sinaliza `gerandoResumo`/`gerandoExpandido` e aciona
//   o hook de geracao. O hook default nao faz nada: no B3 nao ha camada
//   de IA, e um `getReport` que dependesse dela seria nao-deterministico.
//
// S211 — PC1e (§10.11 + §15.5) implementada como codigo tRPC FORBIDDEN
//   (mapeamento S020) quando o titular e C-level e o caller nao e
//   super_admin. A mensagem exata do `AccessDeniedPage` pertence ao
//   DOC 02 §11.5 e viaja como `message` do erro — a UI (Bloco B5) a
//   renderiza; esta camada declara apenas o gatilho backend (§15.8).
//
// S212/S231 — `releaseRetest` e restrito a super_admin + rh + rh_lider
//   (paridade com S198). Quando o TITULAR e C-level, §15.5 estende PC1e
//   explicitamente ao `releaseRetest`: so super_admin atravessa. S231
//   estreita S212 nesse recorte — a pre-canonizacao nao substitui a
//   revalidacao RV-09.
//
// S213 — "Tentativa vigente" e resolvida na CAMADA DE LEITURA: a linha
//   de `individualProfileScores` de maior `tentativa` do titular.
//   Tentativas anteriores permanecem no banco por auditoria (§10.7,
//   "Substituicao integral de dados canonica") e nunca sao expostas.
//   Como o motor so insere score quando a confiabilidade NAO e baixa
//   (§10.6), o maior `tentativa` de `individualProfileScores` e, por
//   construcao, a tentativa consistente mais recente.
//
// S230 — Autorizacao de `getReport` = matriz DOC 02 (aplicacao de
//   S209), sem inventar permissao: super_admin, rh, rh_lider, clevel e
//   lider, com a mesma cadeia de guards ja provada em
//   `plenitude.getPlenitudeData` (ME-042): escopo de empresa (§2.4),
//   colaborador inativo restrito a Bruno + RH (§3.13) e cadeia direta
//   de lider (S066) quando `role === 'lider'`.
//
// S232 — Os campos de reteste (`retesteLiberadoPor`,
//   `retesteLiberadoTipo`, `retesteLiberadoEm`) sao gravados no INSERT
//   da NOVA tentativa. Leitura literal do §10.7: o passo 3 ("Registra
//   na mesma linha") sucede imediatamente o passo 2, que cria o novo
//   registro. Uma unica operacao, sem UPDATE na tentativa anterior.
//
// S233 — DTO canonico do `getReport`: linha de score + metadados da
//   tentativa que a originou + as duas flags de geracao. Sem linha de
//   score, retorna `null` (§10.13 e omisso; precedente
//   `plenitude.getPlenitudeData`).
//
// S234 — Pre-condicao violada em `releaseRetest` (placeholder ausente
//   ou fora de `inconsistente`) → BAD_REQUEST, dentro do conjunto
//   fechado de codigos do S020.
//
// --------------------------------------------------------------
// Convencoes canonicas herdadas
// --------------------------------------------------------------
//
//   - Facade DI + factory `{ now, reportGeneration }` (S205, padrao
//     S105/S060). Defaults reais no `appRouter`; testes injetam mock e
//     relogio fixo.
//   - Mensagens canonicas exportadas como constantes nomeadas (S206).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero codigo morto: cada export tem chamador em
//     `tests/integration/individualProfile-router.test.ts` (RV-13).
//   - Transacao atomica no `releaseRetest`: INSERT da nova tentativa +
//     UPDATE do placeholder vivem no mesmo `db.transaction`.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).

import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companies,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
  individualProfileScores,
} from '../../db/schema';
import { getActiveLeaderHistoryByEmployee } from '../services/employeeLeaderHistory';
import { DEFAULT_PDF_RENDERER_FACADE, type PdfRendererFacade } from '../services/pdfRenderer';
import {
  composeIndividualProfileFilename,
  type IndividualProfileExpandidoJson,
  type IndividualProfileSubvector,
  renderIndividualProfileHTML,
} from '../pdf-templates/individualProfileTemplate';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';
import { assertCompanyScope } from './employees';

// ============================================================
// Mensagens canonicas (S206)
// ============================================================

/**
 * DOC 02 §11.5 — mensagem canonica exata do `AccessDeniedPage` de
 * PC1e. Reproduzida literalmente: o DOC 03 §15.8 canoniza que esta
 * camada declara apenas o gatilho HTTP 403 e que o texto pertence ao
 * DOC 02.
 */
export const MSG_PC1E_PERFIL_INDIVIDUAL_CLEVEL =
  'Você não tem permissão para acessar o Perfil Individual deste colaborador. ' +
  'Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, ' +
  'contate o Super Admin.';

/** §3.13 — leitura de titular inativo restrita a Bruno e RH. */
export const MSG_TITULAR_INATIVO_RESTRITO =
  'Perfil Individual de colaborador inativo restrito a Bruno e RH.';

/** S066 — lider ve apenas liderados diretos ativos. */
export const MSG_FORA_DA_CADEIA_DIRETA = 'Colaborador fora da cadeia direta do líder.';

/** Titular inexistente na empresa informada. */
export const MSG_TITULAR_NAO_ENCONTRADO = 'Colaborador não encontrado na empresa informada.';

/**
 * §10.7 validacao 1 — o reteste so e liberavel sobre placeholder em
 * `inconsistente`. Qualquer outro estado (ou ausencia de placeholder)
 * e BAD_REQUEST canonico (S234).
 */
export const MSG_RETESTE_PRECONDICAO =
  'Reteste só pode ser liberado quando o Perfil Individual está inconsistente.';

/** §10.7 passo 2 — nao ha tentativa anterior de onde derivar a nova. */
export const MSG_RETESTE_SEM_TENTATIVA =
  'Nenhuma tentativa registrada para o colaborador informado.';

/**
 * §10.10 — pre-condicao para o download do PDF: o `expandidoJson` ja
 * esta cacheado. Enquanto NULL, a IA ainda nao gerou (ou falhou); o
 * frontend redispara `getReport` em polling curto (§13.1). Mensagem
 * canonica literal preservada do §10.10.
 */
export const MSG_GENERATE_PDF_AGUARDE = 'Aguarde a geração do relatório para baixar o PDF.';

/** §10.10 — score canonico ausente para o titular informado. */
export const MSG_GENERATE_PDF_SCORE_AUSENTE =
  'Perfil Individual ainda não foi respondido ou não passou pelo motor.';

// ============================================================
// Enums e schemas Zod canonicos
// ============================================================

/** Enum canonico de `userType` (DOC 01 §9.1/§9.2/§4.9). */
export const INDIVIDUAL_PROFILE_USER_TYPES = ['employee', 'clevel'] as const;

// Titular canonico do Perfil Individual — re-export a partir de `_shared`
// (S244: quebra a dependencia circular com `individualProfileAI.ts`).
export type { IndividualProfileUserType } from './_shared/individualProfileGenerationTypes';
import type { IndividualProfileUserType } from './_shared/individualProfileGenerationTypes';

/** Input canonico comum as duas procs: empresa + titular polimorfico. */
const TARGET_INPUT_SHAPE = {
  companyId: z.number().int().positive(),
  userType: z.enum(INDIVIDUAL_PROFILE_USER_TYPES),
  userId: z.number().int().positive(),
};

/** Input canonico de `getReport` (§10.13). */
export const GET_REPORT_INPUT_SCHEMA = z.object(TARGET_INPUT_SHAPE);

/** Input canonico de `releaseRetest` (§10.7). */
export const RELEASE_RETEST_INPUT_SCHEMA = z.object(TARGET_INPUT_SHAPE);

/** Input canonico de `generatePDF` (§10.10). Mesmo shape do titular. */
export const GENERATE_PDF_INPUT_SCHEMA = z.object(TARGET_INPUT_SHAPE);

/**
 * Retorno canonico de `generatePDF` (§10.10). `pdfBase64` viaja pelo
 * transporte tRPC (JSON); o frontend converte em Blob para download
 * direto. O filename canonico segue a normalizacao do §10.10.
 */
export interface GeneratePDFResult {
  pdfBase64: string;
  filename: string;
}

// ============================================================
// Tipos publicos exportados
// ============================================================

/** Linha canonica de `individualProfileScores` (S118 — DTO derivado). */
export type IndividualProfileScoreRow = typeof individualProfileScores.$inferSelect;

/**
 * Metadados canonicos da tentativa que originou o score. Recorte
 * deliberado: `respostas` (dados brutos do instrumento) NUNCA viaja no
 * relatorio — §10.8 canoniza que o pacote entregue adiante contem
 * apenas numeros e categoricos estruturados.
 */
export interface IndividualProfileAssessmentMeta {
  id: number;
  tentativa: number;
  status: 'em_andamento' | 'enviado' | 'inconsistente';
  confiabilidadeNivel: 'alta' | 'moderada' | 'baixa' | null;
  enviadoEm: Date | null;
  calculadoEm: Date | null;
}

/**
 * DTO canonico de `getReport` (S233). `gerandoResumo` e
 * `gerandoExpandido` sao `true` exatamente quando o respectivo texto
 * ainda e `NULL` — §10.13 quarta linha.
 */
export interface IndividualProfileReport {
  score: IndividualProfileScoreRow;
  assessment: IndividualProfileAssessmentMeta;
  gerandoResumo: boolean;
  gerandoExpandido: boolean;
}

/** Retorno canonico de `releaseRetest` (§10.7 passos 2-4). */
export interface ReleaseRetestResult {
  assessmentId: number;
  tentativa: number;
  placeholderId: number;
  placeholderStatus: 'aguardando_nova_resposta';
  retesteLiberadoPor: number;
  retesteLiberadoTipo: 'rh' | 'super_admin';
  retesteLiberadoEm: Date;
}

// ============================================================
// Facade DI da geracao de textos (S210 + S205 + S244)
// ============================================================

// Contratos compartilhados vivem em `_shared/individualProfileGenerationTypes.ts`
// (S244 — quebra a dependencia circular com `individualProfileAI.ts`,
// que implementa a Facade real).
export type {
  IndividualProfileReportGenerationFacade,
  TriggerReportGenerationArgs,
} from './_shared/individualProfileGenerationTypes';
// eslint-disable-next-line @stylistic/max-len -- import canonico do tipo compartilhado
import type { IndividualProfileReportGenerationFacade } from './_shared/individualProfileGenerationTypes';

/**
 * DI default canonica — no-op defensivo (S210). O motor IA real da
 * ME-050/51 vive em `individualProfileAI.ts`; o `appRouter` religa via
 * `reportGenerationFactory` (S244) passando `db` de request. Testes de
 * router unit ainda podem confiar no no-op quando o comportamento
 * observado nao depende da geracao.
 */
export const DEFAULT_INDIVIDUAL_PROFILE_REPORT_GENERATION: IndividualProfileReportGenerationFacade =
  {
    triggerReportGeneration: () => Promise.resolve(),
  };

/** Dependencias injetaveis da factory (S205 + S244 + S261). */
export interface IndividualProfileRouterDeps {
  now?: () => Date;
  /**
   * Facade estatica (usada por testes que injetam spy). Prevalece sobre
   * `reportGenerationFactory` quando presente.
   */
  reportGeneration?: IndividualProfileReportGenerationFacade;
  /**
   * Factory canonica S244 — recebe o `db` do request no handler e
   * produz a Facade real. O `appRouter` de producao injeta esta
   * factory apontando ao `makeIndividualProfileReportGenerationFacade`
   * de `individualProfileAI.ts`. Testes que precisam do wrapper real
   * injetam a mesma factory sobre `roip_test`.
   */
  reportGenerationFactory?: (
    db: import('../../db/client').RoipDatabase,
  ) => IndividualProfileReportGenerationFacade;
  /**
   * Renderer PDF injetavel (S260). Default: `DEFAULT_PDF_RENDERER_FACADE`
   * que usa `puppeteer-core`. Testes de integracao substituem por stub
   * deterministico — a toolchain Puppeteer real e exercitada apenas
   * pelo runtime Manus.
   */
  pdfRenderer?: PdfRendererFacade;
}

// ============================================================
// Guards canonicos
// ============================================================

/**
 * PC1e (§10.11 + §15.5; S211/S231). Perfil Individual de C-level e
 * acessivel apenas por Bruno — nem RH, nem outros C-levels, nem
 * lideres. Vale para `getReport` e, por extensao literal do §15.5,
 * para `releaseRetest`.
 */
export function assertPC1e(user: AuthenticatedUser, userType: IndividualProfileUserType): void {
  if (userType !== 'clevel') {
    return;
  }
  if (user.role === 'super_admin') {
    return;
  }
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: MSG_PC1E_PERFIL_INDIVIDUAL_CLEVEL,
  });
}

/**
 * Guard S066 (cadeia direta de lider), identico ao provado na ME-042.
 * Aplicavel apenas quando `role === 'lider'`: RH e C-level tem escopo
 * de empresa; super_admin atravessa. Cadeia indireta (Cenario 2) e
 * materia do motor de organograma, ME futura.
 */
async function assertLiderDireto(
  db: RoipDatabase,
  user: AuthenticatedUser,
  userType: IndividualProfileUserType,
  targetUserId: number,
): Promise<void> {
  if (user.role !== 'lider') {
    return;
  }
  // Titular C-level jamais chega aqui (PC1e barra antes), mas a guarda
  // mantem o invariante explicito: lider nao le C-level.
  if (userType !== 'employee') {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_FORA_DA_CADEIA_DIRETA });
  }
  if (user.userId === targetUserId) {
    return;
  }
  const link = await getActiveLeaderHistoryByEmployee(db, targetUserId);
  if (!link || link.liderId !== user.userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_FORA_DA_CADEIA_DIRETA });
  }
}

/**
 * Resolve o titular polimorfico (§2.3 padrao B) e aplica as
 * pre-condicoes canonicas de existencia, empresa e §3.13. Nao devolve
 * valor: e um guard puro, consumido pelas duas procs antes de
 * qualquer leitura de resultado.
 */
async function resolveTitular(
  db: RoipDatabase,
  user: AuthenticatedUser,
  companyId: number,
  userType: IndividualProfileUserType,
  userId: number,
): Promise<void> {
  const rows =
    userType === 'employee'
      ? await db
          .select({ companyId: employees.companyId, status: employees.status })
          .from(employees)
          .where(eq(employees.id, userId))
          .limit(1)
      : await db
          .select({ companyId: cLevelMembers.companyId, status: cLevelMembers.status })
          .from(cLevelMembers)
          .where(eq(cLevelMembers.id, userId))
          .limit(1);

  const row = rows[0];
  if (!row || row.companyId !== companyId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: MSG_TITULAR_NAO_ENCONTRADO });
  }

  // §3.13 — titular inativo: leitura restrita a Bruno e RH.
  if (row.status === 'inativo') {
    const allowsInactive =
      user.role === 'super_admin' || user.role === 'rh' || user.role === 'rh_lider';
    if (!allowsInactive) {
      throw new TRPCError({ code: 'FORBIDDEN', message: MSG_TITULAR_INATIVO_RESTRITO });
    }
  }
}

/**
 * S213 — tentativa vigente: linha de `individualProfileScores` de
 * maior `tentativa` do titular. Retorna `undefined` quando o titular
 * ainda nao possui nenhuma tentativa consistente pontuada.
 */
async function getScoreVigente(
  db: RoipDatabase,
  companyId: number,
  userType: IndividualProfileUserType,
  userId: number,
): Promise<IndividualProfileScoreRow | undefined> {
  const rows = await db
    .select()
    .from(individualProfileScores)
    .where(
      and(
        eq(individualProfileScores.companyId, companyId),
        eq(individualProfileScores.userType, userType),
        eq(individualProfileScores.userId, userId),
      ),
    )
    .orderBy(desc(individualProfileScores.tentativa))
    .limit(1);
  return rows[0];
}

/**
 * §10.7 passo 2 — maior `tentativa` ja registrada em
 * `individualProfileAssessments` para o titular. Base do incremento da
 * nova tentativa. Le de `assessments` (nao de `scores`) porque
 * tentativas inconsistentes NAO geram score e ainda assim consomem
 * numero de tentativa (UNIQUE `uq_ipa_tentativa`).
 */
async function getUltimaTentativa(
  db: RoipDatabase,
  companyId: number,
  userType: IndividualProfileUserType,
  userId: number,
): Promise<number | undefined> {
  const rows = await db
    .select({ tentativa: individualProfileAssessments.tentativa })
    .from(individualProfileAssessments)
    .where(
      and(
        eq(individualProfileAssessments.companyId, companyId),
        eq(individualProfileAssessments.userType, userType),
        eq(individualProfileAssessments.userId, userId),
      ),
    )
    .orderBy(desc(individualProfileAssessments.tentativa))
    .limit(1);
  return rows[0]?.tentativa;
}

/**
 * §10.7 passo 3 — discrimina o par polimorfico
 * (`retesteLiberadoPor`, `retesteLiberadoTipo`) a partir do caller.
 * `super_admin` aponta a `superAdmins.id`; `rh` e `rh_lider` apontam a
 * `employees.id` sob o mesmo rotulo canonico `rh` (o enum da coluna
 * tem exatamente 2 valores — DOC 01 §9.1).
 */
function resolveLiberador(user: AuthenticatedUser): {
  retesteLiberadoPor: number;
  retesteLiberadoTipo: 'rh' | 'super_admin';
} {
  if (user.role === 'super_admin') {
    return { retesteLiberadoPor: user.superAdminId, retesteLiberadoTipo: 'super_admin' };
  }
  return { retesteLiberadoPor: user.userId, retesteLiberadoTipo: 'rh' };
}

// ============================================================
// Factory canonica do sub-router (S205)
// ============================================================

/**
 * Constroi o sub-router `individualProfile`. `now` e
 * `reportGeneration` sao injetaveis para determinismo de teste; os
 * defaults sao o relogio real e o hook no-op de geracao (S210).
 */
export function createIndividualProfileRouter(deps: IndividualProfileRouterDeps = {}) {
  const now = deps.now ?? ((): Date => new Date());
  const staticFacade = deps.reportGeneration ?? DEFAULT_INDIVIDUAL_PROFILE_REPORT_GENERATION;
  const reportGenerationFactory = deps.reportGenerationFactory;
  const pdfRenderer = deps.pdfRenderer ?? DEFAULT_PDF_RENDERER_FACADE;

  /**
   * Resolucao canonica por request (S244): `reportGeneration` estatica
   * quando explicitamente injetada; caso contrario, factory por-request
   * quando fornecida (recebe `ctx.db`); caso contrario, o no-op
   * defensivo. Testes-unit de router preservam o no-op por default;
   * producao (via appRouter) injeta a factory apontando ao motor IA.
   */
  const resolveReportGeneration = (
    db: import('../../db/client').RoipDatabase,
  ): IndividualProfileReportGenerationFacade => {
    if (deps.reportGeneration !== undefined) return staticFacade;
    if (reportGenerationFactory !== undefined) return reportGenerationFactory(db);
    return staticFacade;
  };

  return router({
    // ============================================================
    // Proc 1 — getReport (§10.13 quarta linha + §10.11 PC1e)
    // ============================================================
    getReport: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(GET_REPORT_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<IndividualProfileReport | null> => {
        // §2.4 — isolamento por empresa. Super Admin atravessa.
        assertCompanyScope(ctx.user, input.companyId);
        // §10.11 + §15.5 — PC1e antes de qualquer leitura (S211).
        assertPC1e(ctx.user, input.userType);
        await resolveTitular(ctx.db, ctx.user, input.companyId, input.userType, input.userId);
        await assertLiderDireto(ctx.db, ctx.user, input.userType, input.userId);

        // S213 — tentativa vigente na camada de leitura.
        const score = await getScoreVigente(ctx.db, input.companyId, input.userType, input.userId);
        if (!score) {
          return null;
        }

        const assessmentRows = await ctx.db
          .select({
            id: individualProfileAssessments.id,
            tentativa: individualProfileAssessments.tentativa,
            status: individualProfileAssessments.status,
            confiabilidadeNivel: individualProfileAssessments.confiabilidadeNivel,
            enviadoEm: individualProfileAssessments.enviadoEm,
            calculadoEm: individualProfileAssessments.calculadoEm,
          })
          .from(individualProfileAssessments)
          .where(eq(individualProfileAssessments.id, score.assessmentId))
          .limit(1);
        const assessment = assessmentRows[0];
        if (!assessment) {
          // FK ON DELETE RESTRICT garante a tentativa pai viva; ausencia
          // aqui e defeito de infraestrutura, nao estado de negocio.
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Tentativa pai do score nao encontrada.',
          });
        }

        // §10.13 quarta linha — textos ausentes disparam geracao
        // assincrona e sinalizam as flags. S210: no B3 o hook e no-op,
        // as flags permanecem canonicas para a UI.
        const gerandoResumo = score.resumoJson === null;
        const gerandoExpandido = score.expandidoJson === null;
        if (gerandoResumo || gerandoExpandido) {
          // §2.6 telemetria — quem originou (Bruno ou usuario
          // administrativo). Deriva do `ctx.user` autenticado, nunca
          // do input do titular.
          const triggeredByUserId =
            ctx.user.role === 'super_admin' ? ctx.user.superAdminId : ctx.user.userId;
          const triggeredByUserType: 'super_admin' | 'employee' =
            ctx.user.role === 'super_admin' ? 'super_admin' : 'employee';
          // S244 — resolucao da facade por-request: prevalece override
          // estatico; producao usa factory com `ctx.db`; fallback e
          // no-op defensivo.
          const reportGeneration = resolveReportGeneration(ctx.db);
          await reportGeneration.triggerReportGeneration({
            scoreId: score.id,
            companyId: input.companyId,
            userType: input.userType,
            userId: input.userId,
            tentativa: score.tentativa,
            gerarResumo: gerandoResumo,
            gerarExpandido: gerandoExpandido,
            triggeredByUserId,
            triggeredByUserType,
          });
        }

        return { score, assessment, gerandoResumo, gerandoExpandido };
      }),

    // ============================================================
    // Proc 2 — releaseRetest (§10.7; S212/S231/S232/S234)
    // ============================================================
    releaseRetest: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(RELEASE_RETEST_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<ReleaseRetestResult> => {
        assertCompanyScope(ctx.user, input.companyId);
        // §15.5 — PC1e cobre explicitamente `releaseRetest` (S231).
        assertPC1e(ctx.user, input.userType);
        await resolveTitular(ctx.db, ctx.user, input.companyId, input.userType, input.userId);

        // §10.7 validacao 1 — placeholder precisa estar `inconsistente`.
        const placeholderRows = await ctx.db
          .select({
            id: individualProfilePlaceholders.id,
            status: individualProfilePlaceholders.status,
          })
          .from(individualProfilePlaceholders)
          .where(
            and(
              eq(individualProfilePlaceholders.companyId, input.companyId),
              eq(individualProfilePlaceholders.userType, input.userType),
              eq(individualProfilePlaceholders.userId, input.userId),
            ),
          )
          .limit(1);
        const placeholder = placeholderRows[0];
        if (!placeholder || placeholder.status !== 'inconsistente') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_RETESTE_PRECONDICAO });
        }

        const ultimaTentativa = await getUltimaTentativa(
          ctx.db,
          input.companyId,
          input.userType,
          input.userId,
        );
        if (ultimaTentativa === undefined) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_RETESTE_SEM_TENTATIVA });
        }

        const liberador = resolveLiberador(ctx.user);
        const retesteLiberadoEm = now();
        const novaTentativa = ultimaTentativa + 1;

        // Transacao atomica: nova tentativa + transicao do placeholder.
        // §10.7 passos 2-4 sao um unico ato administrativo.
        return await ctx.db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(individualProfileAssessments)
            .values({
              companyId: input.companyId,
              userType: input.userType,
              userId: input.userId,
              tentativa: novaTentativa,
              status: 'em_andamento',
              blocoAtual: 1,
              blocosCompletos: [],
              respostas: null,
              retesteLiberadoPor: liberador.retesteLiberadoPor,
              retesteLiberadoTipo: liberador.retesteLiberadoTipo,
              retesteLiberadoEm,
            })
            .$returningId();
          if (!inserted) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'INSERT em individualProfileAssessments nao retornou id.',
            });
          }

          await tx
            .update(individualProfilePlaceholders)
            .set({ status: 'aguardando_nova_resposta' })
            .where(eq(individualProfilePlaceholders.id, placeholder.id));

          return {
            assessmentId: inserted.id,
            tentativa: novaTentativa,
            placeholderId: placeholder.id,
            placeholderStatus: 'aguardando_nova_resposta' as const,
            retesteLiberadoPor: liberador.retesteLiberadoPor,
            retesteLiberadoTipo: liberador.retesteLiberadoTipo,
            retesteLiberadoEm,
          };
        });
      }),

    // ============================================================
    // Proc 3 — generatePDF (§10.10; S261)
    // ============================================================
    generatePDF: roleProcedure(['super_admin', 'rh'])
      .input(GENERATE_PDF_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<GeneratePDFResult> => {
        // §2.4 — isolamento por empresa. Super Admin atravessa.
        assertCompanyScope(ctx.user, input.companyId);
        // §10.11 + §15.5 — PC1e antes de qualquer leitura (S211).
        assertPC1e(ctx.user, input.userType);
        await resolveTitular(ctx.db, ctx.user, input.companyId, input.userType, input.userId);
        await assertLiderDireto(ctx.db, ctx.user, input.userType, input.userId);

        // S213 — tentativa vigente.
        const score = await getScoreVigente(ctx.db, input.companyId, input.userType, input.userId);
        if (!score) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_GENERATE_PDF_SCORE_AUSENTE,
          });
        }
        // §10.10 — pre-condicao: expandidoJson cacheado. Enquanto NULL,
        // a IA ainda nao gerou (Momento 2 §3.3) ou falhou (§11.1).
        if (score.expandidoJson === null || score.expandidoJson === undefined) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: MSG_GENERATE_PDF_AGUARDE,
          });
        }

        // Company: nome fantasia + logo (§10.10 cabecalho canonico).
        const [company] = await ctx.db
          .select({
            nomeFantasia: companies.nomeFantasia,
            logoUrl: companies.logoUrl,
          })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        if (!company) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Empresa nao encontrada.',
          });
        }

        // Assessment: enviadoEm -> data_aplicacao.
        const [assessment] = await ctx.db
          .select({ enviadoEm: individualProfileAssessments.enviadoEm })
          .from(individualProfileAssessments)
          .where(eq(individualProfileAssessments.id, score.assessmentId))
          .limit(1);
        const dataAplicacao = assessment?.enviadoEm
          ? new Date(assessment.enviadoEm).toISOString().slice(0, 10)
          : '';

        // Identificacao canonica do titular.
        let nome = '';
        let cargo = '';
        let nivelHierarquico: 'operacional' | 'tatico' | 'estrategico' = 'operacional';
        let departamento = '';
        if (input.userType === 'clevel') {
          const [row] = await ctx.db
            .select({ name: cLevelMembers.name, cargo: cLevelMembers.cargo })
            .from(cLevelMembers)
            .where(eq(cLevelMembers.id, input.userId))
            .limit(1);
          nome = row?.name ?? '';
          cargo = row?.cargo ?? '';
          nivelHierarquico = 'estrategico';
          departamento = 'Alta lideranca';
        } else {
          const [row] = await ctx.db
            .select({
              name: employees.name,
              descricaoCBO: employees.descricaoCBO,
              nivelHierarquico: employees.nivelHierarquico,
              departamento: employees.departamento,
            })
            .from(employees)
            .where(eq(employees.id, input.userId))
            .limit(1);
          nome = row?.name ?? '';
          cargo = row?.descricaoCBO ?? '';
          nivelHierarquico =
            (row?.nivelHierarquico as 'operacional' | 'tatico' | 'estrategico') ?? 'operacional';
          departamento = row?.departamento ?? '';
        }

        // Subvetores: 25 valores canonicos (Postura 4 + Estrutura 5 +
        // Motor 5 + Equilibrio 5 + Assinatura 6). Valores nulos
        // renderizam como 0 na barra — comportamento defensivo canonico.
        const subvetores: IndividualProfileSubvector[] = [];
        const nn = (v: string | null): number => (v === null ? 0 : Number.parseFloat(v));
        subvetores.push(
          { bloco: 'Postura', rotulo: 'Assertividade e ritmo', valor: nn(score.post_assert) },
          { bloco: 'Postura', rotulo: 'Orientacao a tarefas', valor: nn(score.post_tarefas) },
          { bloco: 'Postura', rotulo: 'Orientacao a pessoas', valor: nn(score.post_pessoas) },
          { bloco: 'Postura', rotulo: 'Comportamento sob pressao', valor: nn(score.post_pressao) },
          { bloco: 'Estrutura', rotulo: 'Abertura a experiencia', valor: nn(score.est_abert) },
          { bloco: 'Estrutura', rotulo: 'Disciplina e autogestao', valor: nn(score.est_disc) },
          { bloco: 'Estrutura', rotulo: 'Extroversao', valor: nn(score.est_ext) },
          { bloco: 'Estrutura', rotulo: 'Amabilidade', valor: nn(score.est_amab) },
          { bloco: 'Estrutura', rotulo: 'Estabilidade emocional', valor: nn(score.est_estab) },
          { bloco: 'Motor', rotulo: 'Maestria', valor: nn(score.mot_maestria) },
          { bloco: 'Motor', rotulo: 'Lideranca', valor: nn(score.mot_lideranca) },
          { bloco: 'Motor', rotulo: 'Autonomia', valor: nn(score.mot_autonomia) },
          { bloco: 'Motor', rotulo: 'Seguranca', valor: nn(score.mot_seguranca) },
          { bloco: 'Motor', rotulo: 'Proposito', valor: nn(score.mot_proposito) },
          { bloco: 'Equilibrio', rotulo: 'Autoconsciencia', valor: nn(score.equ_autocons) },
          { bloco: 'Equilibrio', rotulo: 'Autogestao', valor: nn(score.equ_autogest) },
          { bloco: 'Equilibrio', rotulo: 'Leitura do outro', valor: nn(score.equ_leitura) },
          { bloco: 'Equilibrio', rotulo: 'Influencia e conducao', valor: nn(score.equ_influencia) },
          { bloco: 'Equilibrio', rotulo: 'Indice geral', valor: nn(score.equ_indice) },
          { bloco: 'Assinatura', rotulo: 'Sabedoria', valor: nn(score.ass_sabed) },
          { bloco: 'Assinatura', rotulo: 'Coragem', valor: nn(score.ass_coragem) },
          { bloco: 'Assinatura', rotulo: 'Humanidade', valor: nn(score.ass_humanid) },
          { bloco: 'Assinatura', rotulo: 'Justica', valor: nn(score.ass_justica) },
          { bloco: 'Assinatura', rotulo: 'Temperanca', valor: nn(score.ass_temper) },
          { bloco: 'Assinatura', rotulo: 'Transcendencia', valor: nn(score.ass_transc) },
        );

        const generatedAt = now();
        const generatedAtDate = generatedAt.toISOString().slice(0, 10);

        const html = renderIndividualProfileHTML({
          company: {
            nomeFantasia: company.nomeFantasia ?? '',
            ...(company.logoUrl ? { logoUrl: company.logoUrl } : {}),
          },
          identificacao: {
            nome,
            cargo,
            nivelHierarquico,
            departamento,
            liderDireto: input.userType === 'clevel' ? 'Nao se aplica' : '',
            dataAplicacao,
          },
          expandido: score.expandidoJson as IndividualProfileExpandidoJson,
          subvetores,
          generatedAtDate,
        });

        let pdfBytes: Uint8Array;
        try {
          pdfBytes = await pdfRenderer.renderPdf(html);
        } catch (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Falha na geracao do PDF: ${(err as Error).message}`,
          });
        }

        return {
          pdfBase64: Buffer.from(pdfBytes).toString('base64'),
          filename: composeIndividualProfileFilename(nome, generatedAtDate),
        };
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type IndividualProfileRouter = ReturnType<typeof createIndividualProfileRouter>;
