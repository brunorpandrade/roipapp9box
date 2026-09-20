'use server';

// ROIP APP 9BOX — server actions do relatorio do Perfil Individual no
// dashboard individual (ME pos-fila7, DOC 05 §9). Espelham o padrao das
// actions vizinhas (`actions.ts`): resolvem token de sessao, montam o
// caller do `appRouter` (que ja religa a factory de geracao IA S244 e o
// `pdfRenderer` S260) e delegam a `individualProfile.getReport` /
// `individualProfile.generatePDF` (DOC 03 §10.13).
//
// As actions recebem `{ userType, userId }` (ME §8.05): o dashboard
// individual passa `userType='employee'`; a superficie Bruno-only do
// organograma passa `userType='clevel'` para o relatorio de Perfil do
// C-level (PC1e = Bruno). Os guards canonicos (PC1e, D-SELF, escopo
// empresa §2.4, cadeia direta S066, inativo §3.13) sao aplicados
// server-side pelo proprio `getReport`/`generatePDF`; o botao no client
// e apenas o gatilho.
//
// RV-14: um statement por linha, largura maxima 100.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { createRateLimiter } from '../../../server/auth/rateLimit';
import { appRouter } from '../../../server/routers';
import { getServerSession } from '../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../server/trpc';

const SESSION_COOKIE = 'session';

/**
 * Snapshot serializavel do relatorio para o client. Datas viajam como
 * ISO string (Date nao e serializavel atraves da fronteira RSC). Os 24
 * escores decimais viajam como `string | null` (o driver MySQL entrega
 * decimais como string; preservamos sem conversao para nao perder
 * precisao). `podeBaixarPdf` deriva do role da sessao (Bruno e RH —
 * §9.2), e usado apenas para exibir o botao; a autorizacao real e
 * reaplicada no backend de `generatePDF`.
 */
export interface PerfilRelatorioSnapshot {
  readonly scoreId: number;
  readonly tentativa: number;
  readonly confiabilidadeNivel: 'alta' | 'moderada' | 'baixa' | null;
  readonly enviadoEm: string | null;
  readonly calculadoEm: string | null;
  readonly gerandoResumo: boolean;
  readonly gerandoExpandido: boolean;
  readonly resumoJson: unknown;
  readonly expandidoJson: unknown;
  readonly perfilComportamental: string | null;
  readonly vetorDominante: string | null;
  readonly vetorSustentacao: string | null;
  readonly vetorNegligenciado: string | null;
  readonly top3Assinatura: unknown;
  readonly escores: Readonly<Record<string, string | null>>;
  readonly podeBaixarPdf: boolean;
}

/** Retorno de `carregarPerfilRelatorioAction`. */
export interface CarregarPerfilRelatorioResult {
  readonly ok: boolean;
  readonly snapshot: PerfilRelatorioSnapshot | null;
  readonly semRelatorio: boolean;
  readonly error?: string;
}

/** Retorno de `baixarPerfilPdfAction`. */
export interface BaixarPerfilPdfResult {
  readonly ok: boolean;
  readonly pdfBase64: string | null;
  readonly filename: string | null;
  readonly error?: string;
}

async function requireToken(): Promise<string> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (token === null) {
    redirect('/');
  }
  return token;
}

/**
 * Resolve se o usuario logado pode baixar o PDF (§9.2 — Bruno e RH,
 * incluindo RH-Lider que acumula permissoes de RH — DOC 02 §69). Deriva
 * de `session.kind`/`session.role`; nunca do input do titular.
 */
async function resolvePodeBaixarPdf(): Promise<boolean> {
  const session = await getServerSession();
  if (session === null) {
    return false;
  }
  if (session.kind === 'super_admin') {
    return true;
  }
  return session.role === 'rh' || session.role === 'rh_lider';
}

