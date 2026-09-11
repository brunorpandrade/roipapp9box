// ROIP APP 9BOX — helpers internos canonicos da rota `/meu-portal`
// (ME-B9-fechamento CORR2 — D-B9F-PORTAL-COLABORADOR-404 ENCERRADO —
// S238-B + S239-C).
//
// Rota canonica autenticada acessivel a qualquer usuario platform
// (rh, rh_lider, clevel, lider) — permite ver as pendencias do
// PROPRIO usuario logado nos instrumentos que ele responde (perfil
// individual, auto-avaliacao, avaliacao de lideranca direta, radar
// NR-1). Substitui bit-a-bit o `href="/colaborador"` que antes
// apontava para rota inexistente e caia em 404 (defeito
// pre-existente da ME-083 latente ate ME-B9-fechamento ativar a
// Secao 4).
//
// Colaborador puro (sem sessao platform) autentica-se via link por
// token separado (fluxo S037 preservado bit-a-bit) — NAO passa por
// esta rota. Esta rota complementa mas nao substitui S037.
//
// Padrao S366 CC068 canonizado: `page.tsx` exporta apenas o default.
// Helpers vivem em `internals.ts` irmao.
//
// Origem canonica:
// - CAMADA_UI §5.5 (Secao 4 "Meu portal" — versao inline no painel RH).
// - CAMADA_UI nova secao §14.24 (rota dedicada — a canonizar no
//   MASTER v4.0 pos-CORR2).
// - CAMADA_AUTH nova regra §10.7 (matriz `/meu-portal` — allow para
//   todos platform).
//
// **RV-13 canonica.** Todo export tem consumidor real:
// - `resolveDatabaseUrl` → `page.tsx`.

export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}
