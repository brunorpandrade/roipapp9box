// ROIP APP 9BOX — Client component canonico do cadastro de colaborador
// (§13.4 + §13.9 + §5.5). Consome ColaboradorForm compartilhado e
// orquestra o save (`employees.create` + `company.setResponsavelFinanceiro`
// quando toggle RF ativado).
//
// Fluxo canonico bit-exact:
//   1. Bruno preenche form; toggle RF armazena intencao localmente.
//   2. Ao clicar [Salvar]:
//        a. Validacao client-side (campos obrigatorios).
//        b. Se `isResponsavelFinanceiro=true` E `currentRFName!==null`:
//           abre ModalTransferenciaRF; save aguarda justificativa.
//        c. Se `isResponsavelFinanceiro=true` E `currentRFName===null`:
//           save direto + setResponsavelFinanceiro sem modal.
//        d. Se `isResponsavelFinanceiro=false`: save direto.
//   3. Ao sucesso: tela de sucesso + Link para /clevel-rh (RH) ou
//      /todos-os-colaboradores (comum).
//
// RV-14. Um statement por linha, largura maxima 100 colunas.

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, type JSX } from 'react';

import { COLORS } from '../../../../../../lib/design-tokens/colors';

import { ModalTransferenciaRF } from '../../_shared/ModalTransferenciaRF';
import {
  ColaboradorForm,
  EMPTY_COLABORADOR_FORM_VALUES,
  type ColaboradorFormValues,
  type LiderCandidate,
} from '../ColaboradorForm';
import { criarColaboradorAction, definirRFAction, pesquisarLiderCandidatosAction } from './actions';

interface Props {
  readonly companyId: number;
  readonly currentRFName: string | null;
  readonly presetIsRH: boolean;
}

const FOOTER_STYLE = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
  marginTop: 8,
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

const ERROR_STYLE = {
  background: COLORS.badge.dangerBg,
  color: COLORS.badge.dangerText,
  border: `1px solid ${COLORS.semantic.danger}`,
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
};

const SUCCESS_CARD_STYLE = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  padding: 32,
  textAlign: 'center' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 16,
  alignItems: 'center' as const,
};

const MODAL_OVERLAY_STYLE = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(15,23,42,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 60,
  padding: 16,
};

