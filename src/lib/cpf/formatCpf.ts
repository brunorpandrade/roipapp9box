// ROIP APP 9BOX — helper canonico `formatCpf` (ME-B11.1c, PDL2).
//
// Fonte unica canonica da formatacao de CPF para exibicao em toda a
// plataforma, inclusive PDFs. Substitui as 3 implementacoes locais
// duplicadas pre-existentes (todas rigorosamente equivalentes):
//   - `src/app/meus-dados/internals.ts` (`formatCpf`) → delega aqui.
//   - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//     `internals.ts` (`formatCpfMasked`) → delega aqui.
//
// Convencao canonica L125 (RV-14): componente reutilizado e extraido
// na mesma ME, com refactor dos callsites originais.
//
// Especificacao canonica DOC 05 §14.5: CPF armazenado no banco sem
// pontuacao (11 digitos). Exibicao canonica com mascara
// `XXX.XXX.XXX-XX`.
//
// Entrada defensiva (L117): remove separadores (`.`, `-`, espacos)
// antes de validar os 11 digitos. Entrada que nao normaliza para 11
// digitos e retornada bit-exact (defensivo — dados antigos ou
// placeholders podem chegar fora do padrao).
//
// RV-13: consumidores canonicos nesta mesma ME:
//   - `src/server/pdf-templates/lgpdPortabilityTemplate.ts` (PDF LGPD).
//   - `src/app/meus-dados/internals.ts` (delegacao).
//   - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//     `internals.ts` (delegacao).

/**
 * Formata um CPF (11 digitos) com a mascara canonica
 * `XXX.XXX.XXX-XX`. Entrada com separadores (`.`/`-`/espaco) e
 * normalizada antes da verificacao. Entrada que nao normaliza para 11
 * digitos e retornada bit-exact.
 *
 * @example
 *   formatCpf('10000005169') === '100.000.051-69'
 *   formatCpf('100.000.051-69') === '100.000.051-69'
 *   formatCpf('123') === '123'
 */
export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 9);
  const p4 = digits.slice(9, 11);
  return `${p1}.${p2}.${p3}-${p4}`;
}
