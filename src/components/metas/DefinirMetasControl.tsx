'use client';

// ROIP APP 9BOX — botao [Definir metas], selo de status e modal M1
// (DOC 05 §13.4 Secao 6, §13.7 e §18.9; ME-fila6 D3).
//
// - Selo: "Metas definidas" (verde) ou "Metas pendentes" (ambar).
// - Modal: 4 variaveis da familia (nome e unidade somente leitura; peso e
//   meta editaveis), contador "Soma dos pesos: X%", validacao inline,
//   banner ambar de template atualizado com [Aplicar template atual],
//   Familia 6 com meta fixa 5, peso zero com meta "N/A".
// - Rodape: [Cancelar] e [Salvar metas] (desabilitado ate validar).
// - Sucesso: toast verde "Metas definidas com sucesso.".
//
// Permissao e gravacao decididas no servidor (`salvarMetasAction`).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { useState, type CSSProperties, type JSX } from 'react';

import { carregarMetasAction, salvarMetasAction } from '../../app/_shared/metas/actions';
import { JOB_FAMILY_LABELS } from '@/app/super-admin/empresa/[id]/todos-os-colaboradores/internals';
import { COLORS } from '../../lib/design-tokens/colors';
import {
  MSG_METAS_SALVAS,
  MSG_TEMPLATE_ATUALIZADO,
  MSG_TEMPLATE_AUSENTE,
  TEXTO_FAMILIA_6,
  somaPesosCentesimos,
  validarMetas,
  type MetaRascunho,
} from '../../lib/shared/employeeGoalsForm';
import type {
  MetaLinha,
  MetasModalData,
  MetasStatus,
} from '../../server/services/employeeGoalsModal';

export interface DefinirMetasControlProps {
  readonly companyId: number;
  readonly employeeId: number;
  readonly initialStatus: MetasStatus;
  /** Exibe o selo ao lado do botao (ficha de edicao). */
  readonly mostrarSelo?: boolean;
}

const BTN_STYLE: CSSProperties = {
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 600,
  border: `1px solid ${COLORS.accent.teal}`,
  borderRadius: 6,
  background: COLORS.background.card,
  color: COLORS.accent.teal,
  cursor: 'pointer',
};

const INPUT_STYLE: CSSProperties = {
  width: 110,
  padding: '6px 8px',
  fontSize: 14,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  textAlign: 'right',
};

const ERRO_STYLE: CSSProperties = { fontSize: 12, color: COLORS.semantic.danger, marginTop: 4 };

function Selo(props: { readonly status: MetasStatus }): JSX.Element {
  const definidas = props.status === 'definidas';
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 999,
        background: definidas ? COLORS.badge.successBg : COLORS.badge.warningBg,
        color: definidas ? COLORS.badge.successText : COLORS.badge.warningText,
      }}
    >
      {definidas ? 'Metas definidas' : 'Metas pendentes'}
    </span>
  );
}

function paraRascunho(linhas: readonly MetaLinha[]): MetaRascunho[] {
  return linhas.map((l) => ({ variableIndex: l.variableIndex, weight: l.weight, goal: l.goal }));
}

