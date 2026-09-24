// ROIP APP 9BOX — autorização de acesso aos dashboards de recorte
// (ESPEC §8 matriz de acesso; PC1h cadeia descendente própria). Consumido
// pela rota nativa `/dashboard-recorte/[tipo]/[alvo]` (multipersona) e
// pela rota Bruno `/super-admin/empresa/[id]/dashboard-recorte/...`
// (resolução do alvo). §8.06.6b.
//
// Origem canônica:
// - ESPEC_ORGANOGRAMAS §8 (matriz de acesso): Bruno/RH/C-level total veem
//   tudo; C-level restrito e líder veem só a própria cadeia.
// - CAMADA_NEGOCIO §15 PC1h ("cadeia descendente própria").
// - `resolveHierarchicalScope` (§11.9): null = sem restrição; Set de ids
//   de nó (`employee-N`/`clevel-N`) = cadeia própria.
//
// ME §8.06.6c (D5): o núcleo da decisão de departamento foi extraído para
// `everyEmployeeInScope` (`src/lib/scope/recorteScopeRule.ts`), régua
// única reusada por esta autorização (servidor) e pelo esmaecimento do
// organograma analítico (cliente) — RV-14, sem duas cópias.
//
// **RV-13.** `resolveRecorteAlvo` e `canAccessRecorte` consumidos pelas
// rotas de recorte + teste de integração.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import type { RoipDatabase } from '../../db/client';
import { DEPARTAMENTO_VALUES, type Departamento } from '../../db/schema/enums';
import { everyEmployeeInScope } from '../../lib/scope/recorteScopeRule';

import { getCLevelMemberById } from './cLevelMembers';
import type { RecorteAlvo } from './companyAggregate';
import { getEmployeeById } from './employees';
import { listDepartmentEmployeeIds } from './recorteScope';

interface RecorteAlvoResolvido {
  readonly alvo: RecorteAlvo;
  readonly titulo: string;
}

function isDepartamento(v: string): v is Departamento {
  return (DEPARTAMENTO_VALUES as readonly string[]).includes(v);
}

/**
 * Resolve o alvo de recorte a partir dos params de rota. Departamento por
 * nome (validado contra o enum); equipe/cadeia por `employee-N`/`clevel-N`
 * (validado contra a empresa da rota). Retorna `null` para alvo inválido
 * ou de outra empresa. Comum às duas rotas de recorte (RV-14). §8.06.6b.
 */
export async function resolveRecorteAlvo(
  db: RoipDatabase,
  companyId: number,
  tipo: 'departamento' | 'equipe' | 'cadeia',
  alvoRaw: string,
): Promise<RecorteAlvoResolvido | null> {
  if (tipo === 'departamento') {
    const dept = decodeURIComponent(alvoRaw);
    if (!isDepartamento(dept)) {
      return null;
    }
    return {
      alvo: { tipo: 'departamento', departamento: dept },
      titulo: `Departamento — ${dept}`,
    };
  }
  const m = /^(employee|clevel)-(\d+)$/.exec(alvoRaw);
  if (m === null) {
    return null;
  }
  const leaderTipo = m[1] === 'clevel' ? 'clevel' : 'employee';
  const leaderId = Number(m[2]);
  const registro =
    leaderTipo === 'clevel'
      ? await getCLevelMemberById(db, leaderId)
      : await getEmployeeById(db, leaderId);
  if (registro === undefined || registro.companyId !== companyId) {
    return null;
  }
  const rotulo = tipo === 'equipe' ? 'Equipe direta' : 'Cadeia total';
  return {
    alvo: { tipo, leader: { tipo: leaderTipo, id: leaderId } },
    titulo: `${rotulo} — ${registro.name}`,
  };
}

/**
 * Autoriza o acesso a um recorte pela regra PC1h (cadeia descendente
 * própria). `scope === null` (Bruno, RH, C-level total) libera qualquer
 * alvo. Com escopo restrito (C-level restrito, líder):
 *   - equipe/cadeia: acessível se o líder-dono é o próprio usuário
 *     (`selfNodeId`) ou está na cadeia descendente (`scope`);
 *   - departamento: acessível só se TODAS as pessoas do recorte estão na
 *     cadeia (um departamento com alguém fora da cadeia é negado, para
 *     não expor números de fora dela num agregado). Decisão via régua
 *     única `everyEmployeeInScope` (D5).
 * §8.06.6b.
 */
export async function canAccessRecorte(
  db: RoipDatabase,
  companyId: number,
  scope: ReadonlySet<string> | null,
  selfNodeId: string,
  alvo: RecorteAlvo,
): Promise<boolean> {
  if (scope === null) {
    return true;
  }
  if (alvo.tipo === 'departamento') {
    const ids = await listDepartmentEmployeeIds(db, companyId, alvo.departamento);
    if (ids.length === 0) {
      return false;
    }
    return everyEmployeeInScope(ids, scope);
  }
  const leaderNode = `${alvo.leader.tipo}-${alvo.leader.id}`;
  if (leaderNode === selfNodeId) {
    return true;
  }
  return scope.has(leaderNode);
}
