// ROIP APP 9BOX — helpers internos canonicos da rota base RH
// `/organograma` (§14.9, ME-086b).
//
// Padrao canonico bit-exact ao precedente `/central-relatorios` +
// `/todos-os-colaboradores` (ME-B9-CR + ME-084): `page.tsx` importa
// apenas `resolveDatabaseUrl` daqui (rota RH nao tem `[id]` dinamico).
//
// **RV-13.** `resolveDatabaseUrl` consumido por `page.tsx`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/**
 * Resolve DATABASE_URL do ambiente. Padrao consolidado ME-074+.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env');
  }
  return url;
}
