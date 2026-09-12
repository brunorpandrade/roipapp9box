// ROIP APP 9BOX — catalogo canonico do Instrumento A (autoavaliacao).
// ME-B10-02 (S253).
//
// Origem canonica:
// - DOC 03 §6.2 — estrutura 4x5 (4 dimensoes x 5 itens = 20 itens).
// - DOC 05 §7.1 — enunciados literais renderizados no formulario.
// - Mockup `delta_instrumento_a_mobile_v1.html` — referencia visual
//   e catalogo literal dos enunciados (unica fonte materializada
//   pre-ME-B10-02; extracao para lib canonica evita divergencia entre
//   canais portal/platform e serve tambem ao formulario desktop
//   derivado da mesma familia — MASTER §5.2).
//
// Escala Likert canonica: 5 opcoes de valor inteiro 0..4 (grid canonico
// do Zod schema `TRIMESTRE_SCHEMA_INSTRUMENT_A` + `normalizeRespostas`
// do save-instrument-a). Legendas: Nunca / Quase nunca / As vezes /
// Quase sempre / Sempre.
//
// **RV-13.** Consumidores diretos:
// - `LikertFormShell.tsx` via as 4 paginas de formulario (portal +
//   platform) — reuso bit-a-bit com `INSTRUMENT_D_CATALOG`.
// - `tests/unit/instrument-catalogs.test.ts` — assertivas de
//   cardinalidade (4 dim x 5 itens = 20), unicidade (dimensao,
//   itemIndex) e forma da legenda.

/** Item unitario canonico do grid 4x5 (§6.2). */
export interface InstrumentLikertItem {
  readonly dimensao: number;
  readonly itemIndex: number;
  readonly enunciado: string;
}

/** Dimensao canonica: nome + 5 itens. */
export interface InstrumentDimensao {
  readonly nome: string;
  readonly itens: readonly InstrumentLikertItem[];
}

/** Opcao Likert canonica: valor 0..4 + legenda. */
export interface InstrumentLikertOption {
  readonly valor: number;
  readonly label: string;
}

/** Catalogo canonico completo. */
export interface InstrumentCatalog {
  readonly nome: string;
  readonly dimensoes: readonly InstrumentDimensao[];
  readonly legendas: readonly InstrumentLikertOption[];
  readonly numeroItens: number;
}

const LEGENDAS_A: readonly InstrumentLikertOption[] = Object.freeze([
  Object.freeze({ valor: 0, label: 'Nunca' }),
  Object.freeze({ valor: 1, label: 'Quase nunca' }),
  Object.freeze({ valor: 2, label: 'Às vezes' }),
  Object.freeze({ valor: 3, label: 'Quase sempre' }),
  Object.freeze({ valor: 4, label: 'Sempre' }),
]);

const DIMENSOES_A: readonly InstrumentDimensao[] = Object.freeze([
  Object.freeze({
    nome: 'Engajamento',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 1,
        itemIndex: 1,
        enunciado: 'Sinto energia e disposição para o trabalho',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 2,
        enunciado: 'Tenho entusiasmo com o que faço',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 3,
        enunciado: 'Sinto-me comprometido com os resultados da área',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 4,
        enunciado: 'Consigo manter o foco e a concentração nas minhas atividades',
      }),
      Object.freeze({
        dimensao: 1,
        itemIndex: 5,
        enunciado: 'Mesmo diante de dificuldades, mantenho minha dedicação ao trabalho',
      }),
    ]),
  }),
  Object.freeze({
    nome: 'Desenvolvimento',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 2,
        itemIndex: 1,
        enunciado: 'Tenho aprendido e evoluído na função',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 2,
        enunciado: 'Vejo oportunidades de crescimento aqui',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 3,
        enunciado: 'Recebo desafios que me desenvolvem',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 4,
        enunciado: 'Tenho clareza sobre o que preciso desenvolver para crescer na empresa',
      }),
      Object.freeze({
        dimensao: 2,
        itemIndex: 5,
        enunciado: 'Sinto que minhas habilidades estão sendo bem aproveitadas no trabalho',
      }),
    ]),
  }),
  Object.freeze({
    nome: 'Pertencimento',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 3,
        itemIndex: 1,
        enunciado: 'Sinto que faço parte do time e da empresa',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 2,
        enunciado: 'Sinto-me valorizado pelo que entrego',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 3,
        enunciado: 'Tenho boas relações com quem trabalho',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 4,
        enunciado: 'Sinto que posso ser eu mesmo no ambiente de trabalho',
      }),
      Object.freeze({
        dimensao: 3,
        itemIndex: 5,
        enunciado: 'Sinto que minha opinião é ouvida e considerada pela equipe',
      }),
    ]),
  }),
  Object.freeze({
    nome: 'Realização',
    itens: Object.freeze([
      Object.freeze({
        dimensao: 4,
        itemIndex: 1,
        enunciado: 'Meu trabalho tem sentido para mim',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 2,
        enunciado: 'Sinto satisfação com o que realizo',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 3,
        enunciado: 'Termino a maior parte das semanas com sensação de realização',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 4,
        enunciado: 'Sinto que meu trabalho contribui de forma relevante para a empresa',
      }),
      Object.freeze({
        dimensao: 4,
        itemIndex: 5,
        enunciado: 'Tenho orgulho do que produzo e entrego',
      }),
    ]),
  }),
]);

/** Catalogo canonico do Instrumento A. Consumido pelas 4 paginas. */
export const INSTRUMENT_A_CATALOG: InstrumentCatalog = Object.freeze({
  nome: 'Autoavaliação',
  dimensoes: DIMENSOES_A,
  legendas: LEGENDAS_A,
  numeroItens: 20,
});
