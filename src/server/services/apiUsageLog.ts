// ROIP APP 9BOX — service `apiUsageLog` (ME-017).
//
// Repositorio tipado da tabela canonica `apiUsageLog` (DOC 01 §13.3).
// Governanca de custo da Claude API — controle do limite diario de 5
// geracoes do Relatorio executivo por empresa.
//
// UNIQUE `uq_apiUsage` sobre (`companyId`, `tipo`, `dataUso`). Um
// registro por dia por empresa. Cada geracao incrementa `contador` na
// mesma linha (§13.3 — "upsert"). O gate do botao de geracao consulta
// `contador >= 5` antes de permitir nova chamada.
//
// Incremento em duas etapas (RV-12 proibe `sql\`contador + 1\``):
// 1) SELECT do contador atual pela chave logica.
// 2) INSERT com contador=1 (se nao existir) ou UPDATE com contador
//    absoluto (existente + 1). Race entre callers concorrentes e
//    mitigada pela UNIQUE — o INSERT perdedor levanta ER_DUP_ENTRY.
//
// `dataUso` e coluna DATE — o caller fornece `Date` e o Drizzle
// serializa (L31). Nao ha assertion de string em torno do retorno.

import { and, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { apiUsageLog } from '../../db/schema';

/** Tipo canonico de consumo (§13.3 — enum reservado para extensao). */
type ApiUsageTipo = 'relatorio_executivo';

/**
 * Incrementa o contador diario de uso da API para (`companyId`,
 * `tipo`, `dataUso`). Retorna o novo valor do `contador` (1 em caso
 * de primeira gravacao do dia; N+1 se ja havia N).
 */
export async function incrementApiUsage(
  db: RoipDatabase,
  companyId: number,
  tipo: ApiUsageTipo,
  dataUso: Date,
): Promise<number> {
  const existing = await db
    .select({ id: apiUsageLog.id, contador: apiUsageLog.contador })
    .from(apiUsageLog)
    .where(
      and(
        eq(apiUsageLog.companyId, companyId),
        eq(apiUsageLog.tipo, tipo),
        eq(apiUsageLog.dataUso, dataUso),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    await db.insert(apiUsageLog).values({ companyId, tipo, dataUso, contador: 1 });
    return 1;
  }
  const linha = existing[0];
  if (!linha) {
    throw new Error('incrementApiUsage: leitura retornou linha vazia (estado inconsistente)');
  }
  const novoContador = (linha.contador ?? 0) + 1;
  await db.update(apiUsageLog).set({ contador: novoContador }).where(eq(apiUsageLog.id, linha.id));
  return novoContador;
}

/**
 * Le o contador de uso de um dia para uma empresa. Retorna 0 se nao
 * houver linha ainda para o dia.
 */
export async function getApiUsageForDay(
  db: RoipDatabase,
  companyId: number,
  tipo: ApiUsageTipo,
  dataUso: Date,
): Promise<number> {
  const rows = await db
    .select({ contador: apiUsageLog.contador })
    .from(apiUsageLog)
    .where(
      and(
        eq(apiUsageLog.companyId, companyId),
        eq(apiUsageLog.tipo, tipo),
        eq(apiUsageLog.dataUso, dataUso),
      ),
    )
    .limit(1);
  const linha = rows[0];
  if (!linha) return 0;
  return linha.contador ?? 0;
}

/** Busca a linha canonica pela chave logica. Retorna `undefined` se nao existir. */
export async function getApiUsageLogRow(
  db: RoipDatabase,
  companyId: number,
  tipo: ApiUsageTipo,
  dataUso: Date,
) {
  const rows = await db
    .select()
    .from(apiUsageLog)
    .where(
      and(
        eq(apiUsageLog.companyId, companyId),
        eq(apiUsageLog.tipo, tipo),
        eq(apiUsageLog.dataUso, dataUso),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Remove todo o log de uso da API de uma empresa (teardown de testes;
 * producao mantem retencao integral — §16.4). Retorna linhas afetadas.
 */
export async function deleteApiUsageLogByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db.delete(apiUsageLog).where(eq(apiUsageLog.companyId, companyId));
  return result.affectedRows;
}