export function DefinirMetasControl(props: DefinirMetasControlProps): JSX.Element {
  const { companyId, employeeId, mostrarSelo = true } = props;
  const [status, setStatus] = useState<MetasStatus>(props.initialStatus);
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<MetasModalData | null>(null);
  const [linhas, setLinhas] = useState<MetaLinha[]>([]);
  const [aplicarTemplate, setAplicarTemplate] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const abrir = async (): Promise<void> => {
    setAberto(true);
    setDados(null);
    setErro(null);
    setAplicarTemplate(false);
    const r = await carregarMetasAction(companyId, employeeId);
    if (!r.ok) {
      setErro(r.message);
      return;
    }
    setDados(r.data);
    setLinhas([...r.data.linhas]);
  };

  const fechar = (): void => {
    setAberto(false);
  };

  const alterar = (idx: number, campo: 'weight' | 'goal', valor: string): void => {
    setLinhas((atual) =>
      atual.map((l) => (l.variableIndex === idx ? { ...l, [campo]: valor } : l)),
    );
  };

  const aplicarTemplateAtual = (): void => {
    if (dados === null) {
      return;
    }
    const metaPorIndice = new Map(linhas.map((l) => [l.variableIndex, l.goal]));
    setLinhas(
      dados.template.map((t) => ({
        ...t,
        goal: dados.familia6 ? '5' : (metaPorIndice.get(t.variableIndex) ?? ''),
      })),
    );
    setAplicarTemplate(true);
  };

  const rascunho = paraRascunho(linhas);
  const validacao = dados === null ? null : validarMetas(rascunho, dados.familia6);
  const soma = somaPesosCentesimos(rascunho) / 100;
  const podeSalvar =
    dados !== null && !dados.templateAusente && validacao !== null && validacao.ok && !salvando;

  const salvar = async (): Promise<void> => {
    if (!podeSalvar || dados === null) {
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await salvarMetasAction({
        companyId,
        employeeId,
        aplicarTemplate,
        linhas: rascunho,
      });
      if (!r.ok) {
        setErro(r.message);
        return;
      }
      setStatus(r.status);
      setAberto(false);
      setToast(MSG_METAS_SALVAS);
      window.setTimeout(() => setToast(null), 4000);
    } finally {
      setSalvando(false);
    }
  };

  // §18.9: mensagens inline em tempo real; [Salvar metas] desabilitado ate validar.
  const errosVisiveis = validacao !== null && !validacao.ok ? validacao.erros : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button type="button" style={BTN_STYLE} onClick={(): void => void abrir()}>
        Definir metas
      </button>
      {mostrarSelo ? <Selo status={status} /> : null}

      {toast !== null ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 300,
            background: COLORS.semantic.success,
            color: '#FFFFFF',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {toast}
        </div>
      ) : null}

      {aberto ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Definir metas"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 880,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: COLORS.background.card,
              borderRadius: 12,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2
                  style={{ fontSize: 18, fontWeight: 700, margin: 0, color: COLORS.text.primary }}
                >
                  Definir metas de {dados?.employeeName ?? '…'}
                </h2>
                {dados !== null ? (
                  <div style={{ fontSize: 13, color: COLORS.text.secondary, marginTop: 4 }}>
                    Família de função: {JOB_FAMILY_LABELS[dados.jobFamily]} ·{' '}
                    <Selo status={status} />
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={fechar}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {dados === null && erro === null ? (
              <div role="status" style={{ fontSize: 14, color: COLORS.text.tertiary }}>
                Carregando metas...
              </div>
            ) : null}

            {dados !== null && dados.templateAusente ? (
              <div role="alert" style={{ ...ERRO_STYLE, fontSize: 14 }}>
                {MSG_TEMPLATE_AUSENTE}
              </div>
            ) : null}

            {dados !== null && dados.templateAtualizado && !aplicarTemplate ? (
              <div
                style={{
                  background: COLORS.badge.warningBg,
                  color: COLORS.badge.warningText,
                  border: `1px solid ${COLORS.semantic.warning}`,
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 13,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span>{MSG_TEMPLATE_ATUALIZADO}</span>
                <button type="button" style={BTN_STYLE} onClick={aplicarTemplateAtual}>
                  Aplicar template atual
                </button>
              </div>
            ) : null}

            {dados !== null && dados.familia6 ? (
              <div style={{ fontSize: 13, color: COLORS.text.secondary }}>{TEXTO_FAMILIA_6}</div>
            ) : null}

            {dados !== null && !dados.templateAusente ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: COLORS.text.tertiary, fontSize: 12 }}>
                      <th style={{ padding: 8 }}>#</th>
                      <th style={{ padding: 8 }}>Nome da variável</th>
                      <th style={{ padding: 8 }}>Unidade</th>
                      <th style={{ padding: 8 }}>Peso (%)</th>
                      <th style={{ padding: 8 }}>Meta (capacidade plena)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => {
                      const pesoZero = Number(l.weight.replace(',', '.')) === 0 && l.weight !== '';
                      const erroLinha = errosVisiveis?.porVariavel[l.variableIndex];
                      return (
                        <tr
                          key={l.variableIndex}
                          style={{ borderTop: `1px solid ${COLORS.border.default}` }}
                        >
                          <td style={{ padding: 8 }}>{i + 1}</td>
                          <td style={{ padding: 8, fontWeight: 600 }}>{l.variableName}</td>
                          <td style={{ padding: 8 }}>{l.unit}</td>
                          <td style={{ padding: 8 }}>
                            <input
                              aria-label={`Peso da variável ${i + 1}`}
                              inputMode="decimal"
                              style={INPUT_STYLE}
                              value={l.weight}
                              onChange={(e): void =>
                                alterar(l.variableIndex, 'weight', e.target.value)
                              }
                            />
                            {erroLinha?.peso !== undefined ? (
                              <div style={ERRO_STYLE}>{erroLinha.peso}</div>
                            ) : null}
                          </td>
                          <td style={{ padding: 8 }}>
                            {pesoZero ? (
                              <span style={{ color: COLORS.text.tertiary }}>N/A · peso zero</span>
                            ) : (
                              <input
                                aria-label={`Meta da variável ${i + 1}`}
                                inputMode="decimal"
                                style={INPUT_STYLE}
                                value={dados.familia6 ? '5' : l.goal}
                                disabled={dados.familia6}
                                onChange={(e): void =>
                                  alterar(l.variableIndex, 'goal', e.target.value)
                                }
                              />
                            )}
                            {erroLinha?.meta !== undefined ? (
                              <div style={ERRO_STYLE}>{erroLinha.meta}</div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    color: soma === 100 ? COLORS.semantic.success : COLORS.semantic.danger,
                  }}
                >
                  Soma dos pesos: {soma.toLocaleString('pt-BR')}%
                </div>
                {validacao !== null && !validacao.ok && validacao.erros.soma !== null ? (
                  <div style={ERRO_STYLE}>{validacao.erros.soma}</div>
                ) : null}
              </div>
            ) : null}

            {erro !== null ? (
              <div role="alert" style={{ ...ERRO_STYLE, fontSize: 14 }}>
                {erro}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={fechar}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  border: `1px solid ${COLORS.border.default}`,
                  borderRadius: 6,
                  background: COLORS.background.card,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={(): void => void salvar()}
                disabled={!podeSalvar}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 6,
                  background: COLORS.accent.teal,
                  color: '#FFFFFF',
                  cursor: podeSalvar ? 'pointer' : 'not-allowed',
                  opacity: podeSalvar ? 1 : 0.6,
                }}
              >
                {salvando ? 'Salvando...' : 'Salvar metas'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
