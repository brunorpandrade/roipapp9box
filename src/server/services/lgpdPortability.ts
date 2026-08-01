// ROIP APP 9BOX — service `lgpdPortability` (ME-062b, DOC 06 §19.6).
//
// Repositorio de leitura canonico do payload de portabilidade LGPD.
// Consumido pelo Route Handler `GET /api/portal/lgpd/portability`.
//
// Escopo canonico bit-exact (§19.6, reversao S341 canonizada):
//   - Dados cadastrais do titular (`employees` OU `cLevelMembers`).
//   - `instrumentA_responses` como respondente (autoavaliacao — filtro
//     canonico `employeeId = titularId`, exclusivo a titular
//     `employee` por schema).
//   - `instrumentD_responses` como respondente (avaliacao do lider
//     direto / C-level — filtro canonico `respondenteId = titularId`,
//     exclusivo a titular `employee` por schema).
//   - `copsoq_responses` como respondente (Radar NR-1 — filtro canonico
//     `employeeId = titularId`, exclusivo a titular `employee` por
//     schema).
//   - `individualProfileAssessments` como respondente (Perfil Individual
//     — filtro canonico `userType = titularType AND userId = titularId`,
//     polimorfico cobrindo employee E clevel).
//
// Fora do escopo canonico (§19.6 literal): avaliacoes de terceiros
// sobre o titular (Instrumento C, IQL, 9-Box, `plenitudeScore`,
// `scoreDesempenho`, avaliacoes do lider sobre este colaborador).
//
// Decorrencia canonica automatica do schema (S344 canonizada nesta ME):
// para `titularType='clevel'`, os SELECTs em `instrumentA_responses`,
// `instrumentD_responses` e `copsoq_responses` retornam vazio pois as
// FKs canonicas apontam exclusivamente a `employees.id`. O padrao
// preserva formato canonico do payload — as chaves existem sempre;
// apenas o conteudo varia.
//
// Ordenacao canonica: `respondidoEm ASC` para instrumentos (cronologia
// natural das respostas); `createdAt ASC` para copsoq (mesma cronologia);
// `tentativa ASC` para Perfil Individual (ordem canonica das tentativas).
//
// RV-12: 100% Drizzle tipado; zero SQL cru. RV-13: cada export tem
// chamador na propria ME (Route Handler + testes).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companies,
  copsoq_responses,
  employees,
  individualProfileAssessments,
  instrumentA_responses,
  instrumentD_responses,
} from '../../db/schema';

// ============================================================
// Tipos canonicos de retorno
// ============================================================

/** Discriminante canonico do titular (padrao polimorfico A). */
export type LgpdPortabilityTitularType = 'employee' | 'clevel';

/**
 * Dados cadastrais canonicos do titular (§19.6 — payload agregando
 * `employees` OU `cLevelMembers`). Campos exclusivos a employee
 * chegam como `null` para titular C-level.
 */
export interface LgpdPortabilityCadastraisPayload {
  titularType: LgpdPortabilityTitularType;
  nome: string;
  cpf: string;
  email: string | null;
  dataNascimento: string; // YYYY-MM-DD (Date convertido no service)
  dataAdmissao: string; // YYYY-MM-DD
  cargo: string;
  departamento: string;
  cbo: string | null;
  descricaoCBO: string | null;
  nivelHierarquico: 'operacional' | 'tatico' | 'estrategico' | null;
  senioridade: 'junior' | 'pleno' | 'senior' | null;
  jobFamily: string | null;
  status: 'ativo' | 'inativo';
}

/** Linha canonica de resposta bruta dos Instrumentos A ou D. */
export interface LgpdPortabilityInstrumentoResposta {
  trimestre: string;
  dimensao: number;
  itemIndex: number;
  valor: number;
  respondidoEm: string | null;
}

/** Linha canonica de resposta bruta do Radar NR-1 (COPSOQ). */
export interface LgpdPortabilityCopsoqResposta {
  cicloDbId: number;
  fator: number;
  itemIndex: number;
  valor: number;
}