/**
 * Carrega o relatorio do Perfil Individual do colaborador (§10.13
 * getReport). Retorna `semRelatorio=true` quando nao ha tentativa
 * vigente (getReport devolve null). Erros de autorizacao (PC1e, escopo,
 * cadeia) sobem como `ok=false` com a mensagem do backend.
 */
export async function carregarPerfilRelatorioAction(input: {
  companyId: number;
  userType: 'employee' | 'clevel';
  userId: number;
}): Promise<CarregarPerfilRelatorioResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(appRouter)(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const report = await caller.individualProfile.getReport({
      companyId: input.companyId,
      userType: input.userType,
      userId: input.userId,
    });
    if (report === null) {
      return { ok: true, snapshot: null, semRelatorio: true };
    }
    const podeBaixarPdf = await resolvePodeBaixarPdf();
    const score = report.score;
    const escores: Record<string, string | null> = {
      post_assert: score.post_assert,
      post_tarefas: score.post_tarefas,
      post_pessoas: score.post_pessoas,
      post_pressao: score.post_pressao,
      est_abert: score.est_abert,
      est_disc: score.est_disc,
      est_ext: score.est_ext,
      est_amab: score.est_amab,
      est_estab: score.est_estab,
      mot_maestria: score.mot_maestria,
      mot_lideranca: score.mot_lideranca,
      mot_autonomia: score.mot_autonomia,
      mot_seguranca: score.mot_seguranca,
      mot_proposito: score.mot_proposito,
      equ_autocons: score.equ_autocons,
      equ_autogest: score.equ_autogest,
      equ_leitura: score.equ_leitura,
      equ_influencia: score.equ_influencia,
      equ_indice: score.equ_indice,
      ass_sabed: score.ass_sabed,
      ass_coragem: score.ass_coragem,
      ass_humanid: score.ass_humanid,
      ass_justica: score.ass_justica,
      ass_temper: score.ass_temper,
      ass_transc: score.ass_transc,
    };
    const snapshot: PerfilRelatorioSnapshot = {
      scoreId: score.id,
      tentativa: report.assessment.tentativa,
      confiabilidadeNivel: report.assessment.confiabilidadeNivel,
      enviadoEm:
        report.assessment.enviadoEm !== null ? report.assessment.enviadoEm.toISOString() : null,
      calculadoEm:
        report.assessment.calculadoEm !== null ? report.assessment.calculadoEm.toISOString() : null,
      gerandoResumo: report.gerandoResumo,
      gerandoExpandido: report.gerandoExpandido,
      resumoJson: score.resumoJson,
      expandidoJson: score.expandidoJson,
      perfilComportamental: score.perfilComportamental,
      vetorDominante: score.vetorDominante,
      vetorSustentacao: score.vetorSustentacao,
      vetorNegligenciado: score.vetorNegligenciado,
      top3Assinatura: score.top3Assinatura,
      escores,
      podeBaixarPdf,
    };
    return { ok: true, snapshot, semRelatorio: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar o relatório.';
    return { ok: false, snapshot: null, semRelatorio: false, error: message };
  } finally {
    await closeDbClient(client);
  }
}

/**
 * Gera o PDF executivo do Perfil Individual sob demanda (§9.9 /
 * §10.10). Autorizacao reaplicada no backend (`['super_admin', 'rh',
 * 'rh_lider']`); o botao no client so aparece para esses papeis.
 * Retorna base64 + filename canonico; o client converte em blob e
 * dispara o download.
 */
export async function baixarPerfilPdfAction(input: {
  companyId: number;
  userType: 'employee' | 'clevel';
  userId: number;
}): Promise<BaixarPerfilPdfResult> {
  const token = await requireToken();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(appRouter)(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
    const result = await caller.individualProfile.generatePDF({
      companyId: input.companyId,
      userType: input.userType,
      userId: input.userId,
    });
    return { ok: true, pdfBase64: result.pdfBase64, filename: result.filename };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar o PDF.';
    return { ok: false, pdfBase64: null, filename: null, error: message };
  } finally {
    await closeDbClient(client);
  }
}
