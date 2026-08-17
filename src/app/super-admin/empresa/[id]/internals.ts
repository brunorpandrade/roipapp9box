// ROIP APP 9BOX — helpers internos canonicos da rota Bruno
// `/super-admin/empresa/[id]` (landing §5.4, ME-074).
//
// Padrao S366 CC068 canonizado desde ME-070: `page.tsx` do App Router
// Next 15 exporta APENAS o default. Todo helper, tipo, funcao auxiliar
// e loader vive neste `internals.ts` irmao — permite import por testes
// e por `CompanyLandingClient.tsx` sem quebrar a segregacao Next 15.
//
// Origem canonica:
// - DOC 05 §5.4 (estrutura landing: cabecalho + aviso amarelo + 8 cards
//   + miniatura kanban + 6 acoes) + §5.2 (estado "Coleta de dados em
//   andamento") + §5.9-§5.10 (zonas placeholder).
// - DOC 02 §10.3 linha 807 (matriz Bruno acessa toda sub-rota /super-
//   admin/empresa/[id]).
// - DOC 03 §5.7 (empresa em setup incompleto — aviso amarelo canonico
//   quando nenhum employee ou cLevel tem `isResponsavelFinanceiro=true`).
// - DOC 06 §21.3 (contadores canonicos onboarding-lideres — SQL
//   `SUM(onboardingEstagio=?) WHERE isLider=true AND status='ativo'`).
//
// **RV-13 canonica.** Todo export tem consumidor real:
// - `resolveDatabaseUrl` → chamado por `page.tsx` (default export).
// - `parseCompanyIdParam` → chamado por `page.tsx`.
// - `loadCompanyForLanding` → chamado por `page.tsx`.
// - `loadLandingCounts` → chamado por `page.tsx`.
// - `loadOnboardingSummaryCounts` → chamado por `page.tsx`.
// - `loadLastClosedQuarter` → chamado por `page.tsx`.
// - `loadLastQuarterFaturamentoMedio` → chamado por `page.tsx`.
// - `loadMesAtualClosureStatus` → chamado por `page.tsx`.
// - `loadDepartmentCounts` → chamado por `page.tsx`.
// - Tipos exportados consumidos por `CompanyLandingClient.tsx` e testes
//   `me074-landing.test.tsx`.
//
// **RV-12 canonica.** Zero SQL cru. Toda persistencia via API tipada
// do Drizzle.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import { and, eq, sql } from 'drizzle-orm';

import type { RoipDatabase } from '../../../../db/client';
import {
  cLevelMembers,
  companies,
  companyMonthlyData,
  employees,
  monthlyClosureStatus,
  performanceQuarterlyData,
} from '../../../../db/schema';

// -----------------------------------------------------------------------
// Tipos canonicos
// -----------------------------------------------------------------------

/**
 * Estagio canonico do onboarding de lideres (§21.3 CAMADA_OPERACOES).
 * Duplicado localmente para nao introduzir dependencia inversa em
 * `src/server/routers/leaderOnboarding.ts` (server-only tRPC). Values
 * canonicos alinhados bit-exact com `ONBOARDING_ESTAGIO_VALUES` do
 * schema.
 */
export type LandingOnboardingEstagio = 'treinar' | 'em_treinamento' | 'treinado' | 'reciclagem';

export interface LandingOnboardingSummary {
  readonly treinar: number;
  readonly em_treinamento: number;
  readonly treinado: number;
  readonly reciclagem: number;
}

/**
 * Dados canonicos bit-exact da empresa consumidos pelo cabecalho §5.4:
 * logo + nome fantasia + badge de status + botao `[Dados cadastrais]`.
 */
export interface CompanyLandingInfo {
  readonly id: number;
  readonly nomeFantasia: string;
  readonly status: 'ativa' | 'inativa';
  readonly logoUrl: string | null;
  readonly isDemo: boolean;
}

