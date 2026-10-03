'use client';

// ROIP APP 9BOX — componente canônico `LogoUploader` (ME-B9.2 Bloco B9,
// débito D-LOGO-UPLOAD).
//
// Origem canônica:
// - DOC 05 §13.1 Seção 1 — "Logo da empresa (imagem — opcional)".
// - DOC 02 §10.9 + §12 — Cadastro/edição de empresa exclusivo Bruno.
// - Escopo B9.2 do bloco: fallback canônico quando vazio = texto do
//   nome da empresa (aplicado no Header, não neste componente).
//
// Contrato canônico:
// - Recebe o `value` atual (data URL base64 ou URL externa ou null) +
//   `onChange(value)` para o pai (parametros/nova empresa) persistir.
// - Validação client-side canônica:
//   - MIME aceito: PNG, JPEG, WebP, SVG.
//   - Tamanho máximo: 300KB raw (~400KB após base64).
//   - Erro de validação exibido inline em vermelho; nunca lança.
// - Preview: imagem exibida em thumbnail 64x64 com `object-fit:contain`.
// - Ação de remover: botão `[Remover logo]` que chama `onChange(null)`.
// - Fallback no preview: quando `value === null`, exibe placeholder
//   neutro ("Nenhum logo definido") — o fallback canônico com NOME DA
//   EMPRESA ocorre no Header, não aqui.
//
// **RV-13.** Consumido por `ParametrosClient.tsx` (Seção 1) e por
// `NovaEmpresaClient.tsx` (cadastro inicial).
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import type { ChangeEvent, CSSProperties, JSX } from 'react';
import { useCallback, useRef, useState } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

// -----------------------------------------------------------------------
// Constantes canônicas (exportadas para RV-13 em testes)
// -----------------------------------------------------------------------

/** MIME types aceitos canonicamente §13.1 Seção 1. */
export const LOGO_ACCEPTED_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
];

/** Cap de tamanho raw em bytes (300KB — ~400KB em base64). */
export const LOGO_MAX_SIZE_BYTES = 300 * 1024;

/** Mensagem canônica literal — MIME inválido. */
export const MSG_LOGO_MIME_INVALIDO =
  'Formato de arquivo não suportado. Use PNG, JPEG, WebP ou SVG.' as const;

/** Mensagem canônica literal — tamanho acima do cap. */
export const MSG_LOGO_TAMANHO_EXCEDIDO = 'Arquivo excede o tamanho máximo de 300KB.' as const;

/** Mensagem canônica literal — erro genérico de leitura. */
export const MSG_LOGO_ERRO_LEITURA = 'Erro ao ler o arquivo. Tente novamente.' as const;

/** Label canônico do botão de upload. */
export const LABEL_UPLOAD = 'Escolher arquivo' as const;

/** Label canônico do botão remover. */
export const LABEL_REMOVER = 'Remover logo' as const;

/** Texto canônico quando sem logo definido. */
export const TEXT_SEM_LOGO = 'Nenhum logo definido.' as const;

// -----------------------------------------------------------------------
// Validação pura (exportada para teste unit — RV-13)
// -----------------------------------------------------------------------

export type ValidationResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

export function validateLogoFile(file: File): ValidationResult {
  if (!LOGO_ACCEPTED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: MSG_LOGO_MIME_INVALIDO };
  }
  if (file.size > LOGO_MAX_SIZE_BYTES) {
    return { ok: false, error: MSG_LOGO_TAMANHO_EXCEDIDO };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------
// Converte File em data URL base64 (promessa)
// -----------------------------------------------------------------------

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('leitor retornou tipo inesperado'));
      }
    };
    reader.onerror = () => reject(new Error('erro FileReader'));
    reader.readAsDataURL(file);
  });
}

// -----------------------------------------------------------------------
// Props canônicas
// -----------------------------------------------------------------------

export interface LogoUploaderProps {
  readonly value: string | null;
  readonly onChange: (next: string | null) => void;
  readonly disabled?: boolean;
}

// -----------------------------------------------------------------------
// Estilos canônicos
// -----------------------------------------------------------------------

const CONTAINER: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'flex-start',
};

const PREVIEW_WRAP: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const PREVIEW_BOX: CSSProperties = {
  width: 64,
  height: 64,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  backgroundColor: COLORS.background.card,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
};

const PREVIEW_IMG: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
};

const PREVIEW_EMPTY: CSSProperties = {
  fontSize: 10,
  color: COLORS.text.tertiary,
  textAlign: 'center',
  padding: 4,
};

const BTN_UPLOAD: CSSProperties = {
  padding: '6px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  backgroundColor: '#FFFFFF',
  color: COLORS.text.secondary,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

const BTN_REMOVER: CSSProperties = {
  padding: '6px 12px',
  border: `1px solid ${COLORS.semantic.danger}`,
  borderRadius: 6,
  backgroundColor: '#FFFFFF',
  color: COLORS.semantic.danger,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

const ERROR_STYLE: CSSProperties = {
  fontSize: 11,
  color: COLORS.semantic.danger,
  marginTop: 4,
};

const HINT_STYLE: CSSProperties = {
  fontSize: 10,
  color: COLORS.text.tertiary,
};

// -----------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------

export function LogoUploader(props: LogoUploaderProps): JSX.Element {
  const { value, onChange, disabled } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleFile = useCallback(
    async (ev: ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const file = ev.target.files?.[0];
      if (!file) {
        return;
      }
      const validation = validateLogoFile(file);
      if (!validation.ok) {
        setError(validation.error);
        if (inputRef.current) {
          inputRef.current.value = '';
        }
        return;
      }
      setLoading(true);
      try {
        const dataURL = await fileToDataURL(file);
        onChange(dataURL);
      } catch {
        setError(MSG_LOGO_ERRO_LEITURA);
      } finally {
        setLoading(false);
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
    },
    [onChange],
  );

  const handleRemover = useCallback(() => {
    setError(null);
    onChange(null);
  }, [onChange]);

  const handleChooseClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div style={CONTAINER}>
      <div style={PREVIEW_WRAP}>
        <div style={PREVIEW_BOX}>
          {value !== null && value !== '' ? (
            <img src={value} alt="Prévia do logo" style={PREVIEW_IMG} />
          ) : (
            <span style={PREVIEW_EMPTY}>{TEXT_SEM_LOGO}</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            type="button"
            style={BTN_UPLOAD}
            onClick={handleChooseClick}
            disabled={disabled === true || loading}
          >
            {loading ? 'Carregando…' : LABEL_UPLOAD}
          </button>
          {value !== null && value !== '' ? (
            <button
              type="button"
              style={BTN_REMOVER}
              onClick={handleRemover}
              disabled={disabled === true || loading}
            >
              {LABEL_REMOVER}
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPTED_MIME_TYPES.join(',')}
        onChange={handleFile}
        style={{ display: 'none' }}
        disabled={disabled === true || loading}
      />
      <div style={HINT_STYLE}>PNG, JPEG, WebP ou SVG. Máximo 300KB.</div>
      {error !== null ? <div style={ERROR_STYLE}>{error}</div> : null}
    </div>
  );
}
