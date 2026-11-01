// ROIP APP 9BOX — helpers canonicos de pluralizacao para textos
// user-facing (ME-1.3d-REV DIS-C, D-CONCORDANCIA-SAIDAS).
//
// Padrao canonico: respostas em plural sempre, mas quando o numero
// EXIGE singular (n === 1), ajustar a concordancia da palavra para
// nao gerar frase gramaticalmente incorreta como "1 saidas".

/**
 * Concordancia canonica entre numero e substantivo em portugues BR.
 * Retorna a forma correta ("saida" para 1; "saidas" para demais).
 * Caso de uso: substantivos regulares que apenas acrescentam "s" no
 * plural.
 */
export function pluralPt(n: number, singular: string, plural: string): string {
  const abs = Math.abs(n);
  return abs === 1 ? singular : plural;
}

/** Especializacao canonica para "saida"/"saidas". */
export function pluralSaida(n: number): string {
  return pluralPt(n, 'saída', 'saídas');
}

/** Especializacao canonica para "respondente"/"respondentes". */
export function pluralRespondente(n: number): string {
  return pluralPt(n, 'respondente', 'respondentes');
}

/** Especializacao canonica para "colaborador"/"colaboradores". */
export function pluralColaborador(n: number): string {
  return pluralPt(n, 'colaborador', 'colaboradores');
}

/** Especializacao canonica para "departamento"/"departamentos". */
export function pluralDepartamento(n: number): string {
  return pluralPt(n, 'departamento', 'departamentos');
}

/** Especializacao canonica para "equipe"/"equipes". */
export function pluralEquipe(n: number): string {
  return pluralPt(n, 'equipe', 'equipes');
}
