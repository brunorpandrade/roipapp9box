// ROIP APP 9BOX — barrel do schema Drizzle (ME-010).
//
// Ponto unico de reexportacao das tabelas e enums declarados por
// `schema/tables.ts` e `schema/enums.ts`. O cliente Drizzle importa este
// barrel como `import * as schema from './schema'` e obtem tipagem de
// todas as tabelas simultaneamente (necessario para o generic
// `MySql2Database<typeof schema>` de `src/db/client.ts`).
//
// Reexportacao com `export *` (padrao Drizzle: o generic `MySql2Database<
// typeof schema>` precisa ver todas as tabelas simultaneamente). Auditoria
// dos simbolos exportados vive diretamente em `enums.ts` e `tables.ts`;
// este barrel eh apenas re-agregacao sem logica.

export * from './enums';
export * from './tables';
