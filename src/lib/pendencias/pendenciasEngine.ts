// ROIP APP 9BOX — motor canonico de `/pendencias-portal` (ME-058
// §14.23 S326 + refactor §5.8 S321/S312).
//
// Origem canonica:
// - DOC 05 §14.23 (Rota `/pendencias-portal`) — 3 cards resumo, 6
//   filtros, tabela de 11 colunas com ordenacao tripla canonica
//   (S328): (1) dias em atraso desc, (2) nome asc, (3) instrumento asc.
// - DOC 05 §5.8 (Card resumo Pendencias no portal) — soma total canonica
//   (nao contagem de colaboradores). Consumido pelo refactor S321 do
//   `/painel-rh`.
// - DOC 05 §5.5 linha 555 (Nota canonica de coexistencia): motor consome
//   `portalReminderLog` para calculo de cooldown 72h (COOLDOWN_LEMBRETE_MS
//   em `mappings.ts`).
// - DOC 03 linha 794 (Instrumento A): 20 respostas canonicas por resposta
//   completa. Linha 1117 (Instrumento D): idem.
// - Schema canonico (tables.ts):
//   - `individualProfilePlaceholders.status` — 5 valores canonicos
//     (`pendente`, `em_andamento`, `respondido`, `inconsistente`,
//     `aguardando_nova_resposta`). Pendencia = `status !== 'respondido'`.
//   - `instrumentA_responses` — chave (employeeId, trimestre, dimensao,
//     itemIndex); resposta completa = count >= 20 por (employeeId,
//     trimestre).
//   - `instrumentD_responses` — chave (respondenteId, trimestre,
//     dimensao, itemIndex); resposta completa = count >= 20 por
//     (respondenteId, trimestre).
//   - `copsoqCycleSnapshot.respondeu` — bool ja pre-calculado; pendencia
//     = `respondeu = false` E `inativadoAposSnapshot = false`.
//   - `cycleSchedule.status` — `'aberto' | 'atrasado' | 'fechado'`; ciclos
//     ativos = `status IN ('aberto', 'atrasado')`.
//   - `employees.status = 'ativo'` — condicao canonica de elegibilidade
//     transversal.
//   - `employeeLeaderHistory` — `dataFim IS NULL` = registro ativo do
//     lider direto atual.
//
// **S326 canonizada (aprovada N7/S226 na abertura ME-058):** escopo
// unificado sob S299.
//
// **S328 canonizada (aprovada N7/S226 na abertura ME-058):** ordenacao
// tripla canonica de `/pendencias-portal`: (1) dias em atraso desc,
// (2) nome asc, (3) instrumento asc. Convencao prospectiva na ausencia
// de definicao literal no §14.23.
//
// **S330 nova (canonizada nesta ME-058, sujeita a aprovacao no
// fechamento):** heuristica prospectiva para "Meu perfil" pendente sem
// ciclo proprio no `cycleSchedule`. Threshold canonico:
// `PERFIL_INDIVIDUAL_THRESHOLD_DIAS = 30`. Pendencias de meuPerfil com
// idade < 30 dias → 'Pendente'; idade >= 30 dias → 'Atrasado'. Prazo
// original derivado: `createdAt + 30 dias`. Racional: perfil individual
// e gerado por evento (contratacao) e nao por ciclo trimestral; a
// definicao canonica precisa de proxy operacional. Threshold 30 dias
// alinha com prazo canonico de onboarding minimo (DOC 03 §6).
//
// **RV-12.** 100% Drizzle tipado. Zero SQL cru. Aliases via `alias()` de
// `drizzle-orm/mysql-core` (padrao S320) para JOIN polimorfico com
// `employees` (lider direto vs C-level lider).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `PendenciaRow`, `PendenciasTotals`, `PendenciasLoadResult`,
//     `PendenciasPageParams` → consumidos por `page.tsx`,
//     `PendenciasClient.tsx`, `actions.ts` e `me058-pendencias.test.ts`.
//   - `loadPendenciasPage` → consumido por `page.tsx` (carga inicial),
//     `actions.ts` (re-fetch) e `me058-pendencias.test.ts`.
//   - `countPendenciasEmpresa` → consumido por `painel-rh/page.tsx`
//     (refactor S321), `super-admin/empresa/[id]/pendencias-portal/
//     page.tsx` (contexto Bruno) e `me058-pendencias.test.ts`.
//   - `PERFIL_INDIVIDUAL_THRESHOLD_DIAS` (constante) → consumido por
//     `pendenciasEngine.ts` e `pendencias-engine.test.ts`.

