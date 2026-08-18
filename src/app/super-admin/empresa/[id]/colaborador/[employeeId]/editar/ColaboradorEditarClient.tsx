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
import type { GetByIdEmployeeResult } from '../../../../../../../server/routers/employees';

import { ModalInativacaoMotivoSaida } from '../../../_shared/ModalInativacaoMotivoSaida';
import {
  ModalTransferenciaLiderados,
  type CandidateOption,
  type LideradoToTransfer,
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
import type {
  atualizarColaboradorAction,
  buscarCandidatosTransferenciaAction,
  definirRFEditarAction,
  excluirColaboradorAction,
  executarTransferenciaAction,
  inativarColaboradorAction,
  listarLideradosAction,
  pesquisarLiderCandidatosEditarAction,
  reativarColaboradorAction,
  reatribuirLiderColaboradorAction,
  regenerarMatriculaColaboradorAction,
  regenerarSenhaColaboradorAction,
  verificarInativacaoAction,
} from './actions';

import { CredentialsDisplayModal } from '@/components/credentials/CredentialsDisplayModal';
import { RegenerateConfirmModal } from '@/components/credentials/RegenerateConfirmModal';

/**
 * ME-084 D-ME084-1/2/3 — contrato agnostico de rota. `ColaboradorEditar-
 * Client` e compartilhado bit-exact entre Bruno (super-admin) e RH (rh-
 * facing rota). O caller `page.tsx` de cada rota injeta as 13 actions do
 * respectivo diretorio `actions.ts` — actions Bruno tem guard `require-
 * SuperAdmin`; actions RH tem guard `requireRHOrSuperAdmin` — mas todas
 * delegam bit-exact aos mesmos callers do router `employees`, que aplica
 * `assertCompanyScope` + `assertCanChangeIsRH` para cross-tenant + priv-
 * elevacao. Contrato tipado com `typeof` das actions Bruno para preservar
 * assinatura bit-exact (actions RH sao `typeof` das mesmas exports por
 * design canonico L123 dual-route).
 */
export interface ColaboradorEditarActions {
  readonly atualizarColaborador: typeof atualizarColaboradorAction;
  readonly buscarCandidatosTransferencia: typeof buscarCandidatosTransferenciaAction;
  readonly definirRFEditar: typeof definirRFEditarAction;
  readonly excluirColaborador: typeof excluirColaboradorAction;
  readonly executarTransferencia: typeof executarTransferenciaAction;
  readonly inativarColaborador: typeof inativarColaboradorAction;
  readonly listarLiderados: typeof listarLideradosAction;
  readonly pesquisarLiderCandidatosEditar: typeof pesquisarLiderCandidatosEditarAction;
  readonly reativarColaborador: typeof reativarColaboradorAction;
  readonly reatribuirLiderColaborador: typeof reatribuirLiderColaboradorAction;
  readonly regenerarMatriculaColaborador: typeof regenerarMatriculaColaboradorAction;
  readonly regenerarSenhaColaborador: typeof regenerarSenhaColaboradorAction;
  readonly verificarInativacao: typeof verificarInativacaoAction;
}

interface Props {
  readonly companyId: number;
  readonly initialEmployee: GetByIdEmployeeResult;
  readonly currentRFName: string | null;
  /**
   * ME-084 — variante do formulario. `'super_admin'` (default) mostra
   * todos os toggles. `'rh'` oculta toggles Bruno-exclusive via
   * ColaboradorForm.
   */
  readonly variant?: 'super_admin' | 'rh';
  /**
   * ME-084 — href de retorno canonico. Bruno: `/super-admin/empresa/{id}/
   * todos-os-colaboradores`. RH: `/todos-os-colaboradores`.
   */
  readonly todosColaboradoresHref: string;
  /** ME-084 — bag de actions injetada conforme rota. */
  readonly actions: ColaboradorEditarActions;
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

// ME-080b Dispatch 2c — estilos da secao Credenciais.
const CREDENTIALS_SECTION_STYLE = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  padding: 20,
  marginTop: 16,
};

const CREDENTIALS_TITLE_STYLE = {
  margin: '0 0 16px 0',
  fontSize: 15,
  fontWeight: 600 as const,
  color: COLORS.text.primary,
};

const CREDENTIALS_LABEL_STYLE = {
  fontSize: 12,
  color: COLORS.text.secondary,
  marginBottom: 4,
};

const CREDENTIALS_VALUE_STYLE = {
  fontSize: 15,
  fontWeight: 600 as const,
  color: COLORS.text.primary,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' as const,
  letterSpacing: '0.03em',
};

const BTN_REGEN_STYLE = {
  padding: '9px 16px',
  background: COLORS.background.card,
  color: COLORS.text.primary,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500 as const,
  cursor: 'pointer' as const,
};

const BTN_REGEN_DISABLED_STYLE = {
  ...BTN_REGEN_STYLE,
  color: COLORS.text.secondary,
  cursor: 'not-allowed' as const,
  opacity: 0.6,
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
  const {
    companyId,
    initialEmployee,
    currentRFName,
    variant = 'super_admin',
    todosColaboradoresHref,
    actions,
  } = props;
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
  const [m2Liderados, setM2Liderados] = useState<readonly LideradoToTransfer[]>([]);
  const [m2MotivoSelecionado, setM2MotivoSelecionado] = useState<
    'voluntario' | 'involuntario' | null
  >(null);
  const [m2Error, setM2Error] = useState<string | null>(null);

  const [showDeletarModal, setShowDeletarModal] = useState(false);

  // ME-080b Dispatch 2c — estado da secao Credenciais.
  const [currentMatricula, setCurrentMatricula] = useState<string | null>(
    initialEmployee.matricula,
  );
  const [regenConfirmOpen, setRegenConfirmOpen] = useState<null | 'matricula' | 'senha'>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [postRegenCreds, setPostRegenCreds] = useState<{
    matricula: string;
    senhaInicial: string | null;
  } | null>(null);

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
      const result = await actions.pesquisarLiderCandidatosEditar({
        companyId,
        query,
        excludeEmployeeId: initialEmployee.id,
      });
      if (!result.ok) return [];
      return result.data.candidates;
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
      const updateResult = await actions.atualizarColaborador(
        patch as {
          employeeId: number;
          name?: string;
          email?: string;
          dataNascimento?: string;
          cargo?: string;
          cbo?: string;
          descricaoCBO?: string;
          jobFamily?: string;
          senioridade?: string;
          nivelHierarquico?: string;
          departamento?: string;
          isRH?: boolean;
          isLider?: boolean;
        },
      );
      if (!updateResult.ok) {
        setErrorMsg(updateResult.message);
        return false;
      }
    }

    // ME-080b Dispatch 3.3 (S519) — reatribuicao individual do lider.
    // Se o lider selecionado difere do vigente, chama endpoint canonico
    // dedicado (fluxo silencioso). Comparacao por (tipo, id) preserva
    // polimorfismo employee vs cLevel.
    const currentLider = initialEmployee.currentLiderInicial;
    const nextLider = v.liderInicial;
    const liderMudou =
      (currentLider === null && nextLider !== null) ||
      (currentLider !== null && nextLider === null) ||
      (currentLider !== null &&
        nextLider !== null &&
        (currentLider.tipo !== nextLider.tipo || currentLider.id !== nextLider.id));
    if (liderMudou && nextLider !== null) {
      const reassignResult = await actions.reatribuirLiderColaborador({
        employeeId: initialEmployee.id,
        ...(nextLider.tipo === 'employee'
          ? { newLiderEmployeeId: nextLider.id }
          : { newLiderClevelId: nextLider.id }),
      });
      if (!reassignResult.ok) {
        setErrorMsg(reassignResult.message);
        return false;
      }
    }

    if (v.isResponsavelFinanceiro !== initialEmployee.isResponsavelFinanceiro) {
      if (v.isResponsavelFinanceiro) {
        const rfResult = await actions.definirRFEditar({
          companyId,
          newHolderType: 'employee',
          newHolderId: initialEmployee.id,
          ...(rfJustificativa !== null ? { justificativa: rfJustificativa } : {}),
        });
        if (!rfResult.ok) {
          setRfModalError(rfResult.message);
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
      const canResult = await actions.verificarInativacao({
        employeeId: initialEmployee.id,
      });
      if (!canResult.ok) {
        setErrorMsg('Falha ao verificar elegibilidade da transferencia de liderados.');
        return;
      }
      if (canResult.data.canInactivate !== true) {
        setShowBlockerModal(true);
        return;
      }
    }
    setShowMotivoModal(true);
  }, [initialEmployee]);

  const executeInactivate = useCallback(
    async (motivoSaida: 'voluntario' | 'involuntario') => {
      const result = await actions.inativarColaborador({
        employeeId: initialEmployee.id,
        motivoSaida,
      });
      if (!result.ok) {
        setErrorMsg(result.message);
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
      // Traduzir TransferMapping → formato Zod EXECUTE_INPUT_SCHEMA.
      // Mapear 'clevel' → 'cLevel' (§14.3 polimorfismo canônico).
      const mapeamento = mappings.map((m) => ({
        lideradoId: m.liderado_employeeId,
        novoLiderId: m.novo_lider_id,
        novoLiderTipo: (m.novo_lider_tipo === 'clevel' ? 'cLevel' : 'employee') as
          'employee' | 'cLevel',
      }));
      // Candidatos Grupo 4: novos líderes que são non-leaders
      // (identificados pelo group='nao_lider' nos m2Candidates).
      const g4Ids = new Set<number>();
      for (const m of mappings) {
        if (m.novo_lider_tipo === 'employee') {
          const cand = m2Candidates.find(
            (c) => c.id === m.novo_lider_id && c.tipo === 'employee' && c.group === 'nao_lider',
          );
          if (cand) g4Ids.add(cand.id);
        }
      }
      const result = await actions.executarTransferencia({
        liderOriginalId: initialEmployee.id,
        mapeamento,
        candidatosGrupo4: [...g4Ids].map((id) => ({
          candidatoId: id,
        })),
        reason: justificativa,
        motivoSaida,
      });
      if (!result.ok) {
        setM2Error(result.message);
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
          const [candResult, liderResult] = await Promise.all([
            actions.buscarCandidatosTransferencia({
              employeeId: initialEmployee.id,
              companyId,
              tentativaLiderados: [],
            }),
            actions.listarLiderados({
              employeeId: initialEmployee.id,
            }),
          ]);
          if (candResult.ok) {
            // Flatten dos 5 grupos canônicos → CandidateOption[] flat.
            // Mapeamento tipo 'cLevel' → 'clevel' (interface do modal).
            const g = candResult.data;
            const flat: CandidateOption[] = [];
            for (const item of g.grupo1_cLevelsAtivos) {
              flat.push({
                tipo: 'clevel',
                id: item.id,
                name: item.name,
                cargo: item.cargo,
                departamento: item.departamento,
                group: 'clevel_ativo',
                countLiderados: item.liderados,
              });
            }
            for (const item of g.grupo2_mesmoDepartamento) {
              flat.push({
                tipo: 'employee',
                id: item.id,
                name: item.name,
                cargo: item.cargo,
                departamento: item.departamento,
                group: 'mesmo_departamento',
                countLiderados: item.liderados,
              });
            }
            for (const item of g.grupo3_demaisLideres) {
              flat.push({
                tipo: 'employee',
                id: item.id,
                name: item.name,
                cargo: item.cargo,
                departamento: item.departamento,
                group: 'demais_lideres',
                countLiderados: item.liderados,
              });
            }
            for (const item of g.grupo4_colaboradoresNaoLideres) {
              flat.push({
                tipo: 'employee',
                id: item.id,
                name: item.name,
                cargo: item.cargo,
                departamento: item.departamento,
                group: 'nao_lider',
                countLiderados: item.liderados,
              });
            }
            for (const item of g.grupo5_liderasDestaTransferencia) {
              flat.push({
                tipo: 'employee',
                id: item.id,
                name: item.name,
                cargo: item.cargo,
                departamento: item.departamento,
                group: 'condicional',
                countLiderados: item.liderados,
              });
            }
            setM2Candidates(flat);
          }
          if (liderResult.ok) {
            const liderados: LideradoToTransfer[] = liderResult.data.map((r) => ({
              employeeId: r.employeeId,
              name: r.name,
              cargo: r.cargo,
              departamento: r.departamento,
            }));
            setM2Liderados(liderados);
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
          router.push(todosColaboradoresHref);
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
          router.push(todosColaboradoresHref);
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
      const result = await actions.reativarColaborador({
        employeeId: initialEmployee.id,
      });
      if (!result.ok) {
        setErrorMsg(result.message);
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
      const result = await actions.excluirColaborador({
        employeeId: initialEmployee.id,
      });
      if (!result.ok) {
        setErrorMsg(result.message);
        return;
      }
      router.push(todosColaboradoresHref);
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

  // ME-080b Dispatch 2c — handlers de regeneracao de credencial.
  const handleConfirmRegen = useCallback(async () => {
    if (regenConfirmOpen === null) return;
    setRegenLoading(true);
    setRegenError(null);
    try {
      if (regenConfirmOpen === 'matricula') {
        const res = await actions.regenerarMatriculaColaborador({
          employeeId: initialEmployee.id,
        });
        if (!res.ok) {
          setRegenError(res.message);
          return;
        }
        setCurrentMatricula(res.data.matricula);
        setPostRegenCreds({ matricula: res.data.matricula, senhaInicial: null });
      } else {
        const res = await actions.regenerarSenhaColaborador({
          employeeId: initialEmployee.id,
        });
        if (!res.ok) {
          setRegenError(res.message);
          return;
        }
        setPostRegenCreds({
          matricula: currentMatricula ?? '',
          senhaInicial: res.data.senhaInicial,
        });
      }
      setRegenConfirmOpen(null);
    } catch {
      setRegenError('Falha de rede ao regenerar.');
    } finally {
      setRegenLoading(false);
    }
  }, [regenConfirmOpen, initialEmployee.id, currentMatricula]);

  const podeRegenerarSenha =
    initialEmployee.isLider === true ||
    initialEmployee.isRH === true ||
    initialEmployee.isResponsavelFinanceiro === true;

  return (
    <>
      <RegenerateConfirmModal
        open={regenConfirmOpen !== null}
        kind={regenConfirmOpen ?? 'matricula'}
        nomeTitular={initialEmployee.name}
        loading={regenLoading}
        onConfirm={() => void handleConfirmRegen()}
        onCancel={() => {
          setRegenConfirmOpen(null);
          setRegenError(null);
        }}
      />
      {postRegenCreds !== null ? (
        <CredentialsDisplayModal
          open={true}
          nomeTitular={initialEmployee.name}
          matricula={postRegenCreds.matricula}
          senhaInicial={postRegenCreds.senhaInicial}
          onClose={() => setPostRegenCreds(null)}
        />
      ) : null}
      <ColaboradorForm
        mode="editar"
        initialValues={values}
        onValuesChange={handleValuesChange}
        currentRFName={currentRFName}
        onToggleRFAttempt={handleToggleRFAttempt}
        cpfReadonly={true}
        searchLiderCandidates={handleSearchLider}
        variant={variant}
      />
      <div style={CREDENTIALS_SECTION_STYLE}>
        <h3 style={CREDENTIALS_TITLE_STYLE}>Credenciais de acesso</h3>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={CREDENTIALS_LABEL_STYLE}>Matricula (portal do colaborador)</div>
            <div style={CREDENTIALS_VALUE_STYLE}>{currentMatricula ?? '— nao provisionada —'}</div>
          </div>
          <button
            type="button"
            onClick={() => setRegenConfirmOpen('matricula')}
            style={BTN_REGEN_STYLE}
            disabled={saving || regenLoading}
          >
            Regenerar matricula
          </button>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={CREDENTIALS_LABEL_STYLE}>Senha do painel</div>
            <div style={CREDENTIALS_VALUE_STYLE}>
              {podeRegenerarSenha
                ? initialEmployee.passwordSet
                  ? 'Configurada pelo colaborador'
                  : 'Aguardando primeiro acesso (senha inicial pendente)'
                : 'Sem acesso ao painel (marque Lider, RH ou RF)'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRegenConfirmOpen('senha')}
            style={podeRegenerarSenha ? BTN_REGEN_STYLE : BTN_REGEN_DISABLED_STYLE}
            disabled={!podeRegenerarSenha || saving || regenLoading}
          >
            Regenerar senha
          </button>
        </div>
        {regenError !== null ? (
          <div style={{ ...ERROR_STYLE, marginTop: 12 }}>{regenError}</div>
        ) : null}
      </div>
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
            onClick={() => router.push(todosColaboradoresHref)}
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
