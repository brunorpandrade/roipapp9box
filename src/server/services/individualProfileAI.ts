// ROIP APP 9BOX — servico `individualProfileAI` (ME-050/51, S244).
//
// Motor de geracao dos textos do relatorio do Perfil Individual pela
// camada de IA (DOC 04 §3). Consome o wrapper canonico `claudeCall`
// (S258 Facade DI) e persiste em `individualProfileScores.resumoJson`
// e `.expandidoJson` via os setters canonicos com guarda
// `IS NULL` — imutabilidade §16.2 do DOC 03 (repositorio ME-015).
//
// Regime canonico:
// - Momento 2 sob demanda (§3.3): disparado por `individualProfile.getReport`
//   quando `resumoJson` ou `expandidoJson` estao NULL.
// - Orquestracao assincrona (§3.4): duas chamadas em paralelo
//   (resumo + expandido), completude independente.
// - Fire-and-forget para o router: `triggerReportGeneration` retorna
//   antes das chamadas a Claude API terminarem — nao trava `getReport`.
// - Protecao anti-double-call (§3.4): lock in-memory por
//   `(scoreId, formato)` TTL 90s. Segunda entrada simultanea sai sem
//   chamar API.
// - Persistencia so apos parsing bem-sucedido (§2.2 + §3.5). Falha em
//   qualquer ponto deixa o campo alvo NULL — nova visualizacao dispara
//   nova geracao.
// - Configuracao canonica das chamadas (§3.7): max_tokens=8000,
//   temperature=0.3, timeout 60s, jsonExpected=true, system prompt
//   canonico §4 (imutavel MVP).
// - Payload canonico §8.1 (resumo) / §8.2 (expandido) — identicos
//   exceto a instrucao final.
// - Perfil Individual NAO consome `apiUsageLog` (§2.3) — o motor nao
//   faz UPSERT em `apiUsageLog`.

import {
  DEFAULT_CLAUDE_CALL_FACADE,
  type ClaudeCallFacade,
  type ClaudeCallSurface,
} from './claudeCall';
import type { RoipDatabase } from '../../db/client';
import {
  getIndividualProfileScoreById,
  setIndividualProfileExpandidoCache,
  setIndividualProfileResumoCache,
} from './individualProfileScores';
import { INDIVIDUAL_PROFILE_SYSTEM_PROMPT } from './individualProfileSystemPrompt';
import type {
  IndividualProfileReportGenerationFacade,
  TriggerReportGenerationArgs,
} from '../routers/_shared/individualProfileGenerationTypes';

// ============================================================
// Constantes canonicas
// ============================================================

/** TTL do lock in-memory (§3.4). 90 segundos. */
export const INDIVIDUAL_PROFILE_AI_LOCK_TTL_MS = 90_000;

/** `max_tokens` canonico (§3.7). */
export const INDIVIDUAL_PROFILE_AI_MAX_TOKENS = 8_000;

/** `temperature` canonica (§3.7). */
export const INDIVIDUAL_PROFILE_AI_TEMPERATURE = 0.3;

// ============================================================
// Formato canonico (§8.1 / §8.2) — payload composer
// ============================================================

/** Identificacao no payload canonico (§8.1). */
export interface IndividualProfileAIIdentificacao {
  nome: string;
  cargo: string;
  nivel_hierarquico: 'operacional' | 'tatico' | 'estrategico';
  departamento: string;
  lider_direto: string;
  data_aplicacao: string; // YYYY-MM-DD
}

/**
 * Contexto canonico do payload — o consumidor injeta uma implementacao
 * de `loadPayloadContext` que resolve identificacao + confiabilidade a
 * partir do banco. Escores e flags saem direto da linha de
 * `individualProfileScores` (lida no motor).
 */
export interface IndividualProfileAIPayloadContext {
  identificacao: IndividualProfileAIIdentificacao;
  confiabilidade: {
    nivel: 'alta' | 'moderada';
    indices_com_alerta: string[];
    dimensoes_afetadas: string[];
  };
}

/** Formato — resumo ou expandido (§3.4). */
export type IndividualProfileAIFormato = 'resumo' | 'expandido';

