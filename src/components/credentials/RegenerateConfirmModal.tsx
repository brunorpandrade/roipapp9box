// ROIP APP 9BOX — RegenerateConfirmModal (ME-080b Dispatch 2c).
//
// Modal 'confirmation' canonico (§2.9) exibido quando o RH clica em
// "Regenerar" (matricula ou senha) no cadastro individual. Objetivo:
// evitar clique acidental — a matricula/senha atual deixa de funcionar
// imediatamente apos a confirmacao.
//
// Convencoes canonicas:
//   - Variante 'confirmation' (§2.9): 420px, ESC=Cancelar, clique
//     fora=Cancelar. Ordem canonica dos botoes: [Cancelar] a esquerda,
//     acao destrutiva a direita.
//   - Botao de confirmacao em vermelho (acao destrutiva canonica).
//   - Estado `loading` desabilita ambos os botoes durante a chamada
//     async ao backend (evita duplo-clique gerar 2 credenciais).
//
// RV-13: consumidores nesta ME-080b Dispatch 2c:
//   - ColaboradorEditarClient.tsx (regenerar matricula/senha)
//   - CLevelEditarClient.tsx (regenerar matricula/senha)

'use client';

import type { JSX } from 'react';

import { Modal } from '../ui/Modal';

interface RegenerateConfirmModalProps {
  open: boolean;
  kind: 'matricula' | 'senha';
  nomeTitular: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// ME-B11.1c (EC6): typo canonico sistemico "Regerar" (sem N) ->
// "Regenerar" (com N). Aplicado tambem acentuacao canonica em
// "matrícula" (acento + ortografia PT-BR). Alinhamento bit-exact com
// o verbo que ja aparece nos botoes de linha do
// `ColaboradorEditarClient.tsx` e `CLevelEditarClient.tsx` — eliminada
// a dissonancia visual entre botao e titulo do modal (uso previo:
// botao de linha ja dizia "Regenerar matricula", mas o modal dizia
// "Regerar matricula").
const COPY: Record<'matricula' | 'senha', { titulo: string; corpo: string; botao: string }> = {
  matricula: {
    titulo: 'Regenerar matrícula?',
    corpo:
      'A matrícula atual deixará de funcionar imediatamente. O colaborador não conseguirá ' +
      'acessar o portal com ela após a confirmação. A nova matrícula será exibida uma única ' +
      'vez na próxima tela para você copiar.',
    botao: 'Regenerar matrícula',
  },
  senha: {
    titulo: 'Regenerar senha inicial?',
    corpo:
      'A senha atual deixará de funcionar imediatamente. O colaborador precisará usar a nova ' +
      'senha inicial no próximo acesso ao painel e será obrigado a trocá-la. A nova senha será ' +
      'exibida uma única vez na próxima tela para você copiar.',
    botao: 'Regenerar senha',
  },
};

export function RegenerateConfirmModal(props: RegenerateConfirmModalProps): JSX.Element | null {
  const { open, kind, nomeTitular, loading, onConfirm, onCancel } = props;
  const copy = COPY[kind];

  return (
    <Modal open={open} onClose={onCancel} variant="confirmation" ariaLabel={copy.titulo}>
      <div style={{ padding: '20px 24px 16px' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>
          {copy.titulo}
        </h2>
        <p
          style={{
            margin: '10px 0 20px',
            fontSize: 13,
            color: '#374151',
            lineHeight: 1.55,
          }}
        >
          {copy.corpo} <br />
          <br />
          <strong>Titular:</strong> {nomeTitular}
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '9px 18px',
              background: '#FFFFFF',
              color: loading ? '#9CA3AF' : '#111827',
              border: '1px solid #D1D5DB',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '9px 18px',
              background: loading ? '#FCA5A5' : '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Processando...' : copy.botao}
          </button>
        </div>
      </div>
    </Modal>
  );
}
