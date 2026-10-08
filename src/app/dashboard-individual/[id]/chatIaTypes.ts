// ROIP APP 9BOX — tipos e constantes do Chat IA (ME Etapa 1 — Bloco 1).
//
// Modulo puro de tipos e constantes. Segregado de `chatIaActions.ts`
// porque arquivos com `'use server'` no Next 15 App Router SO permitem
// exportar funcoes async (regra canonica RSC — export const/interface
// sao recusados no `next build`). Consumido bit-a-bit pelo drawer
// `AiChatDrawer.tsx` e pelas server actions `chatIaActions.ts`.
//
// **RV-13.** Todo export consumido (drawer + actions).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/** Mensagem canonica exposta ao usuario em falha estrutural da action. */
export const MSG_ACTION_FALHA_GENERICA = 'Não foi possível completar a operação. Tente novamente.';

/**
 * Mensagem individual do historico canonico do drawer. Serializavel
 * atraves da fronteira server->client (Date -> string ISO).
 */
export interface ChatIaMessage {
  readonly id: number;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly createdAt: string;
}

/** Retorno de `chatIaGetHistoryAction`. */
export interface ChatIaGetHistoryResult {
  readonly ok: boolean;
  readonly messages: readonly ChatIaMessage[];
  readonly error?: string;
}

/** Retorno de `chatIaSendMessageAction`. */
export interface ChatIaSendMessageResult {
  readonly ok: boolean;
  readonly userMessage: ChatIaMessage | null;
  readonly assistantMessage: ChatIaMessage | null;
  readonly error?: string;
}

/** Retorno de `chatIaGetArchivedHistoryAction`. */
export interface ChatIaGetArchivedHistoryResult {
  readonly ok: boolean;
  readonly messages: readonly ChatIaMessage[];
  readonly page: number;
  readonly pageSize: number;
  readonly error?: string;
}
