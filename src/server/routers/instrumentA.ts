// ROIP APP 9BOX — sub-router `instrumentA` (ME-039, editado em ME-042).
//
// Decima ME do Bloco B3 (ME-039) — abriu o par canonico de escrita do
// Eixo Y (reopen manual). Decima-terceira ME do Bloco B3 (ME-042) —
// adiciona a leitura publica `getInstrumentAStatus` do §6.8 segunda
// linha, alinhando a superficie de acompanhamento de coleta do
// Instrumento A com o §19.4 (leitura publica do Eixo Y).
//
// A ponta de escrita "normal" do Instrumento A vive no Route Handler
// canonico `POST /api/portal/save-instrument-a` (§6.8 primeira linha —
// portal autenticado por CPF via `portalToken`, NAO via tRPC); este
// sub-router expoe:
//   - o desbloqueio manual por Bruno (§6.8 sexta linha, ME-039);
//   - a leitura publica de status de coleta (§6.8 segunda linha,
//     ME-042 — leitura de agregado + lista nominal por (companyId,
//     trimestre), com autorizacao por escopo hierarquico).
//
// O motor de plenitude (§6.4) nasceu na ME-040 com hook real em ambos
// os pontos de escrita canonicos do Eixo Y (Route Handler
// `POST /api/portal/save-instrument-a` para A + `instrumentC.
// saveInstrumentCAssessment` para C). Este sub-router NAO grava
// resposta canonica de A — S094 preservado: NAO ha hook de motor de
// plenitude aqui porque nao ha gravacao de resposta a acionar.
//
// Procedures canonicas:
//   - `instrumentA.reopenResponse` (ME-039) — desbloqueio manual do A
//     por Bruno. Padrao canonico 100-500 (§2). Cria linha em
//     `instrumentUnlockLog` com `instrumento='A'`, `expiraEm=now+24h`,
//     `houveAlteracao=false`. Exclusivo super_admin (S086 estendido a A,
//     analogo ao C).
//   - `instrumentA.getInstrumentAStatus` (ME-042 — §6.8 segunda linha
//     + §19.4 quinta linha) — retorna `{ total, respondidos,
//     pendentes: [{ employeeId, nome, departamento, cargo, status }] }`
//     onde `status ∈ {'pendente','atrasado'}`. Autorizacao por escopo:
//     RH e Bruno (empresa); Lider e C-level (cadeia descendente).
//     S121: `status = 'atrasado'` quando `now > dataCorte` canonica
//     (§6.3 dia 10 do mes subsequente ao ultimo mes do trimestre;
//     replicada ao A por simetria §6.1/§6.2); caso contrario,
//     'pendente'. §6.2 canoniza que C-level NAO responde o A —
//     portanto o denominador `total` EXCLUI C-levels (que vivem em
//     `cLevelMembers`, tabela separada de `employees` — a exclusao e
//     por construcao). Ativos apenas (§7.6 replicado ao A por
//     simetria — inativos nao aparecem no acompanhamento de coleta).
//
// NAO pertence ao escopo desta ME:
//   - `saveInstrumentAResponse` (§6.8 primeira linha) — canonicamente
//     via portal (nao tRPC). Vive no Route Handler
//     `POST /api/portal/save-instrument-a/route.ts` (S097 revisada).
//
// Convencoes canonicas herdadas:
//   - DI factory `createInstrumentARouter(deps)` (S100, S084 estendido):
//     `now` injetavel (default `() => new Date()`) para testes
//     deterministicos. `now` tambem alimenta o corte canonico de
//     `pendente | atrasado` no `getInstrumentAStatus` (S121). NAO ha
//     hook de motor de plenitude porque este sub-router NAO grava
//     resposta canonica de A — apenas reopen e leitura. O hook canonico
//     do motor de plenitude vive no Route Handler `POST /api/portal/
//     save-instrument-a` (ME-040) para o A e no router
//     `instrumentC.saveInstrumentCAssessment` (ME-040) para o C.
//   - `reopenResponse` (S093): pre-condicao de resposta previa existente
//     (`MSG_REOPEN_SEM_RESPOSTA`); rejeita janela vigente empilhada
//     (`MSG_REOPEN_JA_VIGENTE_A`); guard cruzado companyId (§2.4).
//     Justificativa canonica 100-500 (§2). INSERT em
//     `instrumentUnlockLog` com `instrumento='A'` — o `saveInstrumentA`
//     do portal fara OVERWRITE dentro da janela de 24h aberta aqui
//     (semantica S095).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador nos testes de integracao
//     desta ME + acoplamento no `appRouter` em `index.ts` (RV-13). As
//     constantes e schemas Zod exportados sao consumidos pelo Route
//     Handler do portal (`src/app/api/portal/save-instrument-a/route.ts`).
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`) +
// Route Handler `POST /api/portal/save-instrument-a/route.ts` (para os
// exports canonicos compartilhados — constantes, schemas e mensagens).
// Testes tRPC: `tests/integration/instrumentA-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  companies,
  employeeLeaderHistory,
  employees,
  instrumentA_responses,
  instrumentUnlockLog,
} from '../../db/schema';
import { getInstrumentoABDataCorte, parseTrimestreCicloReferencia } from '../../lib/cycleDates';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas
// ============================================================

