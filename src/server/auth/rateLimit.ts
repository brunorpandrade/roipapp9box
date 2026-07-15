// ROIP APP 9BOX — modulo de rate limit (ME-020).
//
// Limitador em memoria por processo (S012, decisao E2 opcao A). O DOC 01
// nao declara tabela de rate limit e o stack canonico nao inclui Redis;
// a janela curta (15 min) torna a perda de contadores em restart um risco
// aceitavel no MVP single-instance. Divida D003 registrada: cenario
// multi-instancia exige substituicao do store (a interface `RateLimiter`
// isola essa troca).
//
// Semantica canonica (DOC 02 §4.1 passo 5 e §5.8):
// - `check` ANTES de processar: atingido o limite, a procedure retorna 429
//   com `retryAfterSeconds` (mensagem canonica pertence a procedure).
// - `registerFailure` a cada tentativa malsucedida (CPF inexistente, senha
//   errada — passos d/f do §4.1).
// - `reset` no sucesso (passo i do §4.1).
// - Janela fixa: abre na primeira falha e dura `windowMs`; expirada, o
//   contador zera.
//
// Chave canonica de armazenamento: `{ip}:{operacao}:{identificador}`
// (§5.8) — montada por `buildRateLimitKey`.

/** Configuracao de um limite: operacao canonica, maximo e janela. */
export interface RateLimitRule {
  op: string;
  max: number;
  windowMs: number;
}

const WINDOW_15_MIN_MS = 15 * 60 * 1000;

/** Limites canonicos consolidados — DOC 02 §5.8, valores literais. */
export const RATE_LIMITS = {
  loginUnified: { op: 'login-unified', max: 5, windowMs: WINDOW_15_MIN_MS },
  loginSuperAdmin: { op: 'login-super-admin', max: 5, windowMs: WINDOW_15_MIN_MS },
  portalLogin: { op: 'portal-login', max: 10, windowMs: WINDOW_15_MIN_MS },
  forgotPassword: { op: 'forgot-password', max: 3, windowMs: WINDOW_15_MIN_MS },
  forgotPasswordSuperAdmin: {
    op: 'forgot-password-super-admin',
    max: 3,
    windowMs: WINDOW_15_MIN_MS,
  },
  changePassword: { op: 'change-password', max: 5, windowMs: WINDOW_15_MIN_MS },
  requestEmailChange: { op: 'request-email-change', max: 5, windowMs: WINDOW_15_MIN_MS },
} as const satisfies Record<string, RateLimitRule>;

/** Monta a chave canonica `{ip}:{operacao}:{identificador}` (§5.8). */
export function buildRateLimitKey(ip: string, op: string, identifier: string): string {
  return `${ip}:${op}:${identifier}`;
}

/** Resultado de `check`: liberado, ou bloqueado com tempo restante. */
export type RateLimitStatus = { blocked: false } | { blocked: true; retryAfterSeconds: number };

/** Contrato do limitador — isola o store para troca futura (D003). */
export interface RateLimiter {
  check(key: string, rule: RateLimitRule): RateLimitStatus;
  registerFailure(key: string, rule: RateLimitRule): void;
  reset(key: string): void;
}

interface WindowEntry {
  count: number;
  windowStartMs: number;
}

/**
 * Cria um limitador com store proprio em memoria. Cada instancia e
 * independente — a aplicacao usa um singleton por processo (criado no
 * bootstrap do tRPC, ME-021); os testes criam instancias descartaveis.
 */
export function createRateLimiter(): RateLimiter {
  const store = new Map<string, WindowEntry>();

  function isWindowExpired(entry: WindowEntry, rule: RateLimitRule, nowMs: number): boolean {
    return nowMs - entry.windowStartMs >= rule.windowMs;
  }

  return {
    check(key, rule) {
      const entry = store.get(key);
      const nowMs = Date.now();
      if (!entry || isWindowExpired(entry, rule, nowMs)) {
        if (entry) {
          store.delete(key);
        }
        return { blocked: false };
      }
      if (entry.count < rule.max) {
        return { blocked: false };
      }
      const elapsedMs = nowMs - entry.windowStartMs;
      const retryAfterSeconds = Math.ceil((rule.windowMs - elapsedMs) / 1000);
      return { blocked: true, retryAfterSeconds };
    },

    registerFailure(key, rule) {
      const entry = store.get(key);
      const nowMs = Date.now();
      if (!entry || isWindowExpired(entry, rule, nowMs)) {
        store.set(key, { count: 1, windowStartMs: nowMs });
        return;
      }
      entry.count += 1;
    },

    reset(key) {
      store.delete(key);
    },
  };
}
