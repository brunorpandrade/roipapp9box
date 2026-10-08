// ROIP APP 9BOX — catalogo canonico do Instrumento C (avaliacao do
// colaborador direto pelo lider). ME-B11.2b.
//
// Origem canonica:
// - DOC 03 §6.3 — estrutura 4x5 (4 dimensoes x 5 itens = 20 itens),
//   escala 0-4 identica ao Instrumento A, redacao fixa versao lider.
// - DOC 05 §7.2 — layout do formulario administrativo (header com
//   "Avaliação do colaborador direto — [Nome]", corpo com lista
//   sequencial de itens, rodape com [Enviar avaliação]).
//
// Reuso canonico com `LikertFormShell` (ME-B10-02 estendida ME-B11.2):
// o shell renderiza qualquer catalogo que implemente `InstrumentCatalog`
// (compartilhado com A e D). O Instrumento C ainda nao tem rota real
// em producao — o backend (`src/server/services/instrumentC_assessments.ts`
// + `src/server/routers/instrumentC.ts`) existe desde o B9, mas a tela
// administrativa de preenchimento sera entregue em bloco futuro.
//
// A primeira materializacao visual do C acontece na aba
// `/super-admin/instrumentos` em canal `demo` (ME-B11.2b), com os
// mesmos 20 itens canonicos que a tela administrativa real usara
// quando for implementada. Zero duplicacao de redacao (L125): quando
// a tela real for construida, consumira este mesmo catalogo.
//
// **RV-13.** Consumidores diretos:
// - `InstrumentosSuperAdminClient.tsx` (ME-B11.2b) via `LikertFormShell`.
// - `tests/unit/instrumentCCatalog.test.ts` — assertivas de
//   cardinalidade (4 dim x 5 itens = 20), unicidade (dimensao,
//   itemIndex) e forma da legenda.
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.

import type { InstrumentCatalog } from './instrumentACatalog';

const LEGENDAS_C = Object.freeze([
  Object.freeze({ valor: 0, label: 'Nunca' }),
  Object.freeze({ valor: 1, label: 'Quase nunca' }),
  Object.freeze({ valor: 2, label: 'Às vezes' }),
  Object.freeze({ valor: 3, label: 'Quase sempre' }),
  Object.freeze({ valor: 4, label: 'Sempre' }),
]);

const DIMENSOES_C = Object.freeze([
  Object.freeze({
    nome: 'Engajamento',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 1,
        itemIndex: 1,
        enunciado: 'Demonstra energia e disposição para o trabalho',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 2,
        enunciado: 'Demonstra entusiasmo com as atividades que realiza',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 3,
        enunciado: 'Demonstra comprometimento com os resultados da área',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 4,
        enunciado: 'Mantém foco e concentração nas suas atividades',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 5,
        enunciado: 'Mesmo diante de dificuldades, mantém a dedicação ao trabalho',
      }),
    ]),
  }),
  Object.freeze({
    nome: 'Desenvolvimento',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 2,
        itemIndex: 1,
        enunciado: 'Demonstra aprendizado e evolução contínua na função',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 2,
        enunciado: 'Aproveita as oportunidades de crescimento oferecidas pela empresa',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 3,
        enunciado:
          'Responde bem aos desafios propostos, usando-os como oportunidade de desenvolvimento',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 4,
        enunciado: 'Demonstra clareza sobre o que precisa desenvolver para crescer na empresa',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 5,
        enunciado: 'Suas habilidades estão sendo bem aproveitadas nas atividades que desempenha',
      }),
    ]),
  }),
  Object.freeze({
    nome: 'Pertencimento',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 3,
        itemIndex: 1,
        enunciado: 'Demonstra senso de pertencimento ao time e à empresa',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 2,
        enunciado: 'Reconheço e valorizo as contribuições que este colaborador entrega',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 3,
        enunciado: 'Mantém boas relações com os colegas e com a equipe',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 4,
        enunciado: 'Sente-se à vontade para ser autêntico no ambiente de trabalho',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 5,
        enunciado: 'Sua opinião é considerada e respeitada pela equipe',
      }),
    ]),
  }),
  Object.freeze({
    nome: 'Realização',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 4,
        itemIndex: 1,
        enunciado: 'Demonstra que encontra sentido e propósito no trabalho que realiza',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 2,
        enunciado: 'Demonstra satisfação com o que realiza',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 3,
        enunciado: 'Conclui a maior parte das semanas com sensação de realização e entrega',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 4,
        enunciado: 'Seu trabalho contribui de forma relevante para a empresa',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 5,
        enunciado: 'Demonstra orgulho pelo que produz e entrega',
      }),
    ]),
  }),
]);

export const INSTRUMENT_C_CATALOG: InstrumentCatalog = Object.freeze({
  nome: 'Avaliação do colaborador direto',
  dimensoes: DIMENSOES_C,
  legendas: LEGENDAS_C,
  numeroItens: 20,
});
