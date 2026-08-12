// ROIP APP 9BOX — ME-078b canonico — ColaboradorForm (§13.4 + §13.5).
//
// Formulario compartilhado entre `/colaborador/novo` e
// `/colaborador/[employeeId]/editar` do Painel Super Admin dentro-de-
// empresa. Sete secoes canonicas bit-exact do mockup
// `cadastro_colaborador_v1.html` + variacoes de edicao do
// `edicao_colaborador_v1.html`.
//
// Decisoes canonicas ME-078b aplicadas bit-exact:
//   D1  — Cargo obrigatorio (VARCHAR(100)) integrado ao schema.
//   D2  — Telefone omitido (mockup + schema alinhados sem telefone).
//   D3  — Foto como avatar auto-gerado por iniciais (mockup literal).
//   D5  — [Enviar primeiro acesso] disabled S503 com tooltip canonico.
//   D6  — Autocomplete lider direto polimorfico (employee | clevel).
//   D7  — [Definir metas] disabled S503 com tooltip canonico.
//   D9  — Toggle RF abre ModalTransferenciaRF quando ha titular vigente.
//
// Este arquivo entrega apenas o SHAPE VISUAL do form. Estado, side
// effects e chamadas tRPC vivem nos Clients (ColaboradorNovoClient e
// ColaboradorEditarClient). Padrao S366 canonizado do CLevelForm.

'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';

/** §13.4 canonizado — 6 familias hard-coded (DOC canonico documental). */
export const JOB_FAMILY_OPTIONS = [
  {
    id: 'vendas_comercial',
    titulo: 'Vendas e comercial',
    descricao:
      'Cargos de vendas, prospecção, negociação, gestão de carteira e resultados comerciais.',
  },
  {
    id: 'producao_operacoes',
    titulo: 'Produção e operações',
    descricao: 'Cargos de execução operacional, produção, logística, manutenção e processos.',
  },
  {
    id: 'tecnico_especialista',
    titulo: 'Técnico especialista',
    descricao: 'Cargos com conhecimento técnico especializado, engenharia, TI e P&D.',
  },
  {
    id: 'administrativo_suporte',
    titulo: 'Administrativo e suporte',
    descricao: 'Cargos de apoio administrativo, financeiro, contábil, jurídico e RH.',
  },
  {
    id: 'atendimento_relacionamento',
    titulo: 'Atendimento e relacionamento',
    descricao: 'Cargos de atendimento ao cliente, pós-venda, suporte e experiência do cliente.',
  },
  {
    id: 'lideranca_gestao',
    titulo: 'Liderança e gestão',
    descricao: 'Cargos com pessoas subordinadas — coordenadores, gerentes e diretores.',
  },
] as const;

export type JobFamilyId = (typeof JOB_FAMILY_OPTIONS)[number]['id'];

/** §4.5 canonico documental — 19 departamentos hard-coded. */
export const DEPARTAMENTO_OPTIONS = [
  'Comercial',
  'Marketing',
  'Operações',
  'Produção',
  'Logística',
  'Compras',
  'Financeiro',
  'Contabilidade',
  'Recursos Humanos',
  'Tecnologia da Informação',
  'Jurídico',
  'Qualidade',
  'Manutenção',
  'Projetos',
  'Atendimento ao Cliente',
  'Pós-venda',
  'Administrativo',
  'Diretoria',
  'Outros',
] as const;

export type DepartamentoId = (typeof DEPARTAMENTO_OPTIONS)[number];

/** §13.4 canonico — shape completo do formulario. */
export interface ColaboradorFormValues {
  name: string;
  cpf: string;
  email: string;
  dataNascimento: string;
  dataAdmissao: string;
  cargo: string;
  cbo: string;
  descricaoCBO: string;
  departamento: DepartamentoId | '';
  senioridade: 'junior' | 'pleno' | 'senior' | '';
  nivelHierarquico: 'operacional' | 'tatico' | 'estrategico' | '';
  jobFamily: JobFamilyId | '';
  isRH: boolean;
  isLider: boolean;
  isResponsavelFinanceiro: boolean;
  liderInicial: { tipo: 'employee' | 'clevel'; id: number; label: string } | null;
}

export const EMPTY_COLABORADOR_FORM_VALUES: ColaboradorFormValues = {
  name: '',
  cpf: '',
  email: '',
  dataNascimento: '',
  dataAdmissao: '',
  cargo: '',
  cbo: '',
  descricaoCBO: '',
  departamento: '',
  senioridade: '',
  nivelHierarquico: '',
  jobFamily: '',
  isRH: false,
  isLider: false,
  isResponsavelFinanceiro: false,
  liderInicial: null,
};

