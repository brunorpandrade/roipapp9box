// ROIP APP 9BOX — sub-router `developmentDialogs` (ME Etapa 1 —
// Bloco 2, NOVO).
//
// Superficie tRPC canonica dos Dialogos de desenvolvimento (DOC 01
// §10.1 + CAMADA_UI §14.26 + CAMADA_UI §14.25.4 — matriz de permissoes
// dos botoes de acao do dashboard individual).
//
// 5 procs canonicas:
//   - `developmentDialogs.list` — historico ativo do colaborador
//     (arquivados omitidos por default; §14.26 lista recolhida). Consumida
//     pelo drawer no dashboard individual.
//   - `developmentDialogs.create` — cria um dialogo novo com valores
//     padrao (§14.26 "sem pop-up de confirmacao. Cursor posicionado no
//     campo de titulo").
//   - `developmentDialogs.update` — patch parcial: `{titulo?, corpo?,
//     status?, pendencia?}`. Setter unico por chamada com Zod, backend
//     roteia para o setter granular canonico do service.
//   - `developmentDialogs.archive` — arquiva (§14.26 "solicita
//     confirmacao canonica").
//   - `developmentDialogs.discard` — DELETE fisico canonico
//     exclusivamente ANTES do primeiro salvamento (§14.26 "elimina sem
//     modal"). Guard bit-a-bit: `titulo IS NULL/'' AND corpo IS NULL/''`.
//
// Matriz de permissoes canonica (D2.2 desta ME, DOC 05 §14.25.4):
//   - Super_admin (Bruno): total (list + create + update + archive +
//     discard sobre qualquer par (lider, colaborador) da empresa).
//   - Lider direto atual: total sobre os proprios liderados.
//   - C-level acessoTotal=false: LEITURA (list) somente sobre a cadeia
//     propria. Nunca cria/edita/arquiva/descarta (§10.1 — C-levels nao
//     criam dialogos por regra definitiva).
//   - C-level acessoTotal=true, RH, RH-Lider, colaborador comum:
//     FORBIDDEN.
//
// **RV-13.** Consumido pelas server actions `dialogosActions.ts` do
// dashboard individual. Chamador do router: `appRouter` em
// `routers/index.ts`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.
// Testes: `tests/integration/developmentDialogs-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import { getActiveLeaderHistoryByEmployee } from '../services/employeeLeaderHistory';
import { getEmployeeById } from '../services/employees';
import { loadCLevelSessionContext } from '../../lib/session/cLevelSessionContext';
import { assertCadeiaDescendente } from '../services/cadeiaScopeGuard';
import {
  archiveDevelopmentDialog,
  deleteDevelopmentDialogById,
  getDevelopmentDialogById,
  insertDevelopmentDialog,
  listDialogsByEmployee,
  setDevelopmentDialogPendencia,
  updateDevelopmentDialogFields,
  updateDevelopmentDialogStatus,
} from '../services/developmentDialogs';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Mensagens canonicas exportadas (S206 — assercao literal em teste)
// ============================================================

/** Mensagem canonica quando o colaborador alvo nao existe / cross-empresa. */
export const MSG_DIALOGOS_COLABORADOR_NAO_ENCONTRADO =
  'Colaborador nao encontrado ou fora de escopo.';

/**
 * Mensagem canonica quando o usuario autenticado (super_admin, lider ou
 * clevel restrito) nao tem alvo no proprio escopo. Aplicada aos guards
 * internos APOS o role gate canonico do tRPC. Papeis fora do role gate
 * (rh/rh_lider em qualquer proc; clevel em procs de escrita) recebem
 * antes a mensagem canonica generica "Perfil sem permissao para a rota"
 * — semantica canonica de defesa em profundidade.
 */
export const MSG_DIALOGOS_APENAS_LIDER_DIRETO =
  'Apenas o lider direto atual pode criar ou editar dialogos.';

/** Mensagem canonica quando o dialogo alvo nao existe. */
export const MSG_DIALOGO_NAO_ENCONTRADO = 'Dialogo nao encontrado.';

