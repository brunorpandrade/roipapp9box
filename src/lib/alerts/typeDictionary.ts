// ROIP APP 9BOX — dicionario canonico dos 17 tipos de alerta (ME-059).
//
// Origem canonica:
// - DOC 06 §3 (taxonomia dos 17 tipos — 2 NR-1 + 13 Fase 8 + 2 RF).
// - DOC 06 §6.1 (rotulos legiveis literais — reproducao obrigatoria).
// - DOC 06 §6.2 (emojis canonicos de severidade).
// - DOC 06 §6.3-§6.5 (regra canonica de canal por severidade + overrides).
// - DOC 06 §8.3 (isencoes M1 — 9 tipos).
// - DOC 06 §8.6 (isencoes M4 — 8 tipos + chave ampliada NR-1 com fatorId).
// - DOC 06 §7 (trilhas de destinatarios — padrao, apenas_bruno, apenas_rf).
// - DOC 01 §15.2 + `NOTIFICATION_TIPO_VALUES` (17 valores canonicos).
//
// Contrato canonico:
// - Fonte unica dos atributos operacionais imutaveis por tipo. O pipeline
//   M1-M7 consulta este dicionario para decidir isencao, override de canal,
//   trilha de destinatarios e rotulo legivel.
// - `assertTipoCanonico(tipo)` garante que qualquer valor recebido pelo
//   `emitAlert` esteja no enum canonico dos 17. Rejeicao imediata caso
//   contrario (§3 linha 80: "valores fora desta lista sao rejeitados
//   server-side pelo emitAlert com erro estruturado no log de trace").
// - `getTipoMetadata(tipo)` devolve o metadata bit-exact do §3.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `AlertTipo` (tipo) → consumido por `resolveDestinatarios`,
//     `linkResolver`, todos os 7 steps do pipeline, `emitAlert`,
//     `emitAlertPostGravacao` e endpoint `/api/notifications`.
//   - `TipoMetadata` (interface) → consumido por consumidores acima.
//   - `assertTipoCanonico` → consumido por `emitAlert` (guardiao de
//     entrada) e por todos os hooks NOOP religados (M11 auto-alerts,
//     M11 NR-1 facade).
//   - `getTipoMetadata` → consumido pelos 7 steps do pipeline.
//   - `TIPO_DICTIONARY` → consumido internamente + testes RV-13.

import { NOTIFICATION_TIPO_VALUES, type NotificationTipo } from '../../db/schema/enums';

// -----------------------------------------------------------------------
// Tipos canonicos
// -----------------------------------------------------------------------

/**
 * Alias de `NotificationTipo` da camada de dados. Preserva o enum
 * canonico de 17 valores mas com o naming do dominio de alertas (fonte
 * DOC 06 §3). Usar `AlertTipo` na camada de motor, `NotificationTipo`
 * na camada de dados — semanticamente equivalentes.
 */
export type AlertTipo = NotificationTipo;

/**
 * Severidade canonica da alocacao inicial no `emitAlert`. Reflete
 * exatamente o enum `SEVERIDADE_VALUES` da camada de dados. Reproduzido
 * aqui como tipo local para evitar dependencia circular na leitura por
 * consumidores puros (steps de pipeline sem I/O).
 */
export type AlertSeveridade = 'info' | 'observacao' | 'atencao' | 'critico';

/**
 * Escopo canonico do alerta. Espelha `ESCOPO_ALERT_VALUES` da camada de
 * dados. Nao inclui `null` — `alerts.escopo` e nullable no schema, mas
 * a semantica canonica do motor exige um dos tres valores.
 */
export type AlertEscopo = 'empresa' | 'departamento' | 'colaborador';

/**
 * Canal canonico do e-mail apos M6. Reflete exatamente o enum
 * `EMAIL_QUEUE_KIND_VALUES` (2 valores MVP). Alertas de severidade
 * `info` nao entram em `emailQueue` — o passo M6 termina o pipeline.
 */
export type AlertCanal = 'imediato' | 'digest_semanal';