/** Linha canonica de tentativa de Perfil Individual. */
export interface LgpdPortabilityIndividualProfileTentativa {
  assessmentId: number;
  tentativa: number;
  status: 'em_andamento' | 'enviado' | 'inconsistente';
  blocoAtual: number;
  enviadoEm: string | null;
  respostas: unknown;
}

/** Payload canonico agregado do titular (§19.6). */
export interface LgpdPortabilityPayload {
  companyNomeFantasia: string;
  cadastrais: LgpdPortabilityCadastraisPayload;
  instrumentA: LgpdPortabilityInstrumentoResposta[];
  instrumentD: LgpdPortabilityInstrumentoResposta[];
  copsoq: LgpdPortabilityCopsoqResposta[];
  individualProfile: LgpdPortabilityIndividualProfileTentativa[];
}

/** Erro canonico: titular nao encontrado na empresa. */
export class LgpdPortabilityTitularNotFoundError extends Error {
  public readonly companyId: number;
  public readonly titularType: LgpdPortabilityTitularType;
  public readonly titularId: number;
  constructor(companyId: number, titularType: LgpdPortabilityTitularType, titularId: number) {
    super(
      `LgpdPortability: titular ${titularType}#${titularId} nao encontrado em company#${companyId}`,
    );
    this.companyId = companyId;
    this.titularType = titularType;
    this.titularId = titularId;
  }
}

/** Erro canonico: empresa nao encontrada. */
export class LgpdPortabilityCompanyNotFoundError extends Error {
  public readonly companyId: number;
  constructor(companyId: number) {
    super(`LgpdPortability: company#${companyId} nao encontrada`);
    this.companyId = companyId;
  }
}

// ============================================================
// Helpers internos canonicos (RV-13)
// ============================================================

/**
 * Converte `Date` de coluna `date()` do MySQL para string canonica
 * `YYYY-MM-DD`. Drizzle retorna `Date` para colunas `date()`; o payload
 * canonico do PDF exige string ISO curta.
 */
function toYYYYMMDD(d: Date | string): string {
  if (typeof d === 'string') return d;
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Converte `Date` (ou null) de coluna `timestamp()` do MySQL para string
 * ISO 8601. `null` preservado como null (respostas nunca respondidas).
 */
function toISOStringOrNull(d: Date | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  return d.toISOString();
}

// ============================================================
// SELECTs canonicos por origem
// ============================================================

/**
 * SELECT canonico do nome fantasia da empresa (usado no cabecalho do
 * PDF via `layoutBase`). Falha defensiva quando a empresa nao existe —
 * throw `LgpdPortabilityCompanyNotFoundError`.
 */
export async function getCompanyNomeFantasia(db: RoipDatabase, companyId: number): Promise<string> {
  const rows = await db
    .select({ nomeFantasia: companies.nomeFantasia })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new LgpdPortabilityCompanyNotFoundError(companyId);
  return row.nomeFantasia;
}

/**
 * SELECT canonico dos dados cadastrais para titular `employee`
 * (§19.6). Falha defensiva quando o titular nao existe na empresa —
 * throw `LgpdPortabilityTitularNotFoundError`.
 */
export async function getCadastraisEmployee(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
): Promise<LgpdPortabilityCadastraisPayload> {
  const rows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.id, employeeId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new LgpdPortabilityTitularNotFoundError(companyId, 'employee', employeeId);
  }
  return {
    titularType: 'employee',
    nome: row.name,
    cpf: row.cpf,
    email: row.email ?? null,
    dataNascimento: toYYYYMMDD(row.dataNascimento),
    dataAdmissao: toYYYYMMDD(row.dataAdmissao),
    cargo: row.descricaoCBO,
    departamento: row.departamento,
    cbo: row.cbo,
    descricaoCBO: row.descricaoCBO,
    nivelHierarquico: row.nivelHierarquico,
    senioridade: row.senioridade,
    jobFamily: row.jobFamily,
    status: row.status ?? 'ativo',
  };
}

/**
 * SELECT canonico dos dados cadastrais para titular `clevel` (§19.6).
 * Falha defensiva quando o titular nao existe — throw
 * `LgpdPortabilityTitularNotFoundError`. Campos exclusivos de employee
 * (cbo, nivelHierarquico, senioridade, jobFamily) retornam `null`.
 */
