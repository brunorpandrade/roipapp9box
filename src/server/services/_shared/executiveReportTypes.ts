// ROIP APP 9BOX — tipos compartilhados do Relatorio executivo trimestral
// (ME-053, S275).
//
// Modulo canonico de tipos consumido pelo motor deterministico
// (`executiveReportEngine.ts`), pelo motor IA
// (`executiveReportAI.ts`) e pelo template PDF
// (`executiveReportTemplate.ts`). Fica em `_shared/` para nao
// introduzir dependencia circular entre engine e AI, seguindo o
// precedente canonico de `_shared/dashboardContextTypes.ts` (ME-052).
//
// Estruturas literais aderentes a DOC 04 §7.2 (cinco pacotes-bloco +
// pacote-sintese) e §8.5-§8.10 (payloads JSON literais que serao
// serializados no user prompt canonico).
//
// Convencao canonica: campos numericos usam `number | null` — `null`
// indica ausencia canonica (ex.: `comparativoTrimestreAnterior` sem
// historico, comparativo com o ano anterior sem 5 trimestres fechados
// disponiveis, escopo `equipe` sem bloco Turnover). O motor
// deterministico e responsavel por popular `null` conforme regra
// canonica; o motor IA repassa; o template omite ou renderiza
// conforme regra canonica de UI (DOC 05).
//
// RV-13: cada tipo aqui e consumido explicitamente por engine, AI e
// template — nada morre no `_shared/`.

/**
 * Escopo canonico do relatorio (§7.5 DOC 04). Union fechada de 3
 * valores; `equipe` implica omissao do bloco Turnover (§7.2 item 5).
 */
export type ExecutiveReportEscopoTipo = 'empresa' | 'departamento' | 'equipe';

/**
 * Referencia contextual do escopo (§13.9 DOC 03):
 * - `empresa` — `escopoReferencia = null`.
 * - `departamento` — `escopoReferencia = employees.departamento` (uma
 *   das 19 strings canonicas).
 * - `equipe` — `escopoReferencia = liderId` como string (numero do
 *   `employees.id` do lider direto).
 */
export interface ExecutiveReportEscopo {
  tipo: ExecutiveReportEscopoTipo;
  /** `null` para `tipo='empresa'`. */
  referencia: string | null;
  /** Rotulo humano — usado no user prompt e no PDF. */
  rotulo: string;
}

// ============================================================
// Blocos canonicos §8.5-§8.9
// ============================================================

/** Pacote-bloco Financeiro (§8.5). */
export interface ExecReportBlocoFinanceiro {
  escopo: {
    tipo: ExecutiveReportEscopoTipo;
    referencia: string;
    trimestre: string;
  };
  trimestreAtual: {
    roiAgregado: number | null;
    faturamentoMedioTrimestral: number | null;
    folhaTotalMedia: number | null;
    percMetaAtingidaAgregada: number | null;
    colaboradoresAtivos: number;
    /**
     * ME-1.3d-REV DIS-A: percentual canonico da folha total media sobre o
     * faturamento medio trimestral (0..100). `null` quando qualquer dos
     * dois agregados for `null` ou faturamento = 0.
     */
    percFolhaFaturamento: number | null;
    /**
     * Faixa canonica ideal da folha em % do faturamento, vinda de
     * `companies.folhaPercMinima` / `.folhaPercMaxima`. Quando ambas
     * `null` (empresa sem config), o template omite a comparacao.
     */
    folhaPercMinimaIdeal: number | null;
    folhaPercMaximaIdeal: number | null;
    /**
     * ME-1.3d-REV DIS-C CC079-1: faturamento ideal (R$) derivado do
     * benchmark setorial da empresa — consumido como "Meta" financeira
     * na linha nova de 3 cards (Meta / Realizado / % atingido do ideal)
     * do bloco Financeiro do PDF executivo. `null` quando o diagnostico
     * economico da empresa nao contem valor calculado.
     */
    faturamentoIdeal: number | null;
  };
  comparativoTrimestreAnterior: {
    roiAgregado: number | null;
    variacaoPercentualRoi: number | null;
    percMetaAtingidaAgregada: number | null;
    variacaoPercentualMeta: number | null;
  } | null;
  comparativoMesmoTrimestreAnoAnterior: {
    roiAgregado: number | null;
    variacaoPercentualRoi: number | null;
  } | null;
}

/** Pacote-bloco Desempenho (§8.6). */
export interface ExecReportBlocoDesempenho {
  escopo: {
    tipo: ExecutiveReportEscopoTipo;
    referencia: string;
    trimestre: string;
  };
  trimestreAtual: {
    scoreDesempenhoMedioAgregado: number | null;
    percMetaAtingidaAgregada: number | null;
    assiduidadeMedia: number | null;
    distribuicaoPorFaixa: {
      acimaMeta: number;
      naMeta: number;
      proximoMeta: number;
      abaixoMeta: number;
    };
    colaboradoresAtivos: number;
  };
  comparativoTrimestreAnterior: {
    scoreDesempenhoMedioAgregado: number | null;
    variacaoPercentual: number | null;
    percMetaAtingidaAgregada: number | null;
  } | null;
}

