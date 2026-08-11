// ROIP APP 9BOX — helpers internos canônicos da rota Bruno
// `/super-admin/empresa/[id]/organograma` (§14.9, ME-077).
//
// Padrão S366 CC068 canonizado desde ME-070: `page.tsx` do App Router
// Next 15 exporta APENAS o default. Todo helper, tipo, função auxiliar
// e loader vive neste `internals.ts` irmão — permite import por testes
// e por `OrganogramaClient.tsx` sem quebrar a segregação Next 15.
//
// Origem canônica:
// - CAMADA_UI §14.9 (organograma — layout árvore + modo normal +
//   comportamento clique por tipo de nó) + §2.6 (cores dos nós).
// - CAMADA_AUTH §10.3 linha 807 (Bruno atravessa `/super-admin/
//   empresa/[id]/organograma`) + §10.4 (autorizações).
// - CAMADA_NEGOCIO §15.7 (regra visual PC1b).
// - CAMADA_DADOS §4.4/§4.5/§4.6.
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico bit-exact) + §3.4
//   (ficha canônica desta ME).
//
// Mockup canônico consumido: `organograma_v2.html` (612 linhas).
//
// **RV-13.** Todo export tem consumidor real:
//   - `parseCompanyIdParam` → `page.tsx`.
//   - `resolveDatabaseUrl` → `page.tsx`.
//   - `loadOrganogramaPage` → `page.tsx`.
//   - `NODE_TYPE_LABELS` → `OrganogramaClient.tsx` + testes.
//   - `DASHBOARD_UNAVAILABLE_TOOLTIP` → `OrganogramaClient.tsx`.
//   - `PC1B_TOOLTIP` → `OrganogramaClient.tsx`.
//   - `getIniciaisFromName` → `OrganogramaClient.tsx` + testes.
//   - Tipo `OrganogramaPageData` → `page.tsx` + `OrganogramaClient.tsx`.
//
// **RV-12.** Zero SQL cru — persistência via API tipada Drizzle nos
// services.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import type { RoipDatabase } from '../../../../../db/client';
import { loadFullOrgTree, type OrgTreeNode } from '../../../../../server/services/orgTree';

// -----------------------------------------------------------------------
// Labels canônicos bit-exact
// -----------------------------------------------------------------------

/**
 * Labels canônicos dos tipos de nó (§2.6 + §14.9 painel resumido linha
 * *"Cargo/família de função"*). Consumidos pelo `OrganogramaClient.tsx`
 * e por testes.
 */
export const NODE_TYPE_LABELS = {
  empresa: 'Nó da empresa',
  clevel: 'C-level',
  lider: 'Líder',
  operacional: 'Colaborador',
} as const;

/**
 * Tooltip canônico bit-exact §15.7 — nós de C-level para RH/RH-Líder
 * (PC1b). Aplicado pelo client quando `applyPC1b === true` E o nó é
 * `type === 'clevel'`.
 */
export const PC1B_TOOLTIP = 'Detalhes restritos ao Super Admin.' as const;

/**
 * Tooltip canônico bit-exact D2 aprovada ME-077 — botão `[Abrir
 * dashboard]` desabilitado no MVP para todos os tipos de nó (rotas
 * `/dashboard/*` de equipe/global e `/dashboard-individual` não
 * implementadas — Master §7.1 O1). Fase 4 desbloqueia a superfície.
 */
export const DASHBOARD_UNAVAILABLE_TOOLTIP = 'Disponível a partir da Fase 4.' as const;

// -----------------------------------------------------------------------
// Helpers de string canônicos
// -----------------------------------------------------------------------

/**
 * §14.9 avatar canônico bit-exact — extrai iniciais (primeira letra do
 * primeiro nome + primeira letra do último nome) em maiúsculas para
 * placeholder de foto/avatar. Padrão bit-exact ao mockup
 * `organograma_v2.html:385-388`.
 */
export function getIniciaisFromName(name: string): string {
  const partes = name.trim().split(/\s+/);
  const primeiraParte = partes[0];
  if (primeiraParte === undefined || primeiraParte.length === 0) {
    return '';
  }
  const ultimaParte = partes[partes.length - 1] ?? primeiraParte;
  const primeira = primeiraParte[0] ?? '';
  const ultima = ultimaParte[0] ?? '';
  return (primeira + ultima).toUpperCase();
}

// -----------------------------------------------------------------------
// Parse canônico de params
// -----------------------------------------------------------------------

/**
 * Parse canônico bit-exact de `params.id` — aceita apenas inteiros
 * positivos. Retorna `null` para inputs inválidos (consumido por
 * `page.tsx` para chamar `notFound()`). Padrão consolidado ME-057c +
 * ME-076.
 */
export function parseCompanyIdParam(raw: string): number | null {
  if (raw.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

/**
 * Resolve a URL canônica do banco a partir do ambiente. Padrão
 * consolidado bit-exact ME-057c + ME-076.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

// -----------------------------------------------------------------------
// Tipo canônico do page data
// -----------------------------------------------------------------------

/**
 * Dados canônicos bit-exact carregados no server e passados ao client.
 * `root` é a árvore completa canônica; `applyPC1b` para Bruno é sempre
 * `false` (não atinge esta rota — §10.9 rotas dentro-de-empresa
 * exclusivas Bruno).
 */
export interface OrganogramaPageData {
  readonly root: OrgTreeNode;
  readonly applyPC1b: boolean;
}

// -----------------------------------------------------------------------
// Loader canônico bit-exact
// -----------------------------------------------------------------------

/**
 * §14.9 — carga inicial canônica bit-exact da árvore para renderização
 * server-side. Chama `loadFullOrgTree` do service; retorna `null` se a
 * empresa não existir (consumido por `page.tsx` para `notFound()`).
 *
 * `applyPC1b` para o Super Admin desta rota é sempre `false` (§11.2 +
 * §11.7 — PC1b aplica-se exclusivamente a RH/RH-Líder). Mantido no
 * payload por simetria arquitetural com o retorno do router
 * `orgTree.getFullTree` (que atende também `rh`/`rh_lider` quando a
 * rota `/organograma` do RH nativo for construída em B9).
 */
export async function loadOrganogramaPage(
  db: RoipDatabase,
  companyId: number,
): Promise<OrganogramaPageData | null> {
  const root = await loadFullOrgTree(db, companyId);
  if (root === null) {
    return null;
  }
  return { root, applyPC1b: false };
}
