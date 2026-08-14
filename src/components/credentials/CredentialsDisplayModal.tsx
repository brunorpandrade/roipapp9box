// ROIP APP 9BOX — CredentialsDisplayModal (ME-080b Dispatch 2b).
//
// Modal canonico exibido apos cadastro individual ou regeneracao de
// credencial, mostrando matricula e/ou senha inicial em plain text para o
// RH copiar e transmitir manualmente ao colaborador (S516: zero envio
// automatico por e-mail).
//
// Convencoes canonicas:
//   - Modal 'blocking' (§2.9): ESC e clique fora NAO fecham. O usuario
//     precisa clicar em "Entendi" apos ter copiado. Isso reduz risco de
//     RH fechar acidentalmente sem copiar (plain text NAO reaparece —
//     precisa regenerar).
//   - Aviso canonico no rodape: "Estas credenciais serao exibidas apenas
//     nesta tela. Copie e transmita ao colaborador pelo canal oficial
//     da empresa."
//   - Botao "Copiar" por credencial (matricula, senha) via
//     `navigator.clipboard.writeText`. Feedback visual efemero (checkmark
//     por 2s) apos copia bem-sucedida.
//   - Bloco 'senha' oculto quando `senhaInicial` e null (caso do
//     colaborador comum sem acesso ao painel).
//
// RV-13: consumidores nesta ME-080b Dispatch 2b:
//   - ColaboradorNovoClient.tsx (pos-cadastro)
//   - ColaboradorEditarClient.tsx (pos-regenerar matricula/senha ou apos
//     UPDATE que provisionou senha)
//   - CLevelNovoClient.tsx (pos-cadastro)
//   - CLevelEditarClient.tsx (pos-regenerar matricula/senha)

'use client';

import type { JSX } from 'react';
import { useState } from 'react';

import { Modal } from '../ui/Modal';

interface CredentialsDisplayModalProps {
  /** Se `true`, modal renderiza; se `false`, retorna null. */
  open: boolean;
  /**
   * Nome do titular (colaborador ou C-level) para contextualizar o
   * cabecalho. Ex.: "Credenciais de Joao Silva".
   */
  nomeTitular: string;
  /** Matricula gerada (formato AA00). Sempre presente. */
  matricula: string;
  /**
   * Senha inicial em plain text. `null` quando o titular nao recebeu
   * senha (colaborador comum sem acesso ao painel).
   */
  senhaInicial: string | null;
  /** Callback disparado quando o usuario clica em "Entendi". */
  onClose: () => void;
}

export function CredentialsDisplayModal(props: CredentialsDisplayModalProps): JSX.Element | null {
  const { open, nomeTitular, matricula, senhaInicial, onClose } = props;
  const [copiedField, setCopiedField] = useState<'matricula' | 'senha' | null>(null);

  async function handleCopy(value: string, field: 'matricula' | 'senha'): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Silencio canonico — se clipboard API falha (permissao negada em
      // iframe, por exemplo), o usuario ainda ve a credencial em plain
      // text e pode selecionar+copiar manualmente. Sem toast pra nao
      // adicionar dependencia.
    }
  }

  return (
    <Modal open={open} onClose={onClose} variant="blocking" ariaLabel="Credenciais do titular">
      <div style={{ padding: '24px 24px 20px' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: '#111827',
          }}
        >
          Credenciais de {nomeTitular}
        </h2>
        <p
          style={{
            margin: '8px 0 20px',
            fontSize: 13,
            color: '#6B7280',
            lineHeight: 1.5,
          }}
        >
          Copie e transmita estas credenciais ao colaborador pelo canal oficial da empresa (WhatsApp
          corporativo, e-mail departamental, impresso). Elas serao exibidas apenas nesta tela — se
          fechar sem copiar, sera necessario regenerar.
        </p>

        <CredentialRow
          label="Matricula (para o portal do colaborador)"
          value={matricula}
          field="matricula"
          copied={copiedField === 'matricula'}
          onCopy={handleCopy}
        />

        {senhaInicial !== null ? (
          <CredentialRow
            label="Senha inicial (para o painel — sera trocada no primeiro acesso)"
            value={senhaInicial}
            field="senha"
            copied={copiedField === 'senha'}
            onCopy={handleCopy}
          />
        ) : null}

        <div
          style={{
            marginTop: 24,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: '#14B8A6',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Entendi, ja copiei
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface CredentialRowProps {
  label: string;
  value: string;
  field: 'matricula' | 'senha';
  copied: boolean;
  onCopy: (value: string, field: 'matricula' | 'senha') => Promise<void>;
}

function CredentialRow(props: CredentialRowProps): JSX.Element {
  const { label, value, field, copied, onCopy } = props;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: '#374151',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            flex: 1,
            padding: '10px 14px',
            background: '#F3F4F6',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            fontSize: 18,
            fontWeight: 600,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            color: '#111827',
            letterSpacing: '0.05em',
          }}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={() => void onCopy(value, field)}
          style={{
            padding: '0 16px',
            background: copied ? '#10B981' : '#FFFFFF',
            color: copied ? '#FFFFFF' : '#111827',
            border: '1px solid ' + (copied ? '#10B981' : '#D1D5DB'),
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            minWidth: 92,
            transition: 'background 150ms, color 150ms, border-color 150ms',
          }}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