/** Mensagem canonica quando o dialogo nao pertence ao par (lider, colaborador). */
export const MSG_DIALOGO_FORA_DO_ESCOPO = 'Dialogo fora do escopo do usuario.';

/**
 * Mensagem canonica quando discard e chamado sobre um dialogo que ja
 * tem titulo ou corpo (violacao da pre-condicao §14.26 "elimina sem
 * modal ANTES do primeiro salvamento").
 */
export const MSG_DISCARD_APENAS_ANTES_DO_PRIMEIRO_SALVAMENTO =
  'Descarte permitido apenas antes do primeiro salvamento. Use arquivar.';

// ============================================================
// Constantes canonicas de input
// ============================================================

/** Corte canonico do titulo (varchar(255) do schema §10.1). */
export const DIALOGO_TITULO_MAX_CHARS = 255 as const;

/** Corte defensivo do corpo (text no schema — sem limite SQL; cap Zod). */
export const DIALOGO_CORPO_MAX_CHARS = 10_000 as const;

// ============================================================
// Schemas Zod canonicos
// ============================================================

/** Input de `developmentDialogs.list`. */
export const DIALOGOS_LIST_INPUT_SCHEMA = z.object({
  employeeId: z.number().int().positive(),
});

/** Input de `developmentDialogs.create`. */
export const DIALOGOS_CREATE_INPUT_SCHEMA = z.object({
  employeeId: z.number().int().positive(),
});

/**
 * Input de `developmentDialogs.update`. Patch parcial — pelo menos um
 * campo obrigatorio. Titulo e corpo podem ser string vazia (limpar).
 */
