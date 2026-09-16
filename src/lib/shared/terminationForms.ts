// ROIP APP 9BOX — formularios de desligamento (ME-fila6 D2).
//
// Fonte unica da estrutura, dos rotulos e da validacao dos 2 formularios
// da especificacao "Turnover e desligamento — especificacao de conteudo e
// fluxo":
// - §3 Formulario A — entrevista de desligamento voluntario;
// - §4 Formulario B — justificativa de desligamento involuntario.
//
// Consumidores: rota de formulario (client), procs `employees.inactivate`
// e `leadershipTransfer.execute` (Zod), drill-down da pagina de turnover,
// documentos padrao e PDF. Modulo puro (sem banco, sem Node) para poder
// entrar no bundle client.
//
// Regra de texto (DOC 03 §2.2): contagem apos `trim()`; mensagens
// literais §2.3 para a justificativa do Formulario B.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { z } from 'zod';

import {
  CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_VALUES,
  DESTINO_SAIDA_VALUES,
  MOTIVO_SAIDA_VOLUNTARIA_VALUES,
  RESPOSTA_SIM_NAO_NA_VALUES,
  RESPOSTA_SIM_NAO_TALVEZ_VALUES,
  type CategoriaDesligamentoInvoluntario,
  type DestinoSaida,
  type MotivoSaidaVoluntaria,
  type RespostaSimNaoNa,
  type RespostaSimNaoTalvez,
} from '../../db/schema/enums';

// -----------------------------------------------------------------------
// Titulos e textos fixos
// -----------------------------------------------------------------------

export const FORMULARIO_A_TITULO = 'Entrevista de desligamento voluntário';
export const FORMULARIO_B_TITULO = 'Justificativa de desligamento involuntário';

export const FORMULARIO_A_DESCRICAO =
  'Conduzida presencialmente pelo RH com roteiro fixo. O RH transcreve as respostas na ' +
  'plataforma no momento da inativação.';
export const FORMULARIO_B_DESCRICAO =
  'Preenchida diretamente na plataforma pelo RH, sem entrevista prévia.';

export const ORIENTACAO_JUSTIFICATIVA_INVOLUNTARIO =
  'Registre fatos e eventos concretos que motivaram a decisão, sem juízo de valor sobre ' +
  'caráter ou atributos pessoais do colaborador.';

export const TEXTO_MIN = 100;
export const TEXTO_MAX = 500;

export const MSG_JUSTIFICATIVA_MIN = 'A justificativa deve ter no mínimo 100 caracteres.';
export const MSG_JUSTIFICATIVA_MAX = 'A justificativa deve ter no máximo 500 caracteres.';
export const MSG_RETENCAO_MIN = 'A resposta deve ter no mínimo 100 caracteres.';
export const MSG_RETENCAO_MAX = 'A resposta deve ter no máximo 500 caracteres.';
export const MSG_COMENTARIOS_MAX = 'Os comentários devem ter no máximo 500 caracteres.';
export const MSG_CAMPO_OBRIGATORIO = 'Campo obrigatório.';
export const MSG_SECUNDARIOS_MAX = 'Selecione no máximo 2 motivos secundários.';
export const MSG_SECUNDARIO_IGUAL_PRINCIPAL =
  'Os motivos secundários devem ser diferentes do motivo principal.';
export const MSG_NAO_APLICAVEL_CATEGORIA =
  '"Não aplicável" vale apenas para redução de quadro, fim de contrato e extinção de função.';
export const MSG_FORMULARIO_MOTIVO_DIVERGENTE =
  'O formulário enviado não corresponde ao motivo de saída selecionado.';

// -----------------------------------------------------------------------
// Rotulos das opcoes fechadas
// -----------------------------------------------------------------------

export const MOTIVO_SAIDA_VOLUNTARIA_LABELS: Record<MotivoSaidaVoluntaria, string> = {
  remuneracao_beneficios: 'Remuneração ou benefícios abaixo do mercado',
  falta_perspectiva_carreira: 'Falta de perspectiva de crescimento ou carreira',
  relacao_lideranca_direta: 'Relação com a liderança direta',
  sobrecarga_desequilibrio: 'Sobrecarga de trabalho ou desequilíbrio vida-trabalho',
  cultura_clima: 'Cultura ou clima organizacional',
  proposta_externa: 'Proposta externa mais atrativa, sem insatisfação prévia',
  motivo_pessoal_familiar: 'Motivo pessoal, familiar ou mudança de cidade',
  retorno_estudos: 'Retorno aos estudos',
  motivo_saude: 'Motivo de saúde',
  outro: 'Outro',
};

export const RESPOSTA_SIM_NAO_TALVEZ_LABELS: Record<RespostaSimNaoTalvez, string> = {
  sim: 'Sim',
  nao: 'Não',
  talvez: 'Talvez',
};

export const DESTINO_SAIDA_LABELS: Record<DestinoSaida, string> = {
  mesmo_setor: 'Outra empresa do mesmo setor',
  setor_diferente: 'Outra empresa de setor diferente',
  empreendedorismo_autonomo: 'Empreendedorismo ou trabalho autônomo',
  nao_buscando_emprego: 'Não está buscando novo emprego',
  prefere_nao_informar: 'Prefere não informar',
};

