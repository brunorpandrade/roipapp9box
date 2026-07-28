// ROIP APP 9BOX — motor canonico do Radar NR-1 (ME-049cd).
//
// Vigesima-sexta ME de codigo do Bloco B3. Implementa integralmente o
// motor deterministico do DOC 03 §11.2-§11.15: transicao
// `agendado -> aberto` com snapshot de elegiveis (§11.2), controles
// anti-fraude silenciosos (§11.5), formulas de score por fator (§11.6),
// piso de amostra e agregacao deterministica (§11.7), semaforo (§11.8),
// analise de convergencia/divergencia (§11.9), identificacao do
// departamento em situacao critica (§11.10), gauge de adesao (§11.11),
// alertas informativos por fator (§11.13) e notificacoes no sino
// (§11.14), com a transicao `aberto -> fechado` fechando a transacao.
//
// Motor puro no sentido canonico do §19.13: `now` sempre parametro
// explicito, nunca `new Date()` interno; dependencias externas por
// injecao. Chamadores desta ME: `nr1.closeCycle` (proc `super_admin`
// transitoria, S216/S208) para o fechamento, e os testes de integracao
// para a abertura — o `runDailyInstrumentStatusJob` do Bloco B6
// (DOC 06 §16.1) reusa as duas funcoes sem edita-las.
//
// DECISOES CANONICAS APLICADAS NESTA ME (aprovadas por Bruno em 28/07):
//
//   - S237 (estreita S216). A transicao `agendado -> aberto` NAO ganha
//     proc tRPC. DOC 03 §19.8 e DOC 00 §12.9 enumeram exatamente 8
//     procs do dominio `nr1` e nenhuma delas abre ciclo; criar uma nona
//     contrariaria o canonico, que prevalece sobre S### (RV-09).
//     Precedente executado: o `cycleScheduleEngine` da ME-030 nasceu
//     como motor puro sem resolver tRPC (§19.13). `closeNr1Cycle`
//     mantem a proc `super_admin` porque `nr1.closeCycle` E nome
//     canonico do §19.8.
//   - S238 (aplica S209 ao valor de `metadados.trimestre`). Os ciclos
//     do Radar NR-1 sao LIVRES (§11.1, DOC 00 §402/§709) e nao tem
//     trimestre proprio, mas DOC 03 §11.13 e DOC 06 §4.6 exigem a chave
//     `trimestre` no formato `{YYYY-QN}` no snapshot de `alerts`. O
//     valor canonizado e o trimestre DERIVADO de
//     `copsoqCycles.dataAbertura` — mesmo campo que define a identidade
//     do ciclo (`copsoqCycles.ciclo` e a `dataAbertura` em
//     'YYYY-MM-DD', DOC 01 §11.1). Preserva o formato declarado sem
//     inventar cadencia.
//   - S239. C-level NAO participa do Radar NR-1 — restricao
//     ARQUITETURAL, nao regra de negocio. DOC 01 §11.2 e §11.3 declaram
//     `copsoqCycleSnapshot.employeeId` e `copsoq_responses.employeeId`
//     como `INT NOT NULL` com FK para `employees.id`, e C-level vive em
//     `cLevelMembers` sem linha em `employees`. Precedente literal:
//     ME-046, §8.6 Bloqueio 3 do Instrumento D, mesma forma de FK.
//     Consequencia: PC1d (§11.16) fica satisfeita por vacuidade no
//     `getCollectionStatus` — nao ha C-level a omitir da listagem
//     nominal nem a somar ao agregado. Debito D057 registrado: se o
//     DOC 01 ganhar coluna `clevelId` nas duas tabelas, §11.2 e §11.16
//     voltam a ser materiais e esta decisao e reaberta.
//
// DERIVACOES CANONICAS DOCUMENTADAS (o canonico e silente; a regra
// abaixo e a unica leitura deterministica compativel com o schema):
//
//   - Escopo das notificacoes. §11.14 fala em campos discriminadores
//     `escopo` e `escopoDepartamentoId` em `notifications`, mas o
//     DOC 01 nao declara essas colunas nessa tabela (declara em
//     `alerts`). Como o DOC 01 e fonte unica do schema, o escopo de
//     cada notificacao e rastreado por `notifications.alertId` -> linha
//     de `alerts`, que carrega `escopo` e `escopoDepartamentoId`. E o
//     que §11.14 exige ao canonizar que o `alertId` e populado dentro
//     da transacao.
//   - Linha de `alerts` para `nr1_ciclo_fechado`. §11.13 regula apenas
//     o alerta de fator; DOC 06 §3.1.2 lista `nr1_ciclo_fechado` na
//     taxonomia de `alerts.tipo` e §8.10 exige `alertId` de linha ja
//     gravada. Grava-se UMA linha por ciclo, escopo empresa.
//   - Destinatario Bruno. §11.14 pede "1 linha por Super Admin ativo",
//     mas `superAdmins` nao tem coluna `status` e `notifications` nao
//     tem FK para `superAdmins` (so `destinatarioEmployeeId` ->
//     `employees`). Grava-se UMA linha com `destinatarioTipo='bruno'` e
//     `destinatarioEmployeeId = null` — a caixa de Bruno e resolvida
//     pelo discriminante, nao por FK.
//   - Desempate da agregacao (§11.7). O algoritmo ordena por contagem
//     crescente; empate desempata por `departamentoId` ascendente, para
//     que a saida seja identica em toda reexecucao.
//   - Agregacoes nao geram alerta de fator. `alerts.escopo` e o enum
//     ('empresa','departamento','colaborador') — nao ha valor para
//     agregacao, e §11.13 fala em "escopo empresa OU escopo
//     departamento". Agregacoes entram em `copsoqFactorScores` e em
//     `nr1AreaDivergenceAnalysis`, nunca em `alerts`.
//   - Departamento critico (§11.10) considera apenas escopos
//     'departamento'. `copsoqCycles.departamentoCriticoDepartamentoId`
//     e FK para `departments.id`; agregacao nao tem id proprio.
//
// Convencoes canonicas herdadas:
//   - Facade DI (S205): `Nr1AlertFacade` + `DEFAULT_NR1_ALERT_FACADE`
//     no-op. O motor de alertas do DOC 06 §8 (Bloco B6) substitui o
//     default sem editar este motor (S217).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador fora deste diretorio
//     (RV-13).