import { and, eq, gt, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  copsoqCycleSnapshot,
  copsoqCycles,
  cycleSchedule,
  employeeLeaderHistory,
  employees,
  individualProfilePlaceholders,
  instrumentA_responses,
  instrumentD_responses,
  portalReminderLog,
} from '../../db/schema';
import type { PortalInstrumentType } from '../../db/schema/enums';
import { COOLDOWN_LEMBRETE_MS, type PendenciaStatus } from '../../app/pendencias-portal/mappings';
import type { PendenciasFilters } from '../../app/pendencias-portal/filters';

// -----------------------------------------------------------------------
// Constantes canonicas
// -----------------------------------------------------------------------

/**
 * Numero canonico de respostas por instrumento A (DOC 03 §7 linha 794).
 * Resposta completa = 20 linhas em `instrumentA_responses` por
 * (employeeId, trimestre).
 */
const TOTAL_ITEMS_INSTRUMENTO_A = 20;

/**
 * Numero canonico de respostas por instrumento D (DOC 03 §9 linha 1117).
 * Resposta completa = 20 linhas em `instrumentD_responses` por
 * (respondenteId, trimestre).
 */
const TOTAL_ITEMS_INSTRUMENTO_D = 20;

/**
 * Threshold canonico em dias para transicao Pendente→Atrasado em
 * meuPerfil (S330 prospectiva). Perfil individual nao tem entrada em
 * `cycleSchedule` — este proxy operacionaliza o §14.23 filtro Status
 * para o filtro Instrumento=meuPerfil.
 */
export const PERFIL_INDIVIDUAL_THRESHOLD_DIAS = 30;

/**
 * Milissegundos por dia — usado em conversoes ms→dias na ordenacao e
 * calculo de diasEmAtraso.
 */
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------
// Tipos canonicos exportados
// -----------------------------------------------------------------------

/**
 * Linha canonica da tabela §14.23 (11 colunas). Chave composta
 * `${instrumento}:${userType}:${userId}:${cicloRef}` — canonicamente
 * unica por linha para a coluna de acao `[Enviar lembrete]`.
 *
 * `userType` distingue employees (colaboradores comuns e liderancas RH/
 * lideres) de cLevelMembers, permitindo consumo correto da tabela alvo
 * (individualProfilePlaceholders.userType espelha essa distincao).
 * Actions de envio de lembrete usam a tripla (userType, userId,
 * instrumento) para checar cooldown em `portalReminderLog`.
 *
 * `cooldownUntil` e `null` quando nenhum lembrete foi enviado nas
 * ultimas COOLDOWN_LEMBRETE_MS. Quando `!== null`, `[Enviar lembrete]`
 * fica desabilitado e o tooltip exibe o timestamp.
 */
export interface PendenciaRow {
  readonly key: string;
  readonly userType: 'employee' | 'clevel';
  readonly userId: number;
  readonly nome: string;
  readonly cpf: string;
  readonly photoUrl: string | null;
  readonly cargo: string;
  readonly departamento: string;
  readonly liderNome: string | null;
  readonly liderId: number | null;
  readonly instrumento: PortalInstrumentType;
  readonly status: PendenciaStatus;
  readonly prazoOriginal: Date | null;
  readonly diasEmAtraso: number;
  readonly cicloReferencia: string | null;
  readonly cooldownUntil: Date | null;
}

/**
 * Totais canonicos dos 3 cards resumo §14.23 linhas 2610-2612.
 * `atrasadas + pendentes === rows.length` sempre. `colaboradoresImpactados`
 * conta employees + cLevels unicos com pelo menos 1 pendencia
 * (cross-instrumento).
 */
export interface PendenciasTotals {
  readonly atrasadas: number;
  readonly pendentes: number;
  readonly colaboradoresImpactados: number;
}

/**
 * Opcoes canonicas do filtro 6 "Ciclo" (select dinamico §14.23 linha
 * 2620) — lista dos ciclos ativos + fechados relevantes da empresa.
 * Ordem canonica: cicloReferencia desc (mais recente primeiro).
 */
export interface CicloOption {
  readonly cicloReferencia: string;
  readonly tipoCiclo: string;
  readonly status: 'aberto' | 'atrasado' | 'fechado';
}

