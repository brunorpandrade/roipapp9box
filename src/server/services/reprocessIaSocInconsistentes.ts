// ROIP APP 9BOX — ME-REPROC-IASOC: reprocessamento retroativo das
// tentativas de Perfil Individual marcadas `inconsistente` pela regua
// ANTIGA de `ia_soc`, que passam sob a regua recalibrada (ME-RECAL-IASOC,
// commit d2bc93a).
//
// Decisao canonica de Bruno (06/11/2026, revertendo a decisao de nao
// reprocessar da mesma data): reaproveitar as respostas ja dadas, sem a
// pessoa refazer o teste (Caminho 2, Opcao A).
//
// Modelo de estado (confirmado na RV-09 dirigida):
// - A reprova marca a tentativa `inconsistente` e NAO calcula as Camadas
//   2-5 (sem linha em `individualProfileScores`). O getReport (S213) so
//   vira `consistente` quando existe score na maior tentativa; a lista de
//   inconsistentes (listInconsistentesEnriquecidoByCompany) olha o
//   placeholder em `inconsistente`/`aguardando_nova_resposta`.
// - Varios titulares ja tiveram o reteste liberado: tem uma tentativa
//   `em_andamento` aberta + placeholder `aguardando_nova_resposta`.
//
// Estrategia (Opcao A) — usa o fluxo real do motor (`runAssessment`), sem
// UPDATE manual de status:
// - Com tentativa `em_andamento` aberta: copia as respostas da tentativa
//   inconsistente para ela e roda `runAssessment` nela. A tentativa mais
//   recente passa a valer (alinhado ao "nova tentativa = a valida"), sem
//   orfao; `runAssessment` gera o score e transiciona o placeholder para
//   `respondido`.
// - Sem tentativa aberta: roda `runAssessment` in-place na tentativa
//   inconsistente.
// - `ia_att=0` (errou as duas perguntas de atencao, §5.1.1) continua
//   `baixa` — pulado, nunca reprovado silenciosamente.
//
// Idempotente: apos o reprocessamento o placeholder sai de
// `inconsistente`/`aguardando_nova_resposta`, entao a segunda execucao
// nao reencontra o titular. Demos (Nativa=1, Ubatuba=2) sao PRESERVADAS:
// seus inconsistentes sao narrativa curada.
//
// RV-14: um statement por linha, largura maxima 100 colunas.
// RV-13: exports consumidos pelo script `reprocess-ia-soc-inconsistentes`
//   e por `tests/integration/reprocessIaSoc.test.ts` /
//   `tests/unit/decidirAcaoReprocess.test.ts`.

import { inArray } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { individualProfilePlaceholders } from '../../db/schema/tables';

import {
  getIndividualProfileAssessmentById,
  listIndividualProfileAssessmentsByUser,
  updateIndividualProfileProgresso,
} from './individualProfileAssessments';
import {
  classifyReliability,
  computeIaAcq,
  computeIaAtt,
  computeIaCons,
  computeIaExt,
  computeIaSoc,
  normalizeRespostas,
  runAssessment,
  type ConfiabilidadeNivel,
} from './individualProfileEngine';

/**
 * Empresas demo — narrativa curada, incluindo casos inconsistentes
 * propositais. NUNCA reprocessadas (preserva a demonstracao do fluxo).
 */
export const COMPANIES_DEMO: readonly number[] = [1, 2];

/** Status de assessment relevantes para a decisao. */
type StatusAssessment = 'em_andamento' | 'enviado' | 'inconsistente';

/** Subconjunto minimo de uma tentativa necessario para decidir a acao. */
export interface TentativaReprocess {
  readonly id: number;
  readonly tentativa: number;
  readonly status: StatusAssessment;
  readonly respostas: unknown;
}

/** Acao canonica decidida para um titular. */
export type ReprocessAcao =
  | 'reprocessa_em_andamento'
  | 'reprocessa_inplace'
  | 'skip_continua_baixa'
  | 'skip_sem_respostas'
  | 'skip_sem_inconsistente';

/** Decisao pura (sem IO) para um conjunto de tentativas de um titular. */
export interface DecisaoReprocess {
  readonly acao: ReprocessAcao;
  readonly inconsistenteAssessmentId: number | null;
  readonly inconsistenteTentativa: number | null;
  readonly alvoAssessmentId: number | null;
  readonly alvoTentativa: number | null;
  readonly nivelNovo: ConfiabilidadeNivel | null;
}

/** Item do plano: decisao + identificacao do titular. */
export interface ReprocessPlanItem extends DecisaoReprocess {
  readonly companyId: number;
  readonly userType: 'employee' | 'clevel';
  readonly userId: number;
}

/** Resultado da aplicacao. */
export interface ReprocessResult {
  readonly plan: readonly ReprocessPlanItem[];
  readonly aplicados: number;
  readonly pulados: number;
}

function ultima<T extends { tentativa: number }>(itens: readonly T[]): T | null {
  if (itens.length === 0) return null;
  const ordenado = [...itens].sort((a, b) => a.tentativa - b.tentativa);
  return ordenado[ordenado.length - 1] ?? null;
}

