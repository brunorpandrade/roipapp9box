// ROIP APP 9BOX — helpers internos canônicos da rota Bruno
// `/super-admin/empresa/[id]/onboarding-lideres` (§14.27, ME-080c).
//
// Padrão S366 CC068 canonizado desde ME-070: `page.tsx` do App Router
// Next 15 exporta APENAS o default. Todo helper, tipo, função auxiliar
// e loader vive neste `internals.ts` irmão.
//
// IMPORTANTE (CC071): este módulo é importado por
// `OnboardingLideresClient.tsx` (client component — `'use client'`).
// Portanto, NÃO pode importar VALUE-LEVEL de routers, services,
// db/client ou qualquer módulo que transite por `mysql2`, `node:crypto`
// ou `node:buffer`. Apenas constantes puras, tipos (import type) e
// funções sem side-effects.
//
// Origem canônica:
// - CAMADA_UI §14.27 (kanban 4 colunas + card + modal + ciclo de vida).
// - CAMADA_AUTH §10.6 (Bruno via `/super-admin/empresa/[id]/…`).
// - CAMADA_OPERACOES §21 (operação canônica do kanban).
// - CAMADA_DADOS §4.5 + §14.3 + §14.4 (onboardingEstagio + notes + log).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico) + §3.7.3 (ficha).
//
// **RV-13.** Todo export tem consumidor real:
//   - `parseCompanyIdParam`, `resolveDatabaseUrl` → `page.tsx` +
//     `actions.ts`.
//   - `ESTAGIOS`, `EstagioOnb`, `ESTAGIO_LABELS`, `ESTAGIO_COL_CLASS`,
//     `ANOTACAO_MIN_CHARS_CLIENT`, `ANOTACAO_MAX_CHARS_CLIENT`,
//     `BADGE_DIAS_AMBAR_THRESHOLD` → `OnboardingLideresClient.tsx`.
//   - `daysBetween`, `computeDiasNoEstagio`, `formatDiasNoEstagio`,
//     `formatTimestampBR`, `iniciaisDoNome` →
//     `OnboardingLideresClient.tsx`.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

// -----------------------------------------------------------------------
// Constantes canônicas bit-exact (§14.27 + código do router)
// -----------------------------------------------------------------------

/**
 * §14.27 — 4 colunas fixas canônicas do kanban, na ordem canônica de
 * exibição. Bit-exact com `ONBOARDING_ESTAGIO_VALUES` do enum
 * `db/schema/enums.ts` — mas duplicadas aqui como literal puro para
 * evitar import server-only no bundle client (CC071).
 */
export const ESTAGIOS = ['treinar', 'em_treinamento', 'treinado', 'reciclagem'] as const;

/** Tipo canônico dos estágios (union literal). */
export type EstagioOnb = (typeof ESTAGIOS)[number];

/** §14.27 rótulos canônicos exibidos no header de cada coluna. */
export const ESTAGIO_LABELS: Record<EstagioOnb, string> = {
  treinar: 'Treinar',
  em_treinamento: 'Em treinamento',
  treinado: 'Treinado',
  reciclagem: 'Reciclagem',
};

/**
 * §14.27 mapeamento canônico coluna → classe CSS. As classes exatas
 * são definidas no CSS-in-JSX do `OnboardingLideresClient.tsx`
 * (mockup `onboarding_lideres_v1.html` linhas 79-82):
 *   - `col-treinar` → âmbar claro (título cinza)
 *   - `col-em-treinamento` → azul claro
 *   - `col-treinado` → verde claro
 *   - `col-reciclagem` → cinza claro
 */
export const ESTAGIO_COL_CLASS: Record<EstagioOnb, string> = {
  treinar: 'col-treinar',
  em_treinamento: 'col-em-treinamento',
  treinado: 'col-treinado',
  reciclagem: 'col-reciclagem',
};

