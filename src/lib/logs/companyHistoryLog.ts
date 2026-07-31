// ROIP APP 9BOX — helper canonico do historico consolidado da empresa
// (ME-057c — §14.21 S476).
//
// Origem canonica:
// - DOC 05 §14.21 (Rota `/super-admin/empresa/[id]/historico`) — 5
//   fontes consolidadas via UNION: `responsavelFinanceiroTransferLog`,
//   `monthlyUnlockLog`, `employeeLeaderHistory`, `performanceMultiplierLog`
//   (placeholder — nao retorna linhas nesta fase), `cycleUnlockRequests`.
// - Mockup canonico `historico_empresa_v1.html`. CC045 canonizada nesta
//   ME: mockup prevalece bit-exact (labels + estados vazios + shape do
//   painel expandido em grid 2 col).
// - S322 canonizada nesta ME: ator canonico da transferencia de
//   liderados = literal "Sistema (transferencia de liderados)". Schema
//   `employeeLeaderHistory` nao registra `actorSuperAdminId` — D065
//   aberto para reavaliar em B5.4 quando `/transferencia-liderados`
//   nascer.
// - S323 canonizada nesta ME: agrupamento canonico do batch de
//   transferencia = 1 linha visual por (transferBatchId, novoLiderId).
//   Preserva rastreabilidade granular do mapeamento distribuido do
//   `leadershipTransfer.execute` (DOC 03 §14.11).
// - S324 canonizada nesta ME: filtro "Ator" = LIKE sobre nome do ator
//   resolvido de cada fonte (executor canonico primario), aplicado ANTES
//   da UNION (in-database) para preservar filtragem eficiente.
//
// Contrato canonico:
// - `HistoryEventRow` — shape uniforme cross-fonte da linha visual da
//   tabela (id chave composta "tipo:sourceId", ator resolvido, tipo,
//   descricao pre-computada, detalhes 2-col grid, justificativa
//   opcional).
// - `HistoryLoadResult` — resultado paginado + count total (aplicado
//   apos UNION em memoria — total canonico = length do agregado antes de
//   paginar).
// - `loadCompanyHistoryPage` — 5 queries paralelas (Promise.all) +
//   consolidacao in-memory + sort desc(createdAt, sourceId) + slice de
//   paginacao. Cross-tenant safe: cada query filtra por `companyId`
//   ANTES da UNION.
//
// Estrategia de paginacao (S204): total pequeno esperado por empresa (<
// 1000 eventos administrativos historicos por design), justifica UNION
// in-memory ao inves de SQL UNION nativo. Facilita composicao
// polimorfica dos detalhes e resolve limitacao de shape uniforme (as 5
// fontes tem colunas semanticamente distintas).
//
// **RV-12.** 100% Drizzle tipado. Aliases via `alias()` de
// `drizzle-orm/mysql-core` (padrao S320) para JOINs polimorficos de
// holders (RF De/Para; transferencia novoLider).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `HistoryEventRow`, `HistoryEventDetailItem`, `HistoryLoadResult`
//     → consumido por `actions.ts`, `page.tsx`, `HistoricoClient.tsx`,
//     `me057c-historico.test.ts`.
//   - `loadCompanyHistoryPage` → consumido por `page.tsx` (carga
//     inicial), `actions.ts` (re-fetch), `me057c-historico.test.ts`.

import { and, asc, eq, gte, like, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companies,
  cycleUnlockRequests,
  employeeLeaderHistory,
  employees,
  monthlyUnlockLog,
  responsavelFinanceiroTransferLog,
  superAdmins,
} from '../../db/schema';
import type { AbaUnlock } from '../../db/schema/enums';
import {
  HISTORY_EVENT_TYPE_LABEL,
  SYSTEM_ACTOR_TRANSFERENCIA,
  formatAbaLabel,
  formatBatchIdShort,
  formatMesReferencia,
  formatSolicitacaoStatusLabel,
  type HistoryEventType,
} from '../../app/super-admin/empresa/[id]/historico/mappings';
import {
  resolvePeriodoRange,
  type HistoricoFilters,
} from '../../app/super-admin/empresa/[id]/historico/filters';

// -----------------------------------------------------------------------
// Contrato canonico do shape uniforme cross-fonte
// -----------------------------------------------------------------------

