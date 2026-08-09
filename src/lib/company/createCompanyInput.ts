// ROIP APP 9BOX — src/lib/company/createCompanyInput.ts (ME-Rota-C-D074).
//
// Origem canonica:
// - DOC 01 §4.2 (tabela `companies` — 35 colunas canonicas bit-exact).
// - DOC 05 §13.1 (Cadastro e edicao da empresa — Aba 1 "Parametros gerais",
//   9 secoes canonicas com save unico).
// - DOC 05 §18.7 (mensagens canonicas literais bit-exact para validacao).
// - CC054 / ME-062a / D066 — `kickoffDate` DATE obrigatorio.
// - FASE_PRONTIDAO §8.4 — campos LGPD (`encarregadoLgpd*`) opcionais na
//   criacao; nome e email obrigatorios so antes de `status='ativa'`.
//
// Escopo canonico bit-exact deste modulo:
// - `CreateCompanyInputSchema` — Zod schema canonico bit-exact para a
//   procedure `company.create` (35 campos alinhados ao DOC 01 §4.2).
// - `normalizeCreateCompanyInput` — helper server-side canonico bit-exact
//   que aplica as regras canonicas do DOC 01 §4.2 (linha 180 canonico):
//   * `modoAnoFiscal='padrao'` forca `mesInicioAnoFiscal=1` (ignora
//     input divergente — server-side FORCE canonico bit-exact) E exige
//     `mesKickoff∈{1,4,7,10}`.
//   * `modoAnoFiscal='customizado'` aceita `mesInicioAnoFiscal∈[1,12]`
//     E `mesKickoff∈[1,12]`.
//   * `status` FORCADO='inativa' (§9 DOC 05 §13.1 — sempre inativa ao
//     criar; server-side FORCE bit-exact, ignora input).
// - Constantes MSG_* canonicas literais bit-exact §18.7 DOC 05.
//
// **RV-13.** Cada export publico tem chamador na propria ME:
// - `CreateCompanyInputSchema` → `src/server/routers/company.ts`
//   (procedure `create`).
// - `CreateCompanyInputParsed` → tipo do input parseado.
// - `NormalizedCreateCompanyInput` → tipo do input pos-normalizacao.
// - `normalizeCreateCompanyInput` → consumidor: procedure `create`;
//   testado por `tests/unit/createCompanyInput.test.ts`.
// - Constantes `MSG_*` → procedure `create` (mensagens de rejeicao) +
//   `tests/integration/companyCreate.test.ts` (assercoes bit-exact).
// - `SEGMENTO_CANONICO_VALORES` → validacao Zod + testes unit/integration.
// - `MES_KICKOFF_PADRAO_PERMITIDO` → `NovaEmpresaClient.tsx` (select
//   canonico bit-exact §13.1) + `tests/unit`.

import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import { companies } from '../../db/schema';

// ============================================================
// Constantes canonicas literais bit-exact §18.7 DOC 05
// ============================================================

/** §18.7 DOC 05 — Razao social vazia. */
export const MSG_RAZAO_SOCIAL_VAZIA = 'Informe a razão social.' as const;

/** §18.7 DOC 05 — Nome fantasia vazio. */
export const MSG_NOME_FANTASIA_VAZIO = 'Informe o nome fantasia.' as const;

/** §18.7 DOC 05 — CNPJ com formato invalido. */
export const MSG_CNPJ_INVALIDO = 'Informe um CNPJ válido.' as const;

/** §18.7 DOC 05 — Mes de kick-off vazio. */
export const MSG_MES_KICKOFF_VAZIO = 'Selecione o mês de kick-off.' as const;

/** §18.7 DOC 05 — Meta de ROI fora do intervalo permitido. */
export const MSG_META_ROI_FORA_INTERVALO = 'Meta de ROI deve estar entre 0 e 100.' as const;

/** §18.7 DOC 05 — Threshold de Desempenho / Plenitude fora do intervalo. */
export const MSG_THRESHOLD_FORA_INTERVALO = 'Threshold deve estar entre 0 e 100.' as const;

