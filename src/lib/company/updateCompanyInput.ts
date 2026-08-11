// ROIP APP 9BOX — input canonico bit-exact `company.updateParameters`
// (ME-075). Fecha D086 canonico bit-exact (company router incompleto).
//
// Origem canonica:
// - DOC 05 §13.1 (Aba 1 "Parametros gerais" — 9 secoes bit-exact:
//   Dados / Contatos / Encarregado LGPD / Perfil / Ano fiscal /
//   Parametros de ROI / Thresholds 9-Box / Radar NR-1 / Status).
// - DOC 01 §4.2 (schema canonico bit-exact `companies` — 40 colunas +
//   isDemo pos ME-068a-fix2 = 41 colunas).
// - DOC 03 §3.9 (retroatividade assimetrica — alteracao `metaROI*`
//   dispara recalculo; `threshold*` nao).
// - DOC 03 §5.7 (empresa em setup incompleto — sem RF).
// - DOC 06 §19.8 (encarregado LGPD obrigatorio antes de `status=ativa`).
//
// **RV-08 canonica.** Nenhuma decisao de implementacao aqui — schema
// puro Zod + mensagens canonicas + normalizacao pura + predicado de
// imutabilidade puro. Todas as escolhas de logica foram pre-decididas
// pelo Claude em pre-decisoes 1/2/3 aprovadas por Bruno na abertura.
//
// **RV-12 canonica.** Zero SQL cru. Nenhuma persistencia aqui.
//
// **RV-13 canonica.** Cada export tem chamador em:
// - `UpdateCompanyParametersInputSchema` → `src/server/routers/company.ts`
//   (proc `updateParameters`).
// - `MODO_ANO_FISCAL_KICKOFF_INVARIANT_FIELDS` → testes + router.
// - Mensagens `MSG_*` → testes verbatim + router `throw new TRPCError`.
// - `normalizeUpdateCompanyParametersInput` → router.
// - `validateAnoFiscalImmutability` → router.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.
//
// **S499 canonica bit-exact** — hook `EmitMetaROIChangedHook`
// fire-and-forget no `company.ts` (padrao S049 igual `EmitD050Facade`)
// e o mecanismo canonico bit-exact do trigger `triggerRetroactiveRecal-
// culation` (§3.9). Este arquivo apenas fornece o predicado puro
// `hasAnyMetaROIChanged` para o router decidir se dispara o hook.

import { z } from 'zod';

import {
  MES_KICKOFF_PADRAO_PERMITIDO,
  MODO_ANO_FISCAL_VALORES,
  SEGMENTO_CANONICO_VALORES,
  MSG_CNPJ_INVALIDO,
  MSG_LGPD_EMAIL_VAZIO,
  MSG_MES_KICKOFF_VAZIO,
  MSG_META_ROI_FORA_INTERVALO,
  MSG_MODO_PADRAO_KICKOFF_INVALIDO,
  MSG_MODO_PADRAO_MES_INICIO_INVALIDO,
  MSG_NOME_FANTASIA_VAZIO,
  MSG_RAZAO_SOCIAL_VAZIA,
  MSG_THRESHOLD_FORA_INTERVALO,
} from './createCompanyInput';

// ============================================================
// Mensagens canonicas literais adicionais (bit-exact §13.1 DOC 05)
// ============================================================

/**
 * §DOC 05 §13.1 linha 1506 (nota canonica bit-exact) — modo/inicio/
 * kickoff imutaveis apos primeiro trimestre fechado. Redigida analogica
 * bit-exact ao padrao §2.3 do DOC 03 (mensagens canonicas literais de
 * erro para validacoes de aplicacao). Verificada com Bruno na abertura
 * da ME-075 (Opcao A + pre-decisao 2 aprovada).
 */
export const MSG_ANO_FISCAL_IMUTAVEL: string =
  'Ano fiscal e mês de kick-off não podem ser alterados após o encerramento do ' +
  'primeiro trimestre.';

/** §DOC 05 §13.1 linha 1523 — thresholds nunca disparam recalculo (nota). */
export const MSG_THRESHOLD_SEM_RETROATIVIDADE =
  'Alterações em thresholds do 9-Box não disparam recálculo retroativo.' as const;

// ============================================================
// Regex canonicos bit-exact
// ============================================================