/**
 * Item canonico do painel expandido §14.21 (grid 2 col — mockup CSS
 * linha 83 `grid-template-columns: repeat(2, 1fr)`). Cada fonte contribui
 * de 2 a 5 itens (RF: De/Para/Executado por; desbloqueio: Mes/Expira;
 * transferencia: Liderados/NovoLider/BatchId; solicitacao: Mes/Aba/
 * Status/Decidido por + opcional MotivoRecusa).
 */
export interface HistoryEventDetailItem {
  readonly label: string;
  readonly valor: string;
}

/**
 * Linha visual canonica do historico consolidado §14.21. `id` e chave
 * composta `${tipo}:${sourceId}` (ou `${tipo}:${transferBatchId}:${novoLiderKey}`
 * para transferencia — S323) — garante unicidade cross-fonte para
 * ancoragem UI (`toggleLinha`, key React).
 *
 * `descricao` e pre-computada no server (nao delegada ao client) para
 * evitar duplicacao de logica de derivacao em 2 camadas.
 */
export interface HistoryEventRow {
  readonly id: string;
  readonly createdAt: Date;
  readonly atorNome: string;
  readonly tipo: HistoryEventType;
  readonly descricao: string;
  readonly detalhes: readonly HistoryEventDetailItem[];
  readonly justificativa: string | null;
}

export interface HistoryLoadResult {
  readonly rows: readonly HistoryEventRow[];
  readonly totalCount: number;
  readonly filtersApplied: HistoricoFilters;
}

// -----------------------------------------------------------------------
// Aliases canonicos para LEFT JOIN polimorfico (RV-12 / S320)
// -----------------------------------------------------------------------

/** Alias `employees` para "De" quando previousHolderType='employee'. */
const rfDeEmp = alias(employees, 'rfDeEmp');
/** Alias `cLevelMembers` para "De" quando previousHolderType='cLevel'. */
const rfDeCl = alias(cLevelMembers, 'rfDeCl');
/** Alias `employees` para "Para" quando newHolderType='employee'. */
const rfParaEmp = alias(employees, 'rfParaEmp');
/** Alias `cLevelMembers` para "Para" quando newHolderType='cLevel'. */
const rfParaCl = alias(cLevelMembers, 'rfParaCl');

/** Alias `employees` para novoLider (transferencia) via liderId. */
const tNovoLiderEmp = alias(employees, 'tNovoLiderEmp');
/** Alias `cLevelMembers` para novoLider (transferencia) via clevelId. */
const tNovoLiderCl = alias(cLevelMembers, 'tNovoLiderCl');

/** Alias `employees` do liderado (transferencia) — cross-JOIN companyId. */
const tLiderado = alias(employees, 'tLiderado');

/** Alias `superAdmins` para "Decidido por" (solicitacao aprovada/recusada). */
const solDecidiuPor = alias(superAdmins, 'solDecidiuPor');
/** Alias `employees` para "Solicitante" (solicitacao) via solicitanteId. */
const solEmp = alias(employees, 'solEmp');
/** Alias `cLevelMembers` para "Solicitante" (solicitacao) via solicitanteId. */
const solCl = alias(cLevelMembers, 'solCl');

// -----------------------------------------------------------------------
// Fonte 1 — responsavelFinanceiroTransferLog → tipo `respfin`
// -----------------------------------------------------------------------

interface RawRespfinRow {
  readonly id: number;
  readonly createdAt: Date;
  readonly eventType: 'atribuido' | 'transferido' | 'removido';
  readonly reason: string;
  readonly executadoPorNome: string;
  readonly deNome: string | null;
  readonly paraNome: string | null;
}

