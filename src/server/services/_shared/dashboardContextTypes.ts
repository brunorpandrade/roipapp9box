// ROIP APP 9BOX — tipos compartilhados do contexto do dashboard
// (ME-052, S268).
//
// Contratos canonicos JSON dos user prompts §8.3.1 (dashboard
// individual) e §8.3.2 (dashboard de equipe) do DOC 04. Consumidos
// pelo motor Chat IA (`aiChatService`) e pelo motor Diagnostico IA
// (`diagnosticoIAService` — reusa contexto individual conforme §6.2).
//
// Regra canonica: campos ausentes de dados recebem `null` explicito
// (§8.3.1 nota final: "Campos ausentes de dados... recebem null").
// Bloqueios canonicos por permissao (§5.6) sao aplicados pelo
// composer:
//   - `financeiro` = null quando usuario logado e lider (individual).
//   - `iql` = null em autovisualizacao (individual + equipe).
//   - `roi_estimado_medio` = null quando lider (equipe).
//
// D059 (FECHADO na ME-054): agregados de equipe, distribuicao_9box,
// historico agregado dos 4 trimestres, detalhamento_variaveis,
// dialogos_desenvolvimento_recentes, dx/dy e assiduidade populados
// pelos motores de agregacao on-read desta ME.
//
// CC (ME-054, D3 Opcao B): as chaves de `distribuicao_9box` do DOC 04
// §8.3.2 usavam nomenclatura generica de 9-box de mercado (estrela,
// alto_desempenho, ...) sem correspondencia com os 9 quadrantes
// canonicos do produto (DOC 01 enum + DOC 03 §6). Corrigidas aqui
// para os nomes canonicos em snake_case; correcao canonica do DOC 04
// registrada no fechamento da ME-054.

/**
 * Nivel canonico do dashboard suportado pelo Chat IA no MVP (S263).
 * `global` e `departamento` sao bloqueados na superficie tRPC.
 */
export type ChatIaDashboardLevel = 'equipe' | 'individual';

/** Tipos de usuario canonicos (schema `aiConversations.userType`). */
export type ChatIaUserType = 'employee' | 'clevel' | 'super_admin';

/**
 * Identificacao do colaborador no contexto individual (§8.3.1). Todos
 * os campos preenchidos por leitura direta de `employees` +
 * `employeeLeaderHistory`.
 */
export interface DashboardIndividualIdentificacao {
  nome: string;
  cargo: string;
  departamento: string;
  familia_funcao: string;
  nivel_hierarquico: 'operacional' | 'tatico' | 'estrategico';
  senioridade: string;
  tempo_empresa: string;
  lider_direto: string;
}

/**
 * Payload canonico do contexto do dashboard individual (§8.3.1).
 * Estrutura literal do JSON enviado ao user prompt do Chat IA e do
 * Diagnostico IA (§6.2 canoniza reuso).
 */
export interface DashboardIndividualContextPayload {
  identificacao: DashboardIndividualIdentificacao;
  trimestre_atual: string | null;
  eixo_x: {
    score_desempenho: number | null;
    indice_desempenho: number | null;
    /**
     * Detalhamento por variavel do mes mais recente com dados do
     * trimestre atual (ME-054). `percentual` = razao executado/demanda
     * do motor Eixo X convertida a escala 0-100 (cap canonico 150).
     */
    detalhamento_variaveis: Array<{
      nome: string;
      meta: number | null;
      demanda: number | null;
      executado: number | null;
      percentual: number | null;
      peso: number | null;
    }>;
  };
  eixo_y: {
    plenitude_score: number | null;
    score_a: number | null;
    score_c: number | null;
    alerta_divergencia: boolean;
    magnitude_divergencia: number | null;
    por_dimensao: {
      engajamento: { a: number | null; c: number | null };
      desenvolvimento: { a: number | null; c: number | null };
      pertencimento: { a: number | null; c: number | null };
      realizacao: { a: number | null; c: number | null };
    };
  };
  capacidade_ociosa: {
    valor: number | null;
    faixa: 'baixa' | 'adequada' | 'elevada' | null;
  };
  assiduidade: number | null;
  /**
   * Bloco financeiro pessoal. Bloqueado (`null`) quando usuario logado
   * e lider da pessoa em questao (§5.6 individual).
   */
  financeiro: {
    roi_estimado: number | null;
    meta_roi: number | null;
    retorno_estimado: number | null;
    perc_meta_atingida: number | null;
  } | null;
  '9box': {
    quadrante: string | null;
    dx: number | null;
    dy: number | null;
  };
  /**
   * IQL do colaborador (quando lider, count_respondentes >= 3, e nao
   * autovisualizacao). `null` nas demais condicoes canonicas (§5.6).
   */
  iql: {
    iql: number | null;
    count_respondentes: number;
    por_dimensao: Record<string, number | null>;
  } | null;
  /**
   * Historico canonico §8.3.1 (ME-054): 4 trimestres mais recentes
   * enriquecidos com plenitude, quadrante, assiduidade e financeiro.
   * `financeiro` = null por linha quando o viewer e lider (§5.6).
   */
  historico_4_trimestres: Array<{
    trimestre: string;
    score_desempenho: number | null;
    plenitude_score: number | null;
    quadrante: string | null;
    perc_meta_atingida: number | null;
    capacidade_ociosa: number | null;
    assiduidade: number | null;
    financeiro: { roi_estimado: number | null } | null;
  }>;
  dialogos_desenvolvimento_recentes: Array<{
    titulo: string;
    created_at: string;
    status: 'verde' | 'vermelho';
    pendencia: boolean;
  }>;
  /**
   * Bloco `perfil_individual` — omitido quando §5.3 nao atende as 3
   * condicoes (assessment enviado, scores completos, permissao PC1e).
   * `undefined` = omitido silenciosamente do JSON serializado.
   */
  perfil_individual?: {
    disponivel: true;
    confiabilidade: 'alta' | 'moderada';
    dimensoes_afetadas_por_hedge: string[] | null;
    escores: unknown;
    perfil_comportamental: string | null;
    motor_hierarquia: {
      dominante: string | null;
      sustentacao: string | null;
      negligenciado: string | null;
    };
    top_3_assinatura: string[];
    flags_ativas: string[];
  };
}

