// ROIP APP 9BOX — ME-REPROC-IASOC: script de reprocessamento retroativo
// das tentativas de Perfil Individual que reprovaram pela regua antiga de
// `ia_soc` e passam sob a regua recalibrada (Opcao A, Caminho 2).
//
// Seguranca:
// - DATABASE_URL obrigatoria; aborta com RC=2 se ausente.
// - DRY-RUN por padrao: lista o que SERIA feito, sem tocar o banco.
//   Aplica de verdade SOMENTE com a flag `--apply`.
// - Idempotente; demos (Nativa=1, Ubatuba=2) preservadas.
//
// Uso:
//   npm run reprocess:ia-soc            (dry-run — so lista o plano)
//   npm run reprocess:ia-soc -- --apply (aplica de verdade)
//
// RV-14: um statement por linha, largura maxima 100 colunas.

import { closeDbClient, createDbClient } from '../src/db/client';
import {
  applyReprocessIaSoc,
  planReprocessIaSoc,
  type ReprocessPlanItem,
} from '../src/server/services/reprocessIaSocInconsistentes';

function formatItem(i: ReprocessPlanItem): string {
  const titular = `company=${i.companyId} ${i.userType}=${i.userId}`;
  const incId = i.inconsistenteAssessmentId ?? '-';
  const inc = `inconsistente t${i.inconsistenteTentativa ?? '-'} (#${incId})`;
  const alvo = i.alvoAssessmentId === null ? '-' : `t${i.alvoTentativa} (#${i.alvoAssessmentId})`;
  const nivel = i.nivelNovo ?? '-';
  return `  ${titular} | ${inc} | nivel_novo=${nivel} | acao=${i.acao} | alvo=${alvo}`;
}

function resumo(plan: readonly ReprocessPlanItem[]): string {
  const conta = (acao: string): number => plan.filter((i) => i.acao === acao).length;
  return (
    `reprocessa_em_andamento=${conta('reprocessa_em_andamento')} ` +
    `reprocessa_inplace=${conta('reprocessa_inplace')} ` +
    `skip_continua_baixa=${conta('skip_continua_baixa')} ` +
    `skip_sem_respostas=${conta('skip_sem_respostas')} ` +
    `skip_sem_inconsistente=${conta('skip_sem_inconsistente')}`
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }
  const apply = process.argv.includes('--apply');
  const client = createDbClient(databaseUrl);
  try {
    if (!apply) {
      const plan = await planReprocessIaSoc(client.db);
      console.log(
        `[reprocess-ia-soc] DRY-RUN — ${plan.length} titulares no escopo (nada sera alterado):`,
      );
      for (const item of plan) console.log(formatItem(item));
      console.log(`[reprocess-ia-soc] RESUMO: ${resumo(plan)}`);
      console.log('[reprocess-ia-soc] Para aplicar: npm run reprocess:ia-soc -- --apply');
    } else {
      const now = new Date();
      const res = await applyReprocessIaSoc(client.db, now);
      console.log(`[reprocess-ia-soc] APPLY — ${res.plan.length} titulares no escopo:`);
      for (const item of res.plan) console.log(formatItem(item));
      console.log(
        `[reprocess-ia-soc] OK: ${res.aplicados} reprocessados, ${res.pulados} pulados. ` +
          `RESUMO: ${resumo(res.plan)}`,
      );
    }
  } finally {
    await closeDbClient(client);
  }
}

main().catch((err: unknown) => {
  console.error(`FAIL reprocess-ia-soc: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