/** Pacote-bloco Plenitude (§8.7). */
export interface ExecReportBlocoPlenitude {
  escopo: {
    tipo: ExecutiveReportEscopoTipo;
    referencia: string;
    trimestre: string;
  };
  trimestreAtual: {
    plenitudeScoreMedioAgregado: number | null;
    scoreAMedio: number | null;
    scoreCMedio: number | null;
    porDimensaoAgregada: {
      engajamento: number | null;
      desenvolvimento: number | null;
      pertencimento: number | null;
      realizacao: number | null;
    };
    percColaboradoresComAlertaDivergencia: number | null;
    colaboradoresAtivos: number;
  };
  comparativoTrimestreAnterior: {
    plenitudeScoreMedioAgregado: number | null;
    variacaoPercentual: number | null;
  } | null;
}

/**
 * Pacote-bloco Clima (§8.8). Quando `disponivel=false`, o motor IA
 * usa o paragrafo canonico curto §7.6 sem processar os demais campos.
 */
export interface ExecReportBlocoClima {
  escopo: {
    tipo: ExecutiveReportEscopoTipo;
    referencia: string;
    trimestre: string;
  };
  /** Trimestre de referencia efetivo (pode diferir do trimestre do escopo). */
  trimestreReferencia: string;
  disponivel: boolean;
  trimestreAtual: {
    notaClima: number | null;
    adesao: number | null;
    porDimensaoAgregada: {
      engajamento: number | null;
      desenvolvimento: number | null;
      pertencimento: number | null;
      realizacao: number | null;
    };
    respondentes: number;
    /**
     * ME-1.3d-REV DIS-A: notas canonicas por aspecto do instrumento de
     * clima. Convencao `(dimensao - 1) * 5 + (itemIndex - 1)` com 20
     * posicoes (4 dimensoes x 5 aspectos). Espelha `notasQuestao` do
     * `climateCalculationEngine`. Consumido APENAS pelo bloco agregado
     * da empresa no template PDF (DIS-B); dept e equipe ignoram.
     */
    notasPorAspecto: readonly (number | null)[];
  } | null;
  comparativoTrimestreAnterior: {
    notaClima: number | null;
    variacaoPercentual: number | null;
  } | null;
  /**
   * Texto canonico pre-composto pelo backend quando o piso de anonimato
   * forcou agregacao a nivel hierarquico superior (§7.6). A IA reproduz
   * contextualmente sem inventar.
   */
  notaAgregacaoAnonimato: string | null;
}

/**
 * Pacote-bloco Turnover (§8.9). Omitido do payload quando escopo e
 * `equipe` (nao ha chamada IA para este bloco). Quando escopo e
 * `departamento`, a abertura por nivel hierarquico e omitida.
 */
export interface ExecReportBlocoTurnover {
  escopo: {
    tipo: 'empresa' | 'departamento';
    referencia: string;
    trimestre: string;
  };
  trimestreAtual: {
    turnoverTrimestralPercentual: number;
    turnoverAnualizadoPercentual: number;
    colaboradoresAtivosInicioTrimestre: number;
    saidasTotais: number;
    saidasVoluntarias: number;
    saidasInvoluntarias: number;
    /**
     * ME-1.3d-REV DIS-A: taxas canonicas de rotatividade abertas por
     * motivo (voluntario vs involuntario) sobre o denominador trimestral.
     * `saidasVoluntarias / headcountInicio × 100` e simetrico. Precisao
     * canonica 2 casas (igual `TURNOVER_PRECISION_DECIMALS`).
     */
    turnoverVoluntarioPercentual: number;
    turnoverInvoluntarioPercentual: number;
  };
  /**
   * ME-1.3d-REV DIS-A: janela movel canonica de 12 meses encerrando no
   * fim do trimestre. Presente em todos os escopos (empresa e dept).
   */
  ultimos12Meses: {
    turnoverPercentual: number;
    saidasTotais: number;
    headcountInicio: number;
  };
  /** Presente apenas quando `escopo.tipo='empresa'`. */
  aberturaPorNivelHierarquico: {
    estrategico: { turnoverPercentual: number; saidas: number };
    tatico: { turnoverPercentual: number; saidas: number };
    operacional: { turnoverPercentual: number; saidas: number };
  } | null;
  comparativoTrimestreAnterior: {
    turnoverTrimestralPercentual: number | null;
    variacaoPercentual: number | null;
  } | null;
}

// ============================================================
// Pacote-sintese §8.10
// ============================================================

/**
 * Pacote-sintese canonico (§8.10) — consumido na 6a chamada IA. Os
 * paragrafos interpretativos ja gerados pelas chamadas de bloco sao
 * inseridos aqui.
 */
