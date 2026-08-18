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

import { CredentialsDisplayModal } from '@/components/credentials/CredentialsDisplayModal';
import { ModalDirtyState } from '@/components/ui/ModalDirtyState';

import { COLORS } from '../../../../../../lib/design-tokens/colors';

import { ModalTransferenciaRF } from '../../_shared/ModalTransferenciaRF';
import {
  ColaboradorForm,
  EMPTY_COLABORADOR_FORM_VALUES,
  type ColaboradorFormValues,
  type LiderCandidate,
} from '../ColaboradorForm';

/**
 * ME-084 D-ME084-1/2/3/6 — contrato agnostico de rota compartilhado por
 * Bruno (super_admin) e RH (rh/rh_lider). Actions e hrefs sao injetados
 * pelo caller do respectivo `page.tsx`:
 *   - Bruno passa `criarColaboradorAction` + `definirRFAction` +
 *     `pesquisarLiderCandidatosAction` da rota super-admin + variant
 *     'super_admin' + hrefs `/super-admin/empresa/{id}/…`.
 *   - RH passa as actions RH-facing + variant 'rh' + hrefs base
 *     `/todos-os-colaboradores`.
 */
export type CriarColaboradorActionType = (input: {
  readonly companyId: number;
  readonly name: string;
  readonly cpf: string;
  readonly email?: string;
  readonly dataNascimento: string;
  readonly dataAdmissao: string;
  readonly cargo: string;
  readonly cbo: string;
  readonly descricaoCBO: string;
  readonly jobFamily: string;
  readonly senioridade: string;
  readonly nivelHierarquico: string;
  readonly departamento: string;
  readonly isRH?: boolean;
  readonly isLider?: boolean;
  readonly liderInicialId?: number;
  readonly liderInicialClevelId?: number;
  readonly matricula?: string;
}) => Promise<
  | {
      readonly ok: true;
      readonly data: {
        readonly employeeId: number;
        readonly credentials: {
          readonly matricula: string;
          readonly senhaInicial: string | null;
        };
      };
    }
  | { readonly ok: false; readonly message: string }
>;

export type DefinirRFActionType = (input: {
  readonly companyId: number;
  readonly newHolderType: 'employee' | 'cLevel';
  readonly newHolderId: number;
  readonly justificativa?: string;
}) => Promise<
  | { readonly ok: true; readonly data: { readonly senhaInicial: string | null } }
  | { readonly ok: false; readonly message: string }
>;

export type PesquisarLiderCandidatosActionType = (input: {
  readonly companyId: number;
  readonly query: string;
  readonly excludeEmployeeId?: number;
}) => Promise<
  | { readonly ok: true; readonly data: { readonly candidates: readonly LiderCandidate[] } }
  | { readonly ok: false; readonly message: string }
>;

