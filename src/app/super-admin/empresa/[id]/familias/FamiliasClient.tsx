'use client';

// ROIP APP 9BOX — client component canonico da rota Bruno
// `/super-admin/empresa/[id]/familias` (ME-075 + ME-1.17.2).
//
// ME-1.17.2 — editor expandido das familias de funcao:
// (D1) Grid unico com canonicas ATIVAS + INATIVAS + custom ATIVADAS.
// (D2) Botão "+ Nova família customizada" ao final (até 20 slots).
// (D3) Modal canonico de ativacao de slot custom (nome obrigatorio;
//      variaveis seedadas canonicamente a 25% cada no backend).
// (D4) Nome editavel INLINE no cabecalho (click, blur salva).
// (D5) Setas up/down para reordenar entre ATIVAS (bordas desabilitam).
// (D6) Toggle ativar/desativar com guard de colaboradores (backend
//      bloqueia desativar familia com N > 0; UI exibe mensagem).
// (D7) Save de variaveis por familia (preservado bit-exact ME-075).
// (D8) Trava absoluta `lideranca_gestao`: sem toggle, nome fixo,
//      nomes/unidades das variaveis readonly. Setas up/down normais.
// (D9) Warning prospectivo canonico sobre pesos vs fechamentos.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type JSX } from 'react';

import {
  activateCustomSlotAction,
  migrateAndDeactivateFamilyAction,
  renameFamilyAction,
  reorderFamilyAction,
  saveJobFamilyAction,
  toggleFamilyActiveAction,
} from './actions';
import {
  CUSTOM_FAMILY_VARIABLE_DEFAULTS,
  isFamiliaSavable,
  sumWeights,
  type FamiliaState,
  type FamiliasPageData,
} from './internals';
import type { JobFamily } from '../../../../../db/schema/enums';

export interface FamiliasClientProps {
  readonly companyId: number;
  readonly companyNomeFantasia: string;
  readonly pageData: FamiliasPageData;
}

interface FamiliaLocalState extends FamiliaState {
  readonly savingFlag: boolean;
  readonly togglingFlag: boolean;
  readonly reorderingFlag: boolean;
  readonly renamingFlag: boolean;
  readonly errorMessage: string | null;
  readonly successMessage: string | null;
}

