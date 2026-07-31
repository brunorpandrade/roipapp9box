// ROIP APP 9BOX — resolvedor canonico de linkDestino por tipo (ME-059).
//
// Origem canonica:
// - DOC 06 §5 (padrao canonico por tipo — 17 mapeamentos).
// - DOC 06 §5 nota canonica sobre roteamento condicional v1.1:
//     - `nr1_fator_critico`, `nr1_ciclo_fechado`, `desbloqueio_solicitado`
//       tem rota final dependente de `destinatarioTipo` (RH vs Bruno);
//     - resolucao ocorre no passo M5 (INSERT em `notifications`), antes
//       do enfileiramento em `emailQueue`;
//     - o motor `emitAlert` e o hook `emitAlertPostGravacao` sao
//       responsaveis por preencher `linkDestino` corretamente para cada
//       destinatario.
//
// Contrato canonico:
// - Funcao pura sem I/O. Entrada: tipo + contexto (companyId, employeeId,
//   cicloDbId, fatorId, cicloReferencia, mes) + destinatarioTipo. Saida:
//   string canonica do `linkDestino`.
// - Cada tipo tem contexto canonico proprio; campos ausentes lancam erro
//   (contexto invalido). O motor `emitAlert` monta o contexto conforme
//   §5 e passa integralmente aqui.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `LinkResolverContext` (tipo) → consumido por
//     `pipeline/m5-insertNotifications.ts` e testes unitarios.
//   - `resolveLinkDestino` → consumido pelo M5 e por testes unitarios.

import { type AlertTipo } from './typeDictionary';
import { type NotificationDestinatarioTipo } from '../../db/schema/enums';

/**
 * Contexto canonico do `linkDestino`. Campos opcionais dependem do tipo;
 * `resolveLinkDestino` valida e lanca `LinkResolverError` em ausencia.
 *
 * Convencao canonica:
 * - `employeeId`: usado em `desempenho_*`, `assiduidade_baixa`,
 *   `divergencia_a_c`, `perfil_*` (§5).
 * - `trimestre`: `'YYYY-QN'` (§5 — para P07, B3, P28 e P08).
 * - `mes`: `'YYYY-MM'` (§5 — para B1 e P08).
 * - `cicloDbId`: id de `copsoqCycles` — para NR-1 (§5).
 * - `fatorId`: id do fator NR-1 (0-100) — apenas para `nr1_fator_critico`.
 * - `companyId`: identifica empresa em rota `/super-admin/empresa/{id}`
 *   condicional (`nr1_*` para Bruno + `fechamento_bloqueado_...`).
 */
export interface LinkResolverContext {
  readonly companyId: number;
  readonly employeeId?: number | null;
  readonly trimestre?: string | null;
  readonly mes?: string | null;
  readonly cicloDbId?: number | null;
  readonly fatorId?: number | null;
}

/**
 * Erro canonico lancado quando o contexto e insuficiente para resolver
 * a rota. Nao deve ocorrer em producao — os hooks canonicos §8.11 sao
 * responsaveis por montar contexto completo antes de chamar o motor.
 */
export class LinkResolverError extends Error {
  constructor(tipo: AlertTipo, campoAusente: string) {
    super(
      `alert.link.invalid — tipo "${tipo}" requer contexto ` +
        `"${campoAusente}" para resolver linkDestino (DOC 06 §5). ` +
        `Corrigir o hook chamador para popular o campo.`,
    );
    this.name = 'LinkResolverError';
  }
}

function requireEmployeeId(tipo: AlertTipo, ctx: LinkResolverContext): number {
  if (typeof ctx.employeeId !== 'number') {
    throw new LinkResolverError(tipo, 'employeeId');
  }
  return ctx.employeeId;
}

function requireTrimestre(tipo: AlertTipo, ctx: LinkResolverContext): string {
  if (typeof ctx.trimestre !== 'string' || ctx.trimestre.length === 0) {
    throw new LinkResolverError(tipo, 'trimestre');
  }
  return ctx.trimestre;
}

function requireMes(tipo: AlertTipo, ctx: LinkResolverContext): string {
  if (typeof ctx.mes !== 'string' || ctx.mes.length === 0) {
    throw new LinkResolverError(tipo, 'mes');
  }
  return ctx.mes;
}

function requireCicloDbId(tipo: AlertTipo, ctx: LinkResolverContext): number {
  if (typeof ctx.cicloDbId !== 'number') {
    throw new LinkResolverError(tipo, 'cicloDbId');
  }
  return ctx.cicloDbId;
}

function requireFatorId(tipo: AlertTipo, ctx: LinkResolverContext): number {
  if (typeof ctx.fatorId !== 'number') {
    throw new LinkResolverError(tipo, 'fatorId');
  }
  return ctx.fatorId;
}

