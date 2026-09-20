// ROIP APP 9BOX — script pontual: variar escores do Perfil Individual
// de 7 colaboradores da Nativa (ME escores-demo, ciclo 2).
//
// Aplica os perfis de `perfilIndividualOverrides` (fonte unica, RV-14)
// aos 7 registros existentes em individualProfileScores. Corrige o
// placeholder '50.00' do seed, dando contraste de faixas na demo.
// NAO toca colaboradores com relatorio de IA ja gerado.
//
// RV-12: 100% Drizzle tipado. RV-11: roda contra MySQL real; aceite com
// queries de conferencia. Metodo C: o mesmo override e aplicado no seed
// (loadFixtures) para reseeds futuros nascerem consistentes.
//
// Uso: npx tsx scripts/vary-perfil-individual-nativa.ts
// Prerrequisito: DATABASE_URL. Aborta com RC=2 se ausente.

import { and, eq } from 'drizzle-orm';

import { closeDbClient, createDbClient } from '../src/db/client';
import { individualProfileScores } from '../src/db/schema';
import {
  PERFIS_VARIADOS_NATIVA,
  mediaEquNativa,
  type PerfilEscoresNativa,
} from '../src/db/seed/nativa/perfilIndividualOverrides';

const NATIVA_COMPANY_ID = 1;

function dec(v: number): string {
  return v.toFixed(2);
}

function setFor(p: PerfilEscoresNativa): Record<string, string | readonly string[]> {
  return {
    post_assert: dec(p.post_assert),
    post_tarefas: dec(p.post_tarefas),
    post_pessoas: dec(p.post_pessoas),
    post_pressao: dec(p.post_pressao),
    est_abert: dec(p.est_abert),
    est_disc: dec(p.est_disc),
    est_ext: dec(p.est_ext),
    est_amab: dec(p.est_amab),
    est_estab: dec(p.est_estab),
    mot_maestria: dec(p.mot_maestria),
    mot_lideranca: dec(p.mot_lideranca),
    mot_autonomia: dec(p.mot_autonomia),
    mot_seguranca: dec(p.mot_seguranca),
    mot_proposito: dec(p.mot_proposito),
    equ_autocons: dec(p.equ_autocons),
    equ_autogest: dec(p.equ_autogest),
    equ_leitura: dec(p.equ_leitura),
    equ_influencia: dec(p.equ_influencia),
    equ_indice: dec(mediaEquNativa(p)),
    ass_sabed: dec(p.ass_sabed),
    ass_coragem: dec(p.ass_coragem),
    ass_humanid: dec(p.ass_humanid),
    ass_justica: dec(p.ass_justica),
    ass_temper: dec(p.ass_temper),
    ass_transc: dec(p.ass_transc),
    vetorDominante: p.vetorDominante,
    vetorSustentacao: p.vetorSustentacao,
    vetorNegligenciado: p.vetorNegligenciado,
    top3Assinatura: p.top3,
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    console.error('FALHA: DATABASE_URL ausente no ambiente.');
    process.exit(2);
  }
  const client = createDbClient(url);
  let atualizados = 0;
  try {
    for (const p of PERFIS_VARIADOS_NATIVA) {
      const res = await client.db
        .update(individualProfileScores)
        .set(setFor(p))
        .where(
          and(
            eq(individualProfileScores.companyId, NATIVA_COMPANY_ID),
            eq(individualProfileScores.userType, p.userType),
            eq(individualProfileScores.userId, p.userId),
          ),
        );
      const affected = Array.isArray(res)
        ? 0
        : ((res as { rowsAffected?: number }).rowsAffected ?? 0);
      console.log(`  ${p.nome} (${p.userType} ${p.userId}): rowsAffected=${affected}`);
      atualizados += affected;
    }
    console.log(`\nOK — ${atualizados} linha(s) de score atualizada(s) (esperado: 7).`);
    if (atualizados !== PERFIS_VARIADOS_NATIVA.length) {
      console.error(
        `ATENCAO: esperado ${PERFIS_VARIADOS_NATIVA.length}, atualizado ${atualizados}.`,
      );
      process.exit(1);
    }
  } finally {
    await closeDbClient(client);
  }
}

void main();