export function FamiliasClient(props: FamiliasClientProps): JSX.Element {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [families, setFamilies] = useState<FamiliaLocalState[]>(
    props.pageData.families.map((f) => ({
      ...f,
      savingFlag: false,
      togglingFlag: false,
      reorderingFlag: false,
      renamingFlag: false,
      errorMessage: null,
      successMessage: null,
    })),
  );
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalName, setModalName] = useState<string>('');
  const [modalSaving, setModalSaving] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  // ME-1.17.3 — estado do modal canonico de migracao em massa (fluxo
  // "desativar família ocupada": seleciona destino + confirma).
  const [migrateOpen, setMigrateOpen] = useState<boolean>(false);
  const [migrateFromFamily, setMigrateFromFamily] = useState<JobFamily | null>(null);
  const [migrateToFamily, setMigrateToFamily] = useState<JobFamily | ''>('');
  const [migrateSaving, setMigrateSaving] = useState<boolean>(false);
  const [migrateError, setMigrateError] = useState<string | null>(null);

  // ME-1.17.2 CC079-2.1 — sincronizacao canonica estado client ↔
  // props server pos router.refresh(). O `useState` inicial so roda
  // no mount; sem este efeito as mudancas de toggle/rename/reorder
  // persistidas no backend nao refletem na UI ate recarregar a pagina.
  // `pageDataFirstMount` evita sobrescrever flags transitorios (saving,
  // mensagens) na primeira renderizacao.
  const pageDataFirstMount = useRef<boolean>(true);
  useEffect(() => {
    if (pageDataFirstMount.current) {
      pageDataFirstMount.current = false;
      return;
    }
    setFamilies((prev) => {
      const prevByKey = new Map(prev.map((f) => [f.jobFamily, f] as const));
      return props.pageData.families.map((fresh) => {
        const prevLocal = prevByKey.get(fresh.jobFamily);
        return {
          ...fresh,
          savingFlag: false,
          togglingFlag: false,
          reorderingFlag: false,
          renamingFlag: false,
          errorMessage: null,
          successMessage: prevLocal?.successMessage ?? null,
        };
      });
    });
  }, [props.pageData]);

  const activeFamilies = families.filter((f) => f.ativo);

  function patchFamily(familyIdx: number, patch: Partial<FamiliaLocalState>): void {
    setFamilies((prev) => prev.map((f, i) => (i === familyIdx ? { ...f, ...patch } : f)));
  }

  function updateVariable(
    familyIdx: number,
    varIdx: number,
    field: 'variableName' | 'unit' | 'weight',
    value: string | number,
  ): void {
    setFamilies((prev) =>
      prev.map((f, i) => {
        if (i !== familyIdx) {
          return f;
        }
        const nextVars = f.variables.map((v, j) => {
          if (j !== varIdx) {
            return v;
          }
          if (field === 'weight') {
            const num = typeof value === 'string' ? Number(value) : value;
            return { ...v, weight: Number.isFinite(num) ? num : 0 };
          }
          return { ...v, [field]: String(value) };
        });
        return { ...f, variables: nextVars, errorMessage: null, successMessage: null };
      }),
    );
  }

  async function handleSaveFamily(familyIdx: number): Promise<void> {
    const f = families[familyIdx];
    if (f === undefined) {
      return;
    }
    patchFamily(familyIdx, { savingFlag: true, errorMessage: null, successMessage: null });
    const result = await saveJobFamilyAction({
      companyId: props.companyId,
      jobFamily: f.jobFamily,
      variables: f.variables.map((v) => ({
        variableIndex: v.variableIndex,
        variableName: v.variableName,
        unit: v.unit,
        weight: v.weight,
      })),
    });
    patchFamily(familyIdx, {
      savingFlag: false,
      errorMessage: result.ok ? null : result.message,
      successMessage: result.ok ? 'Família salva com sucesso.' : null,
    });
    if (result.ok) {
      startTransition(() => router.refresh());
    }
  }

  async function handleToggleActive(familyIdx: number): Promise<void> {
    const f = families[familyIdx];
    if (f === undefined) {
      return;
    }
    // ME-1.17.3 — fluxo canonico desativar com migracao: se familia
    // ATIVA com colaboradores vinculados, abre modal de migracao em
    // vez de chamar toggleFamilyActiveAction (que bloquearia no guard
    // server-side).
    if (f.ativo && f.employeeCount > 0) {
      setMigrateFromFamily(f.jobFamily);
      setMigrateToFamily('');
      setMigrateError(null);
      setMigrateOpen(true);
      return;
    }
    patchFamily(familyIdx, { togglingFlag: true, errorMessage: null, successMessage: null });
    const result = await toggleFamilyActiveAction({
      companyId: props.companyId,
      jobFamily: f.jobFamily,
      ativo: !f.ativo,
    });
    patchFamily(familyIdx, {
      togglingFlag: false,
      errorMessage: result.ok ? null : result.message,
      successMessage: result.ok ? (!f.ativo ? 'Família ativada.' : 'Família desativada.') : null,
    });
    if (result.ok) {
      startTransition(() => router.refresh());
    }
  }

  async function handleMigrateAndDeactivate(): Promise<void> {
    if (migrateFromFamily === null || migrateToFamily === '') {
      setMigrateError('Selecione uma família destino.');
      return;
    }
    setMigrateSaving(true);
    setMigrateError(null);
    const result = await migrateAndDeactivateFamilyAction({
      companyId: props.companyId,
      fromFamily: migrateFromFamily,
      toFamily: migrateToFamily,
    });
    setMigrateSaving(false);
    if (!result.ok) {
      setMigrateError(result.message);
      return;
    }
    setMigrateOpen(false);
    setMigrateFromFamily(null);
    setMigrateToFamily('');
    startTransition(() => router.refresh());
  }

  async function handleRename(familyIdx: number, nomeCustomizado: string | null): Promise<void> {
    const f = families[familyIdx];
    if (f === undefined) {
      return;
    }
    const currentNormalized = f.nomeCustomizado ?? '';
    const newNormalized = nomeCustomizado ?? '';
    if (currentNormalized === newNormalized.trim()) {
      return;
    }
    patchFamily(familyIdx, { renamingFlag: true, errorMessage: null, successMessage: null });
    const result = await renameFamilyAction({
      companyId: props.companyId,
      jobFamily: f.jobFamily,
      nomeCustomizado,
    });
    patchFamily(familyIdx, {
      renamingFlag: false,
      errorMessage: result.ok ? null : result.message,
      successMessage: result.ok ? 'Nome atualizado.' : null,
    });
    if (result.ok) {
      startTransition(() => router.refresh());
    }
  }

  async function handleReorder(familyIdx: number, direcao: 'up' | 'down'): Promise<void> {
    const f = families[familyIdx];
    if (f === undefined) {
      return;
    }
    patchFamily(familyIdx, { reorderingFlag: true, errorMessage: null, successMessage: null });
    const result = await reorderFamilyAction({
      companyId: props.companyId,
      jobFamily: f.jobFamily,
      direcao,
    });
    patchFamily(familyIdx, {
      reorderingFlag: false,
      errorMessage: result.ok ? null : result.message,
      successMessage: null,
    });
    if (result.ok) {
      startTransition(() => router.refresh());
    }
  }

  async function handleActivateCustom(): Promise<void> {
    const nome = modalName.trim();
    if (nome === '') {
      setModalError('Nome da nova família obrigatório.');
      return;
    }
    setModalSaving(true);
    setModalError(null);
    const result = await activateCustomSlotAction({
      companyId: props.companyId,
      nomeCustomizado: nome,
    });
    setModalSaving(false);
    if (!result.ok) {
      setModalError(result.message);
      return;
    }
    setModalOpen(false);
    setModalName('');
    startTransition(() => router.refresh());
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <Link
          href={`/super-admin/empresa/${props.companyId}/parametros`}
          style={{ fontSize: '13px', color: '#4B5563' }}
        >
          ← Voltar aos Parâmetros gerais
        </Link>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Famílias de função</h1>
        <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
          {props.companyNomeFantasia} · {activeFamilies.length} ativa(s) ·{' '}
          {props.pageData.customSlotsUsed} de {props.pageData.customSlotsTotal} slots customizados
          usados
        </div>
      </div>

      <div style={warningBoxStyle}>
        ⚠ Alterações nos pesos valem a partir do próximo fechamento mensal. Lançamentos já efetuados
        preservam os pesos vigentes na época. Motor do Eixo X nunca recalcula retroativamente.
      </div>

      {families.map((f, idx) => {
        const activeOnlyIdx = activeFamilies.findIndex((af) => af.jobFamily === f.jobFamily);
        const isFirstActive = f.ativo && activeOnlyIdx === 0;
        const isLastActive = f.ativo && activeOnlyIdx === activeFamilies.length - 1;
        return (
          <FamiliaCard
            key={f.jobFamily}
            familia={f}
            isFirstActive={isFirstActive}
            isLastActive={isLastActive}
            onChangeVar={(varIdx, field, value) => updateVariable(idx, varIdx, field, value)}
            onSave={() => void handleSaveFamily(idx)}
            onToggleActive={() => void handleToggleActive(idx)}
            onRename={(nome) => void handleRename(idx, nome)}
            onReorder={(dir) => void handleReorder(idx, dir)}
          />
        );
      })}

      {props.pageData.nextAvailableCustomSlot !== null ? (
        <button
          type="button"
          onClick={() => {
            setModalOpen(true);
            setModalName('');
            setModalError(null);
          }}
          style={addFamilyButtonStyle}
        >
          + Nova família customizada
        </button>
      ) : (
        <div style={allSlotsUsedBoxStyle}>
          Todos os 20 slots customizados estão em uso. Desative uma família customizada antes de
          criar outra.
        </div>
      )}

      {modalOpen ? (
        <ActivateCustomModal
          name={modalName}
          saving={modalSaving}
          error={modalError}
          onChangeName={setModalName}
          onCancel={() => {
            setModalOpen(false);
            setModalName('');
            setModalError(null);
          }}
          onConfirm={() => void handleActivateCustom()}
        />
      ) : null}

      {migrateOpen && migrateFromFamily !== null ? (
        <MigrateFamilyModal
          fromFamily={migrateFromFamily}
          fromLabel={
            families.find((fa) => fa.jobFamily === migrateFromFamily)?.displayLabel ??
            migrateFromFamily
          }
          fromCount={families.find((fa) => fa.jobFamily === migrateFromFamily)?.employeeCount ?? 0}
          toOptions={activeFamilies.filter(
            (fa) => fa.jobFamily !== migrateFromFamily && !fa.estrutural,
          )}
          toFamily={migrateToFamily}
          saving={migrateSaving}
          error={migrateError}
          onChangeToFamily={setMigrateToFamily}
          onCancel={() => {
            setMigrateOpen(false);
            setMigrateFromFamily(null);
            setMigrateToFamily('');
            setMigrateError(null);
          }}
          onConfirm={() => void handleMigrateAndDeactivate()}
        />
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------

interface FamiliaCardProps {
  readonly familia: FamiliaLocalState;
  readonly isFirstActive: boolean;
  readonly isLastActive: boolean;
  readonly onChangeVar: (
    varIdx: number,
    field: 'variableName' | 'unit' | 'weight',
    value: string | number,
  ) => void;
  readonly onSave: () => void;
  readonly onToggleActive: () => void;
  readonly onRename: (nomeCustomizado: string | null) => void;
  readonly onReorder: (direcao: 'up' | 'down') => void;
}

function FamiliaCard(props: FamiliaCardProps): JSX.Element {
  const f = props.familia;
  const total = sumWeights(f.variables);
  const savable = isFamiliaSavable(f.variables) && !f.savingFlag && f.ativo;
  // ME-1.17.3 — guard preventivo removido: desativar familia com
  // colaboradores agora abre modal canonico de migracao em massa
  // (handleToggleActive detecta employeeCount > 0 e desvia o fluxo).
  const toggleDisabled = f.estrutural || f.togglingFlag;

  return (
    <div style={cardStyle(f.ativo)}>
      <div style={cardHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          {f.ativo ? (
            <ReorderButtons
              disabled={f.reorderingFlag}
              isFirst={props.isFirstActive}
              isLast={props.isLastActive}
              onReorder={props.onReorder}
            />
          ) : null}
          <EditableTitle
            value={f.displayLabel}
            canonicalFallback={f.label}
            estrutural={f.estrutural}
            saving={f.renamingFlag}
            onSave={props.onRename}
          />
          {f.estrutural ? <Badge color="navy" text="Estrutural" /> : null}
          {!f.ativo ? <Badge color="gray" text="Desativada" /> : null}
          {f.isCustom ? <Badge color="teal" text="Customizada" /> : null}
          {f.employeeCount > 0 ? (
            <Badge color="info" text={`${f.employeeCount} colaborador(es)`} />
          ) : null}
        </div>
        <div style={weightSumStyle(total)}>Soma dos pesos: {total.toFixed(2)}% de 100%</div>
      </div>

      {f.estrutural ? (
        <div style={structuralNoteStyle}>Família estrutural — variáveis fixas.</div>
      ) : (
        <div style={standardNoteStyle}>
          Nome da família, nomes das variáveis, unidades e pesos são customizáveis para esta
          empresa.
        </div>
      )}

      {f.ativo ? (
        <div style={variablesGridStyle}>
          {f.variables.map((v, i) => (
            <div key={v.variableIndex} style={variableRowStyle}>
              <div>
                <div style={fieldLabelStyle}>Variável {v.variableIndex + 1}</div>
                <input
                  value={v.variableName}
                  readOnly={f.estrutural}
                  onChange={(e) => props.onChangeVar(i, 'variableName', e.target.value)}
                  style={inputStyle(f.estrutural)}
                />
              </div>
              <div>
                <div style={fieldLabelStyle}>Unidade</div>
                <input
                  value={v.unit}
                  readOnly={f.estrutural}
                  onChange={(e) => props.onChangeVar(i, 'unit', e.target.value)}
                  style={inputStyle(f.estrutural)}
                />
              </div>
              <div>
                <div style={fieldLabelStyle}>Peso (%)</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={v.weight}
                  onChange={(e) => props.onChangeVar(i, 'weight', e.target.value)}
                  style={inputStyle(false)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {f.errorMessage !== null ? <ErrorBox message={f.errorMessage} /> : null}
      {f.successMessage !== null ? <SuccessBox message={f.successMessage} /> : null}

      <div style={cardActionsStyle}>
        {!f.estrutural ? (
          <button
            type="button"
            onClick={props.onToggleActive}
            disabled={toggleDisabled}
            title={
              f.ativo && f.employeeCount > 0
                ? `${f.employeeCount} colaborador(es) serão migrados antes da desativação.`
                : undefined
            }
            style={toggleButtonStyle(f.ativo, toggleDisabled)}
          >
            {f.togglingFlag ? 'Processando…' : f.ativo ? 'Desativar família' : 'Reativar família'}
          </button>
        ) : (
          <div />
        )}
        {f.ativo ? (
          <button
            type="button"
            onClick={props.onSave}
            disabled={!savable}
            style={saveButtonStyle(savable)}
          >
            {f.savingFlag ? 'Salvando…' : 'Salvar variáveis'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReorderButtons(props: {
  readonly disabled: boolean;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onReorder: (direcao: 'up' | 'down') => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <button
        type="button"
        onClick={() => props.onReorder('up')}
        disabled={props.disabled || props.isFirst}
        aria-label="Mover para cima"
        style={reorderBtnStyle(props.disabled || props.isFirst)}
      >
        ▲
      </button>
      <button
        type="button"
        onClick={() => props.onReorder('down')}
        disabled={props.disabled || props.isLast}
        aria-label="Mover para baixo"
        style={reorderBtnStyle(props.disabled || props.isLast)}
      >
        ▼
      </button>
    </div>
  );
}

function EditableTitle(props: {
  readonly value: string;
  readonly canonicalFallback: string;
  readonly estrutural: boolean;
  readonly saving: boolean;
  readonly onSave: (nomeCustomizado: string | null) => void;
}): JSX.Element {
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>(props.value);

  if (props.estrutural) {
    return <span style={{ fontSize: '15px', fontWeight: 600 }}>{props.value}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(props.value);
          setEditing(true);
        }}
        style={editableTitleButtonStyle}
        title="Clique para renomear"
      >
        {props.value}
        <span style={{ fontSize: '11px', color: '#9CA3AF', marginLeft: '6px' }}>✎</span>
      </button>
    );
  }

  function commit(): void {
    const trimmed = draft.trim();
    const normalized = trimmed === '' || trimmed === props.canonicalFallback ? null : trimmed;
    setEditing(false);
    props.onSave(normalized);
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
        }
        if (e.key === 'Escape') {
          setEditing(false);
          setDraft(props.value);
        }
      }}
      disabled={props.saving}
      maxLength={60}
      style={editableTitleInputStyle}
    />
  );
}

function Badge(props: {
  readonly color: 'navy' | 'gray' | 'teal' | 'info';
  readonly text: string;
}): JSX.Element {
  const palette = {
    navy: { bg: '#EFF6FF', fg: '#1E3A8A' },
    gray: { bg: '#F3F4F6', fg: '#6B7280' },
    teal: { bg: '#CCFBF1', fg: '#0F766E' },
    info: { bg: '#FEF3C7', fg: '#92400E' },
  }[props.color];
  return (
    <span
      style={{
        fontSize: '11px',
        background: palette.bg,
        color: palette.fg,
        padding: '3px 8px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      {props.text}
    </span>
  );
}

function ErrorBox(props: { readonly message: string }): JSX.Element {
  return (
    <div role="alert" style={errorBoxStyle}>
      {props.message}
    </div>
  );
}

function SuccessBox(props: { readonly message: string }): JSX.Element {
  return (
    <div role="status" style={successBoxStyle}>
      {props.message}
    </div>
  );
}

function ActivateCustomModal(props: {
  readonly name: string;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onChangeName: (v: string) => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): JSX.Element {
  return (
    <div style={modalBackdropStyle} role="dialog" aria-modal="true">
      <div style={modalCardStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px 0' }}>
          Nova família customizada
        </h2>
        <p style={{ fontSize: '13px', color: '#6B7280', margin: '0 0 16px 0' }}>
          A família nasce com 4 variáveis genéricas (25% cada). Edite nomes, unidades e pesos no
          card após criar.
        </p>
        <label
          style={{ fontSize: '12px', color: '#374151', display: 'block', marginBottom: '4px' }}
        >
          Nome da família
        </label>
        <input
          autoFocus
          value={props.name}
          onChange={(e) => props.onChangeName(e.target.value)}
          placeholder="Ex.: Hunter B2B"
          maxLength={60}
          disabled={props.saving}
          style={{ ...inputStyle(false), marginBottom: '12px' }}
        />
        <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '16px' }}>
          Variáveis padrão criadas: {CUSTOM_FAMILY_VARIABLE_DEFAULTS.map((v) => v.name).join(', ')}.
        </div>
        {props.error !== null ? <ErrorBox message={props.error} /> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.saving}
            style={cancelButtonStyle}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.saving || props.name.trim() === ''}
            style={saveButtonStyle(!props.saving && props.name.trim() !== '')}
          >
            {props.saving ? 'Ativando…' : 'Ativar família'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MigrateFamilyModal(props: {
  readonly fromFamily: JobFamily;
  readonly fromLabel: string;
  readonly fromCount: number;
  readonly toOptions: readonly FamiliaLocalState[];
  readonly toFamily: JobFamily | '';
  readonly saving: boolean;
  readonly error: string | null;
  readonly onChangeToFamily: (v: JobFamily | '') => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): JSX.Element {
  const canConfirm = !props.saving && props.toFamily !== '' && props.toOptions.length > 0;
  return (
    <div style={modalBackdropStyle} role="dialog" aria-modal="true">
      <div style={modalCardStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px 0' }}>
          Desativar família com migração
        </h2>
        <p style={{ fontSize: '13px', color: '#6B7280', margin: '0 0 16px 0' }}>
          A família <strong>{props.fromLabel}</strong> tem{' '}
          <strong>{props.fromCount} colaborador(es) ativo(s)</strong>. Escolha para qual família
          eles serão migrados antes da desativação.
        </p>
        <label
          style={{ fontSize: '12px', color: '#374151', display: 'block', marginBottom: '4px' }}
        >
          Família destino
        </label>
        <select
          autoFocus
          value={props.toFamily}
          onChange={(e) => props.onChangeToFamily(e.target.value as JobFamily | '')}
          disabled={props.saving || props.toOptions.length === 0}
          style={{ ...inputStyle(false), marginBottom: '12px' }}
        >
          <option value="">Selecione…</option>
          {props.toOptions.map((opt) => (
            <option key={opt.jobFamily} value={opt.jobFamily}>
              {opt.displayLabel}
            </option>
          ))}
        </select>
        {props.toOptions.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#991B1B', marginBottom: '12px' }}>
            Nenhuma família ativa disponível como destino. Reative ou crie outra família antes.
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '16px' }}>
            Os colaboradores migrados herdam a nova família imediatamente. As metas individuais
            serão recarregadas pelo template da família destino no próximo acionamento de [Definir
            metas] pelo RH.
          </div>
        )}
        {props.error !== null ? <ErrorBox message={props.error} /> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.saving}
            style={cancelButtonStyle}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={!canConfirm}
            style={saveButtonStyle(canConfirm)}
          >
            {props.saving ? 'Migrando…' : 'Migrar e desativar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Styles canonicos inline
// -----------------------------------------------------------------------

const warningBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  marginBottom: '16px',
  border: '1px solid #FCD34D',
  background: '#FEF3C7',
  color: '#78350F',
  borderRadius: '6px',
  fontSize: '13px',
};

const addFamilyButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  marginTop: '12px',
  fontSize: '14px',
  fontWeight: 500,
  background: 'white',
  color: '#0F766E',
  border: '1.5px dashed #0F766E',
  borderRadius: '8px',
  cursor: 'pointer',
};

const allSlotsUsedBoxStyle: React.CSSProperties = {
  padding: '12px 16px',
  marginTop: '12px',
  border: '1px solid #D1D5DB',
  background: '#F9FAFB',
  color: '#6B7280',
  borderRadius: '8px',
  fontSize: '13px',
  textAlign: 'center',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '12px',
};

const variablesGridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const variableRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 100px',
  gap: '10px',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#6B7280',
  marginBottom: '3px',
};

const structuralNoteStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#1E3A8A',
  background: '#EFF6FF',
  padding: '6px 10px',
  borderRadius: '4px',
  marginBottom: '12px',
};

const standardNoteStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6B7280',
  marginBottom: '12px',
};

const errorBoxStyle: React.CSSProperties = {
  padding: '8px 12px',
  marginTop: '10px',
  border: '1px solid #FCA5A5',
  background: '#FEF2F2',
  color: '#991B1B',
  borderRadius: '6px',
  fontSize: '12px',
};

const successBoxStyle: React.CSSProperties = {
  padding: '8px 12px',
  marginTop: '10px',
  border: '1px solid #86EFAC',
  background: '#F0FDF4',
  color: '#166534',
  borderRadius: '6px',
  fontSize: '12px',
};

const cardActionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '12px',
};

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalCardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '8px',
  padding: '24px',
  width: '100%',
  maxWidth: '480px',
  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
};

const editableTitleButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontSize: '15px',
  fontWeight: 600,
  color: '#111827',
  textAlign: 'left',
};

const editableTitleInputStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  padding: '4px 8px',
  border: '1px solid #0F766E',
  borderRadius: '4px',
  outline: 'none',
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '13px',
  background: 'white',
  color: '#374151',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  cursor: 'pointer',
};

function cardStyle(ativo: boolean): React.CSSProperties {
  return {
    border: '1px solid ' + (ativo ? '#E5E7EB' : '#D1D5DB'),
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    background: ativo ? 'white' : '#F9FAFB',
    opacity: ativo ? 1 : 0.85,
  };
}

function inputStyle(readonly: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    boxSizing: 'border-box',
    background: readonly ? '#F3F4F6' : 'white',
    color: readonly ? '#6B7280' : '#111827',
  };
}

function weightSumStyle(total: number): React.CSSProperties {
  return {
    fontSize: '12px',
    color: Math.abs(total - 100) < 0.01 ? '#166534' : '#991B1B',
    whiteSpace: 'nowrap',
  };
}

function saveButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    fontSize: '13px',
    background: enabled ? '#0F766E' : '#E5E7EB',
    color: enabled ? 'white' : '#9CA3AF',
    border: '1px solid ' + (enabled ? '#0F766E' : '#E5E7EB'),
    borderRadius: '6px',
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}

function toggleButtonStyle(ativo: boolean, disabled: boolean): React.CSSProperties {
  const base = {
    padding: '7px 14px',
    fontSize: '12px',
    borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
  if (disabled) {
    return { ...base, background: '#F3F4F6', color: '#9CA3AF', border: '1px solid #E5E7EB' };
  }
  if (ativo) {
    return { ...base, background: 'white', color: '#991B1B', border: '1px solid #FCA5A5' };
  }
  return { ...base, background: 'white', color: '#0F766E', border: '1px solid #0F766E' };
}

function reorderBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '22px',
    height: '18px',
    fontSize: '9px',
    padding: 0,
    background: disabled ? '#F3F4F6' : 'white',
    color: disabled ? '#D1D5DB' : '#4B5563',
    border: '1px solid ' + (disabled ? '#E5E7EB' : '#D1D5DB'),
    borderRadius: '3px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}