/**
 * Trilha de destinatarios canonica (§7).
 *
 * - `padrao` — RH+Bruno via `resolveDestinatarios` com trilha padrao
 *   (§7.1). Aplicavel a 15 dos 17 tipos: 13 da Fase 8 + 2 do NR-1.
 * - `apenas_bruno` — trilha exclusiva de Bruno (Super Admin ativo).
 *   Aplicavel a D049 (`fechamento_bloqueado_sem_resp_financeiro`).
 * - `apenas_rf` — trilha exclusiva do proprio RF recem-nomeado
 *   (§7.3). Aplicavel a D050 (`responsavel_financeiro_nomeado`).
 */
export type AlertTrilha = 'padrao' | 'apenas_bruno' | 'apenas_rf';

/**
 * Metadata canonica de um tipo — imutavel, fonte unica da verdade.
 *
 * - `severidadePadrao`: severidade inicial ao gravar em `alerts`. O
 *   passo M6 pode aplicar override de canal mas a severidade persiste
 *   como gravada (canonizacao §6.4: a linha em `notifications`
 *   preserva severidade original mesmo com override de canal).
 * - `override_atencao_imediato`: quando `severidadePadrao === 'atencao'`
 *   e este flag e `true`, o M6 rota o canal para `imediato` (§6.5 e
 *   lista canonica §8.8). Ignorado para severidades `critico`, `info`,
 *   `observacao` (regra derivada da propria severidade).
 * - `escopoCanonico`: escopo obrigatorio ao invocar `emitAlert`.
 *   O motor rejeita entrada com escopo divergente. `null` significa
 *   que o motor aceita qualquer dos 3 valores (nenhum tipo canonico
 *   atualmente e assim; preservado para extensibilidade).
 * - `isentoM1`: se `true`, o passo M1 (supressao 90 dias pos-kickoff)
 *   e ignorado. Ver §8.3 lista.
 * - `isentoM4`: se `true`, o passo M4 (cooldown 7 dias) e ignorado.
 *   Ver §8.6 lista.
 * - `chaveM4Ampliada`: se `true`, a chave do cooldown inclui `fatorId`
 *   (aplicavel exclusivamente a `nr1_fator_critico` — §8.6 nota final).
 * - `trilha`: trilha canonica de destinatarios (§7).
 * - `rotuloLegivel`: string literal reproduzida bit-exact do §6.1.
 *   Assunto de e-mail, titulo do sino, titulo do pop-up.
 */
export interface TipoMetadata {
  readonly severidadePadrao: AlertSeveridade;
  readonly override_atencao_imediato: boolean;
  readonly escopoCanonico: AlertEscopo | null;
  readonly isentoM1: boolean;
  readonly isentoM4: boolean;
  readonly chaveM4Ampliada: boolean;
  readonly trilha: AlertTrilha;
  readonly rotuloLegivel: string;
}

// -----------------------------------------------------------------------
// Dicionario canonico
// -----------------------------------------------------------------------

/**
 * Dicionario canonico dos 17 tipos. Chaves e valores reproduzidos
 * bit-exact das secoes §3.1-§3.8 do DOC 06. Ordem canonica: NR-1 (2)
 * → Fase 8 (13) → RF (2). Rotulos legiveis reproduzidos literalmente
 * do §6.1.
 */
