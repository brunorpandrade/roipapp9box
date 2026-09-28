// ROIP APP 9BOX — tipos e constantes dos Dialogos de desenvolvimento
// (ME Etapa 1 — Bloco 2).
//
// Modulo puro de tipos e constantes. Segregado de `dialogosActions.ts`
// porque arquivos com `'use server'` no Next 15 App Router SO permitem
// exportar funcoes async (regra canonica RSC — export const/interface
// sao recusados no `next build`). Consumido bit-a-bit pelo drawer
// `DialogosDrawer.tsx` e pelas server actions `dialogosActions.ts`.
//
// **RV-13.** Todo export consumido (drawer + actions).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/** Mensagem canonica exposta em falha estrutural da action. */
export const MSG_ACTION_FALHA_GENERICA_DIALOGOS =
  'Nao foi possivel completar a operacao. Tente novamente.';

/** Formato serializavel de um dialogo atravessando fronteira server->client. */
export interface DialogoRow {
  readonly id: number;
  readonly companyId: number;
  readonly liderId: number;
  readonly employeeId: number;
  readonly titulo: string | null;
  readonly corpo: string | null;
  readonly status: 'verde' | 'vermelho';
  readonly pendencia: boolean;
  readonly arquivado: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Retorno padrao de listagem. */
export interface DialogosListResult {
  readonly ok: boolean;
  readonly dialogs: readonly DialogoRow[];
  readonly error?: string;
}

/** Retorno padrao de operacao single-row (create/update). */
export interface DialogosSingleResult {
  readonly ok: boolean;
  readonly dialog: DialogoRow | null;
  readonly error?: string;
}

/** Retorno padrao de operacao side-effect (archive/discard). */
export interface DialogosAffectedResult {
  readonly ok: boolean;
  readonly affected: number;
  readonly error?: string;
}
