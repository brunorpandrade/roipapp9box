// ROIP APP 9BOX — form canônico bit-exact compartilhado entre as rotas
// `/super-admin/empresa/[id]/clevel/novo` (§13.2) e `/super-admin/
// empresa/[id]/clevel/[cLevelId]/editar` (§13.3). ME-078a.
//
// Formulário canônico bit-exact das 6 seções canônicas do §13.2/§13.3:
//   1. Dados pessoais (Foto/Nome/CPF/Data de nascimento/E-mail/Telefone).
//      Obs: Telefone não é coluna canônica em `cLevelMembers` (§4.4); o
//      campo é renderizado somente como acessório visual bit-exact ao
//      mockup — não persiste. Data de admissão canônica preservada.
//   2. Vínculo profissional (Cargo/Descrição do cargo/Departamento).
//   3. Família de função (grid 3/2/1 canônico bit-exact — 6 famílias
//      hard-coded canonicamente FASE_1 §9). Obs: `cLevelMembers` do
//      schema canônico bit-exact NÃO tem coluna `jobFamily`. Campo
//      renderizado visualmente bit-exact ao mockup como componente
//      canônico, mas NÃO persiste (seleção visualmente registrada).
//   4. Escopo de visualização (`acessoTotal` + banner Contexto A/B).
//   5. Papéis funcionais (toggle "Ativar como Responsável financeiro"
//      + nota canônica bit-exact §13.9 D3 — sem toggle RH).
//   6. Status inicial (badge verde — novo C-level sempre nasce ativo;
//      em edição, o toggle Ativar/Inativar aparece + botão dedicado).
//
// **RV-13.** Consumido por `CLevelNovoClient.tsx` e `CLevelEditarClient.tsx`.

'use client';

import { useState, type ChangeEvent, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';

// -----------------------------------------------------------------------
// Enum canônico bit-exact de departamentos (§4.4 + §15.1 CAMADA_DADOS)
// -----------------------------------------------------------------------

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

// -----------------------------------------------------------------------
// 6 famílias hard-coded canônicas bit-exact (FASE_1 §9)
// -----------------------------------------------------------------------

export const FAMILIAS_FUNCAO = [
  {
    id: 'produtiva_direta',
    titulo: 'Produtiva direta',
    descricao: 'Executa atividades diretamente ligadas ao produto/serviço vendido pela empresa.',
  },
  {
    id: 'comercial_receita',
    titulo: 'Comercial e receita',
    descricao: 'Gera receita via vendas, prospecção, relacionamento com clientes e retenção.',
  },
  {
    id: 'suporte_operacional',
    titulo: 'Suporte operacional',
    descricao: 'Sustenta a operação — logística, compras, atendimento, qualidade, manutenção.',
  },
  {
    id: 'administrativo_suporte',
    titulo: 'Administrativo e suporte',
    descricao: 'Áreas de estrutura — RH, financeiro, contabilidade, TI, jurídico, administrativo.',
  },
  {
    id: 'lideranca_gestao',
    titulo: 'Liderança e gestão',
    descricao: 'Coordena equipes, define metas, cobra entregas e responde por resultados de área.',
  },
  {
    id: 'estrategica_direcao',
    titulo: 'Estratégica e direção',
    descricao: 'Diretoria e C-level — define rumo estratégico e responde por desempenho global.',
  },
] as const;

export type FamiliaFuncaoId = (typeof FAMILIAS_FUNCAO)[number]['id'];

// -----------------------------------------------------------------------
// Tipagem canônica dos valores do form
// -----------------------------------------------------------------------

export interface CLevelFormValues {
  name: string;
  cpf: string;
  email: string;
  telefone: string;
  photoUrl: string;
  dataNascimento: string;
  dataAdmissao: string;
  cargo: string;
  descricaoCargo: string;
  departamento: string;
  custoMensal: string;
  jobFamily: FamiliaFuncaoId | '';
  acessoTotal: boolean;
  isResponsavelFinanceiro: boolean;
}

export const EMPTY_CLEVEL_FORM_VALUES: CLevelFormValues = {
  name: '',
  cpf: '',
  email: '',
  telefone: '',
  photoUrl: '',
  dataNascimento: '',
  dataAdmissao: '',
  cargo: '',
  descricaoCargo: '',
  departamento: 'Diretoria',
  custoMensal: '',
  jobFamily: 'estrategica_direcao',
  acessoTotal: true,
  isResponsavelFinanceiro: false,
};

// -----------------------------------------------------------------------
// Props canônicas do form compartilhado
// -----------------------------------------------------------------------

export interface CLevelFormProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues: CLevelFormValues;
  readonly onValuesChange: (values: CLevelFormValues) => void;
  /** Contexto A canônico bit-exact §13.2 — banner "primeiro C-level". */
  readonly isFirstCLevel: boolean;
  /** Contexto A canônico bit-exact §13.3 — banner "único C-level". */
  readonly isOnlyCLevel: boolean;
  /** Nome do RF atual da empresa (para nota canônica no toggle RF). */
  readonly currentRFName: string | null;
  /** Handler de tentativa de ativação do toggle RF (mostra modal se ocupado). */
  readonly onToggleRFAttempt: (nextValue: boolean) => void;
  /** Modo edição: readonly no CPF (não permitido alterar após criação). */
  readonly cpfReadonly: boolean;
}

