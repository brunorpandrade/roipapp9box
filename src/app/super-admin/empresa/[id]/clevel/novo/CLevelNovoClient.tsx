// ROIP APP 9BOX — client component canônico bit-exact da rota Bruno
// `/super-admin/empresa/[id]/clevel/novo` (§13.2, ME-078a; refatorado
// em ME-078b-refactor — fetch tRPC → server action canônica).
//
// Thin wrapper sobre `CLevelForm` no modo `create`. Gerencia estado do
// form, handler de save via server action `criarCLevelAction`, handler
// de toggle RF (modal de transferência quando empresa já tem RF), modal
// "Descartar alterações" (dirty), e navegação pós-sucesso.
//
// **RV-13.** Consumido por `page.tsx` (import + render).

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, type JSX } from 'react';

import { COLORS } from '../../../../../../lib/design-tokens/colors';
import { CredentialsDisplayModal } from '@/components/credentials/CredentialsDisplayModal';

import { CLevelForm, EMPTY_CLEVEL_FORM_VALUES, type CLevelFormValues } from '../CLevelForm';
import { criarCLevelAction } from './actions';

// -----------------------------------------------------------------------
// Tooltips canônicos bit-exact (S503)
// -----------------------------------------------------------------------

const ENVIAR_PRIMEIRO_ACESSO_TOOLTIP = 'Disponivel a partir da ME-Primeiro-Cliente.' as const;

// -----------------------------------------------------------------------
// Estilos canônicos
// -----------------------------------------------------------------------

const FOOTER_STYLE = {
  display: 'flex' as const,
  justifyContent: 'flex-end' as const,
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
  maxWidth: 440,
  width: '90%',
};

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

interface Props {
  readonly companyId: number;
  readonly isFirstCLevel: boolean;
  readonly currentRFName: string | null;
}

export function CLevelNovoClient(props: Props): JSX.Element {
  const { companyId, isFirstCLevel, currentRFName } = props;
  const router = useRouter();

  const [values, setValues] = useState<CLevelFormValues>(EMPTY_CLEVEL_FORM_VALUES);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDirtyModal, setShowDirtyModal] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // ME-080b Dispatch 2b — credenciais devolvidas pelo backend apos create.
  const [pendingCredentials, setPendingCredentials] = useState<{
    nome: string;
    matricula: string;
    senhaInicial: string;
  } | null>(null);

  const valuesRef = useRef(values);
  valuesRef.current = values;

  const handleValuesChange = useCallback((next: CLevelFormValues) => {
    setValues(next);
    setDirty(true);
  }, []);

  const handleToggleRFAttempt = useCallback((nextValue: boolean) => {
    // §5.5 canônico — se empresa já tem RF e Bruno tenta ativar,
    // a transferência real opera via `company.setResponsavelFinanceiro`
    // (ME-044) APÓS o save do create. Por ora, armazena a intenção.
    // Modal de transferência com justificativa será disparado no save.
    setValues((prev) => ({ ...prev, isResponsavelFinanceiro: nextValue }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    const v = valuesRef.current;
    if (v.name.trim().length === 0 || v.cpf.length !== 11 || v.email.trim().length === 0) {
      setErrorMsg('Preencha todos os campos obrigatorios (Nome, CPF, E-mail).');
      return;
    }
    if (v.cargo.trim().length === 0 || v.descricaoCargo.trim().length === 0) {
      setErrorMsg('Preencha Cargo e Descricao do cargo.');
      return;
    }
    if (v.custoMensal.trim().length === 0 || Number.isNaN(Number(v.custoMensal))) {
      setErrorMsg('Informe o Custo mensal valido.');
      return;
    }
    if (v.dataNascimento.length === 0 || v.dataAdmissao.length === 0) {
      setErrorMsg('Informe Data de nascimento e Data de admissao.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const result = await criarCLevelAction({
        companyId,
        name: v.name.trim(),
        cpf: v.cpf,
        email: v.email.trim(),
        photoUrl: v.photoUrl.trim().length > 0 ? v.photoUrl.trim() : undefined,
        dataNascimento: v.dataNascimento,
        dataAdmissao: v.dataAdmissao,
        cargo: v.cargo.trim(),
        descricaoCargo: v.descricaoCargo.trim(),
        departamento: v.departamento,
        custoMensal: Number(v.custoMensal),
        acessoTotal: isFirstCLevel ? true : v.acessoTotal,
      });
      if (!result.ok) {
        setErrorMsg(result.message);
        setSaving(false);
        return;
      }
      setDirty(false);
      // ME-080b Dispatch 2b — C-level SEMPRE recebe as duas credenciais.
      setPendingCredentials({
        nome: v.name.trim(),
        matricula: result.data.credentials.matricula,
        senhaInicial: result.data.credentials.senhaInicial,
      });
      setSaveSuccess(true);
    } catch {
      setErrorMsg('Falha de rede ao salvar. Tente novamente.');
      setSaving(false);
    }
  }, [companyId, isFirstCLevel]);

  const handleCancel = useCallback(() => {
    if (dirty) {
      setShowDirtyModal(true);
    } else {
      router.push(`/super-admin/empresa/${companyId}/clevel-rh`);
    }
  }, [dirty, router, companyId]);

  // Pós-sucesso
  if (saveSuccess) {
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
        <div
          style={{
            background: COLORS.background.card,
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 10,
            padding: 32,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text.primary }}>
            C-level cadastrado com sucesso
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={() => router.push(`/super-admin/empresa/${companyId}/clevel-rh`)}
              style={BTN_PRIMARY_STYLE}
            >
              Voltar para C-level e RH
            </button>
            <button
              type="button"
              disabled
              title={ENVIAR_PRIMEIRO_ACESSO_TOOLTIP}
              style={BTN_DISABLED_STYLE}
            >
              Enviar primeiro acesso
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <CLevelForm
        mode="create"
        initialValues={EMPTY_CLEVEL_FORM_VALUES}
        onValuesChange={handleValuesChange}
        isFirstCLevel={isFirstCLevel}
        isOnlyCLevel={false}
        currentRFName={currentRFName}
        onToggleRFAttempt={handleToggleRFAttempt}
        cpfReadonly={false}
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
        <button type="button" onClick={handleCancel} style={BTN_OUTLINE_STYLE}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={saving ? BTN_DISABLED_STYLE : BTN_PRIMARY_STYLE}
        >
          {saving ? 'Salvando...' : 'Salvar C-level'}
        </button>
      </div>

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
