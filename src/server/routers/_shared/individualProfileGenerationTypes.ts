// ROIP APP 9BOX — tipos compartilhados da geracao de textos do Perfil
// Individual (ME-050/51, S244).
//
// Extracao canonica de `TriggerReportGenerationArgs` e
// `IndividualProfileReportGenerationFacade` para `_shared/`. Motivacao
// direta:
// - `individualProfile.ts` (router) define a Facade DI.
// - `individualProfileAI.ts` (motor IA, ME-050/51) implementa a Facade
//   real e precisa de `TriggerReportGenerationArgs` como tipo.
// Colocar os tipos aqui evita a dependencia circular
// (`individualProfileAI` -> `individualProfile` -> `individualProfileAI`).
//
// Precedente canonico: `_shared/uploadResult.ts` (mesmo padrao para
// contratos usados por multiplos modulos).

/**
 * Discriminante canonico do titular do Perfil Individual (§10.11).
 * `employee` ou `clevel` — polimorfismo padrao B (DOC 01 §2.3).
 */
export type IndividualProfileUserType = 'employee' | 'clevel';

/**
 * Argumentos do gatilho canonico de geracao assincrona dos textos do
 * relatorio (DOC 03 §10.13 quarta linha; DOC 04 §3.4).
 *
 * `triggeredByUserId` / `triggeredByUserType` — quem originou a chamada
 * do ponto de vista da telemetria canonica §2.6 do DOC 04. Deriva do
 * `ctx.user` autenticado, nunca do titular do perfil.
 */
export interface TriggerReportGenerationArgs {
  scoreId: number;
  companyId: number;
  /** Titular do perfil (§10.11 — polimorfismo `employee` | `clevel`). */
  userType: IndividualProfileUserType;
  userId: number;
  tentativa: number;
  gerarResumo: boolean;
  gerarExpandido: boolean;
  /** Originador logado — §2.6 telemetria canonica. */
  triggeredByUserId: number;
  triggeredByUserType: 'super_admin' | 'employee';
}

/**
 * Facade DI canonica (S210 + S205 + S244). No-op na ME-049a; wrapper
 * real ao motor IA na ME-050/51 (S244), fornecido via
 * `IndividualProfileRouterDeps.reportGenerationFactory`.
 */
export interface IndividualProfileReportGenerationFacade {
  triggerReportGeneration: (args: TriggerReportGenerationArgs) => Promise<void>;
}