/** §18.7 DOC 05 — Encarregado LGPD nome vazio antes da ativacao. */
export const MSG_LGPD_NOME_VAZIO =
  'O nome do encarregado de dados é obrigatório antes de ativar a empresa.' as const;

/** §18.7 DOC 05 — Encarregado LGPD email vazio/invalido antes da ativacao. */
export const MSG_LGPD_EMAIL_VAZIO =
  'O e-mail do encarregado de dados é obrigatório e deve ter formato válido.' as const;

/** §18.7 DOC 05 — Sucesso ao salvar. Consumido pelo toast client-side. */
export const MSG_SUCESSO_SALVAR = 'Cadastro salvo com sucesso.' as const;

/**
 * Mensagem canonica bit-exact para CNPJ duplicado (unique constraint).
 * D3 canonico da ME-Rota-C-D074 (RV-09 absoluta): §18.7 omissa; adotada
 * canonica bit-exact analogica ao §18.8 DOC 05 (padrao para unique
 * constraint global de entidade cadastravel — CPF/CNPJ).
 */
export const MSG_CNPJ_DUPLICADO =
  'CNPJ já cadastrado na plataforma. Entre em contato com o suporte se necessário.' as const;

/**
 * Mensagem canonica bit-exact para violacao de `modoAnoFiscal='padrao'` +
 * `mesInicioAnoFiscal != 1`. §13.1 DOC 05 linhas 1490-1497 canonizam
 * bit-exact que no ciclo padrao o mes de inicio e Janeiro (read-only) e
 * o kick-off e select com apenas 4 opcoes (Jan/Abr/Jul/Out).
 */
export const MSG_MODO_PADRAO_MES_INICIO_INVALIDO =
  'No modo padrão, o mês de início do ano fiscal deve ser 1 (Janeiro).' as const;

/** Mensagem canonica bit-exact para `mesKickoff∉{1,4,7,10}` em modo padrao. */
export const MSG_MODO_PADRAO_KICKOFF_INVALIDO =
  'No modo padrão, o mês de kick-off deve ser Janeiro, Abril, Julho ou Outubro.' as const;

// ============================================================
// Enums canonicos bit-exact §DOC 01 §4.2 + §DOC 05 §13.1
// ============================================================

/**
 * §DOC 01 §4.2 linha 130-132 — enum `segmento` canonico bit-exact.
 * 7 valores canonicos; acentos preservados bit-exact.
 */
export const SEGMENTO_CANONICO_VALORES = [
  'Serviço',
  'Comércio',
  'Indústria',
  'Serviço+Comércio',
  'Serviço+Indústria',
  'Indústria+Comércio',
  'Serviço+Comércio+Indústria',
] as const;

export type SegmentoCanonico = (typeof SEGMENTO_CANONICO_VALORES)[number];

/**
 * §DOC 01 §4.2 linha 159 — enum `modoAnoFiscal`.
 * `padrao` (default) ou `customizado`.
 */
export const MODO_ANO_FISCAL_VALORES = ['padrao', 'customizado'] as const;

export type ModoAnoFiscal = (typeof MODO_ANO_FISCAL_VALORES)[number];

/**
 * §DOC 05 §13.1 linha 1497 — no modo padrao, `mesKickoff` aceita apenas
 * Janeiro, Abril, Julho ou Outubro.
 */
export const MES_KICKOFF_PADRAO_PERMITIDO = [1, 4, 7, 10] as const;

// ============================================================
// Zod schema canonico bit-exact
// ============================================================

// Regex canonico bit-exact para CNPJ sanitizado (14 digitos numericos).
const CNPJ_REGEX = /^\d{14}$/;

// Regex canonico bit-exact para UF (2 letras maiusculas).
const UF_REGEX = /^[A-Z]{2}$/;

