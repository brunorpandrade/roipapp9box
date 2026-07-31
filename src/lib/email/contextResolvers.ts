// ROIP APP 9BOX — resolvers canonicos de contexto por tipo (ME-060).
//
// Origem canonica:
// - DOC 06 §12.6 "Regras canonicas de renderizacao de contexto por tipo".
// - Templates de contexto literais (reproducao bit-exact das strings
//   entre aspas do §12.6 linhas 1414-1426).
// - DOC 06 §4 (snapshots canonicos de `alerts.metadados` por tipo).
//
// Contrato canonico:
// - Uma funcao pura por tipo canonico dos 15 relevantes (D050 nao
//   renderiza corpo em template A — §12.6 linha 1428 canonizada). D050
//   permanece no roteamento canonico (§10.2 sino) mas NUNCA entra no
//   corpo de template — canal `info` na §6.5.
// - Cada resolver recebe o objeto JSON de `alerts.metadados` (typing
//   fraco propositalmente — o payload vem de `emailQueueJob.ts` como
//   `unknown` apos parse do JSON armazenado).
// - Retorna string canonica pronta para inserir no corpo do template
//   (sem badge — a badge canonica e adicionada pelo template A/B).
// - Fallback canonico em caso de metadados ausentes ou formato
//   inesperado: retorna string vazia — o worker `emailQueueJob` decide
//   se pula o alerta ou emite log de warning.
//
// Reprodução canonica dos padrões literais §12.6 (aspas removidas — a
// string retornada substitui bit-exact o padrão literal):
//   desempenho_queda_brusca / desempenho_queda_isolada:
//     "{colaboradorNome} — variacao {variacao} pp entre {trimestreAnterior}
//      e {trimestre} (score atual: {scoreAtual})"
//   desempenho_estagnacao:
//     "{colaboradorNome} — indice de desempenho {indiceAtual} em
//      {mesAtual}, {indiceAnterior1} em {mesAnterior1}, {indiceAnterior2}
//      em {mesAnterior2}"
//   assiduidade_baixa:
//     "{colaboradorNome} — assiduidade {assiduidade}% em {mes} ({faltas}
//      faltas em {diasUteis} dias uteis)"
//   divergencia_a_c:
//     "{resumoContexto}" + " (colaborador inativado)" quando aplicavel.
//   nr1_fator_critico:
//     "{fatorNome} em {escopo} — score {scoreValor} no trimestre
//      {trimestre}"
//   nr1_ciclo_fechado:
//     "Ciclo do trimestre {trimestre} de {empresaNome} encerrado"
//   perfil_inconsistente_primeira / perfil_retest_reincidente /
//   perfil_retest_consistente:
//     "{colaboradorNome} — {confiabilidade} na tentativa {tentativa}"
//   desbloqueio_solicitado:
//     "{solicitanteNome} solicitou desbloqueio de {mes} (aba: {aba})"
//   desbloqueio_aprovado:
//     "Solicitacao de {solicitanteNome} para {mes} aprovada. Janela
//      expira em {expiraEm}"
//   desbloqueio_recusado:
//     "Solicitacao de {solicitanteNome} para {mes} recusada. Motivo:
//      {motivoRecusa}"
//   ciclo_instrumento_encerrado:
//     "Instrumento C do trimestre {cicloReferencia} de {empresaNome}
//      encerrado. Taxa de resposta: {taxaResposta}%"
//   ciclo_mensal_fechado:
//     "Mes {cicloReferencia} de {empresaNome} fechado para lancamentos"
//   fechamento_bloqueado_sem_resp_financeiro (D049):
//     "{empresaNome} — fechamento mensal de {mesReferencia} sem
//      Responsavel financeiro atribuido. Nomeie um titular antes do
//      proximo ciclo."
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `resolveContextoCurto` → `jobs/emailQueueJob.ts` +
//     `jobs/weeklyDigestJob.ts` + testes.
//   - `D050_NAO_RENDERIZA_MOTIVO` → `jobs/emailQueueJob.ts` + testes.
//   - `AlertMetadadosRaw` (tipo) → `jobs/emailQueueJob.ts` +
//     `jobs/weeklyDigestJob.ts` + testes.

import { type AlertTipo } from '../alerts/typeDictionary';