/** §6.2 — 4 dimensoes (Engajamento/Desenvolvimento/Pertencimento/Realizacao). */
export const NUM_DIMENSOES_A = 4 as const;

/** §6.2 — 5 itens por dimensao. */
export const NUM_ITENS_POR_DIMENSAO_A = 5 as const;

/** §6.2 — total de 20 itens por resposta completa. */
export const NUM_ITENS_TOTAL_A = 20 as const;

/** §6.2 — escala canonica: 0 Nunca .. 4 Sempre. */
export const VALOR_MIN_A = 0 as const;
/** §6.2 — teto da escala 0-4. */
export const VALOR_MAX_A = 4 as const;

/** §6.7 — janela canonica de edicao pos-desbloqueio: 24 horas. */
export const UNLOCK_WINDOW_HOURS_A = 24 as const;

/** Milissegundos em 24 horas — usado no calculo de `expiraEm`. */
const UNLOCK_WINDOW_MS_A = UNLOCK_WINDOW_HOURS_A * 60 * 60 * 1000;

// ============================================================
// Mensagens canonicas literais (testadas verbatim — S091 estendido)
// ============================================================

/**
 * §6.7 combinado com S095 — Instrumento A ja foi enviado sem
 * desbloqueio vigente. Diferente do C, o A NAO fecha (§6.7 canoniza
 * explicitamente "Resposta tardia ao Instrumento A NAO e desbloqueio":
 * o card permanece aberto ate ser respondido; uma vez respondido,
 * imutavel ate desbloqueio). Semanticamente distinto do
 * `MSG_TRIMESTRE_FECHADO` do C, portanto texto proprio (S095).
 */
export const MSG_A_JA_ENVIADA =
  'Instrumento A já enviado para este trimestre. Solicite desbloqueio a Bruno se necessário.';

/** §6.1 — antes do dia 16 do ultimo mes do trimestre (S091 estendido). */
export const MSG_TRIMESTRE_NAO_ABERTO_A = 'Instrumento A ainda não disponível para este trimestre.';

/** §6.2 — 20 itens obrigatorios com valor 0-4 (S091 estendido, S101). */
export const MSG_ITENS_INCOMPLETOS_A =
  'O Instrumento A exige 20 itens (4 dimensões x 5 itens) com valor entre 0 e 4.';

/**
 * §6.2 canoniza EXPLICITAMENTE: "C-level nao responde o Instrumento A".
 * Retornado como 403 pelo Route Handler quando `titularType === 'clevel'`
 * no portalToken. Mensagem canonica nova (S099).
 */
export const MSG_CLEVEL_NAO_RESPONDE_A = 'C-level não responde ao Instrumento A.';

/**
 * §2.4 — guard cruzado companyId. Retornado quando o employee resolvido
 * pelo `portalToken.titularId` nao pertence a `portalToken.companyId`
 * (cenario raro mas possivel — token emitido antes de transferencia,
 * ou emissao com companyId inconsistente).
 */
