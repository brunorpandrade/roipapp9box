// ROIP APP 9BOX — Registry canonico dos instrumentos para a aba demo
// `/super-admin/instrumentos` (ME-B11.2).
//
// Fonte unica da lista dinamica apresentada na aba Instrumentos do
// painel raiz do Super Admin. Ordenacao canonica: A, B, C, D, seguidos
// dos complementares (Perfil Individual). Cada entrada descreve, em
// linguagem comercial de demo, o-que-faz / para-que-serve /
// periodicidade / quem-preenche + a modalidade de experiencia do
// usuario habilitada nesta ME.
//
// RV-09 — fontes canonicas das descricoes:
// - A: CAMADA_NEGOCIO §6.2 + CAMADA_UI §7.1.
// - B: CAMADA_NEGOCIO §11 + CAMADA_UI §7.4.
// - C: CAMADA_NEGOCIO §6 + CAMADA_UI §7.2.
// - D: CAMADA_NEGOCIO §8.6 + CAMADA_UI §7.3.
// - PI: Perfil_Individual__instrumento_completo_.md + CAMADA_UI §7.5.
//
// RV-13 — consumido por `InstrumentosSuperAdminClient` + teste smoke.
// RV-14 — um statement por linha, largura maxima 100 cols.

/**
 * Modalidade de experiencia do usuario disponivel na aba demo.
 *
 * - `likert_a` / `likert_d` — reusa `LikertFormShell` com `canalAutenticacao='demo'`.
 * - `nr1` — reusa `Nr1FormShell` com `canalAutenticacao='demo'`.
 * - `perfil_individual` — reusa `PerfilIndividualFormShell` com `canalAutenticacao='demo'`.
 * - `nao_disponivel` — apenas tela de apresentacao textual (vide decisao
 *   D5=B da ME-B11.2 para o Instrumento C enquanto o shell real nao
 *   nasce em producao).
 */
export type InstrumentDemoKind =
  'likert_a' | 'likert_d' | 'nr1' | 'perfil_individual' | 'nao_disponivel';

export interface InstrumentDemoDescription {
  readonly oQueFaz: string;
  readonly paraQueServe: string;
  readonly periodicidade: string;
  readonly quemPreenche: string;
}

export interface InstrumentDemoEntry {
  readonly id: string;
  readonly ordem: number;
  readonly titulo: string;
  readonly subtitulo?: string;
  readonly etiquetaCurta: string;
  readonly descricao: InstrumentDemoDescription;
  readonly kind: InstrumentDemoKind;
  /**
   * Nota canonica exibida abaixo das 4 secoes na tela de apresentacao
   * quando `kind === 'nao_disponivel'`. Para os demais `kind`, fica
   * ausente e o botao "Experiencia do usuario" e renderizado.
   */
  readonly notaDisponibilidade?: string;
}

