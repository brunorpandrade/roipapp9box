// ROIP APP 9BOX — client component canônico bit-exact da rota Bruno
// `/super-admin/empresa/[id]/clevel/[cLevelId]/editar` (§13.3, ME-078a).
//
// Thin wrapper sobre `CLevelForm` no modo `edit`. Gerencia modais:
// - modalInativacao (D8 canônica — sem liderados: opera; com liderados:
//   bloqueador "transferência disponível a partir da ME-078b").
// - modalDeletar (confirmação de nome — §16.4 deleção canônica).
// - modalDirty (descartar alterações).
// - Botão `[Reativar]` quando status='inativo'.
//
// **RV-13.** Consumido por `page.tsx` (import + render).

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, type JSX } from 'react';

import { COLORS } from '../../../../../../../lib/design-tokens/colors';
import type { GetByIdCLevelResult } from '../../../../../../../server/routers/cLevelMembers';

import { CLevelForm, type CLevelFormValues } from '../../CLevelForm';

// -----------------------------------------------------------------------
// Tooltip canônico S503
// -----------------------------------------------------------------------

const TRANSFERENCIA_LIDERADOS_TOOLTIP =
  'Transferencia de liderados disponivel a partir da ME-078b.' as const;

// -----------------------------------------------------------------------
// Estilos
// -----------------------------------------------------------------------

const FOOTER_STYLE = {
  display: 'flex' as const,
  justifyContent: 'space-between' as const,
  gap: 12,
  padding: '16px 0',
  borderTop: `1px solid ${COLORS.border.default}`,
};

const BTN_OUTLINE_STYLE = {
  padding: '10px 20px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  background: COLORS.background.card,
  color: COLORS.text.secondary,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer' as const,
};

const BTN_PRIMARY_STYLE = {
  padding: '10px 20px',
  border: 'none',
  borderRadius: 8,
  background: COLORS.accent.teal,
  color: COLORS.background.card,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer' as const,
};

const BTN_DANGER_STYLE = {
  ...BTN_PRIMARY_STYLE,
  background: COLORS.semantic.danger,
};

const BTN_DISABLED_STYLE = {
  ...BTN_PRIMARY_STYLE,
  background: COLORS.background.elevated,
  color: COLORS.text.quaternary,
  cursor: 'not-allowed' as const,
};

const MODAL_OVERLAY_STYLE = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  zIndex: 1000,
};

const MODAL_BOX_STYLE = {
  background: COLORS.background.card,
  borderRadius: 14,
  padding: 24,
  maxWidth: 520,
  width: '90%',
};

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

interface Props {
  readonly companyId: number;
  readonly clevel: GetByIdCLevelResult;
  readonly isOnlyCLevel: boolean;
  readonly currentRFName: string | null;
  readonly activeLideradosCount: number;
}

function formatDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CLevelEditarClient(props: Props): JSX.Element {
  const { companyId, clevel, isOnlyCLevel, currentRFName, activeLideradosCount } = props;
  const router = useRouter();

  const initialValues: CLevelFormValues = {
    name: clevel.name,
    cpf: clevel.cpf,
    email: clevel.email,
    telefone: '',
    photoUrl: clevel.photoUrl ?? '',
    dataNascimento: formatDate(clevel.dataNascimento),
    dataAdmissao: formatDate(clevel.dataAdmissao),
    cargo: clevel.cargo,
    descricaoCargo: clevel.descricaoCargo,
    departamento: clevel.departamento,
    custoMensal: clevel.custoMensal,
    jobFamily: 'estrategica_direcao',
    acessoTotal: clevel.acessoTotal,
    isResponsavelFinanceiro: clevel.isResponsavelFinanceiro,
  };

  const [values, setValues] = useState<CLevelFormValues>(initialValues);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDirtyModal, setShowDirtyModal] = useState(false);
  const [showInativarModal, setShowInativarModal] = useState(false);
  const [showDeletarModal, setShowDeletarModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const valuesRef = useRef(values);
  valuesRef.current = values;

  const handleValuesChange = useCallback((next: CLevelFormValues) => {
    setValues(next);
    setDirty(true);
  }, []);

  const handleToggleRFAttempt = useCallback((nextValue: boolean) => {
    setValues((prev) => ({ ...prev, isResponsavelFinanceiro: nextValue }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    const v = valuesRef.current;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/trpc/cLevelMembers.update', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cLevelId: clevel.id,
          name: v.name.trim(),
          email: v.email.trim(),
          photoUrl: v.photoUrl.trim().length > 0 ? v.photoUrl.trim() : undefined,
          dataNascimento: v.dataNascimento,
          cargo: v.cargo.trim(),
          descricaoCargo: v.descricaoCargo.trim(),
          departamento: v.departamento,
          custoMensal: Number(v.custoMensal),
          acessoTotal: v.acessoTotal,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error?: { message?: string } }).error?.message ?? 'Erro.')
            : 'Erro ao salvar alterações.';
        setErrorMsg(msg);
        setSaving(false);
        return;
      }
      setDirty(false);
      router.push(`/super-admin/empresa/${companyId}/clevel-rh`);
    } catch {
      setErrorMsg('Falha de rede ao salvar. Tente novamente.');
      setSaving(false);
    }
  }, [clevel.id, companyId, router]);

  const handleInativar = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/trpc/cLevelMembers.inactivate', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cLevelId: clevel.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error?: { message?: string } }).error?.message ?? 'Erro.')
            : 'Erro ao inativar.';
        setErrorMsg(msg);
        setShowInativarModal(false);
        return;
      }
      router.push(`/super-admin/empresa/${companyId}/clevel-rh`);
    } catch {
      setErrorMsg('Falha de rede.');
      setShowInativarModal(false);
    }
  }, [clevel.id, companyId, router]);

  const handleReativar = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/trpc/cLevelMembers.reactivate', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cLevelId: clevel.id }),
      });
      if (!res.ok) {
        setErrorMsg('Erro ao reativar.');
        return;
      }
      router.push(`/super-admin/empresa/${companyId}/clevel-rh`);
    } catch {
      setErrorMsg('Falha de rede.');
    }
  }, [clevel.id, companyId, router]);

  const handleDeletar = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/trpc/cLevelMembers.delete', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cLevelId: clevel.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error?: { message?: string } }).error?.message ?? 'Erro.')
            : 'Erro ao deletar.';
        setErrorMsg(msg);
        setShowDeletarModal(false);
        return;
      }
      router.push(`/super-admin/empresa/${companyId}/clevel-rh`);
    } catch {
      setErrorMsg('Falha de rede.');
      setShowDeletarModal(false);
    }
  }, [clevel.id, companyId, router]);

  const handleCancel = useCallback(() => {
    if (dirty) {
      setShowDirtyModal(true);
    } else {
      router.push(`/super-admin/empresa/${companyId}/clevel-rh`);
    }
  }, [dirty, router, companyId]);

  const isAtivo = clevel.status === 'ativo';

  return (
    <>
      <CLevelForm
        mode="edit"
        initialValues={initialValues}
        onValuesChange={handleValuesChange}
        isFirstCLevel={false}
        isOnlyCLevel={isOnlyCLevel}
        currentRFName={currentRFName}
        onToggleRFAttempt={handleToggleRFAttempt}
        cpfReadonly
      />

      {errorMsg !== null ? (
        <div
          style={{
            padding: '10px 14px',
            background: COLORS.badge.dangerBg,
            color: COLORS.badge.dangerText,
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {errorMsg}
        </div>
      ) : null}

      <div style={FOOTER_STYLE}>
        <div style={{ display: 'flex', gap: 10 }}>
          {isAtivo ? (
            <button
              type="button"
              onClick={() => setShowInativarModal(true)}
              style={BTN_DANGER_STYLE}
            >
              Inativar C-level
            </button>
          ) : (
            <>
              <button type="button" onClick={handleReativar} style={BTN_PRIMARY_STYLE}>
                Reativar
              </button>
              <button
                type="button"
                onClick={() => setShowDeletarModal(true)}
                style={BTN_DANGER_STYLE}
              >
                Deletar permanentemente
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={handleCancel} style={BTN_OUTLINE_STYLE}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            style={saving || !dirty ? BTN_DISABLED_STYLE : BTN_PRIMARY_STYLE}
          >
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      {/* Modal inativar — D8 canônica */}
      {showInativarModal ? (
        <div style={MODAL_OVERLAY_STYLE}>
          <div style={MODAL_BOX_STYLE}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: COLORS.text.primary,
                marginBottom: 12,
              }}
            >
              Inativar C-level?
            </div>
            <div
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                marginBottom: 12,
              }}
            >
              Você está inativando <strong>{clevel.name}</strong>. Este C-level deixará de acessar a
              plataforma e não aparecerá em novos ciclos, listagens operacionais e agrupamentos de
              dashboards. Histórico será preservado. Reativação é possível a qualquer momento.
            </div>
            {activeLideradosCount > 0 ? (
              <div
                style={{
                  padding: '10px 12px',
                  background: COLORS.badge.warningBg,
                  color: COLORS.badge.warningText,
                  borderRadius: 8,
                  fontSize: 12,
                  marginBottom: 16,
                }}
              >
                <strong>
                  Este C-level tem {activeLideradosCount} liderado(s) direto(s) ativo(s).
                </strong>{' '}
                {TRANSFERENCIA_LIDERADOS_TOOLTIP}
              </div>
            ) : null}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setShowInativarModal(false)}
                style={BTN_OUTLINE_STYLE}
              >
                Cancelar
              </button>
              {activeLideradosCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowInativarModal(false)}
                  style={BTN_PRIMARY_STYLE}
                >
                  Entendi
                </button>
              ) : (
                <button type="button" onClick={handleInativar} style={BTN_DANGER_STYLE}>
                  Prosseguir
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal deletar permanentemente — §16.4 */}
      {showDeletarModal ? (
        <div style={MODAL_OVERLAY_STYLE}>
          <div style={MODAL_BOX_STYLE}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: COLORS.semantic.danger,
                marginBottom: 12,
              }}
            >
              Deletar permanentemente?
            </div>
            <div
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                marginBottom: 12,
              }}
            >
              Esta ação é <strong>irreversível</strong>. O registro de{' '}
              <strong>{clevel.name}</strong> será removido definitivamente do banco de dados. Nenhum
              histórico ou registro futuro poderá ser recuperado.
            </div>
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: COLORS.text.secondary,
                  marginBottom: 4,
                }}
              >
                Para confirmar, digite o nome completo do C-level:
              </div>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={clevel.name}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: `1px solid ${COLORS.border.default}`,
                  borderRadius: 8,
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowDeletarModal(false);
                  setDeleteConfirmName('');
                }}
                style={BTN_OUTLINE_STYLE}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeletar}
                disabled={deleteConfirmName.trim() !== clevel.name}
                style={
                  deleteConfirmName.trim() !== clevel.name ? BTN_DISABLED_STYLE : BTN_DANGER_STYLE
                }
              >
                Deletar permanentemente
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal descartar alterações */}
      {showDirtyModal ? (
        <div style={MODAL_OVERLAY_STYLE}>
          <div style={MODAL_BOX_STYLE}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: COLORS.text.primary,
                marginBottom: 12,
              }}
            >
              Descartar alterações?
            </div>
            <div
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                marginBottom: 20,
              }}
            >
              Você tem dados não salvos. Se sair agora, as alterações serão perdidas.
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setShowDirtyModal(false)}
                style={BTN_OUTLINE_STYLE}
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={() => router.push(`/super-admin/empresa/${companyId}/clevel-rh`)}
                style={BTN_DANGER_STYLE}
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
