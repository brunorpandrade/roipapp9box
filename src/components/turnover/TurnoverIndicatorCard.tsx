// ROIP APP 9BOX — card "Turnover" dos paineis (especificacao "Turnover e
// desligamento" §5, ME-fila6 D2; exibicao revista na ME §8.06.2).
//
// Presente nos paineis de Bruno (landing da empresa), RH e C-level com
// acesso total. Valor: total de desligados do ultimo trimestre fechado como
// numero absoluto com percentual entre parenteses (DOC 03 §12.5); subtitulo
// com a composicao voluntario/involuntario. Clique abre a pagina de
// turnover.

import type { JSX } from 'react';

import {
  TURNOVER_SEM_TRIMESTRE_FECHADO,
  formatTurnoverAbsPct,
} from '../../lib/shared/turnoverFormat';
import type { TurnoverCardData } from '../../server/services/turnoverPanel';
import { ClickableIndicatorCard } from '../painel/ClickableIndicatorCard';

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
  return (
    <ClickableIndicatorCard
      title="Turnover"
      value={formatTurnoverAbsPct(data.total.saidas, data.total.percentual)}
      sub={`${data.label} · voluntário ${vol} · involuntário ${inv}`}
      href={href}
      ariaLabel="Abrir página de turnover"
    />
  );
}