/**
 * Resolve `linkDestino` canonico por tipo, aplicando roteamento
 * condicional por `destinatarioTipo` conforme §5 v1.1.
 *
 * Mapeamento canonico completo:
 * - `desempenho_queda_brusca` → `/dashboard-individual/{eid}?highlight=eixox&trimestre={t}`
 * - `desempenho_estagnacao` → `/dashboard-individual/{eid}?highlight=eixox&mes={m}`
 * - `desempenho_queda_isolada` → `/dashboard-individual/{eid}?highlight=eixox&trimestre={t}`
 * - `assiduidade_baixa` → `/dashboard-individual/{eid}?highlight=eixox&mes={m}`
 * - `divergencia_a_c` → `/dashboard-individual/{eid}?highlight=eixoy&trimestre={t}`
 * - `nr1_fator_critico`:
 *     - rh: `/nr1?ciclo={c}&fator={f}`
 *     - bruno: `/super-admin/empresa/{cid}/nr1?ciclo={c}&fator={f}`
 * - `nr1_ciclo_fechado`:
 *     - rh: `/nr1?ciclo={c}`
 *     - bruno: `/super-admin/empresa/{cid}/nr1?ciclo={c}`
 * - `perfil_*` (3 tipos) → `/dashboard-individual/{eid}`
 * - `desbloqueio_solicitado`:
 *     - bruno: `/super-admin/desbloqueios`
 *     - rh: `/cycle-management`
 * - `desbloqueio_aprovado` → `/cycle-management`
 * - `desbloqueio_recusado` → `/cycle-management`
 * - `ciclo_instrumento_encerrado` → `/cycle-management`
 * - `ciclo_mensal_fechado` → `/cycle-management`
 * - `fechamento_bloqueado_sem_resp_financeiro` → `/super-admin/empresa/{cid}`
 * - `responsavel_financeiro_nomeado` → `/faturamento-mensal`
 */
export function resolveLinkDestino(
  tipo: AlertTipo,
  destinatarioTipo: NotificationDestinatarioTipo,
  ctx: LinkResolverContext,
): string {
  switch (tipo) {
    case 'desempenho_queda_brusca': {
      const eid = requireEmployeeId(tipo, ctx);
      const t = requireTrimestre(tipo, ctx);
      return `/dashboard-individual/${eid}?highlight=eixox&trimestre=${t}`;
    }
    case 'desempenho_estagnacao': {
      const eid = requireEmployeeId(tipo, ctx);
      const m = requireMes(tipo, ctx);
      return `/dashboard-individual/${eid}?highlight=eixox&mes=${m}`;
    }
    case 'desempenho_queda_isolada': {
      const eid = requireEmployeeId(tipo, ctx);
      const t = requireTrimestre(tipo, ctx);
      return `/dashboard-individual/${eid}?highlight=eixox&trimestre=${t}`;
    }
    case 'assiduidade_baixa': {
      const eid = requireEmployeeId(tipo, ctx);
      const m = requireMes(tipo, ctx);
      return `/dashboard-individual/${eid}?highlight=eixox&mes=${m}`;
    }
    case 'divergencia_a_c': {
      const eid = requireEmployeeId(tipo, ctx);
      const t = requireTrimestre(tipo, ctx);
      return `/dashboard-individual/${eid}?highlight=eixoy&trimestre=${t}`;
    }
    case 'nr1_fator_critico': {
      const c = requireCicloDbId(tipo, ctx);
      const f = requireFatorId(tipo, ctx);
      return destinatarioTipo === 'bruno'
        ? `/super-admin/empresa/${ctx.companyId}/nr1?ciclo=${c}&fator=${f}`
        : `/nr1?ciclo=${c}&fator=${f}`;
    }
    case 'nr1_ciclo_fechado': {
      const c = requireCicloDbId(tipo, ctx);
      return destinatarioTipo === 'bruno'
        ? `/super-admin/empresa/${ctx.companyId}/nr1?ciclo=${c}`
        : `/nr1?ciclo=${c}`;
    }
    case 'perfil_inconsistente_primeira':
    case 'perfil_retest_consistente':
    case 'perfil_retest_reincidente': {
      const eid = requireEmployeeId(tipo, ctx);
      return `/dashboard-individual/${eid}`;
    }
    case 'desbloqueio_solicitado': {
      return destinatarioTipo === 'bruno' ? '/super-admin/desbloqueios' : '/cycle-management';
    }
    case 'desbloqueio_aprovado':
    case 'desbloqueio_recusado':
    case 'ciclo_instrumento_encerrado':
    case 'ciclo_mensal_fechado': {
      return '/cycle-management';
    }
    case 'fechamento_bloqueado_sem_resp_financeiro': {
      return `/super-admin/empresa/${ctx.companyId}`;
    }
    case 'responsavel_financeiro_nomeado': {
      return '/faturamento-mensal';
    }
  }
}