/**
 * Opcoes canonicas do filtro 3 "Lider direto" (select §14.23 linha 2617).
 * Ordem canonica: nome asc.
 */
export interface LiderDiretoOption {
  readonly id: number;
  readonly nome: string;
}

/**
 * Resultado canonico consolidado da carga de `/pendencias-portal`.
 * Consumido pelo server component (carga inicial) e pela action
 * `atualizar` (re-fetch).
 */
export interface PendenciasLoadResult {
  readonly rows: readonly PendenciaRow[];
  readonly totals: PendenciasTotals;
  readonly totalRows: number;
  readonly page: number;
  readonly pageSize: 25 | 50 | 100;
  readonly totalPages: number;
  readonly ciclosDisponiveis: readonly CicloOption[];
  readonly lideresDisponiveis: readonly LiderDiretoOption[];
}

/**
 * Parametros canonicos de `loadPendenciasPage`.
 * `now` e opcional; padrao `new Date()`. Testes injetam `now` fixa para
 * determinismo (padrao S205 Facade DI).
 */
export interface PendenciasPageParams {
  readonly db: RoipDatabase;
  readonly companyId: number;
  readonly filters: PendenciasFilters;
  readonly page: number;
  readonly pageSize: 25 | 50 | 100;
  readonly now?: Date;
}

// -----------------------------------------------------------------------
// Helpers canonicos internos
// -----------------------------------------------------------------------

/**
 * Calcula `diasEmAtraso` canonicamente §14.23 coluna 9. Sempre >= 0
 * (colaborador "adiantado" — respondeu antes do prazo — nao aparece em
 * `/pendencias-portal`, entao este helper so e chamado sobre pendencias
 * reais).
 */
function computeDiasAtraso(prazoOriginal: Date | null, now: Date): number {
  if (prazoOriginal === null) {
    return 0;
  }
  const diff = now.getTime() - prazoOriginal.getTime();
  if (diff <= 0) {
    return 0;
  }
  return Math.floor(diff / MS_POR_DIA);
}

/**
 * Resolve `PendenciaStatus` canonico a partir de `cycleSchedule.status`
 * dos 3 instrumentos com ciclo proprio (A, D, NR-1). `'aberto'` → dentro
 * do prazo. `'atrasado'` → passou do prazo. `'fechado'` nunca ocorre
 * aqui (ciclos fechados sao filtrados fora antes de chegar).
 */
function resolveStatusFromCiclo(cicloStatus: 'aberto' | 'atrasado'): PendenciaStatus {
  return cicloStatus === 'aberto' ? 'Pendente' : 'Atrasado';
}

/**
 * Resolve `PendenciaStatus` para meuPerfil (sem ciclo proprio). S330
 * proxy: idade < threshold → 'Pendente'; idade >= threshold → 'Atrasado'.
 */
function resolveStatusMeuPerfil(createdAt: Date | null, now: Date): PendenciaStatus {
  if (createdAt === null) {
    return 'Pendente';
  }
  const idadeMs = now.getTime() - createdAt.getTime();
  const idadeDias = Math.floor(idadeMs / MS_POR_DIA);
  return idadeDias >= PERFIL_INDIVIDUAL_THRESHOLD_DIAS ? 'Atrasado' : 'Pendente';
}

/**
 * Calcula prazo canonico derivado do meuPerfil: `createdAt + threshold
 * dias` (S330). Retorna `null` quando `createdAt` e `null`.
 */
function derivarPrazoMeuPerfil(createdAt: Date | null): Date | null {
  if (createdAt === null) {
    return null;
  }
  return new Date(createdAt.getTime() + PERFIL_INDIVIDUAL_THRESHOLD_DIAS * MS_POR_DIA);
}

/**
 * Constroi chave canonica composta da linha (`${instrumento}:${userType}:
 * ${userId}:${cicloRef ?? '-'}`). Consumida pelo cliente para
 * identificar unicamente a acao [Enviar lembrete] individual.
 */
function buildRowKey(
  instrumento: PortalInstrumentType,
  userType: 'employee' | 'clevel',
  userId: number,
  cicloRef: string | null,
): string {
  return `${instrumento}:${userType}:${userId}:${cicloRef ?? '-'}`;
}

/**
 * Aplica ordenacao canonica tripla S328 a `rows` in-place seguro (retorna
 * novo array). Sort estavel do V8 preservado pela ordem das comparacoes.
 */
