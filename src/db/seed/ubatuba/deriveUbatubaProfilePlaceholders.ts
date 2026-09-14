// ROIP APP 9BOX — derivacao canonica de individualProfilePlaceholders
// da Bebidas Ubatuba (ME-080e Dispatch 3, ampliada na ME-fila2-seed
// para consumir a fixture canonica S366).
//
// Estrategia canonica ME-fila2-seed: consome o JSON pinado por SHA-256
// `individual_profile_placeholders.json` (fixture da Nativa) via
// `loadFixture` e aplica shift +UBATUBA_EMPLOYEE_ID_SHIFT (=1000) para
// employees e +UBATUBA_CLEVEL_ID_SHIFT para C-levels. Elimina hard-code
// que invertia a distribuicao canonica (S260 aprovada).
//
// Distribuicao canonica bit-a-bit do JSON:
//   - 3 C-levels    status='respondido' respondidoEm='2026-02-15'
//   - 63 employees  status='respondido' respondidoEm=data canonica
//   -  3 employees  status='pendente'   respondidoEm=null
// Total 69 rows. Shift +1000: C-levels 1001..1003, employees
// 1004..1069 (respondidos 63 + pendentes 3).
//
// `createdAt` canonico: derivado de `dataAdmissao` do C-level ou do
// employee (proxy: quando o placeholder foi materializado no sistema).
// Fonte: constants Nativa (NATIVA_CLEVELS + NATIVA_EMPLOYEES) — o JSON
// nao carrega `dataAdmissao` porque nao eh coluna canonica de
// placeholders (dataAdmissao ja fica em `employees.dataAdmissao`).
//
// RV-13: consumido por seedUbatubaOperacionalD3.ts + testes.
// RV-14: um statement por linha, largura <= 100 colunas.
// RV-15: contagem 69 medida e exportada.

import { NATIVA_CLEVELS, NATIVA_EMPLOYEES } from '../nativa/constants';
import { loadFixture } from '../nativa/loadJsonFixtures';

import {
  UBATUBA_CLEVEL_ID_SHIFT,
  UBATUBA_COMPANY_ID,
  UBATUBA_EMPLOYEE_ID_SHIFT,
} from './constants';

/**
 * Shape canonico para INSERT em `individualProfilePlaceholders` da
 * Ubatuba (idempotente entre Nativa e Ubatuba — mesmos campos schema).
 */
export interface DerivedUbatubaProfilePlaceholder {
  readonly companyId: number;
  readonly userType: 'employee' | 'clevel';
  readonly userId: number;
  readonly status:
    'pendente' | 'em_andamento' | 'respondido' | 'inconsistente' | 'aguardando_nova_resposta';
  readonly createdAt: Date;
  readonly respondidoEm: Date | null;
}

/**
 * Shape canonico das linhas do JSON `individual_profile_placeholders.json`.
 * Espelha exatamente os campos da fixture.
 */
interface PlaceholderJsonRow {
  readonly userType: 'employee' | 'clevel';
  readonly userId: number;
  readonly nome: string;
  readonly status:
    'pendente' | 'em_andamento' | 'respondido' | 'inconsistente' | 'aguardando_nova_resposta';
  readonly respondidoEm: string | null;
}

/**
 * Indice canonico de `dataAdmissao` por (userType, userId) sobre as
 * constants canonicas da Nativa. Usado para materializar `createdAt`
 * canonicamente coerente com a admissao — mesmo padrao do derivador
 * original (ME-080e Dispatch 3).
 */
function buildDataAdmissaoIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const cl of NATIVA_CLEVELS) {
    idx.set(`clevel:${cl.id}`, cl.dataAdmissao);
  }
  for (const emp of NATIVA_EMPLOYEES) {
    idx.set(`employee:${emp.id}`, emp.dataAdmissao);
  }
  return idx;
}

/**
 * Deriva 69 rows canonicas de individualProfilePlaceholders para a
 * Bebidas Ubatuba (companies.id=2). Espelha 1:1 a fixture canonica da
 * Nativa (mesmos status, mesmos respondidoEm) com shift +1000 nos IDs
 * e `createdAt` canonicamente derivado de dataAdmissao.
 *
 * @returns array congelado de exatamente 69 registros.
 */
export function deriveUbatubaProfilePlaceholders(): readonly DerivedUbatubaProfilePlaceholder[] {
  const fixture = loadFixture<PlaceholderJsonRow[]>('individual_profile_placeholders.json');
  const dataAdmissaoIndex = buildDataAdmissaoIndex();
  const rows: DerivedUbatubaProfilePlaceholder[] = [];

  for (const src of fixture.data) {
    const shift = src.userType === 'clevel' ? UBATUBA_CLEVEL_ID_SHIFT : UBATUBA_EMPLOYEE_ID_SHIFT;
    const admissaoKey = `${src.userType}:${src.userId}`;
    const dataAdmissao = dataAdmissaoIndex.get(admissaoKey);
    if (dataAdmissao === undefined) {
      throw new Error(
        `deriveUbatubaProfilePlaceholders: dataAdmissao ausente para ${admissaoKey}.`,
      );
    }
    const createdAt = new Date(dataAdmissao + 'T10:00:00.000Z');
    const respondidoEm =
      src.respondidoEm !== null ? new Date(src.respondidoEm + 'T10:00:00.000Z') : null;
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      userType: src.userType,
      userId: src.userId + shift,
      status: src.status,
      createdAt,
      respondidoEm,
    });
  }

  return Object.freeze(rows);
}

/** Contagem canonica esperada. */
export const UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO = 69 as const;
