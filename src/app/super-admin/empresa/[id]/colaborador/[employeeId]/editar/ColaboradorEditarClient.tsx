// ROIP APP 9BOX — Client component canonico da edicao de colaborador
// (§13.5 + §13.6 + §13.8 + §5.5 + §16.3 + §16.4).
//
// Fluxo canonico bit-exact:
//   - Consome ColaboradorForm compartilhado.
//   - Botao [Salvar]: employees.update; se toggle RF alterado abre
//     ModalTransferenciaRF (§5.5) quando ha titular vigente distinto.
//   - Botao [Inativar]: abre ModalInativacaoMotivoSaida (§13.6);
//     se `countActiveLiderados > 0` fluxo canonico M2 v2 (§14.9):
//       1) canInactivate client-side; 2) modal motivo; 3) modal M2 v2;
//       4) leadershipTransfer.execute (transacao atomica).
//     Sem liderados: employees.inactivate direto apos modal motivo.
//   - Botao [Reativar]: employees.reactivate (visivel se status=inativo).
//   - Botao [Deletar permanentemente]: §16.4 — visivel apenas se
//     inativo E sem historico E nao-RF; employees.delete direto.
//
// RV-14. Um statement por linha, largura maxima 100 colunas.

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, type JSX } from 'react';

import { COLORS } from '../../../../../../../lib/design-tokens/colors';
import type {
  GetByIdEmployeeResult,
  LiderCandidateRow,
} from '../../../../../../../server/routers/employees';

import { ModalInativacaoMotivoSaida } from '../../../_shared/ModalInativacaoMotivoSaida';
import {
  ModalTransferenciaLiderados,
  type CandidateOption,
  type TransferMapping,
} from '../../../_shared/ModalTransferenciaLiderados';
import { ModalTransferenciaRF } from '../../../_shared/ModalTransferenciaRF';
import {
  ColaboradorForm,
  type ColaboradorFormValues,
  type DepartamentoId,
  type JobFamilyId,
  type LiderCandidate,
} from '../../ColaboradorForm';

interface Props {
  readonly companyId: number;
  readonly initialEmployee: GetByIdEmployeeResult;
  readonly currentRFName: string | null;
}

const FOOTER_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  marginTop: 8,
  flexWrap: 'wrap' as const,
};

const FOOTER_LEFT_STYLE = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap' as const,
};

const FOOTER_RIGHT_STYLE = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap' as const,
};

const BTN_OUTLINE_STYLE = {
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  background: COLORS.background.card,
  color: COLORS.text.primary,
  cursor: 'pointer' as const,
};

const BTN_PRIMARY_STYLE = {
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${COLORS.accent.teal}`,
  borderRadius: 6,
  background: COLORS.accent.teal,
  color: '#FFFFFF',
  cursor: 'pointer' as const,
};

const BTN_DANGER_STYLE = {
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${COLORS.semantic.danger}`,
  borderRadius: 6,
  background: COLORS.semantic.danger,
  color: '#FFFFFF',
  cursor: 'pointer' as const,
};

