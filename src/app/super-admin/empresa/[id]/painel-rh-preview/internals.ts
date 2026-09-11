// ROIP APP 9BOX — helpers internos canonicos da rota
// `/super-admin/empresa/[id]/painel-rh-preview` (ME-B9-fechamento —
// D-ME083-D-RH-IMPERSONATION-PAINEL-RH ENCERRADO).
//
// Padrao S366 CC068 canonizado: `page.tsx` do App Router Next 15 exporta
// APENAS o default. Todo helper, tipo e loader vive neste `internals.ts`
// irmao — permite import por testes e preserva segregacao Next 15.
//
// Escopo canonico da rota: Super Admin (Bruno) visualiza uma previa do
// painel do RH da empresa `[id]`, renderizando bit-a-bit o mesmo
// `PainelRHClient` com prop `variant='super_admin_preview'` (S232-A).
// O modo preview canonico bit-a-bit:
// - Assume flags fixas do RH puro (`isRH=true, isLider=false,
//   isResponsavelFinanceiro=false, hasDescendingChain=false`) — preview
//   do cenario base RH; previews de RH-Lider C1/C2 ficam fora do escopo
//   da ME-B9-fechamento (canonizavel em ME futura se solicitado).
// - Omite Secao 4 "Meu portal" — Super Admin nao tem pendencias no
//   portal da empresa X; loader `loadMeuPortalData` e pulado; prop
//   `meuPortal` chega como `null` no Client.
// - Header canonico `leftMode='in_company'` com dados da empresa X
//   (nao da sessao do Super Admin).
//
// Origem canonica:
// - CAMADA_UI §5.5 (painel canonico RH — renderizado bit-a-bit no modo
//   preview).
// - CAMADA_AUTH §10.3 (rota Bruno-only via prefixo `/super-admin/empresa/`
//   ja canonizado no matrix; nenhuma regra nova de guard — herda).
// - MASTER_ESCOPO_B9 §3.8 (nova ficha ME-B9-fechamento) + MASTER v3.0.
// - Comentario canonico pre-existente em `CompanyLandingClient.tsx`
//   (AcoesBlock) que propunha esta rota (removido nesta ME apos
//   materializacao).
//
// **RV-12 canonica.** Zero SQL cru — reutiliza loaders existentes.
// **RV-13 canonica.** Todo export tem consumidor real:
// - `resolveDatabaseUrl` → `page.tsx`.
// - `parseCompanyIdParam` → `page.tsx`.
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

/**
 * Resolve URL canonica do banco a partir do ambiente. Falha explicita
 * quando ausente para nao gerar tela em branco no cliente. Bit-a-bit
 * ao helper preservado em `/super-admin/empresa/[id]/internals.ts`.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Parseia `companyId` do path param `[id]` canonicamente. Retorna
 * `null` para valores nao inteiros positivos — page.tsx aciona
 * `notFound()` bit-a-bit ao padrao das demais sub-rotas.
 */
export function parseCompanyIdParam(rawId: string): number | null {
  const parsed = Number.parseInt(rawId, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}
