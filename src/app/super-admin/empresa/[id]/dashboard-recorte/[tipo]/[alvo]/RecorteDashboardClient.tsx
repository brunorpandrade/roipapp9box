// ROIP APP 9BOX — dashboard agregado de um recorte (departamento, equipe
// direta ou cadeia total). Mesma tela do dashboard da empresa MENOS
// folha e turnover (§11, exclusivos da empresa; §8.06.5 Opção A):
// navegação de trimestre + coletivo + 9-Box + mostradores + dimensões.
// Componente de apresentação.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import type { JSX } from 'react';

import type { RecorteAggregatePage } from '../../../../../../../server/services/companyAggregate';
import {
  ColetivoCard,
  DimensoesCard,
  IqlLiderCard,
  MensagemPiso,
  MensagemVazio,
  MostradoresCard,
  Movimento9BoxCard,
  NineBoxColetivo,
  TrimestreNav,
  TurnoverCard,
} from '../../../_agregado/shared';

export interface RecorteDashboardClientProps {
  readonly data: RecorteAggregatePage;
  readonly basePath: string;
}

export function RecorteDashboardClient(props: RecorteDashboardClientProps): JSX.Element {
  const { data, basePath } = props;
  if (data.trimestre === null || data.aggregate === null) {
    return <MensagemVazio />;
  }
  const agg = data.aggregate;
  const nav = (
    <TrimestreNav
      label={data.label}
      anterior={data.trimestreAnterior}
      seguinte={data.trimestreSeguinte}
      basePath={basePath}
    />
  );
  if (agg.abaixoDoPiso) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {nav}
        <MensagemPiso headcount={agg.headcount} />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {nav}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ColetivoCard agg={agg} />
          <NineBoxColetivo agg={agg} movimento={data.movimento9box} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MostradoresCard agg={agg} assiduidade={data.assiduidade} />
          <DimensoesCard agg={agg} />
          {data.turnover !== null ? <TurnoverCard turnover={data.turnover} /> : null}
          {data.iqlLider !== null ? <IqlLiderCard iqlLider={data.iqlLider} /> : null}
          {data.movimento9box !== null ? (
            <Movimento9BoxCard movimento={data.movimento9box} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
