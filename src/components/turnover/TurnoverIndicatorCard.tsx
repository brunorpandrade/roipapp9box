// ROIP APP 9BOX — card "Turnover" dos paineis (especificacao "Turnover e
// desligamento" §5, ME-fila6 D2).
//
// Presente nos paineis de Bruno (landing da empresa), RH e C-level com
// acesso total. Conteudo: taxa total do ultimo trimestre fechado (DOC 03
// §12.5). Clique abre a pagina de turnover.

import type { JSX } from 'react';

import {
  TURNOVER_SEM_TRIMESTRE_FECHADO,
  formatAbsolutosTurnover,
  formatPercentualTurnover,
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
  return (
    <ClickableIndicatorCard
      title="Turnover"
      value={formatPercentualTurnover(data.taxa)}
      sub={`${data.label} ${formatAbsolutosTurnover(data.saidas, data.headcount)}`}
      href={href}
      ariaLabel="Abrir página de turnover"
    />
  );
}
