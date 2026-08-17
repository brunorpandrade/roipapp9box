// ROIP APP 9BOX — helpers internos canonicos da rota `/painel-rh`
// (Painel do RH §5.5, ME-083).
//
// Padrao S366 CC068 canonizado: `page.tsx` do App Router Next 15 exporta
// APENAS o default. Todo helper, tipo, funcao auxiliar e loader vive
// neste `internals.ts` irmao — permite import por testes e por
// `PainelRHClient.tsx` sem quebrar a segregacao Next 15.
//
// Origem canonica:
// - DOC 05 §5.5 (Painel RH — 5 secoes canonicas: Visao geral, Minha
//   equipe [RH-Lider C1/C2], Cadeia indireta [RH-Lider C2], Meu portal,
//   Radar da empresa).
// - DOC 05 §5.1 (estrutura comum a paineis).
// - DOC 05 §5.2 (estado "Coleta de dados em andamento" — Radar da empresa
//   IQL+Clima renderiza placeholder no B9, debito D-B9-CLIMA-IQL-
//   PLACEHOLDER).
// - DOC 05 §5.8 (Card resumo "Pendencias no portal" — RH puro/RHL1/RHL2).
// - DOC 05 §5.9 (zona reservada "9-Box" — texto canonico bit-exact).
// - DOC 05 §5.10 (bloco "Status da plataforma").
// - DOC 02 §10.3 linha 808 (matriz Bruno redirect_painel; RH e RH-Lider
//   allow; C-level e Lider deny).
// - DOC 02 §11.3 PC1c (guarda de agregados analiticos — total de
//   colaboradores ativos exibido ao RH INCLUI C-levels).
//
// Reuso canonico ME-083 D-ME083-2 (aprovado): loaders puros. Reaproveita
// loaders do landing §5.4 (`app/super-admin/empresa/[id]/internals.ts`)
// via import direto — helpers puros sem side effects; simetria
// arquitetural com Painel Super Admin dentro-de-empresa. Nao introduz
// router tRPC novo (evita RV-13 code morto).
//
// **RV-13 canonica.** Todo export tem consumidor real:
// - `resolveDatabaseUrl` → chamado por `page.tsx` (default export).
// - `loadRhSessionFlags` → chamado por `page.tsx`.
// - `loadCompanyForRhPanel` → chamado por `page.tsx`.
// - `loadPainelRhVisaoGeral` → chamado por `page.tsx`.
// - `loadMinhaEquipeData` → chamado por `page.tsx`.
// - `loadCadeiaIndiretaData` → chamado por `page.tsx`.
// - `loadMeuPortalData` → chamado por `page.tsx`.
// - Tipos exportados consumidos por `PainelRHClient.tsx` e testes
//   `me083-painel-rh-loaders.test.ts`.
//
// **RV-12 canonica.** Zero SQL cru. Toda persistencia via API tipada
// do Drizzle.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import { and, eq, isNull, sql } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companies, employees, employeeLeaderHistory } from '../../db/schema';

// -----------------------------------------------------------------------
// Tipos canonicos
// -----------------------------------------------------------------------

/**
 * Flags canonicas resolvidas do titular RH autenticado. Consumidas pelo
 * `page.tsx` para calcular `ProfileKey` via `resolveProfileKey`, filtrar
 * secoes 2/3 do painel e passar RF condicional ao menu.
 */
export interface RhSessionFlags {
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly hasDescendingChain: boolean;
}

/**
 * Dados canonicos do cabecalho do painel: logo + nome fantasia da
 * empresa do RH autenticado. Extraidos de `session.companyDisplayName`
 * (sempre presente) + `companies.logoUrl` (consulta separada).
 */
export interface RhCompanyInfo {
  readonly id: number;
  readonly nomeFantasia: string;
  readonly logoUrl: string | null;
}

/**
 * Item canonico da lista compacta de liderados diretos (Secao 2). Ate 5
 * primeiros em ordem alfabetica por `nome`. Click no nome abre pop-up
 * canonico Dashboard individual (§5.5).
 */
export interface LideradoDiretoItem {
  readonly id: number;
  readonly nome: string;
  readonly cargo: string;
  readonly departamento: string;
  readonly photoUrl: string | null;
}

/**
 * Dados canonicos da Secao 2 "Minha equipe" §5.5 — apenas RH-Lider C1
 * e C2. Consumido pelo client component para render condicional.
 */
export interface MinhaEquipeData {
  readonly totalLideradosDiretos: number;
  readonly primeiros5: readonly LideradoDiretoItem[];
}

/**
 * Item canonico da lista compacta de lideres da cadeia indireta (Secao
 * 3). Ate 5 primeiros em ordem alfabetica. Click abre pop-up canonico
 * Dashboard individual (§5.5).
 */