export const TIPO_DICTIONARY: Readonly<Record<AlertTipo, TipoMetadata>> = {
  // ============== NR-1 (2) — §3.1 ==============
  nr1_fator_critico: {
    severidadePadrao: 'atencao',
    override_atencao_imediato: false, // atencao com canal digest_semanal
    escopoCanonico: null, // empresa OU departamento (§3.1.1)
    isentoM1: true, // Y4
    isentoM4: false, // M4 aplicado com chave ampliada por fatorId
    chaveM4Ampliada: true,
    trilha: 'padrao',
    rotuloLegivel: 'Fator do Radar NR-1 em nível crítico',
  },
  nr1_ciclo_fechado: {
    severidadePadrao: 'atencao',
    override_atencao_imediato: false, // atencao com canal digest_semanal
    escopoCanonico: 'empresa',
    isentoM1: true,
    isentoM4: true, // §8.6 lista
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Ciclo do Radar NR-1 encerrado',
  },

  // ============== Fase 8 — Desempenho (3) — §3.2 ==============
  desempenho_queda_brusca: {
    severidadePadrao: 'critico',
    override_atencao_imediato: false, // critico e canal imediato natural (§6.3)
    escopoCanonico: 'colaborador',
    isentoM1: false,
    isentoM4: false,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Queda brusca de desempenho',
  },
  desempenho_estagnacao: {
    severidadePadrao: 'atencao',
    override_atencao_imediato: true, // Q2 canonizada — atencao → imediato
    escopoCanonico: 'colaborador',
    isentoM1: false,
    isentoM4: false,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Índice de desempenho abaixo do esperado',
  },
  desempenho_queda_isolada: {
    severidadePadrao: 'observacao',
    override_atencao_imediato: false, // observacao vai para digest sem override
    escopoCanonico: 'colaborador',
    isentoM1: false,
    isentoM4: false,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Queda pontual de desempenho',
  },

  // ============== Fase 8 — Assiduidade (1) — §3.3 ==============
  assiduidade_baixa: {
    severidadePadrao: 'critico',
    override_atencao_imediato: false,
    escopoCanonico: 'colaborador',
    isentoM1: false,
    isentoM4: false,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Assiduidade abaixo do mínimo',
  },

  // ============== Fase 8 — Plenitude (1) — §3.4 ==============
  divergencia_a_c: {
    severidadePadrao: 'observacao',
    override_atencao_imediato: false,
    escopoCanonico: 'colaborador',
    isentoM1: false,
    isentoM4: false,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Divergência entre autoavaliação e avaliação do líder',
  },

  // ============== Fase 8 — Perfil Individual (3) — §3.5 ==============
  perfil_inconsistente_primeira: {
    severidadePadrao: 'atencao',
    override_atencao_imediato: true, // T1 canonizada — atencao → imediato
    escopoCanonico: 'colaborador',
    isentoM1: false,
    isentoM4: false,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Perfil Individual do colaborador com inconsistência',
  },
  perfil_retest_consistente: {
    severidadePadrao: 'observacao',
    override_atencao_imediato: false,
    escopoCanonico: 'colaborador',
    isentoM1: false,
    isentoM4: false,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Perfil Individual — resposta consistente após reteste',
  },
  perfil_retest_reincidente: {
    severidadePadrao: 'atencao',
    override_atencao_imediato: true, // T1 canonizada
    escopoCanonico: 'colaborador',
    isentoM1: false,
    isentoM4: true, // V4 canonizada — reincidencia sempre alerta
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Perfil Individual com inconsistência após reteste',
  },

  // ============== Fase 8 — Administrativos desbloqueio (3) — §3.6 ==============
  desbloqueio_solicitado: {
    severidadePadrao: 'atencao',
    override_atencao_imediato: true, // T1 canonizada
    escopoCanonico: 'empresa',
    isentoM1: true,
    isentoM4: true,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Solicitação de desbloqueio de mês',
  },
  desbloqueio_aprovado: {
    severidadePadrao: 'atencao',
    override_atencao_imediato: true,
    escopoCanonico: 'empresa',
    isentoM1: true,
    isentoM4: true,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Solicitação de desbloqueio aprovada',
  },
  desbloqueio_recusado: {
    severidadePadrao: 'atencao',
    override_atencao_imediato: true,
    escopoCanonico: 'empresa',
    isentoM1: true,
    isentoM4: true,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Solicitação de desbloqueio recusada',
  },

  // ============== Fase 8 — Administrativos ciclos (2) — §3.7 ==============
  ciclo_instrumento_encerrado: {
    severidadePadrao: 'atencao',
    override_atencao_imediato: false, // atencao vai para digest (sem override)
    escopoCanonico: 'empresa',
    isentoM1: true,
    isentoM4: true,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Instrumento C encerrado',
  },
  ciclo_mensal_fechado: {
    severidadePadrao: 'atencao',
    override_atencao_imediato: false,
    escopoCanonico: 'empresa',
    isentoM1: true,
    isentoM4: true,
    chaveM4Ampliada: false,
    trilha: 'padrao',
    rotuloLegivel: 'Mês fechado para lançamentos',
  },

  // ============== RF (2 — D049/D050) — §3.8 ==============
  fechamento_bloqueado_sem_resp_financeiro: {
    severidadePadrao: 'critico',
    override_atencao_imediato: false, // critico e canal imediato natural
    escopoCanonico: 'empresa',
    isentoM1: true, // §8.3 — evento administrativo critico nao suprimido
    isentoM4: true, // §8.6 — evento critico canonicamente sem cooldown (D7)
    chaveM4Ampliada: false,
    trilha: 'apenas_bruno', // §7.3 trilha exclusiva
    rotuloLegivel: 'Fechamento mensal sem Responsável financeiro',
  },
  responsavel_financeiro_nomeado: {
    severidadePadrao: 'info',
    override_atencao_imediato: false, // info nao vai para e-mail (§6.5)
    escopoCanonico: 'colaborador',
    isentoM1: true, // §8.3 — evento administrativo nao sujeito a onboarding
    isentoM4: false, // passa por M4 mas cadencia natural nunca colide
    chaveM4Ampliada: false,
    trilha: 'apenas_rf', // §7.3 trilha exclusiva do proprio RF
    rotuloLegivel: 'Você foi nomeado Responsável financeiro',
  },
};

