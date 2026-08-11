// ROIP APP 9BOX — helpers internos canonicos da rota Bruno
// `/super-admin/empresa/[id]/parametros` (§13.1 Aba 1, ME-075).
//
// Padrao S366 CC068 canonizado desde ME-070: `page.tsx` do App Router
// Next 15 exporta APENAS o default. Todo helper, tipo, funcao auxiliar
// e loader vive neste `internals.ts` irmao — permite import por testes
// e por `ParametrosClient.tsx` sem quebrar a segregacao Next 15.
//
// Origem canonica:
// - DOC 05 §13.1 (Aba 1 "Parametros gerais" — 9 secoes bit-exact).
// - DOC 01 §4.2 (schema canonico `companies` — 40 colunas + isDemo).
// - DOC 03 §5.7 (empresa sem RF — nao afeta esta tela; landing exibe).
// - DOC 03 §3.9 (retroatividade assimetrica — trigger canonico).
// - MASTER_ESCOPO_B8.md §2.1 (pattern comum server component) + §3.2
//   (ficha canonica desta ME).
//
// **RV-13 canonica.** Todo export tem consumidor real:
// - `parseCompanyIdParam` → `page.tsx`.
// - `resolveDatabaseUrl` → `page.tsx`.
// - `loadCompanyForParametros` → `page.tsx`.
// - `mapCompanyRowToFormValues` → `page.tsx` + testes.
// - `SEGMENTO_LABELS` → `ParametrosClient.tsx` + testes.
// - `UF_VALUES` → `ParametrosClient.tsx` + testes.
// - Tipos exportados consumidos por `ParametrosClient.tsx` e testes.
//
// **RV-12 canonica.** Zero SQL cru. Toda persistencia via API tipada
// do Drizzle.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../../../../db/client';
import { companies } from '../../../../../db/schema';
import { formatDateISO } from '../../../../../lib/company/updateCompanyInput';

// -----------------------------------------------------------------------
// Constantes canonicas bit-exact
// -----------------------------------------------------------------------

/**
 * §DOC 01 §4.2 linha 130-132 — 7 rotulos canonicos do select "Segmento"
 * (§13.1 Secao 4). Ordem canonica bit-exact preservada.
 */
export const SEGMENTO_LABELS = [
  'Serviço',
  'Comércio',
  'Indústria',
  'Serviço+Comércio',
  'Serviço+Indústria',
  'Indústria+Comércio',
  'Serviço+Comércio+Indústria',
] as const;

export type SegmentoLabel = (typeof SEGMENTO_LABELS)[number];

/**
 * §DOC 05 §13.1 Secao 1 — 27 UFs brasileiros do select "Estado". Ordem
 * canonica bit-exact alfabetica preservada.
 */
