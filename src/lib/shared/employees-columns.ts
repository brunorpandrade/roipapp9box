// ROIP APP 9BOX — modulo puro canonico dos 14 rotulos de cadastro em
// massa (§16.2 + §4.5, ME-fila5 D2).
//
// Racional canonico bit-a-bit: extraido de `src/server/routers/employees
// .ts:183` (fonte da verdade original ME-043b) para que Client Components
// possam consumir os rotulos sem arrastar `exceljs` / `node:stream` no
// bundle client-side. `routers/employees.ts` re-exporta desta fonte
// via `export { COLUNAS_CANONICAS_EMPLOYEES } from '../../lib/shared/
// employees-columns'` — nao ha duplicacao (RV-13).
//
// **RV-13.** Consumido por:
// - `src/server/routers/employees.ts` (re-export + parseEmployeesUpload
//   + buildEmployeesTemplateBuffer).
// - `src/components/import-mass/ImportarPlanilhaModal.tsx` (validacao
//   client-side de cabecalho via SheetJS).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/**
 * S190 — cabecalho canonico literal do arquivo de cadastro em massa
 * (14 colunas, linha 1 do arquivo). Ordem canonica fixa; qualquer
 * divergencia sobe BAD_REQUEST global com `MSG_UPLOAD_CABECALHOS_
 * INVALIDOS` no backend, e mensagem inline no frontend.
 * Rotulos derivados de §16.2 (formulario canonico) e §4.5 (schema).
 */
export const COLUNAS_CANONICAS_EMPLOYEES = [
  'Nome completo',
  'CPF',
  'E-mail',
  'Data de nascimento',
  'Data de admissao',
  'CBO',
  'Descricao do CBO',
  'Departamento',
  'Senioridade',
  'Nivel hierarquico',
  'Familia de funcao',
  'Ativar como Lider',
  'Ativar como RH',
  'Nome do lider direto',
] as const;
