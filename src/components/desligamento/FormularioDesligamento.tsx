'use client';

// ROIP APP 9BOX — formulario de desligamento, etapa 2 da inativacao
// (especificacao "Turnover e desligamento" §2, §3 e §4; ME-fila6 D2).
//
// - Motivo voluntario: Formulario A (entrevista transcrita pelo RH).
// - Motivo involuntario: Formulario B (justificativa).
// - O envio chama UMA action: `inativarColaborador` (sem liderados) ou
//   `executarTransferencia` (lider com liderados — mapeamento vindo da
//   edicao via `sessionStorage`). Formulario e inativacao gravam na mesma
//   transacao; cancelar nao inativa.
// - Campos abertos obrigatorios: DOC 03 §2 (100-500 apos `trim()`,
//   contador `X / 500` cinza/verde/vermelho, botao desabilitado fora do
//   intervalo).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties, type JSX } from 'react';

import type {
  executarTransferenciaAction,
  inativarColaboradorAction,
} from '../../app/super-admin/empresa/[id]/colaborador/[employeeId]/editar/actions';
import {
  CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_VALUES,
  DESTINO_SAIDA_VALUES,
  MOTIVO_SAIDA_VOLUNTARIA_VALUES,
  RESPOSTA_SIM_NAO_NA_VALUES,
  RESPOSTA_SIM_NAO_TALVEZ_VALUES,
  type MotivoSaidaVoluntaria,
  type MotivoTermination,
} from '../../db/schema/enums';
import { COLORS } from '../../lib/design-tokens/colors';
import {
  CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_LABELS,
  DESTINO_SAIDA_LABELS,
  FORMULARIO_A_DESCRICAO,
  FORMULARIO_A_TITULO,
  FORMULARIO_B_DESCRICAO,
  FORMULARIO_B_TITULO,
  MOTIVO_SAIDA_VOLUNTARIA_LABELS,
  NOTAS_VOLUNTARIO,
  ORIENTACAO_JUSTIFICATIVA_INVOLUNTARIO,
  PERGUNTAS_A,
  PERGUNTAS_B,
  RESPOSTA_SIM_NAO_NA_LABELS,
  RESPOSTA_SIM_NAO_TALVEZ_LABELS,
  TEXTO_MAX,
  TEXTO_MIN,
  validarFormularioDesligamento,
  type NotaVoluntariaKey,
} from '../../lib/shared/terminationForms';

import {
  lerTransferenciaPendente,
  limparTransferenciaPendente,
  type TransferenciaPendente,
} from './transferenciaPendente';

/** Actions injetadas pela rota (Bruno ou RH — mesma assinatura). */
export interface FormularioDesligamentoActions {
  readonly inativarColaborador: typeof inativarColaboradorAction;
  readonly executarTransferencia: typeof executarTransferenciaAction;
}

export interface FormularioDesligamentoClientProps {
  readonly employeeId: number;
  readonly employeeName: string;
  readonly motivo: MotivoTermination;
  readonly requerTransferencia: boolean;
  readonly editarHref: string;
  readonly sucessoHref: string;
  readonly actions: FormularioDesligamentoActions;
}

const MSG_TRANSFERENCIA_AUSENTE =
  'O mapeamento de redistribuição dos liderados não foi encontrado. Volte à edição do ' +
  'colaborador e refaça a inativação.';
const MSG_FALHA_ENVIO = 'Não foi possível concluir a inativação. Tente novamente.';

const CARD_STYLE: CSSProperties = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const QUESTION_STYLE: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: COLORS.text.primary,
  marginBottom: 8,
};

const HELP_STYLE: CSSProperties = {
  fontSize: 12,
  color: COLORS.text.tertiary,
  marginBottom: 8,
};

const ERROR_STYLE: CSSProperties = {
  fontSize: 12,
  color: COLORS.semantic.danger,
  marginTop: 6,
};

const SELECT_STYLE: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  background: COLORS.background.card,
  color: COLORS.text.primary,
};

const TEXTAREA_STYLE: CSSProperties = {
  ...SELECT_STYLE,
  minHeight: 110,
  resize: 'vertical',
  fontFamily: 'inherit',
};

const OPTION_ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
  fontSize: 14,
  color: COLORS.text.primary,
};

function corContador(len: number, obrigatorio: boolean): string {
  if (len > TEXTO_MAX) {
    return COLORS.semantic.danger;
  }
  if (obrigatorio && len < TEXTO_MIN) {
    return COLORS.text.tertiary;
  }
  return COLORS.semantic.success;
}

function Contador(props: { readonly texto: string; readonly obrigatorio: boolean }): JSX.Element {
  const len = props.texto.trim().length;
  return (
    <div style={{ fontSize: 12, marginTop: 4, color: corContador(len, props.obrigatorio) }}>
      {len} / {TEXTO_MAX}
    </div>
  );
}

