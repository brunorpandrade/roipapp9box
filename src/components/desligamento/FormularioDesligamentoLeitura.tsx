// ROIP APP 9BOX — formulario de desligamento preenchido, somente leitura
// (drill-down da pagina de turnover — especificacao §6, ME-fila6 D2).
//
// Evento sem formulario (desligamentos anteriores a captura estruturada)
// exibe aviso fixo. Rotulos da fonte unica `terminationForms`.
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
}): JSX.Element {
  const f = props.formulario;
  if (f === null) {
    return (
      <div style={{ fontSize: 13, color: COLORS.text.tertiary, fontStyle: 'italic' }}>
        {MSG_FORMULARIO_NAO_REGISTRADO}
      </div>
    );
  }
  if (f.tipo === 'voluntario') {
    const secundarios =
      f.motivosSecundarios.length === 0
        ? '—'
        : f.motivosSecundarios.map((m) => MOTIVO_SAIDA_VOLUNTARIA_LABELS[m]).join('; ');
    return (
      <div>
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