const CNPJ_REGEX = /^\d{14}$/;
const UF_REGEX = /^[A-Z]{2}$/;
const DATA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================
// Zod schema canonico bit-exact — `company.updateParameters`
// ============================================================

/**
 * Schema canonico bit-exact das 9 secoes da Aba 1 §13.1 DOC 05.
 * Alinhado bit-exact a §4.2 DOC 01 — 40 colunas de `companies`.
 *
 * Regras canonicas bit-exact absorvidas neste schema:
 * - Todos os campos de negocio sao aceitos (razao/fantasia/cnpj/contatos/
 *   segmento/perfil/roi/thresholds/ano fiscal/timezone/lgpd).
 * - `status` **NAO** faz parte deste input — troca de status e via proc
 *   dedicada `company.setStatus` (padrao canonico bit-exact CAMADA_AUTH
 *   §12 + Master §3.2).
 * - `id`/`createdAt`/`updatedAt` sao gerados pelo DB — nao input.
 * - Encarregado LGPD e opcional aqui; a validacao "obrigatorio antes
 *   de ativar" fica em `company.setStatus`.
 * - Validacao de imutabilidade pos-primeiro-trimestre e feita server-
 *   side em `validateAnoFiscalImmutability` (nao no schema — precisa
 *   consultar DB).
 * - Ajuste de retroatividade em `metaROI*` e feito server-side em
 *   `hasAnyMetaROIChanged` (nao no schema).
 */
