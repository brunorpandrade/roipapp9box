// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/app/notificacoes/page.tsx` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069/ME-070, CC068): Next 15 App Router
// aceita em `page.tsx` apenas `export default` + Route Segment Config
// (dynamic/revalidate/runtime/preferredRegion/maxDuration/fetchCache/
// dynamicParams) + `generateMetadata`/`generateStaticParams`/
// `generateViewport`/`metadata`. Qualquer outro export publico faz
// `next build` reprovar com erro literal:
//
//   Type error: Page "src/app/notificacoes/page.tsx" does not match
//   the required types of a Next.js Page.
//     "<identificador>" is not a valid Page export field.
//
// Segregacao canonica: tipos publicos consumidos por
// `actions.ts`/`NotificacoesClient.tsx`/testes, funcoes de query de
// dados e helpers de fallback migram para modulo irmao `internals.ts`.
// Next 15 ignora arquivos `.ts` no diretorio de rota que nao sejam
// `page.tsx`, `route.ts`, `layout.tsx`, `loading.tsx`, `error.tsx`,
// `not-found.tsx`, `default.tsx`, `template.tsx`. `internals.ts` e
// nome canonico livre — mesma segregacao aplicada aos Route Handlers
// D072 (ME-069 piloto, ME-070 bulk).
//
// Este modulo preserva bit-exact os simbolos migrados da ME-057a.
// Zero mudanca de comportamento, autorizacao (Bruno/RH §10.5), SQL ou
// payload.
//
// RV-13: cada export tem chamador:
// - `NotificacoesListRow` + `NotificacoesListResult` consumidos por
//   `./page.tsx`, `./NotificacoesClient.tsx`, `./actions.ts` e
//   `tests/integration/me057a-notificacoes.test.ts`.
// - `loadNotificacoesPage` consumida por `./page.tsx`, `./actions.ts`
//   e teste.
// - `getCanonicalDefaultFilters` consumida por `./page.tsx` (fallback
//   quando Next 15 chama sem searchParams em contexto de teste unit
//   isolado) e teste.

import { and, desc, eq, gte, isNotNull, isNull, like, lt, or, sql } from 'drizzle-orm';

import { type RoipDatabase } from '../../db/client';
import { notifications } from '../../db/schema';
import type { NotificationTipo, Severidade } from '../../db/schema/enums';

import {
  CANONICAL_DEFAULT_FILTERS,
  resolvePeriodoRange,
  type NotificacoesFilters,
} from './filters';
import { resolveTiposFromCategoria } from './mappings';

// -----------------------------------------------------------------------
// Tipos publicos do resultado
// -----------------------------------------------------------------------

/**
 * Linha canonica da tabela renderizada §14.19. Inclui campos necessarios
 * para as 8 colunas (checkbox, data/hora, tipo, severidade, titulo,
 * colaborador, status, acao). `colaboradorNome` derivado do
 * `subtitulo` da notificacao ou de query complementar (fase futura); por
 * ora usa `subtitulo` como fonte canonica quando disponivel.
 */
export interface NotificacoesListRow {
  readonly id: number;
  readonly tipo: NotificationTipo;
  readonly severidade: Severidade;
  readonly titulo: string;
  readonly subtitulo: string | null;
  readonly linkDestino: string | null;
  readonly lidaEm: Date | null;
  readonly arquivadaEm: Date | null;
  readonly createdAt: Date;
}

export interface NotificacoesListResult {
  readonly rows: readonly NotificacoesListRow[];
  readonly totalCount: number;
  readonly unreadCount: number;
  readonly filtersApplied: NotificacoesFilters;
}

// -----------------------------------------------------------------------
// Query canonica da lista (server-side, Drizzle tipado)
// -----------------------------------------------------------------------

/**
 * Carrega uma pagina da lista de notificacoes aplicando os filtros
 * canonicos §14.19. Fonte unica de query — invocada tanto pelo server
 * component na renderizacao inicial quanto pela `listarNotificacoesAction`
 * em re-fetches subsequentes (RV-12 100% Drizzle tipado + DRY).
 *
 * Convencao canonica:
 * - `destinatarioTipo` + `destinatarioEmployeeId` sao **guards
 *   obrigatorios** do WHERE (defense-in-depth contra chamadas mal
 *   formadas). Bruno usa (`'bruno'`, NULL); RH usa (`'rh'`, userId).
 * - Filtros construidos como conjuncao de clausulas opcionais. Filtro
 *   ausente = clausula ausente.
 */
