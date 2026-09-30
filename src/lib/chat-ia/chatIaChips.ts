// ROIP APP 9BOX — chips canonicos do Assistente de lideranca por
// superficie (ME-UX-CONSOLIDACAO D1 + D3).
//
// Fonte unica de verdade das 3 perguntas pre-formuladas de cada
// dashboard. Consolidado em `src/lib/chat-ia/` para permitir consumo
// pelos dois drawers canonicos (dashboard-individual e
// dashboard-recorte/equipe) sem duplicacao. Reexportado em
// `AiChatDrawer.tsx` para preservar callsites e testes que ja
// importam `AI_CHAT_CHIPS_INDIVIDUAL` daquele modulo.
//
// **RV-13.** Ambos consumidos em `AiChatDrawer.tsx` (individual) e
// `AiChatDrawerEquipe.tsx` (equipe).
// **RV-14.** Um statement por linha, largura maxima 100 cols.

/**
 * Perguntas canonicas do Assistente de lideranca no dashboard
 * individual (D1 individual — decisao Bruno). Renderizadas como
 * botoes clicaveis acima da entrada quando NAO ha mensagem alguma na
 * conversa ativa.
 */
export const AI_CHAT_CHIPS_INDIVIDUAL = [
  'Monte um roteiro para minha próxima conversa de feedback com esse colaborador.',
  'Se eu tivesse 15 minutos com este colaborador sobre o que deveria falar?',
  'Qual a relação entre o perfil individual e o desempenho desse colaborador nesse trimestre?',
] as const;

/**
 * Perguntas canonicas do Assistente de lideranca no
 * dashboard-recorte/equipe (D1 recorte — decisao Bruno). Renderizadas
 * como botoes clicaveis acima da entrada quando NAO ha mensagem
 * alguma na conversa ativa.
 */
export const AI_CHAT_CHIPS_EQUIPE = [
  'Qual é o diagnóstico geral da minha equipe neste trimestre?',
  'Quais colaboradores da equipe precisam de conversa individual urgente?',
  'Monte um roteiro para minha próxima conversa com a equipe.',
] as const;
