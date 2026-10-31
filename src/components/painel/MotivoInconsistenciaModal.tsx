'use client';

// ROIP APP 9BOX — Modal canônica "Motivo da inconsistência" (ME-1.11
// do ROADMAP_V3). Exibe os motivos humanizados pelos quais o motor
// classificou a ultima tentativa do Perfil Individual do titular como
// `baixa` confiabilidade (DOC 03 §10.6 pt.1).
//
// Origem canonica:
// - DOC 03 §10.6 pt.1 (motor para na Camada 1 quando confiabilidade
//   e `baixa`, gravando apenas os 5 indices `ia_*`).
// - DOC 03 §6.7 (restricoes absolutas da camada humanizada — zero
//   jargao psicometrico, zero metodologia de origem).
// - DOC 05 §5.5 estendida pela ME-1.11 (botao `[Motivo]` vermelho na
//   coluna Acao do box "Perfil Individual inconsistente" + modal
//   pop-up).
// - Precedente visual do `ModalConfirm` do `PerfilInconsistenteBox.tsx`
//   — mesma gramatica (overlay `rgba(0,0,0,0.55)`, cartao `background.card`,
//   borderRadius 14, header navy, max 520px). Reaproveitamento canonico.
//
// Comportamento nos 4 estados canonicos:
// - `inconsistente` (primeira tentativa): botao `[Motivo]` vermelho
//   ativo; modal mostra os motivos da tentativa.
// - `aguardando_nova_resposta`: botao `[Motivo]` apagado (opacity 0.5)
//   mas clicavel; modal mostra os motivos da ultima tentativa
//   `inconsistente` (service `individualProfilePlaceholders.ts` busca
//   `MAX(tentativa) WHERE status='inconsistente'`, nao a nova
//   em_andamento).
// - `inconsistente` reincidente (tentativaAtual >= 2): botao `[Motivo]`
//   vermelho ativo + fundo da linha `COLORS.badge.dangerBg` /
//   `dangerText` (ja aplicado no `PerfilInconsistenteBox.tsx`).
// - `consistente`: linha some do box; modal nunca abre.
//
// RV-14: um statement por linha, largura maxima 100 cols.
// RV-13: consumido por `PerfilInconsistenteBox.tsx` (teste de estrutura
//   em `tests/unit/me-fila3-reteste-ui-structure.test.ts` estendido).

import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import type { MotivoRotulado } from '../../lib/instruments/individualProfileReliabilityLabels';

// -----------------------------------------------------------------------
// Textos canonicos literais DOC 03 §10.6 pt.1 + §6.7
// -----------------------------------------------------------------------

export const MOTIVO_MODAL_TITULO = 'Motivo da inconsistência';

export const MOTIVO_MODAL_CONTEXTO =
  'A última tentativa do Perfil Individual deste colaborador apresentou um ou mais padrões ' +
  'de resposta que comprometem a leitura canônica do perfil. Os motivos abaixo foram ' +
  'detectados automaticamente pelo motor de validação.';

export const MOTIVO_MODAL_FECHAMENTO =
  'Converse com o colaborador antes de liberar nova tentativa — alinhar o foco e o cuidado ' +
  'ao responder tende a produzir resultado válido na próxima rodada.';

export const MOTIVO_MODAL_SEM_DADOS =
  'Não foi possível identificar motivos canônicos para esta tentativa. Verifique com o time ' +
  'técnico se o motor processou integralmente a última resposta.';

// -----------------------------------------------------------------------
// Props canonicas
// -----------------------------------------------------------------------

export interface MotivoInconsistenciaModalProps {
  readonly userDisplayName: string;
  readonly cargo: string;
  readonly motivos: readonly MotivoRotulado[];
  readonly onClose: () => void;
}

// -----------------------------------------------------------------------
// Componente canonico
// -----------------------------------------------------------------------

export function MotivoInconsistenciaModal(props: MotivoInconsistenciaModalProps): JSX.Element {
  const { userDisplayName, cargo, motivos, onClose } = props;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Motivo da inconsistência do Perfil Individual de ${userDisplayName}`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: COLORS.background.card,
          borderRadius: 14,
          maxWidth: 520,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            padding: '16px 24px',
            background: COLORS.primary.navy,
            color: '#FFFFFF',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            {MOTIVO_MODAL_TITULO}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontSize: 20,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ×
          </button>
        </header>
        <div
          style={{
            padding: '20px 24px',
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: `1px solid ${COLORS.border.divider}`,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: COLORS.text.primary,
              }}
            >
              {userDisplayName}
            </div>
            <div
              style={{
                fontSize: 12,
                color: COLORS.text.secondary,
                marginTop: 2,
              }}
            >
              {cargo}
            </div>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.6,
              color: COLORS.text.secondary,
            }}
          >
            {MOTIVO_MODAL_CONTEXTO}
          </p>
          {motivos.length === 0 ? (
            <p
              style={{
                marginTop: 16,
                marginBottom: 0,
                fontSize: 13,
                lineHeight: 1.6,
                color: COLORS.text.tertiary,
                fontStyle: 'italic',
              }}
            >
              {MOTIVO_MODAL_SEM_DADOS}
            </p>
          ) : (
            <ul
              style={{
                margin: '16px 0 0 0',
                padding: '0 0 0 20px',
                fontSize: 13,
                lineHeight: 1.6,
                color: COLORS.text.primary,
              }}
            >
              {motivos.map((m) => (
                <li
                  key={m.chave}
                  style={{
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color:
                        m.severidade === 'critico'
                          ? COLORS.semantic.danger
                          : COLORS.semantic.warning,
                    }}
                  >
                    {m.titulo}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      color: COLORS.text.secondary,
                    }}
                  >
                    {m.descricao}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {motivos.length > 0 ? (
            <p
              style={{
                marginTop: 16,
                marginBottom: 0,
                fontSize: 13,
                lineHeight: 1.6,
                color: COLORS.text.secondary,
              }}
            >
              {MOTIVO_MODAL_FECHAMENTO}
            </p>
          ) : null}
        </div>
        <footer
          style={{
            padding: '12px 24px',
            borderTop: `1px solid ${COLORS.border.default}`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              background: 'transparent',
              color: COLORS.text.primary,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