export interface LiderCadeiaIndiretaItem {
  readonly id: number;
  readonly nome: string;
  readonly cargo: string;
  readonly departamento: string;
  readonly photoUrl: string | null;
}

/**
 * Dados canonicos da Secao 3 "Cadeia indireta" §5.5 — apenas RH-Lider
 * C2. Consumido pelo client component para render condicional.
 */
export interface CadeiaIndiretaData {
  readonly totalCadeiaCompleta: number;
  readonly primeiros5Lideres: readonly LiderCadeiaIndiretaItem[];
}

/**
 * Item canonico da lista de pendencias do proprio usuario logado
 * (Secao 4 "Meu portal"). Cada linha: nome instrumento + badge status
 * + prazo original. Ordenado por diasEmAtraso descendente.
 */
export interface MeuPortalPendenciaItem {
  readonly key: string;
  readonly instrumento: 'perfil_individual' | 'instrumentoA' | 'instrumentoD' | 'nr1';
  readonly instrumentoLabel: string;
  readonly status: 'pendente' | 'atrasado';
  readonly prazoOriginal: Date | null;
  readonly diasEmAtraso: number;
}

/**
 * Dados canonicos da Secao 4 "Meu portal" §5.5. Sempre presente para
 * todos os cenarios RH (RH puro, RHL1, RHL2). Estado vazio canonico
 * bit-exact literal: "Voce nao tem pendencias no portal.".
 */
export interface MeuPortalData {
  readonly pendencias: readonly MeuPortalPendenciaItem[];
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

// -----------------------------------------------------------------------
// Loaders canonicos server-side (Drizzle tipado — RV-12)
// -----------------------------------------------------------------------

/**
 * Carrega canonicamente as 4 flags de perfil do titular RH autenticado.
 * Retorna `null` quando o registro nao existe (registro deletado entre
 * emissao do JWT e verificacao — sessao invalida; consumidor redireciona
 * ao login).
 *
 * `hasDescendingChain`: TRUE quando existe ao menos 1 liderado direto
 * ativo (via `employeeLeaderHistory` com `dataFim IS NULL`) que tambem
 * e lider (`employees.isLider = true` AND `status = 'ativo'`). Regra
 * canonica de RH-Lider Cenario 2 §5.5.
 */
export async function loadRhSessionFlags(
  db: RoipDatabase,
  userId: number,
): Promise<RhSessionFlags | null> {
  const rows = await db
    .select({
      isRH: employees.isRH,
      isLider: employees.isLider,
      isResponsavelFinanceiro: employees.isResponsavelFinanceiro,
    })
    .from(employees)
    .where(eq(employees.id, userId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  const chainRows = await db
    .select({ id: employees.id })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employeeLeaderHistory.liderId, userId),
        isNull(employeeLeaderHistory.dataFim),
        eq(employees.isLider, true),
        eq(employees.status, 'ativo'),
      ),
    )
    .limit(1);
  return {
    isRH: row.isRH === true,
    isLider: row.isLider === true,
    isResponsavelFinanceiro: row.isResponsavelFinanceiro === true,
    hasDescendingChain: chainRows.length > 0,
  };
}

/**
 * Carrega dados canonicos da empresa do RH autenticado para o cabecalho
 * do painel. `session.companyDisplayName` ja tem o nome fantasia; esta
 * consulta traz apenas o `logoUrl` para o header canonico.
 */