/**
 * Metadados canonicos brutos (JSON armazenado em `alerts.metadados` como
 * `unknown`). O resolver por tipo aplica cast e extrai os campos
 * canonicos correspondentes.
 */
export type AlertMetadadosRaw = Readonly<Record<string, unknown>>;

/**
 * Motivo canonico literal do §12.6 linha 1428: D050 tem severidade `info`
 * (§6.5) e canal `info` — nao renderiza corpo em template A nem entra no
 * digest. Exportado para logging estruturado quando o worker encontra
 * D050 durante processamento.
 */
export const D050_NAO_RENDERIZA_MOTIVO =
  'D050 (responsavel_financeiro_nomeado) severidade info — nao renderiza corpo ' + 'em template A.';

// -----------------------------------------------------------------------
// Utilitarios de acesso seguro a metadados
// -----------------------------------------------------------------------

function s(meta: AlertMetadadosRaw, key: string, fallback: string = ''): string {
  const value = meta[key];
  return typeof value === 'string' ? value : fallback;
}

function n(meta: AlertMetadadosRaw, key: string, fallback: string = ''): string {
  const value = meta[key];
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return fallback;
}

// -----------------------------------------------------------------------
// Resolvers por tipo canonico
// -----------------------------------------------------------------------

function resolveDesempenhoQuedaOuIsolada(meta: AlertMetadadosRaw): string {
  const nome = s(meta, 'colaboradorNome');
  const variacao = n(meta, 'variacao');
  const trimAnterior = s(meta, 'trimestreAnterior');
  const trimestre = s(meta, 'trimestre');
  const scoreAtual = n(meta, 'scoreAtual');
  return (
    `${nome} — variacao ${variacao} pp entre ${trimAnterior} e ${trimestre} ` +
    `(score atual: ${scoreAtual})`
  );
}

function resolveDesempenhoEstagnacao(meta: AlertMetadadosRaw): string {
  const nome = s(meta, 'colaboradorNome');
  const indiceAtual = n(meta, 'indiceAtual');
  const mesAtual = s(meta, 'mesAtual');
  const indiceAnterior1 = n(meta, 'indiceAnterior1');
  const mesAnterior1 = s(meta, 'mesAnterior1');
  const indiceAnterior2 = n(meta, 'indiceAnterior2');
  const mesAnterior2 = s(meta, 'mesAnterior2');
  return (
    `${nome} — indice de desempenho ${indiceAtual} em ${mesAtual}, ` +
    `${indiceAnterior1} em ${mesAnterior1}, ${indiceAnterior2} em ${mesAnterior2}`
  );
}

function resolveAssiduidadeBaixa(meta: AlertMetadadosRaw): string {
  const nome = s(meta, 'colaboradorNome');
  const assiduidade = n(meta, 'assiduidade');
  const mes = s(meta, 'mes');
  const faltas = n(meta, 'faltas');
  const diasUteis = n(meta, 'diasUteis');
  return (
    `${nome} — assiduidade ${assiduidade}% em ${mes} ` +
    `(${faltas} faltas em ${diasUteis} dias uteis)`
  );
}

function resolveDivergenciaAC(meta: AlertMetadadosRaw): string {
  const resumo = s(meta, 'resumoContexto');
  const inativo = meta['colaboradorAtivo'] === false;
  return inativo ? `${resumo} (colaborador inativado)` : resumo;
}

function resolveNr1FatorCritico(meta: AlertMetadadosRaw): string {
  const fatorNome = s(meta, 'fatorNome');
  const escopo = s(meta, 'escopo');
  const scoreValor = n(meta, 'scoreValor');
  const trimestre = s(meta, 'trimestre');
  return `${fatorNome} em ${escopo} — score ${scoreValor} no trimestre ${trimestre}`;
}

function resolveNr1CicloFechado(meta: AlertMetadadosRaw): string {
  const trimestre = s(meta, 'trimestre');
  const empresaNome = s(meta, 'empresaNome');
  return `Ciclo do trimestre ${trimestre} de ${empresaNome} encerrado`;
}

function resolvePerfilConsistencia(meta: AlertMetadadosRaw): string {
  const nome = s(meta, 'colaboradorNome');
  const confiabilidade = s(meta, 'confiabilidade');
  const tentativa = n(meta, 'tentativa');
  return `${nome} — ${confiabilidade} na tentativa ${tentativa}`;
}