export interface ExecReportPacoteSintese {
  escopo: {
    tipo: ExecutiveReportEscopoTipo;
    referencia: string;
    trimestre: string;
  };
  resumosPorBloco: {
    financeiro: {
      roiAgregado: number | null;
      variacaoPercentualTrimestreAnterior: number | null;
      percMetaAtingidaAgregada: number | null;
      paragrafoInterpretativo: string;
    };
    desempenho: {
      scoreDesempenhoMedioAgregado: number | null;
      variacaoPercentual: number | null;
      paragrafoInterpretativo: string;
    };
    plenitude: {
      plenitudeScoreMedioAgregado: number | null;
      percColaboradoresComAlertaDivergencia: number | null;
      paragrafoInterpretativo: string;
    };
    clima: {
      notaClima: number | null;
      adesao: number | null;
      disponivel: boolean;
      paragrafoInterpretativo: string;
    };
    turnover: {
      turnoverTrimestralPercentual: number | null;
      turnoverAnualizadoPercentual: number | null;
      disponivelParaEscopo: boolean;
      paragrafoInterpretativo: string | null;
    };
  };
}

// ============================================================
// Payload deterministico completo (saida do engine)
// ============================================================

/**
 * Payload canonico consolidado do motor deterministico. Contem os 5
 * (ou 4) pacotes-bloco alem de contexto adicional para o template:
 * capa, cabecalhos, detalhamento capilar por departamento e equipe
 * (renderizado sem participacao da IA — §7.5).
 */
export interface ExecutiveReportDeterministicoPayload {
  companyId: number;
  /** Nome fantasia da empresa para capa/cabecalho. */
  nomeFantasia: string;
  /** Razao social sanitizada para nome do arquivo (§13.5). */
  razaoSocialSanitizada: string;
  /**
   * ME-1.3d-REV DIS-C CC079-1: URL da logo da empresa, carregada de
   * `companies.logoUrl`. Quando `null` ou ausente, o template nao
   * renderiza a marca independente no canto superior direito das
   * paginas. Opcional para compatibilidade com fixtures legados.
   */
  logoUrl?: string | null;
  escopo: ExecutiveReportEscopo;
  trimestre: string;
  /** Trimestre imediatamente anterior canonico. */
  trimestreAnterior: string;
  /** Mesmo trimestre do ano anterior (para comparativo financeiro §7.2). */
  mesmoTrimestreAnoAnterior: string;
  blocoFinanceiro: ExecReportBlocoFinanceiro;
  blocoDesempenho: ExecReportBlocoDesempenho;
  blocoPlenitude: ExecReportBlocoPlenitude;
  blocoClima: ExecReportBlocoClima;
  /** `null` quando escopo=equipe (§8.9). */
  blocoTurnover: ExecReportBlocoTurnover | null;
  /** Detalhamento capilar canonico §7.5 (cascata). */
  detalhamentoCapilar: ExecReportDetalhamentoCapilar;
}

/** Linha canonica de departamento na visao comparativa (§7.5 item 4). */
export interface ExecReportDepartamentoLinha {
  departamento: string;
  colaboradoresAtivos: number;
  scoreDesempenhoMedio: number | null;
  plenitudeScoreMedio: number | null;
  notaClima: number | null;
  turnoverTrimestralPercentual: number | null;
  equipes: ExecReportEquipeLinha[];
}

/** Linha canonica de equipe no detalhamento capilar (§7.5 item 5). */
export interface ExecReportEquipeLinha {
  liderId: number;
  liderNome: string;
  colaboradoresAtivos: number;
  scoreDesempenhoMedio: number | null;
  plenitudeScoreMedio: number | null;
  /**
   * ME-1.3d-REV DIS-A: tipo canonico do lider para distinguir
   * colaboradores comuns (lider_f6) de C-levels na agregacao Opcao B.
   */
  tipoLider: 'colaborador' | 'clevel';
  /**
   * ME-1.3d-REV DIS-A: departamento canonico de origem do lider. Quando
   * difere do departamento do bloco (lider externo liderando colaboradores
   * do bloco), o template exibe entre parenteses. Para C-level, carrega
   * o rotulo canonico 'C-level' em vez de departamento.
   */
  departamentoDoLider: string | null;
}

/**
 * Detalhamento capilar canonico (§7.5). Vazio quando escopo e
 * `equipe` (o bloco unico da equipe cobre — sem descer).
 */
export interface ExecReportDetalhamentoCapilar {
  departamentos: ExecReportDepartamentoLinha[];
}

// ============================================================
// Payload final ao template (com paragrafos IA anexados)
// ============================================================

/**
 * Resultado final da geracao: payload deterministico + paragrafos
 * interpretativos da IA + resumo executivo geral. Consumido pelo
 * template PDF.
 */
export interface ExecutiveReportFinalPayload extends ExecutiveReportDeterministicoPayload {
  paragrafoFinanceiro: string;
  paragrafoDesempenho: string;
  paragrafoPlenitude: string;
  paragrafoClima: string;
  paragrafoTurnover: string | null;
  resumoExecutivoGeral: string;
  /**
   * ME-1.3d-REV DIS-A: 3 destaques canonicos derivados deterministicamente
   * dos proprios blocos (zero chamada IA — preserva determinismo bit-exact
   * do payload). Renderizados como bullets no topo do resumo executivo
   * geral pelo template PDF (DIS-B). Sempre exatamente 3 strings.
   */
  topDestaques: readonly [string, string, string];
  /** Data e hora canonica de geracao (rodape + rastreabilidade). */
  geradoEmIso: string;
}
