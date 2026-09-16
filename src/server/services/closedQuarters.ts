// ROIP APP 9BOX — trimestres fechados da empresa (DOC 03 §13, ME-fila6 D2).
//
// Trimestre fechado = os 3 meses com `monthlyClosureStatus.status =
// 'fechado'`. Extraido das 3 copias identicas das server actions da
// Central de Relatorios (Bruno, RH, C-level) para atender tambem a pagina
// e ao card de turnover (L125).
//
// **RV-12.** Drizzle tipado. **RV-14.** 100 colunas.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { monthlyClosureStatus } from '../../db/schema';

/** Trimestre fechado com rotulo de exibicao ("3º trimestre de 2026"). */
interface ClosedQuarterItem {
  readonly trimestre: string;
  readonly label: string;
}

/** Rotulo de exibicao de `YYYY-QN`. */
function formatClosedQuarterLabel(trimestre: string): string {
  const match = /^(\d{4})-Q(\d)$/.exec(trimestre);
  return match !== null ? `${match[2]}º trimestre de ${match[1]}` : trimestre;
}

/** Lista os trimestres fechados da empresa, do mais recente ao mais antigo. */
export async function listClosedQuarters(
  db: RoipDatabase,
  companyId: number,
): Promise<ClosedQuarterItem[]> {
  const rows = await db
    .select({ mes: monthlyClosureStatus.mes })
    .from(monthlyClosureStatus)
    .where(
      and(
        eq(monthlyClosureStatus.companyId, companyId),
        eq(monthlyClosureStatus.status, 'fechado'),
      ),
    )
    .orderBy(asc(monthlyClosureStatus.mes));

  const mesSet = new Set(rows.map((r) => r.mes));
  const trimestreMap = new Map<string, number>();
  for (const m of mesSet) {
    const [yearStr, monthStr] = m.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const q = Math.ceil(month / 3);
    const tri = `${year}-Q${q}`;
    trimestreMap.set(tri, (trimestreMap.get(tri) ?? 0) + 1);
  }

  const closed: ClosedQuarterItem[] = [];
  for (const [tri, total] of trimestreMap.entries()) {
    if (total >= 3) {
      closed.push({ trimestre: tri, label: formatClosedQuarterLabel(tri) });
    }
  }
  closed.sort((a, b) => b.trimestre.localeCompare(a.trimestre));
  return closed;
}