import { and, eq, inArray } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  alerts,
  companies,
  copsoqCycles,
  copsoqCycleSnapshot,
  copsoqFactorScores,
  copsoq_responses,
  departments,
  employees,
  notifications,
  nr1AreaDivergenceAnalysis,
} from '../../db/schema';
import {
  formatTrimestreCicloReferencia,
  getDayInTimezone,
  getMonthInTimezone,
  getTrimestreFromMonth,
  getYearInTimezone,
} from '../../lib/cycleDates';

// ============================================================
// Constantes canonicas
// ============================================================

/** §11.6 — 8 fatores psicossociais canonicos. */
export const NUM_FATORES_NR1 = 8;

/** §11.4 — 4 itens por fator. */
export const NUM_ITENS_POR_FATOR_NR1 = 4;

/** §11.4 — 32 itens no total (8 x 4). */
export const NUM_ITENS_TOTAL_NR1 = NUM_FATORES_NR1 * NUM_ITENS_POR_FATOR_NR1;

/** §11.4 — escala canonica 0-4 (0 Nunca .. 4 Sempre). */
export const VALOR_MINIMO_NR1 = 0;

/** §11.4 — limite superior da escala canonica. */
export const VALOR_MAXIMO_NR1 = 4;

/** §11.6 — soma bruta maxima por fator (4 itens x valor 4). */
export const SOMA_BRUTA_MAXIMA_NR1 = NUM_ITENS_POR_FATOR_NR1 * VALOR_MAXIMO_NR1;

/** §11.7 — piso minimo de respondentes efetivos validos por escopo. */
export const PISO_AMOSTRA_NR1 = 5;

/** §11.5 — corte do controle anti-fraude "tempo baixo", em segundos. */
export const TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1 = 180;

/** §11.13 — score abaixo do qual o fator gera alerta informativo. */
export const SCORE_FATOR_CRITICO_NR1 = 50;

/** §11.9 — banda de convergencia em pontos absolutos. */
export const BANDA_CONVERGENCIA_NR1 = 10;

/** §11.2 — janela minima obrigatoria entre abertura e fechamento. */
export const JANELA_MINIMA_CICLO_DIAS_NR1 = 30;

/** §11.15 — limiar do aviso de empresa pequena na configuracao. */
export const AVISO_COLABORADORES_MINIMO_NR1 = 5;

/** §11.6 — natureza do fator; define a direcao da formula de score. */
export type TipoFatorNr1 = 'risco' | 'recurso';

/** Descritor canonico de um fator do §11.6. */
export interface FatorNr1 {
  id: number;
  nome: string;
  tipo: TipoFatorNr1;
}

/**
 * §11.6 — tabela canonica dos 8 fatores, na ordem e com os nomes
 * literais do DOC 03. Itens globais derivam da posicao:
 * `item = (fator - 1) * 4 + itemIndex` (DOC 01 §11.3).
 */
export const FATORES_NR1: readonly FatorNr1[] = [
  { id: 1, nome: 'Exigências quantitativas', tipo: 'risco' },
  { id: 2, nome: 'Ritmo de trabalho', tipo: 'risco' },
  { id: 3, nome: 'Conflitos de papel', tipo: 'risco' },
  { id: 4, nome: 'Autonomia', tipo: 'recurso' },
  { id: 5, nome: 'Suporte social do líder', tipo: 'recurso' },
  { id: 6, nome: 'Suporte social de colegas', tipo: 'recurso' },
  { id: 7, nome: 'Insegurança no trabalho', tipo: 'risco' },
  { id: 8, nome: 'Saúde geral autopercebida', tipo: 'recurso' },
] as const;

/** Resolve o descritor de um fator pelo id (1..8). */
export function getFatorNr1(id: number): FatorNr1 | undefined {
  return FATORES_NR1.find((f) => f.id === id);
}

/** §11.8 — faixas canonicas do semaforo dos 8 fatores. */
export type SemaforoNr1 = 'vermelho' | 'amarelo' | 'verde';

/**
 * §11.8 — vermelho 0..49, amarelo 50..65, verde 66..100. Aplicado
 * sobre o score ja calculado.
 */
export function semaforoFatorNr1(score: number): SemaforoNr1 {
  if (score < 50) return 'vermelho';
  if (score <= 65) return 'amarelo';
  return 'verde';
}

// ============================================================
// Formulas deterministicas puras (§11.5-§11.11)
// ============================================================

/** Arredonda para 2 casas — precisao de `copsoqFactorScores.score`. */
function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * §11.6 — converte a media bruta de um fator (0..16) em score 0..100.
 * Fator de recurso: `(media / 16) * 100`. Fator de risco:
 * `100 - ((media / 16) * 100)`. Score mais alto sempre indica melhor
 * condicao psicossocial.
 */
