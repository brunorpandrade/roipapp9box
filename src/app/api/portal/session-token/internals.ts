// ROIP APP 9BOX — internals do Route Handler
// `POST /api/portal/session-token` (ME-B10-02, S252).
//
// Padrao S366: mensagens canonicas separadas do arquivo `route.ts` para
// conformidade Next 15 App Router (o handler exporta somente `POST`).
//
// **RV-13.** Consumidores diretos:
// - `./route.ts` (POST) — usa MSG_* nos retornos 401/403.
// - `tests/unit/portal-session-token.test.ts` — asserts sobre presenca
//   das constantes no arquivo `route.ts`.

/** Sessao platform ausente ou invalida -> 401. */
export const MSG_SEM_SESSAO_SESSION_TOKEN = 'Sessão ausente. Faça login novamente.';

/**
 * Sessao valida porem escopo errado (super admin) -> 403. Matriz
 * CAMADA_AUTH §10.7 aplicada: super admin nao e usuario da empresa e
 * nao responde instrumentos individuais.
 */
export const MSG_ACESSO_NEGADO_SESSION_TOKEN =
  'Acesso negado — este endpoint é restrito a usuários da empresa.';