/** Loader canonico do contexto do payload — injetavel. */
export type LoadPayloadContext = (
  db: RoipDatabase,
  scoreId: number,
) => Promise<IndividualProfileAIPayloadContext>;

/**
 * Deriva a faixa canonica de um subvetor a partir do valor 0-100. O
 * canonico do instrumento define as faixas mas o computo detalhado
 * vive no motor deterministico (DOC 03 §10.4-§10.5). Este helper e
 * uma aproximacao segura para o payload da IA — refinamento fino do
 * mapeamento fica registrado como debito para ME dedicada de
 * polimento do payload.
 */
function deriveFaixaSimples(valor: number | null): string {
  if (valor === null || Number.isNaN(valor)) return 'nao_disponivel';
  if (valor >= 75) return 'alta';
  if (valor >= 50) return 'moderada';
  return 'baixa';
}

interface ScoresRow {
  companyId: number;
  userType: 'employee' | 'clevel';
  userId: number;
  tentativa: number;
  perfilComportamental: string | null;
  vetorDominante: string | null;
  vetorSustentacao: string | null;
  vetorNegligenciado: string | null;
  top3Assinatura: unknown;
  flags: unknown;
  post_assert: string | null;
  post_tarefas: string | null;
  post_pessoas: string | null;
  post_pressao: string | null;
  est_abert: string | null;
  est_disc: string | null;
  est_ext: string | null;
  est_amab: string | null;
  est_estab: string | null;
  mot_maestria: string | null;
  mot_lideranca: string | null;
  mot_autonomia: string | null;
  mot_seguranca: string | null;
  mot_proposito: string | null;
  equ_autocons: string | null;
  equ_autogest: string | null;
  equ_leitura: string | null;
  equ_influencia: string | null;
  equ_indice: string | null;
  ass_sabed: string | null;
  ass_coragem: string | null;
  ass_humanid: string | null;
  ass_justica: string | null;
  ass_temper: string | null;
  ass_transc: string | null;
  resumoJson: unknown;
  expandidoJson: unknown;
}