export function scoreFatorNr1(mediaBruta: number, tipo: TipoFatorNr1): number {
  const proporcao = (mediaBruta / SOMA_BRUTA_MAXIMA_NR1) * 100;
  return round2(tipo === 'recurso' ? proporcao : 100 - proporcao);
}

/**
 * §11.5 — controle de uniformidade: resposta em que todos os 32 itens
 * carregam o mesmo valor. Lista vazia nao e uniforme (nao ha resposta).
 */
export function respostasUniformesNr1(valores: readonly number[]): boolean {
  if (valores.length === 0) return false;
  const primeiro = valores[0];
  return valores.every((v) => v === primeiro);
}

/** Item de resposta na forma canonica do §11.4 (fator, item, valor). */
export interface ItemRespostaNr1 {
  fator: number;
  itemIndex: number;
  valor: number;
}

/**
 * §11.4 — confere se a lista cobre EXATAMENTE o grid canonico: os 8
 * fatores x 4 itens, sem faltas, sem repeticoes e sem excedentes. A
 * escala 0-4 ja e validada na normalizacao do corpo da requisicao; aqui
 * a checagem e estrutural (o botao `[Enviar respostas]` so habilita com
 * 32 de 32 preenchidas).
 */
export function itensCobremGridCanonicoNr1(itens: readonly ItemRespostaNr1[]): boolean {
  if (itens.length !== NUM_ITENS_TOTAL_NR1) return false;
  const vistos = new Set<string>();
  for (const item of itens) {
    if (!Number.isInteger(item.fator) || item.fator < 1 || item.fator > NUM_FATORES_NR1) {
      return false;
    }
    if (
      !Number.isInteger(item.itemIndex) ||
      item.itemIndex < 1 ||
      item.itemIndex > NUM_ITENS_POR_FATOR_NR1
    ) {
      return false;
    }
    vistos.add(`${item.fator}:${item.itemIndex}`);
  }
  return vistos.size === NUM_ITENS_TOTAL_NR1;
}

/**
 * §11.11 — adesao percentual com arredondamento matematico padrao para
 * o inteiro mais proximo. Denominador zero devolve 0 (ciclo sem
 * elegiveis — §11.15 "snapshot vazio").
 */
export function adesaoPercentualNr1(respondentesEfetivos: number, elegiveis: number): number {
  if (elegiveis <= 0) return 0;
  return Math.round((respondentesEfetivos / elegiveis) * 100);
}

/**
 * S238 — trimestre canonico `{YYYY-QN}` derivado de uma data civil.
 * Consumido apenas pelo snapshot `metadados` de `alerts` (§11.13,
 * DOC 06 §4.6). `dataAbertura` e coluna DATE (sem fuso), portanto os
 * campos sao lidos em UTC.
 */
export function trimestreDeDataNr1(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth() + 1;
  return formatTrimestreCicloReferencia(ano, getTrimestreFromMonth(mes));
}

/** §11.7 — nome canonico do escopo agregado. */
export function nomeAgregacaoNr1(nomes: readonly string[]): string {
  return `Agregação de: ${nomes.join(', ')}`;
}

/** Entrada do planejador de agregacao: um departamento e sua contagem. */
export interface ContagemDepartamentoNr1 {
  departamentoId: number;
  count: number;
}

/** Grupo agregado resultante do algoritmo do §11.7. */
export interface GrupoAgregacaoNr1 {
  departamentoIds: readonly number[];
  total: number;
}

/** Saida do planejador: grupos validos + sobra abaixo do piso. */
export interface PlanoAgregacaoNr1 {
  grupos: readonly GrupoAgregacaoNr1[];
  insuficientes: readonly number[];
}

/**
 * §11.7 — algoritmo deterministico de agregacao dos departamentos
 * abaixo do piso:
 *   1. Ordena por contagem crescente (empate: `departamentoId`
 *      ascendente — desempate documentado no cabecalho).
 *   2. Acumula no grupo corrente ate atingir o piso; ao atingir, fecha
 *      o grupo e reinicia com o proximo pendente.
 *   3. Sobra final abaixo do piso vira `insuficientes`.
 *
 * A funcao recebe SOMENTE departamentos abaixo do piso — quem ja tem
 * `count >= PISO_AMOSTRA_NR1` tem escopo proprio e nunca agrega.
 */
export function planejarAgregacaoNr1(
  entradas: readonly ContagemDepartamentoNr1[],
): PlanoAgregacaoNr1 {
  const ordenadas = [...entradas].sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    return a.departamentoId - b.departamentoId;
  });

  const grupos: GrupoAgregacaoNr1[] = [];
  let correnteIds: number[] = [];
  let correnteTotal = 0;

  for (const entrada of ordenadas) {
    correnteIds.push(entrada.departamentoId);
    correnteTotal += entrada.count;
    if (correnteTotal >= PISO_AMOSTRA_NR1) {
      grupos.push({ departamentoIds: correnteIds, total: correnteTotal });
      correnteIds = [];
      correnteTotal = 0;
    }
  }

  return { grupos, insuficientes: correnteIds };
}

/** §11.9 — um fator divergente e seu delta contra a media da empresa. */
export interface FatorDivergenteNr1 {
  fator: number;
  scoreDept: number;
  scoreEmpresa: number;
  diferenca: number;
}

/** §11.9 — classificacao canonica de um escopo contra a empresa. */
export interface ClassificacaoDivergenciaNr1 {
  classificacao: 'convergente' | 'divergencia_critica' | 'divergencia_positiva';
  criticos: readonly FatorDivergenteNr1[];
  positivos: readonly FatorDivergenteNr1[];
}

