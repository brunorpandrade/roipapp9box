// ROIP APP 9BOX — shim local ME-084. Re-exporta o
// `ColaboradorEditarClient` compartilhado bit-exact com a rota super-
// admin. Existe unicamente para encurtar o import na `page.tsx` desta
// rota abaixo do limite canonico de 100 colunas (RV-14). Prettier
// mantem o `export {...} from` em multi-linha quando ha >=2 identifiers
// — motivo pelo qual re-exportamos tambem `ColaboradorEditarActions`
// (interface canonica ja necessaria para o contrato de props).
//
// **RV-13.** Consumido por `./page.tsx` (ambos os identifiers).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

export {
  ColaboradorEditarClient,
  type ColaboradorEditarActions,
} from '../../../super-admin/empresa/[id]/colaborador/[employeeId]/editar/ColaboradorEditarClient';
