// ROIP APP 9BOX — derivacao canonica bit-exact de individualProfilePlaceholders
// da Bebidas Ubatuba (ME-080e Dispatch 3).
//
// Estrategia canonica: replica 1:1 a logica de deriveProfilePlaceholders
// do Nativa (deriveMisc.ts linhas 559-593) aplicando shift +1000 no
// userId conforme userType. Nao consome JSON — deriva dos constants
// NATIVA_CLEVELS + NATIVA_EMPLOYEES via wrapper puro.
//
// Total canonico bit-exact: 69 rows (3 C-levels pendentes + 66
// employees respondidos).
//   - C-levels: status='pendente', respondidoEm=null, createdAt=admissao.
//   - Employees: status='respondido', respondidoEm=max(admissao+30d,
//     2026-02-15), createdAt=admissao.
//
// RV-13: consumido por seedUbatubaOperacionalD3.ts + testes.
// RV-14: um statement por linha, largura <= 100 colunas.
// RV-15: contagem 69 medida e exportada.

import { NATIVA_CLEVELS, NATIVA_EMPLOYEES } from '../nativa/constants';

import {
  UBATUBA_CLEVEL_ID_SHIFT,
  UBATUBA_COMPANY_ID,
  UBATUBA_EMPLOYEE_ID_SHIFT,
} from './constants';

/**
 * Shape canonico bit-exact para INSERT em individualProfilePlaceholders
 * da Ubatuba.
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
 * Deriva as 69 rows canonicas bit-exact de individualProfilePlaceholders
 * da Bebidas Ubatuba (companies.id=2). Espelha 1:1 a fixture Nativa
 * (mesmas datas, mesmos status) com shift +1000 nos IDs.
 *
 * @returns array congelado de exatamente 69 registros.
 */
export function deriveUbatubaProfilePlaceholders(): readonly DerivedUbatubaProfilePlaceholder[] {
  const rows: DerivedUbatubaProfilePlaceholder[] = [];

  // 3 C-levels pendentes (shift +1000 → IDs 1001, 1002, 1003).
  for (const cl of NATIVA_CLEVELS) {
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      userType: 'clevel',
      userId: cl.id + UBATUBA_CLEVEL_ID_SHIFT,
      status: 'pendente',
      createdAt: new Date(cl.dataAdmissao + 'T10:00:00.000Z'),
      respondidoEm: null,
    });
  }

  // 66 employees respondidos (shift +1000 → IDs 1004..1069).
  // Data canonica: max(admissao + 30 dias, 2026-02-15).
  for (const emp of NATIVA_EMPLOYEES) {
    const admissao = new Date(emp.dataAdmissao);
    const trintaDiasApos = new Date(admissao.getTime() + 30 * 24 * 3600 * 1000);
    const dataMinima = new Date('2026-02-15T10:00:00.000Z');
    const respondidoEm = trintaDiasApos > dataMinima ? trintaDiasApos : dataMinima;

    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      userType: 'employee',
      userId: emp.id + UBATUBA_EMPLOYEE_ID_SHIFT,
      status: 'respondido',
      createdAt: new Date(emp.dataAdmissao + 'T10:00:00.000Z'),
      respondidoEm,
    });
  }

  return Object.freeze(rows);
}

/** Contagem canonica bit-exact esperada. */
export const UBATUBA_PROFILE_PLACEHOLDERS_TOTAL_ESPERADO = 69 as const;
