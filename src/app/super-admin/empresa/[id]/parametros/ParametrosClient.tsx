'use client';

// ROIP APP 9BOX — client component canonico da rota Bruno
// `/super-admin/empresa/[id]/parametros` (§13.1 Aba 1, ME-075).
//
// Renderiza o form canonico bit-exact das 9 secoes da Aba 1 §13.1 +
// rodape com botoes `[Cancelar alteracoes]` e `[Salvar alteracoes]` +
// toggle status ativa/inativa integrado a Secao 9.
//
// Escopo canonico bit-exact desta ME (S499b) — MVP funcional focado no
// CRUD completo do formulario + validacao server-side. Comportamentos
// avancados canonicos bit-exact (dirty state modais, banners de mismatch,
// toast global de sucesso) sao trativados como polimento em ME-080 (final
// do bloco B8).
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type JSX } from 'react';

import { saveParametrosAction, setCompanyStatusAction } from './actions';
import {
  MES_KICKOFF_PADRAO_OPCOES,
  MES_LABELS,
  SEGMENTO_LABELS,
  UF_VALUES,
  inputValueToNumber,
  numberToInputValue,
  type ParametrosFormValues,
} from './internals';

export interface ParametrosClientProps {
  readonly companyId: number;
  readonly companyNomeFantasia: string;
  readonly firstQuarterCalculated: boolean;
  readonly initialValues: ParametrosFormValues;
}

interface FormState {
  readonly values: ParametrosFormValues;
  readonly saving: boolean;
  readonly togglingStatus: boolean;
  readonly errorMessage: string | null;
  readonly successMessage: string | null;
}