async function loadRespfinRows(
  db: RoipDatabase,
  companyId: number,
  atorLike: string | null,
  rangeInicio: Date | null,
  rangeFim: Date | null,
): Promise<readonly HistoryEventRow[]> {
  const clauses = [eq(responsavelFinanceiroTransferLog.companyId, companyId)];
  if (rangeInicio !== null) {
    clauses.push(gte(responsavelFinanceiroTransferLog.createdAt, rangeInicio));
  }
  if (rangeFim !== null) {
    clauses.push(lte(responsavelFinanceiroTransferLog.createdAt, rangeFim));
  }
  if (atorLike !== null) {
    clauses.push(like(superAdmins.name, atorLike));
  }
  const rawRows = await db
    .select({
      id: responsavelFinanceiroTransferLog.id,
      createdAt: responsavelFinanceiroTransferLog.createdAt,
      eventType: responsavelFinanceiroTransferLog.eventType,
      reason: responsavelFinanceiroTransferLog.reason,
      previousHolderType: responsavelFinanceiroTransferLog.previousHolderType,
      previousHolderId: responsavelFinanceiroTransferLog.previousHolderId,
      newHolderType: responsavelFinanceiroTransferLog.newHolderType,
      newHolderId: responsavelFinanceiroTransferLog.newHolderId,
      executadoPorNome: superAdmins.name,
      deEmpNome: rfDeEmp.name,
      deClNome: rfDeCl.name,
      paraEmpNome: rfParaEmp.name,
      paraClNome: rfParaCl.name,
    })
    .from(responsavelFinanceiroTransferLog)
    .innerJoin(superAdmins, eq(superAdmins.id, responsavelFinanceiroTransferLog.actorSuperAdminId))
    .leftJoin(
      rfDeEmp,
      and(
        eq(responsavelFinanceiroTransferLog.previousHolderType, 'employee'),
        eq(rfDeEmp.id, responsavelFinanceiroTransferLog.previousHolderId),
      ),
    )
    .leftJoin(
      rfDeCl,
      and(
        eq(responsavelFinanceiroTransferLog.previousHolderType, 'cLevel'),
        eq(rfDeCl.id, responsavelFinanceiroTransferLog.previousHolderId),
      ),
    )
    .leftJoin(
      rfParaEmp,
      and(
        eq(responsavelFinanceiroTransferLog.newHolderType, 'employee'),
        eq(rfParaEmp.id, responsavelFinanceiroTransferLog.newHolderId),
      ),
    )
    .leftJoin(
      rfParaCl,
      and(
        eq(responsavelFinanceiroTransferLog.newHolderType, 'cLevel'),
        eq(rfParaCl.id, responsavelFinanceiroTransferLog.newHolderId),
      ),
    )
    .where(and(...clauses));

  return rawRows.map((r): HistoryEventRow => {
    const deNome = r.deEmpNome ?? r.deClNome ?? null;
    const paraNome = r.paraEmpNome ?? r.paraClNome ?? null;
    const rawShape: RawRespfinRow = {
      id: r.id,
      createdAt: r.createdAt ?? new Date(0),
      eventType: r.eventType,
      reason: r.reason,
      executadoPorNome: r.executadoPorNome,
      deNome,
      paraNome,
    };
    return composeRespfinRow(rawShape);
  });
}

function composeRespfinRow(raw: RawRespfinRow): HistoryEventRow {
  const descricao = composeRespfinDescricao(raw.eventType, raw.deNome, raw.paraNome);
  const detalhes: readonly HistoryEventDetailItem[] = [
    { label: 'De', valor: raw.deNome ?? '—' },
    { label: 'Para', valor: raw.paraNome ?? '—' },
    { label: 'Executado por', valor: raw.executadoPorNome },
  ];
  // `reason` do RF nao e "justificativa" livre — e a propria descricao
  // resumida canonica ($14 do DOC 03). Nao replicar no bloco de
  // justificativa expandida (mockup linhas 258-261: respfin sem
  // justificativa expandida).
  return {
    id: `respfin:${raw.id}`,
    createdAt: raw.createdAt,
    atorNome: raw.executadoPorNome,
    tipo: 'respfin',
    descricao,
    detalhes,
    justificativa: null,
  };
}

function composeRespfinDescricao(
  eventType: 'atribuido' | 'transferido' | 'removido',
  deNome: string | null,
  paraNome: string | null,
): string {
  if (eventType === 'atribuido') {
    return `Atribuição do papel de Responsável financeiro a ${paraNome ?? '—'}`;
  }
  if (eventType === 'transferido') {
    const de = deNome ?? '—';
    const para = paraNome ?? '—';
    return `Transferência do papel de Responsável financeiro de ${de} para ${para}`;
  }
  return `Remoção do papel de Responsável financeiro de ${deNome ?? '—'}, sem substituto`;
}

// -----------------------------------------------------------------------
// Fonte 2 — monthlyUnlockLog → tipo `desbloqueio`
// -----------------------------------------------------------------------

