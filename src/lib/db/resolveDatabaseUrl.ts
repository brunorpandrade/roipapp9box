// ROIP APP 9BOX — helper canonico de resolucao de URL do banco (ME-D101).
//
// Extrai `resolveDatabaseUrl` que estava duplicada em 63 arquivos do projeto.
// Fonte unica de leitura de `DATABASE_URL` para server components, server
// actions e Route Handlers. `src/server/trpc.ts` e
// `src/server/session/serverSession.ts` mantem copia privada (singleton de
// processo — fora do escopo desta ME).
//
// **RV-13.** Consumida por todos os callsites que antes definiam a funcao
// localmente. Ver `tests/unit/me-d101-resolve-db-url.test.ts`.
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