interface Props {
  readonly companyId: number;
  readonly currentRFName: string | null;
  readonly presetIsRH: boolean;
  /**
   * ME-084 — variante do formulario. `'super_admin'` = default (Bruno)
   * mostra todos os toggles. `'rh'` (nova rota RH) oculta toggles Bruno-
   * exclusive via ColaboradorForm.
   */
  readonly variant?: 'super_admin' | 'rh';
  /**
   * ME-084 — href de retorno canonico. Bruno: `/super-admin/empresa/{id}/
   * todos-os-colaboradores`. RH: `/todos-os-colaboradores`.
   */
  readonly todosColaboradoresHref: string;
  /**
   * ME-084 — href alternativo pos-save quando `presetIsRH=true`. Bruno:
   * `/super-admin/empresa/{id}/clevel-rh`. RH nunca usa preset RH (cadastro
   * RH e Bruno-exclusivo — DOC 02 §10.9 linha 864); passar mesmo valor de
   * `todosColaboradoresHref` para RH.
   */
  readonly presetRHBackHref: string;
  /** ME-084 — actions injetadas conforme rota (Bruno super-admin ou RH-facing). */
  readonly criarColaborador: CriarColaboradorActionType;
  readonly definirRF: DefinirRFActionType;
  readonly pesquisarLiderCandidatos: PesquisarLiderCandidatosActionType;
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

// ME-084 D-ME084-6 — constantes MODAL_OVERLAY_STYLE / MODAL_BOX_STYLE
// removidas: dirty modal ad-hoc substituido por ModalDirtyState canonico
// reutilizavel (ME-082). Overlay/box vive dentro do proprio componente
// canonico (`src/components/ui/Modal.tsx`).

export function ColaboradorNovoClient(props: Props): JSX.Element {
  const {
    companyId,
    currentRFName,
    presetIsRH,
    variant = 'super_admin',
    todosColaboradoresHref,
    presetRHBackHref,
    criarColaborador,
    definirRF,
    pesquisarLiderCandidatos,
  } = props;
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
  // ME-080b Dispatch 2b — credenciais devolvidas pelo backend apos create.
  // Guardadas em estado para exibir no CredentialsDisplayModal ANTES da
  // navegacao para a lista (plain text NAO reaparece).
  const [pendingCredentials, setPendingCredentials] = useState<{
    nome: string;
    matricula: string;
    senhaInicial: string | null;
  } | null>(null);

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
      const result = await pesquisarLiderCandidatos({
        companyId,
        query,
      });
      if (!result.ok) return [];
      return result.data.candidates;
    },
    [companyId, pesquisarLiderCandidatos],
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
    // Passo 1 — cria o colaborador via employees.create (action injetada).
    const createRes = await criarColaborador({
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
    const createdCredentials = createRes.data.credentials;
    let rfSenhaInicial: string | null = null;

    // Passo 2 — se RF ativado, chama setResponsavelFinanceiro (action
    // injetada). Guard canonico: variant 'rh' nunca envia RF (toggle
    // oculto no ColaboradorForm), mas mesmo se `values.isResponsavel-
    // Financeiro` chegar true de forma anomala, o backend rejeita:
    // `company.setResponsavelFinanceiro` e Bruno-exclusivo (DOC 02 §5).
    if (v.isResponsavelFinanceiro && newEmployeeId !== undefined) {
      const rfResult = await definirRF({
        companyId,
        newHolderType: 'employee',
        newHolderId: newEmployeeId,
        ...(rfJustificativa !== null ? { justificativa: rfJustificativa } : {}),
      });
      if (!rfResult.ok) {
        setRfModalError(rfResult.message);
        return false;
      }
      // ME-080b Dispatch 2b — setResponsavelFinanceiro pode provisionar
      // senha se o employee nao tinha (caso raro no fluxo Novo: RH marca
      // RF de colaborador comum sem Lider/RH; sem senha vinda do create).
      rfSenhaInicial = rfResult.data.senhaInicial;
    }

    // ME-080b Dispatch 2b — precedencia canonica: senha do create tem
    // prioridade; senha do setRF so entra se o create nao proviu.
    const senhaFinal = createdCredentials.senhaInicial ?? rfSenhaInicial;
    setPendingCredentials({
      nome: v.name.trim(),
      matricula: createdCredentials.matricula,
      senhaInicial: senhaFinal,
    });

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
      router.push(todosColaboradoresHref);
    }
  }, [dirty, router, todosColaboradoresHref]);

  if (saveSuccess) {
    // ME-084 — presetIsRH so ocorre no fluxo Bruno (variant='super_admin');
    // RH nunca ativa preset RH (DOC 02 §10.9 linha 864). presetRHBackHref
    // e o mesmo que todosColaboradoresHref para variant='rh' (contrato).
    const backHref = presetIsRH ? presetRHBackHref : todosColaboradoresHref;
    const backLabel = presetIsRH ? 'Voltar para C-level e RH' : 'Voltar para lista';
    return (
      <>
        {pendingCredentials !== null ? (
          <CredentialsDisplayModal
            open={true}
            nomeTitular={pendingCredentials.nome}
            matricula={pendingCredentials.matricula}
            senhaInicial={pendingCredentials.senhaInicial}
            onClose={() => setPendingCredentials(null)}
          />
        ) : null}
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
      </>
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
        variant={variant}
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

      {/* ME-084 D-ME084-6 — consolidacao canonica do modal dirty state
       * bit-exact via componente reutilizavel `ModalDirtyState` (ME-082).
       * Substitui modal ad-hoc inline que existia neste client desde ME-
       * 078b. Racional: L125 aplicada (extracao/consolidacao durante ME
       * grande que ja toca o arquivo). Ganho arquitetural: 1 unica fonte
       * de verdade para textos canonicos §4.10 do DOC 02 + comportamento
       * ESC/click-fora unificado + reducao ~28 LOC.
       * Endereca parcialmente D-DIRTY-CONSOLIDACAO herdado da ME-082
       * (2/3 clients migrados; CLevelNovoClient e CLevelEditarClient
       * ficam para bloco C-level pos-B10). */}
      <ModalDirtyState
        open={showDirtyModal}
        onKeepEditing={() => setShowDirtyModal(false)}
        onDiscard={() => router.push(todosColaboradoresHref)}
      />
    </>
  );
}