export const UpdateCompanyParametersInputSchema = z.object({
  // --- companyId (identificador da empresa alvo) ---
  companyId: z.number().int().positive(),

  // --- Secao 1 — Dados da empresa ---
  razaoSocial: z.string().trim().min(1, { message: MSG_RAZAO_SOCIAL_VAZIA }).max(255),
  nomeFantasia: z.string().trim().min(1, { message: MSG_NOME_FANTASIA_VAZIO }).max(255),
  cnpj: z.string().trim().regex(CNPJ_REGEX, { message: MSG_CNPJ_INVALIDO }),
  telefone: z.string().trim().min(1).max(20),
  endereco: z.string().trim().min(1).max(255),
  cidade: z.string().trim().min(1).max(100),
  estado: z.string().trim().regex(UF_REGEX, { message: 'UF inválida.' }),
  logoUrl: z.string().trim().max(500).nullable().optional(),

  // --- Secao 2 — Contatos ---
  contatoPrincipalNome: z.string().trim().min(1).max(255),
  contatoPrincipalEmail: z.string().trim().email().max(255),
  contatoRHNome: z.string().trim().min(1).max(255),
  contatoRHEmail: z.string().trim().email().max(255),

  // --- Secao 3 — Encarregado LGPD (opcional aqui; obrigatorio em setStatus) ---
  encarregadoLgpdNome: z.string().trim().max(255).nullable().optional(),
  encarregadoLgpdEmail: z.string().trim().max(255).nullable().optional(),
  encarregadoLgpdTelefone: z.string().trim().max(20).nullable().optional(),
  encarregadoLgpdPoliticaUrl: z.string().trim().max(500).nullable().optional(),

  // --- Secao 4 — Perfil do negocio ---
  segmento: z.enum(SEGMENTO_CANONICO_VALORES),
  tipoAtividade: z.string().trim().min(1).max(255),
  descricaoAtividade: z.string().trim().min(1),
  contextoMercado: z.string().trim().min(1),

  // --- Secao 5 — Ano fiscal e kick-off ---
  modoAnoFiscal: z.enum(MODO_ANO_FISCAL_VALORES),
  mesInicioAnoFiscal: z.number().int().min(1).max(12),
  mesKickoff: z.number({ message: MSG_MES_KICKOFF_VAZIO }).int().min(1).max(12),
  kickoffDate: z.string().regex(DATA_ISO_REGEX, { message: 'Data de kick-off inválida.' }),
  timezone: z.string().trim().min(1).max(50),

  // --- Secao 6 — Parametros de ROI (opcionais) ---
  metaROIOperacional: z
    .number()
    .min(0, { message: MSG_META_ROI_FORA_INTERVALO })
    .max(100, { message: MSG_META_ROI_FORA_INTERVALO })
    .nullable()
    .optional(),
  metaROITatico: z
    .number()
    .min(0, { message: MSG_META_ROI_FORA_INTERVALO })
    .max(100, { message: MSG_META_ROI_FORA_INTERVALO })
    .nullable()
    .optional(),
  metaROIEstrategico: z
    .number()
    .min(0, { message: MSG_META_ROI_FORA_INTERVALO })
    .max(100, { message: MSG_META_ROI_FORA_INTERVALO })
    .nullable()
    .optional(),
  roiSegmentoMinimo: z.number().nullable().optional(),
  roiSegmentoMaximo: z.number().nullable().optional(),
  folhaPercMinima: z.number().nullable().optional(),
  folhaPercMaxima: z.number().nullable().optional(),

  // --- Secao 7 — Thresholds do 9-Box ---
  thresholdDesempenhoBaixo: z
    .number()
    .int()
    .min(0, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .max(100, { message: MSG_THRESHOLD_FORA_INTERVALO }),
  thresholdDesempenhoMedio: z
    .number()
    .int()
    .min(0, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .max(100, { message: MSG_THRESHOLD_FORA_INTERVALO }),
  thresholdPlenitudeBaixo: z
    .number()
    .int()
    .min(0, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .max(100, { message: MSG_THRESHOLD_FORA_INTERVALO }),
  thresholdPlenitudeMedio: z
    .number()
    .int()
    .min(0, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .max(100, { message: MSG_THRESHOLD_FORA_INTERVALO }),
});

/** Tipo do input parseado. */
export type UpdateCompanyParametersInputParsed = z.infer<typeof UpdateCompanyParametersInputSchema>;

/**
 * §DOC 05 §13.1 linhas 1490-1497 canonizam bit-exact: no modo padrao,
 * `mesInicioAnoFiscal=1` e `mesKickoff∈{1,4,7,10}`. Aplicada apos parse
 * do schema (regras cross-field que Zod aceita mas exige refine — aqui
 * fatoradas em funcao pura consumida pelo router para gerar mensagens
 * canonicas bit-exact `MSG_MODO_PADRAO_*`).
 */
export function assertModoPadraoConstraints(input: UpdateCompanyParametersInputParsed): void {
  if (input.modoAnoFiscal !== 'padrao') {
    return;
  }
  if (input.mesInicioAnoFiscal !== 1) {
    throw new UpdateCompanyValidationError(MSG_MODO_PADRAO_MES_INICIO_INVALIDO);
  }
  const permitido = MES_KICKOFF_PADRAO_PERMITIDO as readonly number[];
  if (!permitido.includes(input.mesKickoff)) {
    throw new UpdateCompanyValidationError(MSG_MODO_PADRAO_KICKOFF_INVALIDO);
  }
}

/**
 * Erro canonico bit-exact levantado por validacoes de aplicacao neste
 * lib. O router captura e converte em TRPCError `BAD_REQUEST` com a
 * mensagem canonica preservada bit-exact.
 */
export class UpdateCompanyValidationError extends Error {
  public readonly canonicalMessage: string;
  public constructor(message: string) {
    super(message);
    this.name = 'UpdateCompanyValidationError';
    this.canonicalMessage = message;
  }
}

// ============================================================
// Predicados canonicos bit-exact — retroatividade §3.9 + imutabilidade
// ============================================================

/**
 * §DOC 03 §3.9 — alteracao de `metaROIOperacional`, `metaROITatico` ou
 * `metaROIEstrategico` dispara `triggerRetroactiveRecalculation`. Este
 * predicado puro compara valores pre-persistidos (`current`) com o input
 * (`incoming`) e devolve `true` se qualquer um dos 3 campos mudou.
 *
 * Comparacao com tolerancia canonica bit-exact: valores decimais do MySQL
 * chegam como string (Drizzle). O predicado normaliza para `number|null`
 * antes de comparar, tratando `null == null` como "sem mudanca".
 */
export function hasAnyMetaROIChanged(
  current: MetaROIsCurrent,
  incoming: MetaROIsIncoming,
): boolean {
  if (!isSameMetaROI(current.metaROIOperacional, incoming.metaROIOperacional)) {
    return true;
  }
  if (!isSameMetaROI(current.metaROITatico, incoming.metaROITatico)) {
    return true;
  }
  if (!isSameMetaROI(current.metaROIEstrategico, incoming.metaROIEstrategico)) {
    return true;
  }
  return false;
}

/** Valores canonicos bit-exact das 3 `metaROI*` persistidas em `companies`. */
export interface MetaROIsCurrent {
  metaROIOperacional: string | null;
  metaROITatico: string | null;
  metaROIEstrategico: string | null;
}

/** Valores canonicos bit-exact das 3 `metaROI*` chegando no input. */
export interface MetaROIsIncoming {
  metaROIOperacional: number | null | undefined;
  metaROITatico: number | null | undefined;
  metaROIEstrategico: number | null | undefined;
}

function isSameMetaROI(current: string | null, incoming: number | null | undefined): boolean {
  const currentNum = current === null ? null : Number(current);
  const incomingNum = incoming === undefined ? null : incoming;
  if (currentNum === null && incomingNum === null) {
    return true;
  }
  if (currentNum === null || incomingNum === null) {
    return false;
  }
  // Tolerancia canonica: 2 casas decimais (schema DECIMAL(5,2)).
  return Math.abs(currentNum - incomingNum) < 0.005;
}

/**
 * §DOC 05 §13.1 linha 1506 (nota canonica) — modo/inicio/kickoff
 * imutaveis apos primeiro trimestre fechado. Predicado puro: dado
 * `hasFirstQuarter` (resultado da query DB) e os valores atuais versus
 * novos, valida canonicamente bit-exact que os 4 campos NAO mudam.
 */
export function assertAnoFiscalImmutabilityWhenLocked(
  hasFirstQuarter: boolean,
  current: AnoFiscalCurrent,
  incoming: AnoFiscalIncoming,
): void {
  if (!hasFirstQuarter) {
    return;
  }
  if (current.modoAnoFiscal !== incoming.modoAnoFiscal) {
    throw new UpdateCompanyValidationError(MSG_ANO_FISCAL_IMUTAVEL);
  }
  if (current.mesInicioAnoFiscal !== incoming.mesInicioAnoFiscal) {
    throw new UpdateCompanyValidationError(MSG_ANO_FISCAL_IMUTAVEL);
  }
  if (current.mesKickoff !== incoming.mesKickoff) {
    throw new UpdateCompanyValidationError(MSG_ANO_FISCAL_IMUTAVEL);
  }
  if (formatDateISO(current.kickoffDate) !== incoming.kickoffDate) {
    throw new UpdateCompanyValidationError(MSG_ANO_FISCAL_IMUTAVEL);
  }
}

/** Valores canonicos bit-exact do bloco ano fiscal atualmente persistidos. */
export interface AnoFiscalCurrent {
  modoAnoFiscal: 'padrao' | 'customizado';
  mesInicioAnoFiscal: number;
  mesKickoff: number;
  kickoffDate: Date;
}

/** Valores canonicos bit-exact do bloco ano fiscal chegando no input. */
export interface AnoFiscalIncoming {
  modoAnoFiscal: 'padrao' | 'customizado';
  mesInicioAnoFiscal: number;
  mesKickoff: number;
  kickoffDate: string;
}

/**
 * Constantes canonicas bit-exact — os 4 campos imutaveis pos-primeiro-
 * trimestre §13.1. Exportado para consumo em testes (bit-exact contra
 * mensagens verbatim).
 */
export const MODO_ANO_FISCAL_KICKOFF_INVARIANT_FIELDS = [
  'modoAnoFiscal',
  'mesInicioAnoFiscal',
  'mesKickoff',
  'kickoffDate',
] as const;

// ============================================================
// Normalizacao canonica bit-exact
// ============================================================

/**
 * Normaliza o input pos-parse antes do UPDATE. Aplica regras canonicas
 * bit-exact §4.2 DOC 01 linha 180 (padrao forca inicio=1, kickoff∈{1,
 * 4,7,10}) — porem aqui a validacao ja foi feita em
 * `assertModoPadraoConstraints`; a normalizacao apenas mapeia campos
 * opcionais para `null` explicito e converte `kickoffDate` string
 * ISO em `Date`.
 */
export function normalizeUpdateCompanyParametersInput(
  input: UpdateCompanyParametersInputParsed,
): NormalizedUpdate {
  assertModoPadraoConstraints(input);
  return {
    razaoSocial: input.razaoSocial,
    nomeFantasia: input.nomeFantasia,
    cnpj: input.cnpj,
    telefone: input.telefone,
    endereco: input.endereco,
    cidade: input.cidade,
    estado: input.estado,
    logoUrl: input.logoUrl ?? null,
    contatoPrincipalNome: input.contatoPrincipalNome,
    contatoPrincipalEmail: input.contatoPrincipalEmail,
    contatoRHNome: input.contatoRHNome,
    contatoRHEmail: input.contatoRHEmail,
    encarregadoLgpdNome: input.encarregadoLgpdNome ?? null,
    encarregadoLgpdEmail: normalizeEmailOpt(input.encarregadoLgpdEmail),
    encarregadoLgpdTelefone: input.encarregadoLgpdTelefone ?? null,
    encarregadoLgpdPoliticaUrl: input.encarregadoLgpdPoliticaUrl ?? null,
    segmento: input.segmento,
    tipoAtividade: input.tipoAtividade,
    descricaoAtividade: input.descricaoAtividade,
    contextoMercado: input.contextoMercado,
    modoAnoFiscal: input.modoAnoFiscal,
    mesInicioAnoFiscal: input.mesInicioAnoFiscal,
    mesKickoff: input.mesKickoff,
    kickoffDate: new Date(input.kickoffDate + 'T00:00:00Z'),
    timezone: input.timezone,
    metaROIOperacional: input.metaROIOperacional ?? null,
    metaROITatico: input.metaROITatico ?? null,
    metaROIEstrategico: input.metaROIEstrategico ?? null,
    roiSegmentoMinimo: input.roiSegmentoMinimo ?? null,
    roiSegmentoMaximo: input.roiSegmentoMaximo ?? null,
    folhaPercMinima: input.folhaPercMinima ?? null,
    folhaPercMaxima: input.folhaPercMaxima ?? null,
    thresholdDesempenhoBaixo: input.thresholdDesempenhoBaixo,
    thresholdDesempenhoMedio: input.thresholdDesempenhoMedio,
    thresholdPlenitudeBaixo: input.thresholdPlenitudeBaixo,
    thresholdPlenitudeMedio: input.thresholdPlenitudeMedio,
  };
}

/**
 * Se o input passou `''` como email LGPD, tratamos como `null` (nao
 * cadastrado). Se veio nao-vazio, validamos formato canonico bit-exact
 * §DOC 06 §19.8 (email valido). O rigor de "obrigatorio antes de
 * ativar" e aplicado em `company.setStatus`, nao aqui.
 */
function normalizeEmailOpt(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    throw new UpdateCompanyValidationError(MSG_LGPD_EMAIL_VAZIO);
  }
  return trimmed;
}

/**
 * Formato ISO canonico bit-exact `YYYY-MM-DD` de um `Date` da coluna
 * `kickoffDate` (schema `DATE`). Consumido pela comparacao de
 * imutabilidade.
 */
export function formatDateISO(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Payload canonico bit-exact do UPDATE em `companies`. */
export interface NormalizedUpdate {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
  logoUrl: string | null;
  contatoPrincipalNome: string;
  contatoPrincipalEmail: string;
  contatoRHNome: string;
  contatoRHEmail: string;
  encarregadoLgpdNome: string | null;
  encarregadoLgpdEmail: string | null;
  encarregadoLgpdTelefone: string | null;
  encarregadoLgpdPoliticaUrl: string | null;
  segmento: (typeof SEGMENTO_CANONICO_VALORES)[number];
  tipoAtividade: string;
  descricaoAtividade: string;
  contextoMercado: string;
  modoAnoFiscal: 'padrao' | 'customizado';
  mesInicioAnoFiscal: number;
  mesKickoff: number;
  kickoffDate: Date;
  timezone: string;
  metaROIOperacional: number | null;
  metaROITatico: number | null;
  metaROIEstrategico: number | null;
  roiSegmentoMinimo: number | null;
  roiSegmentoMaximo: number | null;
  folhaPercMinima: number | null;
  folhaPercMaxima: number | null;
  thresholdDesempenhoBaixo: number;
  thresholdDesempenhoMedio: number;
  thresholdPlenitudeBaixo: number;
  thresholdPlenitudeMedio: number;
}
