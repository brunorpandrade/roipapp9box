// ROIP APP 9BOX — entry TypeScript reset+reseed Nativa Alimentos
// (ME-fila7 — re-abertura completa apos correcao dos mappers de plenitude e
// Radar NR-1 no loader).
//
// Apaga TODOS os dados da empresa companyId=1 (Nativa Alimentos) e reaplica o
// seed a partir dos fixtures pinados, agora com o loader corrigido (plenitude
// 8 dimensoes, copsoqFactorScores.agregadoDe, copsoqCycleSnapshot.respostaInvalida).
//
// Recorte por tabela:
//   - companyId=1 direto (lote `deletions`).
//   - por employeeId dos employees da Nativa: employeeGoals, employeeLeaderHistory,
//     performanceMultiplierLog, portalReminderLog; e accessTokens por userId.
//   - por FK do pai: performanceVariableData (performanceDataId),
//     terminationInvoluntaryJustifications (terminationEventId).
//   - companies por id=1.
// `departments` nao e populada pelo seed Nativa e nao tem escopo de empresa: ignorada.
//
// NAO TOCA na Bebidas Ubatuba (companyId=2) nem no super-admin.
//
// RV-12: DELETE via API tipada do Drizzle. Unica primitiva SQL literal:
// SET FOREIGN_KEY_CHECKS (variavel de sessao MySQL) — literal fixo, isolado.
// Prerrequisito: DATABASE_URL obrigatoria; aborta com RC=2 se ausente.
// Uso: `npm run reset-reseed:nativa`.

import bcrypt from 'bcryptjs';
import { eq, inArray, sql } from 'drizzle-orm';

import { closeDbClient, createDbClient } from '../src/db/client';
import {
  accessTokens,
  aiConversations,
  alerts,
  apiUsageLog,
  cLevelMembers,
  climateEngagementData,
  companies,
  companyEconomicDiagnosis,
  companyJobFamilies,
  companyMonthlyData,
  copsoqCycleSnapshot,
  copsoqCycles,
  copsoqFactorScores,
  copsoq_responses,
  cycleSchedule,
  cycleUnlockRequests,
  dataAccessLog,
  developmentDialogs,
  digestExecutionLog,
  emailNotifications,
  emailQueue,
  employeeGoals,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
  executiveReportCache,
  individualProfileAssessments,
  individualProfilePlaceholders,
  individualProfileScores,
  instrumentA_responses,
  instrumentC_assessments,
  instrumentD_responses,
  instrumentUnlockLog,
  iqlData,
  leaderOnboardingNotes,
  leaderOnboardingStageLog,
  lgpdConsents,
  monthlyClosureStatus,
  monthlyUnlockLog,
  nineBoxCalculationLog,
  nineBoxClassifications,
  nr1AreaDivergenceAnalysis,
  notifications,
  performanceData,
  performanceMultiplierLog,
  performanceQuarterlyData,
  performanceVariableData,
  plenitudeData,
  portalReminderLog,
  radarNR1Reports,
  responsavelFinanceiroTransferLog,
  terminationInvoluntaryJustifications,
} from '../src/db/schema';
import { NATIVA_COMPANY_ID, seedNativa } from '../src/db/seed/nativa/loadFixtures';