export const MSG_COMPANY_MISMATCH_A = 'Colaborador não pertence à sua empresa.';

/** §4.3 (padrao login) estendido a A — colaborador inativo nao responde. */
export const MSG_EMPLOYEE_INATIVO_A = 'Colaborador inativo não responde ao Instrumento A.';

/** §6.7 — pre-condicao do reopen (resposta previa existente) — S091 estendido. */
export const MSG_REOPEN_SEM_RESPOSTA =
  'Não há resposta registrada para este colaborador neste trimestre.';

/** §6.7 — desbloqueio ja vigente (S091 estendido). */
export const MSG_REOPEN_JA_VIGENTE_A =
  'Já existe desbloqueio vigente para este colaborador neste trimestre.';

/**
 * §6.8 segunda linha (ME-042) — trimestre com formato invalido no
 * `getInstrumentAStatus`. Mensagem canonica literal (S091 estendido).
 * O schema Zod ja bloqueia formato invalido antes de chegar ao
 * handler; a mensagem esta aqui para o teste asseriar quando o
 * caminho for exercitado por parse manual (defesa em profundidade,
 * padrao S092/S096).
 */
export const MSG_TRIMESTRE_INVALIDO_STATUS_A = 'Trimestre canônico deve seguir o formato YYYY-QN.';

/**
 * §2.4 (ME-042) — companyId ausente/invalido no `getInstrumentAStatus`
 * para perfis com escopo de empresa. Mensagem canonica.
 */
export const MSG_EMPRESA_NAO_ENCONTRADA_STATUS_A = 'Empresa não encontrada.';

// ============================================================
// Schemas Zod canonicos (consumidos pelo router tRPC + Route Handler)
// ============================================================

/** §6.1 — trimestre canonico `YYYY-QN` (S096 replica S092). */
export const TRIMESTRE_SCHEMA_INSTRUMENT_A = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: 'Trimestre canônico deve seguir o formato YYYY-QN.',
});

/** §6.2 — dimensao 1..4 (canonica). */
export const DIMENSAO_SCHEMA_INSTRUMENT_A = z.number().int().min(1).max(NUM_DIMENSOES_A);

/** §6.2 — itemIndex 1..5 (canonico, dentro da dimensao). */
export const ITEM_INDEX_SCHEMA_INSTRUMENT_A = z.number().int().min(1).max(NUM_ITENS_POR_DIMENSAO_A);

/** §6.2 — valor 0..4 (canonico). */
export const VALOR_SCHEMA_INSTRUMENT_A = z.number().int().min(VALOR_MIN_A).max(VALOR_MAX_A);

/** §6.2 — item unitario (dimensao, itemIndex, valor). */
export const ITEM_SCHEMA_INSTRUMENT_A = z.object({
  dimensao: DIMENSAO_SCHEMA_INSTRUMENT_A,
  itemIndex: ITEM_INDEX_SCHEMA_INSTRUMENT_A,
  valor: VALOR_SCHEMA_INSTRUMENT_A,
});

/** §2 — justificativa administrativa 100-500 (padrao canonico transversal). */
export const JUSTIFICATIVA_SCHEMA_INSTRUMENT_A = z
  .string()
  .min(100, { message: 'A justificativa deve ter no mínimo 100 caracteres.' })
  .max(500, { message: 'A justificativa deve ter no máximo 500 caracteres.' });

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/**
 * §6.2 + §6.7 — status canonico da janela do trimestre para o par
 * (employee, trimestre) para o Instrumento A. DIFERENTE do C: A NAO
 * fecha. Apenas 3 estados canonicos possiveis:
 *   - `nao_aberta`: antes do dia 16 do ultimo mes do trimestre;
 *   - `aberta`: apos abertura, sem resposta previa (ou com resposta
 *     previa apenas — a mera existencia de resposta previa NAO fecha
 *     o A canonico; o card some do portal apos responder e fica
 *     imutavel ate desbloqueio, mas a janela permanece "aberta" no
 *     sentido de que resposta tardia ainda pode acontecer se nao houve
 *     envio previo);
 *   - `desbloqueada`: com `instrumentUnlockLog` vigente (edicao dentro
 *     da janela de 24h aberta pelo `reopenResponse`).
 * NAO existe `fechada` para A (§6.7 explicito).
 */