/**
 * Contadores canonicos do §5.4: total colaboradores ativos, total
 * C-levels ativos, e flag `hasResponsavelFinanceiro` para o aviso amarelo
 * canonico §5.7 CAMADA_NEGOCIO.
 */
export interface LandingCounts {
  readonly totalColaboradoresAtivos: number;
  readonly totalCLevelsAtivos: number;
  readonly hasResponsavelFinanceiro: boolean;
}

/**
 * Contagem canonica de colaboradores ativos por departamento §5.4.
 * Cada linha vira 1 card clicavel na landing.
 */
export interface DepartmentCount {
  readonly departamento: string;
  readonly total: number;
}

/**
 * Status canonico dos dados mensais para o mes corrente §5.4:
 * - `preenchido = true` se `companyMonthlyData` tem linha do mes com
 *   `faturamentoBruto IS NOT NULL`.
 * - `dataLimite`: dia 10 do mes seguinte (formato canonico ISO YYYY-MM-DD).
 *
 * Os dois cards §5.4 (RH e Lideres) sao renderizados a partir deste
 * mesmo shape — na v1 canonica, granularidade minima (mes preenchido
 * vs pendente). Detalhamento por lider vira em MEs seguintes do B8.
 */
export interface MesAtualClosureStatus {
  readonly mesAtual: string;
  readonly dataLimiteRh: string;
  readonly rhPreenchido: boolean;
  readonly closureStatus: 'aberto' | 'fechado' | 'desbloqueado' | null;
  /**
   * ME-083 D-ME083-9 aprovado — expansao canonica bit-exact para cobrir
   * card §5.5 "Status dados do mes — Lideres". Contagens canonicas:
   * - `lideresTotal`: total de employees ativos com `isLider=true` na
   *   empresa (base do denominador do card).
   * - `lideresPreenchidos`: `null` no B9 (definicao canonica de "lider
   *   preencheu dados do mes" ainda nao esta canonizada — a semantica
   *   depende do modelo de expectativa mensal por lider, que so nasce
   *   em ME futura). Consumidor deve renderizar estado §5.2 "Coleta de
   *   dados em andamento" quando `lideresPreenchidos === null`.
   * Painel §5.4 pre-existente NAO consome estes campos (renderiza card
   * proprio com literal "Coleta de dados em andamento"); expansao e
   * aditiva e nao quebra bit-exact do §5.4.
   */
  readonly lideresTotal: number;
  readonly lideresPreenchidos: number | null;
}

// -----------------------------------------------------------------------
// Helpers canonicos puros
// -----------------------------------------------------------------------

/**
 * Resolve URL canonica do banco a partir do ambiente. Falha explicita
 * quando ausente para nao gerar tela em branco no cliente.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Parseia canonicamente `params.id` da rota `/super-admin/empresa/[id]`.
 * Retorna `null` para qualquer input invalido (nao-inteiro, negativo,
 * zero, ou com caracteres a mais). Consumidor emite `notFound()` para
 * `null`.
 */
export function parseCompanyIdParam(raw: string): number | null {
  if (raw === '') {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || String(parsed) !== raw) {
    return null;
  }
  return parsed;
}

// -----------------------------------------------------------------------
// Loaders canonicos server-side (Drizzle tipado — RV-12)
// -----------------------------------------------------------------------

/**
 * Carrega dados canonicos bit-exact da empresa para o cabecalho §5.4.
 * Retorna `null` para `companyId` inexistente — consumidor emite
 * `notFound()`.
 */