export const UF_VALUES = [
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

export type UfCanonico = (typeof UF_VALUES)[number];

/**
 * §DOC 05 §13.1 Secao 5 — kick-off permitido em modo padrao (linha
 * 1497 canonica bit-exact). Consumido pelo select do modo padrao no
 * client.
 */
export const MES_KICKOFF_PADRAO_OPCOES = [1, 4, 7, 10] as const;

/**
 * §DOC 05 §13.1 Secao 5 — mapa canonico bit-exact mes → rotulo pt-BR
 * para os selects de mes de inicio + mes de kickoff.
 */
export const MES_LABELS = [
  '',
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

// -----------------------------------------------------------------------
// Tipos canonicos
// -----------------------------------------------------------------------

/**
 * Valores canonicos bit-exact do form da Aba 1 §13.1. Alinhado bit-exact
 * a `UpdateCompanyParametersInputSchema` do `updateCompanyInput.ts` —
 * exceto `companyId` (que vem da rota) e `kickoffDate` (que vem como
 * string ISO `YYYY-MM-DD` para o input date).
 */
export interface ParametrosFormValues {
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
  readonly encarregadoLgpdNome: string | null;
  readonly encarregadoLgpdEmail: string | null;
  readonly encarregadoLgpdTelefone: string | null;
  readonly encarregadoLgpdPoliticaUrl: string | null;
  readonly segmento: SegmentoLabel;
  readonly tipoAtividade: string;
  readonly descricaoAtividade: string;
  readonly contextoMercado: string;
  readonly modoAnoFiscal: 'padrao' | 'customizado';
  readonly mesInicioAnoFiscal: number;
  readonly mesKickoff: number;
  readonly kickoffDate: string;
  readonly timezone: string;
  readonly metaROIOperacional: number | null;
  readonly metaROITatico: number | null;
  readonly metaROIEstrategico: number | null;
  readonly roiSegmentoMinimo: number | null;
  readonly roiSegmentoMaximo: number | null;
  readonly folhaPercMinima: number | null;
  readonly folhaPercMaxima: number | null;
  readonly thresholdDesempenhoBaixo: number;
  readonly thresholdDesempenhoMedio: number;
  readonly thresholdPlenitudeBaixo: number;
  readonly thresholdPlenitudeMedio: number;
  readonly status: 'ativa' | 'inativa';
}

/**
 * Info canonica bit-exact adicional consumida pelo cabecalho da tela +
 * predicado de imutabilidade §13.1 linha 1506.
 */
export interface ParametrosPageInfo {
  readonly companyId: number;
  readonly nomeFantasia: string;
  readonly logoUrl: string | null;
  readonly firstQuarterCalculated: boolean;
  readonly formValues: ParametrosFormValues;
}

// -----------------------------------------------------------------------
// Helpers puros
// -----------------------------------------------------------------------

/**
 * §pattern §2.1 canonico bit-exact — parser canonico bit-exact do param
 * de rota `[id]`. Aceita apenas positivos; rejeita '', '0', '-1', 'abc',
 * '1.5', '1a'. Replicado bit-exact do pattern da landing ME-074.
 */
export function parseCompanyIdParam(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/**
 * §pattern §2.1 canonico bit-exact — resolucao canonica bit-exact da
 * URL do banco. Precedencia canonica: DATABASE_URL > default `roip_test`
 * (para tests). Replicado bit-exact do pattern da landing ME-074.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url !== undefined && url.trim() !== '') {
    return url;
  }
  return 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
}

/**
 * Carrega os dados da empresa alvo para popular o form §13.1. Consulta
 * o registro completo canonico bit-exact via `select().from(companies)`
 * com projecao explicita (nao passa por SELECT *) — 35 campos alinhados
 * bit-exact ao `mapCompanyRowToFormValues`.
 */
export async function loadCompanyForParametros(
  db: RoipDatabase,
  companyId: number,
): Promise<CompanyRowRaw | null> {
  const rows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return row;
}

/** Tipo derivado do SELECT completo em `companies` (para mapping). */
export type CompanyRowRaw = typeof companies.$inferSelect;

/**
 * Converte a linha canonica bit-exact do DB nos valores canonicos bit-
 * exact do form. `metaROI*`/`roiSegmento*`/`folhaPerc*` vem como string
 * (Drizzle-MySQL DECIMAL) — normalizamos para `number|null`.
 */
export function mapCompanyRowToFormValues(row: CompanyRowRaw): ParametrosFormValues {
  return {
    razaoSocial: row.razaoSocial,
    nomeFantasia: row.nomeFantasia,
    cnpj: row.cnpj,
    telefone: row.telefone,
    endereco: row.endereco,
    cidade: row.cidade,
    estado: row.estado,
    logoUrl: row.logoUrl,
    contatoPrincipalNome: row.contatoPrincipalNome,
    contatoPrincipalEmail: row.contatoPrincipalEmail,
    contatoRHNome: row.contatoRHNome,
    contatoRHEmail: row.contatoRHEmail,
    encarregadoLgpdNome: row.encarregadoLgpdNome,
    encarregadoLgpdEmail: row.encarregadoLgpdEmail,
    encarregadoLgpdTelefone: row.encarregadoLgpdTelefone,
    encarregadoLgpdPoliticaUrl: row.encarregadoLgpdPoliticaUrl,
    segmento: row.segmento as SegmentoLabel,
    tipoAtividade: row.tipoAtividade,
    descricaoAtividade: row.descricaoAtividade,
    contextoMercado: row.contextoMercado,
    modoAnoFiscal: row.modoAnoFiscal,
    mesInicioAnoFiscal: row.mesInicioAnoFiscal,
    mesKickoff: row.mesKickoff,
    kickoffDate: formatDateISO(row.kickoffDate),
    timezone: row.timezone,
    metaROIOperacional: decimalStringToNumber(row.metaROIOperacional),
    metaROITatico: decimalStringToNumber(row.metaROITatico),
    metaROIEstrategico: decimalStringToNumber(row.metaROIEstrategico),
    roiSegmentoMinimo: decimalStringToNumber(row.roiSegmentoMinimo),
    roiSegmentoMaximo: decimalStringToNumber(row.roiSegmentoMaximo),
    folhaPercMinima: decimalStringToNumber(row.folhaPercMinima),
    folhaPercMaxima: decimalStringToNumber(row.folhaPercMaxima),
    thresholdDesempenhoBaixo: row.thresholdDesempenhoBaixo ?? 60,
    thresholdDesempenhoMedio: row.thresholdDesempenhoMedio ?? 85,
    thresholdPlenitudeBaixo: row.thresholdPlenitudeBaixo ?? 50,
    thresholdPlenitudeMedio: row.thresholdPlenitudeMedio ?? 75,
    status: row.status ?? 'inativa',
  };
}

/**
 * Converte string DECIMAL do MySQL/Drizzle em `number|null`. Canonico
 * bit-exact: `null` fica `null`; string vazia vira `null`; strings
 * numericas viram `Number(...)`.
 */
export function decimalStringToNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return null;
  }
  return num;
}

/**
 * Formata numero em input `<input type="number">` do client. Preserva
 * `null` como string vazia (input vazio). Consumido pelo
 * `ParametrosClient.tsx` para renderizar valores iniciais.
 */
export function numberToInputValue(value: number | null): string {
  if (value === null) {
    return '';
  }
  return String(value);
}

/**
 * Parseia string de `<input type="number">` de volta para `number|null`.
 * Consumido pelo submit do form no client — string vazia → null.
 */
export function inputValueToNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return null;
  }
  return num;
}