export const STATUS_JANELA_INSTRUMENT_A_VALUES = ['nao_aberta', 'aberta', 'desbloqueada'] as const;

/** Estado canonico da janela do trimestre para o Instrumento A. */
export type StatusJanelaInstrumentA = (typeof STATUS_JANELA_INSTRUMENT_A_VALUES)[number];

/**
 * Resumo canonico do desbloqueio A vigente. Analogo ao
 * `DesbloqueioVigenteResumo` do C, mas tipo proprio para evitar imports
 * cruzados entre routers de dominio distintos.
 */
export interface DesbloqueioVigenteResumoA {
  unlockLogId: number;
  desbloqueadoPor: number;
  desbloqueadoEm: Date | null;
  expiraEm: Date;
  justificativa: string;
}

/** Retorno canonico de `reopenResponse` (analogo a `reopenAssessment` do C). */
export interface ReopenResponseResult {
  unlockLogId: number;
  expiraEm: Date;
}

/**
 * §6.8 segunda linha (ME-042) + S121 — status de coleta canonico de
 * um colaborador pendente no acompanhamento do Instrumento A.
 *   - `'pendente'`: trimestre em andamento (dataCorte >= now) SEM
 *     resposta registrada.
 *   - `'atrasado'`: trimestre ja fechou canonicamente (dataCorte
 *     < now) e ainda nao ha resposta registrada. §6.7 canoniza que
 *     resposta tardia ao A NAO e desbloqueio (o card permanece aberto
 *     no portal); `'atrasado'` sinaliza visualmente para o RH que
 *     o prazo canonico do trimestre expirou.
 */
export const STATUS_PENDENCIA_INSTRUMENT_A_VALUES = ['pendente', 'atrasado'] as const;

/** Status canonico de um colaborador pendente no §6.8 segunda linha. */
export type StatusPendenciaInstrumentA = (typeof STATUS_PENDENCIA_INSTRUMENT_A_VALUES)[number];

/**
 * §6.8 segunda linha — item canonico da lista `pendentes` do
 * `getInstrumentAStatus`. Contem os atributos canonicos do colaborador
 * (nome, departamento, cargo) e o status de pendencia (S121). `cargo`
 * mapeia ao campo `employees.descricaoCBO` (canonico do cargo do
 * colaborador comum — o campo `cargo` do schema pertence a
 * `cLevelMembers`, tabela separada; C-levels nao respondem o A por
 * §6.2 e portanto nao aparecem aqui).
 */
export interface InstrumentAStatusPendente {
  employeeId: number;
  nome: string;
  departamento: string;
  cargo: string;
  status: StatusPendenciaInstrumentA;
}

/**
 * §6.8 segunda linha — resultado canonico da leitura de status do A
 * para (companyId, trimestre). `total` conta colaboradores ATIVOS
 * elegiveis a responder (§7.6 replicado ao A por simetria; C-levels
 * excluidos por §6.2 por construcao — vivem em `cLevelMembers`).
 * `respondidos` = `total - pendentes.length` (contagem consistente
 * com a lista devolvida — semantica de `respondidos: pelo menos uma
 * resposta registrada no trimestre`).
 */
export interface GetInstrumentAStatusResult {
  companyId: number;
  trimestre: string;
  total: number;
  respondidos: number;
  pendentes: InstrumentAStatusPendente[];
}

/**
 * §6.1 — schema local do trimestre para o `getInstrumentAStatus`.
 * Redeclarado como constante local por precedente do repo (cada
 * router redeclara o proprio schema para evitar dependencia cruzada
 * entre routers). Reusa a mesma regex canonica que o
 * `TRIMESTRE_SCHEMA_INSTRUMENT_A`, mas com identificador dedicado
 * a leitura de status.
 */