export async function getCadastraisClevel(
  db: RoipDatabase,
  companyId: number,
  clevelId: number,
): Promise<LgpdPortabilityCadastraisPayload> {
  const rows = await db
    .select()
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.id, clevelId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new LgpdPortabilityTitularNotFoundError(companyId, 'clevel', clevelId);
  }
  return {
    titularType: 'clevel',
    nome: row.name,
    cpf: row.cpf,
    email: row.email,
    dataNascimento: toYYYYMMDD(row.dataNascimento),
    dataAdmissao: toYYYYMMDD(row.dataAdmissao),
    cargo: row.cargo,
    departamento: row.departamento,
    cbo: null,
    descricaoCBO: null,
    nivelHierarquico: null,
    senioridade: null,
    jobFamily: null,
    status: row.status ?? 'ativo',
  };
}

/**
 * SELECT canonico das respostas de Instrumento A do titular (§19.6).
 * Filtro canonico `companyId + employeeId`. Ordenacao canonica
 * `respondidoEm ASC` + `id ASC` (tie-breaker deterministico).
 * Titular C-level retorna vazio por schema.
 */
export async function getInstrumentARespostas(
  db: RoipDatabase,
  companyId: number,
  titularType: LgpdPortabilityTitularType,
  titularId: number,
): Promise<LgpdPortabilityInstrumentoResposta[]> {
  if (titularType !== 'employee') return [];
  const rows = await db
    .select({
      trimestre: instrumentA_responses.trimestre,
      dimensao: instrumentA_responses.dimensao,
      itemIndex: instrumentA_responses.itemIndex,
      valor: instrumentA_responses.valor,
      respondidoEm: instrumentA_responses.respondidoEm,
      id: instrumentA_responses.id,
    })
    .from(instrumentA_responses)
    .where(
      and(
        eq(instrumentA_responses.companyId, companyId),
        eq(instrumentA_responses.employeeId, titularId),
      ),
    )
    .orderBy(asc(instrumentA_responses.respondidoEm), asc(instrumentA_responses.id));
  return rows.map((r) => ({
    trimestre: r.trimestre,
    dimensao: r.dimensao,
    itemIndex: r.itemIndex,
    valor: r.valor,
    respondidoEm: toISOStringOrNull(r.respondidoEm),
  }));
}

/**
 * SELECT canonico das respostas de Instrumento D do titular como
 * respondente (§19.6). Filtro canonico `companyId + respondenteId`.
 * Ordenacao canonica `respondidoEm ASC` + `id ASC`. Titular C-level
 * retorna vazio por schema.
 */
export async function getInstrumentDRespostas(
  db: RoipDatabase,
  companyId: number,
  titularType: LgpdPortabilityTitularType,
  titularId: number,
): Promise<LgpdPortabilityInstrumentoResposta[]> {
  if (titularType !== 'employee') return [];
  const rows = await db
    .select({
      trimestre: instrumentD_responses.trimestre,
      dimensao: instrumentD_responses.dimensao,
      itemIndex: instrumentD_responses.itemIndex,
      valor: instrumentD_responses.valor,
      respondidoEm: instrumentD_responses.respondidoEm,
      id: instrumentD_responses.id,
    })
    .from(instrumentD_responses)
    .where(
      and(
        eq(instrumentD_responses.companyId, companyId),
        eq(instrumentD_responses.respondenteId, titularId),
      ),
    )
    .orderBy(asc(instrumentD_responses.respondidoEm), asc(instrumentD_responses.id));
  return rows.map((r) => ({
    trimestre: r.trimestre,
    dimensao: r.dimensao,
    itemIndex: r.itemIndex,
    valor: r.valor,
    respondidoEm: toISOStringOrNull(r.respondidoEm),
  }));
}

/**
 * SELECT canonico das respostas de Radar NR-1 (COPSOQ) do titular
 * (§19.6). Filtro canonico `companyId + employeeId`. Ordenacao canonica
 * `createdAt ASC` + `id ASC`. Titular C-level retorna vazio por schema.
 */
