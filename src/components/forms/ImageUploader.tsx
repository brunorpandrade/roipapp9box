'use client';

// ROIP APP 9BOX — componente canônico `ImageUploader` (ME-B9.3 Bloco B9).
//
// Generalização canônica do antigo `LogoUploader` (ME-B9.2, D-LOGO-UPLOAD).
// Em B9.3 o mesmo widget é consumido também pelo upload da foto do
// colaborador (employees.photoUrl) e do C-level (cLevelMembers.photoUrl),
// sem duplicação (L125/RV-14: componente reutilizado é extraído na mesma
// ME, com refactor dos callsites originais).
//
// Origem canônica:
// - DOC 05 §13.1 Seção 1 — "Logo da empresa (imagem — opcional)".
// - DOC 02 §12 — Cadastro/edição de empresa exclusivo Bruno.
// - Road map B9.2 — fallback canônico do logo quando vazio = texto do nome
//   da empresa (aplicado no Header, não neste componente).
// - Road map B9.3 — upload de foto do colaborador pelo RH; duas
//   modalidades (individual + massa, esta última em Fase B); fallback
//   quando vazio = avatar de iniciais já canônico em `Avatar.tsx`.
//
// Contrato canônico:
// - Recebe o `value` atual (data URL base64 ou URL externa ou null) +
//   `onChange(value)` para o pai persistir.
// - Validação client-side canônica:
//   - MIME aceito: PNG, JPEG, WebP, SVG (`IMAGE_ACCEPTED_MIME_TYPES`).
//   - Tamanho máximo: 300KB raw (~400KB após base64) (`IMAGE_MAX_SIZE_BYTES`).
//   - Erro de validação exibido inline em vermelho; nunca lança.
// - Preview configurável via `previewVariant`:
//   - 'box'   — thumbnail quadrada (default 64x64, borda arredondada 8px).
//   - 'circle' — avatar redondo (default 72x72, borda full-circle).
// - Ação de remover: botão parametrizável via `labelRemover` que chama
//   `onChange(null)`.
// - Fallback no preview: quando `value === null | ''`, exibe placeholder
//   textual (`textoVazio`). O fallback de domínio (texto do nome da
//   empresa no Header, avatar de iniciais no card) é responsabilidade do
//   consumidor, nunca deste componente.
//
// Props opcionais com defaults canônicos:
// - `labelRemover`     default 'Remover'.
// - `textoVazio`       default 'Nenhuma imagem definida.'.
// - `hintText`         default 'PNG, JPEG, WebP ou SVG. Máximo 300KB.'.
// - `previewVariant`   default 'box'.
// - `previewSize`      default 64 (quando variant='box') ou 72 (circle).
//
// **RV-13.** Consumido por `ParametrosClient.tsx`, `NovaEmpresaClient.tsx`
// (B9.2 — logo da empresa), `ColaboradorForm.tsx` e `CLevelForm.tsx`
// (B9.3 — foto do colaborador e do C-level).
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import type { ChangeEvent, CSSProperties, JSX } from 'react';
import { useCallback, useRef, useState } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

// -----------------------------------------------------------------------
// Constantes canônicas (exportadas para RV-13 em testes)
// -----------------------------------------------------------------------

/** MIME types aceitos canonicamente §13.1 Seção 1 + B9.3. */
export const IMAGE_ACCEPTED_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
];

/** Cap de tamanho raw em bytes (300KB — ~400KB em base64). */
export const IMAGE_MAX_SIZE_BYTES = 300 * 1024;

/** Mensagem canônica literal — MIME inválido. */
export const MSG_IMAGE_MIME_INVALIDO =
  'Formato de arquivo não suportado. Use PNG, JPEG, WebP ou SVG.' as const;

/** Mensagem canônica literal — tamanho acima do cap. */
export const MSG_IMAGE_TAMANHO_EXCEDIDO = 'Arquivo excede o tamanho máximo de 300KB.' as const;

/** Mensagem canônica literal — erro genérico de leitura. */
export const MSG_IMAGE_ERRO_LEITURA = 'Erro ao ler o arquivo. Tente novamente.' as const;

/** Label canônico do botão de upload. */
export const LABEL_UPLOAD = 'Escolher arquivo' as const;

/** Label default canônico do botão remover (genérico). */
export const LABEL_REMOVER_DEFAULT = 'Remover' as const;

/** Texto default canônico quando sem imagem (genérico). */
export const TEXT_SEM_IMAGEM_DEFAULT = 'Nenhuma imagem definida.' as const;

/** Hint default canônico. */
export const HINT_DEFAULT = 'PNG, JPEG, WebP ou SVG. Máximo 300KB.' as const;

// -----------------------------------------------------------------------
// Validação pura (exportada para teste unit — RV-13)
// -----------------------------------------------------------------------

export type ValidationResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

export function validateImageFile(file: File): ValidationResult {
  if (!IMAGE_ACCEPTED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: MSG_IMAGE_MIME_INVALIDO };
  }
  if (file.size > IMAGE_MAX_SIZE_BYTES) {
    return { ok: false, error: MSG_IMAGE_TAMANHO_EXCEDIDO };
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

export type ImagePreviewVariant = 'box' | 'circle';

export interface ImageUploaderProps {
  readonly value: string | null;
  readonly onChange: (next: string | null) => void;
  readonly disabled?: boolean;
  readonly labelRemover?: string;
  readonly textoVazio?: string;
  readonly hintText?: string;
  readonly previewVariant?: ImagePreviewVariant;
  readonly previewSize?: number;
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

function previewBoxStyle(variant: ImagePreviewVariant, size: number): CSSProperties {
  const base: CSSProperties = {
    width: size,
    height: size,
    border: `1px solid ${COLORS.border.default}`,
    backgroundColor: COLORS.background.card,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };
  if (variant === 'circle') {
    return { ...base, borderRadius: '50%' };
  }
  return { ...base, borderRadius: 8 };
}

// -----------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------

export function ImageUploader(props: ImageUploaderProps): JSX.Element {
  const {
    value,
    onChange,
    disabled,
    labelRemover = LABEL_REMOVER_DEFAULT,
    textoVazio = TEXT_SEM_IMAGEM_DEFAULT,
    hintText = HINT_DEFAULT,
    previewVariant = 'box',
    previewSize,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const effectiveSize = previewSize ?? (previewVariant === 'circle' ? 72 : 64);
  const previewBox = previewBoxStyle(previewVariant, effectiveSize);

  const handleFile = useCallback(
    async (ev: ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const file = ev.target.files?.[0];
      if (!file) {
        return;
      }
      const validation = validateImageFile(file);
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
        setError(MSG_IMAGE_ERRO_LEITURA);
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
        <div style={previewBox}>
          {value !== null && value !== '' ? (
            <img src={value} alt="Prévia da imagem" style={PREVIEW_IMG} />
          ) : (
            <span style={PREVIEW_EMPTY}>{textoVazio}</span>
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
              {labelRemover}
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPTED_MIME_TYPES.join(',')}
        onChange={handleFile}
        style={{ display: 'none' }}
        disabled={disabled === true || loading}
      />
      <div style={HINT_STYLE}>{hintText}</div>
      {error !== null ? <div style={ERROR_STYLE}>{error}</div> : null}
    </div>
  );
}
