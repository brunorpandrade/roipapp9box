// ROIP APP 9BOX — helpers internos da rota base RH `/central-relatorios`
// (ME-B9-CR, dual-route L123 pareado com
// `/super-admin/empresa/[id]/relatorios-e-exportacoes`).
//
// Padrao S366 CC068 canonizado desde ME-070. CC071 compliant: zero
// imports VALUE-LEVEL de modulos server-only.
//
// **RV-13.** `resolveDatabaseUrl` consumido por `page.tsx` + `actions.ts`
// desta mesma rota.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env');
  }
  return url;
}
