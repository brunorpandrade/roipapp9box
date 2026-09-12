// ROIP APP 9BOX — Catalogo canonico do Perfil Individual
// (ME-B10-04, S255, DOC 03 §10.2 + Perfil_Individual__instrumento_completo_.md §4).
//
// Fonte canonica dos 80 enunciados literais em 10 blocos de 8 itens
// para o `PerfilIndividualFormShell`. Espelha bit-a-bit a §4 do
// instrumento canonico (a unica fonte com os 80 enunciados
// completos; o mockup desktop `perfil_individual_formulario_v3.html`
// carrega apenas 8 itens amostrais e o mockup mobile
// `delta_perfil_individual_formulario_mobile_v1.html` carrega apenas
// o Bloco 1 completo).
//
// Estrutura canonica confirmada por auditoria integral:
// - **Total: 80 itens** (`NUM_ITENS_TOTAL` em
//   `individualProfileEngine.ts`). MASTER_ESCOPO_B10 §5.4 menciona
//   "94 itens" — soma bruta 73+7+14 do DOC 03 §10.2 que ignora a
//   dupla funcao dos cenarios. Precedencia RV-09 (MASTER §1.2 —
//   DOCs prevalecem): fonte canonica de verdade e 80.
// - **10 blocos UX de 8 itens cada** (`NUM_BLOCOS_TOTAL = 10`,
//   `NUM_ITENS_POR_BLOCO = 8`), preservando a ordem canonica dos
//   itens 1-80 do instrumento §4. Bloco UX 1 = itens 1..8; Bloco UX
//   2 = itens 9..16; ...; Bloco UX 10 = itens 73..80.
// - **Distribuicao por tipo (contagem empirica na §4 do instrumento):**
//   50 Likert (todos os itens de conteudo + confiabilidade que usam
//   escala 1..5), 12 EF (escolha forcada A/B), 18 Cenario
//   (situacional A/B/C/D).
// - **Distribuicao por dimensao (§3.2 do instrumento):** Postura 16,
//   Estrutura 15, Motor 15, Equilibrio 15, Assinatura 12,
//   Confiabilidade exclusiva 7 (total 80).
//
// Chave canonica do payload consumida pelos handlers backend: cada
// item mapeia para `ITEM_XXX` via `itemKey(numero)` do engine
// (`individualProfileEngine.ts` linha 939). Payload de resposta:
// - Likert: `Record<'ITEM_XXX', number>` com valor 1..5.
// - EF: `Record<'ITEM_XXX', string>` com valor 'A' ou 'B'.
// - Cenario: `Record<'ITEM_XXX', string>` com valor 'A', 'B', 'C' ou 'D'.
//
// **RV-13:** cada export tem chamador direto:
// - `PERFIL_INDIVIDUAL_CATALOG` + `LIKERT_LEGENDAS` + tipos
//   consumidos por `PerfilIndividualFormShell.tsx` +
//   `perfil-individual-catalog.test.ts`.
// - `itensDoBlocoUx` consumida pelo shell e pelo teste do catalogo.
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.

/** Dimensao canonica do instrumento (DOC 03 §10.2 + §2 do instrumento). */
export type PerfilIndividualDimensao =
  'postura' | 'estrutura' | 'motor' | 'equilibrio' | 'assinatura' | 'confiabilidade';

/** Tipo canonico de item (DOC 03 §10.2 — 3 formatos). */
export type PerfilIndividualTipo = 'likert' | 'ef' | 'cenario';

/** Item canonico do catalogo — uma entrada por item, ordem 1..80. */
export interface PerfilIndividualItem {
  /** Numero canonico 1..80 (exibido ao usuario e usado por `itemKey`). */
  readonly numero: number;
  /** Chave do payload backend: `ITEM_XXX` (padStart 3 digitos). */
  readonly id: string;
  /** Bloco UX 1..10 (cada bloco tem exatamente 8 itens). */
  readonly bloco: number;
  /** Dimensao canonica do instrumento. */
  readonly dimensao: PerfilIndividualDimensao;
  /** Tipo canonico do item. */
  readonly tipo: PerfilIndividualTipo;
  /** Enunciado literal do instrumento §4 (nao editar sem RV-09). */
  readonly enunciado: string;
  /**
   * Alternativas literais para `ef` (2 opcoes A/B) e `cenario`
   * (4 opcoes A/B/C/D). `undefined` para `likert`.
   */
  readonly opcoes?: readonly string[];
}

/** Legendas canonicas da escala Likert 1..5 (DOC 05 §7.5). */
export const LIKERT_LEGENDAS: readonly string[] = Object.freeze([
  'Nunca',
  'Quase nunca',
  'Às vezes',
  'Quase sempre',
  'Sempre',
]);

/** Letras canonicas de EF e Cenario (mesma ordem A..D). */
export const LETRAS_ALTERNATIVAS: readonly string[] = Object.freeze(['A', 'B', 'C', 'D']);

/** Total canonico de blocos UX (espelhado do engine backend). */
export const PERFIL_INDIVIDUAL_TOTAL_BLOCOS = 10;

/** Itens por bloco UX (espelhado do engine backend). */
export const PERFIL_INDIVIDUAL_ITENS_POR_BLOCO = 8;