export interface LiderCandidate {
  readonly tipo: 'employee' | 'clevel';
  readonly id: number;
  readonly name: string;
  readonly cargo: string;
  readonly departamento: string;
}

export interface ColaboradorFormProps {
  readonly mode: 'novo' | 'editar';
  readonly initialValues: ColaboradorFormValues;
  readonly onValuesChange: (v: ColaboradorFormValues) => void;
  /** Nome do titular RF vigente (null se empresa sem RF). Toggle RF §5.6. */
  readonly currentRFName: string | null;
  /** Callback ao tentar alternar toggle RF. Caller decide se abre modal ou aplica direto. */
  readonly onToggleRFAttempt: (nextValue: boolean) => void;
  /** CPF read-only na edicao (§13.5 canonico). */
  readonly cpfReadonly: boolean;
  /** Busca canonica §14.3 — caller retorna candidatos por termo (fetch). */
  readonly searchLiderCandidates: (query: string) => Promise<readonly LiderCandidate[]>;
  /** Preset canonico §13.9 — cadastro de RH pre-ativa isRH. */
  readonly presetIsRH?: boolean;
}

// ============================================================
// Constantes de estilo (bit-exact do padrao CLevelForm ME-078a)
// ============================================================

const SECTION_CARD_STYLE = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  padding: 20,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 12,
};

const SECTION_TITLE_STYLE = {
  fontSize: 15,
  fontWeight: 600,
  color: COLORS.text.primary,
  margin: 0,
  paddingBottom: 8,
  borderBottom: `1px solid ${COLORS.border.divider}`,
};

const FIELD_LABEL_STYLE = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.text.secondary,
  marginBottom: 4,
};

const FIELD_INPUT_STYLE = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  background: COLORS.background.card,
  color: COLORS.text.primary,
  boxSizing: 'border-box' as const,
};

const FIELD_INPUT_READONLY_STYLE = {
  ...FIELD_INPUT_STYLE,
  background: COLORS.background.elevated,
  color: COLORS.text.tertiary,
  cursor: 'not-allowed' as const,
};

const GRID_2_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
};

const GRID_3_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 12,
};

const FAMILIA_CARD_STYLE_BASE = {
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: 12,
  cursor: 'pointer' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
  background: COLORS.background.card,
};

const FAMILIA_CARD_SELECTED_STYLE = {
  ...FAMILIA_CARD_STYLE_BASE,
  borderColor: COLORS.accent.teal,
  borderWidth: 2,
  background: COLORS.badge.tealClaroBgAlt,
};

const TOGGLE_ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 0',
};

const TOGGLE_TRACK_STYLE = (isOn: boolean) => ({
  width: 40,
  height: 22,
  borderRadius: 999,
  background: isOn ? COLORS.accent.teal : COLORS.border.default,
  position: 'relative' as const,
  cursor: 'pointer' as const,
  transition: 'background 0.15s',
});

const TOGGLE_KNOB_STYLE = (isOn: boolean) => ({
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: '#FFFFFF',
  position: 'absolute' as const,
  top: 2,
  left: isOn ? 20 : 2,
  transition: 'left 0.15s',
});

const NOTA_STYLE = {
  fontSize: 12,
  color: COLORS.text.tertiary,
  fontStyle: 'italic' as const,
  marginTop: 4,
};

const AVATAR_STYLE = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  background: COLORS.accent.teal,
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 22,
  fontWeight: 600,
  flexShrink: 0,
};

const AUTOCOMPLETE_LIST_STYLE = {
  border: `1px solid ${COLORS.border.default}`,
  borderTop: 'none',
  borderRadius: '0 0 6px 6px',
  background: COLORS.background.card,
  maxHeight: 240,
  overflow: 'auto',
  boxShadow: '0 4px 8px rgba(0,0,0,0.08)',
};

const AUTOCOMPLETE_ITEM_STYLE = {
  padding: '8px 12px',
  cursor: 'pointer' as const,
  fontSize: 14,
  color: COLORS.text.primary,
  borderBottom: `1px solid ${COLORS.border.divider}`,
};

const BTN_DISABLED_STYLE = {
  padding: '6px 12px',
  fontSize: 13,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  background: COLORS.background.elevated,
  color: COLORS.text.tertiary,
  cursor: 'not-allowed' as const,
  opacity: 0.7,
};

const S503_TOOLTIP_PRIMEIRO_ACESSO = 'Envio de primeiro acesso disponível em ME futura de auth.';
const S503_TOOLTIP_DEFINIR_METAS = 'Definição de metas disponível em ME futura do motor Eixo X.';

