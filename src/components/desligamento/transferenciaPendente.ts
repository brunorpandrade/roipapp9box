// ROIP APP 9BOX — transferencia de liderados pendente entre a edicao do
// colaborador e a rota do formulario de desligamento (ME-fila6 D2).
//
// Especificacao "Turnover e desligamento" §2: a inativacao so se completa
// apos o envio do formulario. Para lider com liderados ativos, o
// mapeamento de redistribuicao (§13.8 do DOC 05) e montado no modal da
// edicao e executado junto com o formulario, na mesma transacao
// (`leadershipTransfer.execute`). O mapeamento viaja em `sessionStorage`
// (aba atual, descartado ao fechar) — nunca e persistido no banco antes do
// envio.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { MotivoTermination } from '../../db/schema/enums';

/** Mapeamento ja traduzido para o contrato de `leadershipTransfer.execute`. */
export interface TransferenciaPendente {
  readonly employeeId: number;
  readonly motivoSaida: MotivoTermination;
  readonly mapeamento: readonly {
    readonly lideradoId: number;
    readonly novoLiderId: number;
    readonly novoLiderTipo: 'employee' | 'cLevel';
  }[];
  readonly candidatosGrupo4: readonly { readonly candidatoId: number }[];
  readonly reason: string;
}

function chave(employeeId: number): string {
  return `roip:desligamento:transferencia:${employeeId}`;
}

/** Guarda o mapeamento antes de navegar para o formulario. */
export function salvarTransferenciaPendente(t: TransferenciaPendente): void {
  window.sessionStorage.setItem(chave(t.employeeId), JSON.stringify(t));
}

/** Le o mapeamento do colaborador; `null` se ausente, invalido ou de outro motivo. */
export function lerTransferenciaPendente(
  employeeId: number,
  motivoSaida: MotivoTermination,
): TransferenciaPendente | null {
  const raw = window.sessionStorage.getItem(chave(employeeId));
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as TransferenciaPendente;
    const valido =
      parsed.employeeId === employeeId &&
      parsed.motivoSaida === motivoSaida &&
      Array.isArray(parsed.mapeamento) &&
      parsed.mapeamento.length > 0 &&
      Array.isArray(parsed.candidatosGrupo4) &&
      typeof parsed.reason === 'string';
    return valido ? parsed : null;
  } catch {
    return null;
  }
}

/** Remove o mapeamento apos o envio bem-sucedido. */
export function limparTransferenciaPendente(employeeId: number): void {
  window.sessionStorage.removeItem(chave(employeeId));
}