export const CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_LABELS: Record<
  CategoriaDesligamentoInvoluntario,
  string
> = {
  desempenho_abaixo: 'Desempenho abaixo do esperado, mesmo após feedback formal',
  violacao_conduta: 'Violação de conduta ou código de ética',
  desalinhamento_cultural: 'Desalinhamento cultural',
  reducao_quadro: 'Redução de quadro ou reestruturação',
  fim_contrato_experiencia: 'Fim de contrato determinado ou não confirmação em experiência',
  extincao_funcao_custo: 'Extinção da função ou redução de custo',
  outro: 'Outro',
};

export const RESPOSTA_SIM_NAO_NA_LABELS: Record<RespostaSimNaoNa, string> = {
  sim: 'Sim',
  nao: 'Não',
  nao_aplicavel: 'Não aplicável',
};

/** Categorias em que "Não aplicável" e aceito (especificacao §4). */
export const CATEGORIAS_COM_NAO_APLICAVEL: readonly CategoriaDesligamentoInvoluntario[] = [
  'reducao_quadro',
  'fim_contrato_experiencia',
  'extincao_funcao_custo',
];

// -----------------------------------------------------------------------
// Perguntas
// -----------------------------------------------------------------------

export type NotaVoluntariaKey =
  | 'notaConfiancaLideranca'
  | 'notaReconhecimento'
  | 'notaRemuneracaoJusta'
  | 'notaOportunidadeCrescimento'
  | 'notaClarezaExpectativas'
  | 'notaAmbienteEquipe';

export const NOTAS_VOLUNTARIO: readonly {
  readonly key: NotaVoluntariaKey;
  readonly label: string;
}[] = [
  { key: 'notaConfiancaLideranca', label: 'Relação de confiança com a liderança direta' },
  { key: 'notaReconhecimento', label: 'Reconhecimento pelo trabalho realizado' },
  { key: 'notaRemuneracaoJusta', label: 'Remuneração e benefícios justos' },
  { key: 'notaOportunidadeCrescimento', label: 'Oportunidade real de crescimento' },
  { key: 'notaClarezaExpectativas', label: 'Clareza sobre o que se esperava dele' },
  { key: 'notaAmbienteEquipe', label: 'Ambiente de equipe saudável' },
];

export const PERGUNTAS_A = {
  motivoPrincipal: 'Motivo principal da saída',
  motivosSecundarios: 'Motivos secundários (até 2, excluindo o principal)',
  notas: 'Avaliação de 1 a 5',
  notasExtremos: '1 = discordo totalmente · 5 = concordo totalmente',
  voltariaTrabalhar: 'Voltaria a trabalhar na empresa no futuro?',
  recomendariaEmpresa: 'Recomendaria a empresa como lugar para trabalhar?',
  destino: 'Para onde vai (sem citar nome de empresa)',
  oQuePoderiaReter: 'O que poderia ter sido feito para reter este colaborador',
  comentariosAdicionais: 'Comentários adicionais (opcional)',
} as const;

export const PERGUNTAS_B = {
  categoria: 'Categoria do desligamento',
  houveFeedbackFormal:
    'Houve processo formal de feedback ou plano de desenvolvimento antes da decisão?',
  houveFeedbackFormalAjuda:
    'Use "Não aplicável" para redução de quadro, fim de contrato e extinção de função.',
  nivelDocumentacao: 'Nível de documentação prévia do histórico que motivou a decisão',
  nivelDocumentacaoExtremos: '1 = nenhuma · 5 = totalmente documentado',
  justificativa: 'Justificativa objetiva do desligamento',
  necessidadeReposicao: 'Necessidade de reposição imediata da posição?',
} as const;

// -----------------------------------------------------------------------
// Payloads
// -----------------------------------------------------------------------

export interface FormularioVoluntario {
  readonly tipo: 'voluntario';
  readonly motivoPrincipal: MotivoSaidaVoluntaria;
  readonly motivosSecundarios: MotivoSaidaVoluntaria[];
  readonly notaConfiancaLideranca: number;
  readonly notaReconhecimento: number;
  readonly notaRemuneracaoJusta: number;
  readonly notaOportunidadeCrescimento: number;
  readonly notaClarezaExpectativas: number;
  readonly notaAmbienteEquipe: number;
  readonly voltariaTrabalhar: RespostaSimNaoTalvez;
  readonly recomendariaEmpresa: RespostaSimNaoTalvez;
  readonly destino: DestinoSaida;
  readonly oQuePoderiaReter: string;
  readonly comentariosAdicionais: string | null;
}

export interface FormularioInvoluntario {
  readonly tipo: 'involuntario';
  readonly categoria: CategoriaDesligamentoInvoluntario;
  readonly houveFeedbackFormal: RespostaSimNaoNa;
  readonly nivelDocumentacao: number;
  readonly justificativa: string;
  readonly necessidadeReposicao: boolean;
}