export async function loadCompanyForLanding(
  db: RoipDatabase,
  companyId: number,
): Promise<CompanyLandingInfo | null> {
  const rows = await db
    .select({
      id: companies.id,
      nomeFantasia: companies.nomeFantasia,
      status: companies.status,
      logoUrl: companies.logoUrl,
      isDemo: companies.isDemo,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    nomeFantasia: row.nomeFantasia,
    status: (row.status ?? 'inativa') as 'ativa' | 'inativa',
    logoUrl: row.logoUrl ?? null,
    isDemo: Boolean(row.isDemo),
  };
}

/**
 * Carrega canonicamente:
 * - Total de employees ativos §5.4 card 1.
 * - Total de cLevelMembers ativos §5.4 card 5.
 * - Flag canonica `hasResponsavelFinanceiro` §5.7 — TRUE quando
 *   existe pelo menos 1 registro com `isResponsavelFinanceiro=true`
 *   em `employees` OU em `cLevelMembers` (elegibilidade canonica
 *   §5.3 CAMADA_NEGOCIO). A flag governa o aviso amarelo §5.4.
 */
export async function loadLandingCounts(
  db: RoipDatabase,
  companyId: number,
): Promise<LandingCounts> {
  const [empRows, cLevelRows, rfEmpRows, rfCLevelRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo'))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(cLevelMembers)
      .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.status, 'ativo'))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(employees)
      .where(
        and(
          eq(employees.companyId, companyId),
          eq(employees.status, 'ativo'),
          eq(employees.isResponsavelFinanceiro, true),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(cLevelMembers)
      .where(
        and(
          eq(cLevelMembers.companyId, companyId),
          eq(cLevelMembers.status, 'ativo'),
          eq(cLevelMembers.isResponsavelFinanceiro, true),
        ),
      ),
  ]);
  const rfCountEmployees = Number(rfEmpRows[0]?.count ?? 0);
  const rfCountCLevels = Number(rfCLevelRows[0]?.count ?? 0);
  return {
    totalColaboradoresAtivos: Number(empRows[0]?.count ?? 0),
    totalCLevelsAtivos: Number(cLevelRows[0]?.count ?? 0),
    hasResponsavelFinanceiro: rfCountEmployees + rfCountCLevels > 0,
  };
}

/**
 * Carrega contagem canonica de employees ativos por `departamento` §5.4.
 * Retorna array vazio quando nenhuma linha ativa — consumidor renderiza
 * apenas o card "Total de colaboradores" nesse caso.
 */
export async function loadDepartmentCounts(
  db: RoipDatabase,
  companyId: number,
): Promise<readonly DepartmentCount[]> {
  const rows = await db
    .select({
      departamento: employees.departamento,
      total: sql<number>`count(*)`,
    })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
    .groupBy(employees.departamento);
  return rows.map((r) => ({
    departamento: r.departamento,
    total: Number(r.total),
  }));
}

/**
 * Carrega contagens canonicas §21.3 do onboarding de lideres — SUM por
 * estagio, WHERE `companyId=?` AND `isLider=true` AND `status='ativo'`.
 * Implementacao Drizzle tipada equivalente ao SQL canonico do §21.3
 * (RV-12 — sem uso de sql template literal cru).
 */
export async function loadOnboardingSummaryCounts(
  db: RoipDatabase,
  companyId: number,
): Promise<LandingOnboardingSummary> {
  const rows = await db
    .select({
      onboardingEstagio: employees.onboardingEstagio,
    })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.isLider, true),
        eq(employees.status, 'ativo'),
      ),
    );
  const counts: LandingOnboardingSummary = {
    treinar: 0,
    em_treinamento: 0,
    treinado: 0,
    reciclagem: 0,
  };
  return rows.reduce<LandingOnboardingSummary>((acc, r) => {
    const key = r.onboardingEstagio;
    if (key === null) {
      return acc;
    }
    if (key === 'treinar') {
      return { ...acc, treinar: acc.treinar + 1 };
    }
    if (key === 'em_treinamento') {
      return { ...acc, em_treinamento: acc.em_treinamento + 1 };
    }
    if (key === 'treinado') {
      return { ...acc, treinado: acc.treinado + 1 };
    }
    if (key === 'reciclagem') {
      return { ...acc, reciclagem: acc.reciclagem + 1 };
    }
    return acc;
  }, counts);
}

