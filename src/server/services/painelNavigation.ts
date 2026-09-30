// ROIP APP 9BOX — service canonico compartilhado dos paineis de
// controle (ME-UX-CONSOLIDACAO-P3b D4a-clevel/D4b/D4c).
//
// Consolida:
//   - `countCLevelDiretos(db, clevelId)`  — total de liderados diretos
//     do C-level (employees ativos vinculados via `employeeLeaderHistory`
//     com `clevelId=X` + `dataFim IS NULL`). Consumido pelo painel-clevel
//     para popular o card canonico "9-Box equipe direta" (D4a-clevel).
//   - `listActiveLeaders(db, companyId)`  — lista de todos os lideres
//     ativos da empresa (employees + cLevelMembers que aparecem como
//     `liderId` ou `clevelId` em `employeeLeaderHistory` com `dataFim
//     IS NULL`), ordenada por nome. Consumida pelo card "Ver equipes"
//     em painel-rh (D4b) e em super-admin/empresa (D4c).
//
// **RV-13.** Consumido pelos 3 callsites nomeados nas assinaturas.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { and, count, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers, employeeLeaderHistory, employees } from '../../db/schema';

/**
 * Conta os liderados diretos ativos de um C-level (D4a-clevel). Usa o
 * padrao canonico `employeeLeaderHistory.clevelId=X AND dataFim IS NULL`
 * ja aplicado pelo motor de plenitude, clima, IQL e demais services
 * agregados. Retorna 0 se o C-level nao tiver liderados diretos.
 */
export async function countCLevelDiretos(db: RoipDatabase, clevelId: number): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employeeLeaderHistory.clevelId, clevelId),
        isNull(employeeLeaderHistory.dataFim),
        eq(employees.status, 'ativo'),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Linha canonica retornada por `listActiveLeaders`. O `liderTipo`
 * discrimina qual tabela originou o registro (`employees` ou
 * `cLevelMembers`) e, junto com `liderId`, monta o alvo canonico
 * `${liderTipo}-${liderId}` das rotas `/dashboard-recorte/equipe/[alvo]`
 * (contrato bit-a-bit do `resolveRecorteAlvo`).
 */
export interface ActiveLeaderRow {
  readonly liderId: number;
  readonly liderTipo: 'employee' | 'clevel';
  readonly name: string;
  readonly departamento: string;
}

/**
 * Lista todos os lideres ativos da empresa (D4b + D4c). Faz duas
 * queries paralelas em `employeeLeaderHistory` (uma por tipo de
 * lider) com JOIN nas tabelas de referencia (`employees`,
 * `cLevelMembers`) para obter nome + departamento. Deduplicacao por
 * `(liderTipo, liderId)` em memoria (um mesmo lider pode aparecer em
 * varias linhas de historico ativas). Ordem canonica alfabetica por
 * nome (decisao Bruno D4b/c).
 */
export async function listActiveLeaders(
  db: RoipDatabase,
  companyId: number,
): Promise<readonly ActiveLeaderRow[]> {
  const [empRows, cLevelRows] = await Promise.all([
    db
      .selectDistinct({
        liderId: employees.id,
        name: employees.name,
        departamento: employees.departamento,
      })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employees.id, employeeLeaderHistory.liderId))
      .where(
        and(
          eq(employees.companyId, companyId),
          eq(employees.status, 'ativo'),
          isNull(employeeLeaderHistory.dataFim),
        ),
      ),
    db
      .selectDistinct({
        liderId: cLevelMembers.id,
        name: cLevelMembers.name,
        departamento: cLevelMembers.departamento,
      })
      .from(employeeLeaderHistory)
      .innerJoin(cLevelMembers, eq(cLevelMembers.id, employeeLeaderHistory.clevelId))
      .where(
        and(
          eq(cLevelMembers.companyId, companyId),
          eq(cLevelMembers.status, 'ativo'),
          isNull(employeeLeaderHistory.dataFim),
        ),
      ),
  ]);
  const rows: ActiveLeaderRow[] = [];
  for (const r of empRows) {
    rows.push({
      liderId: Number(r.liderId),
      liderTipo: 'employee',
      name: String(r.name),
      departamento: String(r.departamento),
    });
  }
  for (const r of cLevelRows) {
    rows.push({
      liderId: Number(r.liderId),
      liderTipo: 'clevel',
      name: String(r.name),
      departamento: String(r.departamento),
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return rows;
}