export async function getCopsoqRespostas(
  db: RoipDatabase,
  companyId: number,
  titularType: LgpdPortabilityTitularType,
  titularId: number,
): Promise<LgpdPortabilityCopsoqResposta[]> {
  if (titularType !== 'employee') return [];
  const rows = await db
    .select({
      cicloDbId: copsoq_responses.cicloDbId,
      fator: copsoq_responses.fator,
      itemIndex: copsoq_responses.itemIndex,
      valor: copsoq_responses.valor,
      id: copsoq_responses.id,
    })
    .from(copsoq_responses)
    .where(
      and(eq(copsoq_responses.companyId, companyId), eq(copsoq_responses.employeeId, titularId)),
    )
    .orderBy(asc(copsoq_responses.createdAt), asc(copsoq_responses.id));
  return rows.map((r) => ({
    cicloDbId: r.cicloDbId,
    fator: r.fator,
    itemIndex: r.itemIndex,
    valor: r.valor,
  }));
}

/**
 * SELECT canonico das tentativas de Perfil Individual do titular
 * (§19.6). Filtro canonico polimorfico `companyId + userType + userId`.
 * Ordenacao canonica `tentativa ASC` (cronologia das tentativas).
 * Cobre bit-exact employee E C-level.
 */
export async function getIndividualProfileTentativas(
  db: RoipDatabase,
  companyId: number,
  titularType: LgpdPortabilityTitularType,
  titularId: number,
): Promise<LgpdPortabilityIndividualProfileTentativa[]> {
  const rows = await db
    .select({
      id: individualProfileAssessments.id,
      tentativa: individualProfileAssessments.tentativa,
      status: individualProfileAssessments.status,
      blocoAtual: individualProfileAssessments.blocoAtual,
      enviadoEm: individualProfileAssessments.enviadoEm,
      respostas: individualProfileAssessments.respostas,
    })
    .from(individualProfileAssessments)
    .where(
      and(
        eq(individualProfileAssessments.companyId, companyId),
        eq(individualProfileAssessments.userType, titularType),
        eq(individualProfileAssessments.userId, titularId),
      ),
    )
    .orderBy(asc(individualProfileAssessments.tentativa));
  return rows.map((r) => ({
    assessmentId: r.id,
    tentativa: r.tentativa,
    status: r.status ?? 'em_andamento',
    blocoAtual: r.blocoAtual,
    enviadoEm: toISOStringOrNull(r.enviadoEm),
    respostas: r.respostas as unknown,
  }));
}

// ============================================================
// Orquestracao canonica do payload
// ============================================================

/**
 * Compoe o payload canonico integral da portabilidade LGPD (§19.6).
 * Coordena os SELECTs paralelos canonicos e agrega no formato bit-exact
 * consumido pelo template PDF.
 */
export async function buildLgpdPortabilityPayload(
  db: RoipDatabase,
  companyId: number,
  titularType: LgpdPortabilityTitularType,
  titularId: number,
): Promise<LgpdPortabilityPayload> {
  // Empresa canonica primeiro — falha defensiva se company sumiu (nao
  // deve ocorrer com portalToken valido, mas cobre corrida rara).
  const companyNomeFantasia = await getCompanyNomeFantasia(db, companyId);

  // Cadastrais canonicos por tipo de titular.
  const cadastrais =
    titularType === 'employee'
      ? await getCadastraisEmployee(db, companyId, titularId)
      : await getCadastraisClevel(db, companyId, titularId);

  // SELECTs canonicos paralelos das respostas do titular. Paralelismo
  // reduz latencia total; Drizzle tipado garante isolamento.
  const [instrumentA, instrumentD, copsoq, individualProfile] = await Promise.all([
    getInstrumentARespostas(db, companyId, titularType, titularId),
    getInstrumentDRespostas(db, companyId, titularType, titularId),
    getCopsoqRespostas(db, companyId, titularType, titularId),
    getIndividualProfileTentativas(db, companyId, titularType, titularId),
  ]);

  return {
    companyNomeFantasia,
    cadastrais,
    instrumentA,
    instrumentD,
    copsoq,
    individualProfile,
  };
}