/** Total canonico de itens (espelhado do engine backend). */
export const PERFIL_INDIVIDUAL_TOTAL_ITENS =
  PERFIL_INDIVIDUAL_TOTAL_BLOCOS * PERFIL_INDIVIDUAL_ITENS_POR_BLOCO;

function makeItemKey(numero: number): string {
  return `ITEM_${String(numero).padStart(3, '0')}`;
}

/** Retorna os itens do bloco UX (bloco 1 -> itens 1..8; bloco 10 -> itens 73..80). */
export function itensDoBlocoUx(bloco: number): readonly PerfilIndividualItem[] {
  const inicio = (bloco - 1) * PERFIL_INDIVIDUAL_ITENS_POR_BLOCO + 1;
  const fim = inicio + PERFIL_INDIVIDUAL_ITENS_POR_BLOCO - 1;
  return PERFIL_INDIVIDUAL_CATALOG.filter((it) => it.numero >= inicio && it.numero <= fim);
}

// ============================================================
// Catalogo canonico — 80 itens em ordem numerica 1..80
// Bloco UX = ceil(numero / 8). Enunciados bit-a-bit do
// `Perfil_Individual__instrumento_completo_.md` §4.
// ============================================================

export const PERFIL_INDIVIDUAL_CATALOG: readonly PerfilIndividualItem[] = Object.freeze([
  // -------- Bloco UX 1 (itens 1..8) — abre com 5 Likert de calibracao (§3.5)
  {
    numero: 1,
    id: makeItemKey(1),
    bloco: 1,
    dimensao: 'postura',
    tipo: 'likert',
    enunciado:
      'Quando identifico que uma decisão precisa ser tomada, tomo a iniciativa sem esperar' +
      ' que alguém me solicite.',
  },
  {
    numero: 2,
    id: makeItemKey(2),
    bloco: 1,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Quando uma abordagem diferente da que estou acostumado é proposta, considero' +
      ' genuinamente antes de avaliar se funciona ou não.',
  },
  {
    numero: 3,
    id: makeItemKey(3),
    bloco: 1,
    dimensao: 'motor',
    tipo: 'ef',
    enunciado:
      'Das duas situações abaixo, qual descreve melhor o que você prioriza profissionalmente?',
    opcoes: [
      'Ser reconhecido como referência de excelência no que faço, com espaço para me aprofundar' +
        ' cada vez mais na minha área.',
      'Ter responsabilidade ampla por resultados, coordenando diferentes áreas e pessoas em' +
        ' direção a objetivos maiores.',
    ],
  },
  {
    numero: 4,
    id: makeItemKey(4),
    bloco: 1,
    dimensao: 'equilibrio',
    tipo: 'cenario',
    enunciado:
      'Você está em uma reunião tensa em que sua posição é contestada de forma direta. O que' +
      ' você faz?',
    opcoes: [
      'Respondo com os argumentos que tenho e mantenho minha posição com firmeza.',
      'Percebo minha reação interna antes de responder e calibro o tom conforme o que a' +
        ' situação exige.',
      'Prefiro ouvir mais antes de me posicionar, especialmente quando a tensão está alta.',
      'Encerro minha participação naquele ponto e retomo em outro momento mais oportuno.',
    ],
  },
  {
    numero: 5,
    id: makeItemKey(5),
    bloco: 1,
    dimensao: 'assinatura',
    tipo: 'likert',
    enunciado:
      'Quando estou em uma atividade que exige que eu conecte ideias de áreas ou domínios' +
      ' diferentes, sinto que estou operando no meu melhor.',
  },
  {
    numero: 6,
    id: makeItemKey(6),
    bloco: 1,
    dimensao: 'postura',
    tipo: 'likert',
    enunciado:
      'Antes de tomar decisões importantes, espero ter informações suficientes para sentir' +
      ' segurança no que vou decidir.',
  },
  {
    numero: 7,
    id: makeItemKey(7),
    bloco: 1,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Quando assumo um compromisso, entrego no prazo mesmo que isso exija reorganizar outras' +
      ' prioridades.',
  },
  {
    numero: 8,
    id: makeItemKey(8),
    bloco: 1,
    dimensao: 'motor',
    tipo: 'ef',
    enunciado:
      'Das duas situações abaixo, qual descreve melhor o que sustenta seu engajamento no longo' +
      ' prazo?',
    opcoes: [
      'Saber que meu trabalho contribui diretamente para algo que considero importante — uma' +
        ' causa, uma missão ou um impacto real.',
      'Ter liberdade para definir como, quando e de que forma entrego meus resultados, sem' +
        ' depender de aprovação constante.',
    ],
  },
  // -------- Bloco UX 2 (itens 9..16)
  {
    numero: 9,
    id: makeItemKey(9),
    bloco: 2,
    dimensao: 'confiabilidade',
    tipo: 'likert',
    enunciado: 'Nunca deixo de cumprir um prazo, independentemente das circunstâncias.',
  },
  {
    numero: 10,
    id: makeItemKey(10),
    bloco: 2,
    dimensao: 'equilibrio',
    tipo: 'likert',
    enunciado:
      'Em conversas difíceis, percebo o estado emocional do outro antes mesmo de ele' +
      ' verbalizar o que está sentindo.',
  },
  {
    numero: 11,
    id: makeItemKey(11),
    bloco: 2,
    dimensao: 'postura',
    tipo: 'cenario',
    enunciado:
      'Seu time está com uma entrega crítica atrasada e há pressão externa crescente. O que' +
      ' você faz?',
    opcoes: [
      'Assumo o controle direto da situação, redefino prioridades e coordeno a entrega' +
        ' pessoalmente.',
      'Reúno o time, entendo os bloqueios e trabalho junto para resolver — mantendo o clima' +
        ' estável.',
      'Analiso o que causou o atraso antes de agir para garantir que a solução seja a certa.',
      'Comunico a situação aos envolvidos e negocio um novo prazo que seja factível.',
    ],
  },
  {
    numero: 12,
    id: makeItemKey(12),
    bloco: 2,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Quando recebo críticas sobre meu trabalho, fico ruminando sobre elas por um tempo' +
      ' considerável antes de seguir em frente.',
  },
  {
    numero: 13,
    id: makeItemKey(13),
    bloco: 2,
    dimensao: 'assinatura',
    tipo: 'ef',
    enunciado:
      'Das duas descrições abaixo, qual representa melhor como você gera valor de forma' +
      ' natural?',
    opcoes: [
      'Identifico o que está errado ou pode melhorar — questiono premissas, encontro' +
        ' inconsistências e elevo o padrão de qualquer análise em que estou envolvido.',
      'Crio conexões com as pessoas ao meu redor — construo relações de confiança, percebo o' +
        ' que o outro precisa e ajo para apoiar de forma genuína.',
    ],
  },
  {
    numero: 14,
    id: makeItemKey(14),
    bloco: 2,
    dimensao: 'motor',
    tipo: 'likert',
    enunciado:
      'Consigo manter meu nível de entrega mesmo quando o trabalho deixa de apresentar novos' +
      ' desafios ou aprendizados.',
  },
  {
    numero: 15,
    id: makeItemKey(15),
    bloco: 2,
    dimensao: 'equilibrio',
    tipo: 'cenario',
    enunciado:
      'Você discorda fortemente de uma decisão tomada por alguém com mais autoridade do que' +
      ' você. O que você faz?',
    opcoes: [
      'Expresso minha discordância diretamente, independentemente da hierarquia.',
      'Avalio o momento certo para trazer minha perspectiva e o faço de forma estruturada.',
      'Registro internamente minha discordância, mas executo a decisão sem questionar.',
      'Busco aliados que compartilhem minha visão antes de me posicionar.',
    ],
  },
  {
    numero: 16,
    id: makeItemKey(16),
    bloco: 2,
    dimensao: 'estrutura',
    tipo: 'cenario',
    enunciado:
      'Você tem uma tarde livre e pode escolher como passar seu tempo. O que você escolhe?',
    opcoes: [
      'Trabalhar em algo que exige concentração individual profunda — um problema, uma' +
        ' análise, um projeto.',
      'Conversar com pessoas, trocar ideias ou estar em um ambiente social estimulante.',
      'Fazer algo prático e organizado que gere sensação de produtividade e conclusão.',
      'Explorar algo novo — ler sobre um tema diferente, experimentar uma abordagem que nunca' +
        ' testei.',
    ],
  },
  // -------- Bloco UX 3 (itens 17..24)
  {
    numero: 17,
    id: makeItemKey(17),
    bloco: 3,
    dimensao: 'postura',
    tipo: 'likert',
    enunciado:
      'Em projetos coletivos, invisto tempo em entender como cada pessoa do time está se' +
      ' sentindo em relação ao trabalho.',
  },
  {
    numero: 18,
    id: makeItemKey(18),
    bloco: 3,
    dimensao: 'confiabilidade',
    tipo: 'likert',
    enunciado: 'Esta pergunta verifica sua atenção ao instrumento. Por favor, selecione a opção 2.',
  },
  {
    numero: 19,
    id: makeItemKey(19),
    bloco: 3,
    dimensao: 'motor',
    tipo: 'ef',
    enunciado:
      'Das duas situações abaixo, qual você jamais aceitaria como condição permanente de' +
      ' trabalho?',
    opcoes: [
      'Trabalhar em uma organização onde não acredito na missão ou nos valores — mesmo que a' +
        ' remuneração seja excelente.',
      'Trabalhar em uma função que não me desafia tecnicamente ou intelectualmente — mesmo em' +
        ' um ambiente agradável e bem remunerado.',
    ],
  },
  {
    numero: 20,
    id: makeItemKey(20),
    bloco: 3,
    dimensao: 'equilibrio',
    tipo: 'likert',
    enunciado:
      'Quando estou sob pressão intensa, mantenho a qualidade das minhas decisões sem deixar' +
      ' que o estado emocional distorça meu julgamento.',
  },
  {
    numero: 21,
    id: makeItemKey(21),
    bloco: 3,
    dimensao: 'assinatura',
    tipo: 'likert',
    enunciado:
      'Quando preciso convencer alguém de algo, construo argumentos que consideram tanto a' +
      ' lógica quanto o impacto humano da decisão.',
  },
  {
    numero: 22,
    id: makeItemKey(22),
    bloco: 3,
    dimensao: 'postura',
    tipo: 'cenario',
    enunciado:
      'Você precisa comunicar uma mudança significativa que vai impactar negativamente parte' +
      ' do time. Como você conduz isso?',
    opcoes: [
      'Comunico de forma direta e objetiva — explico a mudança, a razão e o que se espera de' +
        ' cada um.',
      'Preparo o terreno emocionalmente antes — converso individualmente com quem será mais' +
        ' impactado.',
      'Apresento os dados e a lógica que sustentam a decisão de forma estruturada antes de' +
        ' qualquer comunicação ampla.',
      'Envolvo o time na construção da implementação — mesmo que a decisão já esteja tomada.',
    ],
  },
  {
    numero: 23,
    id: makeItemKey(23),
    bloco: 3,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Quando percebo que alguém ao meu redor está com dificuldade, ofereço ajuda mesmo que' +
      ' isso não seja minha responsabilidade.',
  },
  {
    numero: 24,
    id: makeItemKey(24),
    bloco: 3,
    dimensao: 'motor',
    tipo: 'likert',
    enunciado:
      'Sinto energia quando o trabalho exige que eu crie algo novo — um processo, uma' +
      ' solução, uma abordagem que ainda não existe.',
  },
  // -------- Bloco UX 4 (itens 25..32)
  {
    numero: 25,
    id: makeItemKey(25),
    bloco: 4,
    dimensao: 'confiabilidade',
    tipo: 'likert',
    enunciado:
      'Prefiro definir minha própria forma de trabalhar do que seguir métodos e processos' +
      ' estabelecidos pela organização.',
  },
  {
    numero: 26,
    id: makeItemKey(26),
    bloco: 4,
    dimensao: 'equilibrio',
    tipo: 'cenario',
    enunciado:
      'Você percebe que o clima da reunião está deteriorando — as pessoas estão na defensiva' +
      ' e a conversa está improdutiva. O que você faz?',
    opcoes: [
      'Nomeio o que está acontecendo diretamente — "percebo que a conversa ficou tensa" — e' +
        ' proponho um recuo.',
      'Faço uma pergunta que muda o ângulo da discussão e tira o grupo do impasse sem' +
        ' confrontar diretamente.',
      'Aguardo que o momento passe e retomo quando o ambiente estiver mais receptivo.',
      'Encerro a reunião e proponho retomada em outro momento com uma agenda mais' +
        ' estruturada.',
    ],
  },
  {
    numero: 27,
    id: makeItemKey(27),
    bloco: 4,
    dimensao: 'postura',
    tipo: 'likert',
    enunciado:
      'Nas entregas que coordeno ou executo, meu foco principal é no resultado final — não' +
      ' no processo pelo qual chegamos a ele.',
  },
  {
    numero: 28,
    id: makeItemKey(28),
    bloco: 4,
    dimensao: 'assinatura',
    tipo: 'ef',
    enunciado:
      'Em qual das duas situações você sente que contribui de forma mais autêntica e' + ' natural?',
    opcoes: [
      'Em situações que exigem planejamento, organização e execução disciplinada de algo' +
        ' complexo.',
      'Em situações que exigem criatividade, geração de alternativas e abertura para o' +
        ' desconhecido.',
    ],
  },
  {
    numero: 29,
    id: makeItemKey(29),
    bloco: 4,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Começo tarefas novas sem necessariamente definir como vou organizá-las — prefiro ir' +
      ' ajustando ao longo do caminho.',
  },
  {
    numero: 30,
    id: makeItemKey(30),
    bloco: 4,
    dimensao: 'motor',
    tipo: 'ef',
    enunciado:
      'Das duas condições abaixo, qual é mais determinante para você permanecer em uma' +
      ' organização?',
    opcoes: [
      'Ter progressão de carreira clara, estabilidade e previsibilidade sobre o futuro' +
        ' profissional.',
      'Ter autonomia real para tomar decisões e definir minha própria forma de atuar — com' +
        ' mínima supervisão.',
    ],
  },
  {
    numero: 31,
    id: makeItemKey(31),
    bloco: 4,
    dimensao: 'equilibrio',
    tipo: 'likert',
    enunciado:
      'Em situações de alta pressão, reajo de forma que depois me arrependo — seja no tom,' +
      ' nas palavras ou nas decisões tomadas.',
  },
  {
    numero: 32,
    id: makeItemKey(32),
    bloco: 4,
    dimensao: 'postura',
    tipo: 'likert',
    enunciado:
      'Em interações de trabalho, invisto energia em criar conexão e rapport antes de entrar' +
      ' no conteúdo da agenda.',
  },
  // -------- Bloco UX 5 (itens 33..40)
  {
    numero: 33,
    id: makeItemKey(33),
    bloco: 5,
    dimensao: 'estrutura',
    tipo: 'cenario',
    enunciado:
      'Sua organização anuncia uma mudança significativa de estratégia que vai alterar o' +
      ' trabalho da sua área. Qual é sua reação mais honesta?',
    opcoes: [
      'Fico animado — mudança significa novas possibilidades e oportunidades de contribuir de' +
        ' forma diferente.',
      'Avalio com cuidado antes de reagir — quero entender o impacto real antes de me' +
        ' posicionar.',
      'Fico desconfortável até entender como isso vai afetar o que estou entregando hoje.',
      'Foco imediatamente em como implementar — prefiro agir do que especular.',
    ],
  },
  {
    numero: 34,
    id: makeItemKey(34),
    bloco: 5,
    dimensao: 'motor',
    tipo: 'ef',
    enunciado: 'Das duas situações abaixo, qual você abriria mão com mais facilidade?',
    opcoes: [
      'Reconhecimento público pelo que faço — visibilidade, prestígio e reputação.',
      'Remuneração acima da média do mercado para a minha função.',
    ],
  },
  {
    numero: 35,
    id: makeItemKey(35),
    bloco: 5,
    dimensao: 'assinatura',
    tipo: 'likert',
    enunciado:
      'Quando estou em um grupo sem coordenação clara, naturalmente começo a organizar as' +
      ' pessoas e o processo para que o trabalho avance.',
  },
  {
    numero: 36,
    id: makeItemKey(36),
    bloco: 5,
    dimensao: 'equilibrio',
    tipo: 'cenario',
    enunciado:
      'Um colega de alto desempenho começa a entregar abaixo do esperado sem nenhuma razão' +
      ' aparente. O que você pensa primeiro?',
    opcoes: [
      'Algo mudou na situação dele — pessoal ou profissional — que está afetando sua' +
        ' capacidade de entregar.',
      'Pode haver um problema de alinhamento de expectativas ou de clareza sobre o que se' +
        ' espera dele.',
      'É provável que esteja desmotivado ou desengajado com o trabalho ou com o ambiente.',
      'Preciso de mais dados antes de qualquer conclusão.',
    ],
  },
  {
    numero: 37,
    id: makeItemKey(37),
    bloco: 5,
    dimensao: 'postura',
    tipo: 'likert',
    enunciado:
      'Adapto meu estilo de comunicação conforme a pessoa com quem estou interagindo — sem' +
      ' perder minha posição ou intenção.',
  },
  {
    numero: 38,
    id: makeItemKey(38),
    bloco: 5,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Ambientes com muita interação social me energizam — saio de encontros e reuniões com' +
      ' mais disposição do que entrei.',
  },
  {
    numero: 39,
    id: makeItemKey(39),
    bloco: 5,
    dimensao: 'confiabilidade',
    tipo: 'likert',
    enunciado: 'Sempre concordo com as decisões tomadas pelas lideranças da minha organização.',
  },
  {
    numero: 40,
    id: makeItemKey(40),
    bloco: 5,
    dimensao: 'motor',
    tipo: 'likert',
    enunciado:
      'Sinto satisfação genuína quando domino algo com profundidade — quando sei que sei com' +
      ' precisão.',
  },
  // -------- Bloco UX 6 (itens 41..48)
  {
    numero: 41,
    id: makeItemKey(41),
    bloco: 6,
    dimensao: 'equilibrio',
    tipo: 'likert',
    enunciado:
      'Quando há conflito entre pessoas do meu entorno, consigo conduzir a conversa de forma' +
      ' que os dois lados se sintam ouvidos.',
  },
  {
    numero: 42,
    id: makeItemKey(42),
    bloco: 6,
    dimensao: 'postura',
    tipo: 'cenario',
    enunciado:
      'Você precisa tomar uma decisão importante com informações incompletas e tempo' +
      ' limitado. O que você faz?',
    opcoes: [
      'Decido com o que tenho — prefiro uma decisão imperfeita agora do que uma decisão' +
        ' perfeita tarde demais.',
      'Busco rapidamente as informações mais críticas antes de decidir — mesmo que seja pouco' +
        ' tempo.',
      'Consulto alguém de confiança para validar meu raciocínio antes de agir.',
      'Avalio o custo de esperar — se o prazo permitir, prefiro ter mais dados.',
    ],
  },
  {
    numero: 43,
    id: makeItemKey(43),
    bloco: 6,
    dimensao: 'assinatura',
    tipo: 'likert',
    enunciado:
      'Quando enfrento obstáculos em um projeto importante, minha disposição para continuar' +
      ' aumenta — não diminui.',
  },
  {
    numero: 44,
    id: makeItemKey(44),
    bloco: 6,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Em negociações ou decisões, priorizo o que é melhor para o resultado — mesmo que isso' +
      ' gere desconforto em algumas pessoas.',
  },
  {
    numero: 45,
    id: makeItemKey(45),
    bloco: 6,
    dimensao: 'motor',
    tipo: 'ef',
    enunciado:
      'Das duas situações abaixo, qual teria mais peso na sua decisão de deixar uma' +
      ' organização?',
    opcoes: [
      'Perceber que meu trabalho não gera impacto real — que o que faço não muda nada de' +
        ' forma significativa.',
      'Perceber que não tenho mais espaço para crescer ou evoluir nessa organização.',
    ],
  },
  {
    numero: 46,
    id: makeItemKey(46),
    bloco: 6,
    dimensao: 'equilibrio',
    tipo: 'cenario',
    enunciado:
      'Você está acumulando pressão há semanas — prazos, demandas, conflitos. Como você' +
      ' percebe isso em si mesmo?',
    opcoes: [
      'Noto sinais físicos ou emocionais claros — sono, irritabilidade, dificuldade de' +
        ' concentração.',
      'Percebo que minha qualidade de entrega começa a cair antes de perceber que estou' +
        ' sobrecarregado.',
      'As pessoas ao meu redor percebem antes de eu mesmo notar.',
      'Mantenho funcionamento normal por muito tempo — só percebo quando o limite já foi' +
        ' ultrapassado.',
    ],
  },
  {
    numero: 47,
    id: makeItemKey(47),
    bloco: 6,
    dimensao: 'postura',
    tipo: 'likert',
    enunciado:
      'Construo credibilidade no trabalho principalmente pela consistência das minhas' +
      ' entregas — não pela minha capacidade de me relacionar.',
  },
  {
    numero: 48,
    id: makeItemKey(48),
    bloco: 6,
    dimensao: 'estrutura',
    tipo: 'cenario',
    enunciado:
      'Você tem uma semana com agenda aberta — sem reuniões obrigatórias, sem prazos' +
      ' imediatos. O que acontece?',
    opcoes: [
      'Defino imediatamente o que vou entregar nessa semana e organizo meu tempo para isso.',
      'Aproveito para explorar temas que não tenho tempo de estudar normalmente.',
      'Começo várias coisas e termino algumas — funciono melhor com alguma pressão externa.',
      'Fico desconfortável — prefiro ter estrutura e demandas claras para me organizar.',
    ],
  },
  // -------- Bloco UX 7 (itens 49..56)
  {
    numero: 49,
    id: makeItemKey(49),
    bloco: 7,
    dimensao: 'assinatura',
    tipo: 'ef',
    enunciado:
      'Das duas descrições abaixo, qual representa melhor o que te move de forma mais' +
      ' profunda no trabalho?',
    opcoes: [
      'Contribuir para algo maior do que eu mesmo — um propósito coletivo, uma causa, um' +
        ' impacto que vai além da minha entrega individual.',
      'Buscar e alcançar a excelência — fazer algo com o mais alto padrão possível, pela' +
        ' satisfação do próprio feito.',
    ],
  },
  {
    numero: 50,
    id: makeItemKey(50),
    bloco: 7,
    dimensao: 'equilibrio',
    tipo: 'likert',
    enunciado:
      'Uso o que estou sentindo como dado para tomar melhores decisões — não ignoro nem sou' +
      ' dominado pela emoção.',
  },
  {
    numero: 51,
    id: makeItemKey(51),
    bloco: 7,
    dimensao: 'postura',
    tipo: 'cenario',
    enunciado:
      'Você e um colega têm visões opostas sobre como conduzir um projeto importante. O que' +
      ' você faz?',
    opcoes: [
      'Defendo minha posição com clareza e busco convencer — acredito que o debate direto' +
        ' leva à melhor decisão.',
      'Busco entender a perspectiva do colega antes de sustentar a minha — às vezes a visão' +
        ' dele muda o meu raciocínio.',
      'Proponho que definamos critérios objetivos para avaliar as duas abordagens antes de' +
        ' decidir.',
      'Prefiro ceder em parte para manter o relacionamento e a colaboração ao longo do' +
        ' projeto.',
    ],
  },
  {
    numero: 52,
    id: makeItemKey(52),
    bloco: 7,
    dimensao: 'motor',
    tipo: 'likert',
    enunciado:
      'Sinto que meu trabalho tem sentido quando percebo que ele muda algo — no negócio, nas' +
      ' pessoas ou no ambiente ao meu redor.',
  },
  {
    numero: 53,
    id: makeItemKey(53),
    bloco: 7,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Consigo manter clareza de raciocínio e equilíbrio mesmo em ambientes de alta pressão' +
      ' e instabilidade.',
  },
  {
    numero: 54,
    id: makeItemKey(54),
    bloco: 7,
    dimensao: 'assinatura',
    tipo: 'likert',
    enunciado:
      'Quando vejo algo que considero injusto — em uma decisão, um processo ou um tratamento' +
      ' — sinto necessidade genuína de agir sobre isso.',
  },
  {
    numero: 55,
    id: makeItemKey(55),
    bloco: 7,
    dimensao: 'postura',
    tipo: 'likert',
    enunciado:
      'Prefiro trabalhar de forma independente do que em colaboração constante com outras' +
      ' pessoas.',
  },
  {
    numero: 56,
    id: makeItemKey(56),
    bloco: 7,
    dimensao: 'equilibrio',
    tipo: 'cenario',
    enunciado:
      'Você precisa dar um feedback difícil para alguém que sabe que vai reagir mal. O que' +
      ' você faz?',
    opcoes: [
      'Dou o feedback diretamente — prefiro clareza a conforto, mesmo que gere reação' +
        ' negativa.',
      'Preparo a conversa com cuidado — escolho o momento, o tom e o contexto para maximizar' +
        ' a receptividade.',
      'Começo destacando o que a pessoa faz bem antes de abordar o ponto difícil.',
      'Evito a conversa até que haja um momento mais natural para ela acontecer.',
    ],
  },
  // -------- Bloco UX 8 (itens 57..64)
  {
    numero: 57,
    id: makeItemKey(57),
    bloco: 8,
    dimensao: 'confiabilidade',
    tipo: 'likert',
    enunciado:
      'Prefiro seguir os processos e métodos estabelecidos pela organização do que criar' +
      ' minha própria forma de trabalhar.',
  },
  {
    numero: 58,
    id: makeItemKey(58),
    bloco: 8,
    dimensao: 'motor',
    tipo: 'ef',
    enunciado:
      'Das duas situações abaixo, qual você preferiria como condição permanente de trabalho?',
    opcoes: [
      'Um ambiente altamente dinâmico, com mudanças frequentes, novos desafios e alta' +
        ' incerteza — mas com grande potencial de impacto.',
      'Um ambiente estável, com processos claros, expectativas definidas e previsibilidade' +
        ' sobre o futuro — mas com evolução gradual.',
    ],
  },
  {
    numero: 59,
    id: makeItemKey(59),
    bloco: 8,
    dimensao: 'assinatura',
    tipo: 'likert',
    enunciado:
      'Uso o humor de forma natural para aliviar tensão, aproximar pessoas e tornar' +
      ' ambientes difíceis mais funcionais.',
  },
  {
    numero: 60,
    id: makeItemKey(60),
    bloco: 8,
    dimensao: 'estrutura',
    tipo: 'cenario',
    enunciado:
      'Você está prestes a implementar uma solução que testou e validou. Um colega sugere' +
      ' uma abordagem completamente diferente, sem dados. O que você faz?',
    opcoes: [
      'Escuto a sugestão com interesse genuíno — pode haver algo que não considerei.',
      'Peço que ele apresente a lógica por trás da sugestão antes de avaliar.',
      'Mantenho minha abordagem — ela foi validada e mudar agora seria um risco' +
        ' desnecessário.',
      'Proponho testar as duas em paralelo se o tempo permitir.',
    ],
  },
  {
    numero: 61,
    id: makeItemKey(61),
    bloco: 8,
    dimensao: 'equilibrio',
    tipo: 'likert',
    enunciado:
      'Percebo quando o clima de um ambiente ou grupo muda — mesmo que ninguém tenha dito' +
      ' nada explicitamente.',
  },
  {
    numero: 62,
    id: makeItemKey(62),
    bloco: 8,
    dimensao: 'postura',
    tipo: 'cenario',
    enunciado:
      'Você precisa mobilizar pessoas que não se reportam a você para um projeto' +
      ' prioritário. Qual é sua abordagem?',
    opcoes: [
      'Apresento o objetivo com clareza e mostro por que é importante — confio que o' +
        ' argumento move as pessoas.',
      'Invisto em criar relacionamento e alinhamento antes de pedir comprometimento.',
      'Mostro o que cada pessoa ganha individualmente ao participar — conecto o projeto aos' +
        ' interesses de cada um.',
      'Busco o patrocínio de alguém com autoridade formal para dar peso à iniciativa.',
    ],
  },
  {
    numero: 63,
    id: makeItemKey(63),
    bloco: 8,
    dimensao: 'motor',
    tipo: 'likert',
    enunciado:
      'Consigo manter engajamento e desempenho mesmo quando não acredito plenamente nos' +
      ' objetivos ou valores da organização onde trabalho.',
  },
  {
    numero: 64,
    id: makeItemKey(64),
    bloco: 8,
    dimensao: 'assinatura',
    tipo: 'ef',
    enunciado:
      'Das duas descrições abaixo, qual representa melhor como você age naturalmente em' +
      ' situações difíceis?',
    opcoes: [
      'Enfrento o desconforto de frente — digo o que precisa ser dito, mesmo quando é' +
        ' impopular ou arriscado.',
      'Procuro a forma mais inteligente de navegar a situação — preservando relações e' +
        ' minimizando danos desnecessários.',
    ],
  },
  // -------- Bloco UX 9 (itens 65..72)
  {
    numero: 65,
    id: makeItemKey(65),
    bloco: 9,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Mantenho rotinas e sistemas pessoais de organização — listas, agendas, registros —' +
      ' que me ajudam a não perder o controle do que precisa ser feito.',
  },
  {
    numero: 66,
    id: makeItemKey(66),
    bloco: 9,
    dimensao: 'equilibrio',
    tipo: 'cenario',
    enunciado:
      'Você descobre que uma decisão que te afeta diretamente foi tomada sem sua' +
      ' participação e considera injusta. Como você reage?',
    opcoes: [
      'Expresso minha insatisfação diretamente para quem tomou a decisão — com clareza e sem' +
        ' rodeios.',
      'Processo internamente antes de agir — quero reagir de forma que gere resultado, não' +
        ' apenas que alivie minha frustração.',
      'Converso com pessoas de confiança antes de decidir como abordar o tema.',
      'Aceito e sigo em frente — entendo que nem toda decisão vai ter minha participação.',
    ],
  },
  {
    numero: 67,
    id: makeItemKey(67),
    bloco: 9,
    dimensao: 'postura',
    tipo: 'likert',
    enunciado:
      'Quando discordo de uma decisão já tomada, expresso minha posição mesmo que isso gere' +
      ' desconforto no grupo.',
  },
  {
    numero: 68,
    id: makeItemKey(68),
    bloco: 9,
    dimensao: 'motor',
    tipo: 'likert',
    enunciado:
      'O que mais me move no trabalho é a sensação de estar evoluindo — aprendendo,' +
      ' ampliando capacidade e me tornando melhor no que faço.',
  },
  {
    numero: 69,
    id: makeItemKey(69),
    bloco: 9,
    dimensao: 'assinatura',
    tipo: 'likert',
    enunciado:
      'As pessoas ao meu redor costumam me procurar quando precisam de alguém para' +
      ' organizar, estruturar ou colocar ordem em situações complexas.',
  },
  {
    numero: 70,
    id: makeItemKey(70),
    bloco: 9,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Prefiro profundidade a amplitude — prefiro conhecer poucos temas muito bem do que ter' +
      ' conhecimento amplo sobre muitos.',
  },
  {
    numero: 71,
    id: makeItemKey(71),
    bloco: 9,
    dimensao: 'equilibrio',
    tipo: 'likert',
    enunciado:
      'Consigo identificar com precisão o que estou sentindo — e nomear a emoção com' +
      ' clareza, não apenas dizer que estou "bem" ou "mal".',
  },
  {
    numero: 72,
    id: makeItemKey(72),
    bloco: 9,
    dimensao: 'postura',
    tipo: 'cenario',
    enunciado:
      'Seu projeto está atrasado e o cliente ou área solicitante está pressionando por' +
      ' resultado imediato. O que você faz?',
    opcoes: [
      'Foco exclusivamente na entrega — deixo outras demandas para depois e concentro' +
        ' energia no que precisa ser resolvido.',
      'Comunico de forma transparente onde estamos e o que é factível entregar — sem' +
        ' prometer o que não consigo cumprir.',
      'Envolvo o time para redistribuir carga e acelerar juntos — não centralizo sob' + ' pressão.',
      'Analiso o que causou o atraso primeiro para garantir que a solução não gere outro' +
        ' problema.',
    ],
  },
  // -------- Bloco UX 10 (itens 73..80) — bloco final; footer vira Enviar
  {
    numero: 73,
    id: makeItemKey(73),
    bloco: 10,
    dimensao: 'motor',
    tipo: 'ef',
    enunciado:
      'Das duas afirmações abaixo, qual descreve melhor o que você considera uma carreira' +
      ' bem-sucedida?',
    opcoes: [
      'Ter construído algo relevante — uma empresa, um produto, um legado ou uma' +
        ' transformação que não existia antes de mim.',
      'Ter chegado a uma posição de liderança ampla, com responsabilidade e influência sobre' +
        ' múltiplas áreas e pessoas.',
    ],
  },
  {
    numero: 74,
    id: makeItemKey(74),
    bloco: 10,
    dimensao: 'assinatura',
    tipo: 'likert',
    enunciado:
      'As pessoas ao meu redor costumam me procurar quando precisam de alguém que as ajude a' +
      ' pensar com mais clareza em situações de incerteza ou complexidade.',
  },
  {
    numero: 75,
    id: makeItemKey(75),
    bloco: 10,
    dimensao: 'confiabilidade',
    tipo: 'likert',
    enunciado:
      'Sempre me comunico de forma impecável e nunca deixo de passar uma mensagem importante' +
      ' para as pessoas certas.',
  },
  {
    numero: 76,
    id: makeItemKey(76),
    bloco: 10,
    dimensao: 'equilibrio',
    tipo: 'cenario',
    enunciado:
      'Você precisa decidir entre duas opções tecnicamente equivalentes. Sua análise' +
      ' racional não resolve o empate. O que você faz?',
    opcoes: [
      'Confio no que estou sentindo sobre cada opção — a intuição muitas vezes integra dados' +
        ' que a análise não captura.',
      'Busco mais informação — não tomo uma decisão de impacto sem ter critérios mais' +
        ' sólidos.',
      'Consulto alguém de confiança para ter uma perspectiva externa antes de decidir.',
      'Escolho a opção que mais protege as pessoas envolvidas — o critério humano desempata.',
    ],
  },
  {
    numero: 77,
    id: makeItemKey(77),
    bloco: 10,
    dimensao: 'postura',
    tipo: 'likert',
    enunciado:
      'Mantenho meu estilo de comunicação e postura independentemente de quem está na sala' +
      ' — sou o mesmo com o time e com a diretoria.',
  },
  {
    numero: 78,
    id: makeItemKey(78),
    bloco: 10,
    dimensao: 'estrutura',
    tipo: 'likert',
    enunciado:
      'Sinto prazer genuíno em explorar ideias complexas, debater conceitos e entender como' +
      ' as coisas funcionam em profundidade.',
  },
  {
    numero: 79,
    id: makeItemKey(79),
    bloco: 10,
    dimensao: 'motor',
    tipo: 'likert',
    enunciado:
      'Consigo manter meu nível de entrega mesmo quando meu trabalho não é reconhecido ou' +
      ' valorizado publicamente.',
  },
  {
    numero: 80,
    id: makeItemKey(80),
    bloco: 10,
    dimensao: 'confiabilidade',
    tipo: 'likert',
    enunciado:
      'Esta é a última verificação de atenção do instrumento. Por favor, selecione a opção 1.',
  },
]);
