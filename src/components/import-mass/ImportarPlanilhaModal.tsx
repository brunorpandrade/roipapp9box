// ROIP APP 9BOX — modal canonico de importacao em massa (ME-fila5
// Dispatch 2, Item 5.5). Referencia canonica visual §14 CAMADA_UI
// linhas 2194-2198 + `o1b_v1.html:462-478` (padrao modal-overlay do
// repo). Componente compartilhado L125 com prop `variant` — nesta ME
// implementa apenas `employees`; variantes `monthly-rh` e `monthly-
// leader` sao referenciadas no tipo mas rejeitadas com throw ("nao
// implementado nesta ME") — sao entregues no Dispatch 3.
//
// Padrao visual canonico bit-a-bit:
// - Overlay: `roip-modal-overlay` (globals.css:241) — position fixed +
//   backdrop rgba(0,0,0,0.5) + z-index 400.
// - Container: fundo branco, borda arredondada 14px, 80vw/max 760px,
//   max-height 90vh, flexbox column com body scrollavel.
// - Header navy titulo + botao [X] a direita.
// - Body: 2 blocos canonicos §14 linha 2194-2198 (Baixe o modelo +
//   Envie a planilha).
// - Rodape: [Cancelar] outline + [Enviar planilha] primary teal.
//
// **RV-13.** Consumido por `TodosColaboradoresClient.tsx` (variante
// `employees`).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.
//
// **RV-17.** Callbacks (`onDownloadTemplate`, `onUpload`, `onSuccess`)
// sao Client Actions passadas de callsites Client Component — nao
// atravessam a barreira Server → Client (o modal e um Client Component,
// nao recebe funcoes de Server Component).

'use client';

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import { COLUNAS_CANONICAS_EMPLOYEES } from '../../lib/shared/employees-columns';
import { triggerXlsxDownload } from './downloadXlsxBase64';
import { validateXlsxHeader, type HeaderValidationResult } from './parseXlsxHeader';

// ============================================================
// Tipos publicos canonicos
// ============================================================

/** Variantes canonicas do modal. */
export type ImportarPlanilhaVariant = 'employees' | 'monthly-rh' | 'monthly-leader';

/** Erro de linha canonico (espelha `LinhaErro` do backend). */
export interface LinhaErroDisplay {
  readonly linha: number;
  readonly coluna: string;
  readonly mensagem: string;
}

/** Resultado canonico do upload (espelha `UploadCSVResult`). */
export interface UploadResultDisplay {
  readonly ok: boolean;
  readonly linhasProcessadas: number;
  readonly linhasSucesso: number;
  readonly linhasErro: number;
  readonly erros: readonly LinhaErroDisplay[];
  /** ME-080b Dispatch 4 — credenciais iniciais dos colaboradores cadastrados. */
  readonly credenciaisXlsxBase64?: string;
}

/** Retorno canonico do download de template. */
export interface TemplateDownloadResult {
  readonly filename: string;
  readonly xlsxBase64: string;
}

/** Props canonicas do modal. */
export interface ImportarPlanilhaModalProps {
  /** Variante — decide labels + cabecalho canonico esperado. */
  readonly variant: ImportarPlanilhaVariant;
  /** Modal aberto ou fechado. Controlado pelo pai. */
  readonly open: boolean;
  /** Handler canonico do fechamento (X, Cancelar, ESC). */
  readonly onClose: () => void;
  /** Handler canonico da acao "Baixar planilha modelo (.xlsx)". */
  readonly onDownloadTemplate: () => Promise<TemplateDownloadResult>;
  /** Handler canonico do upload — recebe File, retorna resultado. */
  readonly onUpload: (file: File) => Promise<UploadResultDisplay>;
  /** Handler chamado apos fechamento com sucesso — dispara refetch. */
  readonly onSuccess: () => void;
}

// ============================================================
// Labels canonicos por variante
// ============================================================

interface VariantLabels {
  readonly title: string;
  readonly bloco1Text: string;
  readonly bloco2Text: string;
  readonly expectedHeader: readonly string[];
}

function resolveVariantLabels(variant: ImportarPlanilhaVariant): VariantLabels {
  switch (variant) {
    case 'employees':
      return {
        title: 'Importar colaboradores em massa',
        bloco1Text:
          'Baixe a planilha modelo (.xlsx) canonica com as 14 colunas ' +
          'exatas exigidas pelo sistema. Preencha uma linha por ' +
          'colaborador; nao altere os cabecalhos.',
        bloco2Text:
          'Arraste sua planilha preenchida ou clique para selecionar. ' +
          'O sistema valida os cabecalhos antes do envio; CPFs ja ' +
          'existentes na empresa serao ignorados com registro no ' +
          'relatorio pos-upload.',
        expectedHeader: COLUNAS_CANONICAS_EMPLOYEES,
      };
    case 'monthly-rh':
    case 'monthly-leader':
      throw new Error(
        `ImportarPlanilhaModal: variante "${variant}" reservada para o ` +
          'Dispatch 3 da ME-fila5 (Item 5.6 — planilhas de dados ' +
          'mensais). Nao implementada nesta ME.',
      );
  }
}

