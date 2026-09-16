// ROIP APP 9BOX — ficha cadastral somente leitura (DOC 05 §14.10,
// ME-fila6 D1).
//
// Pop-up "Ficha cadastral — [Nome]" aberto pelo icone 📇 da coluna "Dados
// cadastrais" em `/todos-os-colaboradores`, `/minha-equipe` e
// `/cadeia-indireta`. Antes desta ME o icone navegava para
// `/colaborador/[id]/editar`, rota exclusiva de Bruno e RH — Lider e
// C-level caiam em acesso negado.
//
// Escopo de leitura por visualizador:
// - Bruno: qualquer employee da empresa informada.
// - RH puro / RH-Lider: qualquer employee da propria empresa (C-levels nao
//   sao employees — PC1a preservada).
// - C-level `clevel_full` (CU/CT): qualquer employee da propria empresa.
// - C-level `clevel_restricted` (CF) e Lider: cadeia descendente propria
//   (PC1h, `resolveHierarchicalScope`).
// Fora do escopo ou inexistente: `null` (mesma resposta — sem enumeracao).
//
// **RV-12.** Drizzle tipado. **RV-14.** 100 colunas.

import { and, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers, employeeLeaderHistory, employees } from '../../db/schema';
import type { Departamento, JobFamily, NivelHierarquico } from '../../db/schema';
import {
  loadPlatformMenuContext,
  type PlatformSession,
} from '../../lib/session/platformMenuContext';

import { resolveHierarchicalScope } from './hierarchicalScope';

/** Dados exibidos no pop-up (campos do formulario de cadastro). */
export interface FichaCadastral {
  readonly id: number;
  readonly name: string;
  readonly cpf: string;
  readonly email: string | null;
  readonly dataNascimento: Date;
  readonly dataAdmissao: Date;
  readonly cargo: string;
  readonly cbo: string;
  readonly descricaoCBO: string;
  readonly departamento: Departamento;
  readonly senioridade: 'junior' | 'pleno' | 'senior';
  readonly jobFamily: JobFamily;
  readonly nivelHierarquico: NivelHierarquico;
  readonly status: 'ativo' | 'inativo';
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly liderName: string | null;
  readonly liderTipo: 'employee' | 'clevel' | null;
}

/** Visualizador autenticado. */
type FichaCadastralViewer = { readonly kind: 'super_admin' } | PlatformSession;

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

async function viewerCanSee(
  db: RoipDatabase,
  viewer: PlatformSession,
  employeeId: number,
): Promise<boolean> {
  if (viewer.role === 'rh' || viewer.role === 'rh_lider') {
    return true;
  }
  const menu = await loadPlatformMenuContext(db, viewer);
  if (menu === null) {
    return false;
  }
  if (menu.profileKey === 'clevel_full') {
    return true;
  }
  const scope = await resolveHierarchicalScope(
    db,
    { role: viewer.role, userId: viewer.userId, companyId: viewer.companyId },
    menu.cLevel ?? undefined,
  );
  if (scope === null) {
    return true;
  }
  return scope.has(`employee-${employeeId}`);
}

/**
 * Carrega a ficha do employee `employeeId` da empresa `companyId` se o
 * visualizador tiver escopo de leitura. Retorna `null` caso contrario.
 */
export async function loadFichaCadastralForViewer(
  db: RoipDatabase,
  viewer: FichaCadastralViewer,
  companyId: number,
  employeeId: number,
): Promise<FichaCadastral | null> {
  if (viewer.kind === 'platform' && viewer.companyId !== companyId) {
    return null;
  }
  const liderEmp = alias(employees, 'liderEmpFicha');
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      cpf: employees.cpf,
      email: employees.email,
      dataNascimento: employees.dataNascimento,
      dataAdmissao: employees.dataAdmissao,
      cargo: employees.cargo,
      cbo: employees.cbo,
      descricaoCBO: employees.descricaoCBO,
      departamento: employees.departamento,
      senioridade: employees.senioridade,
      jobFamily: employees.jobFamily,
      nivelHierarquico: employees.nivelHierarquico,
      status: employees.status,
      isRH: employees.isRH,
      isLider: employees.isLider,
      isResponsavelFinanceiro: employees.isResponsavelFinanceiro,
      liderName: liderEmp.name,
      clevelName: cLevelMembers.name,
    })
    .from(employees)
    .leftJoin(
      employeeLeaderHistory,
      and(
        eq(employeeLeaderHistory.employeeId, employees.id),
        isNull(employeeLeaderHistory.dataFim),
      ),
    )
    .leftJoin(liderEmp, eq(liderEmp.id, employeeLeaderHistory.liderId))
    .leftJoin(cLevelMembers, eq(cLevelMembers.id, employeeLeaderHistory.clevelId))
    .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  if (viewer.kind === 'platform') {
    const allowed = await viewerCanSee(db, viewer, employeeId);
    if (!allowed) {
      return null;
    }
  }
  const liderTipo = row.liderName !== null ? 'employee' : row.clevelName !== null ? 'clevel' : null;
  return {
    id: row.id,
    name: row.name,
    cpf: row.cpf,
    email: row.email,
    dataNascimento: toDate(row.dataNascimento),
    dataAdmissao: toDate(row.dataAdmissao),
    cargo: row.cargo,
    cbo: row.cbo,
    descricaoCBO: row.descricaoCBO,
    departamento: row.departamento,
    senioridade: row.senioridade,
    jobFamily: row.jobFamily,
    nivelHierarquico: row.nivelHierarquico,
    status: row.status ?? 'ativo',
    isRH: row.isRH === true,
    isLider: row.isLider === true,
    isResponsavelFinanceiro: row.isResponsavelFinanceiro === true,
    liderName: row.liderName ?? row.clevelName ?? null,
    liderTipo,
  };
}
