// ROIP APP 9BOX — guard único de cadeia descendente (PC1h, §11.9) para
// procedures que recebem um colaborador como alvo. ME de segurança
// cross-company e autorização cruzada (bateria Etapa 0, item 2).
//
// Origem canônica (CAMADA_AUTH §3 — perfis):
// - Líder Cenário 1: leitura sobre os liderados diretos apenas.
// - Líder Cenário 2: idem, acrescido de toda a cadeia descendente.
// - C-level múltiplo `acessoTotal = false`: exclusivamente a própria
//   cadeia descendente.
// - C-level único / total, RH, RH-Líder e Bruno: escopo total.
//
// A régua opera sobre `resolveHierarchicalScope` (fonte única do escopo
// hierárquico, RV-14): `null` = escopo total; `Set` = cadeia própria.
// Extraída de `routers/dashboard.ts` (§8.07) para ser reusada pelas
// procedures por alvo que só tinham guard de empresa ou guard de líder
// direto: `instrumentC.getAssessment`, `iql.getIQLData`,
// `plenitude.getPlenitudeData`, `nineBox.getNineBoxSnapshot`,
// `nineBox.getNineBoxTrajectory`, `individualProfile.getReport`,
// `quarterlyCalculation.getQuarterlyResults` e o chat IA.
//
// **RV-13.** Consumido por `routers/dashboard.ts`, `routers/instrumentC.ts`,
// `routers/iql.ts`, `routers/plenitude.ts`, `routers/nineBox.ts`,
// `routers/individualProfile.ts`, `routers/quarterlyCalculation.ts`,
// `routers/aiChat.ts`, `routers/turnover.ts`, `routers/economicDiagnosis.ts`;
// provado em `tests/unit/dashboardScope.test.ts` e
// `tests/integration/seguranca-cross-company.test.ts`.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { TRPCError } from '@trpc/server';

import type { RoipDatabase } from '../../db/client';
import { canViewCompanyAggregate } from '../../lib/scope/companyAggregateAccess';
import { loadCLevelSessionContext } from '../../lib/session/cLevelSessionContext';
import { resolveHierarchicalScope } from './hierarchicalScope';

/** Mensagem canônica default de alvo fora da cadeia descendente. */
export const MSG_FORA_DA_CADEIA_DESCENDENTE = 'Colaborador fora da cadeia descendente do usuario.';

/**
 * Identidade mínima aceita pelo guard — estruturalmente compatível com
 * `AuthenticatedUser` (`src/server/trpc.ts`).
 */
export type CadeiaScopedUser =
  | { readonly role: 'super_admin' }
  | {
      readonly role: 'rh' | 'rh_lider' | 'clevel' | 'lider';
      readonly userId: number;
      readonly companyId: number;
    };

/**
 * Régua pura do escopo por alvo. `scope === null` (Bruno, RH, RH-Líder,
 * C-level total/único) libera qualquer alvo; com escopo restrito
 * (líder, C-level restrito) o alvo só é liberado quando
 * `employee-<id>` está na cadeia descendente própria. Fora do escopo →
 * FORBIDDEN. Função pura, provada nos dois sentidos (RV-03).
 */
export function assertAlvoNoEscopo(
  scope: ReadonlySet<string> | null,
  employeeId: number,
  message: string = MSG_FORA_DA_CADEIA_DESCENDENTE,
): void {
  if (scope === null) {
    return;
  }
  if (!scope.has(`employee-${employeeId}`)) {
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }
}

/**
 * Resolve o escopo hierárquico do usuário autenticado. Super Admin, RH e
 * RH-Líder → `null`; líder → cadeia descendente própria; C-level →
 * `null` quando total/único, cadeia própria quando restrito (contexto
 * carregado por `loadCLevelSessionContext`, fonte única §8.07).
 */
export async function resolveCadeiaScope(
  db: RoipDatabase,
  user: CadeiaScopedUser,
): Promise<ReadonlySet<string> | null> {
  if (user.role === 'super_admin') {
    return null;
  }
  if (user.role === 'clevel') {
    const cctx = await loadCLevelSessionContext(db, user.companyId, user.userId);
    return await resolveHierarchicalScope(
      db,
      { role: 'clevel', userId: user.userId, companyId: user.companyId },
      cctx ?? undefined,
    );
  }
  return await resolveHierarchicalScope(db, {
    role: user.role,
    userId: user.userId,
    companyId: user.companyId,
  });
}

/**
 * Resolve o escopo de cadeia do usuário e aplica `assertAlvoNoEscopo`
 * ao `employeeId` alvo. Substitui os antigos guards S066 (líder direto
 * apenas) por PC1h (cadeia direta e indireta), cobrindo também o C-level
 * restrito, que antes atravessava como escopo de empresa.
 */
export async function assertCadeiaDescendente(
  db: RoipDatabase,
  user: CadeiaScopedUser,
  employeeId: number,
  message: string = MSG_FORA_DA_CADEIA_DESCENDENTE,
): Promise<void> {
  const scope = await resolveCadeiaScope(db, user);
  assertAlvoNoEscopo(scope, employeeId, message);
}

/** Mensagem canônica de agregado da empresa negado a escopo restrito. */
export const MSG_AGREGADO_EMPRESA_RESTRITO =
  'Dados agregados da empresa restritos a perfis de escopo total.';

/**
 * Guard do agregado da EMPRESA para procedures tRPC (ESPEC §8 + DOC 02
 * §10.4 linha 853 + CAMADA_AUTH §3 linha 71: "dashboard global
 * bloqueado" para C-level restrito). Reusa `canViewCompanyAggregate`
 * (fonte única já aplicada às rotas nativas) sobre o escopo resolvido:
 * escopo total passa; escopo restrito (líder, C-level restrito) →
 * FORBIDDEN. Aplicado na bateria de segurança a `turnover.*`,
 * `economicDiagnosis.*` e `quarterlyCalculation.getCompanyQuarterlyStatus`.
 */
export async function assertAgregadoEmpresa(
  db: RoipDatabase,
  user: CadeiaScopedUser,
  message: string = MSG_AGREGADO_EMPRESA_RESTRITO,
): Promise<void> {
  const scope = await resolveCadeiaScope(db, user);
  if (!canViewCompanyAggregate(scope)) {
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }
}