// ============================================================
// Estilos inline (padrao do repo — nao usa CSS modules)
// ============================================================

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  zIndex: 400,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '40px 20px',
  overflowY: 'auto',
};

const CONTAINER_STYLE: React.CSSProperties = {
  background: COLORS.background.card,
  borderRadius: 14,
  width: '80vw',
  maxWidth: 720,
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
};

const HEADER_STYLE: React.CSSProperties = {
  background: COLORS.primary.navy,
  color: '#FFFFFF',
  padding: '16px 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 16,
  fontWeight: 600,
};

const CLOSE_BTN_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#FFFFFF',
  fontSize: 20,
  cursor: 'pointer',
  padding: 4,
  lineHeight: 1,
};

const BODY_STYLE: React.CSSProperties = {
  padding: 24,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const BLOCO_STYLE: React.CSSProperties = {
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const BLOCO_TITLE_STYLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: COLORS.text.primary,
  margin: 0,
};

const BLOCO_TEXT_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: COLORS.text.secondary,
  margin: 0,
  lineHeight: 1.5,
};

const BTN_OUTLINE_STYLE: React.CSSProperties = {
  padding: '10px 18px',
  fontSize: 13,
  fontWeight: 500,
  border: `1px solid ${COLORS.primary.navy}`,
  borderRadius: 6,
  background: COLORS.background.card,
  color: COLORS.primary.navy,
  cursor: 'pointer',
  textAlign: 'center',
  alignSelf: 'flex-start',
};

const BTN_PRIMARY_STYLE: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 500,
  border: 'none',
  borderRadius: 6,
  background: COLORS.accent.teal,
  color: '#FFFFFF',
  cursor: 'pointer',
};

const BTN_PRIMARY_DISABLED_STYLE: React.CSSProperties = {
  ...BTN_PRIMARY_STYLE,
  background: COLORS.text.quaternary,
  cursor: 'not-allowed',
};

const DROP_ZONE_STYLE: React.CSSProperties = {
  border: `2px dashed ${COLORS.border.default}`,
  borderRadius: 8,
  padding: 24,
  textAlign: 'center',
  color: COLORS.text.tertiary,
  fontSize: 13,
  cursor: 'pointer',
};

const DROP_ZONE_ACTIVE_STYLE: React.CSSProperties = {
  ...DROP_ZONE_STYLE,
  borderColor: COLORS.accent.teal,
  background: COLORS.background.elevated,
};

const ERROR_MSG_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: COLORS.semantic.danger,
  margin: '4px 0 0 0',
};

const FOOTER_STYLE: React.CSSProperties = {
  padding: '16px 24px',
  borderTop: `1px solid ${COLORS.border.default}`,
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
};

const RESULT_BOX_STYLE: React.CSSProperties = {
  padding: 16,
  borderRadius: 8,
  fontSize: 13,
};

const RESULT_OK_STYLE: React.CSSProperties = {
  ...RESULT_BOX_STYLE,
  background: COLORS.badge.successBg,
  color: COLORS.badge.successTextAlt,
};

const RESULT_ERROR_STYLE: React.CSSProperties = {
  ...RESULT_BOX_STYLE,
  background: COLORS.badge.dangerBg,
  color: COLORS.badge.dangerText,
};

const ERROR_LIST_STYLE: React.CSSProperties = {
  maxHeight: 200,
  overflowY: 'auto',
  marginTop: 8,
  padding: 0,
  listStyle: 'none',
  fontSize: 12,
};

const ERROR_ITEM_STYLE: React.CSSProperties = {
  padding: '4px 0',
  borderBottom: `1px solid ${COLORS.border.divider}`,
};

// ============================================================
// Componente canonico
// ============================================================

type Phase = 'idle' | 'validating' | 'uploading' | 'result';

