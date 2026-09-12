// ROIP APP 9BOX — helper `loadPortalColaboradorPendencias` (ME-B10-01,
// S250 Opção B).
//
// Motivação canônica (S250):
// O helper existente `loadMeuPortalData` (src/app/painel-rh/internals.ts)
// serve a Seção 4 do painel RH e a rota `/meu-portal` — sempre retornando
// pendências agregadas com PendenciaStatus binário ('Pendente' |
// 'Atrasado'). Não expõe:
//   (a) estado bruto do Perfil Individual (5 valores canônicos —
//       DOC 05 §6.3 exige 4 estados na UI do portal do colaborador);
//   (b) instrumentos respondidos nos últimos 7 dias (DOC 05 §6.3 exige
//       seção separada abaixo com Enviado <7d);
//   (c) progresso "X de 10 blocos concluídos" do Perfil Individual em
//       andamento (DOC 05 §6.3 linha 782);
//   (d) nome do líder direto avaliado no Instrumento D (DOC 05 §6.3
//       linha 768).
//
// Ampliar `loadMeuPortalData` cruzaria impacto em `/painel-rh` e
// `/meu-portal`. S250 Opção B canoniza a criação deste helper dedicado
// ao portal do colaborador — reusa `loadPendenciasPage` bit-a-bit
// para pendências e adiciona 4 queries auxiliares para o
// enriquecimento canônico §6.3.
//
// RV-12: 100% Drizzle tipado. Zero SQL cru.
// RV-13: consumidores nesta ME-B10-01 —
//   - `PortalColaboradorPendencias` → consumido por
//     `src/app/api/portal/pendencias/route.ts` (payload REST) e
//     `tests/integration/me-b10-01-portal-pendencias-helper.test.ts`.
//   - `loadPortalColaboradorPendencias` → consumido pelo mesmo route
//     handler e pelo mesmo teste.
// RV-14: um statement por linha, largura máxima 100 colunas.

import { and, desc, eq, gte, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  copsoqCycleSnapshot,
  employeeLeaderHistory,
  employees,
  individualProfileAssessments,
  instrumentA_responses,
  instrumentD_responses,
} from '../../db/schema';
import { loadPendenciasPage } from './pendenciasEngine';
import type { PortalInstrumentType } from '../../db/schema/enums';
import { CANONICAL_PENDENCIAS_DEFAULT_FILTERS } from '../../app/pendencias-portal/filters';

/**
 * Estado canônico do Perfil Individual para exibição no portal do
 * colaborador (DOC 05 §6.3).
 *
 * - `pendente`: card padrão navy, botão `[Responder]`.
 * - `em_andamento`: card teal com progresso "X de 10 blocos concluídos",
 *   botão `[Continuar]`.
 * - `aguardando_nova_resposta`: mesmo comportamento visual de `pendente`
 *   (colaborador não percebe que é reteste — DOC 05 §6.3 linha 797).
 * - `respondido`: NÃO aparece nesta lista — vira `respondidosRecentes`
 *   quando dentro dos últimos 7 dias, ou desaparece após 7 dias
 *   (DOC 05 §6.3 linha 793).
 * - `inconsistente`: NÃO aparece — colaborador nunca é notificado
 *   (DOC 05 §6.3 linha 795).
 */
export type PerfilIndividualEstadoPortal = 'pendente' | 'em_andamento' | 'aguardando_nova_resposta';

/**
 * Card de pendência canônico do portal do colaborador. Superset dos
 * campos de `MeuPortalPendenciaItem` (canal `/meu-portal`) com o
 * enriquecimento §6.3 exigido pela UI do portal.
 */
