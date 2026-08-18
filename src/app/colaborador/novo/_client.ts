// ROIP APP 9BOX — shim local ME-084. Re-exporta o
// `ColaboradorNovoClient` compartilhado bit-exact com a rota super-
// admin. Existe unicamente para encurtar o import na `page.tsx` desta
// rota abaixo do limite canonico de 100 colunas (RV-14). Prettier
// mantem o `export {...} from` em multi-linha quando ha >=2 identifiers
// — motivo pelo qual re-exportamos tambem `CriarColaboradorActionType`
// (tipo canonico ja consumido pelas actions RH).
//
// **RV-13.** Consumido por `./page.tsx` (ColaboradorNovoClient) e por
// `./actions.ts` (CriarColaboradorActionType via re-export logico).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

export {
  ColaboradorNovoClient,
  type CriarColaboradorActionType,
} from '../../super-admin/empresa/[id]/colaborador/novo/ColaboradorNovoClient';
