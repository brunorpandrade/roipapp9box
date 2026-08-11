'use client';

// ROIP APP 9BOX — client component canonico da rota Bruno
// `/super-admin/empresa/[id]/familias` (§13.1 Aba 2, ME-075).
//
// Renderiza o editor canonico bit-exact das 6 familias hard-coded × 4
// variaveis cada. Save por familia (§13.1 Aba 2 mockup linha 399). Botao
// Salvar desabilitado se soma dos pesos != 100 (mockup linha 427).
//
// Escopo canonico bit-exact desta ME (MVP funcional). Comportamentos
// avancados canonicos (modal reset padrao fabrica, banner mismatch,
// dirty state modais) sao tratados como polimento em ME-080.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type JSX } from 'react';

import { saveJobFamilyAction } from './actions';
import { isFamiliaSavable, sumWeights, type FamiliaState } from './internals';

export interface FamiliasClientProps {
  readonly companyId: number;
  readonly companyNomeFantasia: string;
  readonly initialFamilies: readonly FamiliaState[];
}

interface FamiliaLocalState extends FamiliaState {
  readonly savingFlag: boolean;
  readonly errorMessage: string | null;
  readonly successMessage: string | null;
}

export function FamiliasClient(props: FamiliasClientProps): JSX.Element {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [families, setFamilies] = useState<FamiliaLocalState[]>(
    props.initialFamilies.map((f) => ({
      ...f,
      savingFlag: false,
      errorMessage: null,
      successMessage: null,
    })),
  );

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
        return {
          ...f,
          variables: nextVars,
          errorMessage: null,
          successMessage: null,
        };
      }),
    );
  }

  async function handleSaveFamily(familyIdx: number): Promise<void> {
    setFamilies((prev) =>
      prev.map((f, i) =>
        i === familyIdx ? { ...f, savingFlag: true, errorMessage: null, successMessage: null } : f,
      ),
    );
    const f = families[familyIdx];
    if (f === undefined) {
      return;
    }
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
    setFamilies((prev) =>
      prev.map((fam, i) => {
        if (i !== familyIdx) {
          return fam;
        }
        return {
          ...fam,
          savingFlag: false,
          errorMessage: result.ok ? null : result.message,
          successMessage: result.ok ? 'Família salva com sucesso.' : null,
        };
      }),
    );
    if (result.ok) {
      startTransition(() => router.refresh());
    }
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
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Cadastro da empresa</h1>
        <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
          Aba: Famílias de função · {props.companyNomeFantasia}
        </div>
      </div>

      <div
        style={{
          padding: '10px 14px',
          marginBottom: '16px',
          border: '1px solid #FCD34D',
          background: '#FEF3C7',
          color: '#78350F',
          borderRadius: '6px',
          fontSize: '13px',
        }}
      >
        ⚠ Alterações aqui vigoram apenas para novos cadastros. Colaboradores já cadastrados mantêm
        sua configuração até o RH abrir [Definir metas] na ficha. Motor da Fase 2 nunca recalcula
        retroativamente.
      </div>

      {families.map((f, idx) => (
        <FamiliaCard
          key={f.jobFamily}
          familia={f}
          onChangeVar={(varIdx, field, value) => updateVariable(idx, varIdx, field, value)}
          onSave={() => void handleSaveFamily(idx)}
        />
      ))}
    </div>
  );
}

// ---- Sub-components ----

function FamiliaCard(props: {
  familia: FamiliaLocalState;
  onChangeVar: (
    varIdx: number,
    field: 'variableName' | 'unit' | 'weight',
    value: string | number,
  ) => void;
  onSave: () => void;
}): JSX.Element {
  const f = props.familia;
  const total = sumWeights(f.variables);
  const savable = isFamiliaSavable(f.variables) && !f.savingFlag;
  return (
    <div
      style={{
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        background: 'white',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <div>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>{f.label}</span>
          {f.estrutural ? (
            <span
              style={{
                marginLeft: '10px',
                fontSize: '11px',
                background: '#EFF6FF',
                color: '#1E3A8A',
                padding: '3px 8px',
                borderRadius: '4px',
              }}
            >
              Família estrutural
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: Math.abs(total - 100) < 0.01 ? '#166534' : '#991B1B',
          }}
        >
          Soma dos pesos: {total.toFixed(2)}% de 100%
        </div>
      </div>

      <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>
        {f.estrutural
          ? 'Família estrutural — nomes das variáveis e unidade são fixos. ' +
            'Apenas o peso padrão é customizável.'
          : 'Nome, unidade e peso padrão de cada variável são customizáveis ' +
            'para esta empresa.'}
      </div>

      {f.variables.map((v, i) => (
        <div
          key={v.variableIndex}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 100px',
            gap: '10px',
            marginBottom: '10px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '3px' }}>
              Variável {v.variableIndex + 1}
            </div>
            <input
              value={v.variableName}
              readOnly={f.estrutural}
              onChange={(e) => props.onChangeVar(i, 'variableName', e.target.value)}
              style={{
                ...inputStyle,
                background: f.estrutural ? '#F3F4F6' : 'white',
                color: f.estrutural ? '#6B7280' : '#111827',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '3px' }}>Unidade</div>
            <input
              value={v.unit}
              readOnly={f.estrutural}
              onChange={(e) => props.onChangeVar(i, 'unit', e.target.value)}
              style={{
                ...inputStyle,
                background: f.estrutural ? '#F3F4F6' : 'white',
                color: f.estrutural ? '#6B7280' : '#111827',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '3px' }}>Peso (%)</div>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={v.weight}
              onChange={(e) => props.onChangeVar(i, 'weight', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      ))}

      {f.errorMessage !== null ? (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            marginTop: '10px',
            border: '1px solid #FCA5A5',
            background: '#FEF2F2',
            color: '#991B1B',
            borderRadius: '6px',
            fontSize: '12px',
          }}
        >
          {f.errorMessage}
        </div>
      ) : null}

      {f.successMessage !== null ? (
        <div
          role="status"
          style={{
            padding: '8px 12px',
            marginTop: '10px',
            border: '1px solid #86EFAC',
            background: '#F0FDF4',
            color: '#166534',
            borderRadius: '6px',
            fontSize: '12px',
          }}
        >
          {f.successMessage}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '12px',
        }}
      >
        <button
          type="button"
          onClick={props.onSave}
          disabled={!savable}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            background: savable ? '#0F766E' : '#E5E7EB',
            color: savable ? 'white' : '#9CA3AF',
            border: '1px solid ' + (savable ? '#0F766E' : '#E5E7EB'),
            borderRadius: '6px',
            cursor: savable ? 'pointer' : 'not-allowed',
          }}
        >
          {f.savingFlag ? 'Salvando…' : 'Salvar família'}
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: '13px',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  boxSizing: 'border-box',
};
