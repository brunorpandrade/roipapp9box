// ROIP APP 9BOX — derivacao canonica bit-exact de employeeTerminationEvents
// da Bebidas Ubatuba (ME-080e D4-final).
//
// Consome nr1_turnover_events.json (13 rows). Replica bit-exact o
// mapTerminationToRow do Nativa (loadFixtures.ts linhas 987-1001):
//   - Se `actorId` presente no JSON → actorTipo='employee', actor=<actorId+1000>.
//   - Se ausente → actorTipo='superAdmin', actorId=1 (UBATUBA_SUPER_ADMIN_ID).
//   - departamentoSnapshot: mapeia codigo interno (PRO, DIR, etc.) para nome canonico.
//
// Aplica shift +1000 em employeeId + actorId (quando employee).
// SUPER_ADMIN_ID=1 permanece (mesmo super admin em ambas empresas).

import { loadFixture } from '../nativa/loadJsonFixtures';
import type { NivelHierarquico } from '../../schema/enums';

import { UBATUBA_COMPANY_ID, UBATUBA_EMPLOYEE_ID_SHIFT, UBATUBA_SUPER_ADMIN_ID } from './constants';

interface TurnoverJsonRow {
  readonly employeeId: number;
  readonly companyId: number;
  readonly dataInativacao: string;
  readonly motivo: 'voluntario' | 'involuntario';
  readonly nivelHierarquicoSnapshot: string;
  readonly departamentoSnapshot: string;
  readonly departamentoNome?: string;
  readonly actorId?: number;
  readonly createdAt: string;
}

export interface DerivedUbatubaTerminationRow {
  readonly companyId: number;
  readonly employeeId: number;
  readonly dataInativacao: Date;
  readonly motivo: 'voluntario' | 'involuntario';
  readonly nivelHierarquicoSnapshot: NivelHierarquico;
  readonly departamentoSnapshot: string;
  readonly actorTipo: 'employee' | 'superAdmin';
  readonly actorId: number;
  readonly createdAt: Date;
}

/** Mapping canonico dos codigos internos do MD (DIR/FIN/etc) para o enum canonico. */
function mapDepartamentoInterno(codigo: string): string {
  const mapa: Record<string, string> = {
    DIR: 'Diretoria',
    FIN: 'Financeiro',
    ADM: 'Administrativo',
    QUA: 'Qualidade',
    PRO: 'Produção',
    LOG: 'Logística',
    COM: 'Comercial',
    RH: 'Recursos Humanos',
  };
  return mapa[codigo] ?? codigo;
}

export function deriveUbatubaTermination(): readonly DerivedUbatubaTerminationRow[] {
  const fixture = loadFixture<TurnoverJsonRow[]>('nr1_turnover_events.json');
  const rows: DerivedUbatubaTerminationRow[] = fixture.data.map((r) => {
    const actorTipo = r.actorId != null ? ('employee' as const) : ('superAdmin' as const);
    const actorIdShifted =
      r.actorId != null ? r.actorId + UBATUBA_EMPLOYEE_ID_SHIFT : UBATUBA_SUPER_ADMIN_ID;
    return {
      companyId: UBATUBA_COMPANY_ID,
      employeeId: r.employeeId + UBATUBA_EMPLOYEE_ID_SHIFT,
      dataInativacao: new Date(r.dataInativacao + 'T00:00:00.000Z'),
      motivo: r.motivo,
      nivelHierarquicoSnapshot: r.nivelHierarquicoSnapshot as NivelHierarquico,
      departamentoSnapshot: mapDepartamentoInterno(r.departamentoSnapshot),
      actorTipo,
      actorId: actorIdShifted,
      createdAt: new Date(r.createdAt + 'T00:00:00.000Z'),
    };
  });
  return Object.freeze(rows);
}

export const UBATUBA_TERMINATION_TOTAL_ESPERADO = 13 as const;