export function ParametrosClient(props: ParametrosClientProps): JSX.Element {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({
    values: props.initialValues,
    saving: false,
    togglingStatus: false,
    errorMessage: null,
    successMessage: null,
  });

  function update<K extends keyof ParametrosFormValues>(
    key: K,
    value: ParametrosFormValues[K],
  ): void {
    setState((s) => ({
      ...s,
      values: { ...s.values, [key]: value },
      errorMessage: null,
      successMessage: null,
    }));
  }

  async function handleSave(): Promise<void> {
    setState((s) => ({ ...s, saving: true, errorMessage: null, successMessage: null }));
    const payload = {
      companyId: props.companyId,
      razaoSocial: state.values.razaoSocial,
      nomeFantasia: state.values.nomeFantasia,
      cnpj: state.values.cnpj,
      telefone: state.values.telefone,
      endereco: state.values.endereco,
      cidade: state.values.cidade,
      estado: state.values.estado,
      logoUrl: state.values.logoUrl,
      contatoPrincipalNome: state.values.contatoPrincipalNome,
      contatoPrincipalEmail: state.values.contatoPrincipalEmail,
      contatoRHNome: state.values.contatoRHNome,
      contatoRHEmail: state.values.contatoRHEmail,
      encarregadoLgpdNome: state.values.encarregadoLgpdNome,
      encarregadoLgpdEmail: state.values.encarregadoLgpdEmail,
      encarregadoLgpdTelefone: state.values.encarregadoLgpdTelefone,
      encarregadoLgpdPoliticaUrl: state.values.encarregadoLgpdPoliticaUrl,
      segmento: state.values.segmento,
      tipoAtividade: state.values.tipoAtividade,
      descricaoAtividade: state.values.descricaoAtividade,
      contextoMercado: state.values.contextoMercado,
      modoAnoFiscal: state.values.modoAnoFiscal,
      mesInicioAnoFiscal: state.values.mesInicioAnoFiscal,
      mesKickoff: state.values.mesKickoff,
      kickoffDate: state.values.kickoffDate,
      timezone: state.values.timezone,
      metaROIOperacional: state.values.metaROIOperacional,
      metaROITatico: state.values.metaROITatico,
      metaROIEstrategico: state.values.metaROIEstrategico,
      roiSegmentoMinimo: state.values.roiSegmentoMinimo,
      roiSegmentoMaximo: state.values.roiSegmentoMaximo,
      folhaPercMinima: state.values.folhaPercMinima,
      folhaPercMaxima: state.values.folhaPercMaxima,
      thresholdDesempenhoBaixo: state.values.thresholdDesempenhoBaixo,
      thresholdDesempenhoMedio: state.values.thresholdDesempenhoMedio,
      thresholdPlenitudeBaixo: state.values.thresholdPlenitudeBaixo,
      thresholdPlenitudeMedio: state.values.thresholdPlenitudeMedio,
    };
    const result = await saveParametrosAction(payload);
    if (result.ok) {
      setState((s) => ({
        ...s,
        saving: false,
        errorMessage: null,
        successMessage: 'Cadastro salvo com sucesso.',
      }));
      startTransition(() => router.refresh());
    } else {
      setState((s) => ({
        ...s,
        saving: false,
        errorMessage: result.message,
        successMessage: null,
      }));
    }
  }

  async function handleToggleStatus(): Promise<void> {
    const novoStatus: 'ativa' | 'inativa' = state.values.status === 'ativa' ? 'inativa' : 'ativa';
    setState((s) => ({
      ...s,
      togglingStatus: true,
      errorMessage: null,
      successMessage: null,
    }));
    const result = await setCompanyStatusAction({
      companyId: props.companyId,
      novoStatus,
    });
    if (result.ok) {
      setState((s) => ({
        ...s,
        togglingStatus: false,
        values: { ...s.values, status: result.data.status },
        errorMessage: null,
        successMessage: novoStatus === 'ativa' ? 'Empresa ativada.' : 'Empresa inativada.',
      }));
      startTransition(() => router.refresh());
    } else {
      setState((s) => ({
        ...s,
        togglingStatus: false,
        errorMessage: result.message,
        successMessage: null,
      }));
    }
  }

  const kickoffDateLocked = props.firstQuarterCalculated;

  return (
    <div style={{ padding: '24px', maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <Link
          href={`/super-admin/empresa/${props.companyId}`}
          style={{ fontSize: '13px', color: '#4B5563' }}
        >
          ← Voltar ao painel de {props.companyNomeFantasia}
        </Link>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Cadastro da empresa</h1>
          <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
            Aba: Parâmetros gerais · {props.companyNomeFantasia}
          </div>
        </div>
        <Link
          href={`/super-admin/empresa/${props.companyId}/familias`}
          style={{
            fontSize: '13px',
            padding: '8px 12px',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            color: '#111827',
            textDecoration: 'none',
          }}
        >
          Famílias de função →
        </Link>
      </div>

      {state.errorMessage !== null ? (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            marginBottom: '16px',
            border: '1px solid #FCA5A5',
            background: '#FEF2F2',
            color: '#991B1B',
            borderRadius: '6px',
            fontSize: '13px',
          }}
        >
          {state.errorMessage}
        </div>
      ) : null}

      {state.successMessage !== null ? (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            marginBottom: '16px',
            border: '1px solid #86EFAC',
            background: '#F0FDF4',
            color: '#166534',
            borderRadius: '6px',
            fontSize: '13px',
          }}
        >
          {state.successMessage}
        </div>
      ) : null}

      {/* Secao 1 — Dados da empresa */}
      <Section title="Seção 1 — Dados da empresa">
        <Grid2>
          <Field label="Razão social">
            <input
              value={state.values.razaoSocial}
              onChange={(e) => update('razaoSocial', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Nome fantasia">
            <input
              value={state.values.nomeFantasia}
              onChange={(e) => update('nomeFantasia', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="CNPJ (14 dígitos)">
            <input
              value={state.values.cnpj}
              onChange={(e) => update('cnpj', e.target.value.replace(/\D/g, ''))}
              maxLength={14}
              style={inputStyle}
            />
          </Field>
          <Field label="Telefone">
            <input
              value={state.values.telefone}
              onChange={(e) => update('telefone', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Endereço">
            <input
              value={state.values.endereco}
              onChange={(e) => update('endereco', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Cidade">
            <input
              value={state.values.cidade}
              onChange={(e) => update('cidade', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Estado (UF)">
            <select
              value={state.values.estado}
              onChange={(e) => update('estado', e.target.value)}
              style={inputStyle}
            >
              {UF_VALUES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </Field>
          <Field label="URL do logo (opcional)">
            <input
              value={state.values.logoUrl ?? ''}
              onChange={(e) => update('logoUrl', e.target.value === '' ? null : e.target.value)}
              style={inputStyle}
            />
          </Field>
        </Grid2>
      </Section>

      {/* Secao 2 — Contatos */}
      <Section title="Seção 2 — Contatos">
        <Grid2>
          <Field label="Nome do contato principal">
            <input
              value={state.values.contatoPrincipalNome}
              onChange={(e) => update('contatoPrincipalNome', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="E-mail do contato principal">
            <input
              type="email"
              value={state.values.contatoPrincipalEmail}
              onChange={(e) => update('contatoPrincipalEmail', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Nome do contato RH">
            <input
              value={state.values.contatoRHNome}
              onChange={(e) => update('contatoRHNome', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="E-mail do contato RH">
            <input
              type="email"
              value={state.values.contatoRHEmail}
              onChange={(e) => update('contatoRHEmail', e.target.value)}
              style={inputStyle}
            />
          </Field>
        </Grid2>
      </Section>

      {/* Secao 3 — Encarregado LGPD */}
      <Section title="Seção 3 — Encarregado de dados (LGPD)">
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '10px' }}>
          Nome e e-mail obrigatórios antes de ativar a empresa (§DOC 06 §19.8).
        </div>
        <Grid2>
          <Field label="Nome do encarregado">
            <input
              value={state.values.encarregadoLgpdNome ?? ''}
              onChange={(e) =>
                update('encarregadoLgpdNome', e.target.value === '' ? null : e.target.value)
              }
              style={inputStyle}
            />
          </Field>
          <Field label="E-mail do encarregado">
            <input
              type="email"
              value={state.values.encarregadoLgpdEmail ?? ''}
              onChange={(e) =>
                update('encarregadoLgpdEmail', e.target.value === '' ? null : e.target.value)
              }
              style={inputStyle}
            />
          </Field>
          <Field label="Telefone (opcional)">
            <input
              value={state.values.encarregadoLgpdTelefone ?? ''}
              onChange={(e) =>
                update('encarregadoLgpdTelefone', e.target.value === '' ? null : e.target.value)
              }
              style={inputStyle}
            />
          </Field>
          <Field label="URL política privacidade (opcional)">
            <input
              value={state.values.encarregadoLgpdPoliticaUrl ?? ''}
              onChange={(e) =>
                update('encarregadoLgpdPoliticaUrl', e.target.value === '' ? null : e.target.value)
              }
              style={inputStyle}
            />
          </Field>
        </Grid2>
      </Section>

      {/* Secao 4 — Perfil do negocio */}
      <Section title="Seção 4 — Perfil do negócio">
        <Grid2>
          <Field label="Segmento">
            <select
              value={state.values.segmento}
              onChange={(e) => update('segmento', e.target.value as typeof state.values.segmento)}
              style={inputStyle}
            >
              {SEGMENTO_LABELS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de atividade">
            <input
              value={state.values.tipoAtividade}
              onChange={(e) => update('tipoAtividade', e.target.value)}
              style={inputStyle}
            />
          </Field>
        </Grid2>
        <Field label="Descrição da atividade">
          <textarea
            value={state.values.descricaoAtividade}
            onChange={(e) => update('descricaoAtividade', e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
          />
        </Field>
        <Field label="Contexto de mercado / sazonalidade">
          <textarea
            value={state.values.contextoMercado}
            onChange={(e) => update('contextoMercado', e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
          />
        </Field>
      </Section>

      {/* Secao 5 — Ano fiscal e kick-off */}
      <Section title="Seção 5 — Ano fiscal e kick-off">
        {kickoffDateLocked ? (
          <div
            style={{
              fontSize: '12px',
              color: '#92400E',
              background: '#FEF3C7',
              padding: '8px 12px',
              borderRadius: '6px',
              marginBottom: '10px',
            }}
          >
            Ano fiscal e kick-off não podem mais ser alterados — primeiro trimestre já calculado.
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
          <label style={{ fontSize: '13px' }}>
            <input
              type="radio"
              name="modoAnoFiscal"
              checked={state.values.modoAnoFiscal === 'padrao'}
              disabled={kickoffDateLocked}
              onChange={() => {
                update('modoAnoFiscal', 'padrao');
                update('mesInicioAnoFiscal', 1);
              }}
            />{' '}
            Ciclo anual padrão
          </label>
          <label style={{ fontSize: '13px' }}>
            <input
              type="radio"
              name="modoAnoFiscal"
              checked={state.values.modoAnoFiscal === 'customizado'}
              disabled={kickoffDateLocked}
              onChange={() => update('modoAnoFiscal', 'customizado')}
            />{' '}
            Ciclo anual customizado
          </label>
        </div>
        <Grid2>
          <Field label="Mês de início do ano fiscal">
            <select
              value={state.values.mesInicioAnoFiscal}
              onChange={(e) => update('mesInicioAnoFiscal', Number(e.target.value))}
              disabled={state.values.modoAnoFiscal === 'padrao' || kickoffDateLocked}
              style={inputStyle}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {MES_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mês de kick-off">
            <select
              value={state.values.mesKickoff}
              onChange={(e) => update('mesKickoff', Number(e.target.value))}
              disabled={kickoffDateLocked}
              style={inputStyle}
            >
              {(state.values.modoAnoFiscal === 'padrao'
                ? MES_KICKOFF_PADRAO_OPCOES
                : Array.from({ length: 12 }, (_, i) => i + 1)
              ).map((m) => (
                <option key={m} value={m}>
                  {MES_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data efetiva do kick-off (YYYY-MM-DD)">
            <input
              type="date"
              value={state.values.kickoffDate}
              onChange={(e) => update('kickoffDate', e.target.value)}
              disabled={kickoffDateLocked}
              style={inputStyle}
            />
          </Field>
          <Field label="Fuso horário">
            <input
              value={state.values.timezone}
              onChange={(e) => update('timezone', e.target.value)}
              style={inputStyle}
            />
          </Field>
        </Grid2>
      </Section>

      {/* Secao 6 — Parametros de ROI */}
      <Section title="Seção 6 — Parâmetros de ROI">
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '10px' }}>
          Ajustes em metaROI* acionam recálculo retroativo (§DOC 03 §3.9).
        </div>
        <Grid2>
          <Field label="Meta ROI operacional (%)">
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={numberToInputValue(state.values.metaROIOperacional)}
              onChange={(e) => update('metaROIOperacional', inputValueToNumber(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Meta ROI tático (%)">
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={numberToInputValue(state.values.metaROITatico)}
              onChange={(e) => update('metaROITatico', inputValueToNumber(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Meta ROI estratégico (%)">
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={numberToInputValue(state.values.metaROIEstrategico)}
              onChange={(e) => update('metaROIEstrategico', inputValueToNumber(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="ROI mínimo segmento (%)">
            <input
              type="number"
              step="0.01"
              value={numberToInputValue(state.values.roiSegmentoMinimo)}
              onChange={(e) => update('roiSegmentoMinimo', inputValueToNumber(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="ROI máximo segmento (%)">
            <input
              type="number"
              step="0.01"
              value={numberToInputValue(state.values.roiSegmentoMaximo)}
              onChange={(e) => update('roiSegmentoMaximo', inputValueToNumber(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Folha mínima (% faturamento)">
            <input
              type="number"
              step="0.1"
              value={numberToInputValue(state.values.folhaPercMinima)}
              onChange={(e) => update('folhaPercMinima', inputValueToNumber(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Folha máxima (% faturamento)">
            <input
              type="number"
              step="0.1"
              value={numberToInputValue(state.values.folhaPercMaxima)}
              onChange={(e) => update('folhaPercMaxima', inputValueToNumber(e.target.value))}
              style={inputStyle}
            />
          </Field>
        </Grid2>
      </Section>

      {/* Secao 7 — Thresholds 9-Box */}
      <Section title="Seção 7 — Thresholds do 9-Box">
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '10px' }}>
          Alterações em thresholds nunca disparam recálculo retroativo (§DOC 03 §3.9).
        </div>
        <Grid2>
          <Field label="Desempenho baixo (< %)">
            <input
              type="number"
              min={0}
              max={100}
              value={state.values.thresholdDesempenhoBaixo}
              onChange={(e) => update('thresholdDesempenhoBaixo', Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Desempenho médio (< %)">
            <input
              type="number"
              min={0}
              max={100}
              value={state.values.thresholdDesempenhoMedio}
              onChange={(e) => update('thresholdDesempenhoMedio', Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Plenitude baixa (<)">
            <input
              type="number"
              min={0}
              max={100}
              value={state.values.thresholdPlenitudeBaixo}
              onChange={(e) => update('thresholdPlenitudeBaixo', Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Plenitude média (<)">
            <input
              type="number"
              min={0}
              max={100}
              value={state.values.thresholdPlenitudeMedio}
              onChange={(e) => update('thresholdPlenitudeMedio', Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
        </Grid2>
      </Section>

      {/* Secao 8 — Radar NR-1 */}
      <Section title="Seção 8 — Radar NR-1">
        <div style={{ fontSize: '13px', color: '#6B7280' }}>
          Os ciclos do Radar NR-1 são configurados livremente por RH e Bruno em calendário próprio —
          sem cadência automática anual ou semestral. Configure em <code>/nr1</code>.
        </div>
      </Section>

      {/* Secao 9 — Status */}
      <Section title="Seção 9 — Status">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', color: '#6B7280' }}>Status atual</div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>
              {state.values.status === 'ativa' ? 'Ativa' : 'Inativa'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleStatus()}
            disabled={state.togglingStatus}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              background: state.values.status === 'ativa' ? '#F3F4F6' : '#0F766E',
              color: state.values.status === 'ativa' ? '#111827' : 'white',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              cursor: state.togglingStatus ? 'not-allowed' : 'pointer',
            }}
          >
            {state.togglingStatus
              ? 'Aguarde…'
              : state.values.status === 'ativa'
                ? 'Inativar empresa'
                : 'Ativar empresa'}
          </button>
        </div>
      </Section>

      {/* Rodape */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          marginTop: '24px',
          borderTop: '1px solid #E5E7EB',
          paddingTop: '16px',
        }}
      >
        <button
          type="button"
          onClick={() => setState((s) => ({ ...s, values: props.initialValues }))}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            background: 'white',
            color: '#111827',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Cancelar alterações
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={state.saving}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            background: '#0F766E',
            color: 'white',
            border: '1px solid #0F766E',
            borderRadius: '6px',
            cursor: state.saving ? 'not-allowed' : 'pointer',
          }}
        >
          {state.saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
}

// ---- Presentational sub-helpers ----

function Section(props: { title: string; children: React.ReactNode }): JSX.Element {
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
          fontSize: '12px',
          fontWeight: 600,
          color: '#6B7280',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: '12px',
          paddingBottom: '6px',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

function Grid2(props: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '12px 16px',
      }}
    >
      {props.children}
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label style={{ display: 'block', marginBottom: '8px' }}>
      <div style={{ fontSize: '12px', color: '#374151', marginBottom: '4px' }}>{props.label}</div>
      {props.children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: '13px',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  background: 'white',
  color: '#111827',
  boxSizing: 'border-box',
};