/**
 * Decide a acao para um titular a partir das suas tentativas. Funcao
 * PURA: `computeIa*`, `classifyReliability` e `normalizeRespostas` nao
 * tocam IO. Preve o nivel pelo MESMO pipeline que `runAssessment` usara
 * na aplicacao, garantindo que o dry-run reflita o apply.
 */
export function decidirAcaoReprocess(tentativas: readonly TentativaReprocess[]): DecisaoReprocess {
  const vazio: DecisaoReprocess = {
    acao: 'skip_sem_inconsistente',
    inconsistenteAssessmentId: null,
    inconsistenteTentativa: null,
    alvoAssessmentId: null,
    alvoTentativa: null,
    nivelNovo: null,
  };
  const inc = ultima(tentativas.filter((t) => t.status === 'inconsistente'));
  if (inc === null) return vazio;

  const respostas = normalizeRespostas(inc.respostas);
  if (Object.keys(respostas).length === 0) {
    return {
      ...vazio,
      acao: 'skip_sem_respostas',
      inconsistenteAssessmentId: inc.id,
      inconsistenteTentativa: inc.tentativa,
    };
  }

  const nivelNovo = classifyReliability([
    computeIaAtt(respostas).alerta,
    computeIaSoc(respostas).alerta,
    computeIaAcq(respostas).alerta,
    computeIaCons(respostas).alerta,
    computeIaExt(respostas).alerta,
  ]);
  if (nivelNovo === 'baixa') {
    return {
      ...vazio,
      acao: 'skip_continua_baixa',
      inconsistenteAssessmentId: inc.id,
      inconsistenteTentativa: inc.tentativa,
      nivelNovo,
    };
  }

  const emAndamento = ultima(tentativas.filter((t) => t.status === 'em_andamento'));
  if (emAndamento !== null) {
    return {
      acao: 'reprocessa_em_andamento',
      inconsistenteAssessmentId: inc.id,
      inconsistenteTentativa: inc.tentativa,
      alvoAssessmentId: emAndamento.id,
      alvoTentativa: emAndamento.tentativa,
      nivelNovo,
    };
  }
  return {
    acao: 'reprocessa_inplace',
    inconsistenteAssessmentId: inc.id,
    inconsistenteTentativa: inc.tentativa,
    alvoAssessmentId: inc.id,
    alvoTentativa: inc.tentativa,
    nivelNovo,
  };
}

/**
 * Plano read-only: para cada placeholder em `inconsistente` ou
 * `aguardando_nova_resposta` (exceto demos), decide a acao. NAO muta.
 */
export async function planReprocessIaSoc(db: RoipDatabase): Promise<ReprocessPlanItem[]> {
  const placeholders = await db
    .select()
    .from(individualProfilePlaceholders)
    .where(
      inArray(individualProfilePlaceholders.status, ['inconsistente', 'aguardando_nova_resposta']),
    );
  const plan: ReprocessPlanItem[] = [];
  for (const ph of placeholders) {
    if (COMPANIES_DEMO.includes(ph.companyId)) continue;
    const tentativas = await listIndividualProfileAssessmentsByUser(
      db,
      ph.companyId,
      ph.userType,
      ph.userId,
    );
    const decisao = decidirAcaoReprocess(
      tentativas.map((t) => ({
        id: t.id,
        tentativa: t.tentativa,
        status: t.status,
        respostas: t.respostas,
      })),
    );
    plan.push({ companyId: ph.companyId, userType: ph.userType, userId: ph.userId, ...decisao });
  }
  return plan;
}

/**
 * Aplica o reprocessamento via `runAssessment` (fluxo real do motor).
 * Transacional por item nao e necessario: `runAssessment` e idempotente
 * o suficiente e a funcao toda e idempotente entre execucoes (o
 * placeholder sai do escopo apos o sucesso).
 */
export async function applyReprocessIaSoc(db: RoipDatabase, now: Date): Promise<ReprocessResult> {
  const plan = await planReprocessIaSoc(db);
  let aplicados = 0;
  let pulados = 0;
  for (const item of plan) {
    if (
      item.acao === 'reprocessa_em_andamento' &&
      item.inconsistenteAssessmentId !== null &&
      item.alvoAssessmentId !== null
    ) {
      const inc = await getIndividualProfileAssessmentById(db, item.inconsistenteAssessmentId);
      if (!inc) {
        pulados += 1;
        continue;
      }
      await updateIndividualProfileProgresso(db, item.alvoAssessmentId, {
        blocoAtual: inc.blocoAtual,
        blocosCompletos: inc.blocosCompletos,
        respostas: inc.respostas,
      });
      await runAssessment(db, item.alvoAssessmentId, now);
      aplicados += 1;
    } else if (item.acao === 'reprocessa_inplace' && item.inconsistenteAssessmentId !== null) {
      await runAssessment(db, item.inconsistenteAssessmentId, now);
      aplicados += 1;
    } else {
      pulados += 1;
    }
  }
  return { plan, aplicados, pulados };
}