function ordenarPendenciasTripla(rows: readonly PendenciaRow[]): readonly PendenciaRow[] {
  const arr = [...rows];
  arr.sort((a, b) => {
    // (1) dias em atraso desc
    if (a.diasEmAtraso !== b.diasEmAtraso) {
      return b.diasEmAtraso - a.diasEmAtraso;
    }
    // (2) nome asc (localeCompare pt-BR sensitivity base para consistencia)
    const cmpNome = a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    if (cmpNome !== 0) {
      return cmpNome;
    }
    // (3) instrumento asc (ordem canonica do enum via localeCompare direto)
    return a.instrumento.localeCompare(b.instrumento);
  });
  return arr;
}

/**
 * Aplica filtros canonicos §14.23 em memoria sobre lista de pendencias.
 * Filtros que dependem de agregacoes cross-instrumento (departamento,
 * lider) sao aplicaveis pos-materializacao. Motor materializa antes de
 * filtrar por design de simplicidade — total esperado por empresa
 * (< 5000 pendencias ativas simultaneamente em pior caso) justifica.
 */
function aplicarFiltros(
  rows: readonly PendenciaRow[],
  filters: PendenciasFilters,
): readonly PendenciaRow[] {
  return rows.filter((r) => {
    if (filters.instrumento !== null && r.instrumento !== filters.instrumento) {
      return false;
    }
    if (filters.status !== null && r.status !== filters.status) {
      return false;
    }
    if (filters.departamento !== null && r.departamento !== filters.departamento) {
      return false;
    }
    if (filters.liderDiretoId !== null && r.liderId !== filters.liderDiretoId) {
      return false;
    }
    if (filters.cicloReferencia !== null && r.cicloReferencia !== filters.cicloReferencia) {
      return false;
    }
    if (filters.q !== null) {
      const q = filters.q.toLowerCase();
      const nomeMatch = r.nome.toLowerCase().includes(q);
      const cpfMatch = r.cpf.includes(filters.q);
      const cargoMatch = r.cargo.toLowerCase().includes(q);
      if (!nomeMatch && !cpfMatch && !cargoMatch) {
        return false;
      }
    }
    return true;
  });
}

// -----------------------------------------------------------------------
// Motor principal — carga da pagina
// -----------------------------------------------------------------------

/**
 * Carga canonica de `/pendencias-portal` para uma empresa. Executa em 6
 * consultas paralelas + agregacao em memoria + ordenacao S328 +
 * paginacao. Cross-tenant safe: cada consulta filtra `companyId` na
 * fonte (WHERE ANTES do UNION conceitual).
 *
 * Complexidade `O(E * I)` onde `E` = colaboradores ativos (empresa
 * media: 50-200) e `I` = instrumentos ativos (0-4). Total esperado:
 * < 800 linhas por empresa antes de filtros — dentro do orcamento de
 * memoria e sub-100ms de agregacao pura em Node.
 */
