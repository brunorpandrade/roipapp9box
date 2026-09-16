// ROIP APP 9BOX — persistencia dos formularios de desligamento
// (especificacao "Turnover e desligamento" §3 e §4, ME-fila6 D2).
//
// - `insertTerminationForm`: gravado DENTRO da transacao da inativacao
//   (`employees.inactivate` e `leadershipTransfer.execute`) — nao existe
//   estado de "inativo sem formulario".
// - `loadTerminationFormsByEventIds`: leitura para o drill-down nominal
//   da pagina de turnover.
//
// Tabelas append-only 1:1 com `employeeTerminationEvents`.
//
// **RV-12.** Drizzle tipado. **RV-14.** 100 colunas.

import { inArray } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  terminationInvoluntaryJustifications,
  terminationVoluntaryInterviews,
} from '../../db/schema';
import type { FormularioDesligamento } from '../../lib/shared/terminationForms';

/** Executor aceito: conexao ou transacao Drizzle. */
type TerminationFormExecutor = Pick<RoipDatabase, 'insert'>;

/** Grava o formulario do evento de desligamento informado. */
export async function insertTerminationForm(
  executor: TerminationFormExecutor,
  terminationEventId: number,
  formulario: FormularioDesligamento,
): Promise<void> {
  if (formulario.tipo === 'voluntario') {
    await executor.insert(terminationVoluntaryInterviews).values({
      terminationEventId,
      motivoPrincipal: formulario.motivoPrincipal,
      motivoSecundario1: formulario.motivosSecundarios[0] ?? null,
      motivoSecundario2: formulario.motivosSecundarios[1] ?? null,
      notaConfiancaLideranca: formulario.notaConfiancaLideranca,
      notaReconhecimento: formulario.notaReconhecimento,
      notaRemuneracaoJusta: formulario.notaRemuneracaoJusta,
      notaOportunidadeCrescimento: formulario.notaOportunidadeCrescimento,
      notaClarezaExpectativas: formulario.notaClarezaExpectativas,
      notaAmbienteEquipe: formulario.notaAmbienteEquipe,
      voltariaTrabalhar: formulario.voltariaTrabalhar,
      recomendariaEmpresa: formulario.recomendariaEmpresa,
      destino: formulario.destino,
      oQuePoderiaReter: formulario.oQuePoderiaReter,
      comentariosAdicionais: formulario.comentariosAdicionais,
    });
    return;
  }
  await executor.insert(terminationInvoluntaryJustifications).values({
    terminationEventId,
    categoria: formulario.categoria,
    houveFeedbackFormal: formulario.houveFeedbackFormal,
    nivelDocumentacao: formulario.nivelDocumentacao,
    justificativa: formulario.justificativa,
    necessidadeReposicao: formulario.necessidadeReposicao,
  });
}

/** Carrega os formularios gravados dos eventos (ausente = evento antigo). */
export async function loadTerminationFormsByEventIds(
  db: RoipDatabase,
  eventIds: readonly number[],
): Promise<Map<number, FormularioDesligamento>> {
  const out = new Map<number, FormularioDesligamento>();
  if (eventIds.length === 0) {
    return out;
  }
  const ids = [...eventIds];
  const voluntarios = await db
    .select()
    .from(terminationVoluntaryInterviews)
    .where(inArray(terminationVoluntaryInterviews.terminationEventId, ids));
  for (const r of voluntarios) {
    const secundarios = [r.motivoSecundario1, r.motivoSecundario2].filter(
      (m): m is NonNullable<typeof m> => m !== null,
    );
    out.set(r.terminationEventId, {
      tipo: 'voluntario',
      motivoPrincipal: r.motivoPrincipal,
      motivosSecundarios: secundarios,
      notaConfiancaLideranca: r.notaConfiancaLideranca,
      notaReconhecimento: r.notaReconhecimento,
      notaRemuneracaoJusta: r.notaRemuneracaoJusta,
      notaOportunidadeCrescimento: r.notaOportunidadeCrescimento,
      notaClarezaExpectativas: r.notaClarezaExpectativas,
      notaAmbienteEquipe: r.notaAmbienteEquipe,
      voltariaTrabalhar: r.voltariaTrabalhar,
      recomendariaEmpresa: r.recomendariaEmpresa,
      destino: r.destino,
      oQuePoderiaReter: r.oQuePoderiaReter,
      comentariosAdicionais: r.comentariosAdicionais,
    });
  }
  const involuntarios = await db
    .select()
    .from(terminationInvoluntaryJustifications)
    .where(inArray(terminationInvoluntaryJustifications.terminationEventId, ids));
  for (const r of involuntarios) {
    out.set(r.terminationEventId, {
      tipo: 'involuntario',
      categoria: r.categoria,
      houveFeedbackFormal: r.houveFeedbackFormal,
      nivelDocumentacao: r.nivelDocumentacao,
      justificativa: r.justificativa,
      necessidadeReposicao: r.necessidadeReposicao,
    });
  }
  return out;
}