// -----------------------------------------------------------------------
// Emojis canonicos §6.2
// -----------------------------------------------------------------------

/**
 * Emojis canonicos por severidade (§6.2). Uso obrigatorio em e-mails e
 * no sino. Reproducao literal.
 *
 * - 🔴 `critico` — aparece em e-mails e no sino.
 * - 🔶 `atencao` — aparece em e-mails e no sino.
 * - ⚪ `observacao` — aparece em e-mails (apenas no digest) e no sino.
 * - 🔵 `info` — aparece apenas no sino, nunca em e-mails.
 */
export const SEVERIDADE_EMOJI: Readonly<Record<AlertSeveridade, string>> = {
  critico: '🔴',
  atencao: '🔶',
  observacao: '⚪',
  info: '🔵',
};

// -----------------------------------------------------------------------
// Guardas canonicas de entrada
// -----------------------------------------------------------------------

/**
 * Erro canonico lancado por `assertTipoCanonico` quando o valor recebido
 * nao esta no enum dos 17 tipos. Consumido pelo `emitAlert` para
 * transformar em log estruturado (§8.13).
 */
export class AlertTipoInvalidoError extends Error {
  constructor(public readonly tipoRecebido: string) {
    super(
      `alert.type.invalid — tipo "${tipoRecebido}" nao esta no enum canonico ` +
        `de 17 valores (DOC 06 §3, DOC 01 §15.2). Valores aceitos: ` +
        NOTIFICATION_TIPO_VALUES.join(', '),
    );
    this.name = 'AlertTipoInvalidoError';
  }
}

/**
 * Guardiao canonico de entrada do `emitAlert`. Narrowing type-safe:
 * apos retornar, TypeScript sabe que `tipo` e `AlertTipo`.
 *
 * @throws AlertTipoInvalidoError se `tipo` fora do enum.
 */
export function assertTipoCanonico(tipo: string): asserts tipo is AlertTipo {
  if (!(NOTIFICATION_TIPO_VALUES as readonly string[]).includes(tipo)) {
    throw new AlertTipoInvalidoError(tipo);
  }
}

/**
 * Devolve metadata canonica do tipo. Assume que `tipo` ja foi validado
 * por `assertTipoCanonico`; o Record e denso (17 chaves = 17 tipos).
 */
export function getTipoMetadata(tipo: AlertTipo): TipoMetadata {
  return TIPO_DICTIONARY[tipo];
}
