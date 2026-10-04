'use client';

// ROIP APP 9BOX — modal canonico `FotosEmMassaModal` (ME-B9.3 Fase B).
//
// Upload em massa de fotos de colaboradores pelo RH no
// `/todos-os-colaboradores`. Padrao visual canonico bit-a-bit alinhado
// ao `ImportarPlanilhaModal` (ME-fila5): overlay escuro, container
// 80vw/max 760px/max-h 90vh, header navy + [X], body com 2 blocos
// canonicos (Instrucoes + Area drag-drop), rodape [Cancelar] +
// [Confirmar e enviar N fotos] primary teal.
//
// Fluxo canonico:
// 1. RH seleciona ate 100 imagens (PNG/JPEG/WebP/SVG, 300KB cada).
// 2. Matching por CPF embutido no nome do arquivo:
//    - `12345678900.png` ou `123.456.789-00.png` -> normaliza para 11
//      digitos.
//    - Nome sem CPF valido vira "nao matcheado".
// 3. Preview da fase de validacao: lista "N arquivos matcheados" vs
//    "M arquivos nao matcheados" (com os nomes dos arquivos).
// 4. Click em [Confirmar] -> leitura base64 + envio em lote via
//    `uploadFotosEmMassaAction`. Toast canonico ao final.
//
// Validacao bit-exact ao `ImageUploader` (ME-B9.3 Fase A):
// - MIME aceito: PNG, JPEG, WebP, SVG.
// - Tamanho max: 300KB por arquivo (raw, antes de base64).
// - Erro por arquivo exibido inline; o RH decide prosseguir com os
//   validos.
//
// **RV-13.** Consumido por `TodosColaboradoresClient.tsx` (variante
// padrao, super_admin e RH).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { ChangeEvent, CSSProperties, DragEvent, JSX } from 'react';
import { useCallback, useRef, useState } from 'react';

import {
  IMAGE_ACCEPTED_MIME_TYPES,
  IMAGE_MAX_SIZE_BYTES,
  MSG_IMAGE_MIME_INVALIDO,
  MSG_IMAGE_TAMANHO_EXCEDIDO,
} from '../forms/ImageUploader';
import { COLORS } from '../../lib/design-tokens/colors';

// -----------------------------------------------------------------------
// Tipos publicos canonicos
// -----------------------------------------------------------------------

/** Resultado canonico do upload em massa (espelha `UpdatePhotosBulkResult`). */
export interface FotosEmMassaResult {
  readonly ok: boolean;
  readonly matched: number;
  readonly notFound: number;
  readonly cpfsNotFound: readonly string[];
}

/** Payload canonico por item (CPF + base64). */
export interface FotoItemPayload {
  readonly cpf: string;
  readonly photoUrl: string;
}

/** Props canonicas do modal. */
export interface FotosEmMassaModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onUpload: (items: readonly FotoItemPayload[]) => Promise<FotosEmMassaResult>;
}

// -----------------------------------------------------------------------
// Helpers canonicos puros (exportados para RV-13 em testes)
// -----------------------------------------------------------------------

/** Extrai CPF (11 digitos) do nome do arquivo. Null quando invalido. */
export function extractCpfFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, '');
  const digits = base.replace(/\D/g, '');
  if (digits.length !== 11) {
    return null;
  }
  return digits;
}

/** Valida um File canonicamente — mesma logica do `ImageUploader`. */
export function validateFotoFile(file: File):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  if (!IMAGE_ACCEPTED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: MSG_IMAGE_MIME_INVALIDO };
  }
  if (file.size > IMAGE_MAX_SIZE_BYTES) {
    return { ok: false, error: MSG_IMAGE_TAMANHO_EXCEDIDO };
  }
  return { ok: true };
}

/** Converte File em data URL base64 (promessa canonica). */
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
// Constantes canonicas (RV-13)
// -----------------------------------------------------------------------

/** Cap canonico de arquivos por envio (bate com Zod no router). */
export const MAX_FOTOS_PER_UPLOAD = 100;

/** Mensagem canonica — cap de arquivos excedido. */
export const MSG_CAP_EXCEDIDO =
  'Maximo de 100 arquivos por envio. Divida em lotes menores.' as const;