function num(v: string | null): number | null {
  if (v === null) return null;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Compoe o texto canonico do user prompt (§8.1 / §8.2). A unica
 * diferenca entre os dois formatos e a instrucao final.
 */
export function composeIndividualProfileUserPrompt(
  context: IndividualProfileAIPayloadContext,
  scores: ScoresRow,
  formato: IndividualProfileAIFormato,
): string {
  const flagsObj = (scores.flags as Record<string, boolean> | null) ?? {};
  const top3 = Array.isArray(scores.top3Assinatura) ? (scores.top3Assinatura as string[]) : [];

  const payload = {
    identificacao: context.identificacao,
    confiabilidade: context.confiabilidade,
    escores: {
      postura: {
        assertividade_ritmo_decisao: num(scores.post_assert),
        orientacao_tarefas: num(scores.post_tarefas),
        orientacao_pessoas: num(scores.post_pessoas),
        comportamento_sob_pressao: num(scores.post_pressao),
        faixas: {
          assertividade_ritmo_decisao: deriveFaixaSimples(num(scores.post_assert)),
          orientacao_tarefas: deriveFaixaSimples(num(scores.post_tarefas)),
          orientacao_pessoas: deriveFaixaSimples(num(scores.post_pessoas)),
          comportamento_sob_pressao: deriveFaixaSimples(num(scores.post_pressao)),
        },
        perfil_comportamental: scores.perfilComportamental ?? '',
      },
      estrutura: {
        abertura_experiencia: num(scores.est_abert),
        disciplina_autogestao: num(scores.est_disc),
        extroversao: num(scores.est_ext),
        amabilidade: num(scores.est_amab),
        estabilidade_emocional: num(scores.est_estab),
        faixas: {
          abertura_experiencia: deriveFaixaSimples(num(scores.est_abert)),
          disciplina_autogestao: deriveFaixaSimples(num(scores.est_disc)),
          extroversao: deriveFaixaSimples(num(scores.est_ext)),
          amabilidade: deriveFaixaSimples(num(scores.est_amab)),
          estabilidade_emocional: deriveFaixaSimples(num(scores.est_estab)),
        },
      },
      motor: {
        maestria: num(scores.mot_maestria),
        lideranca: num(scores.mot_lideranca),
        autonomia: num(scores.mot_autonomia),
        seguranca: num(scores.mot_seguranca),
        proposito: num(scores.mot_proposito),
        faixas: {
          maestria: deriveFaixaSimples(num(scores.mot_maestria)),
          lideranca: deriveFaixaSimples(num(scores.mot_lideranca)),
          autonomia: deriveFaixaSimples(num(scores.mot_autonomia)),
          seguranca: deriveFaixaSimples(num(scores.mot_seguranca)),
          proposito: deriveFaixaSimples(num(scores.mot_proposito)),
        },
        vetor_dominante: scores.vetorDominante ?? '',
        vetor_sustentacao: scores.vetorSustentacao ?? '',
        vetor_negligenciado: scores.vetorNegligenciado ?? '',
      },
      equilibrio: {
        autoconsciencia: num(scores.equ_autocons),
        autogestao: num(scores.equ_autogest),
        leitura_do_outro: num(scores.equ_leitura),
        influencia_conducao: num(scores.equ_influencia),
        indice_geral: num(scores.equ_indice),
        faixas: {
          autoconsciencia: deriveFaixaSimples(num(scores.equ_autocons)),
          autogestao: deriveFaixaSimples(num(scores.equ_autogest)),
          leitura_do_outro: deriveFaixaSimples(num(scores.equ_leitura)),
          influencia_conducao: deriveFaixaSimples(num(scores.equ_influencia)),
          indice_geral: deriveFaixaSimples(num(scores.equ_indice)),
        },
      },
      assinatura: {
        sabedoria: num(scores.ass_sabed),
        coragem: num(scores.ass_coragem),
        humanidade: num(scores.ass_humanid),
        justica: num(scores.ass_justica),
        temperanca: num(scores.ass_temper),
        transcendencia: num(scores.ass_transc),
        faixas: {
          sabedoria: deriveFaixaSimples(num(scores.ass_sabed)),
          coragem: deriveFaixaSimples(num(scores.ass_coragem)),
          humanidade: deriveFaixaSimples(num(scores.ass_humanid)),
          justica: deriveFaixaSimples(num(scores.ass_justica)),
          temperanca: deriveFaixaSimples(num(scores.ass_temper)),
          transcendencia: deriveFaixaSimples(num(scores.ass_transc)),
        },
        top_3: top3,
      },
    },
    flags: {
      FLAG_ADAPT_POST: flagsObj.FLAG_ADAPT_POST ?? false,
      FLAG_DESALINH_MOT_ASS: flagsObj.FLAG_DESALINH_MOT_ASS ?? false,
      FLAG_COMP_APRENDIDA: flagsObj.FLAG_COMP_APRENDIDA ?? false,
      FLAG_LIDER_REATIVO: flagsObj.FLAG_LIDER_REATIVO ?? false,
      EMPATE_MOT: flagsObj.EMPATE_MOT ?? false,
      EQUIL_ASS: flagsObj.EQUIL_ASS ?? false,
    },
  };

  const instrucaoFinal =
    formato === 'resumo'
      ? 'Instrução: gere o RESUMO conforme especificação do system prompt.'
      : 'Instrução: gere a VERSÃO EXPANDIDA conforme especificação do system prompt.';

  const payloadJson = JSON.stringify(payload, null, 2);
  return `Pacote numérico do assessment:\n\n${payloadJson}\n\n${instrucaoFinal}`;
}

// ============================================================
// Lock in-memory (§3.4) — TTL 90s
// ============================================================

const LOCK_MAP: Map<string, number> = new Map();

function lockKey(scoreId: number, formato: IndividualProfileAIFormato): string {
  return `${scoreId}:${formato}`;
}

/**
 * Tenta adquirir o lock. Retorna `true` se adquiriu (chamador deve
 * seguir); `false` se ja existe lock vivo (chamador deve pular).
 * Locks expirados sao substituidos.
 */
export function tryAcquireLock(
  scoreId: number,
  formato: IndividualProfileAIFormato,
  nowMs: number,
): boolean {
  const key = lockKey(scoreId, formato);
  const existing = LOCK_MAP.get(key);
  if (existing !== undefined && existing > nowMs) {
    return false;
  }
  LOCK_MAP.set(key, nowMs + INDIVIDUAL_PROFILE_AI_LOCK_TTL_MS);
  return true;
}

/** Libera o lock. */
export function releaseLock(scoreId: number, formato: IndividualProfileAIFormato): void {
  LOCK_MAP.delete(lockKey(scoreId, formato));
}

/** Testes: reseta o mapa de locks entre casos. */
export function _resetLocksForTest(): void {
  LOCK_MAP.clear();
}

// ============================================================
// Deps injetaveis
// ============================================================

export interface IndividualProfileAIDeps {
  db: RoipDatabase;
  claudeCallFacade: ClaudeCallFacade;
  loadPayloadContext: LoadPayloadContext;
  now?: () => Date;
  systemPrompt?: string;
}

/** Outcome do motor (uso interno + testes). */
export type IndividualProfileAIOutcome =
  | { kind: 'ok'; formato: IndividualProfileAIFormato; affectedRows: number }
  | { kind: 'skipped_locked'; formato: IndividualProfileAIFormato }
  | { kind: 'skipped_already_cached'; formato: IndividualProfileAIFormato }
  | { kind: 'skipped_score_not_found'; formato: IndividualProfileAIFormato }
  | { kind: 'skipped_confiabilidade_baixa'; formato: IndividualProfileAIFormato }
  | {
      kind: 'failed_claude';
      formato: IndividualProfileAIFormato;
      status: 'falha_timeout' | 'falha_4xx' | 'falha_5xx' | 'falha_json';
      message: string;
    };

// ============================================================
// Motor — uma superficie por vez
// ============================================================

/**
 * Executa a geracao de UMA superficie (resumo ou expandido). Nao lanca
 * — devolve outcome discriminado. Roda sob lock de 90s (§3.4). Fim do
 * fluxo:
 * - `ok` — persistiu no cache (`affectedRows=1`) OU perdeu race
 *   (`affectedRows=0`, cache ja preenchido em execucao paralela).
 * - `skipped_*` — condicao canonica de nao chamar API.
 * - `failed_claude` — API falhou; cache preservado NULL (§2.2 e §11.1).
 */
export async function runIndividualProfileAIGeneration(
  deps: IndividualProfileAIDeps,
  args: {
    scoreId: number;
    companyId: number;
    /** Titular do perfil — §10.11 polimorfismo. Nao vai para telemetria. */
    userType: 'employee' | 'clevel';
    userId: number;
    tentativa: number;
    formato: IndividualProfileAIFormato;
    /** Usuario logado originador — §2.6 telemetria canonica. */
    triggeredByUserId: number;
    triggeredByUserType: 'super_admin' | 'employee';
  },
): Promise<IndividualProfileAIOutcome> {
  const now = deps.now ?? ((): Date => new Date());
  const systemPrompt = deps.systemPrompt ?? INDIVIDUAL_PROFILE_SYSTEM_PROMPT;
  const { formato } = args;

  // 1. Lock in-memory (§3.4).
  const acquired = tryAcquireLock(args.scoreId, formato, now().getTime());
  if (!acquired) {
    return { kind: 'skipped_locked', formato };
  }

  try {
    // 2. Le a linha; se o campo alvo ja esta preenchido, pula.
    const row = await getIndividualProfileScoreById(deps.db, args.scoreId);
    if (!row) {
      return { kind: 'skipped_score_not_found', formato };
    }
    const alvo = formato === 'resumo' ? row.resumoJson : row.expandidoJson;
    if (alvo !== null && alvo !== undefined) {
      return { kind: 'skipped_already_cached', formato };
    }

    // 3. Carrega contexto para o payload.
    const context = await deps.loadPayloadContext(deps.db, args.scoreId);
    if (context.confiabilidade.nivel !== 'alta' && context.confiabilidade.nivel !== 'moderada') {
      // §3.6 — confiabilidade baixa nunca chama IA.
      return { kind: 'skipped_confiabilidade_baixa', formato };
    }

    // 4. Compoe user prompt canonico §8.1 / §8.2.
    const userPrompt = composeIndividualProfileUserPrompt(
      context,
      row as unknown as ScoresRow,
      formato,
    );

    // 5. Superficie canonica de telemetria (§2.6).
    const surface: ClaudeCallSurface =
      formato === 'resumo' ? 'individualProfile_resumo' : 'individualProfile_expandido';

    // 6. Chama a IA via Facade DI.
    const result = await deps.claudeCallFacade.claudeCall({
      systemPrompt,
      userPrompt,
      maxTokens: INDIVIDUAL_PROFILE_AI_MAX_TOKENS,
      temperature: INDIVIDUAL_PROFILE_AI_TEMPERATURE,
      jsonExpected: true,
      telemetry: {
        companyId: args.companyId,
        surface,
        userId: args.triggeredByUserId,
        userType: args.triggeredByUserType,
      },
    });

    if (!result.ok) {
      // §2.2 — cache preservado NULL. §11.1 — mensagem canonica ao usuario.
      return {
        kind: 'failed_claude',
        formato,
        status: result.status,
        message: result.message,
      };
    }

    // 7. Persistencia canonica (§3.5) via setter com guarda IS NULL.
    const generatedAt = now();
    const affectedRows =
      formato === 'resumo'
        ? await setIndividualProfileResumoCache(
            deps.db,
            args.scoreId,
            result.parsedJson,
            generatedAt,
          )
        : await setIndividualProfileExpandidoCache(
            deps.db,
            args.scoreId,
            result.parsedJson,
            generatedAt,
          );

    return { kind: 'ok', formato, affectedRows };
  } finally {
    releaseLock(args.scoreId, formato);
  }
}

// ============================================================
// Facade fire-and-forget para o router
// ============================================================

/**
 * Loader canonico default do contexto do payload. Consulta o assessment
 * pai do score e resolve identificacao a partir do titular
 * (`employees` ou `cLevelMembers`).
 *
 * Confiabilidade: `alta` ou `moderada` a partir do proprio assessment.
 * `indices_com_alerta` / `dimensoes_afetadas` sao arrays vazios nesta
 * ME — o refinamento fino dessas listas (que exige acompanhar todos
 * os hedge points do motor deterministico) fica registrado como debito
 * canonico para ME futura de polimento do payload.
 */
export const defaultLoadPayloadContext: LoadPayloadContext = async (db, scoreId) => {
  // Import dinamico para nao acoplar o service ao schema/repos em ciclos
  // de teste puro. Consultas leves (por PK/UNIQUE).
  const { getIndividualProfileScoreById: getScore } = await import('./individualProfileScores');
  const { individualProfileAssessments, employees, cLevelMembers } =
    await import('../../db/schema');
  const { eq } = await import('drizzle-orm');

  const scoreRow = await getScore(db, scoreId);
  if (!scoreRow) {
    throw new Error(`defaultLoadPayloadContext: score ${scoreId} nao encontrado`);
  }

  const [assessment] = await db
    .select({
      confiabilidadeNivel: individualProfileAssessments.confiabilidadeNivel,
      enviadoEm: individualProfileAssessments.enviadoEm,
    })
    .from(individualProfileAssessments)
    .where(eq(individualProfileAssessments.id, scoreRow.assessmentId))
    .limit(1);

  const nivel: 'alta' | 'moderada' =
    assessment?.confiabilidadeNivel === 'alta' ? 'alta' : 'moderada';
  const dataAplicacao = assessment?.enviadoEm
    ? new Date(assessment.enviadoEm).toISOString().slice(0, 10)
    : '';

  let identificacao: IndividualProfileAIIdentificacao;
  if (scoreRow.userType === 'clevel') {
    const [row] = await db
      .select({
        name: cLevelMembers.name,
        cargo: cLevelMembers.cargo,
      })
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, scoreRow.userId))
      .limit(1);
    identificacao = {
      nome: row?.name ?? '',
      cargo: row?.cargo ?? '',
      nivel_hierarquico: 'estrategico',
      departamento: 'Alta lideranca',
      lider_direto: 'Nao se aplica',
      data_aplicacao: dataAplicacao,
    };
  } else {
    const [row] = await db
      .select({
        name: employees.name,
        descricaoCBO: employees.descricaoCBO,
        nivelHierarquico: employees.nivelHierarquico,
        departamento: employees.departamento,
      })
      .from(employees)
      .where(eq(employees.id, scoreRow.userId))
      .limit(1);
    identificacao = {
      nome: row?.name ?? '',
      cargo: row?.descricaoCBO ?? '',
      nivel_hierarquico:
        (row?.nivelHierarquico as 'operacional' | 'tatico' | 'estrategico') ?? 'operacional',
      departamento: row?.departamento ?? '',
      // Lider direto real exige JOIN com employeeLeaderHistory
      // ordenado por dataInicio DESC LIMIT 1; entrega minima nesta ME
      // com refinamento canonico registrado como D### para ME futura.
      lider_direto: '',
      data_aplicacao: dataAplicacao,
    };
  }

  return {
    identificacao,
    confiabilidade: {
      nivel,
      indices_com_alerta: [],
      dimensoes_afetadas: [],
    },
  };
};