/**
 * §11.9 — compara os 8 fatores do escopo com os da empresa:
 *   - `|diferenca| <= 10`: convergente.
 *   - `diferenca < -10`: divergente critico.
 *   - `diferenca > 10`: divergente positivo.
 *
 * Classificacao do escopo: `divergencia_critica` se houver ao menos um
 * critico; `divergencia_positiva` se houver ao menos um positivo e
 * nenhum critico; `convergente` caso contrario. Fatores ausentes em
 * qualquer dos lados sao ignorados (nao ha base de comparacao).
 */
export function classificarDivergenciaNr1(
  scoresEscopo: ReadonlyMap<number, number>,
  scoresEmpresa: ReadonlyMap<number, number>,
): ClassificacaoDivergenciaNr1 {
  const criticos: FatorDivergenteNr1[] = [];
  const positivos: FatorDivergenteNr1[] = [];

  for (const fator of FATORES_NR1) {
    const scoreDept = scoresEscopo.get(fator.id);
    const scoreEmpresa = scoresEmpresa.get(fator.id);
    if (scoreDept === undefined || scoreEmpresa === undefined) continue;
    const diferenca = round2(scoreDept - scoreEmpresa);
    if (diferenca < -BANDA_CONVERGENCIA_NR1) {
      criticos.push({ fator: fator.id, scoreDept, scoreEmpresa, diferenca });
    } else if (diferenca > BANDA_CONVERGENCIA_NR1) {
      positivos.push({ fator: fator.id, scoreDept, scoreEmpresa, diferenca });
    }
  }

  let classificacao: ClassificacaoDivergenciaNr1['classificacao'] = 'convergente';
  if (criticos.length > 0) {
    classificacao = 'divergencia_critica';
  } else if (positivos.length > 0) {
    classificacao = 'divergencia_positiva';
  }

  return { classificacao, criticos, positivos };
}

/** Candidato a departamento em situacao critica (§11.10). */
export interface CandidatoCriticoNr1 {
  departamentoId: number;
  criticos: readonly FatorDivergenteNr1[];
}

/**
 * §11.10 — ordena por contagem de fatores em divergencia critica
 * (maior primeiro); empate resolve pela pior divergencia absoluta
 * (`min(diferenca)`, mais negativa primeiro); empate residual resolve
 * por `departamentoId` ascendente, para determinismo total. Devolve
 * `null` quando nao ha candidato.
 */
export function identificarDepartamentoCriticoNr1(
  candidatos: readonly CandidatoCriticoNr1[],
): number | null {
  const elegiveis = candidatos.filter((c) => c.criticos.length > 0);
  if (elegiveis.length === 0) return null;

  const piorDe = (c: CandidatoCriticoNr1): number =>
    c.criticos.reduce(
      (min, f) => (f.diferenca < min ? f.diferenca : min),
      Number.POSITIVE_INFINITY,
    );

  const ordenados = [...elegiveis].sort((a, b) => {
    if (a.criticos.length !== b.criticos.length) return b.criticos.length - a.criticos.length;
    const piorA = piorDe(a);
    const piorB = piorDe(b);
    if (piorA !== piorB) return piorA - piorB;
    return a.departamentoId - b.departamentoId;
  });

  return ordenados[0]?.departamentoId ?? null;
}

// ============================================================
// Facade DI do pipeline pos-gravacao (S217/S205)
// ============================================================

/** Payload canonico de `emitAlertPostGravacao` (DOC 06 §8.10). */
export interface EmitAlertPostGravacaoInput {
  alertId: number;
  companyId: number;
  tipo: 'nr1_fator_critico' | 'nr1_ciclo_fechado';
  escopoDepartamentoId: number | null;
  fatorId: number | null;
  cicloDbId: number;
}

/**
 * S217 — hook do pipeline M4-M7 do DOC 06. O motor do Bloco B6
 * substitui o default sem editar este arquivo.
 */
export interface Nr1AlertFacade {
  emitAlertPostGravacao(input: EmitAlertPostGravacaoInput): Promise<void>;
}

/**
 * Implementacao no-op canonica. O motor de alertas do DOC 06 §8 ainda
 * nao existe (Bloco B6); deixar o hook explicito desacopla a ordem de
 * MEs sem introduzir export orfao (RV-13).
 */
export const DEFAULT_NR1_ALERT_FACADE: Nr1AlertFacade = {
  emitAlertPostGravacao: async () => {
    // Bloco B6 religa este hook ao `alertEngine` (DOC 06 §8.10).
  },
};

// ============================================================
// Transicao `agendado -> aberto` (§11.2) — S237
// ============================================================

/** Resultado canonico da varredura de abertura. */
export interface OpenScheduledNr1CyclesResult {
  ciclosAbertos: readonly number[];
  snapshotsCriados: number;
}