/**
 * Carrega canonicamente o MAX(`trimestre`) da `performanceQuarterlyData`
 * para a empresa §5.4 card 6. Retorna `null` quando nao ha trimestre
 * calculado — consumidor renderiza estado §5.2 "Coleta de dados em
 * andamento".
 *
 * Formato canonico do `trimestre` na tabela: string `YYYY-Q1..Q4` (7
 * chars). Colacao lexicografica preserva ordem cronologica dentro do
 * mesmo ano; comparacao cross-ano tambem funciona pelo prefixo YYYY.
 */
export async function loadLastClosedQuarter(
  db: RoipDatabase,
  companyId: number,
): Promise<string | null> {
  const rows = await db
    .select({
      maxTrimestre: sql<string | null>`MAX(${performanceQuarterlyData.trimestre})`,
    })
    .from(performanceQuarterlyData)
    .where(eq(performanceQuarterlyData.companyId, companyId));
  const raw = rows[0]?.maxTrimestre;
  if (raw === null || raw === undefined) {
    return null;
  }
  return raw;
}

/**
 * Carrega faturamento medio mensal §5.4 card 4 — media aritmetica de
 * `faturamentoBruto` do ultimo trimestre calculado (3 meses). Reutiliza
 * `loadLastClosedQuarter`; retorna `null` quando trimestre nao existe
 * ou quando nenhum dos 3 meses tem `faturamentoBruto` preenchido.
 *
 * Regra canonica de derivacao mes → trimestre: assume ano fiscal padrao
 * (§3.6 CAMADA_NEGOCIO). Q1=Jan/Fev/Mar, Q2=Abr/Mai/Jun, Q3=Jul/Ago/Set,
 * Q4=Out/Nov/Dez. Modo ano fiscal customizado nao entra na v1 canonica
 * bit-exact desta landing — pode ser adicionado em ME futura sem quebrar
 * este contrato.
 */
export async function loadLastQuarterFaturamentoMedio(
  db: RoipDatabase,
  companyId: number,
): Promise<number | null> {
  const trimestre = await loadLastClosedQuarter(db, companyId);
  if (trimestre === null) {
    return null;
  }
  const ano = trimestre.slice(0, 4);
  const qNum = trimestre.slice(5, 7);
  const mesesByQ: Record<string, readonly string[]> = {
    Q1: ['01', '02', '03'],
    Q2: ['04', '05', '06'],
    Q3: ['07', '08', '09'],
    Q4: ['10', '11', '12'],
  };
  const meses = mesesByQ[qNum];
  if (meses === undefined) {
    return null;
  }
  const mesTokens = meses.map((m) => `${ano}-${m}`);
  const rows = await db
    .select({
      mes: companyMonthlyData.mes,
      faturamentoBruto: companyMonthlyData.faturamentoBruto,
    })
    .from(companyMonthlyData)
    .where(eq(companyMonthlyData.companyId, companyId));
  const preenchidos = rows.filter((r) => mesTokens.includes(r.mes) && r.faturamentoBruto !== null);
  if (preenchidos.length === 0) {
    return null;
  }
  const soma = preenchidos.reduce((acc, r) => acc + Number(r.faturamentoBruto), 0);
  return soma / preenchidos.length;
}

/**
 * Deriva canonicamente o mes atual §5.4 no formato `YYYY-MM` a partir
 * de uma referencia temporal (`Date`). Pura para permitir teste
 * determinista via injecao de `Date` mockado.
 */
export function deriveMesAtual(reference: Date): string {
  const ano = reference.getUTCFullYear();
  const mes = reference.getUTCMonth() + 1;
  return `${ano}-${mes < 10 ? '0' : ''}${mes}`;
}

/**
 * Deriva canonicamente a data limite RH §5.4 (dia 10 do mes seguinte
 * ao mes atual). Formato canonico ISO `YYYY-MM-DD`. Puro.
 */
export function deriveDataLimiteRh(reference: Date): string {
  const ano = reference.getUTCFullYear();
  const mes = reference.getUTCMonth();
  const proximoMes = new Date(Date.UTC(ano, mes + 1, 10));
  const anoOut = proximoMes.getUTCFullYear();
  const mesOut = proximoMes.getUTCMonth() + 1;
  return `${anoOut}-${mesOut < 10 ? '0' : ''}${mesOut}-10`;
}

