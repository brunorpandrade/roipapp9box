// ROIP APP 9BOX — pagina de turnover (especificacao "Turnover e
// desligamento" §6, ME-fila6 D2).
//
// Server component compartilhado pelas rotas `/turnover` (RH, RH-Lider,
// C-level com acesso total) e `/super-admin/empresa/[id]/turnover`
// (Bruno). Estrutura:
// - botoes dos documentos padrao (visualizacao + PDF);
// - card rolling 12 meses (ultimos 4 trimestres fechados);
// - navegacao entre trimestres fechados;
// - total, voluntario e involuntario do trimestre (DOC 03 §12.4/§12.5);
// - drill-down nominal por motivo apenas quando `podeDrilldown`.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import Link from 'next/link';
import type { CSSProperties, JSX } from 'react';

import {
  NIVEL_HIERARQUICO_LABELS,
  formatDateBR,
} from '../../app/super-admin/empresa/[id]/todos-os-colaboradores/internals';
import type { MotivoTermination } from '../../db/schema/enums';
import { COLORS } from '../../lib/design-tokens/colors';
import {
  TURNOVER_SEM_TRIMESTRE_FECHADO,
  formatBaseFechamento,
  formatTurnoverAbsPct,
} from '../../lib/shared/turnoverFormat';
import type { TurnoverDrilldownRow, TurnoverPageData } from '../../server/services/turnoverPanel';
import { FormularioDesligamentoLeitura } from '../desligamento/FormularioDesligamentoLeitura';

import { DocumentosPadraoClient, type DocumentoPadraoView } from './DocumentosPadraoClient';

export interface TurnoverViewProps {
  readonly data: TurnoverPageData;
  readonly basePath: string;
  readonly podeDrilldown: boolean;
  readonly grupo: MotivoTermination | null;
  readonly drilldown: readonly TurnoverDrilldownRow[];
  readonly documentos: readonly DocumentoPadraoView[];
}

const CARD: CSSProperties = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  textDecoration: 'none',
  color: 'inherit',
};

const GRUPO_TITULO: Record<MotivoTermination, string> = {
  voluntario: 'Desligamentos voluntários',
  involuntario: 'Desligamentos involuntários',
};

function Indicador(props: {
  readonly titulo: string;
  readonly saidas: number;
  readonly percentual: number;
  readonly baseInfo?: string;
  readonly sub?: string;
  readonly href?: string;
  readonly ativo?: boolean;
}): JSX.Element {
  const conteudo = (
    <>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
        }}
      >
        {props.titulo}
      </span>
      <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary }}>
        {formatTurnoverAbsPct(props.saidas, props.percentual)}
      </span>
      {props.baseInfo !== undefined ? (
        <span style={{ fontSize: 12, color: COLORS.text.secondary }}>{props.baseInfo}</span>
      ) : null}
      {props.sub !== undefined ? (
        <span style={{ fontSize: 12, color: COLORS.accent.teal }}>{props.sub}</span>
      ) : null}
    </>
  );
  const estilo: CSSProperties =
    props.ativo === true ? { ...CARD, borderColor: COLORS.accent.teal } : CARD;
  if (props.href === undefined) {
    return <div style={estilo}>{conteudo}</div>;
  }
  return (
    <Link href={props.href} style={estilo}>
      {conteudo}
    </Link>
  );
}

export function TurnoverView(props: TurnoverViewProps): JSX.Element {
  const { data, basePath, podeDrilldown, grupo, drilldown, documentos } = props;
  const resumo = data.resumo;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
            Turnover
          </h1>
          <p style={{ fontSize: 13, color: COLORS.text.secondary, margin: '4px 0 0 0' }}>
            Trimestres fechados — total e divisão por voluntário e involuntário
          </p>
        </div>
        <DocumentosPadraoClient documentos={documentos} />
      </div>

      {resumo === null || data.rolling12m === null ? (
        <div style={{ ...CARD, fontSize: 14, color: COLORS.text.secondary }}>
          {TURNOVER_SEM_TRIMESTRE_FECHADO}
        </div>
      ) : (
        <>
          <section aria-label="Últimos 4 trimestres fechados">
            <Indicador
              titulo="Últimos 4 trimestres fechados (rolling 12 meses)"
              saidas={data.rolling12m.saidas}
              percentual={data.rolling12m.percentual}
            />
          </section>

          <nav
            aria-label="Navegação por trimestre"
            style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
          >
            {data.trimestreAnterior !== null ? (
              <Link href={`${basePath}?trimestre=${data.trimestreAnterior}`}>
                ← Trimestre anterior
              </Link>
            ) : (
              <span style={{ color: COLORS.text.tertiary }}>← Trimestre anterior</span>
            )}
            <strong style={{ fontSize: 16, color: COLORS.text.primary }}>{resumo.label}</strong>
            {data.trimestreSeguinte !== null ? (
              <Link href={`${basePath}?trimestre=${data.trimestreSeguinte}`}>
                Trimestre seguinte →
              </Link>
            ) : (
              <span style={{ color: COLORS.text.tertiary }}>Trimestre seguinte →</span>
            )}
          </nav>

          <section
            aria-label={`Turnover — ${resumo.label}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <Indicador
              titulo="Total"
              saidas={resumo.total.saidas}
              percentual={resumo.total.percentual}
              baseInfo={formatBaseFechamento(resumo.total.headcountBase)}
            />
            {(['voluntario', 'involuntario'] as const).map((m) => (
              <Indicador
                key={m}
                titulo={m === 'voluntario' ? 'Voluntário' : 'Involuntário'}
                saidas={resumo[m].saidas}
                percentual={resumo[m].percentual}
                ativo={grupo === m}
                href={
                  podeDrilldown
                    ? `${basePath}?trimestre=${resumo.trimestre}&grupo=${m}#drilldown`
                    : undefined
                }
                sub={podeDrilldown ? 'Ver pessoas' : undefined}
              />
            ))}
          </section>

          {podeDrilldown && grupo !== null ? (
            <section id="drilldown" aria-label={GRUPO_TITULO[grupo]}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: COLORS.text.primary }}>
                {GRUPO_TITULO[grupo]} — {resumo.label}
              </h2>
              {drilldown.length === 0 ? (
                <div style={{ ...CARD, fontSize: 14, color: COLORS.text.secondary }}>
                  Nenhum desligamento neste grupo no trimestre.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {drilldown.map((r) => (
                    <details key={r.terminationEventId} style={CARD}>
                      <summary style={{ cursor: 'pointer', fontSize: 14 }}>
                        <strong>{r.name}</strong> · {r.departamento} ·{' '}
                        {NIVEL_HIERARQUICO_LABELS[r.nivelHierarquico]} · inativado em{' '}
                        {formatDateBR(r.dataInativacao)}
                      </summary>
                      <div style={{ marginTop: 12 }}>
                        <FormularioDesligamentoLeitura formulario={r.formulario} />
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
