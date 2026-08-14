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

const COPY: Record<'matricula' | 'senha', { titulo: string; corpo: string; botao: string }> = {
  matricula: {
    titulo: 'Regerar matricula?',
    corpo:
      'A matricula atual deixara de funcionar imediatamente. O colaborador nao conseguira ' +
      'acessar o portal com ela apos a confirmacao. A nova matricula sera exibida uma unica ' +
      'vez na proxima tela para voce copiar.',
    botao: 'Regerar matricula',
  },
  senha: {
    titulo: 'Regerar senha inicial?',
    corpo:
      'A senha atual deixara de funcionar imediatamente. O colaborador precisara usar a nova ' +
      'senha inicial no proximo acesso ao painel e sera obrigado a troca-la. A nova senha sera ' +
      'exibida uma unica vez na proxima tela para voce copiar.',
    botao: 'Regerar senha',
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
