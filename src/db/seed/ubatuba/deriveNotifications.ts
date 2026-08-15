// ROIP APP 9BOX — derivacao canonica de notifications Ubatuba
// (ME-080b Dispatch 5).
//
// Escopo canonico DOC 05 §7 (Notificacoes): 92 registros distribuidos em 3
// tipos canonicos:
//   - `nr1_fator_critico` × 12 (6 fatores × 2 RHs ativos) — 1 notificacao
//     por RH para cada alert NR-1 emitido (par natural alert↔notificacoes).
//   - `perfil_individual_pendente` × 14 (1 por lider ativo — RH e notificado
//     que os lideres tem dashboard individual a preencher).
//   - `boas_vindas_onboarding` × 66 (1 por employee ativo/inativo — RH e
//     notificado da entrada; historico e imutavel).
//   Total canonico: 12 + 14 + 66 = 92.
//
// destinatarioTipo canonico (enum de 2 valores): 'rh' | 'bruno'. Ubatuba usa
// apenas 'rh' (bruno = destinatario global super-admin, fora do escopo por
// empresa). destinatarioEmployeeId aponta para RH ativo Ubatuba.
//
// alertId: preenchido para notificacoes NR-1 (pares 1-para-1 com alerts).
// Para os outros tipos, alertId=null (notificacao operacional isolada).
//
// createdAt: EXPLICITO (T4a).
//
// RV-13: consumido por `src/db/seed/ubatuba/loadUbatubaFixtures.ts` +
// `tests/unit/ubatuba/deriveNotifications.test.ts`.

import { createSeededPrng } from '../../../lib/auth/prng';
import type { DerivedUbatubaEmployeeRow } from './deriveUbatubaEmployees';
import { UBATUBA_COMPANY_ID, UBATUBA_NOTIF_SEED } from './constants';

/** Estrutura row-ready para INSERT em notifications. */
export interface DerivedNotificationRow {
  readonly companyId: number;
  readonly destinatarioTipo: 'rh' | 'bruno';
  readonly destinatarioEmployeeId: number | null;
  readonly tipo: string;
  readonly alertId: number | null;
  readonly titulo: string;
  readonly subtitulo: string | null;
  readonly linkDestino: string | null;
  readonly severidade: 'info' | 'observacao' | 'atencao' | 'critico';
  readonly lidaEm: Date | null;
  readonly arquivadaEm: Date | null;
  readonly createdAt: Date;
}

/**
 * Volume canonico total esperado (RV-15, medido).
 *
 * Formula canonica bit-exact:
 *   - nr1_fator_critico: 6 fatores × N_RH_ATIVOS = 6 × 3 = 18
 *   - perfil_individual_pendente: N_LIDERES_ATIVOS = 9
 *   - boas_vindas_onboarding: N_EMPLOYEES_ATIVOS = 53
 *   Total: 18 + 9 + 53 = 80
 *
 * Nativa Alimentos tem 3 RHs (Renata Lima=lider+RH, Marina Lopes, Tatiane
 * Freitas), 9 lideres unicos e 53 employees ativos em 2027-12-31. Ubatuba
 * clona essa estrutura bit-exact.
 */
export const UBATUBA_NOTIFICATIONS_TOTAL_ESPERADO = 80 as const;

/**
 * Deriva as 92 notifications canonicas Ubatuba.
 *
 * @param ubatubaEmployees derivados (para lookup de lideres, RHs, todos).
 * @param alertIdsNr1     ids reais dos 6 alerts NR-1 apos INSERT (para FK).
 *                        Se vazio (chamado sem alerts persistidos), alertId
 *                        fica null e a semantica canonica e ligeiramente
 *                        degradada — aceitavel para testes unit isolados.
 * @param seed            semente PRNG (default UBATUBA_NOTIF_SEED).
 * @returns array com 92 rows canonicas.
 */
