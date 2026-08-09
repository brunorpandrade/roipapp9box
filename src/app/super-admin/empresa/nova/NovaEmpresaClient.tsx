'use client';

// ROIP APP 9BOX — client component /super-admin/empresa/nova
// (ME-Rota-C-D074 — fechamento canonico bit-exact de D074).
//
// Origem canonica:
// - DOC 05 §13.1 (Aba 1 "Parametros gerais" — 9 secoes canonicas com
//   save unico bit-exact). Referencia visual: `cadastro_empresa_v1.html`
//   + `delta_cadastro_empresa_lgpd_v1.html`.
// - DOC 05 §18.7 (mensagens canonicas literais bit-exact — toast verde
//   sucesso, toast vermelho erros).
// - DOC 05 §5.4 (redirect canonico pos-save para /super-admin/empresa/[id]).
// - DOC 01 §4.2 (35 campos canonicos bit-exact).
// - CC068 canonizada em ME-070 — helpers aqui NAO no page.tsx.
//
// Escopo canonico bit-exact do client component:
// - 9 secoes canonicas bit-exact §13.1 renderizadas na ordem canonica.
// - Toggle canonico bit-exact §13.1 Ano fiscal: `padrao` (default) ou
//   `customizado`. Padrao: mesInicio read-only Janeiro; mesKickoff select
//   {Jan,Abr,Jul,Out}. Customizado: ambos select 1-12.
// - Save unico bit-exact via `criarEmpresaAction`; toast verde §18.7 +
//   redirect §5.4 pos-sucesso.
// - Aba 2 (Familias de funcao) ausente na criacao — habilitada apenas
//   apos primeiro save (§13.1 linha 1468).
//
// **RV-13.** Cada export tem chamador na propria ME:
// - `NovaEmpresaClient` → `page.tsx` (mesma rota).

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type JSX,
} from 'react';
import { useRouter } from 'next/navigation';

import { COLORS } from '../../../../lib/design-tokens/colors';
import {
  MES_KICKOFF_PADRAO_PERMITIDO,
  MSG_SUCESSO_SALVAR,
  SEGMENTO_CANONICO_VALORES,
  type SegmentoCanonico,
} from '../../../../lib/company/createCompanyInput';

import { criarEmpresaAction } from './actions';

// ============================================================
// Estados brasileiros canonicos bit-exact (27 UFs — §13.1)
// ============================================================

const UFS_BRASIL = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

const MESES_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

// ============================================================
// Form state canonico bit-exact
// ============================================================

interface FormState {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
  logoUrl: string;
  contatoPrincipalNome: string;
  contatoPrincipalEmail: string;
  contatoRHNome: string;
  contatoRHEmail: string;
  encarregadoLgpdNome: string;
  encarregadoLgpdEmail: string;
  encarregadoLgpdTelefone: string;
  encarregadoLgpdPoliticaUrl: string;
  segmento: SegmentoCanonico | '';
  tipoAtividade: string;
  descricaoAtividade: string;
  contextoMercado: string;
  modoAnoFiscal: 'padrao' | 'customizado';
  mesInicioAnoFiscal: number;
  mesKickoff: number | null;
  kickoffDate: string;
  metaROIOperacional: string;
  metaROITatico: string;
  metaROIEstrategico: string;
  roiSegmentoMinimo: string;
  roiSegmentoMaximo: string;
  folhaPercMinima: string;
  folhaPercMaxima: string;
  thresholdDesempenhoBaixo: number;
  thresholdDesempenhoMedio: number;
  thresholdPlenitudeBaixo: number;
  thresholdPlenitudeMedio: number;
}

const INITIAL_STATE: FormState = {
  razaoSocial: '',
  nomeFantasia: '',
  cnpj: '',
  telefone: '',
  endereco: '',
  cidade: '',
  estado: '',
  logoUrl: '',
  contatoPrincipalNome: '',
  contatoPrincipalEmail: '',
  contatoRHNome: '',
  contatoRHEmail: '',
  encarregadoLgpdNome: '',
  encarregadoLgpdEmail: '',
  encarregadoLgpdTelefone: '',
  encarregadoLgpdPoliticaUrl: '',
  segmento: '',
  tipoAtividade: '',
  descricaoAtividade: '',
  contextoMercado: '',
  modoAnoFiscal: 'padrao',
  mesInicioAnoFiscal: 1,
  mesKickoff: null,
  kickoffDate: '',
  metaROIOperacional: '',
  metaROITatico: '',
  metaROIEstrategico: '',
  roiSegmentoMinimo: '',
  roiSegmentoMaximo: '',
  folhaPercMinima: '',
  folhaPercMaxima: '',
  thresholdDesempenhoBaixo: 60,
  thresholdDesempenhoMedio: 85,
  thresholdPlenitudeBaixo: 50,
  thresholdPlenitudeMedio: 75,
};

