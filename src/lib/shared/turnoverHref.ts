// ROIP APP 9BOX — helper canonico `buildTurnoverHref` (ME-1.14 Conversa
// 4b Despacho B — D-B5).
//
// Compoe o href do `<TurnoverIndicatorCard />` dos 4 paineis (SA empresa,
// SA preview RH, painel-rh, painel-clevel) com overlay do trimestre em
// andamento quando o card estiver em estado 'parcial'. Caso contrario,
// preserva o href base (comportamento historico — pagina abre no ultimo
// trimestre fechado por default).
//
// Usado nos 4 callsites para garantir que o clique no card parcial abra a
// pagina ja no trimestre em andamento com drill-down disponivel (ME-1.14-
// extensao canonica de 18/10/2026 noite — card em tempo real sem drill-
// down para formulario preenchido e tela cega).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { TurnoverCardData } from '../../server/services/turnoverPanel';

/**
 * Compoe o href canonico do card de turnover: quando parcial, concatena
 * `?trimestre=<trimestreEmAndamento>` ao basePath; caso contrario,
 * devolve o basePath intacto.
 */
export function buildTurnoverHref(basePath: string, card: TurnoverCardData | null): string {
  if (card === null) {
    return basePath;
  }
  if (card.estado !== 'parcial') {
    return basePath;
  }
  return `${basePath}?trimestre=${card.trimestre}`;
}