export const TRIMESTRE_INPUT_SCHEMA_STATUS_A = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: MSG_TRIMESTRE_INVALIDO_STATUS_A,
});

// ============================================================
// Dependencias injetaveis (S100 — sem hook de motor)
// ============================================================

/**
 * Relogio injetavel para testes deterministicos. Sem hook de motor de
 * plenitude porque este sub-router NAO grava resposta canonica de A —
 * apenas reopen. O hook canonico do motor de plenitude (ME-040) vive
 * no Route Handler `POST /api/portal/save-instrument-a` para o A e no
 * router `instrumentC.saveInstrumentCAssessment` para o C.
 */
export interface InstrumentARouterDeps {
  now?: () => Date;
}

interface ResolvedDepsA {
  now: () => Date;
}

function resolveDepsA(deps: InstrumentARouterDeps): ResolvedDepsA {
  return {
    now: deps.now ?? (() => new Date()),
  };
}

// ============================================================
// Guards e helpers canonicos (compartilhaveis com o Route Handler)
// ============================================================

/**
 * Resolve o `superAdminId` do titular. Usado por `reopenResponse` (proc
 * exclusiva de super_admin — §6.8 sexta linha).
 */
function requireSuperAdminIdA(user: AuthenticatedUser): number {
  if (user.role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Esta operação é exclusiva do Super Admin.',
    });
  }
  return user.superAdminId;
}

/**
 * Verifica que a lista de itens do submit cobre exatamente as 20
 * combinacoes canonicas (dimensao 1..4 x itemIndex 1..5), sem duplicatas
 * e sem lacunas. Retorna `true` se cobre; `false` caso contrario.
 * Consumido pelo Route Handler do portal (o router tRPC nao expoe save,
 * mas mantemos o helper exportavel para reuso — RV-13 exige chamador
 * real, satisfeito pelo Route Handler e pelo teste tRPC unitario).
 */