function Erro(props: { readonly msg: string | undefined }): JSX.Element | null {
  if (props.msg === undefined) {
    return null;
  }
  return (
    <div role="alert" style={ERROR_STYLE}>
      {props.msg}
    </div>
  );
}

function RadioGrupo<T extends string>(props: {
  readonly name: string;
  readonly valores: readonly T[];
  readonly labels: Record<T, string>;
  readonly valor: T | null;
  readonly onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div style={OPTION_ROW_STYLE}>
      {props.valores.map((v) => (
        <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="radio"
            name={props.name}
            checked={props.valor === v}
            onChange={(): void => props.onChange(v)}
          />
          {props.labels[v]}
        </label>
      ))}
    </div>
  );
}

function EscalaUmACinco(props: {
  readonly name: string;
  readonly valor: number | null;
  readonly onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div style={OPTION_ROW_STYLE}>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="radio"
            name={props.name}
            checked={props.valor === n}
            onChange={(): void => props.onChange(n)}
          />
          {n}
        </label>
      ))}
    </div>
  );
}

export function FormularioDesligamentoClient(
  props: FormularioDesligamentoClientProps,
): JSX.Element {
  const { employeeId, employeeName, motivo, requerTransferencia, editarHref, sucessoHref } = props;
  const router = useRouter();

  // Formulario A
  const [motivoPrincipal, setMotivoPrincipal] = useState<MotivoSaidaVoluntaria | null>(null);
  const [secundarios, setSecundarios] = useState<MotivoSaidaVoluntaria[]>([]);
  const [notas, setNotas] = useState<Partial<Record<NotaVoluntariaKey, number>>>({});
  const [voltaria, setVoltaria] = useState<'sim' | 'nao' | 'talvez' | null>(null);
  const [recomendaria, setRecomendaria] = useState<'sim' | 'nao' | 'talvez' | null>(null);
  const [destino, setDestino] = useState<(typeof DESTINO_SAIDA_VALUES)[number] | null>(null);
  const [retencao, setRetencao] = useState('');
  const [comentarios, setComentarios] = useState('');

  // Formulario B
  const [categoria, setCategoria] = useState<
    (typeof CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_VALUES)[number] | null
  >(null);
  const [feedback, setFeedback] = useState<(typeof RESPOSTA_SIM_NAO_NA_VALUES)[number] | null>(
    null,
  );
  const [documentacao, setDocumentacao] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [reposicao, setReposicao] = useState<'sim' | 'nao' | null>(null);

  const [transferencia, setTransferencia] = useState<TransferenciaPendente | null>(null);
  const [transferenciaVerificada, setTransferenciaVerificada] = useState(!requerTransferencia);
  const [erros, setErros] = useState<Readonly<Record<string, string>>>({});
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!requerTransferencia) {
      return;
    }
    setTransferencia(lerTransferenciaPendente(employeeId, motivo));
    setTransferenciaVerificada(true);
  }, [employeeId, motivo, requerTransferencia]);

  const rascunho = useMemo(() => {
    if (motivo === 'voluntario') {
      return {
        tipo: 'voluntario',
        motivoPrincipal,
        motivosSecundarios: secundarios,
        ...notas,
        voltariaTrabalhar: voltaria,
        recomendariaEmpresa: recomendaria,
        destino,
        oQuePoderiaReter: retencao,
        comentariosAdicionais: comentarios,
      };
    }
    return {
      tipo: 'involuntario',
      categoria,
      houveFeedbackFormal: feedback,
      nivelDocumentacao: documentacao,
      justificativa,
      necessidadeReposicao: reposicao === null ? null : reposicao === 'sim',
    };
  }, [
    motivo,
    motivoPrincipal,
    secundarios,
    notas,
    voltaria,
    recomendaria,
    destino,
    retencao,
    comentarios,
    categoria,
    feedback,
    documentacao,
    justificativa,
    reposicao,
  ]);

  const textoObrigatorio = motivo === 'voluntario' ? retencao : justificativa;
  const textoLen = textoObrigatorio.trim().length;
  const comentariosLen = comentarios.trim().length;
  const textosForaDoIntervalo =
    textoLen < TEXTO_MIN || textoLen > TEXTO_MAX || comentariosLen > TEXTO_MAX;
  const bloqueadoPorTransferencia = requerTransferencia && transferencia === null;

  const alternarSecundario = (m: MotivoSaidaVoluntaria): void => {
    setSecundarios((atual) => {
      if (atual.includes(m)) {
        return atual.filter((x) => x !== m);
      }
      if (atual.length >= 2) {
        return atual;
      }
      return [...atual, m];
    });
  };

  const escolherPrincipal = (m: MotivoSaidaVoluntaria | null): void => {
    setMotivoPrincipal(m);
    setSecundarios((atual) => atual.filter((x) => x !== m));
  };

  const enviar = async (): Promise<void> => {
    setErroEnvio(null);
    const validacao = validarFormularioDesligamento(rascunho);
    if (!validacao.ok) {
      setErros(validacao.erros);
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      const resultado =
        requerTransferencia && transferencia !== null
          ? await props.actions.executarTransferencia({
              liderOriginalId: employeeId,
              mapeamento: transferencia.mapeamento,
              candidatosGrupo4: transferencia.candidatosGrupo4,
              reason: transferencia.reason,
              motivoSaida: motivo,
              formulario: validacao.data,
            })
          : await props.actions.inativarColaborador({
              employeeId,
              motivoSaida: motivo,
              formulario: validacao.data,
            });
      if (!resultado.ok) {
        setErroEnvio(resultado.message);
        return;
      }
      limparTransferenciaPendente(employeeId);
      router.push(sucessoHref);
    } catch {
      setErroEnvio(MSG_FALHA_ENVIO);
    } finally {
      setEnviando(false);
    }
  };

  const titulo = motivo === 'voluntario' ? FORMULARIO_A_TITULO : FORMULARIO_B_TITULO;
  const descricao = motivo === 'voluntario' ? FORMULARIO_A_DESCRICAO : FORMULARIO_B_DESCRICAO;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
          {titulo}
        </h1>
        <p style={{ fontSize: 13, color: COLORS.text.secondary, margin: '4px 0 0 0' }}>
          {employeeName} · {descricao}
        </p>
      </div>

      <div
        style={{
          background: COLORS.badge.warningBg,
          color: COLORS.badge.warningText,
          border: `1px solid ${COLORS.semantic.warning}`,
          borderRadius: 6,
          padding: 12,
          fontSize: 13,
        }}
      >
        A inativação só será concluída após o envio deste formulário.
      </div>

      {transferenciaVerificada && bloqueadoPorTransferencia ? (
        <div role="alert" style={{ ...CARD_STYLE, color: COLORS.semantic.danger, fontSize: 14 }}>
          {MSG_TRANSFERENCIA_AUSENTE}
        </div>
      ) : null}

      {motivo === 'voluntario' ? (
        <div style={CARD_STYLE}>
          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_A.motivoPrincipal}</div>
            <select
              style={SELECT_STYLE}
              value={motivoPrincipal ?? ''}
              onChange={(e): void =>
                escolherPrincipal(
                  e.target.value === '' ? null : (e.target.value as MotivoSaidaVoluntaria),
                )
              }
            >
              <option value="">Selecione</option>
              {MOTIVO_SAIDA_VOLUNTARIA_VALUES.map((m) => (
                <option key={m} value={m}>
                  {MOTIVO_SAIDA_VOLUNTARIA_LABELS[m]}
                </option>
              ))}
            </select>
            <Erro msg={erros.motivoPrincipal} />
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_A.motivosSecundarios}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
              {MOTIVO_SAIDA_VOLUNTARIA_VALUES.filter((m) => m !== motivoPrincipal).map((m) => {
                const marcado = secundarios.includes(m);
                const desabilitado = !marcado && secundarios.length >= 2;
                return (
                  <label
                    key={m}
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      color: desabilitado ? COLORS.text.tertiary : COLORS.text.primary,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={desabilitado}
                      onChange={(): void => alternarSecundario(m)}
                    />
                    {MOTIVO_SAIDA_VOLUNTARIA_LABELS[m]}
                  </label>
                );
              })}
            </div>
            <Erro msg={erros.motivosSecundarios} />
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_A.notas}</div>
            <div style={HELP_STYLE}>{PERGUNTAS_A.notasExtremos}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {NOTAS_VOLUNTARIO.map((n) => (
                <div key={n.key}>
                  <div style={{ fontSize: 14, color: COLORS.text.primary, marginBottom: 4 }}>
                    {n.label}
                  </div>
                  <EscalaUmACinco
                    name={n.key}
                    valor={notas[n.key] ?? null}
                    onChange={(v): void => setNotas((atual) => ({ ...atual, [n.key]: v }))}
                  />
                  <Erro msg={erros[n.key]} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_A.voltariaTrabalhar}</div>
            <RadioGrupo
              name="voltariaTrabalhar"
              valores={RESPOSTA_SIM_NAO_TALVEZ_VALUES}
              labels={RESPOSTA_SIM_NAO_TALVEZ_LABELS}
              valor={voltaria}
              onChange={setVoltaria}
            />
            <Erro msg={erros.voltariaTrabalhar} />
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_A.recomendariaEmpresa}</div>
            <RadioGrupo
              name="recomendariaEmpresa"
              valores={RESPOSTA_SIM_NAO_TALVEZ_VALUES}
              labels={RESPOSTA_SIM_NAO_TALVEZ_LABELS}
              valor={recomendaria}
              onChange={setRecomendaria}
            />
            <Erro msg={erros.recomendariaEmpresa} />
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_A.destino}</div>
            <select
              style={SELECT_STYLE}
              value={destino ?? ''}
              onChange={(e): void =>
                setDestino(
                  e.target.value === ''
                    ? null
                    : (e.target.value as (typeof DESTINO_SAIDA_VALUES)[number]),
                )
              }
            >
              <option value="">Selecione</option>
              {DESTINO_SAIDA_VALUES.map((d) => (
                <option key={d} value={d}>
                  {DESTINO_SAIDA_LABELS[d]}
                </option>
              ))}
            </select>
            <Erro msg={erros.destino} />
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_A.oQuePoderiaReter}</div>
            <textarea
              style={TEXTAREA_STYLE}
              value={retencao}
              maxLength={TEXTO_MAX + 50}
              onChange={(e): void => setRetencao(e.target.value)}
            />
            <Contador texto={retencao} obrigatorio />
            <Erro msg={erros.oQuePoderiaReter} />
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_A.comentariosAdicionais}</div>
            <textarea
              style={TEXTAREA_STYLE}
              value={comentarios}
              maxLength={TEXTO_MAX + 50}
              onChange={(e): void => setComentarios(e.target.value)}
            />
            <Contador texto={comentarios} obrigatorio={false} />
            <Erro msg={erros.comentariosAdicionais} />
          </div>
        </div>
      ) : (
        <div style={CARD_STYLE}>
          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_B.categoria}</div>
            <select
              style={SELECT_STYLE}
              value={categoria ?? ''}
              onChange={(e): void =>
                setCategoria(
                  e.target.value === ''
                    ? null
                    : (e.target
                        .value as (typeof CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_VALUES)[number]),
                )
              }
            >
              <option value="">Selecione</option>
              {CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_VALUES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_LABELS[c]}
                </option>
              ))}
            </select>
            <Erro msg={erros.categoria} />
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_B.houveFeedbackFormal}</div>
            <div style={HELP_STYLE}>{PERGUNTAS_B.houveFeedbackFormalAjuda}</div>
            <RadioGrupo
              name="houveFeedbackFormal"
              valores={RESPOSTA_SIM_NAO_NA_VALUES}
              labels={RESPOSTA_SIM_NAO_NA_LABELS}
              valor={feedback}
              onChange={setFeedback}
            />
            <Erro msg={erros.houveFeedbackFormal} />
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_B.nivelDocumentacao}</div>
            <div style={HELP_STYLE}>{PERGUNTAS_B.nivelDocumentacaoExtremos}</div>
            <EscalaUmACinco
              name="nivelDocumentacao"
              valor={documentacao}
              onChange={setDocumentacao}
            />
            <Erro msg={erros.nivelDocumentacao} />
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_B.justificativa}</div>
            <div style={HELP_STYLE}>{ORIENTACAO_JUSTIFICATIVA_INVOLUNTARIO}</div>
            <textarea
              style={TEXTAREA_STYLE}
              value={justificativa}
              maxLength={TEXTO_MAX + 50}
              onChange={(e): void => setJustificativa(e.target.value)}
            />
            <Contador texto={justificativa} obrigatorio />
            <Erro msg={erros.justificativa} />
          </div>

          <div>
            <div style={QUESTION_STYLE}>{PERGUNTAS_B.necessidadeReposicao}</div>
            <RadioGrupo
              name="necessidadeReposicao"
              valores={['sim', 'nao'] as const}
              labels={{ sim: 'Sim', nao: 'Não' }}
              valor={reposicao}
              onChange={setReposicao}
            />
            <Erro msg={erros.necessidadeReposicao} />
          </div>
        </div>
      )}

      {erroEnvio !== null ? (
        <div role="alert" style={{ ...ERROR_STYLE, fontSize: 14 }}>
          {erroEnvio}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button
          type="button"
          onClick={(): void => router.push(editarHref)}
          disabled={enviando}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 6,
            background: COLORS.background.card,
            color: COLORS.text.primary,
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={(): void => {
            void enviar();
          }}
          disabled={enviando || textosForaDoIntervalo || bloqueadoPorTransferencia}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            border: `1px solid ${COLORS.semantic.danger}`,
            borderRadius: 6,
            background: COLORS.semantic.danger,
            color: '#FFFFFF',
            cursor: 'pointer',
            opacity: enviando || textosForaDoIntervalo || bloqueadoPorTransferencia ? 0.6 : 1,
          }}
        >
          {enviando ? 'Enviando...' : 'Enviar formulário e inativar'}
        </button>
      </div>
    </div>
  );
}
