// ROIP APP 9BOX — re-export canonico do Nr1Client (ME-B11.1b, NR1·2).
//
// Antes desta ME, `src/app/nr1/Nr1Client.tsx` era um stub de 28 linhas
// (pseudo-conteudo cru "Radar NR-1 / Nativa Alimentos / fechado") que
// renderizava para o perfil RH quando acessava `/nr1`.
//
// Fix cirurgico canonico: o shell RH passa a reutilizar o componente
// canonico de `/super-admin/empresa/[id]/nr1/Nr1Client` — o mesmo
// que o Super Admin dentro-de-empresa usa. Permissoes de operacao
// (configureCycle, editClosingDate, cancelCycle, startDownloadToken)
// ja sao `rhAllowedProcedure()` no router nr1 (DOC 03 §11.2 e §11.17),
// entao o componente opera identicamente para RH e Super Admin.
//
// **RV-13.** Chamador: `src/app/nr1/page.tsx` (RH canal).
// **RV-14.** Um statement por linha, 100 colunas.

export { Nr1Client, type Nr1ClientProps } from '../super-admin/empresa/[id]/nr1/Nr1Client';