/**
 * Factory canonica de conveniencia (S244). Instancia a Facade real com
 * o `db` recebido, `DEFAULT_CLAUDE_CALL_FACADE` e o loader canonico.
 * Consumida pelo `appRouter` via
 * `IndividualProfileRouterDeps.reportGenerationFactory`.
 */
export function createDefaultIndividualProfileReportGenerationFacade(
  db: RoipDatabase,
): IndividualProfileReportGenerationFacade {
  // Import lazy do wrapper canonico para preservar o padrao Facade DI
  // (S258) — o modulo `claudeCall.ts` exporta a facade default sem
  // efeitos colaterais alem de leitura de env-var, que so ocorre no
  // momento da chamada real.
  return makeIndividualProfileReportGenerationFacade({
    db,
    claudeCallFacade: DEFAULT_CLAUDE_CALL_FACADE,
    loadPayloadContext: defaultLoadPayloadContext,
  });
}

/**
 * Produz a Facade canonica consumida por
 * `individualProfile.getReport` (S244). `triggerReportGeneration` roda
 * fire-and-forget: dispara ambas as chamadas em paralelo (§3.4) e
 * retorna imediatamente. Falhas ficam nos logs de telemetria — o
 * campo alvo permanece NULL e uma nova visualizacao redispara.
 */