/** Compoe 'YYYY-MM-DD' a partir dos tres campos civis. */
function formatarDataCivil(ano: number, mes: number, dia: number): string {
  const a = String(ano).padStart(4, '0');
  const m = String(mes).padStart(2, '0');
  const d = String(dia).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

/**
 * Compoe a data civil 'YYYY-MM-DD' de `now` no fuso informado. Usado
 * para comparar com as colunas DATE do ciclo sem depender do fuso do
 * processo.
 */
function dataCivilNoFuso(now: Date, timeZone: string): string {
  const ano = getYearInTimezone(now, timeZone);
  const mes = getMonthInTimezone(now, timeZone);
  const dia = getDayInTimezone(now, timeZone);
  return formatarDataCivil(ano, mes, dia);
}

/** Converte coluna DATE (Date em UTC) na data civil 'YYYY-MM-DD'. */
export function dataCivilDeColunaNr1(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth() + 1;
  const dia = data.getUTCDate();
  return formatarDataCivil(ano, mes, dia);
}

/**
 * §11.2 (e DOC 06 §16.1 passo 1) — varre ciclos `agendado` cuja
 * `dataAbertura <= hoje` no fuso da empresa e executa a transicao para
 * `aberto`, criando o snapshot de elegiveis.
 *
 * Snapshot canonico: todos os `employees` da empresa com
 * `status='ativo'` no dia da abertura, com `departamentoId` resolvido
 * pelo nome do departamento do colaborador (`departments.nome`
 * e UNIQUE — DOC 01 §4.x). C-level nao entra por restricao
 * arquitetural (S239).
 *
 * Idempotente: a guarda estrutural `status='agendado'` vive no WHERE do
 * UPDATE; reexecucao no mesmo dia nao reabre ciclo ja aberto nem
 * duplica snapshot (UNIQUE `uq_snapshot`).
 *
 * Atraso do cron nao altera o comportamento (§11.2 item 3): o ciclo
 * transiciona normalmente com `abertoEm = now`.
 */
export async function openScheduledNr1Cycles(
  db: RoipDatabase,
  now: Date,
): Promise<OpenScheduledNr1CyclesResult> {
  const agendados = await db.select().from(copsoqCycles).where(eq(copsoqCycles.status, 'agendado'));

  if (agendados.length === 0) {
    return { ciclosAbertos: [], snapshotsCriados: 0 };
  }

  const companyIds = [...new Set(agendados.map((c) => c.companyId))];
  const empresas = await db
    .select({ id: companies.id, timezone: companies.timezone })
    .from(companies)
    .where(inArray(companies.id, companyIds));
  const fusoPorEmpresa = new Map(empresas.map((e) => [e.id, e.timezone]));

  const todosDepartamentos = await db
    .select({ id: departments.id, nome: departments.nome })
    .from(departments);
  const idPorNomeDepartamento = new Map(todosDepartamentos.map((d) => [d.nome, d.id]));

  const ciclosAbertos: number[] = [];
  let snapshotsCriados = 0;

  for (const ciclo of agendados) {
    const timeZone = fusoPorEmpresa.get(ciclo.companyId) ?? 'America/Sao_Paulo';
    const hoje = dataCivilNoFuso(now, timeZone);
    if (dataCivilDeColunaNr1(ciclo.dataAbertura) > hoje) {
      continue;
    }

    const elegiveis = await db
      .select({ id: employees.id, departamento: employees.departamento })
      .from(employees)
      .where(and(eq(employees.companyId, ciclo.companyId), eq(employees.status, 'ativo')));

    const criados = await db.transaction(async (tx) => {
      const [resultado] = await tx
        .update(copsoqCycles)
        .set({ status: 'aberto', abertoEm: now })
        .where(and(eq(copsoqCycles.id, ciclo.id), eq(copsoqCycles.status, 'agendado')));
      if (resultado.affectedRows === 0) {
        return 0;
      }
      for (const elegivel of elegiveis) {
        await tx.insert(copsoqCycleSnapshot).values({
          cicloDbId: ciclo.id,
          companyId: ciclo.companyId,
          employeeId: elegivel.id,
          departamentoId: idPorNomeDepartamento.get(elegivel.departamento) ?? null,
          snapshotEm: now,
          createdAt: now,
        });
      }
      return elegiveis.length;
    });

    if (criados >= 0) {
      ciclosAbertos.push(ciclo.id);
      snapshotsCriados += criados;
    }
  }

  return { ciclosAbertos, snapshotsCriados };
}

// ============================================================
// Transicao `aberto -> fechado` (§11.2, §11.6-§11.14)
// ============================================================

/** Escopo calculado do ciclo, na forma persistida em scores. */
export interface EscopoCalculadoNr1 {
  escopo: 'empresa' | 'departamento' | 'agregacao';
  escopoDepartamentoId: number | null;
  escopoNomeAgregacao: string | null;
  agregadoDe: readonly number[] | null;
  countRespondentes: number;
  scores: ReadonlyMap<number, number>;
}

/** Resultado canonico do fechamento do ciclo. */
export interface CloseNr1CycleResult {
  cicloDbId: number;
  companyId: number;
  fechado: boolean;
  elegiveis: number;
  respondentesEfetivos: number;
  adesaoPercentual: number;
  escoposCalculados: number;
  scoresGravados: number;
  divergenciasGravadas: number;
  alertasGravados: number;
  notificacoesGravadas: number;
  departamentoCriticoDepartamentoId: number | null;
  departamentosAmostraInsuficiente: readonly number[];
}

/** Dependencias injetaveis do fechamento (S205/S217). */
export interface CloseNr1CycleDeps {
  alertFacade?: Nr1AlertFacade;
}

/** Linha de alerta gravada, para o hook pos-transacao. */
interface AlertaGravadoNr1 {
  alertId: number;
  tipo: 'nr1_fator_critico' | 'nr1_ciclo_fechado';
  escopoDepartamentoId: number | null;
  fatorId: number | null;
}

/**
 * §11.2 + §11.6-§11.14 — fecha um ciclo `aberto`, calculando e
 * persistindo, em UMA transacao (§11.14 literal): scores por escopo,
 * analise de divergencia, departamento critico, alertas por fator,
 * alerta de fechamento, notificacoes no sino e a transicao de status.
 *
 * `emitAlertPostGravacao` roda FORA da transacao, apos o COMMIT — e a
 * ordem canonica Y2 do DOC 06 §24.5 ("hook Fase 8 chamado apos
 * persistencia").
 *
 * Ciclo inexistente ou fora de `aberto` devolve `fechado: false` sem
 * efeito colateral — §11.2 canoniza que ciclo fechado e irreversivel.
 */
export async function closeNr1Cycle(
  db: RoipDatabase,
  cicloDbId: number,
  now: Date,
  deps: CloseNr1CycleDeps = {},
): Promise<CloseNr1CycleResult> {
  const alertFacade = deps.alertFacade ?? DEFAULT_NR1_ALERT_FACADE;

  const [ciclo] = await db
    .select()
    .from(copsoqCycles)
    .where(eq(copsoqCycles.id, cicloDbId))
    .limit(1);

  if (!ciclo || ciclo.status !== 'aberto') {
    return {
      cicloDbId,
      companyId: ciclo?.companyId ?? 0,
      fechado: false,
      elegiveis: 0,
      respondentesEfetivos: 0,
      adesaoPercentual: 0,
      escoposCalculados: 0,
      scoresGravados: 0,
      divergenciasGravadas: 0,
      alertasGravados: 0,
      notificacoesGravadas: 0,
      departamentoCriticoDepartamentoId: null,
      departamentosAmostraInsuficiente: [],
    };
  }

  const companyId = ciclo.companyId;

  // -------- 1) Base de calculo: snapshot + respostas --------
  const snapshot = await db
    .select()
    .from(copsoqCycleSnapshot)
    .where(eq(copsoqCycleSnapshot.cicloDbId, cicloDbId));

  const respostas = await db
    .select()
    .from(copsoq_responses)
    .where(eq(copsoq_responses.cicloDbId, cicloDbId));

  // §11.11 — elegiveis excluem inativados apos o snapshot.
  const elegiveis = snapshot.filter((s) => s.inativadoAposSnapshot !== true);
  // §11.6/§11.11 — respondentes efetivos validos.
  const efetivos = elegiveis.filter((s) => s.respondeu === true && s.respostaInvalida !== true);
  const efetivosIds = new Set(efetivos.map((s) => s.employeeId));

  // Somas brutas por (employeeId, fator). Respondente sem os 32 itens
  // e descartado do calculo (defesa; o save grava os 32 em transacao).
  const somasPorEmployee = new Map<number, Map<number, number>>();
  const itensPorEmployee = new Map<number, number>();
  for (const linha of respostas) {
    if (!efetivosIds.has(linha.employeeId)) continue;
    const porFator = somasPorEmployee.get(linha.employeeId) ?? new Map<number, number>();
    porFator.set(linha.fator, (porFator.get(linha.fator) ?? 0) + linha.valor);
    somasPorEmployee.set(linha.employeeId, porFator);
    itensPorEmployee.set(linha.employeeId, (itensPorEmployee.get(linha.employeeId) ?? 0) + 1);
  }
  const computaveis = [...somasPorEmployee.keys()].filter(
    (id) => itensPorEmployee.get(id) === NUM_ITENS_TOTAL_NR1,
  );

  const departamentoPorEmployee = new Map<number, number | null>(
    elegiveis.map((s) => [s.employeeId, s.departamentoId]),
  );

  /** Media das somas brutas de um conjunto de respondentes, por fator. */
  const scoresDe = (employeeIds: readonly number[]): Map<number, number> => {
    const resultado = new Map<number, number>();
    if (employeeIds.length === 0) return resultado;
    for (const fator of FATORES_NR1) {
      let soma = 0;
      for (const employeeId of employeeIds) {
        soma += somasPorEmployee.get(employeeId)?.get(fator.id) ?? 0;
      }
      resultado.set(fator.id, scoreFatorNr1(soma / employeeIds.length, fator.tipo));
    }
    return resultado;
  };

  // -------- 2) Escopos canonicos (§11.6, §11.7) --------
  const escopos: EscopoCalculadoNr1[] = [];

  const scoresEmpresa =
    computaveis.length >= PISO_AMOSTRA_NR1 ? scoresDe(computaveis) : new Map<number, number>();
  if (scoresEmpresa.size > 0) {
    escopos.push({
      escopo: 'empresa',
      escopoDepartamentoId: null,
      escopoNomeAgregacao: null,
      agregadoDe: null,
      countRespondentes: computaveis.length,
      scores: scoresEmpresa,
    });
  }

  const porDepartamento = new Map<number, number[]>();
  for (const employeeId of computaveis) {
    const departamentoId = departamentoPorEmployee.get(employeeId) ?? null;
    if (departamentoId === null) continue;
    const lista = porDepartamento.get(departamentoId) ?? [];
    lista.push(employeeId);
    porDepartamento.set(departamentoId, lista);
  }

  const abaixoDoPiso: ContagemDepartamentoNr1[] = [];
  for (const [departamentoId, ids] of [...porDepartamento.entries()].sort((a, b) => a[0] - b[0])) {
    if (ids.length >= PISO_AMOSTRA_NR1) {
      escopos.push({
        escopo: 'departamento',
        escopoDepartamentoId: departamentoId,
        escopoNomeAgregacao: null,
        agregadoDe: null,
        countRespondentes: ids.length,
        scores: scoresDe(ids),
      });
    } else {
      abaixoDoPiso.push({ departamentoId, count: ids.length });
    }
  }

  const plano = planejarAgregacaoNr1(abaixoDoPiso);
  const nomePorDepartamentoId = new Map<number, string>();
  const idsParaNomear = [
    ...plano.grupos.flatMap((g) => [...g.departamentoIds]),
    ...escopos
      .filter((e) => e.escopoDepartamentoId !== null)
      .map((e) => e.escopoDepartamentoId as number),
  ];
  if (idsParaNomear.length > 0) {
    const linhas = await db
      .select({ id: departments.id, nome: departments.nome })
      .from(departments)
      .where(inArray(departments.id, [...new Set(idsParaNomear)]));
    for (const linha of linhas) {
      nomePorDepartamentoId.set(linha.id, linha.nome);
    }
  }

  for (const grupo of plano.grupos) {
    const ids = grupo.departamentoIds.flatMap((d) => porDepartamento.get(d) ?? []);
    const nomes = grupo.departamentoIds.map(
      (d) => nomePorDepartamentoId.get(d) ?? `Departamento ${d}`,
    );
    escopos.push({
      escopo: 'agregacao',
      escopoDepartamentoId: null,
      escopoNomeAgregacao: nomeAgregacaoNr1(nomes),
      agregadoDe: [...grupo.departamentoIds],
      countRespondentes: ids.length,
      scores: scoresDe(ids),
    });
  }

  // -------- 3) Divergencia (§11.9) e departamento critico (§11.10) --------
  interface DivergenciaPreparadaNr1 {
    escopo: 'departamento' | 'agregacao';
    escopoDepartamentoId: number | null;
    escopoNomeAgregacao: string | null;
    resultado: ClassificacaoDivergenciaNr1;
  }

  const divergencias: DivergenciaPreparadaNr1[] = [];
  if (scoresEmpresa.size > 0) {
    for (const escopo of escopos) {
      if (escopo.escopo === 'empresa') continue;
      divergencias.push({
        escopo: escopo.escopo,
        escopoDepartamentoId: escopo.escopoDepartamentoId,
        escopoNomeAgregacao: escopo.escopoNomeAgregacao,
        resultado: classificarDivergenciaNr1(escopo.scores, scoresEmpresa),
      });
    }
  }

  const candidatos: CandidatoCriticoNr1[] = divergencias
    .filter((d) => d.escopo === 'departamento' && d.escopoDepartamentoId !== null)
    .filter((d) => d.resultado.classificacao === 'divergencia_critica')
    .map((d) => ({
      departamentoId: d.escopoDepartamentoId as number,
      criticos: d.resultado.criticos,
    }));
  const departamentoCriticoId = identificarDepartamentoCriticoNr1(candidatos);
  const departamentoCriticoNome =
    departamentoCriticoId === null
      ? null
      : (nomePorDepartamentoId.get(departamentoCriticoId) ?? null);

  // -------- 4) Alertas (§11.13) e notificacoes (§11.14) --------
  const [empresa] = await db
    .select({ nomeFantasia: companies.nomeFantasia })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const nomeEmpresa = empresa?.nomeFantasia ?? '';

  const rhAtivos = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.status, 'ativo'),
        eq(employees.isRH, true),
      ),
    );

  const trimestre = trimestreDeDataNr1(ciclo.dataAbertura);

  interface AlertaPlanejadoNr1 {
    escopo: 'empresa' | 'departamento';
    escopoDepartamentoId: number | null;
    departamentoNome: string | null;
    fator: FatorNr1;
    score: number;
  }

  const alertasPlanejados: AlertaPlanejadoNr1[] = [];
  for (const escopo of escopos) {
    if (escopo.escopo === 'agregacao') continue;
    for (const fator of FATORES_NR1) {
      const score = escopo.scores.get(fator.id);
      if (score === undefined || score >= SCORE_FATOR_CRITICO_NR1) continue;
      alertasPlanejados.push({
        escopo: escopo.escopo,
        escopoDepartamentoId: escopo.escopoDepartamentoId,
        departamentoNome:
          escopo.escopoDepartamentoId === null
            ? null
            : (nomePorDepartamentoId.get(escopo.escopoDepartamentoId) ?? null),
        fator,
        score,
      });
    }
  }
  const fatoresEmAlerta = new Set(alertasPlanejados.map((a) => a.fator.id)).size;

  const adesaoPercentual = adesaoPercentualNr1(computaveis.length, elegiveis.length);

  // -------- 5) Transacao canonica unica (§11.14) --------
  const gravados = await db.transaction(async (tx) => {
    const alertasGravados: AlertaGravadoNr1[] = [];
    let scoresGravados = 0;
    let divergenciasGravadas = 0;
    let notificacoesGravadas = 0;

    for (const escopo of escopos) {
      for (const fator of FATORES_NR1) {
        const score = escopo.scores.get(fator.id);
        if (score === undefined) continue;
        await tx.insert(copsoqFactorScores).values({
          cicloDbId,
          companyId,
          escopo: escopo.escopo,
          escopoDepartamentoId: escopo.escopoDepartamentoId,
          escopoNomeAgregacao: escopo.escopoNomeAgregacao,
          agregadoDe: escopo.agregadoDe === null ? null : [...escopo.agregadoDe],
          fator: fator.id,
          score: score.toFixed(2),
          countRespondentes: escopo.countRespondentes,
          createdAt: now,
        });
        scoresGravados += 1;
      }
    }

    for (const divergencia of divergencias) {
      await tx.insert(nr1AreaDivergenceAnalysis).values({
        cicloDbId,
        companyId,
        escopo: divergencia.escopo,
        escopoDepartamentoId: divergencia.escopoDepartamentoId,
        escopoNomeAgregacao: divergencia.escopoNomeAgregacao,
        classificacao: divergencia.resultado.classificacao,
        fatoresDivergentesCriticos: [...divergencia.resultado.criticos],
        fatoresDivergentesPositivos: [...divergencia.resultado.positivos],
        createdAt: now,
      });
      divergenciasGravadas += 1;
    }

    for (const planejado of alertasPlanejados) {
      const [inserido] = await tx
        .insert(alerts)
        .values({
          companyId,
          tipo: 'nr1_fator_critico',
          severidade: 'atencao',
          escopo: planejado.escopo,
          escopoDepartamentoId: planejado.escopoDepartamentoId,
          escopoEmployeeId: null,
          suprimidoPorCooldown: false,
          cicloDbId,
          fatorId: planejado.fator.id,
          scoreValor: planejado.score.toFixed(2),
          metadados: {
            trimestre,
            cicloDbId,
            fatorId: planejado.fator.id,
            fatorNome: planejado.fator.nome,
            scoreValor: planejado.score,
            escopo: planejado.escopo,
            departamentoNome: planejado.departamentoNome,
          },
          createdAt: now,
        })
        .$returningId();
      if (!inserido) {
        throw new Error('closeNr1Cycle: insert em alerts retornou sem id (estado inconsistente)');
      }
      alertasGravados.push({
        alertId: inserido.id,
        tipo: 'nr1_fator_critico',
        escopoDepartamentoId: planejado.escopoDepartamentoId,
        fatorId: planejado.fator.id,
      });

      const titulo =
        planejado.escopo === 'empresa'
          ? `Fator ${planejado.fator.nome} em alerta: score ${planejado.score.toFixed(2)}`
          : `Fator ${planejado.fator.nome} em alerta no departamento ` +
            `${planejado.departamentoNome ?? ''}: score ${planejado.score.toFixed(2)}`;
      for (const rh of rhAtivos) {
        await tx.insert(notifications).values({
          companyId,
          destinatarioTipo: 'rh',
          destinatarioEmployeeId: rh.id,
          tipo: 'nr1_fator_critico',
          alertId: inserido.id,
          titulo,
          linkDestino: `/nr1?ciclo=${cicloDbId}&fator=${planejado.fator.id}`,
          severidade: 'atencao',
          createdAt: now,
        });
        notificacoesGravadas += 1;
      }
    }

    const [alertaFechamento] = await tx
      .insert(alerts)
      .values({
        companyId,
        tipo: 'nr1_ciclo_fechado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        suprimidoPorCooldown: false,
        cicloDbId,
        fatorId: null,
        scoreValor: null,
        metadados: { trimestre, cicloDbId, empresaNome: nomeEmpresa },
        createdAt: now,
      })
      .$returningId();
    if (!alertaFechamento) {
      throw new Error('closeNr1Cycle: insert do alerta de fechamento retornou sem id');
    }
    alertasGravados.push({
      alertId: alertaFechamento.id,
      tipo: 'nr1_ciclo_fechado',
      escopoDepartamentoId: null,
      fatorId: null,
    });

    for (const rh of rhAtivos) {
      await tx.insert(notifications).values({
        companyId,
        destinatarioTipo: 'rh',
        destinatarioEmployeeId: rh.id,
        tipo: 'nr1_ciclo_fechado',
        alertId: alertaFechamento.id,
        titulo: `Radar NR-1 — ciclo ${ciclo.ciclo} encerrado. Relatório disponível.`,
        linkDestino: `/nr1?ciclo=${cicloDbId}`,
        severidade: 'atencao',
        createdAt: now,
      });
      notificacoesGravadas += 1;
    }

    await tx.insert(notifications).values({
      companyId,
      destinatarioTipo: 'bruno',
      destinatarioEmployeeId: null,
      tipo: 'nr1_ciclo_fechado',
      alertId: alertaFechamento.id,
      titulo:
        `${nomeEmpresa} — ciclo do Radar NR-1 encerrado com ` +
        `${fatoresEmAlerta} fatores em alerta.`,
      linkDestino: `/super-admin/empresa/${companyId}/nr1?ciclo=${cicloDbId}`,
      severidade: 'atencao',
      createdAt: now,
    });
    notificacoesGravadas += 1;

    const [transicao] = await tx
      .update(copsoqCycles)
      .set({
        status: 'fechado',
        fechadoEm: now,
        departamentoCriticoDepartamentoId: departamentoCriticoId,
        departamentoCriticoDepartamentoNome: departamentoCriticoNome,
        departamentosAmostraInsuficiente: [...plano.insuficientes],
      })
      .where(and(eq(copsoqCycles.id, cicloDbId), eq(copsoqCycles.status, 'aberto')));

    if (transicao.affectedRows === 0) {
      throw new Error('closeNr1Cycle: transicao aberto -> fechado nao afetou linha');
    }

    return { alertasGravados, scoresGravados, divergenciasGravadas, notificacoesGravadas };
  });

  // -------- 6) Pipeline pos-gravacao, fora da transacao (DOC 06 §24.5) --------
  for (const alerta of gravados.alertasGravados) {
    await alertFacade.emitAlertPostGravacao({
      alertId: alerta.alertId,
      companyId,
      tipo: alerta.tipo,
      escopoDepartamentoId: alerta.escopoDepartamentoId,
      fatorId: alerta.fatorId,
      cicloDbId,
    });
  }

  return {
    cicloDbId,
    companyId,
    fechado: true,
    elegiveis: elegiveis.length,
    respondentesEfetivos: computaveis.length,
    adesaoPercentual,
    escoposCalculados: escopos.length,
    scoresGravados: gravados.scoresGravados,
    divergenciasGravadas: gravados.divergenciasGravadas,
    alertasGravados: gravados.alertasGravados.length,
    notificacoesGravadas: gravados.notificacoesGravadas,
    departamentoCriticoDepartamentoId: departamentoCriticoId,
    departamentosAmostraInsuficiente: [...plano.insuficientes],
  };
}
