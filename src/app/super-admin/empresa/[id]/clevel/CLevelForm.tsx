// ROIP APP 9BOX — form canonico bit-exact compartilhado entre as rotas
// `/super-admin/empresa/[id]/clevel/novo` (§13.2) e `/super-admin/
// empresa/[id]/clevel/[cLevelId]/editar` (§13.3). ME-078a.
//
// Formulario canonico bit-exact das 6 secoes canonicas do §13.2/§13.3:
//   1. Dados pessoais (Foto/Nome/CPF/Data de nascimento/E-mail/Telefone).
//      Obs: Telefone nao e coluna canonica em `cLevelMembers` (§4.4); o
//      campo e renderizado somente como acessorio visual bit-exact ao
//      mockup — nao persiste. Data de admissao canonica preservada.
//   2. Vinculo profissional (Cargo/Descricao do cargo/Departamento).
//   3. Familia de funcao (grid 3/2/1 canonico bit-exact — 6 familias
//      hard-coded canonicamente FASE_1 §9). Obs: `cLevelMembers` do
//      schema canonico bit-exact NAO tem coluna `jobFamily`. Campo
//      renderizado visualmente bit-exact ao mockup como componente
//      canonico, mas NAO persiste (selecao visualmente registrada).
//   4. Escopo de visualizacao (`acessoTotal` + banner Contexto A/B).
//   5. Papeis funcionais (toggle "Ativar como Responsavel financeiro" +
//      ME 3.5 D5 patch2: toggle "Ativar como RH" — D9 §12 DOC 02 herdada
//      via `roleProcedure(['super_admin'])` no server. Ambos os toggles
//      operam com a mesma semantica de UI e a decisao D3 anterior de
//      "nota canonica" foi substituida por este novo toggle em regime).
//   6. Status inicial (badge verde — novo C-level sempre nasce ativo;
//      em edicao, o toggle Ativar/Inativar aparece + botao dedicado).
//
// **RV-13.** Consumido por `CLevelNovoClient.tsx` e `CLevelEditarClient.tsx`.

'use client';

import { useState, type ChangeEvent, type JSX } from 'react';

import { ImageUploader } from '../../../../../components/forms/ImageUploader';
import { COLORS } from '../../../../../lib/design-tokens/colors';

// -----------------------------------------------------------------------
// Enum canonico bit-exact de departamentos (§4.4 + §15.1 CAMADA_DADOS)
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
// 6 familias hard-coded canonicas bit-exact (FASE_1 §9)
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
// Tipagem canonica dos valores do form
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
  /**
   * ME 3.5 D5 patch2 — flag `isRH` do C-level. Quando true, o C-level
   * ganha capacidades operacionais de RH e o toggle "Painel RH" aparece
   * no rodape do menu (D6, decidido D-ME 3.5-D2). Persiste na coluna
   * `cLevelMembers.isRH` via procedure `create`/`update`.
   */
  isRH: boolean;
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
  isRH: false,
};

// -----------------------------------------------------------------------
// Props canonicas do form compartilhado
// -----------------------------------------------------------------------

export interface CLevelFormProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues: CLevelFormValues;
  readonly onValuesChange: (values: CLevelFormValues) => void;
  /** Contexto A canonico bit-exact §13.2 — banner "primeiro C-level". */
  readonly isFirstCLevel: boolean;
  /** Contexto A canonico bit-exact §13.3 — banner "unico C-level". */
  readonly isOnlyCLevel: boolean;
  /** Nome do RF atual da empresa (para nota canonica no toggle RF). */
  readonly currentRFName: string | null;
  /** Handler de tentativa de ativacao do toggle RF (mostra modal se ocupado). */
  readonly onToggleRFAttempt: (nextValue: boolean) => void;
  /** Modo edicao: readonly no CPF (nao permitido alterar apos criacao). */
  readonly cpfReadonly: boolean;
}

// -----------------------------------------------------------------------
// Estilos canonicos bit-exact
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
// Mascaras
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
      {/* -- Secao 1 — Dados pessoais -- */}
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
              Foto
            </label>
            {/* ME-B9.3 — upload inline base64 (MEDIUMTEXT), paridade bit-exact
                com o ColaboradorForm. Substitui o input de URL manual
                anterior. */}
            <ImageUploader
              value={values.photoUrl === '' ? null : values.photoUrl}
              onChange={(next) => updateField('photoUrl', next ?? '')}
              labelRemover="Remover foto"
              textoVazio="Sem foto."
              hintText="PNG, JPEG, WebP ou SVG. Máximo 300KB."
              previewVariant="circle"
              previewSize={72}
            />
          </div>
        </div>
      </section>

      {/* -- Secao 2 — Vinculo profissional -- */}
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

      {/* -- Secao 3 — Familia de funcao (grid 3/2/1) -- */}
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

      {/* -- Secao 4 — Escopo de visualizacao -- */}
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

      {/* -- Secao 5 — Papeis funcionais -- */}
      <section style={SECTION_CARD_STYLE}>
        <h2 style={SECTION_TITLE_STYLE}>Papéis funcionais</h2>
        {/* Toggle canonico Responsavel financeiro (RF) — §5.5 */}
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

        {/* -----------------------------------------------------------
         * ME 3.5 D5 patch2 — Toggle canonico "Ativar como RH".
         *
         * Substitui a antiga "Nota canonica — decisao D3" (que negava o
         * toggle no cadastro). D9 aprovada em ME 3.5: apenas Super Admin
         * pode ativar o flag, semantica herdada via `roleProcedure`
         * (['super_admin'])` nas procedures `cLevelMembers.create` e
         * `cLevelMembers.update` — o guard fino de UI e servidor sao
         * redundantes por design (defense-in-depth).
         *
         * Quando `isRH=true`, no proximo login o C-level vera:
         *   - `/painel-clevel` como landing default (menu C-level);
         *   - Toggle "Painel C-level / Painel RH" no rodape do Sidebar;
         *   - Ao alternar para "Painel RH", `/painel-rh` fica acessivel
         *     e o menu troca para o conjunto canonico do RH.
         * ----------------------------------------------------------- */}
        <div style={TOGGLE_ROW_STYLE}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text.primary }}>
              Ativar como RH{' '}
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
              Habilita ao C-level operar como Responsável de RH — acesso ao Painel de RH, cadastro
              de colaboradores, dados mensais, pendências no portal e onboarding de líderes. O
              C-level alterna entre os dois papéis via toggle no menu lateral.
            </div>
            {values.isRH ? (
              <div style={NOTA_CANONICA_STYLE}>
                Toggle &quot;Painel C-level / Painel RH&quot; aparece automaticamente no rodapé do
                menu no próximo login deste C-level.
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              const nextValue = !values.isRH;
              updateField('isRH', nextValue);
            }}
            style={TOGGLE_TRACK_STYLE(values.isRH)}
            aria-label="Ativar como RH"
          >
            <span style={TOGGLE_KNOB_STYLE(values.isRH)} />
          </button>
        </div>
      </section>
    </div>
  );
}