export interface PortalPendenciaCard {
  readonly key: string;
  readonly instrumento: PortalInstrumentType;
  readonly status: 'Pendente' | 'Atrasado';
  readonly prazoOriginal: Date | null;
  readonly diasEmAtraso: number;
  /** Preenchido somente quando `instrumento === 'meuPerfil'`. */
  readonly perfilIndividualEstado: PerfilIndividualEstadoPortal | null;
  /**
   * Preenchido somente quando `instrumento === 'meuPerfil'` e
   * `perfilIndividualEstado === 'em_andamento'`. Valor esperado 1..9
   * (bloco 10 = envio final, não conta como "concluído em andamento").
   */
  readonly blocosConcluidos: number | null;
  /**
   * Preenchido somente quando `instrumento === 'avaliacaoLiderancaDireta'`.
   * Nome do líder direto vigente do respondente. Null se não houver
   * líder direto ativo (`employeeLeaderHistory.dataFim IS NULL` ausente).
   */
  readonly liderNome: string | null;
}

/**
 * Card de "respondido nos últimos 7 dias" do portal (DOC 05 §6.3).
 * Renderizado em seção separada abaixo dos pendentes. Estilo canônico:
 * ícone ✅, opacity 65%, badge "Enviado", card não clicável.
 */
export interface PortalRespondidoRecente {
  readonly key: string;
  readonly instrumento: PortalInstrumentType;
  readonly respondidoEm: Date;
}

/**
 * Retorno canônico de `loadPortalColaboradorPendencias`. Consumido
 * pelo Route Handler `GET /api/portal/pendencias` como payload JSON.
 */
export interface PortalColaboradorPendencias {
  readonly pendencias: readonly PortalPendenciaCard[];
  readonly respondidosRecentes: readonly PortalRespondidoRecente[];
}

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100 as const;

/**
 * Retorna pendências e respondidos recentes do titular autenticado no
 * portal do colaborador (§6.3 canônico integral).
 *
 * Pipeline canônico:
 * (1) Reusa `loadPendenciasPage` (paginação canônica) filtrando em
 *     memória por `(userType, userId)` — mesmo padrão canônico do
 *     `loadMeuPortalData` (§7.19 CORR2 do B9-fechamento).
 * (2) Para cada `PendenciaRow` filtrado, enriquece com:
 *     - `perfilIndividualEstado` (via `individualProfileAssessments`)
 *       quando `instrumento === 'meuPerfil'`.
 *     - `blocosConcluidos` derivado de
 *       `individualProfileAssessments.blocosCompletos` (JSON array)
 *       quando `perfilIndividualEstado === 'em_andamento'`.
 *     - `liderNome` (via `employeeLeaderHistory` JOIN `employees`)
 *       quando `instrumento === 'avaliacaoLiderancaDireta'` e
 *       `titularType === 'employee'` (C-level nunca tem líder direto).
 * (3) Query paralela para respondidos <7 dias em 4 tabelas:
 *     - `individualProfileAssessments` (status='enviado', enviadoEm
 *       >= now-7d).
 *     - `instrumentA_responses` (respondidoEm >= now-7d) — apenas
 *       employees (Instrumento A é exclusivo do colaborador, C-level
 *       não responde — DOC 03 §6.2).
 *     - `instrumentD_responses` (respondidoEm >= now-7d por
 *       respondenteId).
 *     - `copsoqCycleSnapshot` (respondeu=true, respondidoEm >= now-7d).
 *
 * Ordenação canônica (regra híbrida P-M3.8 — DOC 05 §6.3):
 *   1. Radar NR-1 primeiro quando pendente.
 *   2. Demais pendentes por `prazoOriginal` ascendente (null vai para
 *      o fim); em empate, por `instrumento` alfabético.
 *   3. Respondidos recentes em array separado, por `respondidoEm`
 *      descendente (mais recente no topo).
 */