function resolveDesbloqueioSolicitado(meta: AlertMetadadosRaw): string {
  const solicitante = s(meta, 'solicitanteNome');
  const mes = s(meta, 'mes');
  const aba = s(meta, 'aba');
  return `${solicitante} solicitou desbloqueio de ${mes} (aba: ${aba})`;
}

function resolveDesbloqueioAprovado(meta: AlertMetadadosRaw): string {
  const solicitante = s(meta, 'solicitanteNome');
  const mes = s(meta, 'mes');
  const expiraEm = s(meta, 'expiraEm');
  return `Solicitacao de ${solicitante} para ${mes} aprovada. Janela expira em ${expiraEm}`;
}

function resolveDesbloqueioRecusado(meta: AlertMetadadosRaw): string {
  const solicitante = s(meta, 'solicitanteNome');
  const mes = s(meta, 'mes');
  const motivo = s(meta, 'motivoRecusa');
  return `Solicitacao de ${solicitante} para ${mes} recusada. Motivo: ${motivo}`;
}

function resolveCicloInstrumentoEncerrado(meta: AlertMetadadosRaw): string {
  const cicloReferencia = s(meta, 'cicloReferencia');
  const empresaNome = s(meta, 'empresaNome');
  const taxaResposta = n(meta, 'taxaResposta');
  return (
    `Instrumento C do trimestre ${cicloReferencia} de ${empresaNome} encerrado. ` +
    `Taxa de resposta: ${taxaResposta}%`
  );
}

function resolveCicloMensalFechado(meta: AlertMetadadosRaw): string {
  const cicloReferencia = s(meta, 'cicloReferencia');
  const empresaNome = s(meta, 'empresaNome');
  return `Mes ${cicloReferencia} de ${empresaNome} fechado para lancamentos`;
}

function resolveFechamentoBloqueadoSemRF(meta: AlertMetadadosRaw): string {
  const empresaNome = s(meta, 'empresaNome');
  const mesReferencia = s(meta, 'mesReferencia');
  return (
    `${empresaNome} — fechamento mensal de ${mesReferencia} sem Responsavel ` +
    'financeiro atribuido. Nomeie um titular antes do proximo ciclo.'
  );
}

// -----------------------------------------------------------------------
// Roteador canonico por tipo
// -----------------------------------------------------------------------

/**
 * Roteador canonico. Recebe `tipo` do alerta + `metadados` brutos e
 * devolve o contexto curto canonico do §12.6.
 *
 * Retornos especiais:
 * - D050 (`responsavel_financeiro_nomeado`) → string vazia. §12.6 linha
 *   1428 canoniza que D050 nao renderiza corpo em template A.
 */
export function resolveContextoCurto(tipo: AlertTipo, metadados: AlertMetadadosRaw): string {
  switch (tipo) {
    case 'desempenho_queda_brusca':
    case 'desempenho_queda_isolada':
      return resolveDesempenhoQuedaOuIsolada(metadados);
    case 'desempenho_estagnacao':
      return resolveDesempenhoEstagnacao(metadados);
    case 'assiduidade_baixa':
      return resolveAssiduidadeBaixa(metadados);
    case 'divergencia_a_c':
      return resolveDivergenciaAC(metadados);
    case 'nr1_fator_critico':
      return resolveNr1FatorCritico(metadados);
    case 'nr1_ciclo_fechado':
      return resolveNr1CicloFechado(metadados);
    case 'perfil_inconsistente_primeira':
    case 'perfil_retest_reincidente':
    case 'perfil_retest_consistente':
      return resolvePerfilConsistencia(metadados);
    case 'desbloqueio_solicitado':
      return resolveDesbloqueioSolicitado(metadados);
    case 'desbloqueio_aprovado':
      return resolveDesbloqueioAprovado(metadados);
    case 'desbloqueio_recusado':
      return resolveDesbloqueioRecusado(metadados);
    case 'ciclo_instrumento_encerrado':
      return resolveCicloInstrumentoEncerrado(metadados);
    case 'ciclo_mensal_fechado':
      return resolveCicloMensalFechado(metadados);
    case 'fechamento_bloqueado_sem_resp_financeiro':
      return resolveFechamentoBloqueadoSemRF(metadados);
    case 'responsavel_financeiro_nomeado':
      // D050 — §12.6 linha 1428: severidade info nao renderiza corpo.
      return '';
  }
}
