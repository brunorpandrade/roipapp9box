'use client';

// ROIP APP 9BOX — client component canonico da Secao 6 §5.5 nova
// (ME-fila3-reteste-ui) — "Perfil Individual inconsistente".
//
// Origem canonica:
// - DOC 03 §10.6 pt.6 ("Registro do colaborador aparece automaticamente
//   no box 'Perfil Individual inconsistente' do painel do RH da empresa
//   e do painel de empresa do Bruno").
// - DOC 03 §10.7 (mecanica canonica completa da reaplicacao por
//   liberacao manual — validacoes, audit trail, comportamento apos
//   segunda tentativa reincidente).
// - DOC 05 §5.5 (painel RH — estende com nova Secao 6).
// - DOC 05 §2.1 + §2.3 (badges canonicas e semantica de cores) — a
//   linha reincidente usa `COLORS.badge.dangerBg` + `dangerText`
//   canonizados bit-a-bit ao §10.7 do DOC 03.
// - Precedente CORR1 do ME-B9-fechamento: componentes de secao do
//   PainelRHClient sao consumidos identicos por RH real
//   (`variant='rh'`) e por Super Admin em preview
//   (`variant='super_admin_preview'`), atendendo simetricamente a
//   promessa DOC 03 §10.6 pt.6.
//
// Escopo:
// - Renderiza tabela canonica com linhas dos placeholders em estado
//   `inconsistente` ou `aguardando_nova_resposta` (SSR na page.tsx).
// - Estado vazio canonico: "Nenhum Perfil Individual inconsistente
//   no momento."
// - Botao `[Liberar teste novamente]` na coluna Acao quando
//   `placeholderStatus === 'inconsistente'`.
// - Rotulo `[Aguardando nova resposta]` (nao-clicavel) quando
//   `placeholderStatus === 'aguardando_nova_resposta'`.
// - Linha vermelha canonica (§10.7) quando `tentativaAtual >= 2` E
//   `placeholderStatus === 'inconsistente'` (reincidencia).
// - Modal de confirmacao pre-acao com texto canonico literal do
//   §10.7 sobre efeito no portal do colaborador.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.
// **RV-13 canonica.** Consumido por `PainelRHClient.tsx`; props tipadas
// pelo servico canonico via `PerfilInconsistenteRow`.

import { useState, useTransition } from 'react';
import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import type { PerfilInconsistenteRow } from '../../server/services/individualProfilePlaceholders';

// -----------------------------------------------------------------------
// Contrato canonico das actions injetadas
// -----------------------------------------------------------------------