const BCRYPT_COST_PRODUCTION = 12;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }

  console.log(
    `[reset-reseed-nativa] Iniciando. Company alvo: id=${NATIVA_COMPANY_ID} (Nativa Alimentos).`,
  );
  const client = createDbClient(url);
  const ID = NATIVA_COMPANY_ID;

  // Tabelas com companyId=1 direto.
  const deletions: ReadonlyArray<{ name: string; run: () => Promise<unknown> }> = [
    {
      name: 'notifications',
      run: () => client.db.delete(notifications).where(eq(notifications.companyId, ID)),
    },
    { name: 'alerts', run: () => client.db.delete(alerts).where(eq(alerts.companyId, ID)) },
    {
      name: 'emailQueue',
      run: () => client.db.delete(emailQueue).where(eq(emailQueue.companyId, ID)),
    },
    {
      name: 'emailNotifications',
      run: () => client.db.delete(emailNotifications).where(eq(emailNotifications.companyId, ID)),
    },
    {
      name: 'digestExecutionLog',
      run: () => client.db.delete(digestExecutionLog).where(eq(digestExecutionLog.companyId, ID)),
    },
    {
      name: 'dataAccessLog',
      run: () => client.db.delete(dataAccessLog).where(eq(dataAccessLog.companyId, ID)),
    },
    {
      name: 'apiUsageLog',
      run: () => client.db.delete(apiUsageLog).where(eq(apiUsageLog.companyId, ID)),
    },
    {
      name: 'executiveReportCache',
      run: () =>
        client.db.delete(executiveReportCache).where(eq(executiveReportCache.companyId, ID)),
    },
    {
      name: 'aiConversations',
      run: () => client.db.delete(aiConversations).where(eq(aiConversations.companyId, ID)),
    },
    {
      name: 'developmentDialogs',
      run: () => client.db.delete(developmentDialogs).where(eq(developmentDialogs.companyId, ID)),
    },
    {
      name: 'climateEngagementData',
      run: () =>
        client.db.delete(climateEngagementData).where(eq(climateEngagementData.companyId, ID)),
    },
    {
      name: 'radarNR1Reports',
      run: () => client.db.delete(radarNR1Reports).where(eq(radarNR1Reports.companyId, ID)),
    },
    {
      name: 'nr1AreaDivergenceAnalysis',
      run: () =>
        client.db
          .delete(nr1AreaDivergenceAnalysis)
          .where(eq(nr1AreaDivergenceAnalysis.companyId, ID)),
    },
    {
      name: 'copsoqFactorScores',
      run: () => client.db.delete(copsoqFactorScores).where(eq(copsoqFactorScores.companyId, ID)),
    },
    {
      name: 'copsoq_responses',
      run: () => client.db.delete(copsoq_responses).where(eq(copsoq_responses.companyId, ID)),
    },
    {
      name: 'copsoqCycleSnapshot',
      run: () => client.db.delete(copsoqCycleSnapshot).where(eq(copsoqCycleSnapshot.companyId, ID)),
    },
    {
      name: 'copsoqCycles',
      run: () => client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, ID)),
    },
    { name: 'iqlData', run: () => client.db.delete(iqlData).where(eq(iqlData.companyId, ID)) },
    {
      name: 'instrumentD_responses',
      run: () =>
        client.db.delete(instrumentD_responses).where(eq(instrumentD_responses.companyId, ID)),
    },
    {
      name: 'nineBoxCalculationLog',
      run: () =>
        client.db.delete(nineBoxCalculationLog).where(eq(nineBoxCalculationLog.companyId, ID)),
    },
    {
      name: 'nineBoxClassifications',
      run: () =>
        client.db.delete(nineBoxClassifications).where(eq(nineBoxClassifications.companyId, ID)),
    },
    {
      name: 'plenitudeData',
      run: () => client.db.delete(plenitudeData).where(eq(plenitudeData.companyId, ID)),
    },
    {
      name: 'instrumentC_assessments',
      run: () =>
        client.db.delete(instrumentC_assessments).where(eq(instrumentC_assessments.companyId, ID)),
    },
    {
      name: 'instrumentA_responses',
      run: () =>
        client.db.delete(instrumentA_responses).where(eq(instrumentA_responses.companyId, ID)),
    },
    {
      name: 'instrumentUnlockLog',
      run: () => client.db.delete(instrumentUnlockLog).where(eq(instrumentUnlockLog.companyId, ID)),
    },
    {
      name: 'performanceQuarterlyData',
      run: () =>
        client.db
          .delete(performanceQuarterlyData)
          .where(eq(performanceQuarterlyData.companyId, ID)),
    },
    {
      name: 'performanceData',
      run: () => client.db.delete(performanceData).where(eq(performanceData.companyId, ID)),
    },
    {
      name: 'individualProfileScores',
      run: () =>
        client.db.delete(individualProfileScores).where(eq(individualProfileScores.companyId, ID)),
    },
    {
      name: 'individualProfileAssessments',
      run: () =>
        client.db
          .delete(individualProfileAssessments)
          .where(eq(individualProfileAssessments.companyId, ID)),
    },
    {
      name: 'individualProfilePlaceholders',
      run: () =>
        client.db
          .delete(individualProfilePlaceholders)
          .where(eq(individualProfilePlaceholders.companyId, ID)),
    },
    {
      name: 'cycleUnlockRequests',
      run: () => client.db.delete(cycleUnlockRequests).where(eq(cycleUnlockRequests.companyId, ID)),
    },
    {
      name: 'monthlyUnlockLog',
      run: () => client.db.delete(monthlyUnlockLog).where(eq(monthlyUnlockLog.companyId, ID)),
    },
    {
      name: 'cycleSchedule',
      run: () => client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, ID)),
    },
    {
      name: 'companyEconomicDiagnosis',
      run: () =>
        client.db
          .delete(companyEconomicDiagnosis)
          .where(eq(companyEconomicDiagnosis.companyId, ID)),
    },
    {
      name: 'monthlyClosureStatus',
      run: () =>
        client.db.delete(monthlyClosureStatus).where(eq(monthlyClosureStatus.companyId, ID)),
    },
    {
      name: 'companyMonthlyData',
      run: () => client.db.delete(companyMonthlyData).where(eq(companyMonthlyData.companyId, ID)),
    },
    {
      name: 'employeeTerminationEvents',
      run: () =>
        client.db
          .delete(employeeTerminationEvents)
          .where(eq(employeeTerminationEvents.companyId, ID)),
    },
    {
      name: 'leaderOnboardingStageLog',
      run: () =>
        client.db
          .delete(leaderOnboardingStageLog)
          .where(eq(leaderOnboardingStageLog.companyId, ID)),
    },
    {
      name: 'leaderOnboardingNotes',
      run: () =>
        client.db.delete(leaderOnboardingNotes).where(eq(leaderOnboardingNotes.companyId, ID)),
    },
    {
      name: 'responsavelFinanceiroTransferLog',
      run: () =>
        client.db
          .delete(responsavelFinanceiroTransferLog)
          .where(eq(responsavelFinanceiroTransferLog.companyId, ID)),
    },
    {
      name: 'lgpdConsents',
      run: () => client.db.delete(lgpdConsents).where(eq(lgpdConsents.companyId, ID)),
    },
    {
      name: 'companyJobFamilies',
      run: () => client.db.delete(companyJobFamilies).where(eq(companyJobFamilies.companyId, ID)),
    },
    {
      name: 'employees',
      run: () => client.db.delete(employees).where(eq(employees.companyId, ID)),
    },
    {
      name: 'cLevelMembers',
      run: () => client.db.delete(cLevelMembers).where(eq(cLevelMembers.companyId, ID)),
    },
  ];

  try {
    console.log('[reset-reseed-nativa] Fase 1: capturar ids-pai (antes de apagar).');
    const empIds = (
      await client.db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.companyId, ID))
    ).map((e) => e.id);
    const perfIds = (
      await client.db
        .select({ id: performanceData.id })
        .from(performanceData)
        .where(eq(performanceData.companyId, ID))
    ).map((r) => r.id);
    const termIds = (
      await client.db
        .select({ id: employeeTerminationEvents.id })
        .from(employeeTerminationEvents)
        .where(eq(employeeTerminationEvents.companyId, ID))
    ).map((r) => r.id);
    console.log(`  ids: emp=${empIds.length} perf=${perfIds.length} term=${termIds.length}`);

    console.log('[reset-reseed-nativa] Fase 2: DELETE (FK_CHECKS=0).');
    await client.db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
    try {
      // Filhos por id capturado (nao tem companyId).
      if (perfIds.length > 0) {
        await client.db
          .delete(performanceVariableData)
          .where(inArray(performanceVariableData.performanceDataId, perfIds));
      }
      console.log('  DELETE performanceVariableData OK');
      if (termIds.length > 0) {
        await client.db
          .delete(terminationInvoluntaryJustifications)
          .where(inArray(terminationInvoluntaryJustifications.terminationEventId, termIds));
      }
      console.log('  DELETE terminationInvoluntaryJustifications OK');
      if (empIds.length > 0) {
        await client.db.delete(employeeGoals).where(inArray(employeeGoals.employeeId, empIds));
        await client.db
          .delete(performanceMultiplierLog)
          .where(inArray(performanceMultiplierLog.employeeId, empIds));
        await client.db
          .delete(portalReminderLog)
          .where(inArray(portalReminderLog.employeeId, empIds));
        await client.db.delete(accessTokens).where(inArray(accessTokens.userId, empIds));
        await client.db
          .delete(employeeLeaderHistory)
          .where(inArray(employeeLeaderHistory.employeeId, empIds));
      }
      console.log('  DELETE tabelas por employeeId/userId/FK-pai OK');

      // Lote companyId=1.
      for (const d of deletions) {
        await d.run();
        console.log(`  DELETE ${d.name} WHERE companyId=${ID} OK`);
      }

      await client.db.delete(companies).where(eq(companies.id, ID));
      console.log(`  DELETE companies WHERE id=${ID} OK`);
    } finally {
      await client.db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    }

    console.log('[reset-reseed-nativa] Fase 3: reseed canonico (loader corrigido).');
    const result = await seedNativa(client.db, {
      hashPassword: (plain: string) => bcrypt.hash(plain, BCRYPT_COST_PRODUCTION),
    });
    if (!result.applied) {
      console.error(`[reset-reseed-nativa] INESPERADO: seed nao aplicou. Reason: ${result.reason}`);
      process.exit(3);
    }
    console.log('[reset-reseed-nativa] Contagens por tabela:');
    for (const [table, count] of Object.entries(result.counts ?? {})) {
      console.log(`  ${table}: ${count}`);
    }
    console.log('[reset-reseed-nativa] DONE');
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`FAIL reset-reseed-nativa: ${msg}`);
    if (stack) console.error(stack);
    process.exit(1);
  } finally {
    await closeDbClient(client);
  }
}

void main();