const INSTRUMENTOS_DEMO: readonly InstrumentDemoEntry[] = [
  {
    id: 'instrumento-a',
    ordem: 1,
    titulo: 'Instrumento A — Autoavaliação do colaborador',
    etiquetaCurta: 'A',
    descricao: {
      oQueFaz:
        '20 perguntas em escala de frequência (Nunca → Sempre) em que o próprio colaborador se ' +
        'avalia nas 4 dimensões canônicas de desempenho da plataforma.',
      paraQueServe:
        'Captura a leitura do colaborador sobre o próprio trabalho. Alimenta o Eixo Y ' +
        '(Plenitude) do 9-Box e sustenta as conversas de desenvolvimento entre líder e liderado.',
      periodicidade:
        'Trimestral. Abre no dia 16 do último mês de cada trimestre e permanece acessível sem ' +
        'fechamento (badge "Atrasado" após o dia 11 do mês subsequente).',
      quemPreenche:
        'Todo colaborador vinculado à empresa, exceto C-level, via portal autenticado por CPF.',
    },
    kind: 'likert_a',
  },
  {
    id: 'instrumento-b',
    ordem: 2,
    titulo: 'Instrumento B — Radar NR-1 (Riscos psicossociais)',
    etiquetaCurta: 'B',
    descricao: {
      oQueFaz:
        '32 perguntas em escala Likert de 5 pontos distribuídas em 8 fatores canônicos do ' +
        'framework NR-1 de riscos psicossociais no trabalho.',
      paraQueServe:
        'Mapeia a exposição percebida da organização a riscos psicossociais, atendendo à NR-1 ' +
        'do Ministério do Trabalho. Gera o Radar NR-1 por área com piso amostral respeitado.',
      periodicidade:
        'Anual ou semestral conforme configuração da empresa. Fecha definitivamente na data de ' +
        'corte do ciclo, sem reabertura administrativa.',
      quemPreenche:
        'Todo colaborador vinculado à empresa, de forma estritamente anônima, via portal ' +
        'autenticado por CPF.',
    },
    kind: 'nr1',
  },
  {
    id: 'instrumento-c',
    ordem: 3,
    titulo: 'Instrumento C — Avaliação do colaborador direto',
    etiquetaCurta: 'C',
    descricao: {
      oQueFaz:
        '20 perguntas em escala de frequência em que o líder direto avalia cada um de seus ' +
        'liderados, nas mesmas 4 dimensões do Instrumento A.',
      paraQueServe:
        'Captura a leitura da liderança sobre a entrega de cada liderado. Combinada com a ' +
        'autoavaliação (A), compõe o Eixo Y do 9-Box e serve de insumo para feedbacks ' +
        'estruturados e planos de desenvolvimento.',
      periodicidade:
        'Trimestral. Abre no dia 16 do último mês de cada trimestre e fecha definitivamente às ' +
        '00:00 do dia 11 do mês subsequente.',
      quemPreenche:
        'Líder direto, C-level, RH ou Super Admin, na plataforma administrativa. O líder nunca ' +
        'pode avaliar a si mesmo.',
    },
    kind: 'nao_disponivel',
    notaDisponibilidade:
      'A interface de preenchimento do Instrumento C será entregue junto com a implementação ' +
      'administrativa dedicada. Enquanto isso, a apresentação acima documenta como ele será ' +
      'aplicado em produção.',
  },
  {
    id: 'instrumento-d',
    ordem: 4,
    titulo: 'Instrumento D — Avaliação da liderança direta',
    etiquetaCurta: 'D',
    descricao: {
      oQueFaz:
        '20 perguntas em escala de frequência em que o colaborador avalia o próprio líder ' +
        'direto, dando voz ao liderado sobre a qualidade da liderança recebida.',
      paraQueServe:
        'Produz leitura 360º da liderança a partir dos liderados. Alimenta os painéis de líder ' +
        'e de C-level e sinaliza oportunidades de desenvolvimento gerencial.',
      periodicidade:
        'Semestral (apenas Q1 e Q3). Snapshot de vínculo canônico no dia 16 do mês de abertura.',
      quemPreenche:
        'Todo colaborador vinculado à empresa que tenha líder direto, de forma anônima dentro ' +
        'do escopo do líder avaliado (piso amostral aplicado), via portal autenticado por CPF.',
    },
    kind: 'likert_d',
  },
  {
    id: 'perfil-individual',
    ordem: 5,
    titulo: 'Perfil Individual',
    subtitulo: 'Instrumento complementar',
    etiquetaCurta: 'PI',
    descricao: {
      oQueFaz:
        '80 perguntas em 10 blocos combinando itens Likert, cenários situacionais e escolhas ' +
        'forçadas, mapeando 5 dimensões de perfil: Postura, Estrutura, Motor, Equilíbrio e ' +
        'Assinatura.',
      paraQueServe:
        'Gera o Perfil Individual canônico do colaborador, usado em movimentações, sucessão, ' +
        'formação de pares e autoconhecimento. É o relatório mais rico da plataforma.',
      periodicidade:
        'Aplicação única por colaborador. Pode ser reaplicado por decisão do RH para refletir ' +
        'mudança de função ou de ciclo de vida profissional.',
      quemPreenche:
        'Todo colaborador vinculado à empresa, incluindo C-level (acesso administrado por ' +
        'Bruno), via portal autenticado por CPF, com salvamento canônico por bloco.',
    },
    kind: 'perfil_individual',
  },
] as const;

/**
 * Lista canonica dos instrumentos para a aba demo, ja na ordem A, B, C, D,
 * complementares. Sempre nova referencia (readonly nao impede mutacao
 * involuntaria de consumidores por engano — devolvemos copia defensiva).
 */
export function listInstrumentDemoEntries(): readonly InstrumentDemoEntry[] {
  return INSTRUMENTOS_DEMO.slice().sort((a, b) => a.ordem - b.ordem);
}

/**
 * Procura uma entrada por id canonico. Retorna `null` quando o id nao
 * corresponde a nenhuma entrada registrada.
 */
export function findInstrumentDemoEntry(id: string): InstrumentDemoEntry | null {
  const encontrada = INSTRUMENTOS_DEMO.find((e) => e.id === id);
  if (encontrada === undefined) {
    return null;
  }
  return encontrada;
}
