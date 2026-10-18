// ROIP APP 9BOX — formulario de desligamento preenchido, somente leitura
// (drill-down da pagina de turnover — especificacao §6, ME-fila6 D2).
//
// Evento sem formulario (desligamentos anteriores a captura estruturada)
// exibe aviso fixo. Rotulos da fonte unica `terminationForms`.
//
// ME-1.13 (Conversa 4b, Despacho B — D-B3): exibe `dataDesligamento`
// (data civil) e `dataInativacao` (timestamp sistemico) lado a lado.
// Quando iguais, nota pequena "(registrado no mesmo dia)".
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import {
  CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_LABELS,
  DESTINO_SAIDA_LABELS,
  MOTIVO_SAIDA_VOLUNTARIA_LABELS,
  NOTAS_VOLUNTARIO,
  PERGUNTAS_A,
  PERGUNTAS_B,
  RESPOSTA_SIM_NAO_NA_LABELS,
  RESPOSTA_SIM_NAO_TALVEZ_LABELS,
  type FormularioDesligamento,
} from '../../lib/shared/terminationForms';

export const MSG_FORMULARIO_NAO_REGISTRADO =
  'Formulário não registrado (desligamento anterior à captura estruturada).';
// ME-1.13 — constantes locais (RV-13 — sem export).
const NOTA_MESMO_DIA = '(registrado no mesmo dia)';
const LABEL_DATA_DESLIGAMENTO_LEITURA = 'Data de desligamento';
const LABEL_DATA_INATIVACAO_LEITURA = 'Data de inativação na plataforma';
const AUSENTE = '—';

/** Formata ISO date `YYYY-MM-DD` em "DD/MM/AAAA" bit-exact. */
function formatDataCivil(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso.length === 0) {
    return AUSENTE;
  }
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) {
    return iso;
  }
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Converte Date (timestamp) em ISO `YYYY-MM-DD` em UTC. */
function dateToIsoYmd(d: Date | null | undefined): string | null {
  if (d === null || d === undefined) {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

function Item(props: { readonly rotulo: string; readonly valor: string }): JSX.Element {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text.tertiary }}>
        {props.rotulo}
      </div>
      <div style={{ fontSize: 14, color: COLORS.text.primary, whiteSpace: 'pre-wrap' }}>
        {props.valor}
      </div>
    </div>
  );
}

export function FormularioDesligamentoLeitura(props: {
  readonly formulario: FormularioDesligamento | null;
  /** ME-1.13 — Data civil do desligamento (de employees.dataDesligamento). */
  readonly dataDesligamento?: string | null;
  /** ME-1.13 — Timestamp sistemico (de employeeTerminationEvents.dataInativacao). */
  readonly dataInativacao?: Date | null;
}): JSX.Element {
  const f = props.formulario;
  const desligamentoIso = props.dataDesligamento ?? null;
  const inativacaoIso = dateToIsoYmd(props.dataInativacao);
  const mostrarDatas = desligamentoIso !== null || inativacaoIso !== null;
  const mesmaData =
    desligamentoIso !== null && inativacaoIso !== null && desligamentoIso === inativacaoIso;
  const blocoDatas = mostrarDatas ? (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        padding: '10px 12px',
        background: COLORS.background.card,
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 6,
        marginBottom: 14,
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.text.tertiary }}>
          {LABEL_DATA_DESLIGAMENTO_LEITURA}
        </div>
        <div style={{ fontSize: 14, color: COLORS.text.primary }}>
          {formatDataCivil(desligamentoIso)}
        </div>
      </div>
      {mesmaData ? (
        <div style={{ fontSize: 11, color: COLORS.text.tertiary, alignSelf: 'end' }}>
          {NOTA_MESMO_DIA}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.text.tertiary }}>
            {LABEL_DATA_INATIVACAO_LEITURA}
          </div>
          <div style={{ fontSize: 14, color: COLORS.text.primary }}>
            {formatDataCivil(inativacaoIso)}
          </div>
        </div>
      )}
    </div>
  ) : null;
  if (f === null) {
    return (
      <div>
        {blocoDatas}
        <div style={{ fontSize: 13, color: COLORS.text.tertiary, fontStyle: 'italic' }}>
          {MSG_FORMULARIO_NAO_REGISTRADO}
        </div>
      </div>
    );
  }
  if (f.tipo === 'voluntario') {
    const secundarios =
      f.motivosSecundarios.length === 0
        ? AUSENTE
        : f.motivosSecundarios.map((m) => MOTIVO_SAIDA_VOLUNTARIA_LABELS[m]).join('; ');
    return (
      <div>
        {blocoDatas}
        <Item
          rotulo={PERGUNTAS_A.motivoPrincipal}
          valor={MOTIVO_SAIDA_VOLUNTARIA_LABELS[f.motivoPrincipal]}
        />
        <Item rotulo={PERGUNTAS_A.motivosSecundarios} valor={secundarios} />
        {NOTAS_VOLUNTARIO.map((n) => (
          <Item key={n.key} rotulo={n.label} valor={`${f[n.key]} de 5`} />
        ))}
        <Item
          rotulo={PERGUNTAS_A.voltariaTrabalhar}
          valor={RESPOSTA_SIM_NAO_TALVEZ_LABELS[f.voltariaTrabalhar]}
        />
        <Item
          rotulo={PERGUNTAS_A.recomendariaEmpresa}
          valor={RESPOSTA_SIM_NAO_TALVEZ_LABELS[f.recomendariaEmpresa]}
        />
        <Item rotulo={PERGUNTAS_A.destino} valor={DESTINO_SAIDA_LABELS[f.destino]} />
        <Item rotulo={PERGUNTAS_A.oQuePoderiaReter} valor={f.oQuePoderiaReter} />
        <Item rotulo={PERGUNTAS_A.comentariosAdicionais} valor={f.comentariosAdicionais ?? '—'} />
      </div>
    );
  }
  return (
    <div>
      {blocoDatas}
      <Item
        rotulo={PERGUNTAS_B.categoria}
        valor={CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_LABELS[f.categoria]}
      />
      <Item
        rotulo={PERGUNTAS_B.houveFeedbackFormal}
        valor={RESPOSTA_SIM_NAO_NA_LABELS[f.houveFeedbackFormal]}
      />
      <Item rotulo={PERGUNTAS_B.nivelDocumentacao} valor={`${f.nivelDocumentacao} de 5`} />
      <Item rotulo={PERGUNTAS_B.justificativa} valor={f.justificativa} />
      <Item
        rotulo={PERGUNTAS_B.necessidadeReposicao}
        valor={f.necessidadeReposicao ? 'Sim' : 'Não'}
      />
    </div>
  );
}