/** Mensagem canonica — CPF nao detectado no nome do arquivo. */
export const MSG_CPF_INVALIDO =
  'Nome do arquivo deve conter o CPF do colaborador (ex.: 12345678900.png).' as const;

// -----------------------------------------------------------------------
// Estilos canonicos (padrao bit-exact ao ImportarPlanilhaModal)
// -----------------------------------------------------------------------

const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 400,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const BOX_STYLE: CSSProperties = {
  width: '80vw',
  maxWidth: 760,
  maxHeight: '90vh',
  background: COLORS.background.card,
  borderRadius: 14,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const HEADER_STYLE: CSSProperties = {
  background: COLORS.primary.navy,
  color: '#FFFFFF',
  padding: '14px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const BODY_STYLE: CSSProperties = {
  padding: 20,
  overflowY: 'auto',
  flex: 1,
};

const FOOTER_STYLE: CSSProperties = {
  padding: '16px 20px',
  borderTop: `1px solid ${COLORS.border.divider}`,
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
};

const DROP_STYLE: CSSProperties = {
  border: `2px dashed ${COLORS.border.default}`,
  borderRadius: 10,
  padding: 32,
  textAlign: 'center',
  color: COLORS.text.secondary,
  cursor: 'pointer',
  background: COLORS.background.elevated,
};

const BTN_PRIMARY: CSSProperties = {
  padding: '10px 20px',
  background: COLORS.accent.teal,
  color: '#FFFFFF',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const BTN_OUTLINE: CSSProperties = {
  padding: '10px 20px',
  background: 'transparent',
  color: COLORS.text.secondary,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

const INSTR_BLOCK: CSSProperties = {
  background: COLORS.background.page,
  border: `1px solid ${COLORS.border.divider}`,
  borderRadius: 10,
  padding: 14,
  marginBottom: 16,
  fontSize: 13,
  color: COLORS.text.secondary,
  lineHeight: 1.5,
};

// -----------------------------------------------------------------------
// Tipos locais do estado
// -----------------------------------------------------------------------

interface MatchedFile {
  readonly file: File;
  readonly filename: string;
  readonly cpf: string;
}

interface UnmatchedFile {
  readonly filename: string;
  readonly reason: string;
}

// -----------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------

export function FotosEmMassaModal(props: FotosEmMassaModalProps): JSX.Element | null {
  const { open, onClose, onUpload } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [matched, setMatched] = useState<readonly MatchedFile[]>([]);
  const [unmatched, setUnmatched] = useState<readonly UnmatchedFile[]>([]);
  const [sending, setSending] = useState<boolean>(false);
  const [resultBanner, setResultBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setMatched([]);
    setUnmatched([]);
    setSending(false);
    setResultBanner(null);
    setErrorBanner(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const processFiles = useCallback((filesList: FileList | File[]) => {
    const arr = Array.from(filesList);
    if (arr.length > MAX_FOTOS_PER_UPLOAD) {
      setErrorBanner(MSG_CAP_EXCEDIDO);
      return;
    }
    setErrorBanner(null);
    setResultBanner(null);
    const okMatched: MatchedFile[] = [];
    const okUnmatched: UnmatchedFile[] = [];
    for (const f of arr) {
      const validation = validateFotoFile(f);
      if (!validation.ok) {
        okUnmatched.push({ filename: f.name, reason: validation.error });
        continue;
      }
      const cpf = extractCpfFromFilename(f.name);
      if (cpf === null) {
        okUnmatched.push({ filename: f.name, reason: MSG_CPF_INVALIDO });
        continue;
      }
      okMatched.push({ file: f, filename: f.name, cpf });
    }
    setMatched(okMatched);
    setUnmatched(okUnmatched);
  }, []);

  const handleInputChange = useCallback(
    (ev: ChangeEvent<HTMLInputElement>) => {
      if (ev.target.files !== null) {
        processFiles(ev.target.files);
      }
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [processFiles],
  );

  const handleDrop = useCallback(
    (ev: DragEvent<HTMLDivElement>) => {
      ev.preventDefault();
      if (ev.dataTransfer.files.length > 0) {
        processFiles(ev.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleDragOver = useCallback((ev: DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
  }, []);

  const handleChooseClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleConfirm = useCallback(async () => {
    if (matched.length === 0) {
      return;
    }
    setSending(true);
    setErrorBanner(null);
    try {
      const payload: FotoItemPayload[] = [];
      for (const m of matched) {
        const dataURL = await fileToDataURL(m.file);
        payload.push({ cpf: m.cpf, photoUrl: dataURL });
      }
      const result = await onUpload(payload);
      if (result.ok || result.matched > 0) {
        const parts: string[] = [`${result.matched} foto(s) atualizada(s)`];
        if (result.notFound > 0) {
          parts.push(`${result.notFound} CPF(s) nao encontrado(s) na empresa`);
        }
        setResultBanner(parts.join('. ') + '.');
        setMatched([]);
      } else {
        setErrorBanner('Nenhuma foto foi atualizada. Verifique os CPFs e tente novamente.');
      }
    } catch {
      setErrorBanner('Falha de rede ao enviar as fotos. Tente novamente.');
    } finally {
      setSending(false);
    }
  }, [matched, onUpload]);

  if (!open) {
    return null;
  }

  return (
    <div
      style={OVERLAY_STYLE}
      role="dialog"
      aria-modal="true"
      aria-label="Fotos em massa"
      onClick={handleClose}
    >
      <div style={BOX_STYLE} onClick={(e) => e.stopPropagation()}>
        <div style={HEADER_STYLE}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Fotos em massa</span>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar fotos em massa"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        <div style={BODY_STYLE}>
          <div style={INSTR_BLOCK}>
            <strong>Como enviar:</strong>
            <ol style={{ paddingLeft: 20, marginTop: 8, marginBottom: 0 }}>
              <li>
                Nomeie cada arquivo com o CPF do colaborador (ex.: <code>12345678900.png</code>
                {' ou '}
                <code>123.456.789-00.png</code>).
              </li>
              <li>
                Formatos aceitos: PNG, JPEG, WebP, SVG. Tamanho maximo por arquivo:{' '}
                <strong>300KB</strong>.
              </li>
              <li>
                Maximo de <strong>100 arquivos</strong> por envio. Arquivos com nome invalido ou CPF
                inexistente na empresa sao listados como nao matcheados.
              </li>
            </ol>
          </div>
          <div
            style={DROP_STYLE}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={handleChooseClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleChooseClick();
              }
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text.primary }}>
              Arraste as fotos aqui ou clique para selecionar
            </div>
            <div style={{ fontSize: 12, color: COLORS.text.tertiary, marginTop: 6 }}>
              Nome do arquivo = CPF do colaborador
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={IMAGE_ACCEPTED_MIME_TYPES.join(',')}
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />
          {errorBanner !== null ? (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: 12,
                background: COLORS.badge.warningBg,
                color: COLORS.semantic.danger,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {errorBanner}
            </div>
          ) : null}
          {resultBanner !== null ? (
            <div
              role="status"
              style={{
                marginTop: 16,
                padding: 12,
                background: COLORS.badge.successBg,
                color: COLORS.semantic.success,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {resultBanner}
            </div>
          ) : null}
          {matched.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.text.primary,
                  marginBottom: 6,
                }}
              >
                {matched.length} arquivo(s) prontos para envio:
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  fontSize: 12,
                  color: COLORS.text.secondary,
                  maxHeight: 160,
                  overflowY: 'auto',
                }}
              >
                {matched.map((m, i) => (
                  <li key={`m-${i}`}>
                    {m.filename} → CPF {m.cpf}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {unmatched.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.semantic.danger,
                  marginBottom: 6,
                }}
              >
                {unmatched.length} arquivo(s) nao matcheados:
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  fontSize: 12,
                  color: COLORS.semantic.danger,
                  maxHeight: 160,
                  overflowY: 'auto',
                }}
              >
                {unmatched.map((u, i) => (
                  <li key={`u-${i}`}>
                    {u.filename} — {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div style={FOOTER_STYLE}>
          <button type="button" onClick={handleClose} style={BTN_OUTLINE} disabled={sending}>
            Fechar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              ...BTN_PRIMARY,
              opacity: matched.length === 0 || sending ? 0.5 : 1,
              cursor: matched.length === 0 || sending ? 'not-allowed' : 'pointer',
            }}
            disabled={matched.length === 0 || sending}
          >
            {sending
              ? 'Enviando…'
              : matched.length > 0
                ? `Confirmar e enviar ${matched.length} foto(s)`
                : 'Confirmar e enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
