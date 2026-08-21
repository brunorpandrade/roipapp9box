// ROIP APP 9BOX — shim local ME-086b. Re-exporta o
// `OrganogramaClient` compartilhado bit-exact com a rota super-admin.
// Existe unicamente para encurtar o import na `page.tsx` desta rota
// abaixo do limite canonico de 100 colunas (RV-14).
//
// Padrao canonico bit-exact ao `_client.ts` de `/minha-equipe`
// (ME-085) — precedente L123 canonizado.
//
// D-086b-4 A aprovada: `OrganogramaClient` da ME-077 (978 linhas) e
// canonicamente reutilizavel bit-exact SEM prop `variant` — ja expoe
// `applyPC1b: boolean` (S408). Rota RH passa
// `applyPC1b={shouldApplyPC1b(session)}` do server (canonicamente
// retorna `true` para role IN ('rh', 'rh_lider')).
//
// **RV-13.** Consumido por `./page.tsx`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

export {
  OrganogramaClient,
  type OrganogramaClientProps,
} from '../super-admin/empresa/[id]/organograma/OrganogramaClient';