async function loadDesbloqueioRows(
  db: RoipDatabase,
  companyId: number,
  atorLike: string | null,
  rangeInicio: Date | null,
  rangeFim: Date | null,
): Promise<readonly HistoryEventRow[]> {
  const clauses = [eq(monthlyUnlockLog.companyId, companyId)];
  if (rangeInicio !== null) {
    clauses.push(gte(monthlyUnlockLog.createdAt, rangeInicio));
  }
  if (rangeFim !== null) {
    clauses.push(lte(monthlyUnlockLog.createdAt, rangeFim));
  }
  if (atorLike !== null) {
    clauses.push(like(superAdmins.name, atorLike));
  }
  const rawRows = await db
    .select({
      id: monthlyUnlockLog.id,
      createdAt: monthlyUnlockLog.createdAt,
      mes: monthlyUnlockLog.mes,
      aba: monthlyUnlockLog.aba,
      justificativa: monthlyUnlockLog.justificativa,
      expiraEm: monthlyUnlockLog.expiraEm,
      atorNome: superAdmins.name,
    })
    .from(monthlyUnlockLog)
    .innerJoin(superAdmins, eq(superAdmins.id, monthlyUnlockLog.desbloqueadoPor))
    .where(and(...clauses));

  return rawRows.map((r): HistoryEventRow => {
    const mesLabel = formatMesReferencia(r.mes);
    const expiraLabel = formatDateBRT(r.expiraEm);
    return {
      id: `desbloqueio:${r.id}`,
      createdAt: r.createdAt ?? new Date(0),
      atorNome: r.atorNome,
      tipo: 'desbloqueio',
      descricao: `Desbloqueio do mês de ${mesLabel} — janela de 24h iniciada`,
      detalhes: [
        { label: 'Mês desbloqueado', valor: mesLabel },
        { label: 'Aba', valor: formatAbaLabel(r.aba as AbaUnlock) },
        { label: 'Expira em', valor: expiraLabel },
      ],
      justificativa: r.justificativa,
    };
  });
}

// -----------------------------------------------------------------------
// Fonte 3 — employeeLeaderHistory → tipo `transferencia` (S322 + S323)
// -----------------------------------------------------------------------