export function ImportarPlanilhaModal(props: ImportarPlanilhaModalProps): JSX.Element | null {
  const labels = resolveVariantLabels(props.variant);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [uploadResult, setUploadResult] = useState<UploadResultDisplay | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fecha modal ao pressionar ESC. Handler canonico.
  useEffect(() => {
    if (!props.open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        props.onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props]);

  // Reset ao abrir.
  useEffect(() => {
    if (props.open) {
      setSelectedFile(null);
      setHeaderError(null);
      setPhase('idle');
      setUploadResult(null);
      setUploadError(null);
      setDropActive(false);
    }
  }, [props.open]);

  const handleFilePicked = useCallback(
    async (file: File): Promise<void> => {
      // Valida extensao canonica bit-a-bit ao DOC 05 §14 linha 2197
      // ("Aceita apenas .xlsx").
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        setSelectedFile(null);
        setHeaderError('Aceito apenas arquivo .xlsx.');
        return;
      }
      setSelectedFile(file);
      setPhase('validating');
      const result: HeaderValidationResult = await validateXlsxHeader(file, labels.expectedHeader);
      if (result.ok) {
        setHeaderError(null);
      } else {
        setHeaderError(result.canonicalMessage);
      }
      setPhase('idle');
    },
    [labels.expectedHeader],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      if (file) {
        void handleFilePicked(file);
      }
    },
    [handleFilePicked],
  );

  const handleDropZoneClick = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDropActive(true);
  }, []);

  const handleDragLeave = useCallback((): void => {
    setDropActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      setDropActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        void handleFilePicked(file);
      }
    },
    [handleFilePicked],
  );

  const handleDownloadTemplate = useCallback(async (): Promise<void> => {
    try {
      const result = await props.onDownloadTemplate();
      triggerXlsxDownload(result.xlsxBase64, result.filename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao gerar planilha modelo.';
      setUploadError(msg);
    }
  }, [props]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (selectedFile === null || headerError !== null) return;
    setPhase('uploading');
    setUploadError(null);
    try {
      const result = await props.onUpload(selectedFile);
      setUploadResult(result);
      setPhase('result');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar planilha.';
      setUploadError(msg);
      setPhase('idle');
    }
  }, [selectedFile, headerError, props]);

  const handleDownloadCredenciais = useCallback((): void => {
    if (uploadResult?.credenciaisXlsxBase64 !== undefined) {
      triggerXlsxDownload(
        uploadResult.credenciaisXlsxBase64,
        `credenciais_iniciais_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    }
  }, [uploadResult]);

  const handleClose = useCallback((): void => {
    if (phase === 'uploading') return;
    if (phase === 'result') {
      props.onSuccess();
    }
    props.onClose();
  }, [phase, props]);

  if (!props.open) return null;

  const canSubmit = selectedFile !== null && headerError === null && phase === 'idle';

  return (
    <div
      style={OVERLAY_STYLE}
      role="dialog"
      aria-modal="true"
      aria-labelledby="importar-modal-title"
    >
      <div style={CONTAINER_STYLE}>
        {/* Header */}
        <div style={HEADER_STYLE}>
          <span id="importar-modal-title">{labels.title}</span>
          <button
            type="button"
            onClick={handleClose}
            style={CLOSE_BTN_STYLE}
            aria-label="Fechar modal"
            disabled={phase === 'uploading'}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={BODY_STYLE}>
          {phase !== 'result' && (
            <>
              {/* Bloco 1 — Baixe o modelo */}
              <div style={BLOCO_STYLE}>
                <p style={BLOCO_TITLE_STYLE}>Baixe o modelo</p>
                <p style={BLOCO_TEXT_STYLE}>{labels.bloco1Text}</p>
                <button
                  type="button"
                  onClick={() => void handleDownloadTemplate()}
                  style={BTN_OUTLINE_STYLE}
                >
                  📄 Baixar planilha modelo (.xlsx)
                </button>
              </div>

              {/* Bloco 2 — Envie a planilha preenchida */}
              <div style={BLOCO_STYLE}>
                <p style={BLOCO_TITLE_STYLE}>Envie a planilha preenchida</p>
                <p style={BLOCO_TEXT_STYLE}>{labels.bloco2Text}</p>
                <div
                  style={dropActive ? DROP_ZONE_ACTIVE_STYLE : DROP_ZONE_STYLE}
                  onClick={handleDropZoneClick}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  role="button"
                  tabIndex={0}
                  aria-label="Area de upload de planilha"
                >
                  {selectedFile === null
                    ? 'Arraste sua planilha preenchida ou clique para selecionar'
                    : `Arquivo selecionado: ${selectedFile.name}`}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                  aria-hidden="true"
                />
                {headerError !== null && <p style={ERROR_MSG_STYLE}>{headerError}</p>}
                {uploadError !== null && <p style={ERROR_MSG_STYLE}>{uploadError}</p>}
              </div>
            </>
          )}

          {/* Resultado do upload */}
          {phase === 'result' && uploadResult !== null && (
            <div style={uploadResult.ok ? RESULT_OK_STYLE : RESULT_ERROR_STYLE}>
              <strong>
                {uploadResult.linhasProcessadas} linha(s) processada(s):{' '}
                {uploadResult.linhasSucesso} sucesso(s), {uploadResult.linhasErro} erro(s).
              </strong>
              {uploadResult.erros.length > 0 && (
                <ul style={ERROR_LIST_STYLE}>
                  {uploadResult.erros.map((e, idx) => (
                    <li key={`${e.linha}-${idx}`} style={ERROR_ITEM_STYLE}>
                      Linha {e.linha} — {e.coluna}: {e.mensagem}
                    </li>
                  ))}
                </ul>
              )}
              {uploadResult.credenciaisXlsxBase64 !== undefined && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={handleDownloadCredenciais}
                    style={BTN_OUTLINE_STYLE}
                  >
                    📥 Baixar credenciais iniciais
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={FOOTER_STYLE}>
          <button
            type="button"
            onClick={handleClose}
            style={BTN_OUTLINE_STYLE}
            disabled={phase === 'uploading'}
          >
            {phase === 'result' ? 'Fechar' : 'Cancelar'}
          </button>
          {phase !== 'result' && (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              style={canSubmit ? BTN_PRIMARY_STYLE : BTN_PRIMARY_DISABLED_STYLE}
              disabled={!canSubmit}
            >
              {phase === 'uploading' ? 'Enviando...' : 'Enviar planilha'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
