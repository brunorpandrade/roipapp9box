// ROIP APP 9BOX — entry TypeScript reset+reseed Bebidas Ubatuba
// (ME-080b Dispatch 5, CC075).
//
// Executa DELETE canonico das tabelas populadas pelo seed Ubatuba (restrito
// por companyId=2) e reaplica o seed. FOREIGN_KEY_CHECKS=0 apenas dentro
// da janela do DELETE, rehabilitado antes do reseed.
//
// RV-12 canonica: DELETE via API tipada do Drizzle (nao SQL cru). A unica
// primitiva SQL literal aqui e SET FOREIGN_KEY_CHECKS — Drizzle nao expoe
// helper para variavel de sessao MySQL. Exceção canonica pontual e
// justificavel: o valor e literal fixo, sem interpolacao externa, isolado
// a este script standalone de operacao.
//
// Ordem canonica de DELETE (inversa da ordem de INSERT do seed):
// notifications -> alerts -> dataAccessLog -> climateEngagementData ->
// responsavelFinanceiroTransferLog -> lgpdConsents -> cycleSchedule ->
// companyEconomicDiagnosis -> monthlyClosureStatus -> companyMonthlyData ->
// companyJobFamilies -> employees -> cLevelMembers -> companies.

import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';

import { closeDbClient, createDbClient } from '../src/db/client';
import {
  alerts,
  cLevelMembers,
  climateEngagementData,
  companies,
  companyEconomicDiagnosis,
  companyJobFamilies,
  companyMonthlyData,
  cycleSchedule,
  dataAccessLog,
  employees,
  lgpdConsents,
  monthlyClosureStatus,
  notifications,
  responsavelFinanceiroTransferLog,
} from '../src/db/schema';
import { UBATUBA_COMPANY_ID } from '../src/db/seed/ubatuba/constants';
import { seedUbatuba } from '../src/db/seed/ubatuba/loadUbatubaFixtures';

const BCRYPT_COST_PRODUCTION = 12;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }

  console.log(
    `[reset-reseed-ubatuba] Iniciando. Company alvo: id=${UBATUBA_COMPANY_ID} (Bebidas Ubatuba).`,
  );
  const client = createDbClient(url);

  try {
    console.log('[reset-reseed-ubatuba] Fase 1: DELETE canonico (FK_CHECKS=0).');
    // Excecao canonica pontual RV-12: SET FOREIGN_KEY_CHECKS = 0 e um
    // literal fixo, seguro contra injecao (nao interpola input externo).
    await client.db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
    try {
      // Ordem canonica: cada DELETE via API tipada do Drizzle.
      await client.db.delete(notifications).where(eq(notifications.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE notifications WHERE companyId=${UBATUBA_COMPANY_ID} OK`);

      await client.db.delete(alerts).where(eq(alerts.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE alerts WHERE companyId=${UBATUBA_COMPANY_ID} OK`);

      await client.db.delete(dataAccessLog).where(eq(dataAccessLog.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE dataAccessLog WHERE companyId=${UBATUBA_COMPANY_ID} OK`);

      await client.db
        .delete(climateEngagementData)
        .where(eq(climateEngagementData.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE climateEngagementData WHERE companyId=${UBATUBA_COMPANY_ID} OK`);

      await client.db
        .delete(responsavelFinanceiroTransferLog)
        .where(eq(responsavelFinanceiroTransferLog.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE responsavelFinanceiroTransferLog OK`);

      await client.db.delete(lgpdConsents).where(eq(lgpdConsents.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE lgpdConsents OK`);

      await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE cycleSchedule OK`);

      await client.db
        .delete(companyEconomicDiagnosis)
        .where(eq(companyEconomicDiagnosis.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE companyEconomicDiagnosis OK`);

      await client.db
        .delete(monthlyClosureStatus)
        .where(eq(monthlyClosureStatus.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE monthlyClosureStatus OK`);

      await client.db
        .delete(companyMonthlyData)
        .where(eq(companyMonthlyData.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE companyMonthlyData OK`);

      await client.db
        .delete(companyJobFamilies)
        .where(eq(companyJobFamilies.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE companyJobFamilies OK`);

      await client.db.delete(employees).where(eq(employees.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE employees OK`);

      await client.db.delete(cLevelMembers).where(eq(cLevelMembers.companyId, UBATUBA_COMPANY_ID));
      console.log(`  DELETE cLevelMembers OK`);

      await client.db.delete(companies).where(eq(companies.id, UBATUBA_COMPANY_ID));
      console.log(`  DELETE companies WHERE id=${UBATUBA_COMPANY_ID} OK`);
    } finally {
      await client.db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    }

    console.log('[reset-reseed-ubatuba] Fase 2: reseed canonico.');
    const result = await seedUbatuba(client.db, {
      hashPassword: (plain: string) => bcrypt.hash(plain, BCRYPT_COST_PRODUCTION),
    });

    if (!result.applied) {
      console.error(
        `[reset-reseed-ubatuba] INESPERADO: seed nao aplicou. Reason: ${result.reason}`,
      );
      process.exit(3);
    }

    console.log('[reset-reseed-ubatuba] Contagens por tabela:');
    for (const [table, count] of Object.entries(result.counts ?? {})) {
      console.log(`  ${table}: ${count}`);
    }
    console.log('[reset-reseed-ubatuba] DONE');
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`FAIL reset-reseed-ubatuba: ${msg}`);
    if (stack) console.error(stack);
    process.exit(1);
  } finally {
    await closeDbClient(client);
  }
}

void main();