async function loadTransferenciaRows(
  db: RoipDatabase,
  companyId: number,
  atorLike: string | null,
  rangeInicio: Date | null,
  rangeFim: Date | null,
): Promise<readonly HistoryEventRow[]> {
  // S322: filtro "Ator" no ator canonico literal SYSTEM_ACTOR_TRANSFERENCIA
  // aplica-se apenas se o padrao LIKE casar com o literal (aplicado em
  // memoria — evita query vazia por incompatibilidade textual quando o
  // usuario digita, por exemplo, "Bruno").
  const clauses = [eq(tLiderado.companyId, companyId)];
  if (rangeInicio !== null) {
    clauses.push(gte(employeeLeaderHistory.createdAt, rangeInicio));
  }
  if (rangeFim !== null) {
    clauses.push(lte(employeeLeaderHistory.createdAt, rangeFim));
  }
  const rawRows = await db
    .select({
      id: employeeLeaderHistory.id,
      createdAt: employeeLeaderHistory.createdAt,
      transferBatchId: employeeLeaderHistory.transferBatchId,
      reason: employeeLeaderHistory.reason,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
      novoLiderEmpNome: tNovoLiderEmp.name,
      novoLiderClNome: tNovoLiderCl.name,
      novoLiderEmpCargo: tNovoLiderEmp.descricaoCBO,
      novoLiderClCargo: tNovoLiderCl.cargo,
    })
    .from(employeeLeaderHistory)
    .innerJoin(tLiderado, eq(tLiderado.id, employeeLeaderHistory.employeeId))
    .leftJoin(tNovoLiderEmp, eq(tNovoLiderEmp.id, employeeLeaderHistory.liderId))
    .leftJoin(tNovoLiderCl, eq(tNovoLiderCl.id, employeeLeaderHistory.clevelId))
    .where(and(...clauses));

  // S323: agrupamento canonico por (transferBatchId, novoLiderKey).
  // `novoLiderKey` = "emp:<id>" ou "cl:<id>" para distinguir polimorfismo.
  interface TransferGroup {
    transferBatchId: string;
    novoLiderNome: string;
    novoLiderCargo: string;
    novoLiderTipo: 'employee' | 'cLevel';
    reason: string;
    createdAt: Date;
    minSourceId: number;
    count: number;
  }
  const groups = new Map<string, TransferGroup>();
  for (const r of rawRows) {
    let novoLiderKey: string;
    let novoLiderNome: string;
    let novoLiderCargo: string;
    let novoLiderTipo: 'employee' | 'cLevel';
    if (r.liderId !== null) {
      novoLiderKey = `emp:${r.liderId}`;
      novoLiderNome = r.novoLiderEmpNome ?? '—';
      novoLiderCargo = r.novoLiderEmpCargo ?? '—';
      novoLiderTipo = 'employee';
    } else if (r.clevelId !== null) {
      novoLiderKey = `cl:${r.clevelId}`;
      novoLiderNome = r.novoLiderClNome ?? '—';
      novoLiderCargo = r.novoLiderClCargo ?? '—';
      novoLiderTipo = 'cLevel';
    } else {
      // Registro canonicamente invalido (nem liderId nem clevelId) —
      // exclui do agregado. Nunca deveria ocorrer sob DOC 03 §14.11.
      continue;
    }
    const groupKey = `${r.transferBatchId}|${novoLiderKey}`;
    const existing = groups.get(groupKey);
    const currentCreatedAt = r.createdAt ?? new Date(0);
    if (existing === undefined) {
      groups.set(groupKey, {
        transferBatchId: r.transferBatchId,
        novoLiderNome,
        novoLiderCargo,
        novoLiderTipo,
        reason: r.reason,
        createdAt: currentCreatedAt,
        minSourceId: r.id,
        count: 1,
      });
    } else {
      existing.count += 1;
      if (r.id < existing.minSourceId) {
        existing.minSourceId = r.id;
      }
      if (currentCreatedAt.getTime() < existing.createdAt.getTime()) {
        existing.createdAt = currentCreatedAt;
      }
    }
  }

  const composed: HistoryEventRow[] = [];
  for (const [groupKey, g] of groups) {
    // S324 aplicado em memoria para o ator literal — nao ha JOIN de
    // superAdmin no schema.
    if (atorLike !== null && !likeInMemory(SYSTEM_ACTOR_TRANSFERENCIA, atorLike)) {
      continue;
    }
    const tipoLabelNovoLider = g.novoLiderTipo === 'employee' ? 'Colaborador' : 'C-level';
    const lideradosLabel = g.count === 1 ? '1 colaborador' : `${g.count} colaboradores`;
    composed.push({
      id: `transferencia:${groupKey}`,
      createdAt: g.createdAt,
      atorNome: SYSTEM_ACTOR_TRANSFERENCIA,
      tipo: 'transferencia',
      descricao: `Transferência de ${lideradosLabel} para ${g.novoLiderNome}`,
      detalhes: [
        { label: 'Liderado(s) afetado(s)', valor: lideradosLabel },
        {
          label: 'Novo líder',
          valor: `${g.novoLiderNome} (${tipoLabelNovoLider} — ${g.novoLiderCargo})`,
        },
        { label: 'Batch ID', valor: formatBatchIdShort(g.transferBatchId) },
      ],
      justificativa: g.reason,
    });
  }
  return composed;
}

/**
 * LIKE case-insensitive canonico aplicado em memoria (S324 sobre ator
 * literal). Espera padrao `%raw%` (chaves de percentual no filtro
 * fornecido). Sem MySQL COLLATE — normalizacao NFC + comparacao lower.
 */
function likeInMemory(target: string, pattern: string): boolean {
  const p = pattern.replace(/^%/, '').replace(/%$/, '').toLowerCase();
  return target.toLowerCase().includes(p);
}

// -----------------------------------------------------------------------
// Fonte 4 — performanceMultiplierLog → placeholder canonico §14.21
// -----------------------------------------------------------------------

// Placeholder canonico literal do §14.21: "nao retorna linhas nesta
// fase". Nao ha query — mantido documentado para rastreabilidade RV-13.
// Habilitar em fase futura quando o motor de retroatividade de
// multiplicadores for finalizado (referencia D001+ historicos).

