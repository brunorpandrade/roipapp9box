// ROIP APP 9BOX — internals do /meus-dados (ME-082).
//
// Origem canonica: DOC 05 §14.5 (H1a/H1b) + DOC 02 §4.6.
//
// Helpers puros sem I/O consumidos por MeusDadosClient.tsx e por
// tests/unit/meusDados.h1a.test.tsx + tests/unit/meusDados.h1b.test.tsx.
//
// **CC071.** Este arquivo NAO tem imports value-level de modulos
// server-only. Apenas tipos e funcoes puras.
// **RV-13.** Todos os exports consumidos por MeusDadosClient.tsx e
// pelos testes.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/**
 * Payload canonico H1a — Meus dados do Super Admin (DOC 05 §14.5).
 * Retornado por `myData.getForCurrentUser` quando sessao e super_admin.
 *
 * Campos canonicos:
 *   - `displayName`: nome atual (editavel inline via [Editar]).
 *   - `email`: e-mail atual (info line, botao [Alterar e-mail]).
 *   - `contaCriadaEm`: data ISO do createdAt do superAdmins (read-only,
 *     renderizada como "DD/MM/YYYY").
 */
export interface MeusDadosH1aPayload {
  readonly kind: 'h1a';
  readonly displayName: string;
  readonly email: string;
  readonly contaCriadaEm: string;
}

/**
 * Papel canonico exibido no badge pill azul-claro da H1b (DOC 05 §14.5
 * Secao 1). Um dos 4 valores literais canonicos.
 */
export type H1bBadgePapel = 'RH' | 'RH e Líder' | 'Líder' | 'C-level';

/**
 * Vinculo profissional canonico para RH e Lider (herdados de
 * `employees` — DOC 01 §4.5). Todos os campos read-only na H1b Secao 2.
 */
export interface H1bVinculoEmployee {
  readonly tipo: 'employee';
  readonly papelPlataforma: string;
  readonly cargo: string;
  readonly cbo: string;
  readonly descricaoCBO: string;
  readonly familiaFuncao: string;
  readonly senioridade: string;
  readonly nivelHierarquico: string;
  readonly departamento: string;
  readonly liderDireto: string | null;
}

/**
 * Vinculo profissional canonico para C-level (herdado de
 * `cLevelMembers` — DOC 01 §4.4). Escopo derivado de `acessoTotal`:
 * true -> "Empresa inteira"; false -> "Propria cadeia descendente".
 */
export interface H1bVinculoCLevel {
  readonly tipo: 'clevel';
  readonly papelPlataforma: 'C-level';
  readonly cargo: string;
  readonly descricaoCargo: string;
  readonly departamento: string;
  readonly escopoVisualizacao: 'Empresa inteira' | 'Própria cadeia descendente';
}

export type H1bVinculo = H1bVinculoEmployee | H1bVinculoCLevel;

/**
 * Payload canonico H1b — Meus dados demais perfis (DOC 05 §14.5).
 * Retornado por `myData.getForCurrentUser` quando sessao e platform.
 */
export interface MeusDadosH1bPayload {
  readonly kind: 'h1b';
  readonly displayName: string;
  readonly badgePapel: H1bBadgePapel;
  readonly cpfCompleto: string;
  readonly dataNascimento: string;
  readonly dataAdmissao: string;
  readonly statusAtivo: boolean;
  readonly vinculo: H1bVinculo;
  readonly email: string | null;
  readonly microcopyAlterarEmail: string;
}

/**
 * Payload canonico unificado retornado por `myData.getForCurrentUser`.
 * Discriminated union por `kind`.
 */
export type MeusDadosPayload = MeusDadosH1aPayload | MeusDadosH1bPayload;

// -----------------------------------------------------------------------
// Microcopy canonico §14.5 Secao 3
// -----------------------------------------------------------------------

/**
 * Microcopy canonico literal para RH e RH-Lider (DOC 05 §14.5 Secao 3).
 */