export async function loadNotificacoesPage(
  db: RoipDatabase,
  destinatarioTipo: 'bruno' | 'rh',
  destinatarioEmployeeId: number | null,
  filters: NotificacoesFilters,
): Promise<NotificacoesListResult> {
  const now = new Date();
  const periodoRange = resolvePeriodoRange(
    filters.periodo,
    filters.periodoPersonalizadoInicio,
    filters.periodoPersonalizadoFim,
    now,
  );

  // Clausula de destinatario (obrigatoria)
  const destClause =
    destinatarioEmployeeId === null
      ? and(
          eq(notifications.destinatarioTipo, destinatarioTipo),
          isNull(notifications.destinatarioEmployeeId),
        )
      : and(
          eq(notifications.destinatarioTipo, destinatarioTipo),
          eq(notifications.destinatarioEmployeeId, destinatarioEmployeeId),
        );

  // Clausula de categoria (tipo IN [...] quando filtro != 'todos')
  const tiposFiltrados = resolveTiposFromCategoria(filters.categoria);
  const categoriaClause =
    filters.categoria === 'todos'
      ? undefined
      : tiposFiltrados.length === 0
        ? // Categoria valida mas sem tipos mapeados (ex: 'plenitude') →
          // resultado sempre vazio. Substituto canonico bit-exact de
          // `sql\`1 = 0\`` sem SQL cru (RV-12/S366 CC068): `id` e AUTO
          // INCREMENT NOT NULL, comeca em 1, nunca e 0.
          eq(notifications.id, 0)
        : or(...tiposFiltrados.map((t) => eq(notifications.tipo, t)));

  // Clausula de severidade
  const severidadeClause =
    filters.severidade === 'todas' ? undefined : eq(notifications.severidade, filters.severidade);

  // Clausula de periodo (createdAt range)
  const periodoClause =
    periodoRange === null
      ? filters.periodo === 'personalizado'
        ? // Personalizado sem datas validas → vazio canonico. Substituto
          // canonico bit-exact de `sql\`1 = 0\`` sem SQL cru (RV-12/S366
          // CC068): mesma justificativa da categoriaClause acima.
          eq(notifications.id, 0)
        : undefined
      : and(
          gte(notifications.createdAt, periodoRange.from),
          lt(notifications.createdAt, periodoRange.to),
        );

  // Clausula de status (mapping canonico §14.19 → mappings.ts)
  const statusClause = (() => {
    switch (filters.status) {
      case 'nao_lidas_e_lidas':
        return isNull(notifications.arquivadaEm);
      case 'nao_lidas':
        return and(isNull(notifications.arquivadaEm), isNull(notifications.lidaEm));
      case 'lidas':
        return and(isNull(notifications.arquivadaEm), isNotNull(notifications.lidaEm));
      case 'arquivadas':
        return isNotNull(notifications.arquivadaEm);
      case 'todas':
        return undefined;
    }
  })();

  // Clausula de busca (LIKE em titulo OR subtitulo — sem colaborador
  // dedicado; refactor futuro quando linkage `destinatarioEmployeeId ×
  // employees.nome` estiver populado para busca por nome de colaborador
  // referido, nao destinatario. Nesta ME §14.19 aplicamos LIKE em campos
  // textuais canonicos do notif — cobre uso pratico e mantem WHERE
  // seguro via prepared parameter do Drizzle).
  const searchClause =
    filters.searchColaborador === ''
      ? undefined
      : or(
          like(notifications.titulo, `%${filters.searchColaborador}%`),
          like(notifications.subtitulo, `%${filters.searchColaborador}%`),
        );

  const whereClause = and(
    destClause,
    categoriaClause,
    severidadeClause,
    periodoClause,
    statusClause,
    searchClause,
  );

  const offset = (filters.page - 1) * filters.pageSize;

  const [rowsRaw, totalRow, unreadRow] = await Promise.all([
    db
      .select({
        id: notifications.id,
        tipo: notifications.tipo,
        severidade: notifications.severidade,
        titulo: notifications.titulo,
        subtitulo: notifications.subtitulo,
        linkDestino: notifications.linkDestino,
        lidaEm: notifications.lidaEm,
        arquivadaEm: notifications.arquivadaEm,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(filters.pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(notifications)
      .where(whereClause),
    // unread count SEMPRE ignora filtros de status/periodo/etc — reflete
    // o header canonico "{N} notificacoes · {X} nao lidas". "Nao lidas"
    // canonicamente exclui arquivadas.
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(notifications)
      .where(and(destClause, isNull(notifications.lidaEm), isNull(notifications.arquivadaEm))),
  ]);

  const rows: readonly NotificacoesListRow[] = rowsRaw.map((r) => ({
    id: r.id,
    tipo: r.tipo as NotificationTipo,
    severidade: (r.severidade ?? 'info') as Severidade,
    titulo: r.titulo,
    subtitulo: r.subtitulo,
    linkDestino: r.linkDestino,
    lidaEm: r.lidaEm,
    arquivadaEm: r.arquivadaEm,
    createdAt: r.createdAt ?? new Date(0),
  }));

  return {
    rows,
    totalCount: totalRow[0]?.total ?? 0,
    unreadCount: unreadRow[0]?.total ?? 0,
    filtersApplied: filters,
  };
}

// -----------------------------------------------------------------------
// Fallback canonico do estado inicial quando searchParams e undefined
// (Next 15 chama sem searchParams em contexto de teste unit isolado)
// -----------------------------------------------------------------------

export function getCanonicalDefaultFilters(): NotificacoesFilters {
  return CANONICAL_DEFAULT_FILTERS;
}
