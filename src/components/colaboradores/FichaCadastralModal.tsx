'use client';

// ROIP APP 9BOX — pop-up "Ficha cadastral — [Nome]" (DOC 05 §14.10,
// ME-fila6 D1).
//
// Especificacao §14.10:
// - Overlay `rgba(0,0,0,0.55)`, z-index 200.
// - Modal 80vw × 80vh (maximo 1080px), radius 14px.
// - Header navy com titulo "Ficha cadastral — [Nome]" + botao [X].
// - Corpo rolavel com os campos do formulario de cadastro em leitura.
// - Rodape com `[✎ Editar cadastro]` teal APENAS para Bruno, RH puro e
//   RH-Lider (controlado pelo consumidor via `editHref`).
// - Badge/linha RF apenas em `/todos-os-colaboradores` (§14.10.1).
//
// Carregamento: o componente chama `loadAction` ao abrir; o escopo de
// leitura e decidido no servidor.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type JSX } from 'react';

import type { FichaCadastralActionResult } from '../../app/_shared/fichaCadastral/actions';
import {
  DEPARTAMENTO_LABELS,
  JOB_FAMILY_LABELS,
  NIVEL_HIERARQUICO_LABELS,
  SENIORIDADE_LABELS,
  STATUS_LABELS,
  formatCpfMasked,
  formatDateBR,
} from '../../app/super-admin/empresa/[id]/todos-os-colaboradores/internals';
import { COLORS } from '../../lib/design-tokens/colors';
import { DefinirMetasControl } from '../metas/DefinirMetasControl';
import type { FichaCadastral } from '../../server/services/fichaCadastral';

export interface FichaCadastralModalProps {
  readonly companyId: number;
  readonly employeeId: number;
  readonly employeeName: string;
  readonly loadAction: (
    companyId: number,
    employeeId: number,
  ) => Promise<FichaCadastralActionResult>;
  readonly editHref: string | null;
  readonly hideRf: boolean;
  readonly onClose: () => void;
}

const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const BOX_STYLE: CSSProperties = {
  width: '80vw',
  height: '80vh',
  maxWidth: 1080,
  background: COLORS.background.card,
  borderRadius: 14,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const HEADER_STYLE: CSSProperties = {
  background: COLORS.primary.navy,
  color: '#FFFFFF',
  padding: '16px 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const BODY_STYLE: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 24,
};

const GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 16,
};

const LABEL_STYLE: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.text.tertiary,
  marginBottom: 4,
};

const VALUE_STYLE: CSSProperties = {
  fontSize: 14,
  color: COLORS.text.primary,
  padding: '8px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  background: COLORS.background.elevated,
  minHeight: 20,
};

const FOOTER_STYLE: CSSProperties = {
  borderTop: `1px solid ${COLORS.border.default}`,
  padding: '12px 24px',
  display: 'flex',
  justifyContent: 'flex-end',
};

function buildPapeis(ficha: FichaCadastral, hideRf: boolean): string {
  const papeis: string[] = [];
  if (ficha.isLider) {
    papeis.push('Líder');
  }
  if (ficha.isRH) {
    papeis.push('RH');
  }
  if (!hideRf && ficha.isResponsavelFinanceiro) {
    papeis.push('Responsável financeiro');
  }
  return papeis.length === 0 ? '—' : papeis.join(', ');
}

function buildLider(ficha: FichaCadastral): string {
  if (ficha.liderName === null) {
    return '—';
  }
  return ficha.liderTipo === 'clevel' ? `${ficha.liderName} (C-level)` : ficha.liderName;
}

function Campo(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div>
      <div style={LABEL_STYLE}>{props.label}</div>
      <div style={VALUE_STYLE}>{props.value}</div>
    </div>
  );
}

export function FichaCadastralModal(props: FichaCadastralModalProps): JSX.Element {
  const { companyId, employeeId, employeeName, loadAction, editHref, hideRf, onClose } = props;
  const [ficha, setFicha] = useState<FichaCadastral | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async (): Promise<void> => {
      try {
        const result = await loadAction(companyId, employeeId);
        if (!active) {
          return;
        }
        if (result.ok) {
          setFicha(result.data);
        } else {
          setError(result.message);
        }
      } catch {
        if (active) {
          setError('Não foi possível carregar a ficha cadastral.');
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [companyId, employeeId, loadAction]);

  return (
    <div
      style={OVERLAY_STYLE}
      role="dialog"
      aria-modal="true"
      aria-label={`Ficha cadastral — ${employeeName}`}
      onClick={onClose}
    >
      <div style={BOX_STYLE} onClick={(e) => e.stopPropagation()}>
        <div style={HEADER_STYLE}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Ficha cadastral — {employeeName}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar ficha cadastral"
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
          {error !== null ? (
            <div role="alert" style={{ color: COLORS.semantic.danger, fontSize: 14 }}>
              {error}
            </div>
          ) : null}
          {error === null && ficha === null ? (
            <div role="status" style={{ color: COLORS.text.tertiary, fontSize: 14 }}>
              Carregando ficha cadastral...
            </div>
          ) : null}
          {ficha !== null ? (
            <div style={GRID_STYLE}>
              <Campo label="Nome completo" value={ficha.name} />
              <Campo label="CPF" value={formatCpfMasked(ficha.cpf)} />
              <Campo label="Data de nascimento" value={formatDateBR(ficha.dataNascimento)} />
              <Campo label="Data de admissão" value={formatDateBR(ficha.dataAdmissao)} />
              <Campo label="E-mail" value={ficha.email ?? '—'} />
              <Campo label="Cargo" value={ficha.cargo === '' ? '—' : ficha.cargo} />
              <Campo label="CBO" value={ficha.cbo} />
              <Campo label="Descrição CBO" value={ficha.descricaoCBO} />
              <Campo label="Departamento" value={DEPARTAMENTO_LABELS[ficha.departamento]} />
              <Campo label="Senioridade" value={SENIORIDADE_LABELS[ficha.senioridade]} />
              <Campo label="Família de função" value={JOB_FAMILY_LABELS[ficha.jobFamily]} />
              <Campo
                label="Nível hierárquico"
                value={NIVEL_HIERARQUICO_LABELS[ficha.nivelHierarquico]}
              />
              <Campo label="Líder direto" value={buildLider(ficha)} />
              <Campo label="Papéis funcionais" value={buildPapeis(ficha, hideRf)} />
              <Campo label="Status" value={STATUS_LABELS[ficha.status]} />
            </div>
          ) : null}
        </div>
        {ficha !== null && (ficha.podeDefinirMetas || editHref !== null) ? (
          <div style={{ ...FOOTER_STYLE, justifyContent: 'space-between', gap: 12 }}>
            {ficha.podeDefinirMetas ? (
              <DefinirMetasControl
                companyId={companyId}
                employeeId={ficha.id}
                initialStatus={ficha.metasStatus}
              />
            ) : (
              <span />
            )}
            {editHref !== null ? (
              <Link
                href={editHref}
                style={{
                  background: COLORS.accent.teal,
                  color: '#FFFFFF',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                ✎ Editar cadastro
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
