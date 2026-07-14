// ROIP APP 9BOX — service `companyEconomicDiagnosis` (ME-014).
//
// Repositorio tipado da tabela canonica `companyEconomicDiagnosis` (DOC 01
// §7.5). Diagnostico economico trimestral da empresa — agregacao das
// linhas trimestrais de todos os colaboradores + snapshot das faixas de
// ROI do segmento vigentes no momento do calculo.
//
// UNIQUE (`companyId`, `trimestre`) garante uma linha unica por trimestre
// por empresa. Rota canonica de "criar ou atualizar" vive no router (Bloco
// B3): tenta insert; em colisao chama `updateCompanyEconomicDiagnosis`.
//
// Snapshot das faixas de ROI (`roiSegmentoMinimo`, `roiSegmentoMaximo`,
// `roiMuitoBom`, `faturamentoIdeal`) e capturado no momento do calculo e
// nao se recalcula retroativamente quando o cadastro da empresa muda. O
// enum `statusDiagnostico` classifica o ROI da empresa contra o segmento
// (`excelente | muito_bom | aceitavel | critico | sem_referencia`).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companyEconomicDiagnosis } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `companyEconomicDiagnosis`). */
export type NewCompanyEconomicDiagnosis = typeof companyEconomicDiagnosis.$inferInsert;

/**
 * Insere uma linha trimestral do diagnostico economico da empresa.
 * Retorna o `id` autogerado. Erros de FK (`companyId`) e de UNIQUE
 * (`uq_econDiag`) sobem como excecoes do mysql2.
 */
export async function insertCompanyEconomicDiagnosis(
  db: RoipDatabase,
  data: NewCompanyEconomicDiagnosis,
): Promise<number> {
  const [result] = await db.insert(companyEconomicDiagnosis).values(data).$returningId();
  if (!result) {
    throw new Error(
      'insertCompanyEconomicDiagnosis: insert retornou sem id (estado inconsistente)',
    );
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getCompanyEconomicDiagnosisById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(companyEconomicDiagnosis)
    .where(eq(companyEconomicDiagnosis.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca pelo par (companyId, trimestre) — o UNIQUE canonico da §7.5.
 * Retorna `undefined` se nao existir. Este e o caminho canonico usado
 * pelo dashboard executivo e pelos motores de agregacao para resolver
 * o diagnostico daquele trimestre.
 */
export async function getCompanyEconomicDiagnosisByQuarter(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
) {
  const rows = await db
    .select()
    .from(companyEconomicDiagnosis)
    .where(
      and(
        eq(companyEconomicDiagnosis.companyId, companyId),
        eq(companyEconomicDiagnosis.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os diagnosticos economicos de uma empresa em ordem
 * cronologica crescente por `trimestre` (YYYY-QN ordena lexicograficamente
 * igual a cronologico). Consumida pelo dashboard executivo (linha do
 * tempo do ROI da empresa) e pelos exportaveis.
 */
export async function listCompanyEconomicDiagnosisByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(companyEconomicDiagnosis)
    .where(eq(companyEconomicDiagnosis.companyId, companyId))
    .orderBy(asc(companyEconomicDiagnosis.trimestre));
}

/**
 * Atualiza todos os campos calculados pelo motor de diagnostico
 * economico: agregados financeiros (`faturamentoMedioTrimestral`,
 * `folhaTotalMedia`, `faturamentoPotencial`), metricas (`roiEmpresa`,
 * `folhaPorcentagem`), snapshot das faixas do segmento
 * (`roiSegmentoMinimo`, `roiSegmentoMaximo`, `roiMuitoBom`,
 * `faturamentoIdeal`), classificacao final (`statusDiagnostico`) e
 * `calculadoEm`. Retorna o numero de linhas afetadas.
 */
export async function updateCompanyEconomicDiagnosis(
  db: RoipDatabase,
  id: number,
  patch: {
    faturamentoMedioTrimestral: string;
    folhaTotalMedia: string;
    faturamentoPotencial: string | null;
    roiEmpresa: string;
    folhaPorcentagem: string;
    roiSegmentoMinimo: string | null;
    roiSegmentoMaximo: string | null;
    roiMuitoBom: string | null;
    faturamentoIdeal: string | null;
    statusDiagnostico: 'excelente' | 'muito_bom' | 'aceitavel' | 'critico' | 'sem_referencia';
    calculadoEm: Date;
  },
): Promise<number> {
  const [result] = await db
    .update(companyEconomicDiagnosis)
    .set({
      faturamentoMedioTrimestral: patch.faturamentoMedioTrimestral,
      folhaTotalMedia: patch.folhaTotalMedia,
      faturamentoPotencial: patch.faturamentoPotencial,
      roiEmpresa: patch.roiEmpresa,
      folhaPorcentagem: patch.folhaPorcentagem,
      roiSegmentoMinimo: patch.roiSegmentoMinimo,
      roiSegmentoMaximo: patch.roiSegmentoMaximo,
      roiMuitoBom: patch.roiMuitoBom,
      faturamentoIdeal: patch.faturamentoIdeal,
      statusDiagnostico: patch.statusDiagnostico,
      calculadoEm: patch.calculadoEm,
    })
    .where(eq(companyEconomicDiagnosis.id, id));
  return result.affectedRows;
}

/**
 * Remove uma linha pelo `id`. Somente para teardown de testes — em
 * producao a tabela e retentiva (o ON DELETE RESTRICT sobre `companies`
 * bloqueia). Retorna o numero de linhas afetadas.
 */
export async function deleteCompanyEconomicDiagnosisById(
  db: RoipDatabase,
  id: number,
): Promise<number> {
  const [result] = await db
    .delete(companyEconomicDiagnosis)
    .where(eq(companyEconomicDiagnosis.id, id));
  return result.affectedRows;
}