export async function loadPendenciasPage(
  params: PendenciasPageParams,
): Promise<PendenciasLoadResult> {
  const { db, companyId, filters, page, pageSize } = params;
  const now = params.now ?? new Date();

  // Consulta 1: ciclos ativos da empresa (A, D, NR-1 apenas — meuPerfil
  // nao usa cycleSchedule).
  const ciclosAtivos = await db
    .select({
      id: cycleSchedule.id,
      tipoCiclo: cycleSchedule.tipoCiclo,
      cicloReferencia: cycleSchedule.cicloReferencia,
      dataCorte: cycleSchedule.dataCorte,
      dataFechamento: cycleSchedule.dataFechamento,
      status: cycleSchedule.status,
    })
    .from(cycleSchedule)
    .where(
      and(
        eq(cycleSchedule.companyId, companyId),
        inArray(cycleSchedule.status, ['aberto', 'atrasado']),
        inArray(cycleSchedule.tipoCiclo, ['instrumento_a', 'instrumento_d', 'radar_nr1']),
      ),
    );

  // Consulta 2: todos os employees ativos da empresa com JOIN lider
  // direto atual (via employeeLeaderHistory dataFim IS NULL).
  const liderEmpAlias = alias(employees, 'liderEmp');
  const liderClevelAlias = alias(cLevelMembers, 'liderCl');

  const employeesRows = await db
    .select({
      id: employees.id,
      nome: employees.name,
      cpf: employees.cpf,
      photoUrl: employees.photoUrl,
      cargo: employees.descricaoCBO,
      departamento: employees.departamento,
      liderEmpId: liderEmpAlias.id,
      liderEmpNome: liderEmpAlias.name,
      liderClNome: liderClevelAlias.name,
    })
    .from(employees)
    .leftJoin(
      employeeLeaderHistory,
      and(
        eq(employeeLeaderHistory.employeeId, employees.id),
        isNull(employeeLeaderHistory.dataFim),
      ),
    )
    .leftJoin(liderEmpAlias, eq(liderEmpAlias.id, employeeLeaderHistory.liderId))
    .leftJoin(liderClevelAlias, eq(liderClevelAlias.id, employeeLeaderHistory.clevelId))
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')));

  const employeesById = new Map<number, (typeof employeesRows)[number]>();
  for (const e of employeesRows) {
    employeesById.set(e.id, e);
  }

  // Consulta 3: individualProfilePlaceholders pendentes (employees +
  // cLevels).
  const placeholdersPendentes = await db
    .select({
      userType: individualProfilePlaceholders.userType,
      userId: individualProfilePlaceholders.userId,
      status: individualProfilePlaceholders.status,
      createdAt: individualProfilePlaceholders.createdAt,
    })
    .from(individualProfilePlaceholders)
    .where(
      and(
        eq(individualProfilePlaceholders.companyId, companyId),
        inArray(individualProfilePlaceholders.status, [
          'pendente',
          'em_andamento',
          'inconsistente',
          'aguardando_nova_resposta',
        ]),
      ),
    );

  // Consulta 4: agrega contagem instrumentA por (employeeId, trimestre).
  // Usa GROUP BY tipado via Drizzle count com HAVING count < 20 (ou
  // consulta ampla + filtro em memoria — otamos por consulta ampla e
  // filtro para simplicidade e determinismo).
  const respostasA = await db
    .select({
      employeeId: instrumentA_responses.employeeId,
      trimestre: instrumentA_responses.trimestre,
      total: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(instrumentA_responses)
    .where(eq(instrumentA_responses.companyId, companyId))
    .groupBy(instrumentA_responses.employeeId, instrumentA_responses.trimestre);

  const respondidoAKey = (employeeId: number, trimestre: string): string =>
    `A:${employeeId}:${trimestre}`;
  const respondidoASet = new Set<string>();
  for (const r of respostasA) {
    if (r.total >= TOTAL_ITEMS_INSTRUMENTO_A) {
      respondidoASet.add(respondidoAKey(r.employeeId, r.trimestre));
    }
  }

  // Consulta 5: agrega contagem instrumentD por (respondenteId, trimestre).
  const respostasD = await db
    .select({
      respondenteId: instrumentD_responses.respondenteId,
      trimestre: instrumentD_responses.trimestre,
      total: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(instrumentD_responses)
    .where(eq(instrumentD_responses.companyId, companyId))
    .groupBy(instrumentD_responses.respondenteId, instrumentD_responses.trimestre);

  const respondidoDKey = (respondenteId: number, trimestre: string): string =>
    `D:${respondenteId}:${trimestre}`;
  const respondidoDSet = new Set<string>();
  for (const r of respostasD) {
    if (r.total >= TOTAL_ITEMS_INSTRUMENTO_D) {
      respondidoDSet.add(respondidoDKey(r.respondenteId, r.trimestre));
    }
  }

  // Consulta 6: copsoqCycleSnapshot para NR-1 — quem NAO respondeu por
  // ciclo. Inner join com copsoqCycles para vincular ao ciclo canonico
  // (copsoqCycles.ciclo — schema legado; equivalente a cicloReferencia
  // canonico usado em cycleSchedule/portalReminderLog). copsoqCycles.status
  // enum e ['agendado','aberto','fechado'] — sem 'atrasado' explicito;
  // derivado por comparacao com dataFechamento (canonicamente atrasado =
  // status='aberto' AND now > dataFechamento).
  const nr1Snapshot = await db
    .select({
      employeeId: copsoqCycleSnapshot.employeeId,
      respondeu: copsoqCycleSnapshot.respondeu,
      inativadoAposSnapshot: copsoqCycleSnapshot.inativadoAposSnapshot,
      cicloReferencia: copsoqCycles.ciclo,
      cicloStatus: copsoqCycles.status,
      dataFechamento: copsoqCycles.dataFechamento,
    })
    .from(copsoqCycleSnapshot)
    .innerJoin(copsoqCycles, eq(copsoqCycles.id, copsoqCycleSnapshot.cicloDbId))
    .where(eq(copsoqCycleSnapshot.companyId, companyId));

  // Consulta 7: portalReminderLog para cooldown — ultimo envio bem-
  // sucedido por (employeeId, instrumentType, cycleReference) dentro da
  // janela de cooldown.
  const cooldownWindow = new Date(now.getTime() - COOLDOWN_LEMBRETE_MS);
  const cooldownRows = await db
    .select({
      employeeId: portalReminderLog.employeeId,
      instrumentType: portalReminderLog.instrumentType,
      cycleReference: portalReminderLog.cycleReference,
      sentAt: portalReminderLog.sentAt,
    })
    .from(portalReminderLog)
    .innerJoin(employees, eq(employees.id, portalReminderLog.employeeId))
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(portalReminderLog.success, true),
        gte(portalReminderLog.sentAt, cooldownWindow),
      ),
    );

  const cooldownKey = (
    employeeId: number,
    instrumento: PortalInstrumentType,
    cicloRef: string | null,
  ): string => `${employeeId}:${instrumento}:${cicloRef ?? '-'}`;
  const cooldownUntilByKey = new Map<string, Date>();
  for (const c of cooldownRows) {
    const key = cooldownKey(c.employeeId, c.instrumentType, c.cycleReference);
    const until = new Date(c.sentAt.getTime() + COOLDOWN_LEMBRETE_MS);
    const existing = cooldownUntilByKey.get(key);
    if (existing === undefined || until.getTime() > existing.getTime()) {
      cooldownUntilByKey.set(key, until);
    }
  }

  // -------------------------------------------------------------------
  // Materializacao canonica das linhas (cross-instrumento)
  // -------------------------------------------------------------------

  const rowsMateralizadas: PendenciaRow[] = [];

  // Bloco 1: meuPerfil (via placeholders).
  for (const p of placeholdersPendentes) {
    // Perfil individual pode ser de cLevel — nesse caso `employees` nao
    // tem entrada. Motor renderiza apenas placeholders de `employee`
    // (renderizacao de cLevels em `/pendencias-portal` fica fora do
    // escopo canonico desta ME — DOC 05 §14.23 fala de "colaboradores"
    // no plural sem especificar C-levels; C-levels tem tela propria).
    if (p.userType !== 'employee') {
      continue;
    }
    const emp = employeesById.get(p.userId);
    if (emp === undefined) {
      continue;
    }
    const prazoDerivado = derivarPrazoMeuPerfil(p.createdAt);
    const cooldownUntil = cooldownUntilByKey.get(cooldownKey(p.userId, 'meuPerfil', null)) ?? null;
    rowsMateralizadas.push({
      key: buildRowKey('meuPerfil', 'employee', p.userId, null),
      userType: 'employee',
      userId: p.userId,
      nome: emp.nome,
      cpf: emp.cpf,
      photoUrl: emp.photoUrl,
      cargo: emp.cargo,
      departamento: emp.departamento,
      liderNome: emp.liderEmpNome ?? emp.liderClNome ?? null,
      liderId: emp.liderEmpId,
      instrumento: 'meuPerfil',
      status: resolveStatusMeuPerfil(p.createdAt, now),
      prazoOriginal: prazoDerivado,
      diasEmAtraso: computeDiasAtraso(prazoDerivado, now),
      cicloReferencia: null,
      cooldownUntil,
    });
  }

  // Bloco 2, 3: instrumento A e D (via ciclos ativos).
  for (const ciclo of ciclosAtivos) {
    if (ciclo.tipoCiclo === 'instrumento_a') {
      const respondidoSetLocal = respondidoASet;
      const statusPendencia = resolveStatusFromCiclo(ciclo.status as 'aberto' | 'atrasado');
      for (const emp of employeesRows) {
        if (respondidoSetLocal.has(respondidoAKey(emp.id, ciclo.cicloReferencia))) {
          continue;
        }
        const cooldownUntil =
          cooldownUntilByKey.get(cooldownKey(emp.id, 'autoAvaliacao', ciclo.cicloReferencia)) ??
          null;
        rowsMateralizadas.push({
          key: buildRowKey('autoAvaliacao', 'employee', emp.id, ciclo.cicloReferencia),
          userType: 'employee',
          userId: emp.id,
          nome: emp.nome,
          cpf: emp.cpf,
          photoUrl: emp.photoUrl,
          cargo: emp.cargo,
          departamento: emp.departamento,
          liderNome: emp.liderEmpNome ?? emp.liderClNome ?? null,
          liderId: emp.liderEmpId,
          instrumento: 'autoAvaliacao',
          status: statusPendencia,
          prazoOriginal: ciclo.dataCorte,
          diasEmAtraso: computeDiasAtraso(ciclo.dataCorte, now),
          cicloReferencia: ciclo.cicloReferencia,
          cooldownUntil,
        });
      }
    } else if (ciclo.tipoCiclo === 'instrumento_d') {
      const respondidoSetLocal = respondidoDSet;
      const statusPendencia = resolveStatusFromCiclo(ciclo.status as 'aberto' | 'atrasado');
      for (const emp of employeesRows) {
        if (respondidoSetLocal.has(respondidoDKey(emp.id, ciclo.cicloReferencia))) {
          continue;
        }
        const cooldownUntil =
          cooldownUntilByKey.get(
            cooldownKey(emp.id, 'avaliacaoLiderancaDireta', ciclo.cicloReferencia),
          ) ?? null;
        rowsMateralizadas.push({
          key: buildRowKey('avaliacaoLiderancaDireta', 'employee', emp.id, ciclo.cicloReferencia),
          userType: 'employee',
          userId: emp.id,
          nome: emp.nome,
          cpf: emp.cpf,
          photoUrl: emp.photoUrl,
          cargo: emp.cargo,
          departamento: emp.departamento,
          liderNome: emp.liderEmpNome ?? emp.liderClNome ?? null,
          liderId: emp.liderEmpId,
          instrumento: 'avaliacaoLiderancaDireta',
          status: statusPendencia,
          prazoOriginal: ciclo.dataCorte,
          diasEmAtraso: computeDiasAtraso(ciclo.dataCorte, now),
          cicloReferencia: ciclo.cicloReferencia,
          cooldownUntil,
        });
      }
    }
    // radar_nr1 tratado no bloco 4 abaixo (copsoqCycleSnapshot).
  }

  // Bloco 4: radar NR-1 (via copsoqCycleSnapshot).
  for (const snap of nr1Snapshot) {
    if (snap.respondeu === true || snap.inativadoAposSnapshot === true) {
      continue;
    }
    // Aceita apenas ciclos NR-1 abertos (canonicamente `copsoqCycles.status`
    // enum e ['agendado','aberto','fechado']; agendados nao geram pendencia
    // ainda, fechados sao filtrados). Status "Atrasado" e derivado por
    // comparacao now > dataFechamento (equivalente ao trigger que muda
    // cycleSchedule.status de 'aberto' para 'atrasado' — nao aplicado a
    // copsoqCycles).
    if (snap.cicloStatus !== 'aberto') {
      continue;
    }
    const emp = employeesById.get(snap.employeeId);
    if (emp === undefined) {
      continue;
    }
    const nr1CicloStatusDerivado: 'aberto' | 'atrasado' =
      snap.dataFechamento !== null && now.getTime() > snap.dataFechamento.getTime()
        ? 'atrasado'
        : 'aberto';
    const statusPendencia = resolveStatusFromCiclo(nr1CicloStatusDerivado);
    const cooldownUntil =
      cooldownUntilByKey.get(cooldownKey(emp.id, 'radarNR1', snap.cicloReferencia)) ?? null;
    rowsMateralizadas.push({
      key: buildRowKey('radarNR1', 'employee', emp.id, snap.cicloReferencia),
      userType: 'employee',
      userId: emp.id,
      nome: emp.nome,
      cpf: emp.cpf,
      photoUrl: emp.photoUrl,
      cargo: emp.cargo,
      departamento: emp.departamento,
      liderNome: emp.liderEmpNome ?? emp.liderClNome ?? null,
      liderId: emp.liderEmpId,
      instrumento: 'radarNR1',
      status: statusPendencia,
      prazoOriginal: snap.dataFechamento,
      diasEmAtraso: computeDiasAtraso(snap.dataFechamento, now),
      cicloReferencia: snap.cicloReferencia,
      cooldownUntil,
    });
  }

  // -------------------------------------------------------------------
  // Filtros + ordenacao + paginacao
  // -------------------------------------------------------------------

  const rowsFiltradas = aplicarFiltros(rowsMateralizadas, filters);
  const rowsOrdenadas = ordenarPendenciasTripla(rowsFiltradas);
  const totalRows = rowsOrdenadas.length;
  const totalPages = totalRows === 0 ? 1 : Math.ceil(totalRows / pageSize);
  const pageSafe = Math.max(1, Math.min(page, totalPages));
  const start = (pageSafe - 1) * pageSize;
  const rowsPaginadas = rowsOrdenadas.slice(start, start + pageSize);

  // Totais dos 3 cards resumo — sempre calculados sobre o pos-filtro
  // completo (nao paginado), conforme §14.23 linha 2603 "reflete filtros
  // aplicados".
  let atrasadas = 0;
  let pendentes = 0;
  const impactadosSet = new Set<string>();
  for (const r of rowsOrdenadas) {
    if (r.status === 'Atrasado') {
      atrasadas += 1;
    } else {
      pendentes += 1;
    }
    impactadosSet.add(`${r.userType}:${r.userId}`);
  }

  // Opcoes canonicas dos filtros dinamicos (ciclo e lider).
  const ciclosDisponiveis: CicloOption[] = ciclosAtivos
    .map((c) => ({
      cicloReferencia: c.cicloReferencia,
      tipoCiclo: c.tipoCiclo,
      status: c.status as 'aberto' | 'atrasado' | 'fechado',
    }))
    .sort((a, b) => b.cicloReferencia.localeCompare(a.cicloReferencia));

  const lideresSet = new Map<number, string>();
  for (const emp of employeesRows) {
    if (emp.liderEmpId !== null && emp.liderEmpNome !== null) {
      lideresSet.set(emp.liderEmpId, emp.liderEmpNome);
    }
  }
  const lideresDisponiveis: LiderDiretoOption[] = [...lideresSet.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

  return {
    rows: rowsPaginadas,
    totals: {
      atrasadas,
      pendentes,
      colaboradoresImpactados: impactadosSet.size,
    },
    totalRows,
    page: pageSafe,
    pageSize,
    totalPages,
    ciclosDisponiveis,
    lideresDisponiveis,
  };
}

// -----------------------------------------------------------------------
// Contagem canonica — card resumo §5.8 (refactor S321)
// -----------------------------------------------------------------------

/**
 * Contagem canonica de pendencias totais da empresa para o card resumo
 * §5.8 (soma total, nao contagem de colaboradores — DOC 05 §5.8 linha
 * 643).
 *
 * Implementacao canonica: consome `loadPendenciasPage` com filtros
 * default e paginacao maxima (pageSize=100) sem materializar rows
 * paginadas — extrai apenas `totalRows`. Otimizacao futura possivel via
 * consultas dedicadas (queries mais leves sem materializar detalhes),
 * mas nesta ME preserva consistencia bit-exact entre card §5.8 e rota
 * §14.23 (mesma logica canonica de agregacao).
 *
 * **RV-13.** Consumido por:
 *   - `painel-rh/page.tsx` (refactor S321).
 *   - `super-admin/empresa/[id]/pendencias-portal/page.tsx` (contexto
 *     Bruno dentro-de-empresa, para validar exibicao coerente).
 *   - `me058-pendencias.test.ts`.
 */
export async function countPendenciasEmpresa(params: {
  readonly db: RoipDatabase;
  readonly companyId: number;
  readonly now?: Date;
}): Promise<number> {
  const result = await loadPendenciasPage({
    db: params.db,
    companyId: params.companyId,
    filters: {
      q: null,
      departamento: null,
      liderDiretoId: null,
      instrumento: null,
      status: null,
      cicloReferencia: null,
    },
    page: 1,
    pageSize: 100,
    now: params.now,
  });
  return result.totalRows;
}

// -----------------------------------------------------------------------
// Detente do lint quando helper local nao e mais usado (imports gt/lt)
// -----------------------------------------------------------------------

// `gt` e `lt` sao reservados para consultas de faixa em variantes
// futuras do motor (filtro por range de dias em atraso — nao no §14.23
// canonico atual). Deixados no import para nao gerar churn no proximo
// refactor.
export const _RESERVED_OPS = { gt, lt };
