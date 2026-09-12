// ROIP APP 9BOX — catalogo canonico do Instrumento D (avaliacao da
// lideranca direta). ME-B10-02 (S253).
//
// Origem canonica:
// - DOC 03 §8.2 — estrutura 4x5 (4 dimensoes x 5 itens = 20 itens),
//   escala Likert 0..4 identica ao A.
// - DOC 05 §7.3 — enunciados literais renderizados no formulario.
// - Mockup `delta_instrumento_d_mobile_v1.html` — referencia visual e
//   catalogo literal.
//
// Escala Likert canonica: identica ao Instrumento A (0..4, Nunca .. Sempre).
//
// **RV-13.** Consumidores diretos:
// - `LikertFormShell.tsx` via as 2 paginas de formulario (portal +
//   platform) da lideranca direta.
// - `tests/unit/instrument-catalogs.test.ts` — assertivas de
//   cardinalidade e unicidade.

import {
  type InstrumentCatalog,
  type InstrumentDimensao,
  type InstrumentLikertOption,
} from './instrumentACatalog';

const LEGENDAS_D: readonly InstrumentLikertOption[] = Object.freeze([
  Object.freeze({ valor: 0, label: 'Nunca' }),
  Object.freeze({ valor: 1, label: 'Quase nunca' }),
  Object.freeze({ valor: 2, label: 'Às vezes' }),
  Object.freeze({ valor: 3, label: 'Quase sempre' }),
  Object.freeze({ valor: 4, label: 'Sempre' }),
]);

const DIMENSOES_D: readonly InstrumentDimensao[] = Object.freeze([
  Object.freeze({
    nome: 'Direcionamento e clareza',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 1,
        itemIndex: 1,
        enunciado: 'Meu líder deixa claro o que espera de mim.',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 2,
        enunciado: 'Meu líder define prioridades de forma objetiva.',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 3,
        enunciado: 'Meu líder comunica mudanças de maneira clara.',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 4,
        enunciado: 'Meu líder ajuda a equipe a manter o foco no que é mais importante.',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 5,
        enunciado: 'Meu líder toma decisões quando necessário.',
      }),
    ]),
  }),
  Object.freeze({
    nome: 'Desenvolvimento e apoio',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 2,
        itemIndex: 1,
        enunciado: 'Meu líder oferece feedbacks que me ajudam a melhorar.',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 2,
        enunciado: 'Meu líder reconhece quando realizo um bom trabalho.',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 3,
        enunciado: 'Meu líder demonstra interesse pelo meu desenvolvimento profissional.',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 4,
        enunciado: 'Meu líder oferece apoio quando encontro dificuldades.',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 5,
        enunciado: 'Meu líder incentiva o aprendizado e a evolução da equipe.',
      }),
    ]),
  }),
  Object.freeze({
    nome: 'Relacionamento e confiança',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 3,
        itemIndex: 1,
        enunciado: 'Meu líder trata as pessoas com respeito.',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 2,
        enunciado: 'Meu líder escuta atentamente antes de tomar decisões.',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 3,
        enunciado: 'Meu líder está disponível quando preciso conversar.',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 4,
        enunciado: 'Meu líder age de forma justa com todos da equipe.',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 5,
        enunciado: 'Meu líder transmite confiança em suas atitudes.',
      }),
    ]),
  }),
  Object.freeze({
    nome: 'Gestão e resultados',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 4,
        itemIndex: 1,
        enunciado: 'Meu líder acompanha adequadamente o andamento das atividades.',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 2,
        enunciado: 'Meu líder resolve problemas sem criar conflitos desnecessários.',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 3,
        enunciado: 'Meu líder mantém a equipe organizada para alcançar os objetivos.',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 4,
        enunciado: 'Meu líder assume responsabilidade pelas decisões da equipe.',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 5,
        enunciado: 'Meu líder contribui para que a equipe alcance bons resultados.',
      }),
    ]),
  }),
]);

/** Catalogo canonico do Instrumento D. Consumido pelas 2 paginas. */
export const INSTRUMENT_D_CATALOG: InstrumentCatalog = Object.freeze({
  nome: 'Avaliação da liderança direta',
  dimensoes: DIMENSOES_D,
  legendas: LEGENDAS_D,
  numeroItens: 20,
});