/**
 * Carrega canonicamente o status do fechamento mensal do mes corrente
 * §5.4. Combina:
 * - `mesAtual` derivado da referencia temporal (`Date` corrente).
 * - `dataLimiteRh` derivada canonica (dia 10 do mes seguinte).
 * - `rhPreenchido`: TRUE quando existe linha em `companyMonthlyData`
 *   para `(companyId, mesAtual)` com `faturamentoBruto NOT NULL`.
 * - `closureStatus`: valor bit-exact da `monthlyClosureStatus.status`
 *   para o mes (null quando nenhuma linha).
 */
export async function loadMesAtualClosureStatus(
  db: RoipDatabase,
  companyId: number,
  reference: Date,
): Promise<MesAtualClosureStatus> {
  const mesAtual = deriveMesAtual(reference);
  const dataLimiteRh = deriveDataLimiteRh(reference);
  const [monthlyRows, closureRows, lideresRows] = await Promise.all([
    db
      .select({
        faturamentoBruto: companyMonthlyData.faturamentoBruto,
      })
      .from(companyMonthlyData)
      .where(and(eq(companyMonthlyData.companyId, companyId), eq(companyMonthlyData.mes, mesAtual)))
      .limit(1),
    db
      .select({
        status: monthlyClosureStatus.status,
      })
      .from(monthlyClosureStatus)
      .where(
        and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, mesAtual)),
      )
      .limit(1),
    // ME-083 D-ME083-9 — total canonico de lideres ativos da empresa para
    // o denominador do card §5.5 "Status dados do mes — Lideres".
    db
      .select({ count: sql<number>`count(*)` })
      .from(employees)
      .where(
        and(
          eq(employees.companyId, companyId),
          eq(employees.isLider, true),
          eq(employees.status, 'ativo'),
        ),
      ),
  ]);
  const monthlyRow = monthlyRows[0];
  const closureRow = closureRows[0];
  return {
    mesAtual,
    dataLimiteRh,
    rhPreenchido: monthlyRow !== undefined && monthlyRow.faturamentoBruto !== null,
    closureStatus: closureRow?.status ?? null,
    lideresTotal: Number(lideresRows[0]?.count ?? 0),
    // ME-083 D-ME083-9 — `null` no B9. Definicao canonica de "lider
    // preencheu dados do mes" pendente (modelo de expectativa mensal
    // por lider nascera em ME futura). Consumidor renderiza estado
    // §5.2 "Coleta de dados em andamento" enquanto for `null`.
    lideresPreenchidos: null,
  };
}

// -----------------------------------------------------------------------
// Formatadores canonicos consumidos pelo client (RV-13 canonica)
// -----------------------------------------------------------------------

/**
 * Formata faturamento canonico bit-exact `R$ X.XXX,XX` (locale pt-BR)
 * para renderizacao no card §5.4. Retorna string canonica §5.2 quando
 * `null` — "Coleta de dados em andamento".
 */
export function formatFaturamentoMedio(valor: number | null): string {
  if (valor === null) {
    return 'Coleta de dados em andamento';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

/**
 * Formata trimestre canonico `YYYY-QN` → `NºTri/YYYY` para consumo
 * legivel no card §5.4. `null` renderiza estado §5.2.
 */
export function formatTrimestre(trimestre: string | null): string {
  if (trimestre === null) {
    return 'Coleta de dados em andamento';
  }
  const ano = trimestre.slice(0, 4);
  const q = trimestre.slice(5, 7);
  const numTri: Record<string, string> = {
    Q1: '1º',
    Q2: '2º',
    Q3: '3º',
    Q4: '4º',
  };
  const label = numTri[q];
  if (label === undefined) {
    return trimestre;
  }
  return `${label}Tri/${ano}`;
}
