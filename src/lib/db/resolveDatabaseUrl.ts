// ROIP APP 9BOX — helper canonico de resolucao de URL do banco (ME-D101
// + ME-D-DIRTY-CONSOLIDACAO).
//
// Extrai `resolveDatabaseUrl` que estava duplicada em 63 arquivos do
// projeto (ME-D101). A ME-D-DIRTY-CONSOLIDACAO fecha o debito
// remanescente: `src/server/trpc.ts` e `src/server/session/serverSession.ts`
// tinham copia local ("fora do escopo" de D101) e agora tambem consomem
// este helper. Fonte unica de leitura de `DATABASE_URL` para todo o
// projeto: server components, server actions, Route Handlers, bootstrap
// tRPC e resolvedor de sessao.
//
// **RV-13.** Consumida por todos os callsites que antes definiam a funcao
// localmente. Ver `tests/unit/me-d101-resolve-db-url.test.ts` +
// `tests/unit/me-dirty-resolve-db-url-consolidado.test.ts`.
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.

/**
 * Resolve a URL de conexao do banco a partir da variavel de ambiente
 * `DATABASE_URL`. Lanca erro descritivo se ausente ou vazia para falhar
 * rapido antes de qualquer chamada ao banco.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}