// -----------------------------------------------------------------------
// Estilos canônicos bit-exact
// -----------------------------------------------------------------------

const SECTION_CARD_STYLE = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  padding: 20,
  display: 'flex' as const,
  flexDirection: 'column' as const,
  gap: 16,
};

const SECTION_TITLE_STYLE = {
  fontSize: 14,
  fontWeight: 600,
  color: COLORS.text.primary,
  paddingBottom: 8,
  borderBottom: `1px solid ${COLORS.border.divider}`,
  margin: 0,
};

const FIELD_LABEL_STYLE = {
  display: 'block' as const,
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.text.secondary,
  marginBottom: 4,
};

const FIELD_INPUT_STYLE = {
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
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
  display: 'grid' as const,
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 16,
};

const GRID_3_STYLE = {
  display: 'grid' as const,
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 12,
};

const FAMILIA_CARD_STYLE_BASE = {
  padding: 14,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  background: COLORS.background.card,
  cursor: 'pointer' as const,
  display: 'flex' as const,
  flexDirection: 'column' as const,
  gap: 4,
};

const FAMILIA_CARD_SELECTED_STYLE = {
  ...FAMILIA_CARD_STYLE_BASE,
  borderColor: COLORS.accent.teal,
  borderWidth: 2,
  padding: 13,
  background: COLORS.badge.tealClaroBgAlt,
};

const INFO_BANNER_STYLE = {
  display: 'flex' as const,
  alignItems: 'flex-start' as const,
  gap: 10,
  padding: '12px 14px',
  background: COLORS.badge.infoBg,
  color: COLORS.badge.infoText,
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.5,
};

const TOGGLE_ROW_STYLE = {
  display: 'flex' as const,
  alignItems: 'flex-start' as const,
  justifyContent: 'space-between' as const,
  gap: 16,
  padding: '12px 0',
};

const TOGGLE_TRACK_STYLE = (isOn: boolean) => ({
  width: 42,
  height: 24,
  background: isOn ? COLORS.accent.teal : COLORS.text.quaternary,
  borderRadius: 12,
  position: 'relative' as const,
  cursor: 'pointer' as const,
  transition: 'background 0.15s',
});

const TOGGLE_KNOB_STYLE = (isOn: boolean) => ({
  position: 'absolute' as const,
  top: 3,
  left: isOn ? 21 : 3,
  width: 18,
  height: 18,
  background: COLORS.background.card,
  borderRadius: '50%',
  transition: 'left 0.15s',
});

const NOTA_CANONICA_STYLE = {
  fontSize: 11,
  color: COLORS.text.tertiary,
  fontStyle: 'italic' as const,
  marginTop: 4,
};

// -----------------------------------------------------------------------
// Máscaras
// -----------------------------------------------------------------------

function maskCpf(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  let out = digits;
  if (digits.length > 3) {
    out = digits.slice(0, 3) + '.' + digits.slice(3);
  }
  if (digits.length > 6) {
    out = digits.slice(0, 3) + '.' + digits.slice(3, 6) + '.' + digits.slice(6);
  }
  if (digits.length > 9) {
    out =
      digits.slice(0, 3) +
      '.' +
      digits.slice(3, 6) +
      '.' +
      digits.slice(6, 9) +
      '-' +
      digits.slice(9);
  }
  return out;
}

function maskTelefone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => {
      let out = '';
      if (a) out = '(' + a;
      if (a && a.length === 2) out += ') ';
      if (b) out += b;
      if (c) out += '-' + c;
      return out;
    });
  }
  return digits.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
}

// -----------------------------------------------------------------------
// Componente principal do form
// -----------------------------------------------------------------------