export const DIALOGOS_UPDATE_INPUT_SCHEMA = z
  .object({
    id: z.number().int().positive(),
    titulo: z.string().max(DIALOGO_TITULO_MAX_CHARS).nullable().optional(),
    corpo: z.string().max(DIALOGO_CORPO_MAX_CHARS).nullable().optional(),
    status: z.enum(['verde', 'vermelho']).optional(),
    pendencia: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.titulo !== undefined ||
      v.corpo !== undefined ||
      v.status !== undefined ||
      v.pendencia !== undefined,
    { message: 'Ao menos um campo do patch e obrigatorio.' },
  );

/** Input de `developmentDialogs.archive` e `developmentDialogs.discard`. */
export const DIALOGOS_ID_INPUT_SCHEMA = z.object({
  id: z.number().int().positive(),
});

// ============================================================
// Guards canonicos
// ============================================================

/**
 * Retorna o `liderId` (employees.id) do usuario autenticado se este for
 * lider direto do colaborador. `null` caso contrario. Regra canonica
 * §14.25.4 + §10.1:
 *   - super_admin: retorna o liderId ATUAL do colaborador (opera como
 *     lider proxy — pode ler/escrever qualquer par).
 *   - lider: retorna `user.userId` se `user.userId === active.liderId`.
 *   - clevel: nunca vira liderId (§10.1). Retorna null.
 *   - rh, rh_lider: nunca vira liderId nesta superficie. Retorna null.
 */
/**
 * Criador canonico polimorfico do dialogo (patch v6). Precedente §4.6
 * DOC 01: `liderId XOR clevelId`. Nunca ambos, nunca nenhum.
 */
export interface CriadorDialogo {
  readonly tipo: 'employee' | 'clevel';
  readonly id: number;
}

/**
 * Resolve o criador canonico do dialogo a partir do usuario autenticado
 * e do colaborador alvo. Retorna:
 *   - `{tipo: 'employee', id}` quando o autenticado e lider direto
 *     employee (lider ou rh_lider, com `activeLeader.liderId === user.userId`).
 *   - `{tipo: 'clevel', id}` quando o autenticado e C-level lider direto
 *     (com `activeLeader.clevelId === user.userId`). Canonizado pelo
 *     patch v6.
 *   - `null` caso contrario (nao e lider direto do alvo).
 *   - Super_admin: nunca cria dialogos como si mesmo — retorna o criador
 *     canonico ATUAL do alvo (opera como lider proxy). Se o alvo nao tem
 *     lider direto ativo, retorna null.
 */
async function resolveCriadorOrNull(
  db: RoipDatabase,
  user: AuthenticatedUser,
  employeeId: number,
  companyId: number,
): Promise<CriadorDialogo | null> {
  void companyId; // check ja aplicado no chamador (assertPodeEscreverOrThrow)
  const active = await getActiveLeaderHistoryByEmployee(db, employeeId);
  if (active === undefined) {
    return null;
  }
  // Super_admin atravessa como proxy do criador canonico ATUAL do alvo.
  if (user.role === 'super_admin') {
    if (active.liderId !== null) {
      return { tipo: 'employee', id: active.liderId };
    }
    if (active.clevelId !== null) {
      return { tipo: 'clevel', id: active.clevelId };
    }
    return null;
  }
  // Employee lider direto (patch v5): lider ou rh_lider bate com liderId.
  if (
    (user.role === 'lider' || user.role === 'rh_lider') &&
    active.liderId !== null &&
    user.userId === active.liderId
  ) {
    return { tipo: 'employee', id: active.liderId };
  }
  // C-level lider direto (patch v6): bate com clevelId.
  if (user.role === 'clevel' && active.clevelId !== null && user.userId === active.clevelId) {
    return { tipo: 'clevel', id: active.clevelId };
  }
  return null;
}

/**
 * Guard canonico para OPERACOES DE ESCRITA (create/update/archive/discard).
 * Segunda barreira apos o role gate canonico do tRPC: as procs de escrita
 * declaram `roleProcedure(['super_admin', 'lider', 'rh_lider', 'clevel'])` —
 * `rh` puro rejeitado canonicamente antes deste guard. Este guard valida
 * cross-empresa + lider-direto-atual (polimorfico employee/C-level via
 * §4.6 canonizado no §10.1 v6).
 * Retorna o CRIADOR canonico a gravar em novos INSERTs + companyId.
 */
async function assertPodeEscreverOrThrow(
  db: RoipDatabase,
  user: AuthenticatedUser,
  employeeId: number,
): Promise<{ criador: CriadorDialogo; companyId: number }> {
  const employee = await getEmployeeById(db, employeeId);
  if (employee === undefined) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: MSG_DIALOGOS_COLABORADOR_NAO_ENCONTRADO,
    });
  }
  if (user.role !== 'super_admin' && user.companyId !== employee.companyId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: MSG_DIALOGOS_COLABORADOR_NAO_ENCONTRADO,
    });
  }
  const criador = await resolveCriadorOrNull(db, user, employeeId, employee.companyId);
  if (criador === null) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: MSG_DIALOGOS_APENAS_LIDER_DIRETO,
    });
  }
  return { criador, companyId: employee.companyId };
}

/**
 * Guard canonico para LEITURA (list). Passam: super_admin, lider direto,
 * C-level restrito (cadeia propria — via assertCadeiaDescendente).
 * RH/RH-Lider e C-level total nunca aparecem no botao [Dialogos de
 * desenvolvimento] (§14.25.4) — se chegarem aqui, FORBIDDEN.
 */