export interface PerfilInconsistenteBoxActions {
  /**
   * Server action canonica que invoca `individualProfile.releaseRetest`
   * do router tRPC (DOC 03 §10.7). Retorna `{ ok: true }` em sucesso
   * ou `{ ok: false, error }` com a mensagem canonica emitida pelo
   * proc (ex.: `MSG_RETESTE_PRECONDICAO`). O componente cliente cuida
   * do refresh visual delegando a `revalidatePath` executado dentro
   * da propria action (padrao Next 15 canonizado no repo).
   */
  liberarReteste(input: {
    companyId: number;
    userType: 'employee' | 'clevel';
    userId: number;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
}

// -----------------------------------------------------------------------
// Textos canonicos literais §10.6 + §10.7
// -----------------------------------------------------------------------

/**
 * Titulo canonico da Secao 6 §5.5 nova. Preserva rotulagem DOC 03
 * §10.6 pt.6 bit-a-bit.
 */
export const PERFIL_INCONSISTENTE_TITULO = 'Perfil Individual inconsistente';

/** Estado vazio canonico. */
export const PERFIL_INCONSISTENTE_VAZIO_TEXTO =
  'Nenhum Perfil Individual inconsistente no momento.';

/** Rotulo canonico do botao de acao — status='inconsistente'. */
export const BOTAO_LIBERAR_LABEL = 'Liberar teste novamente';

/** Rotulo canonico do estado nao-clicavel — status='aguardando_nova_resposta'. */
export const AGUARDANDO_LABEL = 'Aguardando nova resposta';

/**
 * Texto canonico literal DOC 03 §10.7 — exibido no modal de confirmacao
 * antes de disparar o release. Mantido bit-a-bit ao paragrafo canonico
 * "Efeito canonico no portal do colaborador".
 */
export const MODAL_CORPO_TEXTO =
  'Na próxima visita ao portal (ou refresh), o colaborador vê o card ' +
  '"Perfil Individual" com título e comportamento idênticos à primeira ' +
  'aparição — sem qualquer indicação visual de que se trata de um reteste. ' +
  'Sem notificação por e-mail. O RH é responsável por comunicar diretamente ' +
  'ao colaborador.';

// -----------------------------------------------------------------------
// Helpers canonicos de formatacao
// -----------------------------------------------------------------------

function formatDate(d: Date | null): string {
  if (d === null) {
    return '—';
  }
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// -----------------------------------------------------------------------
// Modal canonico de confirmacao
// -----------------------------------------------------------------------

interface ModalConfirmProps {
  readonly linha: PerfilInconsistenteRow;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly loading: boolean;
  readonly errorMessage: string | null;
}

function ModalConfirm(props: ModalConfirmProps): JSX.Element {
  const { linha, onCancel, onConfirm, loading, errorMessage } = props;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Liberar novo Perfil Individual para ${linha.userDisplayName}`}
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
            Liberar novo Perfil Individual para {linha.userDisplayName}
          </h3>
        </header>
        <div style={{ padding: '20px 24px' }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.5,
              color: COLORS.text.secondary,
            }}
          >
            {MODAL_CORPO_TEXTO}
          </p>
          {errorMessage !== null ? (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: '10px 12px',
                borderRadius: 8,
                background: COLORS.badge.dangerBg,
                color: COLORS.badge.dangerText,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {errorMessage}
            </div>
          ) : null}
        </div>
        <footer
          style={{
            padding: '16px 24px',
            borderTop: `1px solid ${COLORS.border.default}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              background: 'transparent',
              color: COLORS.text.primary,
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: COLORS.primary.navy,
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Liberando…' : 'Liberar'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------

export interface PerfilInconsistenteBoxProps {
  readonly companyId: number;
  readonly linhas: readonly PerfilInconsistenteRow[];
  readonly actions: PerfilInconsistenteBoxActions;
}

export function PerfilInconsistenteBox(props: PerfilInconsistenteBoxProps): JSX.Element {
  const { companyId, linhas, actions } = props;

  const [modalLinha, setModalLinha] = useState<PerfilInconsistenteRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpenModal = (linha: PerfilInconsistenteRow): void => {
    setErrorMessage(null);
    setModalLinha(linha);
  };

  const handleCancel = (): void => {
    if (isPending) {
      return;
    }
    setModalLinha(null);
    setErrorMessage(null);
  };

  const handleConfirm = (): void => {
    if (modalLinha === null) {
      return;
    }
    const target = modalLinha;
    startTransition(async () => {
      const result = await actions.liberarReteste({
        companyId,
        userType: target.userType,
        userId: target.userId,
      });
      if (result.ok) {
        setModalLinha(null);
        setErrorMessage(null);
        return;
      }
      setErrorMessage(result.error);
    });
  };

  if (linhas.length === 0) {
    return (
      <div
        style={{
          background: COLORS.background.card,
          border: `1px solid ${COLORS.border.default}`,
          borderRadius: 8,
          padding: '20px 24px',
          fontSize: 13,
          color: COLORS.text.tertiary,
        }}
      >
        {PERFIL_INCONSISTENTE_VAZIO_TEXTO}
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          background: COLORS.background.card,
          border: `1px solid ${COLORS.border.default}`,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            color: COLORS.text.primary,
          }}
        >
          <thead>
            <tr style={{ background: COLORS.background.elevated }}>
              <th style={thStyle}>Nome</th>
              <th style={thStyle}>Cargo</th>
              <th style={thStyle}>Última resposta</th>
              <th style={thStyleCenter}>Tentativa atual</th>
              <th style={thStyle}>Liberado em</th>
              <th style={thStyleRight}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => {
              const isReincidente =
                linha.placeholderStatus === 'inconsistente' && linha.tentativaAtual >= 2;
              const rowStyle: React.CSSProperties = isReincidente
                ? {
                    background: COLORS.badge.dangerBg,
                    color: COLORS.badge.dangerText,
                  }
                : {};
              return (
                <tr
                  key={linha.placeholderId}
                  style={{
                    ...rowStyle,
                    borderTop: `1px solid ${COLORS.border.divider}`,
                  }}
                >
                  <td style={tdStyle}>{linha.userDisplayName}</td>
                  <td style={tdStyle}>{linha.cargo}</td>
                  <td style={tdStyle}>{formatDate(linha.ultimaTentativaEnviadaEm)}</td>
                  <td style={tdStyleCenter}>{linha.tentativaAtual}</td>
                  <td style={tdStyle}>{formatDate(linha.retesteLiberadoEm)}</td>
                  <td style={tdStyleRight}>
                    {linha.placeholderStatus === 'inconsistente' ? (
                      <button
                        type="button"
                        onClick={() => handleOpenModal(linha)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: COLORS.primary.navy,
                          color: '#FFFFFF',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {BOTAO_LIBERAR_LABEL}
                      </button>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          fontStyle: 'italic',
                          color: COLORS.text.tertiary,
                        }}
                      >
                        {AGUARDANDO_LABEL}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modalLinha !== null ? (
        <ModalConfirm
          linha={modalLinha}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
          loading={isPending}
          errorMessage={errorMessage}
        />
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------
// Estilos da tabela canonica
// -----------------------------------------------------------------------

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: COLORS.text.secondary,
};

const thStyleCenter: React.CSSProperties = { ...thStyle, textAlign: 'center' };
const thStyleRight: React.CSSProperties = { ...thStyle, textAlign: 'right' };

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'middle',
};

const tdStyleCenter: React.CSSProperties = { ...tdStyle, textAlign: 'center' };
const tdStyleRight: React.CSSProperties = { ...tdStyle, textAlign: 'right' };