const BTN_SUCCESS_STYLE = {
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${COLORS.semantic.success}`,
  borderRadius: 6,
  background: COLORS.semantic.success,
  color: '#FFFFFF',
  cursor: 'pointer' as const,
};

const ERROR_STYLE = {
  background: COLORS.badge.dangerBg,
  color: COLORS.badge.dangerText,
  border: `1px solid ${COLORS.semantic.danger}`,
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
};

const SUCCESS_TOAST_STYLE = {
  background: COLORS.badge.successBg,
  color: COLORS.badge.successText,
  border: `1px solid ${COLORS.semantic.success}`,
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
};

const BLOCKER_MODAL_OVERLAY_STYLE = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(15,23,42,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 60,
  padding: 16,
};

const BLOCKER_MODAL_BOX_STYLE = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  width: '100%',
  maxWidth: 480,
  padding: 24,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 16,
};

const MSG_LEADERSHIPTRANSFER_BLOQUEADO_LITERAL =
  'Nao e possivel inativar este colaborador. Nao ha nenhum outro C-level ou colaborador com ' +
  'isLider=true ativo na empresa. Cadastre outro C-level ou promova um colaborador a Lider ' +
  'antes de prosseguir.';

function toFormValues(e: GetByIdEmployeeResult): ColaboradorFormValues {
  return {
    name: e.name,
    cpf: e.cpf,
    email: e.email ?? '',
    dataNascimento: e.dataNascimento.toISOString().slice(0, 10),
    dataAdmissao: e.dataAdmissao.toISOString().slice(0, 10),
    cargo: e.cargo,
    cbo: e.cbo,
    descricaoCBO: e.descricaoCBO,
    departamento: e.departamento as DepartamentoId,
    senioridade: e.senioridade,
    nivelHierarquico: e.nivelHierarquico,
    jobFamily: e.jobFamily as JobFamilyId,
    isRH: e.isRH,
    isLider: e.isLider,
    isResponsavelFinanceiro: e.isResponsavelFinanceiro,
    liderInicial:
      e.currentLiderInicial !== null
        ? {
            tipo: e.currentLiderInicial.tipo,
            id: e.currentLiderInicial.id,
            label:
              `${e.currentLiderInicial.name} · ${e.currentLiderInicial.cargo}` +
              ` · ${e.currentLiderInicial.departamento}`,
          }
        : null,
  };
}

export function ColaboradorEditarClient(props: Props): JSX.Element {
  const { companyId, initialEmployee, currentRFName } = props;
  const router = useRouter();

  const initialFormValues = useMemo(() => toFormValues(initialEmployee), [initialEmployee]);
  const [values, setValues] = useState<ColaboradorFormValues>(initialFormValues);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showRFModal, setShowRFModal] = useState(false);
  const [rfModalError, setRfModalError] = useState<string | null>(null);

  const [showMotivoModal, setShowMotivoModal] = useState(false);
  const [showBlockerModal, setShowBlockerModal] = useState(false);

  const [showM2Modal, setShowM2Modal] = useState(false);
  const [m2Candidates, setM2Candidates] = useState<readonly CandidateOption[]>([]);
  const [m2Liderados, setM2Liderados] = useState<
    readonly { employeeId: number; name: string; cargo: string; departamento: string }[]
  >([]);
  const [m2MotivoSelecionado, setM2MotivoSelecionado] = useState<
    'voluntario' | 'involuntario' | null
  >(null);
  const [m2Error, setM2Error] = useState<string | null>(null);

  const [showDeletarModal, setShowDeletarModal] = useState(false);

  const valuesRef = useRef(values);
  valuesRef.current = values;

  const handleValuesChange = useCallback((next: ColaboradorFormValues) => {
    setValues(next);
    setSuccessMsg(null);
  }, []);

  const handleToggleRFAttempt = useCallback((nextValue: boolean) => {
    setValues((prev) => ({ ...prev, isResponsavelFinanceiro: nextValue }));
  }, []);

  const handleSearchLider = useCallback(
    async (query: string): Promise<readonly LiderCandidate[]> => {
      const params = new URLSearchParams({
        input: JSON.stringify({
          companyId,
          query,
          excludeEmployeeId: initialEmployee.id,
        }),
      });
      const res = await fetch(`/api/trpc/employees.searchLiderCandidates?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) return [];
      const body = (await res.json()) as {
        result?: { data?: { candidates?: readonly LiderCandidateRow[] } };
      };
      return body.result?.data?.candidates ?? [];
    },
    [companyId, initialEmployee.id],
  );

  async function performUpdate(rfJustificativa: string | null): Promise<boolean> {
    const v = valuesRef.current;

    const patch: Record<string, unknown> = {
      employeeId: initialEmployee.id,
    };
    if (v.name.trim() !== initialEmployee.name) patch.name = v.name.trim();
    if ((v.email.trim() || null) !== initialEmployee.email) {
      patch.email = v.email.trim().length > 0 ? v.email.trim() : undefined;
    }
    if (v.dataNascimento !== initialEmployee.dataNascimento.toISOString().slice(0, 10)) {
      patch.dataNascimento = v.dataNascimento;
    }
    if (v.cargo.trim() !== initialEmployee.cargo) patch.cargo = v.cargo.trim();
    if (v.cbo.trim() !== initialEmployee.cbo) patch.cbo = v.cbo.trim();
    if (v.descricaoCBO.trim() !== initialEmployee.descricaoCBO) {
      patch.descricaoCBO = v.descricaoCBO.trim();
    }
    if (v.jobFamily !== initialEmployee.jobFamily) patch.jobFamily = v.jobFamily;
    if (v.senioridade !== initialEmployee.senioridade) patch.senioridade = v.senioridade;
    if (v.nivelHierarquico !== initialEmployee.nivelHierarquico) {
      patch.nivelHierarquico = v.nivelHierarquico;
    }
    if (v.departamento !== initialEmployee.departamento) patch.departamento = v.departamento;
    if (v.isRH !== initialEmployee.isRH) patch.isRH = v.isRH;
    if (v.isLider !== initialEmployee.isLider) patch.isLider = v.isLider;

    if (Object.keys(patch).length > 1) {
      const res = await fetch('/api/trpc/employees.update', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setErrorMsg(body?.error?.message ?? 'Erro ao salvar alteracoes.');
        return false;
      }
    }

    // Toggle RF alterado (ativado, desativado ou transferido).
    if (v.isResponsavelFinanceiro !== initialEmployee.isResponsavelFinanceiro) {
      if (v.isResponsavelFinanceiro) {
        const rfBody: Record<string, unknown> = {
          companyId,
          novoResponsavelTipo: 'employee',
          novoResponsavelId: initialEmployee.id,
        };
        if (rfJustificativa !== null) {
          rfBody.justificativa = rfJustificativa;
        }
        const rfRes = await fetch('/api/trpc/company.setResponsavelFinanceiro', {
          credentials: 'include',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rfBody),
        });
        if (!rfRes.ok) {
          const rfErrBody = (await rfRes.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          setRfModalError(rfErrBody?.error?.message ?? 'Erro ao atribuir RF.');
          return false;
        }
      }
    }

    return true;
  }

  const handleSave = useCallback(async () => {
    setErrorMsg(null);
    const v = valuesRef.current;
    const rfChangedToTrue = v.isResponsavelFinanceiro && !initialEmployee.isResponsavelFinanceiro;
    if (rfChangedToTrue && currentRFName !== null) {
      setShowRFModal(true);
      return;
    }
    setSaving(true);
    try {
      const ok = await performUpdate(null);
      if (ok) {
        setSuccessMsg('Alteracoes salvas com sucesso.');
      }
    } catch {
      setErrorMsg('Falha de rede ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }, [companyId, currentRFName, initialEmployee]);

  const handleConfirmRFTransfer = useCallback(
    async (justificativa: string) => {
      setSaving(true);
      setRfModalError(null);
      try {
        const ok = await performUpdate(justificativa);
        if (ok) {
          setShowRFModal(false);
          setSuccessMsg('Responsavel financeiro transferido com sucesso.');
        }
      } catch {
        setRfModalError('Falha de rede ao transferir. Tente novamente.');
      } finally {
        setSaving(false);
      }
    },
    [companyId, initialEmployee],
  );

  const handleTryInativar = useCallback(async () => {
    setErrorMsg(null);
    if (initialEmployee.isCurrentRF) {
      setShowMotivoModal(true);
      return;
    }
    if (initialEmployee.isLider && initialEmployee.countActiveLiderados > 0) {
      const canRes = await fetch('/api/trpc/leadershipTransfer.canInactivate', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: initialEmployee.id }),
      });
      if (!canRes.ok) {
        setErrorMsg('Falha ao verificar elegibilidade da transferencia de liderados.');
        return;
      }
      const canBody = (await canRes.json()) as {
        result?: { data?: { canInactivate?: boolean } };
      };
      if (canBody.result?.data?.canInactivate !== true) {
        setShowBlockerModal(true);
        return;
      }
    }
    setShowMotivoModal(true);
  }, [initialEmployee]);

  const executeInactivate = useCallback(
    async (motivoSaida: 'voluntario' | 'involuntario') => {
      const res = await fetch('/api/trpc/employees.inactivate', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: initialEmployee.id,
          motivoSaida,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setErrorMsg(body?.error?.message ?? 'Erro ao inativar colaborador.');
        return false;
      }
      return true;
    },
    [initialEmployee.id],
  );

  const executeM2Transfer = useCallback(
    async (
      mappings: readonly TransferMapping[],
      justificativa: string,
      motivoSaida: 'voluntario' | 'involuntario',
    ) => {
      const body = {
        employeeId: initialEmployee.id,
        mappings: mappings.map((m) => ({
          liderado_employeeId: m.liderado_employeeId,
          novo_lider_tipo: m.novo_lider_tipo,
          novo_lider_id: m.novo_lider_id,
        })),
        reason: justificativa,
        motivoSaida,
      };
      const res = await fetch('/api/trpc/leadershipTransfer.execute', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setM2Error(errBody?.error?.message ?? 'Erro ao executar transferencia.');
        return false;
      }
      return true;
    },
    [initialEmployee.id],
  );

  const handleConfirmMotivo = useCallback(
    async (motivoSaida: 'voluntario' | 'involuntario') => {
      if (initialEmployee.isLider && initialEmployee.countActiveLiderados > 0) {
        // Roteia para M2 v2: fecha modal motivo, carrega candidatos e liderados.
        setM2MotivoSelecionado(motivoSaida);
        setShowMotivoModal(false);
        setSaving(true);
        try {
          const [candRes, liderRes] = await Promise.all([
            fetch('/api/trpc/leadershipTransfer.getCandidates', {
              credentials: 'include',
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ employeeId: initialEmployee.id }),
            }),
            fetch(
              `/api/trpc/leadershipTransfer.listLiderados?${new URLSearchParams({
                input: JSON.stringify({ employeeId: initialEmployee.id }),
              }).toString()}`,
            ),
          ]);
          if (candRes.ok) {
            const candBody = (await candRes.json()) as {
              result?: { data?: { candidates?: readonly CandidateOption[] } };
            };
            setM2Candidates(candBody.result?.data?.candidates ?? []);
          }
          if (liderRes.ok) {
            const liderBody = (await liderRes.json()) as {
              result?: {
                data?: {
                  liderados?: readonly {
                    employeeId: number;
                    name: string;
                    cargo: string;
                    departamento: string;
                  }[];
                };
              };
            };
            setM2Liderados(liderBody.result?.data?.liderados ?? []);
          }
          setShowM2Modal(true);
        } finally {
          setSaving(false);
        }
        return;
      }
      setSaving(true);
      try {
        const ok = await executeInactivate(motivoSaida);
        if (ok) {
          setShowMotivoModal(false);
          router.push(`/super-admin/empresa/${companyId}/todos-os-colaboradores`);
        }
      } finally {
        setSaving(false);
      }
    },
    [companyId, executeInactivate, initialEmployee, router],
  );

  const handleConfirmM2 = useCallback(
    async (mappings: readonly TransferMapping[], justificativa: string) => {
      if (m2MotivoSelecionado === null) return;
      setSaving(true);
      setM2Error(null);
      try {
        const ok = await executeM2Transfer(mappings, justificativa, m2MotivoSelecionado);
        if (ok) {
          setShowM2Modal(false);
          router.push(`/super-admin/empresa/${companyId}/todos-os-colaboradores`);
        }
      } finally {
        setSaving(false);
      }
    },
    [companyId, executeM2Transfer, m2MotivoSelecionado, router],
  );

  const handleReactivate = useCallback(async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/trpc/employees.reactivate', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: initialEmployee.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setErrorMsg(body?.error?.message ?? 'Erro ao reativar colaborador.');
        return;
      }
      setSuccessMsg('Colaborador reativado com sucesso.');
    } catch {
      setErrorMsg('Falha de rede ao reativar.');
    } finally {
      setSaving(false);
    }
  }, [initialEmployee.id]);

  const handleDelete = useCallback(async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/trpc/employees.delete', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: initialEmployee.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setErrorMsg(body?.error?.message ?? 'Erro ao deletar colaborador.');
        return;
      }
      router.push(`/super-admin/empresa/${companyId}/todos-os-colaboradores`);
    } catch {
      setErrorMsg('Falha de rede ao deletar.');
    } finally {
      setSaving(false);
      setShowDeletarModal(false);
    }
  }, [companyId, initialEmployee.id, router]);

  const isInativo = initialEmployee.status === 'inativo';
  const canDelete =
    isInativo && !initialEmployee.hasTerminationEvents && !initialEmployee.isCurrentRF;

  return (
    <>
      <ColaboradorForm
        mode="editar"
        initialValues={values}
        onValuesChange={handleValuesChange}
        currentRFName={currentRFName}
        onToggleRFAttempt={handleToggleRFAttempt}
        cpfReadonly={true}
        searchLiderCandidates={handleSearchLider}
      />
      {errorMsg !== null ? <div style={ERROR_STYLE}>{errorMsg}</div> : null}
      {successMsg !== null ? <div style={SUCCESS_TOAST_STYLE}>{successMsg}</div> : null}
      <div style={FOOTER_STYLE}>
        <div style={FOOTER_LEFT_STYLE}>
          {!isInativo ? (
            <button
              type="button"
              onClick={handleTryInativar}
              style={BTN_DANGER_STYLE}
              disabled={saving}
            >
              Inativar colaborador
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReactivate}
              style={BTN_SUCCESS_STYLE}
              disabled={saving}
            >
              Reativar colaborador
            </button>
          )}
          {canDelete ? (
            <button
              type="button"
              onClick={() => setShowDeletarModal(true)}
              style={BTN_DANGER_STYLE}
              disabled={saving}
            >
              Deletar permanentemente
            </button>
          ) : null}
        </div>
        <div style={FOOTER_RIGHT_STYLE}>
          <button
            type="button"
            onClick={() => router.push(`/super-admin/empresa/${companyId}/todos-os-colaboradores`)}
            style={BTN_OUTLINE_STYLE}
            disabled={saving}
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={BTN_PRIMARY_STYLE}
            disabled={saving || isInativo}
          >
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      {showRFModal && currentRFName !== null ? (
        <ModalTransferenciaRF
          currentRFName={currentRFName}
          nextRFName={initialEmployee.name}
          onCancel={() => {
            setShowRFModal(false);
            setRfModalError(null);
          }}
          onConfirm={handleConfirmRFTransfer}
          submitting={saving}
          errorMessage={rfModalError}
        />
      ) : null}

      {showMotivoModal ? (
        <ModalInativacaoMotivoSaida
          employeeName={initialEmployee.name}
          isCurrentRF={initialEmployee.isCurrentRF}
          countLiderados={initialEmployee.countActiveLiderados}
          onCancel={() => setShowMotivoModal(false)}
          onConfirm={handleConfirmMotivo}
          submitting={saving}
        />
      ) : null}

      {showBlockerModal ? (
        <div style={BLOCKER_MODAL_OVERLAY_STYLE} role="dialog" aria-modal="true">
          <div style={BLOCKER_MODAL_BOX_STYLE}>
            <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text.primary }}>
              Não é possível inativar
            </div>
            <div style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 1.5 }}>
              {MSG_LEADERSHIPTRANSFER_BLOQUEADO_LITERAL.replace(
                'este colaborador',
                initialEmployee.name,
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowBlockerModal(false)}
                style={BTN_PRIMARY_STYLE}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showM2Modal ? (
        <ModalTransferenciaLiderados
          liderName={initialEmployee.name}
          liderados={m2Liderados}
          candidates={m2Candidates}
          onCancel={() => {
            setShowM2Modal(false);
            setM2MotivoSelecionado(null);
          }}
          onConfirm={handleConfirmM2}
          submitting={saving}
          errorMessage={m2Error}
        />
      ) : null}

      {showDeletarModal ? (
        <div style={BLOCKER_MODAL_OVERLAY_STYLE} role="dialog" aria-modal="true">
          <div style={BLOCKER_MODAL_BOX_STYLE}>
            <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text.primary }}>
              Deletar permanentemente?
            </div>
            <div style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 1.5 }}>
              Esta ação é irreversível. O colaborador <strong>{initialEmployee.name}</strong> será
              removido permanentemente da base de dados. Confirmar?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={() => setShowDeletarModal(false)}
                style={BTN_OUTLINE_STYLE}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={BTN_DANGER_STYLE}
                disabled={saving}
              >
                {saving ? 'Deletando...' : 'Deletar permanentemente'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