export function makeIndividualProfileReportGenerationFacade(
  deps: IndividualProfileAIDeps,
): IndividualProfileReportGenerationFacade {
  return {
    triggerReportGeneration: (args: TriggerReportGenerationArgs): Promise<void> => {
      const jobs: Array<Promise<IndividualProfileAIOutcome>> = [];
      if (args.gerarResumo) {
        jobs.push(
          runIndividualProfileAIGeneration(deps, {
            scoreId: args.scoreId,
            companyId: args.companyId,
            userType: args.userType,
            userId: args.userId,
            tentativa: args.tentativa,
            formato: 'resumo',
            triggeredByUserId: args.triggeredByUserId,
            triggeredByUserType: args.triggeredByUserType,
          }),
        );
      }
      if (args.gerarExpandido) {
        jobs.push(
          runIndividualProfileAIGeneration(deps, {
            scoreId: args.scoreId,
            companyId: args.companyId,
            userType: args.userType,
            userId: args.userId,
            tentativa: args.tentativa,
            formato: 'expandido',
            triggeredByUserId: args.triggeredByUserId,
            triggeredByUserType: args.triggeredByUserType,
          }),
        );
      }
      // Fire-and-forget canonico: o router nao espera as chamadas a
      // Claude API terminarem. Erros nao sobem ao consumidor.
      Promise.all(jobs).catch(() => {
        // Ja registrado em telemetria pelo `claudeCall`.
      });
      return Promise.resolve();
    },
  };
}
