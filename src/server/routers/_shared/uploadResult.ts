// ROIP APP 9BOX — contrato canonico compartilhado dos uploads (S193).
//
// Extrai UploadResult e LinhaErro (S186 — canonizado na ME-048 dentro de
// spreadsheets.ts) para modulo unico. Motivo canonico: 2a ocorrencia do
// contrato (upload de dados mensais §3.11 + upload de cadastro §16.6)
// exige fonte de verdade unica. A regra S049 (helper local por
// sub-router) NAO se aplica a CONTRATOS de retorno — contratos sao
// unicos por natureza; helpers de leitura podem duplicar.
//
// Chamadores canonicos:
//   - src/server/routers/spreadsheets.ts (reexporta os tipos).
//   - src/server/routers/employees.ts    (importa direto no proc
//     `employees.uploadCSV`).
//
// Semantica canonica (S186):
//   - `ok` verdadeiro apenas quando `linhasErro === 0` E
//     `linhasSucesso > 0`. Upload que processa zero linhas com zero
//     erros retorna `ok=false` — nao ha sucesso a reportar.
//   - `linhasProcessadas` = `linhasSucesso + linhasErro`.
//   - Upload NAO aborta na primeira falha (semantica de correcao em
//     lote §16.6 e §3.11). Erros acumulados linha a linha.

/**
 * Erro em uma linha do upload (S186 — canonizado ME-048; canonizado
 * como fonte compartilhada em ME-043b S193).
 *
 * `linha` — indice 1-based da linha na planilha original (linha 1 e o
 * cabecalho; dados iniciam em 2).
 * `coluna` — rotulo canonico da coluna em falha, ou '-' quando o erro
 * e global da linha (ex.: chamada a proc canonica falhou por regra de
 * negocio que atravessa mais de um campo).
 * `mensagem` — texto canonico literal exposto ao usuario final via
 * modal de resumo §16.6 (ou §3.11 no caso de spreadsheets).
 */
export interface LinhaErro {
  linha: number;
  coluna: string;
  mensagem: string;
}

/**
 * Retorno consolidado canonico dos uploads (S186 — canonizado ME-048;
 * canonizado como fonte compartilhada em ME-043b S193).
 *
 * Modal de resumo §16.6 exibe `linhasSucesso` como "linhas processadas
 * com sucesso" e `erros[]` como "linhas ignoradas com motivo de cada
 * uma". A UI e livre para agrupar por `coluna` ou por `mensagem`.
 */
export interface UploadResult {
  ok: boolean;
  linhasProcessadas: number;
  linhasSucesso: number;
  linhasErro: number;
  erros: LinhaErro[];
}