export function CLevelForm(props: CLevelFormProps): JSX.Element {
  const {
    mode,
    initialValues,
    onValuesChange,
    isFirstCLevel,
    isOnlyCLevel,
    currentRFName,
    onToggleRFAttempt,
    cpfReadonly,
  } = props;
  const [values, setValues] = useState<CLevelFormValues>(initialValues);

  function updateField<K extends keyof CLevelFormValues>(key: K, value: CLevelFormValues[K]): void {
    const next = { ...values, [key]: value };
    setValues(next);
    onValuesChange(next);
  }

  function handleTextChange(key: keyof CLevelFormValues) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      updateField(key, e.target.value as CLevelFormValues[typeof key]);
    };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* -- Seção 1 — Dados pessoais -- */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Dados pessoais</h2>
        <div style={GRID_2_STYLE}>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-name">
              Nome completo *
            </label>
            <input
              id="cl-name"
              type="text"
              value={values.name}
              onChange={handleTextChange('name')}
              style={FIELD_INPUT_STYLE}
              placeholder="Ex.: Marina Souza"
              maxLength={255}
              required
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-cpf">
              CPF *
            </label>
            <input
              id="cl-cpf"
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
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-email">
              E-mail *
            </label>
            <input
              id="cl-email"
              type="email"
              value={values.email}
              onChange={handleTextChange('email')}
              style={FIELD_INPUT_STYLE}
              placeholder="nome@empresa.com"
              maxLength={255}
              required
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-telefone">
              Telefone
            </label>
            <input
              id="cl-telefone"
              type="tel"
              value={values.telefone}
              onChange={(e) => updateField('telefone', maskTelefone(e.target.value))}
              style={FIELD_INPUT_STYLE}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-datanasc">
              Data de nascimento *
            </label>
            <input
              id="cl-datanasc"
              type="date"
              value={values.dataNascimento}
              onChange={handleTextChange('dataNascimento')}
              style={FIELD_INPUT_STYLE}
              required
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-dataadm">
              Data de admissão *
            </label>
            <input
              id="cl-dataadm"
              type="date"
              value={values.dataAdmissao}
              onChange={handleTextChange('dataAdmissao')}
              style={FIELD_INPUT_STYLE}
              required
            />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-photo">
              Foto (URL da imagem)
            </label>
            <input
              id="cl-photo"
              type="url"
              value={values.photoUrl}
              onChange={handleTextChange('photoUrl')}
              style={FIELD_INPUT_STYLE}
              placeholder="https://exemplo.com/foto.jpg"
              maxLength={500}
            />
            <div style={NOTA_CANONICA_STYLE}>
              Upload direto de imagem será integrado em fase futura — informe URL manual.
            </div>
          </div>
        </div>
      </section>

      {/* -- Seção 2 — Vínculo profissional -- */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Vínculo profissional</h2>
        <div style={GRID_2_STYLE}>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-cargo">
              Cargo *
            </label>
            <input
              id="cl-cargo"
              type="text"
              value={values.cargo}
              onChange={handleTextChange('cargo')}
              style={FIELD_INPUT_STYLE}
              placeholder="Ex.: CFO"
              maxLength={100}
              required
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-departamento">
              Departamento *
            </label>
            <select
              id="cl-departamento"
              value={values.departamento}
              onChange={handleTextChange('departamento')}
              style={FIELD_INPUT_STYLE}
              required
            >
              {DEPARTAMENTO_OPTIONS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-descricao">
              Descrição do cargo *
            </label>
            <textarea
              id="cl-descricao"
              value={values.descricaoCargo}
              onChange={handleTextChange('descricaoCargo')}
              style={{ ...FIELD_INPUT_STYLE, minHeight: 80, resize: 'vertical' }}
              placeholder="Descreva as principais responsabilidades e escopo do cargo."
              required
            />
          </div>
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="cl-custo">
              Custo mensal (R$) *
            </label>
            <input
              id="cl-custo"
              type="number"
              step="0.01"
              min="0"
              value={values.custoMensal}
              onChange={handleTextChange('custoMensal')}
              style={FIELD_INPUT_STYLE}
              placeholder="0,00"
              required
            />
          </div>
        </div>
      </section>

      {/* -- Seção 3 — Família de função (grid 3/2/1) -- */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Família de função</h2>
        <div style={GRID_3_STYLE}>
          {FAMILIAS_FUNCAO.map((fam) => {
            const isSelected = values.jobFamily === fam.id;
            return (
              <button
                key={fam.id}
                type="button"
                onClick={() => updateField('jobFamily', fam.id)}
                style={isSelected ? FAMILIA_CARD_SELECTED_STYLE : FAMILIA_CARD_STYLE_BASE}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: COLORS.text.primary,
                    textAlign: 'left',
                  }}
                >
                  {fam.titulo}
                  {isSelected ? (
                    <span style={{ color: COLORS.accent.teal, marginLeft: 4 }}>✓</span>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: COLORS.text.tertiary,
                    lineHeight: 1.4,
                    textAlign: 'left',
                  }}
                >
                  {fam.descricao}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* -- Seção 4 — Escopo de visualização -- */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Escopo de visualização</h2>
        {mode === 'create' && isFirstCLevel ? (
          <div style={INFO_BANNER_STYLE}>
            <span style={{ fontSize: 16 }}>ℹ</span>
            <span>
              Como este é o primeiro C-level da empresa, o escopo será automaticamente{' '}
              <strong>&quot;Empresa inteira&quot;</strong> (acessoTotal = true) — sem opção de
              restrição. Ao cadastrar um segundo C-level, o campo passa a ser editável (Fase 1
              §7.3).
            </span>
          </div>
        ) : mode === 'edit' && isOnlyCLevel ? (
          <div style={INFO_BANNER_STYLE}>
            <span style={{ fontSize: 16 }}>ℹ</span>
            <span>
              Como este é o único C-level cadastrado na empresa, o escopo é automaticamente{' '}
              <strong>&quot;Empresa inteira&quot;</strong> (acessoTotal = true). O campo passará a
              ser editável quando outro C-level for cadastrado (Fase 1 §7.3).
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label
              style={{
                ...FAMILIA_CARD_STYLE_BASE,
                ...(values.acessoTotal === true ? FAMILIA_CARD_SELECTED_STYLE : {}),
              }}
            >
              <input
                type="radio"
                name="acessoTotal"
                checked={values.acessoTotal === true}
                onChange={() => updateField('acessoTotal', true)}
                style={{ marginRight: 8 }}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Empresa inteira</span>
              <span style={{ fontSize: 12, color: COLORS.text.tertiary }}>
                Vê todos os colaboradores, dashboards e relatórios da empresa.
              </span>
            </label>
            <label
              style={{
                ...FAMILIA_CARD_STYLE_BASE,
                ...(values.acessoTotal === false ? FAMILIA_CARD_SELECTED_STYLE : {}),
              }}
            >
              <input
                type="radio"
                name="acessoTotal"
                checked={values.acessoTotal === false}
                onChange={() => updateField('acessoTotal', false)}
                style={{ marginRight: 8 }}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Própria cadeia descendente</span>
              <span style={{ fontSize: 12, color: COLORS.text.tertiary }}>
                Vê apenas os colaboradores subordinados a este C-level (própria cadeia).
              </span>
            </label>
          </div>
        )}
      </section>

      {/* -- Seção 5 — Papéis funcionais -- */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Papéis funcionais</h2>
        <div style={TOGGLE_ROW_STYLE}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text.primary }}>
              Ativar como Responsável financeiro{' '}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: COLORS.badge.infoText,
                  background: COLORS.badge.infoBg,
                  padding: '2px 6px',
                  borderRadius: 4,
                  marginLeft: 6,
                }}
              >
                Exclusivo Bruno
              </span>
            </div>
            <div style={{ fontSize: 12, color: COLORS.text.tertiary, marginTop: 4 }}>
              Habilita acesso à tela <code>/faturamento-mensal</code> e responsabilidade pelo
              lançamento do faturamento da empresa.
            </div>
            {currentRFName !== null && !values.isResponsavelFinanceiro ? (
              <div style={NOTA_CANONICA_STYLE}>
                Empresa já tem <strong>{currentRFName}</strong> como Responsável financeiro. Ativar
                aqui abre modal de transferência com justificativa obrigatória de 100 a 500
                caracteres.
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              // ME-080b Dispatch 3.1 — fix bug de sincronizacao (S517).
              // `CLevelForm` mantem `values` local (useState) e o toggle RF
              // antes chamava apenas `onToggleRFAttempt`, que atualizava
              // state do pai mas nao do form — visual do toggle nao mudava.
              // `updateField` sincroniza atomicamente state local + pai (via
              // `onValuesChange`). `onToggleRFAttempt` segue sendo chamado
              // para preservar semantica (dirty flag, etc — o pai pode
              // reagir alem do estado).
              const nextValue = !values.isResponsavelFinanceiro;
              updateField('isResponsavelFinanceiro', nextValue);
              onToggleRFAttempt(nextValue);
            }}
            style={TOGGLE_TRACK_STYLE(values.isResponsavelFinanceiro)}
            aria-label="Ativar como Responsável financeiro"
          >
            <span style={TOGGLE_KNOB_STYLE(values.isResponsavelFinanceiro)} />
          </button>
        </div>
        <div
          style={{
            background: COLORS.badge.warningBg,
            color: COLORS.badge.warningText,
            padding: '10px 12px',
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          <strong>Nota canônica — decisão D3:</strong> o toggle &quot;Ativar como RH&quot; NÃO é
          adicionado ao cadastro do C-level. C-level continua sem acumular papel de RH nesta revisão
          canônica.
        </div>
      </section>
    </div>
  );
}