const MODAL_BOX_STYLE = {
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

export function ColaboradorNovoClient(props: Props): JSX.Element {
  const { companyId, currentRFName, presetIsRH } = props;
  const router = useRouter();

  const [values, setValues] = useState<ColaboradorFormValues>({
    ...EMPTY_COLABORADOR_FORM_VALUES,
    isRH: presetIsRH,
  });
  const [dirty, setDirty] = useState(presetIsRH);
  const [saving, setSaving] = useState(false);
  const [showDirtyModal, setShowDirtyModal] = useState(false);
  const [showRFModal, setShowRFModal] = useState(false);
  const [rfModalError, setRfModalError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const valuesRef = useRef(values);
  valuesRef.current = values;

  const handleValuesChange = useCallback((next: ColaboradorFormValues) => {
    setValues(next);
    setDirty(true);
  }, []);

  const handleToggleRFAttempt = useCallback((nextValue: boolean) => {
    setValues((prev) => ({ ...prev, isResponsavelFinanceiro: nextValue }));
    setDirty(true);
  }, []);

  const handleSearchLider = useCallback(
    async (query: string): Promise<readonly LiderCandidate[]> => {
      const result = await pesquisarLiderCandidatosAction({
        companyId,
        query,
      });
      if (!result.ok) return [];
      return result.data.candidates;
    },
    [companyId],
  );

  function validateForm(v: ColaboradorFormValues): string | null {
    if (v.name.trim().length === 0) return 'Informe o nome completo.';
    if (v.cpf.length !== 11) return 'Informe um CPF valido.';
    if ((v.isLider || v.isRH) && v.email.trim().length === 0) {
      return 'E-mail obrigatorio para acesso como RH ou Lider.';
    }
    if (v.dataNascimento.length === 0) return 'Informe a data de nascimento.';
    if (v.dataAdmissao.length === 0) return 'Informe a data de admissao.';
    if (v.cargo.trim().length === 0) return 'Informe o cargo.';
    if (v.cbo.trim().length === 0) return 'Informe o CBO.';
    if (v.descricaoCBO.trim().length === 0) return 'Informe a descricao do CBO.';
    if (v.departamento === '') return 'Selecione o departamento.';
    if (v.senioridade === '') return 'Selecione a senioridade.';
    if (v.nivelHierarquico === '') return 'Selecione o nivel hierarquico.';
    if (v.jobFamily === '') return 'Selecione a familia de funcao.';
    return null;
  }

  async function performCreate(
    v: ColaboradorFormValues,
    rfJustificativa: string | null,
  ): Promise<boolean> {
    // Passo 1 — cria o colaborador via employees.create.
    const createRes = await criarColaboradorAction({
      companyId,
      name: v.name.trim(),
      cpf: v.cpf,
      dataNascimento: v.dataNascimento,
      dataAdmissao: v.dataAdmissao,
      cargo: v.cargo.trim(),
      cbo: v.cbo.trim(),
      descricaoCBO: v.descricaoCBO.trim(),
      jobFamily: v.jobFamily,
      senioridade: v.senioridade,
      nivelHierarquico: v.nivelHierarquico,
      departamento: v.departamento,
      isRH: v.isRH,
      isLider: v.isLider,
      ...(v.email.trim().length > 0 ? { email: v.email.trim() } : {}),
      ...(v.liderInicial !== null
        ? v.liderInicial.tipo === 'employee'
          ? { liderInicialId: v.liderInicial.id }
          : { liderInicialClevelId: v.liderInicial.id }
        : {}),
    });
    if (!createRes.ok) {
      setErrorMsg(createRes.message);
      return false;
    }
    const newEmployeeId = createRes.data.employeeId;

    // Passo 2 — se RF ativado, chama setResponsavelFinanceiro.
    if (v.isResponsavelFinanceiro && newEmployeeId !== undefined) {
      const rfResult = await definirRFAction({
        companyId,
        newHolderType: 'employee',
        newHolderId: newEmployeeId,
        ...(rfJustificativa !== null ? { justificativa: rfJustificativa } : {}),
      });
      if (!rfResult.ok) {
        setRfModalError(rfResult.message);
        return false;
      }
    }

    return true;
  }

  const handleSave = useCallback(async () => {
    const v = valuesRef.current;
    const validationError = validateForm(v);
    if (validationError !== null) {
      setErrorMsg(validationError);
      return;
    }

    // Fluxo RF §5.5: se ativado E ha titular vigente, abre modal.
    if (v.isResponsavelFinanceiro && currentRFName !== null) {
      setShowRFModal(true);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const ok = await performCreate(v, null);
      if (ok) {
        setDirty(false);
        setSaveSuccess(true);
      }
    } catch {
      setErrorMsg('Falha de rede ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }, [companyId, currentRFName]);

  const handleConfirmRFTransfer = useCallback(
    async (justificativa: string) => {
      const v = valuesRef.current;
      setSaving(true);
      setRfModalError(null);
      try {
        const ok = await performCreate(v, justificativa);
        if (ok) {
          setDirty(false);
          setShowRFModal(false);
          setSaveSuccess(true);
        }
      } catch {
        setRfModalError('Falha de rede ao transferir. Tente novamente.');
      } finally {
        setSaving(false);
      }
    },
    [companyId],
  );

  const handleCancel = useCallback(() => {
    if (dirty) {
      setShowDirtyModal(true);
    } else {
      router.push(`/super-admin/empresa/${companyId}/todos-os-colaboradores`);
    }
  }, [dirty, router, companyId]);

  if (saveSuccess) {
    const backHref = presetIsRH
      ? `/super-admin/empresa/${companyId}/clevel-rh`
      : `/super-admin/empresa/${companyId}/todos-os-colaboradores`;
    const backLabel = presetIsRH ? 'Voltar para C-level e RH' : 'Voltar para lista';
    return (
      <div style={SUCCESS_CARD_STYLE}>
        <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text.primary }}>
          Colaborador cadastrado com sucesso
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => router.push(backHref)} style={BTN_PRIMARY_STYLE}>
            {backLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ColaboradorForm
        mode="novo"
        initialValues={values}
        onValuesChange={handleValuesChange}
        currentRFName={currentRFName}
        onToggleRFAttempt={handleToggleRFAttempt}
        cpfReadonly={false}
        searchLiderCandidates={handleSearchLider}
        presetIsRH={presetIsRH}
      />
      {errorMsg !== null ? <div style={ERROR_STYLE}>{errorMsg}</div> : null}
      <div style={FOOTER_STYLE}>
        <button type="button" onClick={handleCancel} style={BTN_OUTLINE_STYLE} disabled={saving}>
          Cancelar
        </button>
        <button type="button" onClick={handleSave} style={BTN_PRIMARY_STYLE} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar colaborador'}
        </button>
      </div>

      {showRFModal && currentRFName !== null ? (
        <ModalTransferenciaRF
          currentRFName={currentRFName}
          nextRFName={values.name}
          onCancel={() => {
            setShowRFModal(false);
            setRfModalError(null);
          }}
          onConfirm={handleConfirmRFTransfer}
          submitting={saving}
          errorMessage={rfModalError}
        />
      ) : null}

      {showDirtyModal ? (
        <div style={MODAL_OVERLAY_STYLE} role="dialog" aria-modal="true">
          <div style={MODAL_BOX_STYLE}>
            <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text.primary }}>
              Descartar alterações?
            </div>
            <div style={{ fontSize: 13, color: COLORS.text.secondary }}>
              Você tem alterações não salvas. Tem certeza que deseja sair sem salvar?
            </div>
            <div style={FOOTER_STYLE}>
              <button
                type="button"
                onClick={() => setShowDirtyModal(false)}
                style={BTN_OUTLINE_STYLE}
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={() =>
                  router.push(`/super-admin/empresa/${companyId}/todos-os-colaboradores`)
                }
                style={{ ...BTN_PRIMARY_STYLE, background: COLORS.semantic.danger }}
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