// -----------------------------------------------------------------------
// Fonte 5 — cycleUnlockRequests → tipo `solicitacao`
// -----------------------------------------------------------------------

async function loadSolicitacaoRows(
  db: RoipDatabase,
  companyId: number,
  atorLike: string | null,
  rangeInicio: Date | null,
  rangeFim: Date | null,
): Promise<readonly HistoryEventRow[]> {
  const clauses = [eq(cycleUnlockRequests.companyId, companyId)];
  if (rangeInicio !== null) {
    clauses.push(gte(cycleUnlockRequests.createdAt, rangeInicio));
  }
  if (rangeFim !== null) {
    clauses.push(lte(cycleUnlockRequests.createdAt, rangeFim));
  }
  // S324: ator canonico da solicitacao = solicitante (nome do employee
  // ou clevel). LIKE aplicado no COALESCE dos dois nomes via OR em
  // memoria pos-fetch (evita OR/like polimorfico complexo no SQL).
  const rawRows = await db
    .select({
      id: cycleUnlockRequests.id,
      createdAt: cycleUnlockRequests.createdAt,
      solicitanteTipo: cycleUnlockRequests.solicitanteTipo,
      solicitanteId: cycleUnlockRequests.solicitanteId,
      mes: cycleUnlockRequests.mes,
      aba: cycleUnlockRequests.aba,
      justificativa: cycleUnlockRequests.justificativa,
      status: cycleUnlockRequests.status,
      decididoEm: cycleUnlockRequests.decididoEm,
      motivoRecusa: cycleUnlockRequests.motivoRecusa,
      solEmpNome: solEmp.name,
      solClNome: solCl.name,
      decidiuPorNome: solDecidiuPor.name,
    })
    .from(cycleUnlockRequests)
    .leftJoin(
      solEmp,
      and(
        eq(cycleUnlockRequests.solicitanteTipo, 'employee'),
        eq(solEmp.id, cycleUnlockRequests.solicitanteId),
      ),
    )
    .leftJoin(
      solCl,
      and(
        eq(cycleUnlockRequests.solicitanteTipo, 'clevel'),
        eq(solCl.id, cycleUnlockRequests.solicitanteId),
      ),
    )
    .leftJoin(solDecidiuPor, eq(solDecidiuPor.id, cycleUnlockRequests.decididoPor))
    .where(and(...clauses));

  const composed: HistoryEventRow[] = [];
  for (const r of rawRows) {
    const solicitanteNome = r.solEmpNome ?? r.solClNome ?? '—';
    if (atorLike !== null && !likeInMemory(solicitanteNome, atorLike)) {
      continue;
    }
    const mesLabel = formatMesReferencia(r.mes);
    const statusLabel = formatSolicitacaoStatusLabel(r.status);
    const detalhes: HistoryEventDetailItem[] = [
      { label: 'Mês solicitado', valor: mesLabel },
      { label: 'Aba', valor: formatAbaLabel(r.aba as AbaUnlock) },
      { label: 'Status', valor: statusLabel },
    ];
    if (r.decidiuPorNome !== null && r.decidiuPorNome !== '') {
      detalhes.push({ label: 'Decidido por', valor: r.decidiuPorNome });
    }
    if (r.status === 'recusada' && r.motivoRecusa !== null && r.motivoRecusa !== '') {
      detalhes.push({ label: 'Motivo da recusa', valor: r.motivoRecusa });
    }
    composed.push({
      id: `solicitacao:${r.id}`,
      createdAt: r.createdAt ?? new Date(0),
      atorNome: solicitanteNome,
      tipo: 'solicitacao',
      descricao:
        `Solicitação de desbloqueio do mês de ${mesLabel}` +
        ` — status: ${statusLabel.toLowerCase()}`,
      detalhes,
      justificativa: r.justificativa,
    });
  }
  return composed;
}

// -----------------------------------------------------------------------
// Formatter canonico de data (fuso UTC → BRT sem lib externa)
// -----------------------------------------------------------------------

/**
 * Formata `Date` em `dd/MM/yyyy às HH:mm` canonico §14.21 (mockup:
 * "03/07/2026 às 14:05"). Fuso UTC canonico (nao aplica timezone shift —
 * responsabilidade do consumidor caso queira ajustar para local).
 */