export async function loadPortalColaboradorPendencias(
  db: RoipDatabase,
  companyId: number,
  titularType: 'employee' | 'clevel',
  titularId: number,
  nowFn: () => Date = () => new Date(),
): Promise<PortalColaboradorPendencias> {
  const now = nowFn();
  const seteDiasAtras = new Date(now.getTime() - SETE_DIAS_MS);

  // --------------------------------------------------------------------
  // (1) Pendências agregadas do titular via engine canônica
  // --------------------------------------------------------------------

  const pendenciasBase: {
    key: string;
    instrumento: PortalInstrumentType;
    status: 'Pendente' | 'Atrasado';
    prazoOriginal: Date | null;
    diasEmAtraso: number;
  }[] = [];

  let page = 1;
  let totalPages = 1;
  do {
    const result = await loadPendenciasPage({
      db,
      companyId,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page,
      pageSize: PAGE_SIZE,
    });
    totalPages = result.totalPages;
    for (const row of result.rows) {
      if (row.userType !== titularType) {
        continue;
      }
      if (row.userId !== titularId) {
        continue;
      }
      pendenciasBase.push({
        key: row.key,
        instrumento: row.instrumento,
        status: row.status,
        prazoOriginal: row.prazoOriginal,
        diasEmAtraso: row.diasEmAtraso,
      });
    }
    page += 1;
  } while (page <= totalPages);

  // --------------------------------------------------------------------
  // (2) Enriquecimento canônico §6.3
  // --------------------------------------------------------------------

  const assessmentAtual = await findLatestAssessment(db, companyId, titularType, titularId);

  const perfilEstado: PerfilIndividualEstadoPortal | null = derivePerfilEstado(assessmentAtual);
  const blocosConcluidos = deriveBlocosConcluidos(assessmentAtual);

  let liderNome: string | null = null;
  if (titularType === 'employee') {
    liderNome = await findLiderDiretoNome(db, titularId);
  }

  const pendenciasEnriquecidas: PortalPendenciaCard[] = pendenciasBase.map((base) => {
    if (base.instrumento === 'meuPerfil') {
      return {
        ...base,
        perfilIndividualEstado: perfilEstado,
        blocosConcluidos: perfilEstado === 'em_andamento' ? blocosConcluidos : null,
        liderNome: null,
      };
    }
    if (base.instrumento === 'avaliacaoLiderancaDireta') {
      return {
        ...base,
        perfilIndividualEstado: null,
        blocosConcluidos: null,
        liderNome,
      };
    }
    return {
      ...base,
      perfilIndividualEstado: null,
      blocosConcluidos: null,
      liderNome: null,
    };
  });

  // Ordenação canônica P-M3.8 (§6.3): Radar NR-1 primeiro se pendente;
  // demais por prazoOriginal ascendente (null para o fim); tie-break
  // alfabético por instrumento.
  pendenciasEnriquecidas.sort(compareByPMD38);

  // --------------------------------------------------------------------
  // (3) Respondidos nos últimos 7 dias — 4 instrumentos em paralelo
  // --------------------------------------------------------------------

  const respondidosRecentes = await loadRespondidosRecentes(
    db,
    companyId,
    titularType,
    titularId,
    seteDiasAtras,
  );

  return {
    pendencias: pendenciasEnriquecidas,
    respondidosRecentes,
  };
}

// -----------------------------------------------------------------------
// Helpers privados
// -----------------------------------------------------------------------

interface AssessmentRow {
  readonly status: 'em_andamento' | 'enviado' | 'inconsistente';
  readonly tentativa: number;
  readonly blocosCompletos: unknown;
  readonly enviadoEm: Date | null;
}

async function findLatestAssessment(
  db: RoipDatabase,
  companyId: number,
  titularType: 'employee' | 'clevel',
  titularId: number,
): Promise<AssessmentRow | null> {
  const rows = await db
    .select({
      status: individualProfileAssessments.status,
      tentativa: individualProfileAssessments.tentativa,
      blocosCompletos: individualProfileAssessments.blocosCompletos,
      enviadoEm: individualProfileAssessments.enviadoEm,
    })
    .from(individualProfileAssessments)
    .where(
      and(
        eq(individualProfileAssessments.companyId, companyId),
        eq(individualProfileAssessments.userType, titularType),
        eq(individualProfileAssessments.userId, titularId),
      ),
    )
    .orderBy(desc(individualProfileAssessments.tentativa))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    status: row.status,
    tentativa: row.tentativa,
    blocosCompletos: row.blocosCompletos,
    enviadoEm: row.enviadoEm,
  };
}