export type FormularioDesligamento = FormularioVoluntario | FormularioInvoluntario;

// -----------------------------------------------------------------------
// Validacao (Zod) — mesma regra no client e no servidor
// -----------------------------------------------------------------------

const NOTA = z.number().int().min(1).max(5);

function textoLimitado(msgMin: string, msgMax: string): z.ZodType<string> {
  return z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(TEXTO_MIN, { message: msgMin }).max(TEXTO_MAX, { message: msgMax }));
}

export const FORMULARIO_VOLUNTARIO_SCHEMA = z
  .object({
    tipo: z.literal('voluntario'),
    motivoPrincipal: z.enum(MOTIVO_SAIDA_VOLUNTARIA_VALUES),
    motivosSecundarios: z
      .array(z.enum(MOTIVO_SAIDA_VOLUNTARIA_VALUES))
      .max(2, { message: MSG_SECUNDARIOS_MAX }),
    notaConfiancaLideranca: NOTA,
    notaReconhecimento: NOTA,
    notaRemuneracaoJusta: NOTA,
    notaOportunidadeCrescimento: NOTA,
    notaClarezaExpectativas: NOTA,
    notaAmbienteEquipe: NOTA,
    voltariaTrabalhar: z.enum(RESPOSTA_SIM_NAO_TALVEZ_VALUES),
    recomendariaEmpresa: z.enum(RESPOSTA_SIM_NAO_TALVEZ_VALUES),
    destino: z.enum(DESTINO_SAIDA_VALUES),
    oQuePoderiaReter: textoLimitado(MSG_RETENCAO_MIN, MSG_RETENCAO_MAX),
    comentariosAdicionais: z
      .string()
      .nullable()
      .transform((v) => (v === null || v.trim().length === 0 ? null : v.trim()))
      .pipe(z.string().max(TEXTO_MAX, { message: MSG_COMENTARIOS_MAX }).nullable()),
  })
  .superRefine((v, ctx) => {
    if (v.motivosSecundarios.includes(v.motivoPrincipal)) {
      ctx.addIssue({
        code: 'custom',
        path: ['motivosSecundarios'],
        message: MSG_SECUNDARIO_IGUAL_PRINCIPAL,
      });
    }
    if (new Set(v.motivosSecundarios).size !== v.motivosSecundarios.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['motivosSecundarios'],
        message: MSG_SECUNDARIO_IGUAL_PRINCIPAL,
      });
    }
  });

export const FORMULARIO_INVOLUNTARIO_SCHEMA = z
  .object({
    tipo: z.literal('involuntario'),
    categoria: z.enum(CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_VALUES),
    houveFeedbackFormal: z.enum(RESPOSTA_SIM_NAO_NA_VALUES),
    nivelDocumentacao: NOTA,
    justificativa: textoLimitado(MSG_JUSTIFICATIVA_MIN, MSG_JUSTIFICATIVA_MAX),
    necessidadeReposicao: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (
      v.houveFeedbackFormal === 'nao_aplicavel' &&
      !CATEGORIAS_COM_NAO_APLICAVEL.includes(v.categoria)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['houveFeedbackFormal'],
        message: MSG_NAO_APLICAVEL_CATEGORIA,
      });
    }
  });

export const FORMULARIO_DESLIGAMENTO_SCHEMA = z.union([
  FORMULARIO_VOLUNTARIO_SCHEMA,
  FORMULARIO_INVOLUNTARIO_SCHEMA,
]);

/** Resultado da validacao para exibicao inline (campo -> primeira mensagem). */
export type ValidacaoFormulario =
  | { readonly ok: true; readonly data: FormularioDesligamento }
  | { readonly ok: false; readonly erros: Readonly<Record<string, string>> };

/** Valida o rascunho do formulario e devolve erros por campo. */
export function validarFormularioDesligamento(rascunho: unknown): ValidacaoFormulario {
  const tipo =
    typeof rascunho === 'object' && rascunho !== null && 'tipo' in rascunho
      ? (rascunho as { tipo: unknown }).tipo
      : null;
  const schema =
    tipo === 'involuntario' ? FORMULARIO_INVOLUNTARIO_SCHEMA : FORMULARIO_VOLUNTARIO_SCHEMA;
  const parsed = schema.safeParse(rascunho);
  if (parsed.success) {
    return { ok: true, data: parsed.data as FormularioDesligamento };
  }
  const erros: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const campo = String(issue.path[0] ?? 'formulario');
    if (erros[campo] === undefined) {
      const semValor = issue.code === 'invalid_type' || issue.code === 'invalid_value';
      erros[campo] = semValor ? MSG_CAMPO_OBRIGATORIO : issue.message;
    }
  }
  return { ok: false, erros };
}

/** Le o motivo da query string da rota do formulario (`?motivo=`). */
export function parseMotivoDesligamentoParam(
  raw: string | string[] | undefined,
): 'voluntario' | 'involuntario' | null {
  if (raw === 'voluntario' || raw === 'involuntario') {
    return raw;
  }
  return null;
}