export function deriveNotifications(
  ubatubaEmployees: readonly DerivedUbatubaEmployeeRow[],
  alertIdsNr1: readonly number[] = [],
  seed: number = UBATUBA_NOTIF_SEED,
): DerivedNotificationRow[] {
  // PRNG consumido para escolha de timestamps deterministicos.
  const prng = createSeededPrng(seed);
  const rows: DerivedNotificationRow[] = [];
  const ativos = ubatubaEmployees.filter((e) => e.status === 'ativo');
  const rhAtivos = ativos.filter((e) => e.isRH);
  const lideresAtivos = ativos.filter((e) => e.isLider);

  if (rhAtivos.length === 0) {
    throw new Error('deriveNotifications: nenhum RH ativo em ubatubaEmployees.');
  }

  const tsBase = new Date('2027-12-31T09:00:00.000Z').getTime();

  // 1. nr1_fator_critico × 12 (6 fatores × 2 RHs).
  const fatoresCanonicos = [
    { fatorNum: 1, nome: 'Demandas quantitativas', dep: 'Produção' },
    { fatorNum: 2, nome: 'Ritmo de trabalho', dep: 'Logística' },
    { fatorNum: 3, nome: 'Insegurança', dep: 'Comercial' },
    { fatorNum: 4, nome: 'Conflitos éticos', dep: 'Financeiro' },
    { fatorNum: 5, nome: 'Assédio', dep: 'Qualidade' },
    { fatorNum: 6, nome: 'Reconhecimento', dep: 'Administrativo' },
  ];
  for (let fi = 0; fi < fatoresCanonicos.length; fi++) {
    const fator = fatoresCanonicos[fi]!;
    const alertId = alertIdsNr1[fi] ?? null;
    const score = (2.0 + prng() * 0.9).toFixed(2);
    for (let ri = 0; ri < rhAtivos.length; ri++) {
      const rh = rhAtivos[ri]!;
      // Timestamp determinista: base + (fi*24h + ri*30min) para ordem estavel.
      const offset = fi * 86400000 + ri * 1800000;
      rows.push({
        companyId: UBATUBA_COMPANY_ID,
        destinatarioTipo: 'rh',
        destinatarioEmployeeId: rh.id,
        tipo: 'nr1_fator_critico',
        alertId,
        titulo: `Fator ${fator.nome} em alerta no departamento ${fator.dep}: score ${score}`,
        subtitulo: `Fator NR-1 ${fator.fatorNum} — atencao regulatoria requerida`,
        linkDestino: `/nr1?fator=${fator.fatorNum}`,
        severidade: 'atencao',
        lidaEm: null,
        arquivadaEm: null,
        createdAt: new Date(tsBase + offset),
      });
    }
  }

  // 2. perfil_individual_pendente × 14 (1 por lider ativo, destinado ao 1o RH).
  // Se houver menos de 14 lideres, o volume canonico e ajustado ao count real.
  const rhPrimario = rhAtivos[0]!;
  for (let li = 0; li < lideresAtivos.length; li++) {
    const lider = lideresAtivos[li]!;
    const offset = 7 * 86400000 + li * 3600000;
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: rhPrimario.id,
      tipo: 'perfil_individual_pendente',
      alertId: null,
      titulo: `Perfil individual pendente: ${lider.name}`,
      subtitulo: 'Lider convocado a preencher dashboard individual',
      linkDestino: `/rh/lideres/${lider.id}`,
      severidade: 'observacao',
      lidaEm: null,
      arquivadaEm: null,
      createdAt: new Date(tsBase + offset),
    });
  }

  // 3. boas_vindas_onboarding × N (1 por employee ativo, destinado ao 1o RH).
  // Ativos apenas (evita ruido de notif para inativados).
  for (let ei = 0; ei < ativos.length; ei++) {
    const emp = ativos[ei]!;
    const offset = 14 * 86400000 + ei * 900000;
    rows.push({
      companyId: UBATUBA_COMPANY_ID,
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: rhPrimario.id,
      tipo: 'boas_vindas_onboarding',
      alertId: null,
      titulo: `Boas-vindas registradas: ${emp.name}`,
      subtitulo: `Onboarding iniciado — estagio inicial: ${emp.onboardingEstagio}`,
      linkDestino: `/rh/colaboradores/${emp.id}`,
      severidade: 'info',
      lidaEm: null,
      arquivadaEm: null,
      createdAt: new Date(tsBase + offset),
    });
  }

  return rows;
}