async function assertPodeLerOrThrow(
  db: RoipDatabase,
  user: AuthenticatedUser,
  employeeId: number,
): Promise<{ companyId: number }> {
  const employee = await getEmployeeById(db, employeeId);
  if (employee === undefined) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: MSG_DIALOGOS_COLABORADOR_NAO_ENCONTRADO,
    });
  }
  if (user.role !== 'super_admin' && user.companyId !== employee.companyId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: MSG_DIALOGOS_COLABORADOR_NAO_ENCONTRADO,
    });
  }
  if (user.role === 'super_admin') {
    return { companyId: employee.companyId };
  }
  // Patch v6: lider/rh_lider/clevel validados canonicamente como lider
  // direto atual via resolveCriadorOrNull (polimorfico employee/clevel
  // via §4.6 canonizado no §10.1 v6). C-level lider direto passa aqui.
  if (user.role === 'lider' || user.role === 'rh_lider' || user.role === 'clevel') {
    const criador = await resolveCriadorOrNull(db, user, employeeId, employee.companyId);
    if (criador !== null) {
      return { companyId: employee.companyId };
    }
    // C-level nao-direto: cai para a segunda checagem (cadeia
    // descendente via assertCadeiaDescendente); lider/rh_lider
    // nao-direto: FORBIDDEN.
    if (user.role !== 'clevel') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: MSG_DIALOGOS_APENAS_LIDER_DIRETO,
      });
    }
  }
  // user.role === 'clevel' (unico restante — role gate ja rejeitou
  // rh/rh_lider antes deste guard NAO se aplica pos-v5; rh_lider agora
  // eh coberto acima). C-level: pode ser lider direto via §4.6 DOC 01
  // (employeeLeaderHistory.clevelId === user.userId) — passa como leitor
  // canonico. C-level total sem vinculo direto: canonicamente bloqueia
  // via acessoTotal===true. C-level restrito com cadeia propria: le via
  // assertCadeiaDescendente.
  const activeLeader = await getActiveLeaderHistoryByEmployee(db, employeeId);
  if (activeLeader !== undefined && activeLeader.clevelId === user.userId) {
    return { companyId: employee.companyId };
  }
  const cctx = await loadCLevelSessionContext(db, user.companyId, user.userId);
  if (cctx === null) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: MSG_DIALOGOS_APENAS_LIDER_DIRETO,
    });
  }
  if (cctx.acessoTotal === true) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: MSG_DIALOGOS_APENAS_LIDER_DIRETO,
    });
  }
  await assertCadeiaDescendente(db, user, employeeId, MSG_DIALOGOS_APENAS_LIDER_DIRETO);
  return { companyId: employee.companyId };
}

/**
 * Guard canonico de escrita sobre um dialogo existente. Valida:
 * 1. Dialogo existe.
 * 2. `assertPodeEscreverOrThrow(employeeId do dialogo)` passa.
 * 3. O dialogo pertence ao par (liderId do usuario, employeeId).
 *    Super_admin atravessa o par (opera como lider proxy).
 */
async function loadDialogParaEscritaOrThrow(
  db: RoipDatabase,
  user: AuthenticatedUser,
  dialogId: number,
): Promise<{
  dialog: NonNullable<Awaited<ReturnType<typeof getDevelopmentDialogById>>>;
  criador: CriadorDialogo;
}> {
  const dialog = await getDevelopmentDialogById(db, dialogId);
  if (dialog === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: MSG_DIALOGO_NAO_ENCONTRADO });
  }
  const { criador } = await assertPodeEscreverOrThrow(db, user, dialog.employeeId);
  // Patch v6: valida canonicamente que o dialogo pertence ao par
  // (criador, employeeId). Super_admin atravessa (opera como proxy).
  if (user.role !== 'super_admin') {
    if (criador.tipo === 'employee' && dialog.liderId !== criador.id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: MSG_DIALOGO_FORA_DO_ESCOPO });
    }
    if (criador.tipo === 'clevel' && dialog.clevelId !== criador.id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: MSG_DIALOGO_FORA_DO_ESCOPO });
    }
  }
  return { dialog, criador };
}

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica do sub-router `developmentDialogs`. Sem `deps` — o
 * service e infra ja modelam o comportamento; testes de integracao usam
 * DB real (V3-equivalente com MySQL local).
 */