export function itensCobremGridCanonicoA(
  itens: readonly { dimensao: number; itemIndex: number }[],
): boolean {
  if (itens.length !== NUM_ITENS_TOTAL_A) {
    return false;
  }
  const chaves = new Set<string>();
  for (const item of itens) {
    chaves.add(`${item.dimensao}-${item.itemIndex}`);
  }
  if (chaves.size !== NUM_ITENS_TOTAL_A) {
    return false;
  }
  for (let d = 1; d <= NUM_DIMENSOES_A; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_A; i++) {
      if (!chaves.has(`${d}-${i}`)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * §6.8 segunda linha + S066 (ME-042) — resolve os `employeeId`s da
 * cadeia direta descendente do lider ou C-level para escopo canonico
 * do `getInstrumentAStatus`. Exatamente um entre `liderId` e
 * `clevelId` deve ser nao-nulo (padrao XOR canonico da tabela
 * `employeeLeaderHistory`). `dataFim IS NULL` filtra vinculos ativos.
 * O `companyId` filtra defensivamente cross-company (o titular ja
 * teve o companyId cruzado em `assertCompanyScopePlenitude` analogo;
 * aqui o filtro e defesa em profundidade).
 * Retorna array vazio se nao houver liderados diretos.
 */
export async function scopedEmployeeIdsByLeaderA(
  db: RoipDatabase,
  companyId: number,
  liderId: number | null,
  clevelId: number | null,
): Promise<number[]> {
  if (liderId === null && clevelId === null) {
    return [];
  }
  // O JOIN entre `employeeLeaderHistory` e `employees` cruza pelo
  // `employeeId` (colaborador liderado) para filtrar pelo `companyId`
  // do liderado. `dataFim IS NULL` filtra vinculos ativos.
  const rows = await db
    .select({ employeeId: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employees.companyId, companyId),
        isNull(employeeLeaderHistory.dataFim),
        liderId !== null
          ? eq(employeeLeaderHistory.liderId, liderId)
          : eq(employeeLeaderHistory.clevelId, clevelId as number),
      ),
    );
  return rows.map((row) => row.employeeId);
}

/**
 * §6.8 segunda linha + S121 — classifica status pendente segundo o
 * corte canonico do trimestre. Retorna `'atrasado'` quando `now`
 * ultrapassou a `dataCorte` canonica (§6.3 dia 10 do mes subsequente,
 * replicada ao A por simetria §6.1/§6.2); caso contrario, `'pendente'`.
 * Exportado para reuso em superficies que classificam pendencia sem
 * chamar a proc completa (por exemplo, futuras superficies do portal).
 */
export function classifyStatusPendenciaA(
  trimestre: string,
  timeZone: string,
  now: Date,
): StatusPendenciaInstrumentA {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) {
    // Trimestre invalido nao deveria chegar aqui (schema Zod bloqueia
    // antes); defesa em profundidade: retorna 'pendente' como estado
    // conservador — o chamador ja lidou com a validacao canonica.
    return 'pendente';
  }
  const dataCorte = getInstrumentoABDataCorte(parsed.ano, parsed.trimestre, timeZone);
  return now.getTime() > dataCorte.getTime() ? 'atrasado' : 'pendente';
}

/**
 * Resolve o `instrumentUnlockLog` do tipo 'A' vigente (`expiraEm > now`)
 * para o par (employeeId, trimestre), se houver. Ordenado por
 * `desbloqueadoEm DESC, id DESC` — o mais recente vence. Retorna
 * `undefined` quando nao ha janela vigente. Exportado para consumo
 * pelo Route Handler do portal (semantica S095 — OVERWRITE quando
 * desbloqueio vigente).
 */
export async function findVigenteInstrumentUnlockA(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
  now: Date,
) {
  const rows = await db
    .select()
    .from(instrumentUnlockLog)
    .where(
      and(
        eq(instrumentUnlockLog.employeeId, employeeId),
        eq(instrumentUnlockLog.trimestre, trimestre),
        eq(instrumentUnlockLog.instrumento, 'A'),
        gt(instrumentUnlockLog.expiraEm, now),
      ),
    )
    .orderBy(desc(instrumentUnlockLog.desbloqueadoEm), desc(instrumentUnlockLog.id))
    .limit(1);
  return rows[0];
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `instrumentA` com dependencias injetadas
 * (S100, S084 estendido). Producao chama sem argumentos — o unico
 * default e o relogio. Testes injetam `now` fixo para determinismo.
 * Sem hook de motor de plenitude porque este sub-router NAO grava
 * resposta canonica de A — apenas reopen. O hook canonico (ME-040)
 * vive no Route Handler `POST /api/portal/save-instrument-a` para o
 * A e no router `instrumentC.saveInstrumentCAssessment` para o C.
 */
export function createInstrumentARouter(deps: InstrumentARouterDeps = {}) {
  const resolved = resolveDepsA(deps);

  return router({
    /**
     * §6.8 segunda linha + §19.4 quinta linha (ME-042) — leitura
     * publica de status de coleta do Instrumento A por (companyId,
     * trimestre). Retorna `{ total, respondidos, pendentes: [...] }`.
     * Escopo canonico por perfil:
     *   - Bruno (super_admin): atravessa companyId.
     *   - RH e RH-Lider: escopo empresa (companyId do JWT).
     *   - C-level: cadeia descendente direta (liderados via
     *     `employeeLeaderHistory.clevelId` com `dataFim IS NULL`).
     *   - Lider: cadeia descendente direta (liderados via
     *     `employeeLeaderHistory.liderId` com `dataFim IS NULL`).
     * `total` conta colaboradores ATIVOS elegiveis a responder no
     * escopo do chamador (§7.6 replicado ao A por simetria); C-levels
     * excluidos por §6.2 por construcao (vivem em `cLevelMembers`).
     * `pendentes[].status` classificado por `classifyStatusPendenciaA`
     * contra a `dataCorte` canonica no fuso da empresa (S121).
     * `respondidos = total - pendentes.length` — semantica
     * canonica: "pelo menos uma resposta registrada no trimestre".
     */
    getInstrumentAStatus: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          trimestre: TRIMESTRE_INPUT_SCHEMA_STATUS_A,
        }),
      )
      .query(async ({ ctx, input }): Promise<GetInstrumentAStatusResult> => {
        // §2.4 — guard cruzado companyId (super_admin atravessa).
        if (ctx.user.role !== 'super_admin' && ctx.user.companyId !== input.companyId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Empresa fora do escopo do titular.',
          });
        }

        // Resolve o fuso canonico da empresa para o corte de status.
        const [company] = await ctx.db
          .select({
            id: companies.id,
            timezone: companies.timezone,
          })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        if (!company) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_EMPRESA_NAO_ENCONTRADA_STATUS_A,
          });
        }
        const timeZone = company.timezone ?? 'America/Sao_Paulo';

        // Resolve o escopo de colaboradores elegiveis segundo o perfil.
        // Bruno + RH + RH-Lider: toda a empresa (status='ativo').
        // Lider: liderados diretos ativos via employeeLeaderHistory.
        // C-level: idem, cruzando por clevelId.
        let empRows: {
          id: number;
          name: string;
          departamento: string;
          descricaoCBO: string;
        }[];

        if (
          ctx.user.role === 'super_admin' ||
          ctx.user.role === 'rh' ||
          ctx.user.role === 'rh_lider'
        ) {
          empRows = await ctx.db
            .select({
              id: employees.id,
              name: employees.name,
              departamento: employees.departamento,
              descricaoCBO: employees.descricaoCBO,
            })
            .from(employees)
            .where(and(eq(employees.companyId, input.companyId), eq(employees.status, 'ativo')))
            .orderBy(employees.id);
        } else {
          // Lider ou C-level — cadeia direta descendente. Reusa a
          // logica dos motores B3: `employeeLeaderHistory` com
          // `dataFim IS NULL` cruzado por `liderId` (para lider) OU
          // `clevelId` (para C-level). Duas etapas para preservar
          // Drizzle tipado sem LATERAL: primeiro colhe os employeeIds
          // elegiveis, depois hidrata os atributos.
          const liderIdMatch = ctx.user.role === 'lider' ? ctx.user.userId : null;
          const clevelIdMatch = ctx.user.role === 'clevel' ? ctx.user.userId : null;

          const scopedIds = await scopedEmployeeIdsByLeaderA(
            ctx.db,
            input.companyId,
            liderIdMatch,
            clevelIdMatch,
          );

          if (scopedIds.length === 0) {
            empRows = [];
          } else {
            empRows = await ctx.db
              .select({
                id: employees.id,
                name: employees.name,
                departamento: employees.departamento,
                descricaoCBO: employees.descricaoCBO,
              })
              .from(employees)
              .where(
                and(
                  eq(employees.companyId, input.companyId),
                  eq(employees.status, 'ativo'),
                  inArray(employees.id, scopedIds),
                ),
              )
              .orderBy(employees.id);
          }
        }

        if (empRows.length === 0) {
          return {
            companyId: input.companyId,
            trimestre: input.trimestre,
            total: 0,
            respondidos: 0,
            pendentes: [],
          };
        }

        const employeeIds = empRows.map((row) => row.id);

        // Resolve quais colaboradores ja tem PELO MENOS UMA resposta
        // registrada no trimestre. `instrumentA_responses` grava um
        // registro por (employeeId, trimestre, dimensao, itemIndex) —
        // 20 por resposta completa. Distinct por employeeId basta para
        // a semantica de `respondidos: pelo menos uma resposta`.
        const respondedRows = await ctx.db
          .selectDistinct({ employeeId: instrumentA_responses.employeeId })
          .from(instrumentA_responses)
          .where(
            and(
              eq(instrumentA_responses.companyId, input.companyId),
              eq(instrumentA_responses.trimestre, input.trimestre),
              inArray(instrumentA_responses.employeeId, employeeIds),
            ),
          );
        const respondedSet = new Set<number>(respondedRows.map((row) => row.employeeId));

        const now = resolved.now();
        const statusCanonico = classifyStatusPendenciaA(input.trimestre, timeZone, now);

        const pendentes: InstrumentAStatusPendente[] = [];
        for (const emp of empRows) {
          if (respondedSet.has(emp.id)) {
            continue;
          }
          pendentes.push({
            employeeId: emp.id,
            nome: emp.name,
            departamento: emp.departamento,
            cargo: emp.descricaoCBO,
            status: statusCanonico,
          });
        }

        return {
          companyId: input.companyId,
          trimestre: input.trimestre,
          total: empRows.length,
          respondidos: empRows.length - pendentes.length,
          pendentes,
        };
      }),

    /**
     * §6.7 + §6.8 sexta linha — desbloqueio manual DIRETO por Bruno
     * (exclusivo super_admin). Cria linha em `instrumentUnlockLog` com
     * `instrumento='A'`, `expiraEm=now+24h`, `houveAlteracao=false`.
     * Pre-condicoes: resposta previa existente
     * (`MSG_REOPEN_SEM_RESPOSTA` se nenhum registro) e ausencia de
     * janela vigente para o mesmo par (`MSG_REOPEN_JA_VIGENTE_A`).
     * Justificativa canonica 100-500 (§2). Nao transiciona nenhum flag
     * na tabela de respostas — o reopen abre a janela por 24h e o
     * Route Handler `save-instrument-a` faz OVERWRITE dentro dela
     * (semantica S095).
     */
    reopenResponse: roleProcedure(['super_admin'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          employeeId: z.number().int().positive(),
          trimestre: TRIMESTRE_SCHEMA_INSTRUMENT_A,
          justificativa: JUSTIFICATIVA_SCHEMA_INSTRUMENT_A,
        }),
      )
      .mutation(async ({ ctx, input }): Promise<ReopenResponseResult> => {
        const superAdminId = requireSuperAdminIdA(ctx.user);
        const now = resolved.now();
        const expiraEm = new Date(now.getTime() + UNLOCK_WINDOW_MS_A);

        // §2.4 — guard cruzado. Colaborador deve pertencer a companyId.
        const [emp] = await ctx.db
          .select()
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        if (!emp || emp.companyId !== input.companyId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_A });
        }

        // §6.7 — pre-condicao: resposta previa. Sem registro, nao ha o
        // que reabrir. Diferente do C, Bruno nao pode "abrir para
        // receber pela primeira vez" via reopen: para o A, resposta
        // tardia sem envio previo NAO e desbloqueio (§6.7 literal —
        // A nao fecha; portal aceita tardia como comportamento normal).
        const [previa] = await ctx.db
          .select({ id: instrumentA_responses.id })
          .from(instrumentA_responses)
          .where(
            and(
              eq(instrumentA_responses.employeeId, input.employeeId),
              eq(instrumentA_responses.trimestre, input.trimestre),
            ),
          )
          .limit(1);
        if (!previa) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_REOPEN_SEM_RESPOSTA });
        }

        // §6.7 — nao empilha janelas. Se ha desbloqueio vigente, rejeita
        // 409 (Bruno aguarda ou o job de expiracao ME futura fecha).
        const vigente = await findVigenteInstrumentUnlockA(
          ctx.db,
          input.employeeId,
          input.trimestre,
          now,
        );
        if (vigente) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_REOPEN_JA_VIGENTE_A });
        }

        // INSERT canonico em instrumentUnlockLog (§6.7).
        const [inserted] = await ctx.db
          .insert(instrumentUnlockLog)
          .values({
            companyId: input.companyId,
            employeeId: input.employeeId,
            trimestre: input.trimestre,
            instrumento: 'A',
            desbloqueadoPor: superAdminId,
            justificativa: input.justificativa,
            desbloqueadoEm: now,
            expiraEm,
            houveAlteracao: false,
            ajusteRetroativo: false,
            createdAt: now,
          })
          .$returningId();
        if (!inserted) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Falha ao registrar o desbloqueio (insert sem id).',
          });
        }
        return { unlockLogId: inserted.id, expiraEm };
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type InstrumentARouter = ReturnType<typeof createInstrumentARouter>;