export async function loadCompanyForRhPanel(
  db: RoipDatabase,
  companyId: number,
): Promise<RhCompanyInfo | null> {
  const rows = await db
    .select({
      id: companies.id,
      nomeFantasia: companies.nomeFantasia,
      logoUrl: companies.logoUrl,
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
    logoUrl: row.logoUrl ?? null,
  };
}

/**
 * Carrega dados canonicos da Secao 2 "Minha equipe" §5.5 do painel RH.
 * Retornado apenas para cenarios RH-Lider C1 e C2 (consumidor decide
 * render condicional pelo `profileKey`).
 *
 * Regra canonica: liderados diretos ativos sao employees vinculados ao
 * `userId` (RH-Lider) via `employeeLeaderHistory` com `dataFim IS NULL`
 * AND `employees.status = 'ativo'`.
 *
 * Lista compacta canonica: ate 5 primeiros ordem alfabetica por `name`.
 * Contador total: COUNT distinct employees ligados via ELH ativa.
 */
export async function loadMinhaEquipeData(
  db: RoipDatabase,
  userId: number,
): Promise<MinhaEquipeData> {
  const [totalRows, primeirosRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${employees.id})` })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
      .where(
        and(
          eq(employeeLeaderHistory.liderId, userId),
          isNull(employeeLeaderHistory.dataFim),
          eq(employees.status, 'ativo'),
        ),
      ),
    db
      .selectDistinct({
        id: employees.id,
        nome: employees.name,
        cargo: employees.cargo,
        departamento: employees.departamento,
        photoUrl: employees.photoUrl,
      })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
      .where(
        and(
          eq(employeeLeaderHistory.liderId, userId),
          isNull(employeeLeaderHistory.dataFim),
          eq(employees.status, 'ativo'),
        ),
      )
      .orderBy(employees.name)
      .limit(5),
  ]);
  return {
    totalLideradosDiretos: Number(totalRows[0]?.count ?? 0),
    primeiros5: primeirosRows.map((r) => ({
      id: r.id,
      nome: r.nome,
      cargo: r.cargo,
      departamento: r.departamento,
      photoUrl: r.photoUrl ?? null,
    })),
  };
}

/**
 * Carrega dados canonicos da Secao 3 "Cadeia indireta" §5.5 — apenas
 * RH-Lider Cenario 2.
 *
 * Regra canonica: liderados diretos do `userId` que TAMBEM sao lideres
 * (`isLider = true`). Estes sao os "5 primeiros lideres da cadeia" —
 * base da cadeia descendente. O total canonico eh a contagem dessa
 * projecao (nao a expansao completa da arvore — B10 dedicado).
 *
 * Justificativa canonica bit-exact §5.5: "Contador de status da cadeia
 * indireta" + "Lista compacta dos 5 primeiros lideres da cadeia (ordem
 * alfabetica)". O texto do §5.5 nao pede expansao recursiva no card do
 * painel — apenas a projecao imediata dos lideres direto-abaixo do
 * RH-Lider.
 */
export async function loadCadeiaIndiretaData(
  db: RoipDatabase,
  userId: number,
): Promise<CadeiaIndiretaData> {
  const [totalRows, primeirosRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${employees.id})` })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
      .where(
        and(
          eq(employeeLeaderHistory.liderId, userId),
          isNull(employeeLeaderHistory.dataFim),
          eq(employees.isLider, true),
          eq(employees.status, 'ativo'),
        ),
      ),
    db
      .selectDistinct({
        id: employees.id,
        nome: employees.name,
        cargo: employees.cargo,
        departamento: employees.departamento,
        photoUrl: employees.photoUrl,
      })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
      .where(
        and(
          eq(employeeLeaderHistory.liderId, userId),
          isNull(employeeLeaderHistory.dataFim),
          eq(employees.isLider, true),
          eq(employees.status, 'ativo'),
        ),
      )
      .orderBy(employees.name)
      .limit(5),
  ]);
  return {
    totalCadeiaCompleta: Number(totalRows[0]?.count ?? 0),
    primeiros5Lideres: primeirosRows.map((r) => ({
      id: r.id,
      nome: r.nome,
      cargo: r.cargo,
      departamento: r.departamento,
      photoUrl: r.photoUrl ?? null,
    })),
  };
}

/**
 * Carrega dados canonicos da Secao 4 "Meu portal" §5.5 — pendencias do
 * PROPRIO usuario logado no portal, ordenadas por dias em atraso
 * descendente.
 *
 * Regra canonica de derivacao B9 (D-ME083-11 aprovado):
 * - Fonte primaria: `performanceData` (existencia de linha canonica
 *   para `(employeeId=userId, mes=mesCorrente)` indica preenchimento
 *   do proprio colaborador nos instrumentos que ele mesmo responde).
 * - No B9 esta funcao retorna a lista bit-exact vazia por padrao — o
 *   RH-titular tem responsabilidades operacionais (nao instrumento
 *   proprio recorrente); a definicao canonica de "pendencias no portal
 *   do proprio RH" nasce quando os instrumentos individuais A/C/D/NR-1
 *   forem canonizados como devidos ao proprio titular. Debito
 *   D-B9-MEU-PORTAL-PENDENCIAS canonizado.
 *
 * A funcao existe canonicamente com forma futura preservada — o dia em
 * que a definicao existir, o corpo canonico eh substituido bit-exact
 * sem alterar assinatura ou consumidor. Ver `PainelRHClient` que ja
 * renderiza estado vazio canonico literal "Voce nao tem pendencias no
 * portal." bit-exact §5.5.
 */
export async function loadMeuPortalData(db: RoipDatabase, userId: number): Promise<MeuPortalData> {
  // ME-083 D-ME083-11 — implementacao canonica B9 retorna vazio
  // determinista. Query defensiva de sanity (evita import morto e
  // preserva forma futura da funcao — quando a definicao canonica de
  // "pendencia no portal do proprio RH" existir, a query se expande
  // aqui sem quebrar assinatura).
  const _existencia = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, userId))
    .limit(1);
  if (_existencia.length === 0) {
    return { pendencias: [] };
  }
  return { pendencias: [] };
}