export const MICROCOPY_ALTERAR_EMAIL_RH: string = 'Para alterar seu e-mail, contate o Super Admin.';

/**
 * Microcopy canonico literal para C-level e Lider (DOC 05 §14.5 Secao 3).
 */
export const MICROCOPY_ALTERAR_EMAIL_CLEVEL_LIDER: string =
  'Para alterar seu e-mail, contate o RH da sua empresa.';

/**
 * Resolve o microcopy canonico correto conforme o papel platform.
 *
 * Regra canonica §14.5 Secao 3:
 *   - RH, RH-Lider -> "contate o Super Admin"
 *   - C-level, Lider -> "contate o RH da sua empresa"
 */
export function resolveMicrocopyAlterarEmail(role: 'rh' | 'rh_lider' | 'clevel' | 'lider'): string {
  if (role === 'rh' || role === 'rh_lider') {
    return MICROCOPY_ALTERAR_EMAIL_RH;
  }
  return MICROCOPY_ALTERAR_EMAIL_CLEVEL_LIDER;
}

/**
 * Resolve o badge canonico do papel a ser exibido em H1b Secao 1.
 *
 * Mapa canonico §14.5:
 *   - rh -> "RH"
 *   - rh_lider -> "RH e Lider"
 *   - clevel -> "C-level"
 *   - lider -> "Lider"
 */
export function resolveBadgePapel(role: 'rh' | 'rh_lider' | 'clevel' | 'lider'): H1bBadgePapel {
  switch (role) {
    case 'rh':
      return 'RH';
    case 'rh_lider':
      return 'RH e Líder';
    case 'clevel':
      return 'C-level';
    case 'lider':
      return 'Líder';
  }
}

// -----------------------------------------------------------------------
// Mascara canonica de CPF (DOC 05 §14.5 fluxo revelar CPF)
// -----------------------------------------------------------------------

/**
 * Mascara canonica: expoe apenas os 3 primeiros digitos + 2 finais,
 * formato "123.***.***-00". CPF armazenado sem pontuacao (11 digitos
 * — DOC 01 §4.5).
 */
export function maskCpf(cpf: string): string {
  if (cpf.length !== 11) {
    return cpf;
  }
  const prefixo = cpf.slice(0, 3);
  const sufixo = cpf.slice(9, 11);
  return `${prefixo}.***.***-${sufixo}`;
}

/**
 * Formata CPF completo com pontuacao canonica "XXX.XXX.XXX-XX" (DOC
 * 05 §14.5). CPF armazenado sem pontuacao (11 digitos).
 */