/**
 * Identificacao da equipe no contexto §8.3.2. Todos os campos
 * preenchidos por leitura direta de `employees` (do lider) +
 * `employeeLeaderHistory` (contagem de diretos e cadeia).
 */
export interface DashboardEquipeIdentificacao {
  nome_lider: string;
  departamento: string;
  diretos: number;
  total_incluindo_abaixo: number;
}

/**
 * Chave canonica snake_case de cada um dos 9 quadrantes do produto
 * (ME-054, D3 Opcao B). Fonte dos nomes: enum
 * `nineBoxClassifications.quadrante` (DOC 01) — nomenclatura unica
 * exibida nas telas e falada pela IA.
 */
export const NINE_BOX_QUADRANTE_TO_KEY = {
  'ALTO IMPACTO': 'alto_impacto',
  'DESEMPENHO REPRESADO': 'desempenho_represado',
  'POTENCIAL SUBUTILIZADO': 'potencial_subutilizado',
  'ALTA ENTREGA': 'alta_entrega',
  'EQUILÍBRIO FRÁGIL': 'equilibrio_fragil',
  'DESEMPENHO CRÍTICO': 'desempenho_critico',
  'RISCO DE ESGOTAMENTO': 'risco_de_esgotamento',
  'DESGASTE OCULTO': 'desgaste_oculto',
  'RISCO CRÍTICO': 'risco_critico',
} as const;

/** Chave canonica de quadrante no payload (ME-054, D3 Opcao B). */
export type NineBoxQuadranteKey =
  (typeof NINE_BOX_QUADRANTE_TO_KEY)[keyof typeof NINE_BOX_QUADRANTE_TO_KEY];

/**
 * Distribuicao canonica por quadrante (ME-054): contagem de diretos
 * classificados no trimestre atual, chaveada pelos nomes canonicos.
 */
export type DashboardEquipeDistribuicao9Box = Record<NineBoxQuadranteKey, number>;

/**
 * Payload canonico do contexto do dashboard de equipe (§8.3.2).
 * Estrutura literal do JSON enviado ao user prompt do Chat IA.
 *
 * D059 (FECHADO na ME-054): agregados, distribuicao_9box e
 * historico_4_trimestres populados pelo motor de agregacao on-read.
 */
export interface DashboardEquipeContextPayload {
  identificacao: DashboardEquipeIdentificacao;
  trimestre_atual: string | null;
  agregados: {
    score_desempenho_medio: number | null;
    plenitude_score_medio: number | null;
    score_a_medio: number | null;
    capacidade_ociosa_media: number | null;
    /**
     * Bloqueado (`null`) quando usuario logado e lider (§5.6 equipe:
     * dados financeiros individuais omitidos para lider).
     */
    roi_estimado_medio: number | null;
    perc_meta_atingida_media: number | null;
    assiduidade_media: number | null;
  };
  distribuicao_9box: DashboardEquipeDistribuicao9Box;
  /**
   * IQL do lider. Bloqueado (`null`) quando usuario logado e o proprio
   * lider (autovisualizacao — §5.6 equipe).
   */
  iql_lider: {
    iql: number | null;
    count_respondentes: number;
  } | null;
  clima_equipe: {
    nota_clima: number | null;
    adesao: number | null;
  };
  /**
   * Historico canonico §8.3.2 (ME-054): ate 4 trimestres distintos
   * mais recentes com medias da equipe. `roi_medio` = null por linha
   * quando o viewer e lider (§5.6).
   */
  historico_4_trimestres: Array<{
    trimestre: string;
    score_desempenho_medio: number | null;
    plenitude_score_medio: number | null;
    roi_medio: number | null;
    nota_clima: number | null;
  }>;
  lista_colaboradores: Array<{
    nome: string;
    quadrante: string | null;
    score_desempenho: number | null;
  }>;
}

/**
 * Argumentos canonicos para o loader do contexto individual (§8.3.1).
 * `viewerUserId` e `viewerUserType` sao usados para detectar
 * autovisualizacao (§5.6) e bloqueio de financeiro por lider.
 */
export interface DashboardIndividualContextArgs {
  companyId: number;
  employeeId: number;
  viewerRole: 'super_admin' | 'rh' | 'rh_lider' | 'clevel' | 'lider';
  viewerUserId: number;
  viewerUserType: ChatIaUserType;
}

/**
 * Argumentos canonicos para o loader do contexto de equipe (§8.3.2).
 * `contextId` e o `employeeId` do lider (§10.2 do DOC 01).
 */
export interface DashboardEquipeContextArgs {
  companyId: number;
  liderId: number;
  viewerRole: 'super_admin' | 'rh' | 'rh_lider' | 'clevel' | 'lider';
  viewerUserId: number;
  viewerUserType: ChatIaUserType;
}