export function createDevelopmentDialogsRouter() {
  return router({
    // ============================================================
    // Proc 1 — list (leitura)
    // ============================================================
    // Patch v5: `rh_lider` incluido no role gate (RH-Lider pode ser
    // lider direto e ver os dialogos que criou como lider). `clevel`
    // continua no role gate: em v5 apenas para leitura (nunca criou
    // dialogos ate v6); em v6 o schema clevelId habilita criacao.
    list: roleProcedure(['super_admin', 'clevel', 'lider', 'rh_lider'])
      .input(DIALOGOS_LIST_INPUT_SCHEMA)
      .query(async ({ ctx, input }) => {
        await assertPodeLerOrThrow(ctx.db, ctx.user, input.employeeId);
        const rows = await listDialogsByEmployee(ctx.db, input.employeeId);
        return { dialogs: rows };
      }),

    // ============================================================
    // Proc 2 — create (escrita: lider direto employee OU C-level +
    // super_admin proxy)
    // ============================================================
    // Patch v6: `clevel` incluido no role gate. Criador polimorfico
    // (liderId XOR clevelId) resolvido canonicamente por
    // resolveCriadorOrNull → assertPodeEscreverOrThrow.
    create: roleProcedure(['super_admin', 'lider', 'rh_lider', 'clevel'])
      .input(DIALOGOS_CREATE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }) => {
        const { criador, companyId } = await assertPodeEscreverOrThrow(
          ctx.db,
          ctx.user,
          input.employeeId,
        );
        // Valores padrao canonicos §14.26: titulo='', corpo='',
        // status='verde', pendencia=false. Grava liderId OU clevelId
        // conforme tipo canonico do criador (invariante XOR §10.1 v6).
        const id = await insertDevelopmentDialog(ctx.db, {
          companyId,
          liderId: criador.tipo === 'employee' ? criador.id : null,
          clevelId: criador.tipo === 'clevel' ? criador.id : null,
          employeeId: input.employeeId,
          titulo: '',
          corpo: '',
          status: 'verde',
          pendencia: false,
          arquivado: false,
        });
        const row = await getDevelopmentDialogById(ctx.db, id);
        if (row === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'INSERT retornou id mas SELECT nao encontrou linha.',
          });
        }
        return { dialog: row };
      }),

    // ============================================================
    // Proc 3 — update (escrita: patch parcial)
    // ============================================================
    update: roleProcedure(['super_admin', 'lider', 'rh_lider', 'clevel'])
      .input(DIALOGOS_UPDATE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }) => {
        await loadDialogParaEscritaOrThrow(ctx.db, ctx.user, input.id);
        // Aplica cada campo via setter granular canonico do service.
        // Ordem determinista para tornar a operacao auditavel.
        if (input.titulo !== undefined || input.corpo !== undefined) {
          await updateDevelopmentDialogFields(ctx.db, input.id, {
            titulo: input.titulo,
            corpo: input.corpo,
          });
        }
        if (input.status !== undefined) {
          await updateDevelopmentDialogStatus(ctx.db, input.id, input.status);
        }
        if (input.pendencia !== undefined) {
          await setDevelopmentDialogPendencia(ctx.db, input.id, input.pendencia);
        }
        const row = await getDevelopmentDialogById(ctx.db, input.id);
        if (row === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'UPDATE ok mas SELECT pos-update nao encontrou linha.',
          });
        }
        return { dialog: row };
      }),

    // ============================================================
    // Proc 4 — archive (escrita)
    // ============================================================
    archive: roleProcedure(['super_admin', 'lider', 'rh_lider', 'clevel'])
      .input(DIALOGOS_ID_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }) => {
        await loadDialogParaEscritaOrThrow(ctx.db, ctx.user, input.id);
        const affected = await archiveDevelopmentDialog(ctx.db, input.id);
        return { affected };
      }),

    // ============================================================
    // Proc 5 — discard (DELETE fisico canonico §14.26)
    // ============================================================
    discard: roleProcedure(['super_admin', 'lider', 'rh_lider', 'clevel'])
      .input(DIALOGOS_ID_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }) => {
        const { dialog } = await loadDialogParaEscritaOrThrow(ctx.db, ctx.user, input.id);
        const tituloVazio = dialog.titulo === null || dialog.titulo === '';
        const corpoVazio = dialog.corpo === null || dialog.corpo === '';
        if (!tituloVazio || !corpoVazio) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: MSG_DISCARD_APENAS_ANTES_DO_PRIMEIRO_SALVAMENTO,
          });
        }
        const affected = await deleteDevelopmentDialogById(ctx.db, input.id);
        return { affected };
      }),
  });
}