export function formatCpf(cpf: string): string {
  if (cpf.length !== 11) {
    return cpf;
  }
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`;
}

// -----------------------------------------------------------------------
// Calculos derivados canonicos (DOC 05 §14.5)
// -----------------------------------------------------------------------

/**
 * Calcula idade em anos completos a partir da data de nascimento
 * (ISO "YYYY-MM-DD"). Retorna 0 se data invalida. Executado no
 * frontend em runtime (DOC 05 §14.5).
 *
 * Comparacao canonica: idade completada quando aniversario do ano ja
 * passou; caso contrario, ano - 1.
 */
export function calcularIdade(dataNascimentoIso: string, referencia: Date): number {
  const nasc = parseIsoDate(dataNascimentoIso);
  if (nasc === null) return 0;
  let anos = referencia.getUTCFullYear() - nasc.getUTCFullYear();
  const mesRef = referencia.getUTCMonth();
  const diaRef = referencia.getUTCDate();
  const mesNasc = nasc.getUTCMonth();
  const diaNasc = nasc.getUTCDate();
  if (mesRef < mesNasc || (mesRef === mesNasc && diaRef < diaNasc)) {
    anos -= 1;
  }
  return anos < 0 ? 0 : anos;
}

/**
 * Formata idade canonica em subtexto: "(X anos)".
 */
export function formatarIdade(anos: number): string {
  return `(${anos} anos)`;
}

/**
 * Calcula tempo de empresa em anos e meses a partir da data de
 * admissao (ISO "YYYY-MM-DD"). Retorna { anos: 0, meses: 0 } se data
 * invalida.
 */
export function calcularTempoEmpresa(
  dataAdmissaoIso: string,
  referencia: Date,
): { readonly anos: number; readonly meses: number } {
  const adm = parseIsoDate(dataAdmissaoIso);
  if (adm === null) return { anos: 0, meses: 0 };
  let anos = referencia.getUTCFullYear() - adm.getUTCFullYear();
  let meses = referencia.getUTCMonth() - adm.getUTCMonth();
  if (referencia.getUTCDate() < adm.getUTCDate()) {
    meses -= 1;
  }
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }
  if (anos < 0) {
    return { anos: 0, meses: 0 };
  }
  return { anos, meses };
}

/**
 * Formata tempo de empresa canonico em subtexto: "(X anos e Y meses)"
 * ou "(X meses)" quando anos === 0. Singular/plural preservado.
 */
export function formatarTempoEmpresa(anos: number, meses: number): string {
  if (anos === 0) {
    const lbl = meses === 1 ? 'mês' : 'meses';
    return `(${meses} ${lbl})`;
  }
  const anosLbl = anos === 1 ? 'ano' : 'anos';
  const mesesLbl = meses === 1 ? 'mês' : 'meses';
  return `(${anos} ${anosLbl} e ${meses} ${mesesLbl})`;
}

/**
 * Formata data ISO "YYYY-MM-DD" no formato canonico brasileiro
 * "DD/MM/YYYY". Retorna string vazia se invalida.
 */
export function formatarDataBR(dataIso: string): string {
  const d = parseIsoDate(dataIso);
  if (d === null) return '';
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Parseia data ISO "YYYY-MM-DD" para Date UTC. Retorna null quando
 * formato invalido. Auxiliar interno.
 */
function parseIsoDate(iso: string): Date | null {
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (y === undefined || m === undefined || d === undefined) return null;
  const ano = Number.parseInt(y, 10);
  const mes = Number.parseInt(m, 10);
  const dia = Number.parseInt(d, 10);
  if (!Number.isFinite(ano) || !Number.isFinite(mes) || !Number.isFinite(dia)) return null;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

// -----------------------------------------------------------------------
// Validacao canonica de nome (DOC 05 §14.5 H1a fluxo edicao)
// -----------------------------------------------------------------------

/**
 * Comprimento maximo canonico do nome (DOC 05 §14.5 H1a fluxo edicao,
 * item 3: "trim().length > 0 && length <= 100").
 */
export const NOME_MAX_LENGTH = 100;

/**
 * Mensagem canonica literal de erro inline para nome vazio (DOC 05
 * §14.5 Estados de UI).
 */
export const MSG_NOME_OBRIGATORIO: string = 'O nome é obrigatório.';

/**
 * Mensagem canonica literal de toast de sucesso apos atualizar nome
 * (DOC 05 §14.5 H1a fluxo edicao, item 4).
 */
export const MSG_NOME_ATUALIZADO: string = 'Nome atualizado.';

/**
 * Mensagem canonica literal do toast ambar de colaborador puro em
 * /meus-dados (DOC 05 §14.5 + DOC 02 §4.6).
 */
export const MSG_ROTA_INVALIDA_PORTAL: string = 'Rota inválida. Redirecionando para o portal.';

/**
 * Valida o nome digitado no modo edicao inline da H1a. Retorna a
 * mensagem canonica de erro ou null quando valido.
 */
export function validateNome(nome: string): string | null {
  const trimmed = nome.trim();
  if (trimmed.length === 0) {
    return MSG_NOME_OBRIGATORIO;
  }
  if (trimmed.length > NOME_MAX_LENGTH) {
    return `O nome deve ter no máximo ${NOME_MAX_LENGTH} caracteres.`;
  }
  return null;
}
