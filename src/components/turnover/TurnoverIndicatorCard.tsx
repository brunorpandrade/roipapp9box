// ROIP APP 9BOX — card "Turnover" dos paineis (especificacao "Turnover e
// desligamento" §5, ME-fila6 D2; exibicao revista na ME §8.06.2;
// ampliacao ME-1.14 Conversa 4b Despacho B — badge "Parcial" quando o
// card reflete o trimestre em andamento, link canonico para a pagina de
// turnover com drill-down nominal do trimestre em andamento).
//
// Presente nos paineis de Bruno (landing da empresa), RH e C-level com
// acesso total. Valor: total de desligados do trimestre como numero
// absoluto com percentual entre parenteses (DOC 03 §12.5); subtitulo com
// a composicao voluntario/involuntario + label do trimestre + badge
// "Parcial" quando `data.estado === 'parcial'`. Clique abre a pagina de
// turnover (quando parcial, abre o trimestre em andamento diretamente —
// `href` precisa ja carregar `?trimestre=<em-andamento>` canonico).

import type { JSX } from 'react';

import {
  TURNOVER_SEM_TRIMESTRE_FECHADO,
  formatTurnoverAbsPct,
} from '../../lib/shared/turnoverFormat';
import type { TurnoverCardData } from '../../server/services/turnoverPanel';
import { ClickableIndicatorCard } from '../painel/ClickableIndicatorCard';

/** ME-1.14 — rotulo local do badge "Parcial" (RV-13 — sem export). */
const BADGE_PARCIAL = 'Parcial';

export interface TurnoverIndicatorCardProps {
  readonly data: TurnoverCardData | null;
  readonly href: string;
}

export function TurnoverIndicatorCard(props: TurnoverIndicatorCardProps): JSX.Element {
  const { data, href } = props;
  if (data === null) {
    return (
      <ClickableIndicatorCard
        title="Turnover"
        value="—"
        sub={TURNOVER_SEM_TRIMESTRE_FECHADO}
        href={href}
        ariaLabel="Abrir página de turnover"
      />
    );
  }
  const vol = formatTurnoverAbsPct(data.voluntario.saidas, data.voluntario.percentual);
  const inv = formatTurnoverAbsPct(data.involuntario.saidas, data.involuntario.percentual);
  const marcador = data.estado === 'parcial' ? ` · ${BADGE_PARCIAL}` : '';
  return (
    <ClickableIndicatorCard
      title="Turnover"
      value={formatTurnoverAbsPct(data.total.saidas, data.total.percentual)}
      sub={`${data.label}${marcador} · voluntário ${vol} · involuntário ${inv}`}
      href={href}
      ariaLabel="Abrir página de turnover"
    />
  );
}