// ============================================================
// Estilos canonicos bit-exact (design tokens)
// ============================================================

const sectionStyle: CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: 20,
  marginBottom: 20,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.text.tertiary,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 12,
  paddingBottom: 6,
  borderBottom: `1px solid ${COLORS.border.default}`,
};

const fieldGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 14,
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: COLORS.text.secondary,
  marginBottom: 4,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  fontSize: 13,
  color: COLORS.text.primary,
  background: '#FFFFFF',
  boxSizing: 'border-box',
};

const noteStyle: CSSProperties = {
  fontSize: 12,
  color: COLORS.text.secondary,
  fontStyle: 'italic',
  marginTop: 4,
};

// ============================================================
// Component
// ============================================================

export function NovaEmpresaClient(): JSX.Element {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(INITIAL_STATE), [form]);

  const mesKickoffOptions = useMemo(() => {
    if (form.modoAnoFiscal === 'padrao') {
      return MES_KICKOFF_PADRAO_PERMITIDO.map((mes) => ({
        value: mes,
        label: MESES_LABELS[mes - 1]!,
      }));
    }
    return MESES_LABELS.map((label, idx) => ({ value: idx + 1, label }));
  }, [form.modoAnoFiscal]);

  const handleCancel = useCallback(() => {
    if (!dirty) return;
    const confirmed = window.confirm(
      'Deseja descartar todas as alterações não salvas em Parâmetros gerais?',
    );
    if (confirmed) {
      setForm(INITIAL_STATE);
      setToast(null);
    }
  }, [dirty]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setToast(null);

      // Validacao mininima client-side canonica bit-exact — server rejeita
      // definitivamente, mas front-end antecipa mensagens §18.7.
      if (form.segmento === '') {
        setToast({ kind: 'error', message: 'Selecione um segmento.' });
        return;
      }
      if (form.mesKickoff === null) {
        setToast({ kind: 'error', message: 'Selecione o mês de kick-off.' });
        return;
      }
      if (form.kickoffDate === '') {
        setToast({ kind: 'error', message: 'Informe a data de kick-off.' });
        return;
      }

      setSaving(true);
      try {
        const parseNumber = (v: string): number | undefined => {
          if (v.trim() === '') return undefined;
          const parsed = Number(v);
          return Number.isFinite(parsed) ? parsed : undefined;
        };

        const result = await criarEmpresaAction({
          razaoSocial: form.razaoSocial,
          nomeFantasia: form.nomeFantasia,
          cnpj: form.cnpj.replace(/\D/g, ''),
          telefone: form.telefone,
          endereco: form.endereco,
          cidade: form.cidade,
          estado: form.estado,
          logoUrl: form.logoUrl === '' ? undefined : form.logoUrl,
          contatoPrincipalNome: form.contatoPrincipalNome,
          contatoPrincipalEmail: form.contatoPrincipalEmail,
          contatoRHNome: form.contatoRHNome,
          contatoRHEmail: form.contatoRHEmail,
          encarregadoLgpdNome:
            form.encarregadoLgpdNome === '' ? undefined : form.encarregadoLgpdNome,
          encarregadoLgpdEmail:
            form.encarregadoLgpdEmail === '' ? undefined : form.encarregadoLgpdEmail,
          encarregadoLgpdTelefone:
            form.encarregadoLgpdTelefone === '' ? undefined : form.encarregadoLgpdTelefone,
          encarregadoLgpdPoliticaUrl:
            form.encarregadoLgpdPoliticaUrl === '' ? undefined : form.encarregadoLgpdPoliticaUrl,
          segmento: form.segmento,
          tipoAtividade: form.tipoAtividade,
          descricaoAtividade: form.descricaoAtividade,
          contextoMercado: form.contextoMercado,
          modoAnoFiscal: form.modoAnoFiscal,
          mesInicioAnoFiscal: form.mesInicioAnoFiscal,
          mesKickoff: form.mesKickoff,
          kickoffDate: form.kickoffDate,
          timezone: 'America/Sao_Paulo',
          metaROIOperacional: parseNumber(form.metaROIOperacional),
          metaROITatico: parseNumber(form.metaROITatico),
          metaROIEstrategico: parseNumber(form.metaROIEstrategico),
          roiSegmentoMinimo: parseNumber(form.roiSegmentoMinimo),
          roiSegmentoMaximo: parseNumber(form.roiSegmentoMaximo),
          folhaPercMinima: parseNumber(form.folhaPercMinima),
          folhaPercMaxima: parseNumber(form.folhaPercMaxima),
          thresholdDesempenhoBaixo: form.thresholdDesempenhoBaixo,
          thresholdDesempenhoMedio: form.thresholdDesempenhoMedio,
          thresholdPlenitudeBaixo: form.thresholdPlenitudeBaixo,
          thresholdPlenitudeMedio: form.thresholdPlenitudeMedio,
        });

        if (result.success) {
          setToast({ kind: 'success', message: MSG_SUCESSO_SALVAR });
          // §5.4 DOC 05 — redirect canonico bit-exact para dashboard da
          // empresa recem-criada.
          router.push(`/super-admin/empresa/${result.companyId}`);
        } else {
          setToast({ kind: 'error', message: result.canonicalMessage });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar.';
        setToast({ kind: 'error', message });
      } finally {
        setSaving(false);
      }
    },
    [form, router],
  );

  return (
    <form onSubmit={handleSubmit}>
      {toast !== null && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
            color: '#FFFFFF',
            background: toast.kind === 'success' ? '#16A34A' : '#DC2626',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Secao 1 — Dados da empresa (§13.1) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Dados da empresa</div>
        <div style={fieldGridStyle}>
          <div>
            <label style={labelStyle}>Razão social</label>
            <input
              style={inputStyle}
              value={form.razaoSocial}
              onChange={(e) => updateField('razaoSocial', e.target.value)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Nome fantasia</label>
            <input
              style={inputStyle}
              value={form.nomeFantasia}
              onChange={(e) => updateField('nomeFantasia', e.target.value)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>CNPJ (14 dígitos)</label>
            <input
              style={inputStyle}
              value={form.cnpj}
              onChange={(e) => updateField('cnpj', e.target.value)}
              placeholder="00000000000000"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Telefone</label>
            <input
              style={inputStyle}
              value={form.telefone}
              onChange={(e) => updateField('telefone', e.target.value)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Endereço</label>
            <input
              style={inputStyle}
              value={form.endereco}
              onChange={(e) => updateField('endereco', e.target.value)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Cidade</label>
            <input
              style={inputStyle}
              value={form.cidade}
              onChange={(e) => updateField('cidade', e.target.value)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Estado (UF)</label>
            <select
              style={inputStyle}
              value={form.estado}
              onChange={(e) => updateField('estado', e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {UFS_BRASIL.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Logo da empresa (URL — opcional)</label>
            <input
              style={inputStyle}
              value={form.logoUrl}
              onChange={(e) => updateField('logoUrl', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Secao 2 — Contatos (§13.1) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Contatos</div>
        <div style={fieldGridStyle}>
          <div>
            <label style={labelStyle}>Nome do contato principal</label>
            <input
              style={inputStyle}
              value={form.contatoPrincipalNome}
              onChange={(e) => updateField('contatoPrincipalNome', e.target.value)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>E-mail do contato principal</label>
            <input
              type="email"
              style={inputStyle}
              value={form.contatoPrincipalEmail}
              onChange={(e) => updateField('contatoPrincipalEmail', e.target.value)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Nome do contato RH</label>
            <input
              style={inputStyle}
              value={form.contatoRHNome}
              onChange={(e) => updateField('contatoRHNome', e.target.value)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>E-mail do contato RH</label>
            <input
              type="email"
              style={inputStyle}
              value={form.contatoRHEmail}
              onChange={(e) => updateField('contatoRHEmail', e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      {/* Secao 3 — Encarregado de dados LGPD (§13.1 / FASE_PRONTIDAO §8.4) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Encarregado de dados (LGPD)</div>
        <div style={fieldGridStyle}>
          <div>
            <label style={labelStyle}>Nome do encarregado</label>
            <input
              style={inputStyle}
              value={form.encarregadoLgpdNome}
              onChange={(e) => updateField('encarregadoLgpdNome', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>E-mail do encarregado</label>
            <input
              type="email"
              style={inputStyle}
              value={form.encarregadoLgpdEmail}
              onChange={(e) => updateField('encarregadoLgpdEmail', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Telefone (opcional)</label>
            <input
              style={inputStyle}
              value={form.encarregadoLgpdTelefone}
              onChange={(e) => updateField('encarregadoLgpdTelefone', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>URL da política de privacidade (opcional)</label>
            <input
              style={inputStyle}
              value={form.encarregadoLgpdPoliticaUrl}
              onChange={(e) => updateField('encarregadoLgpdPoliticaUrl', e.target.value)}
            />
          </div>
        </div>
        <div style={noteStyle}>
          Nome e e-mail obrigatórios apenas antes de ativar a empresa (§4.2 nota canônica).
        </div>
      </div>

      {/* Secao 4 — Perfil do negocio (§13.1) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Perfil do negócio</div>
        <div style={fieldGridStyle}>
          <div>
            <label style={labelStyle}>Segmento</label>
            <select
              style={inputStyle}
              value={form.segmento}
              onChange={(e) => updateField('segmento', e.target.value as SegmentoCanonico | '')}
              required
            >
              <option value="">Selecione…</option>
              {SEGMENTO_CANONICO_VALORES.map((seg) => (
                <option key={seg} value={seg}>
                  {seg}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tipo de atividade</label>
            <input
              style={inputStyle}
              value={form.tipoAtividade}
              onChange={(e) => updateField('tipoAtividade', e.target.value)}
              required
            />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Descrição da atividade</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              value={form.descricaoAtividade}
              onChange={(e) => updateField('descricaoAtividade', e.target.value)}
              required
            />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Contexto de mercado / sazonalidade</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              value={form.contextoMercado}
              onChange={(e) => updateField('contextoMercado', e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      {/* Secao 5 — Ano fiscal e kick-off (§13.1) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Ano fiscal e kick-off</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              background: form.modoAnoFiscal === 'padrao' ? COLORS.accent.teal : '#FFFFFF',
              color: form.modoAnoFiscal === 'padrao' ? '#FFFFFF' : COLORS.text.primary,
              cursor: 'pointer',
              fontSize: 13,
            }}
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                modoAnoFiscal: 'padrao',
                mesInicioAnoFiscal: 1,
                mesKickoff: null,
              }))
            }
          >
            Ciclo anual padrão
          </button>
          <button
            type="button"
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              background: form.modoAnoFiscal === 'customizado' ? COLORS.accent.teal : '#FFFFFF',
              color: form.modoAnoFiscal === 'customizado' ? '#FFFFFF' : COLORS.text.primary,
              cursor: 'pointer',
              fontSize: 13,
            }}
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                modoAnoFiscal: 'customizado',
                mesKickoff: null,
              }))
            }
          >
            Ciclo anual customizado
          </button>
        </div>
        <div style={fieldGridStyle}>
          <div>
            <label style={labelStyle}>Mês de início do ano fiscal</label>
            {form.modoAnoFiscal === 'padrao' ? (
              <input style={{ ...inputStyle, background: '#F5F5F5' }} value="Janeiro" readOnly />
            ) : (
              <select
                style={inputStyle}
                value={form.mesInicioAnoFiscal}
                onChange={(e) => updateField('mesInicioAnoFiscal', Number(e.target.value))}
              >
                {MESES_LABELS.map((label, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label style={labelStyle}>Mês de kick-off</label>
            <select
              style={inputStyle}
              value={form.mesKickoff ?? ''}
              onChange={(e) => updateField('mesKickoff', Number(e.target.value))}
              required
            >
              <option value="">Selecione…</option>
              {mesKickoffOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Data efetiva do kick-off</label>
            <input
              type="date"
              style={inputStyle}
              value={form.kickoffDate}
              onChange={(e) => updateField('kickoffDate', e.target.value)}
              required
            />
          </div>
        </div>
        <div style={noteStyle}>
          O mês de início do ano fiscal e o mês de kick-off não poderão ser alterados após o
          encerramento do primeiro trimestre. Defina com atenção.
        </div>
      </div>

      {/* Secao 6 — Parametros de ROI (§13.1) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Parâmetros de ROI</div>
        <div style={{ ...noteStyle, marginBottom: 12 }}>
          Todos os campos abaixo são opcionais e podem ficar em branco. Ajustes posteriores acionam
          recálculo retroativo de todos os trimestres já calculados.
        </div>
        <div style={fieldGridStyle}>
          <div>
            <label style={labelStyle}>ROI mínimo do segmento (%)</label>
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.roiSegmentoMinimo}
              onChange={(e) => updateField('roiSegmentoMinimo', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>ROI máximo do segmento (%)</label>
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.roiSegmentoMaximo}
              onChange={(e) => updateField('roiSegmentoMaximo', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Folha mínima saudável (%)</label>
            <input
              type="number"
              step="0.1"
              style={inputStyle}
              value={form.folhaPercMinima}
              onChange={(e) => updateField('folhaPercMinima', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Folha máxima saudável (%)</label>
            <input
              type="number"
              step="0.1"
              style={inputStyle}
              value={form.folhaPercMaxima}
              onChange={(e) => updateField('folhaPercMaxima', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Meta de ROI — Operacional (%)</label>
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.metaROIOperacional}
              onChange={(e) => updateField('metaROIOperacional', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Meta de ROI — Tático (%)</label>
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.metaROITatico}
              onChange={(e) => updateField('metaROITatico', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Meta de ROI — Estratégico (%)</label>
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.metaROIEstrategico}
              onChange={(e) => updateField('metaROIEstrategico', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Secao 7 — Thresholds do 9-Box (§13.1) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Thresholds do 9-Box</div>
        <div style={{ ...noteStyle, marginBottom: 12 }}>
          Valores de fábrica pré-preenchidos. Editáveis a qualquer momento; alteração não recalcula
          trimestres já fechados.
        </div>
        <div style={fieldGridStyle}>
          <div>
            <label style={labelStyle}>Desempenho Baixo — abaixo de (%)</label>
            <input
              type="number"
              style={inputStyle}
              value={form.thresholdDesempenhoBaixo}
              onChange={(e) => updateField('thresholdDesempenhoBaixo', Number(e.target.value))}
              min={0}
              max={100}
            />
          </div>
          <div>
            <label style={labelStyle}>Desempenho Médio — abaixo de (%)</label>
            <input
              type="number"
              style={inputStyle}
              value={form.thresholdDesempenhoMedio}
              onChange={(e) => updateField('thresholdDesempenhoMedio', Number(e.target.value))}
              min={0}
              max={100}
            />
          </div>
          <div>
            <label style={labelStyle}>Plenitude Baixa — abaixo de</label>
            <input
              type="number"
              style={inputStyle}
              value={form.thresholdPlenitudeBaixo}
              onChange={(e) => updateField('thresholdPlenitudeBaixo', Number(e.target.value))}
              min={0}
              max={100}
            />
          </div>
          <div>
            <label style={labelStyle}>Plenitude Média — abaixo de</label>
            <input
              type="number"
              style={inputStyle}
              value={form.thresholdPlenitudeMedio}
              onChange={(e) => updateField('thresholdPlenitudeMedio', Number(e.target.value))}
              min={0}
              max={100}
            />
          </div>
        </div>
      </div>

      {/* Secao 8 — Radar NR-1 (§13.1 — nota canonica) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Radar NR-1</div>
        <div style={noteStyle}>
          Os ciclos do Radar NR-1 são configurados livremente por RH e Bruno em calendário próprio —
          sem cadência automática anual ou semestral. Configure em <code>/nr1</code>.
        </div>
      </div>

      {/* Secao 9 — Status (§13.1 — sempre inativa ao criar) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 12,
              background: '#F5F5F5',
              color: COLORS.text.secondary,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Inativa
          </span>
          <span style={noteStyle}>Sempre inativa ao criar (§9 §13.1 DOC 05).</span>
        </div>
      </div>

      {/* Rodape (§13.1) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 8,
          paddingTop: 16,
          borderTop: `1px solid ${COLORS.border.default}`,
        }}
      >
        {dirty && (
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              background: '#FFFFFF',
              color: COLORS.text.primary,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Cancelar alterações
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '10px 18px',
            borderRadius: 6,
            border: 'none',
            background: saving ? '#94A3B8' : COLORS.accent.teal,
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}