/**
 * §14.27 — limites canônicos do textarea de anotação. Bit-exact com
 * `ANOTACAO_MIN_CHARS` / `ANOTACAO_MAX_CHARS` do router
 * `leaderOnboarding.ts`. Duplicados aqui para uso no client (CC071
 * proíbe importar do server).
 *
 * Divergência D-ONB-3 resolvida em favor do router (RV-09 precedência
 * canônica): mockup mostrava apenas `maxlength=500`; CAMADA_UI §14.27
 * diz "até 500 caracteres, obrigatório"; router valida 100-500 (padrão
 * transversal DOC 03 §2.3). Client segue o router.
 */
export const ANOTACAO_MIN_CHARS_CLIENT = 100 as const;
export const ANOTACAO_MAX_CHARS_CLIENT = 500 as const;

/**
 * §14.27 — badge tempo permanência: destaque âmbar quando dias na
 * coluna > 15. Threshold canônico literal do mockup + §14.27.
 */
export const BADGE_DIAS_AMBAR_THRESHOLD = 15 as const;

// -----------------------------------------------------------------------
// Helpers puros de data/hora (sem side-effect; `now` injetável)
// -----------------------------------------------------------------------

/**
 * Retorna a diferença absoluta em dias inteiros entre duas datas
 * (arredondando para baixo). Ignora timezone — opera em milissegundos
 * UTC. Determinístico e puro.
 */
export function daysBetween(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.floor(diffMs / MS_PER_DAY);
}

/**
 * Calcula dias no estágio atual, dado o instante de entrada e o
 * instante corrente. Retorna 0 se `entrada` for no futuro (defesa
 * contra clock skew). Determinístico via `now` injetável — testável
 * sem depender de `Date.now()`.
 */
export function computeDiasNoEstagio(entrada: Date, now: Date): number {
  const d = daysBetween(entrada, now);
  return d < 0 ? 0 : d;
}

/**
 * Formata dias no estágio no padrão canônico do mockup:
 *   - 0 dias  → "Hoje"
 *   - 1 dia   → "Há 1 dia"
 *   - N dias  → "Há N dias"
 */
export function formatDiasNoEstagio(dias: number): string {
  if (dias <= 0) {
    return 'Hoje';
  }
  if (dias === 1) {
    return 'Há 1 dia';
  }
  return `Há ${dias} dias`;
}

/**
 * Formata timestamp para exibição no histórico de anotações do modal
 * (§14.27 "cada anotação com autor e timestamp"). Padrão canônico
 * pt-BR: "DD/MM/YYYY · HH:mm" — bit-exact com o mockup linha 342.
 * Usa `toLocaleString` no timezone `America/Sao_Paulo` (BRT canônico).
 */
export function formatTimestampBR(d: Date): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  const dia = get('day');
  const mes = get('month');
  const ano = get('year');
  const hora = get('hour');
  const min = get('minute');
  return `${dia}/${mes}/${ano} · ${hora}:${min}`;
}

/**
 * Extrai as 2 iniciais canônicas do nome para o avatar do modal (mockup
 * linhas 331-337). Padrão: primeira letra do primeiro nome + primeira
 * letra do último nome. Nome único → dupla letra. Nome vazio → "?".
 */
export function iniciaisDoNome(nome: string): string {
  const clean = nome.trim();
  if (clean.length === 0) {
    return '?';
  }
  const parts = clean.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    const p = parts[0]!;
    return p.substring(0, Math.min(2, p.length)).toUpperCase();
  }
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const a = first.charAt(0);
  const b = last.charAt(0);
  return `${a}${b}`.toUpperCase();
}

// -----------------------------------------------------------------------
// Parse canônico de params (padrão consolidado ME-074 a ME-080b)
// -----------------------------------------------------------------------

/**
 * Parse canônico de `params.id` — aceita apenas inteiros positivos.
 * Padrão idêntico ao das demais rotas B8.
 */
export function parseCompanyIdParam(raw: string): number | null {
  if (raw.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

/**
 * Resolve DATABASE_URL do ambiente. Padrão consolidado ME-074+.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env');
  }
  return url;
}
