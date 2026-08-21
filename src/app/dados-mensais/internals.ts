// ROIP APP 9BOX — helpers internos canonicos da rota base RH
// `/dados-mensais` (§14.13, ME-086b).
//
// Padrao canonico bit-exact ao precedente `/central-relatorios`
// (ME-B9-CR): `page.tsx` importa `resolveDatabaseUrl` daqui + reexport
// dos helpers puros do componente compartilhado.
//
// **RV-13.** Todo export consumido:
//   - `resolveDatabaseUrl` → `page.tsx` + `actions.ts`.
//   - Reexports canonicos → `page.tsx`.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

// Reexport bit-exact do modulo canonico compartilhado ME-086b.
export { currentMes, parseTabParam } from '../../components/dados-mensais/internals';

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