function formatDateBRT(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} às ${hh}:${min}`;
}

// -----------------------------------------------------------------------
// Query orquestradora canonica: UNION de 5 fontes + sort + paginacao
// -----------------------------------------------------------------------

/**
 * Carrega uma pagina do historico consolidado §14.21 para a empresa
 * `companyId`. Executa 5 queries paralelas (1 placeholder — 4 reais),
 * consolida em memoria, filtra por tipo (client-side ao inves de por-
 * query para simplicidade — o filtro corta linhas nao selecionadas),
 * ordena `desc(createdAt, id)`, aplica paginacao 25/50/100.
 *
 * Cross-tenant safe: cada fonte filtra por `companyId` ANTES da UNION.
 * O `companyId` chega do route param `[id]` validado no `page.tsx`.
 *
 * Complexidade: O(N) onde N = numero de eventos administrativos da
 * empresa no periodo. Design canonico assume N << 10k por empresa/ano
 * (volume administrativo baixo).
 */
export async function loadCompanyHistoryPage(
  db: RoipDatabase,
  companyId: number,
  filters: HistoricoFilters,
  now: Date = new Date(),
): Promise<HistoryLoadResult> {
  const range = resolvePeriodoRange(
    filters.periodo,
    filters.periodoPersonalizadoInicio,
    filters.periodoPersonalizadoFim,
    now,
  );
  const atorLike = filters.atorBusca === '' ? null : `%${filters.atorBusca}%`;

  const [respfin, desbloqueio, transferencia, solicitacao] = await Promise.all([
    loadRespfinRows(db, companyId, atorLike, range.inicio, range.fim),
    loadDesbloqueioRows(db, companyId, atorLike, range.inicio, range.fim),
    loadTransferenciaRows(db, companyId, atorLike, range.inicio, range.fim),
    loadSolicitacaoRows(db, companyId, atorLike, range.inicio, range.fim),
  ]);

  // UNION in-memory. Filtro por tipo (S324 aplicado no chamador do
  // dropdown — o filtro `tipo` corta linhas nao selecionadas pos-UNION).
  const all: HistoryEventRow[] = [...respfin, ...desbloqueio, ...transferencia, ...solicitacao];

  const filtered = filters.tipo === null ? all : all.filter((r) => r.tipo === filters.tipo);

  // Ordenacao canonica: `desc(createdAt)` seguido de `desc(id)` como
  // desempate deterministico (evita paginacao instavel sob mesma
  // createdAt em UUIDs de batch simultaneos).
  filtered.sort((a, b) => {
    const dt = b.createdAt.getTime() - a.createdAt.getTime();
    if (dt !== 0) return dt;
    // `id` e string composta — comparacao lexicografica canonica.
    if (a.id < b.id) return 1;
    if (a.id > b.id) return -1;
    return 0;
  });

  const totalCount = filtered.length;
  const start = (filters.page - 1) * filters.pageSize;
  const end = start + filters.pageSize;
  const rows = filtered.slice(start, end);

  return {
    rows,
    totalCount,
    filtersApplied: filters,
  };
}

// -----------------------------------------------------------------------
// Descoberta canonica de empresa (guard de existencia + display name)
// -----------------------------------------------------------------------

/**
 * Resolve dados canonicos de exibicao da empresa a partir do route param
 * `[id]`. Retorna `null` quando a empresa nao existe (page.tsx deve
 * emitir `notFound()`). Consulta usa `asc` como ordenacao trivial para
 * exercitar `.limit(1)` tipado.
 */
export interface CompanyDisplayInfo {
  readonly id: number;
  readonly nomeFantasia: string;
}

export async function findCompanyDisplayInfo(
  db: RoipDatabase,
  companyId: number,
): Promise<CompanyDisplayInfo | null> {
  const rows = await db
    .select({
      id: companies.id,
      nomeFantasia: companies.nomeFantasia,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .orderBy(asc(companies.id))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row === undefined) return null;
  return { id: row.id, nomeFantasia: row.nomeFantasia };
}

// -----------------------------------------------------------------------
// Labels canonicos das descricoes (re-export controlado)
// -----------------------------------------------------------------------

/**
 * Re-exporta labels canonicos consumidos pelos consumidores da UNION.
 * Preserva o encapsulamento — o modulo canonico da UI so importa daqui.
 */
export { HISTORY_EVENT_TYPE_LABEL };