// Regex canonico bit-exact para data ISO YYYY-MM-DD.
const DATA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schema canonico bit-exact `company.create` — 35 campos alinhados
 * bit-exact ao DOC 01 §4.2. Campos opcionais na criacao sao aceitos como
 * `undefined` ou string vazia (normalizados adiante).
 */
export const CreateCompanyInputSchema = z.object({
  // --- Secao 1 — Dados da empresa (§13.1) ---
  razaoSocial: z.string().trim().min(1, { message: MSG_RAZAO_SOCIAL_VAZIA }).max(255),
  nomeFantasia: z.string().trim().min(1, { message: MSG_NOME_FANTASIA_VAZIO }).max(255),
  cnpj: z.string().trim().regex(CNPJ_REGEX, { message: MSG_CNPJ_INVALIDO }),
  telefone: z.string().trim().min(1).max(20),
  endereco: z.string().trim().min(1).max(255),
  cidade: z.string().trim().min(1).max(100),
  estado: z.string().trim().regex(UF_REGEX, { message: 'UF inválida.' }),
  logoUrl: z.string().trim().max(500).optional(),

  // --- Secao 2 — Contatos (§13.1) ---
  contatoPrincipalNome: z.string().trim().min(1).max(255),
  contatoPrincipalEmail: z.string().trim().email().max(255),
  contatoRHNome: z.string().trim().min(1).max(255),
  contatoRHEmail: z.string().trim().email().max(255),

  // --- Secao 4 — Perfil do negocio (§13.1) ---
  segmento: z.enum(SEGMENTO_CANONICO_VALORES),
  tipoAtividade: z.string().trim().min(1).max(255),
  descricaoAtividade: z.string().trim().min(1),
  contextoMercado: z.string().trim().min(1),

  // --- Secao 6 — Parametros de ROI (§13.1) — opcionais na criacao ---
  metaROIOperacional: z
    .number()
    .min(0, { message: MSG_META_ROI_FORA_INTERVALO })
    .max(100, { message: MSG_META_ROI_FORA_INTERVALO })
    .optional(),
  metaROITatico: z
    .number()
    .min(0, { message: MSG_META_ROI_FORA_INTERVALO })
    .max(100, { message: MSG_META_ROI_FORA_INTERVALO })
    .optional(),
  metaROIEstrategico: z
    .number()
    .min(0, { message: MSG_META_ROI_FORA_INTERVALO })
    .max(100, { message: MSG_META_ROI_FORA_INTERVALO })
    .optional(),
  roiSegmentoMinimo: z.number().optional(),
  roiSegmentoMaximo: z.number().optional(),
  folhaPercMinima: z.number().optional(),
  folhaPercMaxima: z.number().optional(),

  // --- Secao 7 — Thresholds do 9-Box (§13.1) — defaults canonicos ---
  thresholdDesempenhoBaixo: z
    .number()
    .int()
    .min(0, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .max(100, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .default(60),
  thresholdDesempenhoMedio: z
    .number()
    .int()
    .min(0, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .max(100, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .default(85),
  thresholdPlenitudeBaixo: z
    .number()
    .int()
    .min(0, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .max(100, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .default(50),
  thresholdPlenitudeMedio: z
    .number()
    .int()
    .min(0, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .max(100, { message: MSG_THRESHOLD_FORA_INTERVALO })
    .default(75),

  // --- Secao 5 — Ano fiscal e kick-off (§13.1) ---
  modoAnoFiscal: z.enum(MODO_ANO_FISCAL_VALORES).default('padrao'),
  mesInicioAnoFiscal: z.number().int().min(1).max(12).default(1),
  mesKickoff: z.number({ message: MSG_MES_KICKOFF_VAZIO }).int().min(1).max(12),
  kickoffDate: z.string().regex(DATA_ISO_REGEX, { message: 'Data de kick-off inválida.' }),
  timezone: z.string().trim().min(1).max(50).default('America/Sao_Paulo'),

  // --- Secao 3 — Encarregado de dados LGPD (§13.1 / FASE_PRONTIDAO §8.4) ---
  // Opcionais na criacao (§4.2 nota canonica linha 184); obrigatorios so
  // antes de `status='ativa'`. A empresa nasce `inativa` (§9 §13.1) —
  // portanto a validacao "obrigatorio antes de ativar" nao dispara na
  // procedure `create`, apenas em `activate` (fora do escopo desta ME).
  encarregadoLgpdNome: z.string().trim().max(255).optional(),
  encarregadoLgpdEmail: z.string().trim().max(255).optional(),
  encarregadoLgpdTelefone: z.string().trim().max(20).optional(),
  encarregadoLgpdPoliticaUrl: z.string().trim().max(500).optional(),
});

/** Tipo do input parseado (pre-normalizacao). */
export type CreateCompanyInputParsed = z.infer<typeof CreateCompanyInputSchema>;

// ============================================================
// Normalizacao canonica bit-exact §DOC 01 §4.2 (linha 180)
// ============================================================

/**
 * Tipo do input pos-normalizacao. Alinhado bit-exact aos campos da tabela
 * `companies` (§DOC 01 §4.2). `status` sempre `'inativa'` (§9 §13.1).
 * `mesInicioAnoFiscal` forcado a `1` no modo padrao. Strings opcionais
 * vazias convertidas para `null` para respeitar `DEFAULT NULL` do schema.
 */
export interface NormalizedCreateCompanyInput {
  readonly razaoSocial: string;
  readonly nomeFantasia: string;
  readonly cnpj: string;
  readonly telefone: string;
  readonly endereco: string;
  readonly cidade: string;
  readonly estado: string;
  readonly logoUrl: string | null;
  readonly contatoPrincipalNome: string;
  readonly contatoPrincipalEmail: string;
  readonly contatoRHNome: string;
  readonly contatoRHEmail: string;
  readonly segmento: SegmentoCanonico;
  readonly tipoAtividade: string;
  readonly descricaoAtividade: string;
  readonly contextoMercado: string;
  readonly metaROIOperacional: string | null;
  readonly metaROITatico: string | null;
  readonly metaROIEstrategico: string | null;
  readonly roiSegmentoMinimo: string | null;
  readonly roiSegmentoMaximo: string | null;
  readonly folhaPercMinima: string | null;
  readonly folhaPercMaxima: string | null;
  readonly thresholdDesempenhoBaixo: number;
  readonly thresholdDesempenhoMedio: number;
  readonly thresholdPlenitudeBaixo: number;
  readonly thresholdPlenitudeMedio: number;
  readonly modoAnoFiscal: ModoAnoFiscal;
  readonly mesInicioAnoFiscal: number;
  readonly mesKickoff: number;
  readonly kickoffDate: Date;
  readonly timezone: string;
  readonly encarregadoLgpdNome: string | null;
  readonly encarregadoLgpdEmail: string | null;
  readonly encarregadoLgpdTelefone: string | null;
  readonly encarregadoLgpdPoliticaUrl: string | null;
  readonly status: 'inativa';
}

/**
 * Erro canonico bit-exact de normalizacao. Consumido pela procedure
 * `create` para converter em `TRPCError({ code: 'BAD_REQUEST' })`.
 */
export class CreateCompanyValidationError extends Error {
  public readonly canonicalMessage: string;
  constructor(canonicalMessage: string) {
    super(canonicalMessage);
    this.canonicalMessage = canonicalMessage;
    this.name = 'CreateCompanyValidationError';
  }
}

/**
 * Converte string opcional vazia/undefined em `null` para respeitar
 * `DEFAULT NULL` do schema (§DOC 01 §4.2). Trim ja aplicado no schema.
 */
function nullifyEmpty(value: string | undefined): string | null {
  if (value === undefined || value === '') return null;
  return value;
}

/**
 * Serializa DECIMAL(5,2) canonico bit-exact (Drizzle exige string). Retorna
 * `null` se ausente para respeitar `DEFAULT NULL`.
 */
function decimalToString(value: number | undefined): string | null {
  if (value === undefined) return null;
  return value.toFixed(2);
}

/**
 * Serializa DECIMAL(4,1) canonico bit-exact para `folhaPerc*`.
 */
function decimal1ToString(value: number | undefined): string | null {
  if (value === undefined) return null;
  return value.toFixed(1);
}

/**
 * Aplica bit-exact as regras canonicas §DOC 01 §4.2 (linha 180):
 * - `modoAnoFiscal='padrao'` → `mesInicioAnoFiscal` FORCADO=1
 *   (server-side FORCE; ignora valor input divergente e retorna erro
 *   canonico bit-exact se input != 1) E `mesKickoff∈{1,4,7,10}`.
 * - `modoAnoFiscal='customizado'` → `mesInicioAnoFiscal∈[1,12]` E
 *   `mesKickoff∈[1,12]`.
 * - `status` FORCADO='inativa' (§9 §13.1).
 *
 * Racional bit-exact: DOC 01 §4.2 linha 180 diz "modoAnoFiscal='padrao':
 * mesInicioAnoFiscal fixo em 1". "Fixo" e "forcado" — o servidor rejeita
 * input divergente ao inves de silenciosamente sobrescrever, para
 * preservar coerencia semantica com o cliente (evita bug em que UI
 * mostra 6 mas banco grava 1).
 */
export function normalizeCreateCompanyInput(
  parsed: CreateCompanyInputParsed,
): NormalizedCreateCompanyInput {
  // --- Validacao canonica bit-exact do bloco Ano fiscal (§DOC 01 §4.2) ---
  if (parsed.modoAnoFiscal === 'padrao') {
    if (parsed.mesInicioAnoFiscal !== 1) {
      throw new CreateCompanyValidationError(MSG_MODO_PADRAO_MES_INICIO_INVALIDO);
    }
    if (!isMesKickoffPadraoPermitido(parsed.mesKickoff)) {
      throw new CreateCompanyValidationError(MSG_MODO_PADRAO_KICKOFF_INVALIDO);
    }
  }

  // --- Parse kickoffDate canonico bit-exact ---
  const kickoffDate = new Date(`${parsed.kickoffDate}T00:00:00.000Z`);
  if (Number.isNaN(kickoffDate.getTime())) {
    throw new CreateCompanyValidationError('Data de kick-off inválida.');
  }

  return {
    razaoSocial: parsed.razaoSocial,
    nomeFantasia: parsed.nomeFantasia,
    cnpj: parsed.cnpj,
    telefone: parsed.telefone,
    endereco: parsed.endereco,
    cidade: parsed.cidade,
    estado: parsed.estado,
    logoUrl: nullifyEmpty(parsed.logoUrl),
    contatoPrincipalNome: parsed.contatoPrincipalNome,
    contatoPrincipalEmail: parsed.contatoPrincipalEmail,
    contatoRHNome: parsed.contatoRHNome,
    contatoRHEmail: parsed.contatoRHEmail,
    segmento: parsed.segmento,
    tipoAtividade: parsed.tipoAtividade,
    descricaoAtividade: parsed.descricaoAtividade,
    contextoMercado: parsed.contextoMercado,
    metaROIOperacional: decimalToString(parsed.metaROIOperacional),
    metaROITatico: decimalToString(parsed.metaROITatico),
    metaROIEstrategico: decimalToString(parsed.metaROIEstrategico),
    roiSegmentoMinimo: decimalToString(parsed.roiSegmentoMinimo),
    roiSegmentoMaximo: decimalToString(parsed.roiSegmentoMaximo),
    folhaPercMinima: decimal1ToString(parsed.folhaPercMinima),
    folhaPercMaxima: decimal1ToString(parsed.folhaPercMaxima),
    thresholdDesempenhoBaixo: parsed.thresholdDesempenhoBaixo,
    thresholdDesempenhoMedio: parsed.thresholdDesempenhoMedio,
    thresholdPlenitudeBaixo: parsed.thresholdPlenitudeBaixo,
    thresholdPlenitudeMedio: parsed.thresholdPlenitudeMedio,
    modoAnoFiscal: parsed.modoAnoFiscal,
    mesInicioAnoFiscal: parsed.mesInicioAnoFiscal,
    mesKickoff: parsed.mesKickoff,
    kickoffDate,
    timezone: parsed.timezone,
    encarregadoLgpdNome: nullifyEmpty(parsed.encarregadoLgpdNome),
    encarregadoLgpdEmail: nullifyEmpty(parsed.encarregadoLgpdEmail),
    encarregadoLgpdTelefone: nullifyEmpty(parsed.encarregadoLgpdTelefone),
    encarregadoLgpdPoliticaUrl: nullifyEmpty(parsed.encarregadoLgpdPoliticaUrl),
    // §9 §13.1 — sempre inativa ao criar. Server-side FORCE bit-exact
    // canonico (§9 DOC 05 §13.1). Client nao pode contornar.
    status: 'inativa',
  };
}

/**
 * Helper canonico bit-exact para verificar se `mesKickoff` esta no
 * conjunto permitido para modo padrao ({1,4,7,10}). Exportado para o
 * client component consumir na renderizacao do select (§13.1 linha 1497).
 */
export function isMesKickoffPadraoPermitido(mes: number): boolean {
  return MES_KICKOFF_PADRAO_PERMITIDO.includes(
    mes as (typeof MES_KICKOFF_PADRAO_PERMITIDO)[number],
  );
}

// ============================================================
// Erro canonico bit-exact de CNPJ duplicado (unique constraint §4.2)
// ============================================================

/**
 * Erro canonico bit-exact para colisao de CNPJ unique constraint.
 * Consumido pela procedure `company.create` (converte em TRPCError
 * CONFLICT) e pela server action `criarEmpresaAction` (converte em erro
 * navegavel ao browser). Preserva simetria de fluxo canonica bit-exact
 * (RV-13 — chamador puro).
 */
export class CnpjDuplicateError extends Error {
  public readonly canonicalMessage: string;
  constructor() {
    super(MSG_CNPJ_DUPLICADO);
    this.canonicalMessage = MSG_CNPJ_DUPLICADO;
    this.name = 'CnpjDuplicateError';
  }
}

// ============================================================
// Helper canonico bit-exact `executeCreateCompany`
// ============================================================

/**
 * Executa canonicamente bit-exact o INSERT em `companies` via Drizzle
 * tipado (§RV-12) contra a base transacional. Chamado bit-exact:
 * 1. Pela procedure `company.create` do sub-router `company` (Bruno
 *    EXCLUSIVO via roleProcedure — DOC 02 §10.3).
 * 2. Pela server action `criarEmpresaAction` do `/super-admin/empresa/nova`
 *    (Bruno EXCLUSIVO via guard defense-in-depth).
 *
 * A validacao canonica bit-exact (§DOC 01 §4.2 linha 180) ja foi aplicada
 * previamente em `normalizeCreateCompanyInput` — este helper e apenas
 * o INSERT tipado. Colisao de CNPJ (unique constraint bit-exact §4.2
 * linha 120) capturada canonicamente bit-exact via `ER_DUP_ENTRY` e
 * transformada em `CnpjDuplicateError`.
 *
 * Contrato bit-exact: recebe `db` + `normalized` (ja normalizado); retorna
 * `{ companyId }`. Nunca envolve `db` em transacao propria — a caller
 * (procedure ou action) e responsavel por wrapping quando necessario.
 *
 * **RV-13.** Chamadores: procedure `company.create` + action
 * `criarEmpresaAction`. Testado em `tests/integration/companyCreate.test.ts`.
 */
export async function executeCreateCompany(
  db: RoipDatabase,
  normalized: NormalizedCreateCompanyInput,
): Promise<{ companyId: number }> {
  try {
    const [row] = await db
      .insert(companies)
      .values({
        razaoSocial: normalized.razaoSocial,
        nomeFantasia: normalized.nomeFantasia,
        cnpj: normalized.cnpj,
        telefone: normalized.telefone,
        endereco: normalized.endereco,
        cidade: normalized.cidade,
        estado: normalized.estado,
        logoUrl: normalized.logoUrl,
        contatoPrincipalNome: normalized.contatoPrincipalNome,
        contatoPrincipalEmail: normalized.contatoPrincipalEmail,
        contatoRHNome: normalized.contatoRHNome,
        contatoRHEmail: normalized.contatoRHEmail,
        segmento: normalized.segmento,
        tipoAtividade: normalized.tipoAtividade,
        descricaoAtividade: normalized.descricaoAtividade,
        contextoMercado: normalized.contextoMercado,
        metaROIOperacional: normalized.metaROIOperacional,
        metaROITatico: normalized.metaROITatico,
        metaROIEstrategico: normalized.metaROIEstrategico,
        roiSegmentoMinimo: normalized.roiSegmentoMinimo,
        roiSegmentoMaximo: normalized.roiSegmentoMaximo,
        folhaPercMinima: normalized.folhaPercMinima,
        folhaPercMaxima: normalized.folhaPercMaxima,
        thresholdDesempenhoBaixo: normalized.thresholdDesempenhoBaixo,
        thresholdDesempenhoMedio: normalized.thresholdDesempenhoMedio,
        thresholdPlenitudeBaixo: normalized.thresholdPlenitudeBaixo,
        thresholdPlenitudeMedio: normalized.thresholdPlenitudeMedio,
        modoAnoFiscal: normalized.modoAnoFiscal,
        mesInicioAnoFiscal: normalized.mesInicioAnoFiscal,
        mesKickoff: normalized.mesKickoff,
        kickoffDate: normalized.kickoffDate,
        timezone: normalized.timezone,
        encarregadoLgpdNome: normalized.encarregadoLgpdNome,
        encarregadoLgpdEmail: normalized.encarregadoLgpdEmail,
        encarregadoLgpdTelefone: normalized.encarregadoLgpdTelefone,
        encarregadoLgpdPoliticaUrl: normalized.encarregadoLgpdPoliticaUrl,
        status: normalized.status,
      })
      .$returningId();
    return { companyId: row!.id };
  } catch (err) {
    if (isMysqlDuplicateEntryOnCnpj(err)) {
      throw new CnpjDuplicateError();
    }
    throw err;
  }
}

/**
 * MySQL ER_DUP_ENTRY canonico bit-exact (mesmo padrao usado em
 * `rethrowMysqlErrorRF` do sub-router company). Codigo canonico 1062.
 */
const MYSQL_ERR_DUP_ENTRY = 1062;

/**
 * Detecta canonicamente bit-exact colisao de CNPJ percorrendo a cause
 * chain do erro Drizzle (mesmo padrao canonico `rethrowMysqlErrorRF` do
 * sub-router company — Drizzle encadeia o erro MySQL nativo via `cause`).
 * Navega ate 5 niveis para preservar simetria bit-exact com o padrao ja
 * canonico no repo. Confirma canonicamente que a colisao e na coluna
 * `cnpj` (unique constraint bit-exact §4.2 linha 120) — nao em outras
 * colunas que poderiam eventualmente ganhar unique constraint.
 */
function isMysqlDuplicateEntryOnCnpj(err: unknown): boolean {
  let node: unknown = err;
  for (let i = 0; i < 5 && node !== null && node !== undefined; i += 1) {
    const n = node as { errno?: number; code?: string; message?: string; cause?: unknown };
    const isDup = n.errno === MYSQL_ERR_DUP_ENTRY || n.code === 'ER_DUP_ENTRY';
    const message = typeof n.message === 'string' ? n.message : '';
    if (isDup && /cnpj/i.test(message)) {
      return true;
    }
    node = n.cause;
  }
  return false;
}
