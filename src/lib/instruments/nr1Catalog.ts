// ROIP APP 9BOX — catalogo canonico do Radar NR-1 (ME-B10-03, S254).
//
// Origem canonica dos ENUNCIADOS:
// - DOC 03 §11.1 declara explicitamente que os 32 itens vigentes sao
//   placeholders autorais (redigidos por Bruno) para cobrir os 8
//   fatores COPSOQ. Serao substituidos pelos itens licenciados COPSOQ
//   oficiais antes do lancamento comercial. DOC 03 NAO os carrega.
// - Mockup `delta_instrumento_b_radar_nr1_mobile_v1.html` — unica
//   fonte materializada dos 32 enunciados literais (mockup desktop
//   `portal_radar_nr1_v3.html` traz apenas 13/32 amostrais). Sub-decisao
//   L130 da ME-B10-03: mobile prevalece por cobertura completa e por
//   ser revisao posterior absorvida (prefixo `delta_`).
//
// Estrutura canonica: 8 fatores x 4 itens = 32 itens (§11.4). Escala
// Likert canonica: 5 opcoes de valor inteiro 0..4 (§11.4 + backend
// `VALOR_MINIMO_NR1=0`, `VALOR_MAXIMO_NR1=4`). Legendas identicas as
// dos Instrumentos A e D (Nunca / Quase nunca / As vezes / Quase
// sempre / Sempre).
//
// Alinhamento canonico com `FATORES_NR1` do
// `src/server/services/nr1CalculationEngine.ts` (§11.6): id, nome e
// tipo bit-a-bit. O teste unit `nr1-catalog.test.ts` valida esse
// alinhamento (RV-13 dirigida: qualquer divergencia de nome/id/tipo
// entre catalogo e engine quebra a suite).
//
// Nomenclatura canonica das chaves do grid: `fator` + `itemIndex`
// (nao `dimensao` como no A/D — o backend Radar NR-1 usa `fator`
// no schema Zod do `save-nr1-response`; ver `internals.ts`).
//
// **RV-13.** Consumidores diretos:
// - `Nr1FormShell.tsx` via as 2 paginas de formulario (portal +
//   platform).
// - `tests/unit/nr1-catalog.test.ts` — cardinalidade (8x4=32),
//   unicidade (fator, itemIndex), alinhamento com FATORES_NR1,
//   escala 0..4, forma das legendas.

/** Tipo canonico do fator (§11.6). */
export type NR1FatorTipo = 'risco' | 'recurso';

/** Item unitario canonico do grid 8x4 (§11.4). */
export interface NR1CatalogItem {
  readonly fator: number;
  readonly itemIndex: number;
  readonly enunciado: string;
}

/** Fator canonico: id + nome + tipo + 4 itens (§11.6). */
export interface NR1CatalogFator {
  readonly id: number;
  readonly nome: string;
  readonly tipo: NR1FatorTipo;
  readonly itens: readonly NR1CatalogItem[];
}

/** Opcao Likert canonica: valor 0..4 + legenda literal (§11.4). */
export interface NR1CatalogLikertOption {
  readonly valor: number;
  readonly label: string;
}

/** Catalogo canonico completo do Radar NR-1. */
export interface NR1Catalog {
  readonly nome: string;
  readonly fatores: readonly NR1CatalogFator[];
  readonly legendas: readonly NR1CatalogLikertOption[];
  readonly numeroItens: number;
}

const LEGENDAS_NR1: readonly NR1CatalogLikertOption[] = Object.freeze([
  Object.freeze({ valor: 0, label: 'Nunca' }),
  Object.freeze({ valor: 1, label: 'Quase nunca' }),
  Object.freeze({ valor: 2, label: 'Às vezes' }),
  Object.freeze({ valor: 3, label: 'Quase sempre' }),
  Object.freeze({ valor: 4, label: 'Sempre' }),
]);