function derivePerfilEstado(row: AssessmentRow | null): PerfilIndividualEstadoPortal | null {
  if (row === null) {
    return null;
  }
  if (row.status === 'em_andamento') {
    return 'em_andamento';
  }
  // status 'enviado' ou 'inconsistente' NÃO renderiza card de pendência
  // (respondido vai para respondidosRecentes; inconsistente é oculto).
  return null;
}

function deriveBlocosConcluidos(row: AssessmentRow | null): number | null {
  if (row === null) {
    return null;
  }
  if (!Array.isArray(row.blocosCompletos)) {
    return null;
  }
  // blocosCompletos é JSON array de números (1..10). "Blocos concluídos"
  // reportado ao colaborador exclui bloco 10 (que é envio final, não
  // conta como concluído durante a jornada — DOC 05 §6.3 linha 782).
  const filtrados = row.blocosCompletos.filter(
    (v: unknown) => typeof v === 'number' && v >= 1 && v <= 9,
  );
  return filtrados.length;
}

async function findLiderDiretoNome(db: RoipDatabase, employeeId: number): Promise<string | null> {
  const rows = await db
    .select({ nome: employees.name })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.liderId))
    .where(
      and(
        eq(employeeLeaderHistory.employeeId, employeeId),
        // Vigente: dataFim IS NULL (padrão canônico ME-B9-SEC — isNull
        // de drizzle-orm, nunca `sql\`...IS NULL\``).
        isNull(employeeLeaderHistory.dataFim),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row?.nome ?? null;
}

function compareByPMD38(a: PortalPendenciaCard, b: PortalPendenciaCard): number {
  // (1) Radar NR-1 sempre primeiro se pendente.
  if (a.instrumento === 'radarNR1' && b.instrumento !== 'radarNR1') {
    return -1;
  }
  if (b.instrumento === 'radarNR1' && a.instrumento !== 'radarNR1') {
    return 1;
  }
  // (2) prazoOriginal ascendente; null vai para o fim.
  if (a.prazoOriginal === null && b.prazoOriginal !== null) {
    return 1;
  }
  if (b.prazoOriginal === null && a.prazoOriginal !== null) {
    return -1;
  }
  if (a.prazoOriginal !== null && b.prazoOriginal !== null) {
    const diff = a.prazoOriginal.getTime() - b.prazoOriginal.getTime();
    if (diff !== 0) {
      return diff;
    }
  }
  // (3) Tie-break: alfabético por instrumento.
  return a.instrumento.localeCompare(b.instrumento);
}

async function loadRespondidosRecentes(
  db: RoipDatabase,
  companyId: number,
  titularType: 'employee' | 'clevel',
  titularId: number,
  seteDiasAtras: Date,
): Promise<PortalRespondidoRecente[]> {
  const acumulado: PortalRespondidoRecente[] = [];

  // Perfil Individual — via individualProfileAssessments.
  const perfilRows = await db
    .select({
      enviadoEm: individualProfileAssessments.enviadoEm,
      tentativa: individualProfileAssessments.tentativa,
    })
    .from(individualProfileAssessments)
    .where(
      and(
        eq(individualProfileAssessments.companyId, companyId),
        eq(individualProfileAssessments.userType, titularType),
        eq(individualProfileAssessments.userId, titularId),
        eq(individualProfileAssessments.status, 'enviado'),
        gte(individualProfileAssessments.enviadoEm, seteDiasAtras),
      ),
    );
  for (const row of perfilRows) {
    if (row.enviadoEm !== null) {
      acumulado.push({
        key: `meuPerfil:${titularType}:${titularId}:${row.tentativa}`,
        instrumento: 'meuPerfil',
        respondidoEm: row.enviadoEm,
      });
    }
  }

  // Instrumento A — apenas employees. C-level nunca responde A
  // (DOC 03 §6.2). Uma tupla por (dimensao, itemIndex) do trimestre —
  // dedupimos por trimestre pegando o respondidoEm mais recente.
  if (titularType === 'employee') {
    const aRows = await db
      .select({
        respondidoEm: instrumentA_responses.respondidoEm,
        trimestre: instrumentA_responses.trimestre,
      })
      .from(instrumentA_responses)
      .where(
        and(
          eq(instrumentA_responses.companyId, companyId),
          eq(instrumentA_responses.employeeId, titularId),
          gte(instrumentA_responses.respondidoEm, seteDiasAtras),
        ),
      );
    const porTrimestre = new Map<string, Date>();
    for (const row of aRows) {
      if (row.respondidoEm === null) {
        continue;
      }
      const anterior = porTrimestre.get(row.trimestre);
      if (anterior === undefined || row.respondidoEm > anterior) {
        porTrimestre.set(row.trimestre, row.respondidoEm);
      }
    }
    for (const [trimestre, respondidoEm] of porTrimestre.entries()) {
      acumulado.push({
        key: `autoAvaliacao:${titularId}:${trimestre}`,
        instrumento: 'autoAvaliacao',
        respondidoEm,
      });
    }
  }

  // Instrumento D — respondenteId = titularId (apenas employees; C-level
  // pode responder D quando é liderado de C-level, mas o schema atual
  // do respondente D em copsoq exige employees.id — S097 preserva).
  if (titularType === 'employee') {
    const dRows = await db
      .select({
        respondidoEm: instrumentD_responses.respondidoEm,
        trimestre: instrumentD_responses.trimestre,
      })
      .from(instrumentD_responses)
      .where(
        and(
          eq(instrumentD_responses.companyId, companyId),
          eq(instrumentD_responses.respondenteId, titularId),
          gte(instrumentD_responses.respondidoEm, seteDiasAtras),
        ),
      );
    const porTrimestreD = new Map<string, Date>();
    for (const row of dRows) {
      if (row.respondidoEm === null) {
        continue;
      }
      const anterior = porTrimestreD.get(row.trimestre);
      if (anterior === undefined || row.respondidoEm > anterior) {
        porTrimestreD.set(row.trimestre, row.respondidoEm);
      }
    }
    for (const [trimestre, respondidoEm] of porTrimestreD.entries()) {
      acumulado.push({
        key: `avaliacaoLiderancaDireta:${titularId}:${trimestre}`,
        instrumento: 'avaliacaoLiderancaDireta',
        respondidoEm,
      });
    }
  }

  // Radar NR-1 — via copsoqCycleSnapshot. Cobre apenas employees
  // (schema atual — S097 preserva).
  if (titularType === 'employee') {
    const nr1Rows = await db
      .select({
        respondidoEm: copsoqCycleSnapshot.respondidoEm,
        cicloDbId: copsoqCycleSnapshot.cicloDbId,
      })
      .from(copsoqCycleSnapshot)
      .where(
        and(
          eq(copsoqCycleSnapshot.companyId, companyId),
          eq(copsoqCycleSnapshot.employeeId, titularId),
          eq(copsoqCycleSnapshot.respondeu, true),
          gte(copsoqCycleSnapshot.respondidoEm, seteDiasAtras),
        ),
      );
    for (const row of nr1Rows) {
      if (row.respondidoEm !== null) {
        acumulado.push({
          key: `radarNR1:${titularId}:${row.cicloDbId}`,
          instrumento: 'radarNR1',
          respondidoEm: row.respondidoEm,
        });
      }
    }
  }

  // Ordena por respondidoEm descendente (mais recente no topo).
  acumulado.sort((a, b) => b.respondidoEm.getTime() - a.respondidoEm.getTime());

  return acumulado;
}

// C-level nunca responde Instrumento A/D/Radar NR-1 (respondentes
// canônicos = employees). Referência ativa para satisfazer TS unused
// vars (mesmo padrão canônico usado em `pendenciasEngine._RESERVED_OPS`).
export const _RESERVED_CLEVEL_MEMBERS = { cLevelMembers };
