// ROIP APP 9BOX — helper de parse do `[id]` da rota Bruno
// `/super-admin/empresa/[id]/faturamento-mensal` (ME-fila7 dispatch 1).
//
// Padrao canonico per-rota (identico as demais rotas super-admin;
// mantido local conforme precedente do repositorio).
//
// **RV-13.** Consumido por `page.tsx`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

export function parseCompanyIdParam(raw: string): number | null {
  if (raw.length === 0) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