const FATORES_CATALOG: readonly NR1CatalogFator[] = Object.freeze([
  Object.freeze({
    id: 1,
    nome: 'Exigências quantitativas',
    tipo: 'risco' as NR1FatorTipo,
    itens: Object.freeze([
      Object.freeze({
        fator: 1,
        itemIndex: 1,
        enunciado: 'Tenho mais tarefas do que o tempo disponível permite concluir com qualidade.',
      }),
      Object.freeze({
        fator: 1,
        itemIndex: 2,
        enunciado: 'Costumo acumular trabalho pendente ao final do dia ou da semana.',
      }),
      Object.freeze({
        fator: 1,
        itemIndex: 3,
        enunciado:
          'Para dar conta das minhas atividades, preciso trabalhar em ritmo acima ' +
          'do que considero sustentável.',
      }),
      Object.freeze({
        fator: 1,
        itemIndex: 4,
        enunciado: 'Com frequência sinto que o volume de trabalho excede a capacidade da equipe.',
      }),
    ]),
  }),
  Object.freeze({
    id: 2,
    nome: 'Ritmo de trabalho',
    tipo: 'risco' as NR1FatorTipo,
    itens: Object.freeze([
      Object.freeze({
        fator: 2,
        itemIndex: 1,
        enunciado: 'Preciso trabalhar muito rápido para cumprir as demandas diárias.',
      }),
      Object.freeze({
        fator: 2,
        itemIndex: 2,
        enunciado: 'Tenho pouco tempo para pausas ou intervalos entre uma tarefa e outra.',
      }),
      Object.freeze({
        fator: 2,
        itemIndex: 3,
        enunciado: 'O ritmo cobrado no meu trabalho me deixa mentalmente exausto ao final do dia.',
      }),
      Object.freeze({
        fator: 2,
        itemIndex: 4,
        enunciado: 'Sinto pressão constante por entregar mais em menos tempo.',
      }),
    ]),
  }),
  Object.freeze({
    id: 3,
    nome: 'Conflitos de papel',
    tipo: 'risco' as NR1FatorTipo,
    itens: Object.freeze([
      Object.freeze({
        fator: 3,
        itemIndex: 1,
        enunciado: 'Recebo demandas contraditórias de pessoas diferentes na organização.',
      }),
      Object.freeze({
        fator: 3,
        itemIndex: 2,
        enunciado: 'Sou cobrado por resultados que dependem de fatores fora do meu controle.',
      }),
      Object.freeze({
        fator: 3,
        itemIndex: 3,
        enunciado: 'Preciso executar tarefas que considero fora do meu escopo de trabalho.',
      }),
      Object.freeze({
        fator: 3,
        itemIndex: 4,
        enunciado: 'Meus deveres e responsabilidades não estão claramente definidos.',
      }),
    ]),
  }),
  Object.freeze({
    id: 4,
    nome: 'Autonomia',
    tipo: 'recurso' as NR1FatorTipo,
    itens: Object.freeze([
      Object.freeze({
        fator: 4,
        itemIndex: 1,
        enunciado: 'Tenho liberdade para decidir como executar as minhas principais tarefas.',
      }),
      Object.freeze({
        fator: 4,
        itemIndex: 2,
        enunciado:
          'Posso organizar minha sequência de atividades de forma que faça sentido para mim.',
      }),
      Object.freeze({
        fator: 4,
        itemIndex: 3,
        enunciado: 'Costumo participar das decisões que afetam diretamente meu trabalho diário.',
      }),
      Object.freeze({
        fator: 4,
        itemIndex: 4,
        enunciado:
          'Tenho flexibilidade para ajustar meus horários conforme necessidades ' +
          'pessoais ou da equipe.',
      }),
    ]),
  }),
  Object.freeze({
    id: 5,
    nome: 'Suporte social do líder',
    tipo: 'recurso' as NR1FatorTipo,
    itens: Object.freeze([
      Object.freeze({
        fator: 5,
        itemIndex: 1,
        enunciado: 'Meu líder está disponível quando preciso de orientação ou apoio.',
      }),
      Object.freeze({
        fator: 5,
        itemIndex: 2,
        enunciado: 'Meu líder valoriza e reconhece o meu trabalho.',
      }),
      Object.freeze({
        fator: 5,
        itemIndex: 3,
        enunciado: 'Recebo do meu líder feedback claro sobre o meu desempenho.',
      }),
      Object.freeze({
        fator: 5,
        itemIndex: 4,
        enunciado: 'Meu líder demonstra interesse genuíno pelo meu bem-estar.',
      }),
    ]),
  }),
  Object.freeze({
    id: 6,
    nome: 'Suporte social de colegas',
    tipo: 'recurso' as NR1FatorTipo,
    itens: Object.freeze([
      Object.freeze({
        fator: 6,
        itemIndex: 1,
        enunciado:
          'Posso contar com meus colegas quando preciso de ajuda para resolver um problema.',
      }),
      Object.freeze({
        fator: 6,
        itemIndex: 2,
        enunciado: 'Meus colegas demonstram respeito e consideração no dia a dia.',
      }),
      Object.freeze({
        fator: 6,
        itemIndex: 3,
        enunciado: 'Existe cooperação e parceria entre as pessoas da minha equipe.',
      }),
      Object.freeze({
        fator: 6,
        itemIndex: 4,
        enunciado: 'Sinto que faço parte de uma equipe que trabalha junto por objetivos comuns.',
      }),
    ]),
  }),
  Object.freeze({
    id: 7,
    nome: 'Insegurança no trabalho',
    tipo: 'risco' as NR1FatorTipo,
    itens: Object.freeze([
      Object.freeze({
        fator: 7,
        itemIndex: 1,
        enunciado: 'Sinto que meu vínculo com a empresa é estável.',
      }),
      Object.freeze({
        fator: 7,
        itemIndex: 2,
        enunciado: 'Tenho clareza sobre as perspectivas do meu cargo nos próximos meses.',
      }),
      Object.freeze({
        fator: 7,
        itemIndex: 3,
        enunciado:
          'Costumo me preocupar com mudanças organizacionais que possam afetar minha posição.',
      }),
      Object.freeze({
        fator: 7,
        itemIndex: 4,
        enunciado: 'As mudanças na empresa costumam ser comunicadas com transparência.',
      }),
    ]),
  }),
  Object.freeze({
    id: 8,
    nome: 'Saúde geral autopercebida',
    tipo: 'recurso' as NR1FatorTipo,
    itens: Object.freeze([
      Object.freeze({
        fator: 8,
        itemIndex: 1,
        enunciado: 'Considero meu estado geral de saúde bom.',
      }),
      Object.freeze({
        fator: 8,
        itemIndex: 2,
        enunciado: 'Tenho energia suficiente para enfrentar as demandas do meu dia de trabalho.',
      }),
      Object.freeze({
        fator: 8,
        itemIndex: 3,
        enunciado: 'Nos últimos meses, meu bem-estar físico e emocional tem se mantido estável.',
      }),
      Object.freeze({
        fator: 8,
        itemIndex: 4,
        enunciado: 'Sinto que minha saúde permite desempenhar meu trabalho sem grande desgaste.',
      }),
    ]),
  }),
]);

/** Catalogo canonico completo do Radar NR-1. */
export const NR1_CATALOG: NR1Catalog = Object.freeze({
  nome: 'Radar NR-1',
  fatores: FATORES_CATALOG,
  legendas: LEGENDAS_NR1,
  numeroItens: 32,
});