// ============================================================
// Helpers puros (RV-13 — testaveis)
// ============================================================

function maskCpf(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function getIniciais(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  if (first === '') return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? '';
  const firstChar = first[0] ?? '';
  const lastChar = last[0] ?? '';
  return (firstChar + lastChar).toUpperCase();
}

// ============================================================
// Componente
// ============================================================

export function ColaboradorForm(props: ColaboradorFormProps): JSX.Element {
  const {
    mode,
    initialValues,
    onValuesChange,
    currentRFName,
    onToggleRFAttempt,
    cpfReadonly,
    searchLiderCandidates,
    presetIsRH,
  } = props;

  const [values, setValues] = useState<ColaboradorFormValues>(() => {
    if (presetIsRH === true && mode === 'novo') {
      return { ...initialValues, isRH: true };
    }
    return initialValues;
  });
  const [liderQuery, setLiderQuery] = useState('');
  const [liderResults, setLiderResults] = useState<readonly LiderCandidate[]>([]);
  const [liderDropdownOpen, setLiderDropdownOpen] = useState(false);
  const liderInputRef = useRef<HTMLInputElement>(null);

  const applyChange = useCallback(
    (next: ColaboradorFormValues) => {
      setValues(next);
      onValuesChange(next);
    },
    [onValuesChange],
  );

  function updateField<K extends keyof ColaboradorFormValues>(
    key: K,
    value: ColaboradorFormValues[K],
  ): void {
    applyChange({ ...values, [key]: value });
  }

  function handleTextChange(key: keyof ColaboradorFormValues) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      updateField(key, e.target.value as ColaboradorFormValues[typeof key]);
    };
  }

  // Autocomplete de lider direto — debounce simples.
  useEffect(() => {
    if (!liderDropdownOpen) return;
    const handle = setTimeout(() => {
      void searchLiderCandidates(liderQuery).then((results) => {
        setLiderResults(results);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [liderQuery, liderDropdownOpen, searchLiderCandidates]);

  function handleSelectLider(c: LiderCandidate): void {
    applyChange({
      ...values,
      liderInicial: {
        tipo: c.tipo,
        id: c.id,
        label: `${c.name} · ${c.cargo} · ${c.departamento}`,
      },
    });
    setLiderQuery('');
    setLiderDropdownOpen(false);
  }

  function handleClearLider(): void {
    applyChange({ ...values, liderInicial: null });
  }

  const showPrimeiroAcesso = values.isRH || values.isLider;
  const iniciais = getIniciais(values.name);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Seção 1 — Dados pessoais */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Dados pessoais</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={AVATAR_STYLE} aria-label="Avatar por iniciais">
            {iniciais}
          </div>
          <div style={{ fontSize: 12, color: COLORS.text.tertiary, fontStyle: 'italic' }}>
            Avatar gerado automaticamente pelas iniciais do nome — sem upload de foto nesta versão.
          </div>
        </div>
        <div style={GRID_2_STYLE}>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-name">
              Nome completo *
            </label>
            <input
              id="emp-name"
              type="text"
              value={values.name}
              onChange={handleTextChange('name')}
              style={FIELD_INPUT_STYLE}
              placeholder="Ex.: Bruna Martins Alves"
              maxLength={255}
              required
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-cpf">
              CPF *
            </label>
            <input
              id="emp-cpf"
              type="text"
              value={values.cpf.length > 0 ? maskCpf(values.cpf) : ''}
              onChange={(e) => updateField('cpf', maskCpf(e.target.value).replace(/\D/g, ''))}
              style={cpfReadonly ? FIELD_INPUT_READONLY_STYLE : FIELD_INPUT_STYLE}
              placeholder="000.000.000-00"
              readOnly={cpfReadonly}
              maxLength={14}
              required
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-datanasc">
              Data de nascimento *
            </label>
            <input
              id="emp-datanasc"
              type="date"
              value={values.dataNascimento}
              onChange={handleTextChange('dataNascimento')}
              style={FIELD_INPUT_STYLE}
              required
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-dataadm">
              Data de admissão *
            </label>
            <input
              id="emp-dataadm"
              type="date"
              value={values.dataAdmissao}
              onChange={handleTextChange('dataAdmissao')}
              style={FIELD_INPUT_STYLE}
              required
            />
          </div>
          <div style={{ gridColumn: '1 / span 2' }}>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-email">
              E-mail{' '}
              <span style={{ fontWeight: 400, color: COLORS.text.tertiary }}>
                (opcional; obrigatório se ativar como RH ou Líder)
              </span>
            </label>
            <input
              id="emp-email"
              type="email"
              value={values.email}
              onChange={handleTextChange('email')}
              style={FIELD_INPUT_STYLE}
              placeholder="nome@empresa.com"
              maxLength={255}
            />
          </div>
        </div>
      </section>

      {/* Seção 2 — Vínculo profissional */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Vínculo profissional</h2>
        <div style={GRID_2_STYLE}>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-cargo">
              Cargo *
            </label>
            <input
              id="emp-cargo"
              type="text"
              value={values.cargo}
              onChange={handleTextChange('cargo')}
              style={FIELD_INPUT_STYLE}
              placeholder="Ex.: Analista Comercial Sênior"
              maxLength={100}
              required
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-cbo">
              CBO *
            </label>
            <input
              id="emp-cbo"
              type="text"
              value={values.cbo}
              onChange={handleTextChange('cbo')}
              style={FIELD_INPUT_STYLE}
              placeholder="Ex.: 2521"
              maxLength={10}
              required
            />
          </div>
          <div style={{ gridColumn: '1 / span 2' }}>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-descricaoCBO">
              Descrição do CBO *
            </label>
            <input
              id="emp-descricaoCBO"
              type="text"
              value={values.descricaoCBO}
              onChange={handleTextChange('descricaoCBO')}
              style={FIELD_INPUT_STYLE}
              placeholder="Descrição oficial da tabela CBO federal"
              maxLength={255}
              required
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-departamento">
              Departamento *
            </label>
            <select
              id="emp-departamento"
              value={values.departamento}
              onChange={handleTextChange('departamento')}
              style={FIELD_INPUT_STYLE}
              required
            >
              <option value="">Selecione o departamento...</option>
              {DEPARTAMENTO_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-senioridade">
              Senioridade *
            </label>
            <select
              id="emp-senioridade"
              value={values.senioridade}
              onChange={handleTextChange('senioridade')}
              style={FIELD_INPUT_STYLE}
              required
            >
              <option value="">Selecione...</option>
              <option value="junior">Júnior</option>
              <option value="pleno">Pleno</option>
              <option value="senior">Sênior</option>
            </select>
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-nivel">
              Nível hierárquico *
            </label>
            <select
              id="emp-nivel"
              value={values.nivelHierarquico}
              onChange={handleTextChange('nivelHierarquico')}
              style={FIELD_INPUT_STYLE}
              required
            >
              <option value="">Selecione...</option>
              <option value="operacional">Operacional</option>
              <option value="tatico">Tático</option>
              <option value="estrategico">Estratégico</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / span 2', position: 'relative' }}>
            <label style={FIELD_LABEL_STYLE} htmlFor="emp-lider">
              Líder direto{' '}
              <span style={{ fontWeight: 400, color: COLORS.text.tertiary }}>
                (busque por nome ou cargo)
              </span>
            </label>
            {values.liderInicial !== null ? (
              <div
                style={{
                  ...FIELD_INPUT_STYLE,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{values.liderInicial.label}</span>
                <button
                  type="button"
                  onClick={handleClearLider}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: COLORS.semantic.danger,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Remover
                </button>
              </div>
            ) : (
              <input
                ref={liderInputRef}
                id="emp-lider"
                type="text"
                value={liderQuery}
                onChange={(e) => {
                  setLiderQuery(e.target.value);
                  setLiderDropdownOpen(true);
                }}
                onFocus={() => setLiderDropdownOpen(true)}
                style={FIELD_INPUT_STYLE}
                placeholder="Digite para buscar C-levels ou líderes ativos..."
              />
            )}
            {liderDropdownOpen && values.liderInicial === null && liderResults.length > 0 ? (
              <div style={AUTOCOMPLETE_LIST_STYLE}>
                {liderResults.map((c) => (
                  <div
                    key={`${c.tipo}:${c.id}`}
                    onClick={() => handleSelectLider(c)}
                    style={AUTOCOMPLETE_ITEM_STYLE}
                  >
                    <strong>{c.name}</strong>{' '}
                    <span style={{ color: COLORS.text.tertiary, fontSize: 12 }}>
                      · {c.cargo} · {c.departamento}
                      {c.tipo === 'clevel' ? ' (C-level)' : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Seção 3 — Família de função (grid 3/2/1 canônico) */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Família de função *</h2>
        <p style={{ fontSize: 12, color: COLORS.text.tertiary, margin: 0 }}>
          Selecione a família que melhor representa o escopo do cargo. A escolha define as 4
          variáveis de desempenho avaliadas mensalmente.
        </p>
        <div style={GRID_3_STYLE}>
          {JOB_FAMILY_OPTIONS.map((f) => {
            const isSelected = values.jobFamily === f.id;
            return (
              <div
                key={f.id}
                onClick={() => updateField('jobFamily', f.id)}
                style={isSelected ? FAMILIA_CARD_SELECTED_STYLE : FAMILIA_CARD_STYLE_BASE}
                role="button"
                aria-pressed={isSelected}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    updateField('jobFamily', f.id);
                  }
                }}
              >
                <strong style={{ fontSize: 14, color: COLORS.text.primary }}>{f.titulo}</strong>
                <span style={{ fontSize: 12, color: COLORS.text.secondary, lineHeight: 1.4 }}>
                  {f.descricao}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Seção 4 — Perfis de acesso */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Perfis de acesso</h2>
        <div style={TOGGLE_ROW_STYLE}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text.primary }}>
              Permitir acesso como RH
            </div>
            <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>
              Toggle exclusivo do Super Admin — habilita acesso ao painel RH.
            </div>
          </div>
          <div
            onClick={() => updateField('isRH', !values.isRH)}
            style={TOGGLE_TRACK_STYLE(values.isRH)}
            role="switch"
            aria-checked={values.isRH}
            aria-label="Permitir acesso como RH"
          >
            <div style={TOGGLE_KNOB_STYLE(values.isRH)} />
          </div>
        </div>
        <div style={TOGGLE_ROW_STYLE}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text.primary }}>
              Permitir acesso como Líder
            </div>
            <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>
              Habilita acesso ao painel de líder e recebimento de avaliações do Instrumento D.
            </div>
          </div>
          <div
            onClick={() => updateField('isLider', !values.isLider)}
            style={TOGGLE_TRACK_STYLE(values.isLider)}
            role="switch"
            aria-checked={values.isLider}
            aria-label="Permitir acesso como Líder"
          >
            <div style={TOGGLE_KNOB_STYLE(values.isLider)} />
          </div>
        </div>
        {showPrimeiroAcesso ? (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              disabled
              style={BTN_DISABLED_STYLE}
              title={S503_TOOLTIP_PRIMEIRO_ACESSO}
              aria-label={S503_TOOLTIP_PRIMEIRO_ACESSO}
            >
              Enviar primeiro acesso
            </button>
          </div>
        ) : null}
      </section>

      {/* Seção 5 — Papéis funcionais (Toggle RF) */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Papéis funcionais</h2>
        <div style={TOGGLE_ROW_STYLE}>
          <div style={{ maxWidth: '80%' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text.primary }}>
              Ativar como Responsável financeiro
            </div>
            <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>
              Este colaborador poderá acessar <code>/faturamento-mensal</code> da empresa se o
              toggle estiver ativo.
            </div>
            {!(values.isRH || values.isLider) ? (
              <div style={NOTA_STYLE}>Este toggle exige que o colaborador seja RH ou Líder.</div>
            ) : null}
            {currentRFName !== null && !values.isResponsavelFinanceiro ? (
              <div style={NOTA_STYLE}>
                Titular vigente: <strong>{currentRFName}</strong>. Ativar aqui abre modal de
                transferência com justificativa obrigatória de 100 a 500 caracteres.
              </div>
            ) : null}
          </div>
          <div
            onClick={() => {
              if (!(values.isRH || values.isLider)) return;
              onToggleRFAttempt(!values.isResponsavelFinanceiro);
            }}
            style={{
              ...TOGGLE_TRACK_STYLE(values.isResponsavelFinanceiro),
              opacity: values.isRH || values.isLider ? 1 : 0.5,
              cursor: values.isRH || values.isLider ? 'pointer' : 'not-allowed',
            }}
            role="switch"
            aria-checked={values.isResponsavelFinanceiro}
            aria-label="Ativar como Responsável financeiro"
          >
            <div style={TOGGLE_KNOB_STYLE(values.isResponsavelFinanceiro)} />
          </div>
        </div>
      </section>

      {/* Seção 6 — Metas (M1 disabled S503) */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Metas de desempenho</h2>
        <div style={{ fontSize: 13, color: COLORS.text.secondary }}>
          As metas mensais dependem da família de função selecionada. A definição individual será
          habilitada quando o motor do Eixo X entrar em operação.
        </div>
        <div>
          <button
            type="button"
            disabled
            style={BTN_DISABLED_STYLE}
            title={S503_TOOLTIP_DEFINIR_METAS}
            aria-label={S503_TOOLTIP_DEFINIR_METAS}
          >
            Definir metas
          </button>
        </div>
      </section>
    </div>
  );
}
