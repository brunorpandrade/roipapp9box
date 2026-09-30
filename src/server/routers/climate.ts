// ROIP APP 9BOX — sub-router `climate` (ME-047).
//
// Decima-oitava ME do Bloco B3 — abre a superficie tRPC canonica do
// Bloco Clima e Engajamento (§9 do DOC 03), fecha o dominio de
// leitura publica do dashboard organizacional e reprocessamento
// administrativo. Nome canonico unico `climate` — o alias historico
// `climateEngagement` esta superado pelo §19.6 do DOC 03 e
// bloqueado pelo check-forbidden-terms.
//
// Procedures canonicas (§9.11 e §19.6):
//   - `climate.getClimateBlock` — leitura por (companyId, escopo,
//     escopoReferencia?, trimestre?). Escopo `'empresa'` ou
//     `'departamento'` (S174 canoniza bloqueio de `'equipe'` no
//     router — o Chat IA le direto do schema por F3B, canonizada em
//     DOC 04 §5.5). Sem `trimestre` explicito, retorna o trimestre
//     mais recente presente em `climateEngagementData`. Piso 3
//     canonico (§9.6, S158, S177): aplica na LEITURA — quando
//     `countCobertura < 3`, retorna scores nulos e bandeira
//     `dadosInsuficientes: true`; superficie de mensagem canonica
//     pertence a UI (DOC 05).
//   - `climate.recalculateAggregates` — reprocessamento MANUAL de
//     todos os escopos da empresa no trimestre. Exclusivo
//     `super_admin` (Bruno) — precedente S085 da ME-037 e S154 da
//     ME-046 (procs internas de cron expostas como super_admin).
//     Reusa `DEFAULT_CLIMATE_ENGINE` via DI Facade (S168). Fluxo
//     canonico do §9.10 usa hook do plenitude (S170) apos cada
//     gravacao de `scoreA`; esta proc serve como cabo de
//     reprocessamento administrativo (idempotente por construcao).
//
// Visibilidade canonica (§9.9):
//   - Bruno + RH puro + RH-Lider: escopos empresa e departamento.
//   - C-level em qualquer variacao (unico, multiplo
//     `acessoTotal=true`, multiplo `acessoTotal=false`): escopos
//     empresa e departamento (excecao §9.3 — C-level `acessoTotal=
//     false` continua vendo o Bloco Clima da empresa inteira).
//   - Lider puro (Cenario 1 e Cenario 2): FORBIDDEN. §9.9 literal
//     "Lider puro NAO ve o Bloco Clima".
//   - Colaborador puro: sem JWT administrativo (matriz DOC 02 §2.2)
//     — arquitetural, o guard aqui e defesa em profundidade.
//
// Convencoes canonicas herdadas:
//   - DI factory `createClimateRouter(deps)` (S168, S100/S144
//     estendido): `now` e `climateEngine` injetaveis; defaults reais
//     (`() => new Date()` e `DEFAULT_CLIMATE_ENGINE`). Testes
//     injetam `now` fixo e engine mock.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador nos testes de
//     integracao desta ME + acoplamento no `appRouter` em
//     `index.ts` (RV-13).
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes tRPC: `tests/integration/climate-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { cLevelMembers, climateEngagementData, employees } from '../../db/schema';
import { roleProcedure, router } from '../trpc';
import { assertUserCompanyScope } from '../../lib/scope/userCompanyScope';
import {
  type ClimateCalculationResult,
  type ClimateEngineFacade,
  DEFAULT_CLIMATE_ENGINE,
  NUM_QUESTOES_CLIMATE,
  PISO_RESPONDENTES_CLIMATE,
} from '../services/climateCalculationEngine';

// Reexporta o piso para consumo pelos testes e por superficies de
// leitura futuras (RV-13 exige chamador nomeado no boundary de
// palavra).
export { PISO_RESPONDENTES_CLIMATE };

// ============================================================
// Mensagens canonicas literais (S177 — testadas verbatim)
// ============================================================

/**
 * §2.4 (guard cruzado) — companyId fora do escopo do titular.
 * Reusa a mensagem canonica generica; a UI substitui por copy
 * apropriado.
 */
export const MSG_EMPRESA_FORA_DO_ESCOPO_CLIMATE = 'Empresa fora do escopo do titular.';

/**
 * §9.11 — trimestre com formato invalido. Cadencia canonica do
 * Clima e TRIMESTRAL (§9.7 — "trimestre em andamento"; §9.10 —
 * "trimestres com scoreA pendente"). Cobre Q1..Q4 (nao SEMESTRAL
 * como o Instrumento D — S156).
 */
export const MSG_TRIMESTRE_INVALIDO_CLIMATE =
  'Trimestre canônico deve seguir o formato YYYY-QN (N = 1..4).';

/**
 * ME-B2-01a.2 — Q4=A1 canoniza cascata silenciosa: o motor sobe
 * ao nivel hierarquico imediatamente acima quando o escopo pedido
 * tem <3 respondentes. Mensagem canonica agora aparece apenas
 * quando nem empresa atende ao piso (dadosDisponiveis=false).
 */
export const MSG_ESCOPO_EQUIPE_INDISPONIVEL =
  'Escopo equipe requer liderId + liderTipo (padrão XOR-no-caller).';

/**
 * §9.9 — Lider puro (Cenario 1 e 2) NAO ve o Bloco Clima literal
 * (regra explicita do DOC 03). Mensagem canonica devolvida como
 * TRPCError FORBIDDEN.
 */
export const MSG_LIDER_PURO_SEM_BLOCO_CLIMA = 'Bloco Clima indisponível para líderes puros.';

/**
 * ME-B2-01a.2 — Q1=A canoniza que C-level acessoTotal=false NAO
 * ve o Bloco Clima (supera §9.3 anterior). Alinha canonicamente
 * com o IQL (§8.7).
 */
export const MSG_CLIMATE_CLEVEL_ACESSO_TOTAL_REQUIRED =
  'C-level com acessoTotal=false não tem visibilidade sobre o Bloco Clima.';

/**
 * ME-B2-01a.2 — escopo='equipe' requer liderTipo canonico.
 */
export const MSG_CLIMATE_LIDER_TIPO_REQUIRED =
  'Escopo equipe requer liderTipo (employee ou clevel).';

/**
 * ME-B2-01a.2 — escopo='equipe' requer liderId canonico.
 */
export const MSG_CLIMATE_LIDER_ID_REQUIRED = 'Escopo equipe requer liderId numérico positivo.';

/**
 * §9.7 — quando nao ha nenhum trimestre fechado ainda. Retornado
 * como conteudo canonico do payload (`presente: false`), nao como
 * TRPCError — a UI decide o texto exibido (DOC 05).
 */
export const MSG_NENHUM_TRIMESTRE_DISPONIVEL_CLIMATE =
  'Nenhum trimestre disponível para o escopo consultado.';

/**
 * §9.6 (S177) — mensagem canonica para escopo abaixo do piso 3.
 * Retornada como conteudo canonico (`dadosInsuficientes: true`)
 * junto com scores nulos; a UI aplica badge canonica no lugar.
 */
export const MSG_PISO_3_INSUFICIENTE_CLIMATE =
  'Dados insuficientes: menos de 3 respondentes válidos.';

// ============================================================
// Schemas Zod canonicos
// ============================================================

/**
 * §9 combinado com §3.9 — trimestre canonico TRIMESTRAL: `YYYY-Q1`
 * a `YYYY-Q4`. Divergente do IQL (SEMESTRAL — S156) por design:
 * o Clima acompanha cada trimestre canonico do calendario, sem
 * agregacao semestral.
 */
export const TRIMESTRE_INPUT_SCHEMA_CLIMATE = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: MSG_TRIMESTRE_INVALIDO_CLIMATE,
});

/**
/**
 * Enum canonico de escopo aceito pelo router `getClimateBlock`
 * (ME-B2-01a.2 — S174 aposentada com Q4=A1 canonizado): passa a
 * aceitar `'empresa'`, `'departamento'` e `'equipe'`. Para escopo
 * `'equipe'`, o discriminador polimorfico e `liderId` + `liderTipo`
 * (padrao consolidado na ME-B2-01a.1.1).
 */
export const ESCOPO_ROUTER_SCHEMA_CLIMATE = z.enum(['empresa', 'departamento', 'equipe']);

/**
 * ME-B2-01a.2 — enum canonico do tipo de lider para escopo='equipe'.
 * Espelha bit-a-bit `AVALIADO_TIPO_SCHEMA_IQL` (§8.7 do IQL) e o
 * padrao XOR-no-caller da ME-B2-01a.1.1 (§4.6 developmentDialogs).
 */
export const LIDER_TIPO_SCHEMA_CLIMATE = z.enum(['employee', 'clevel']);

/**
 * §9.11 — payload canonico de `getClimateBlock`. Estendido na
 * ME-B2-01a.2 para suportar escopo='equipe' polimorfico:
 *   - escopo = 'empresa': `escopoReferencia`, `liderId`, `liderTipo`
 *     todos opcionais/null.
 *   - escopo = 'departamento': `escopoReferencia` obrigatorio
 *     (nome do departamento — enum de `employees.departamento`);
 *     `liderId`, `liderTipo` nullish.
 *   - escopo = 'equipe': `liderId` + `liderTipo` obrigatorios;
 *     `escopoReferencia` nullish.
 * A validacao fina fica no handler — o Zod fica leve e simetrico
 * com o IQL.
 */
export const GET_CLIMATE_BLOCK_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  escopo: ESCOPO_ROUTER_SCHEMA_CLIMATE,
  escopoReferencia: z.string().min(1).max(120).nullish(),
  liderId: z.number().int().positive().nullish(),
  liderTipo: LIDER_TIPO_SCHEMA_CLIMATE.nullish(),
  trimestre: TRIMESTRE_INPUT_SCHEMA_CLIMATE.optional(),
});

/**
 * §9.11 — payload canonico de `recalculateAggregates`. Exclusivo
 * super_admin (S175); reprocessa TODOS os escopos vigentes.
 */
export const RECALCULATE_CLIMATE_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  trimestre: TRIMESTRE_INPUT_SCHEMA_CLIMATE,
});

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/**
 * §9.11 — resultado canonico de `getClimateBlock`. Discrimina:
 *   - `presente = true`: linha existe em `climateEngagementData`
 *     para (companyId, escopo, departamento, trimestre); campos
 *     de nota carregam o valor calculado (ou null quando o piso
 *     de 3 respondentes nao e atingido).
 *   - `presente = false`: sem linha (nenhum trimestre disponivel
 *     ou escopo sem historico).
 *
 * `dadosInsuficientes = true` sinaliza a UI para substituir os
 * gauges e barras pela badge canonica "Dados insuficientes" (§9.6,
 * S177 — texto fica na UI).
 *
 * `notasQuestao` sempre tem 20 posicoes (indices 0..19 mapeando
 * `notaQuestao01..20` — convencao (dimensao-1)*5+itemIndex).
 */
export interface GetClimateBlockResult {
  companyId: number;
  escopo: 'empresa' | 'departamento' | 'equipe';
  escopoReferencia: string | null;
  liderId: number | null;
  liderTipo: 'employee' | 'clevel' | null;
  /**
   * ME-B2-01a.2 — escopo canonicamente EFETIVO onde a linha foi
   * encontrada apos cascata silenciosa (Q4=A1). Pode divergir do
   * escopo requisitado quando o escopo pedido tinha
   * `countCobertura < 3` (S158, §9.6) — nesse caso, sobe ao nivel
   * hierarquico imediatamente acima: equipe -> departamento ->
   * empresa. Quando nao ha divergencia, coincide bit-a-bit com
   * (escopo, escopoReferencia, liderId, liderTipo).
   */
  escopoEfetivo: {
    escopo: 'empresa' | 'departamento' | 'equipe';
    escopoReferencia: string | null;
    liderId: number | null;
    liderTipo: 'employee' | 'clevel' | null;
  };
  /**
   * ME-B2-01a.2 — rotulo canonico da agregacao (cascata) que gerou
   * a linha efetiva. Null quando escopo efetivo == escopo
   * requisitado (nao houve cascata). Valores canonicos:
   *   - `'agregado_departamento'`: cascata da equipe para o
   *     departamento do lider.
   *   - `'agregado_empresa'`: cascata para empresa.
   */
  notaAgregacao: string | null;
  /**
   * ME-B2-01a.2 — `true` quando algum nivel da cascata tem dados
   * canonicos utilizaveis (`countCobertura >= 3`). `false` quando
   * nem empresa atende ao piso — nesse caso, todos os campos de
   * nota sao null e a UI mostra "Bloco indisponivel" (§9.6 literal).
   */
  dadosDisponiveis: boolean;
  trimestre: string | null;
  presente: boolean;
  dadosInsuficientes: boolean;
  notaClima: number | null;
  adesao: number | null;
  countCobertura: number;
  countTotal: number;
  notaEngajamento: number | null;
  notaDesenvolvimento: number | null;
  notaPertencimento: number | null;
  notaRealizacao: number | null;
  notasQuestao: readonly (number | null)[];
}

/** §9.11 — resultado canonico de `recalculateAggregates`. */
export type RecalculateClimateResult = ClimateCalculationResult;

// ============================================================
// Dependencias injetaveis (S168, S144 estendido)
// ============================================================

/**
 * Relogio + motor Clima injetaveis (S168). Padrao S100/S144
 * estendido: producao usa defaults reais; testes injetam mocks
 * deterministicos.
 */
export interface ClimateRouterDeps {
  now?: () => Date;
  climateEngine?: ClimateEngineFacade;
}

interface ResolvedDepsClimate {
  now: () => Date;
  climateEngine: ClimateEngineFacade;
}

function resolveDepsClimate(deps: ClimateRouterDeps): ResolvedDepsClimate {
  return {
    now: deps.now ?? (() => new Date()),
    climateEngine: deps.climateEngine ?? DEFAULT_CLIMATE_ENGINE,
  };
}

// ============================================================
// Helpers de leitura canonica
// ============================================================

/**
 * Converte uma linha crua de `climateEngagementData` no formato
 * canonico do payload `GetClimateBlockResult`. Aplica piso 3
 * canonico (S158, S177): quando `countCobertura < 3`, todos os
 * campos de nota sao mascarados (null) e `dadosInsuficientes` fica
 * `true`.
 */
function rowToBlockResult(
  input: {
    companyId: number;
    escopo: 'empresa' | 'departamento' | 'equipe';
    escopoReferencia: string | null;
    liderId: number | null;
    liderTipo: 'employee' | 'clevel' | null;
    escopoEfetivo: {
      escopo: 'empresa' | 'departamento' | 'equipe';
      escopoReferencia: string | null;
      liderId: number | null;
      liderTipo: 'employee' | 'clevel' | null;
    };
    notaAgregacao: string | null;
  },
  row: typeof climateEngagementData.$inferSelect,
): GetClimateBlockResult {
  const dadosInsuficientes = row.countCobertura < PISO_RESPONDENTES_CLIMATE;
  const notasQuestao: (number | null)[] = [
    row.notaQuestao01,
    row.notaQuestao02,
    row.notaQuestao03,
    row.notaQuestao04,
    row.notaQuestao05,
    row.notaQuestao06,
    row.notaQuestao07,
    row.notaQuestao08,
    row.notaQuestao09,
    row.notaQuestao10,
    row.notaQuestao11,
    row.notaQuestao12,
    row.notaQuestao13,
    row.notaQuestao14,
    row.notaQuestao15,
    row.notaQuestao16,
    row.notaQuestao17,
    row.notaQuestao18,
    row.notaQuestao19,
    row.notaQuestao20,
  ].map((v) => (v === null ? null : Number(v)));

  const mascara = (v: unknown): number | null => (dadosInsuficientes ? null : (v as number | null));

  return {
    companyId: input.companyId,
    escopo: input.escopo,
    escopoReferencia: input.escopoReferencia,
    liderId: input.liderId,
    liderTipo: input.liderTipo,
    escopoEfetivo: input.escopoEfetivo,
    notaAgregacao: input.notaAgregacao,
    dadosDisponiveis: !dadosInsuficientes,
    trimestre: row.trimestre,
    presente: true,
    dadosInsuficientes,
    notaClima: mascara(row.notaClima === null ? null : Number(row.notaClima)),
    adesao: row.adesao === null ? null : Number(row.adesao),
    countCobertura: row.countCobertura,
    countTotal: row.countTotal,
    notaEngajamento: mascara(row.notaEngajamento === null ? null : Number(row.notaEngajamento)),
    notaDesenvolvimento: mascara(
      row.notaDesenvolvimento === null ? null : Number(row.notaDesenvolvimento),
    ),
    notaPertencimento: mascara(
      row.notaPertencimento === null ? null : Number(row.notaPertencimento),
    ),
    notaRealizacao: mascara(row.notaRealizacao === null ? null : Number(row.notaRealizacao)),
    notasQuestao: dadosInsuficientes
      ? Array.from({ length: NUM_QUESTOES_CLIMATE }, () => null)
      : notasQuestao,
  };
}

/**
 * Payload canonico quando NAO ha linha em `climateEngagementData`
 * para o escopo/trimestre requisitado — usado no fluxo "sem
 * trimestre explicito e sem historico" e "escopo+departamento sem
 * historico". Zera contagens; `presente: false`. ME-B2-01a.2 estende
 * com novos campos canonicos (escopoEfetivo == escopo requisitado
 * quando nao houve cascata; dadosDisponiveis=false).
 */
function emptyBlockResult(input: {
  companyId: number;
  escopo: 'empresa' | 'departamento' | 'equipe';
  escopoReferencia: string | null;
  liderId: number | null;
  liderTipo: 'employee' | 'clevel' | null;
  trimestre: string | null;
}): GetClimateBlockResult {
  return {
    companyId: input.companyId,
    escopo: input.escopo,
    escopoReferencia: input.escopoReferencia,
    liderId: input.liderId,
    liderTipo: input.liderTipo,
    escopoEfetivo: {
      escopo: input.escopo,
      escopoReferencia: input.escopoReferencia,
      liderId: input.liderId,
      liderTipo: input.liderTipo,
    },
    notaAgregacao: null,
    dadosDisponiveis: false,
    trimestre: input.trimestre,
    presente: false,
    dadosInsuficientes: true,
    notaClima: null,
    adesao: null,
    countCobertura: 0,
    countTotal: 0,
    notaEngajamento: null,
    notaDesenvolvimento: null,
    notaPertencimento: null,
    notaRealizacao: null,
    notasQuestao: Array.from({ length: NUM_QUESTOES_CLIMATE }, () => null),
  };
}

// ============================================================
// ME-B2-01a.2 — helpers canonicos da cascata silenciosa
// ============================================================

/**
 * ME-B2-01a.2 — resolve o departamento canonico do lider da
 * cadeia para cascata silenciosa. Consulta `employees.departamento`
 * para lider employee ou `cLevelMembers.departamento` para C-level.
 * Retorna `null` quando o lider nao existe.
 */
async function resolveLiderDepartamento(
  db: import('../../db/client').RoipDatabase,
  companyId: number,
  liderId: number,
  liderTipo: 'employee' | 'clevel',
): Promise<string | null> {
  if (liderTipo === 'employee') {
    const [row] = await db
      .select({ departamento: employees.departamento })
      .from(employees)
      .where(and(eq(employees.id, liderId), eq(employees.companyId, companyId)))
      .limit(1);
    return row?.departamento ?? null;
  }
  const [row] = await db
    .select({ departamento: cLevelMembers.departamento })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.id, liderId), eq(cLevelMembers.companyId, companyId)))
    .limit(1);
  return row?.departamento ?? null;
}

/**
 * ME-B2-01a.2 — resolve o `acessoTotal` do C-level ativo na
 * empresa. Espelha bit-a-bit `resolveClevelAcessoTotal` do IQL
 * (§8.7). Retorna `null` quando o C-level nao existe ou nao
 * pertence a `companyId` — o handler ja tratou como escopo
 * cruzado antes via `assertUserCompanyScope`.
 */
async function resolveAcessoTotalClimate(
  db: import('../../db/client').RoipDatabase,
  companyId: number,
  clevelId: number,
): Promise<boolean | null> {
  const [row] = await db
    .select({ acessoTotal: cLevelMembers.acessoTotal })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.id, clevelId), eq(cLevelMembers.companyId, companyId)))
    .limit(1);
  if (!row) {
    return null;
  }
  return row.acessoTotal ?? false;
}

/**
 * ME-B2-01a.2 — SELECT canonico NULL-safe de `climateEngagementData`
 * por (companyId, escopo, departamento, liderId|clevelId, trimestre).
 *
 * Espelha bit-a-bit a chave logica canonica do grid S176 estendido
 * (§8.9 + ME-B2-01a.1.1 polimorfia): quando o discriminador (liderId
 * OU clevelId, mapeado por `liderTipo`) esta ausente, aplica-se
 * `isNull` explicito (padrao S172b do motor `recalculateAggregates`).
 *
 * Convencoes canonicas por escopo (grid S176 estendido):
 *   - `'empresa'`: departamento IS NULL AND liderId IS NULL AND
 *     clevelId IS NULL.
 *   - `'departamento'`: departamento = X AND liderId IS NULL AND
 *     clevelId IS NULL.
 *   - `'equipe'` + `liderTipo='employee'`: departamento IS NULL AND
 *     liderId = X AND clevelId IS NULL.
 *   - `'equipe'` + `liderTipo='clevel'`: departamento IS NULL AND
 *     liderId IS NULL AND clevelId = X.
 *
 * Retorna `null` quando nao ha linha canonica — sinaliza para a
 * cascata silenciosa (§9.6, Q4=A1) subir ao nivel seguinte.
 */
async function selectClimateRow(
  db: import('../../db/client').RoipDatabase,
  companyId: number,
  nivel: {
    escopo: 'empresa' | 'departamento' | 'equipe';
    escopoReferencia: string | null;
    liderId: number | null;
    liderTipo: 'employee' | 'clevel' | null;
  },
  trimestre: string,
): Promise<typeof climateEngagementData.$inferSelect | null> {
  const filtros = [
    eq(climateEngagementData.companyId, companyId),
    eq(climateEngagementData.escopo, nivel.escopo),
    eq(climateEngagementData.trimestre, trimestre),
  ];

  if (nivel.escopo === 'empresa') {
    filtros.push(isNull(climateEngagementData.departamento));
    filtros.push(isNull(climateEngagementData.liderId));
    filtros.push(isNull(climateEngagementData.clevelId));
  } else if (nivel.escopo === 'departamento') {
    if (nivel.escopoReferencia === null) {
      return null;
    }
    filtros.push(eq(climateEngagementData.departamento, nivel.escopoReferencia));
    filtros.push(isNull(climateEngagementData.liderId));
    filtros.push(isNull(climateEngagementData.clevelId));
  } else {
    // escopo === 'equipe' — polimorfia liderId XOR clevelId.
    if (nivel.liderId === null || nivel.liderTipo === null) {
      return null;
    }
    filtros.push(isNull(climateEngagementData.departamento));
    if (nivel.liderTipo === 'employee') {
      filtros.push(eq(climateEngagementData.liderId, nivel.liderId));
      filtros.push(isNull(climateEngagementData.clevelId));
    } else {
      filtros.push(isNull(climateEngagementData.liderId));
      filtros.push(eq(climateEngagementData.clevelId, nivel.liderId));
    }
  }

  const [row] = await db
    .select()
    .from(climateEngagementData)
    .where(and(...filtros))
    .limit(1);
  return row ?? null;
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `climate` com dependencias injetadas (S168).
 * Producao chama sem argumentos — defaults reais para `now` e
 * `climateEngine`. Testes injetam `now` fixo e engine mock para
 * determinismo e assertividade de acoplamento.
 */
export function createClimateRouter(deps: ClimateRouterDeps = {}) {
  const resolved = resolveDepsClimate(deps);

  return router({
    /**
     * §9.11 primeira linha + §19.6 primeira linha — leitura do
     * Bloco Clima para (companyId, escopo, escopoReferencia?,
     * trimestre?). Escopo `'empresa'` ou `'departamento'` (S174).
     *
     * Autorizacao canonica (§9.9):
     *   - Bruno + RH puro + RH-Lider + C-level: acesso.
     *   - Lider puro: FORBIDDEN literal (§9.9). O guard de perfil
     *     `roleProcedure(['super_admin','rh','rh_lider','clevel'])`
     *     ja bloqueia — Lider puro (`role === 'lider'`) recebe
     *     FORBIDDEN generico do middleware. Simetria com IQL: la
     *     Lider aparece no gate por causa da Tabela IQL Cenario 2;
     *     aqui nao ha caminho legitimo para Lider.
     *   - Colaborador puro: arquitetural (sem JWT administrativo).
     *
     * Fluxo canonico:
     *   1. Guard cross-company (§2.4).
     *   2. Validacao fina de `escopoReferencia` por escopo.
     *   3. Resolucao do trimestre efetivo (dado explicito OU MAX
     *      canonico presente na tabela).
     *   4. SELECT canonico por chave completa
     *      (companyId, escopo, departamento, liderId=null,
     *      trimestre).
     *   5. Piso 3 (§9.6, S158) aplicado por `rowToBlockResult`.
     */
    getClimateBlock: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(GET_CLIMATE_BLOCK_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<GetClimateBlockResult> => {
        // §2.4 — guard cruzado companyId (super_admin atravessa).
        assertUserCompanyScope(ctx.user, input.companyId, MSG_EMPRESA_FORA_DO_ESCOPO_CLIMATE);

        const escopoReferencia = input.escopoReferencia ?? null;
        const liderId = input.liderId ?? null;
        const liderTipo = input.liderTipo ?? null;

        // ME-B2-01a.2 — Q1=A canoniza: C-level acessoTotal=false NAO
        // ve o Bloco Clima. Supera §9.3 anterior; alinha com o IQL.
        if (ctx.user.role === 'clevel') {
          const acessoTotal = await resolveAcessoTotalClimate(
            ctx.db,
            input.companyId,
            ctx.user.userId,
          );
          if (acessoTotal !== true) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: MSG_CLIMATE_CLEVEL_ACESSO_TOTAL_REQUIRED,
            });
          }
        }

        // Validacao fina do input por escopo (ME-B2-01a.2 estende).
        if (input.escopo === 'departamento' && escopoReferencia === null) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Escopo departamento requer escopoReferencia (nome do departamento).',
          });
        }
        if (input.escopo === 'equipe') {
          if (liderId === null) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_CLIMATE_LIDER_ID_REQUIRED });
          }
          if (liderTipo === null) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_CLIMATE_LIDER_TIPO_REQUIRED });
          }
        }

        // Resolucao do trimestre efetivo (MAX canonico do escopo
        // requisitado — padrao S177 "trimestre fechado mais recente").
        // ME-B2-01a.2: resolucao usa o escopo requisitado; a cascata
        // silenciosa aplica-se dentro do MESMO trimestre resolvido.
        let trimestreResolvido: string | null = input.trimestre ?? null;
        if (trimestreResolvido === null) {
          const [maxRow] = await ctx.db
            .select({ trimestre: climateEngagementData.trimestre })
            .from(climateEngagementData)
            .where(
              and(
                eq(climateEngagementData.companyId, input.companyId),
                eq(climateEngagementData.escopo, input.escopo),
              ),
            )
            .orderBy(desc(climateEngagementData.trimestre))
            .limit(1);
          if (maxRow) {
            trimestreResolvido = maxRow.trimestre;
          }
        }

        // Fallback canonico: sem trimestre para o escopo requisitado,
        // tenta MAX(trimestre) do escopo empresa (grid canonico S176
        // garante que sempre ha empresa quando ha qualquer agregado).
        if (trimestreResolvido === null) {
          const [maxEmpresa] = await ctx.db
            .select({ trimestre: climateEngagementData.trimestre })
            .from(climateEngagementData)
            .where(
              and(
                eq(climateEngagementData.companyId, input.companyId),
                eq(climateEngagementData.escopo, 'empresa'),
              ),
            )
            .orderBy(desc(climateEngagementData.trimestre))
            .limit(1);
          if (maxEmpresa) {
            trimestreResolvido = maxEmpresa.trimestre;
          }
        }

        if (trimestreResolvido === null) {
          return emptyBlockResult({
            companyId: input.companyId,
            escopo: input.escopo,
            escopoReferencia,
            liderId,
            liderTipo,
            trimestre: null,
          });
        }

        // ME-B2-01a.2 — cascata silenciosa canonica (Q4=A1).
        //
        // Algoritmo canonico:
        //   1. Tenta o escopo requisitado. Se `countCobertura >= 3`
        //      retorna esse nivel (nenhuma agregacao).
        //   2. Escopo='equipe' abaixo do piso: cascata para
        //      escopo='departamento' do lider (resolvido via
        //      `resolveLiderDepartamento`). notaAgregacao =
        //      'agregado_departamento'.
        //   3. Escopo='departamento' abaixo do piso (ou apos cascata
        //      da equipe): cascata para escopo='empresa'.
        //      notaAgregacao = 'agregado_empresa'.
        //   4. Escopo='empresa' abaixo do piso: `dadosDisponiveis=
        //      false` — nem empresa atende ao piso canonico (§9.6).
        //
        // Estrategia canonica: encadear tentativas em ordem
        // hierarquica; a primeira linha com `countCobertura >= 3`
        // (ou a ultima quando nada bate) determina o resultado.
        type Nivel = {
          escopo: 'empresa' | 'departamento' | 'equipe';
          escopoReferencia: string | null;
          liderId: number | null;
          liderTipo: 'employee' | 'clevel' | null;
          notaAgregacao: string | null;
        };

        const cascata: Nivel[] = [];
        cascata.push({
          escopo: input.escopo,
          escopoReferencia,
          liderId,
          liderTipo,
          notaAgregacao: null,
        });

        if (input.escopo === 'equipe' && liderId !== null && liderTipo !== null) {
          const departamentoLider = await resolveLiderDepartamento(
            ctx.db,
            input.companyId,
            liderId,
            liderTipo,
          );
          if (departamentoLider !== null) {
            cascata.push({
              escopo: 'departamento',
              escopoReferencia: departamentoLider,
              liderId: null,
              liderTipo: null,
              notaAgregacao: 'agregado_departamento',
            });
          }
        }

        if (input.escopo === 'departamento' || input.escopo === 'equipe') {
          cascata.push({
            escopo: 'empresa',
            escopoReferencia: null,
            liderId: null,
            liderTipo: null,
            notaAgregacao: 'agregado_empresa',
          });
        }

        // Iteracao canonica: primeira linha com `countCobertura >= 3`
        // determina o resultado. Se nenhuma bate, usa a ultima
        // tentativa (empresa) com `dadosDisponiveis=false`.
        let escolhida: {
          nivel: Nivel;
          row: typeof climateEngagementData.$inferSelect | null;
        } | null = null;

        for (const nivel of cascata) {
          const rowNivel = await selectClimateRow(
            ctx.db,
            input.companyId,
            nivel,
            trimestreResolvido,
          );
          if (escolhida === null) {
            escolhida = { nivel, row: rowNivel };
          }
          if (rowNivel !== null && rowNivel.countCobertura >= PISO_RESPONDENTES_CLIMATE) {
            escolhida = { nivel, row: rowNivel };
            break;
          }
        }

        if (escolhida === null || escolhida.row === null) {
          return emptyBlockResult({
            companyId: input.companyId,
            escopo: input.escopo,
            escopoReferencia,
            liderId,
            liderTipo,
            trimestre: trimestreResolvido,
          });
        }

        return rowToBlockResult(
          {
            companyId: input.companyId,
            escopo: input.escopo,
            escopoReferencia,
            liderId,
            liderTipo,
            escopoEfetivo: {
              escopo: escolhida.nivel.escopo,
              escopoReferencia: escolhida.nivel.escopoReferencia,
              liderId: escolhida.nivel.liderId,
              liderTipo: escolhida.nivel.liderTipo,
            },
            notaAgregacao: escolhida.nivel.notaAgregacao,
          },
          escolhida.row,
        );
      }),

    /**
     * §9.11 segunda linha + §19.6 segunda linha — reprocessamento
     * MANUAL de todos os escopos vigentes da empresa no trimestre.
     * Exclusivo `super_admin` (Bruno). S175 canonizada:
     * paralelismo com `iql.calculateIQL` e
     * `plenitude.calculatePlenitudeScore` (§19.4 "internas").
     *
     * Fluxo normal do Clima usa hook do `plenitudeCalculationEngine`
     * (S170) apos cada gravacao de `scoreA` completo — esta proc
     * serve como cabo de reprocessamento administrativo. Idempotente
     * por construcao (§9.10 canoniza "job idempotente").
     */
    recalculateAggregates: roleProcedure(['super_admin'])
      .input(RECALCULATE_CLIMATE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<RecalculateClimateResult> => {
        const now = resolved.now();
        return await resolved.climateEngine.recalculateAggregates(
          ctx.db,
          input.companyId,
          input.trimestre,
          now,
        );
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type ClimateRouter = ReturnType<typeof createClimateRouter>;
