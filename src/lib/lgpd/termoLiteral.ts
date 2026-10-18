// ROIP APP 9BOX — modulo canonico do texto literal do termo LGPD por versao
// (ME-1.12.c Despacho A, item [1.12.c] do roadmap V4).
//
// Fonte unica da verdade do texto literal do termo de consentimento LGPD,
// indexado por versao canonica (`LGPD_TERM_VERSION` de `src/lib/env.ts`).
// Consumido L125 por:
//   - `src/components/portal-colaborador/GateLgpdClient.tsx` (caixa
//     inicial + modal rolavel do primeiro login — ME-1.12.c).
//   - `src/server/pdf-templates/lgpdPortabilityTemplate.ts` (secao
//     "Termo de aceite" no PDF — ME-1.12.c).
//   - `src/lib/lgpd/termoLiteral.test.ts` (teste canonico do getter).
//
// Antes desta ME, o texto literal estava duplicado inline em
// `GateLgpdClient.tsx` (constante `TERMO_LITERAL_V10`) e em
// `PrivacyModal.tsx` (constante local homonima). L125 integral:
// refactor dos callsites originais e extracao canonica aqui.
//
// Novas versoes do termo (futuras) devem adicionar uma entrada ao
// mapa `TERMO_LITERAL_POR_VERSAO` sem remover versoes antigas — a
// base LGPD retem registros historicos com `versaoTermoAceita`
// antigas, e o PDF do SA precisa renderizar o texto exatamente como
// o titular aceitou (rastreabilidade canonica §19.6).
//
// **RV-12.** Zero SQL. **RV-13.** Consumidores reais nomeados acima.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/**
 * Texto literal canonico do termo LGPD v1.0 (DOC 02 §7.3, canonizado
 * em ME-B10-01). Bit-exact ao texto exibido pelo gate pre-ME-1.12.c
 * e aceito por todos os titulares com `versaoTermoAceita='1.0'` em
 * producao desde a adocao canonica.
 */
export const TERMO_LITERAL_V10: string =
  'Ao prosseguir, você declara estar ciente de que seus dados pessoais ' +
  'serão tratados para as finalidades relacionadas ao uso desta ' +
  'plataforma, conforme a legislação aplicável. O tratamento ocorrerá ' +
  'com base nas hipóteses legais pertinentes previstas na LGPD. Você ' +
  'poderá exercer os direitos previstos na lei, incluindo acesso, ' +
  'correção e demais direitos aplicáveis, por meio dos canais ' +
  'disponibilizados pela empresa.';

/**
 * Resumo canonico curto do termo LGPD v1.0 (ME-1.12.c — caixa inicial
 * do primeiro login). Duas frases: finalidade + direitos. Antecede o
 * botao `[Ler termo integral]` que abre o modal rolavel com o texto
 * literal integral acima.
 */
export const TERMO_RESUMO_V10: string =
  'Seus dados pessoais serão tratados pela plataforma com base nas ' +
  'hipóteses legais da LGPD, exclusivamente para as finalidades do ' +
  'serviço contratado pela sua empresa. Você poderá exercer acesso, ' +
  'correção e demais direitos previstos em lei pelos canais da empresa.';

/**
 * Mapa canonico `versao -> texto literal`. Chaves sao os valores
 * canonicos de `lgpdConsents.versaoTermoAceita` (varchar 10). Novas
 * versoes adicionam entrada aqui sem remover as antigas.
 */
export const TERMO_LITERAL_POR_VERSAO: Readonly<Record<string, string>> = {
  '1.0': TERMO_LITERAL_V10,
};

/**
 * Mapa canonico `versao -> resumo curto`. Mesma logica do mapa de
 * texto literal. Resumos novos vinculados a versoes novas sao
 * adicionados aqui.
 */
export const TERMO_RESUMO_POR_VERSAO: Readonly<Record<string, string>> = {
  '1.0': TERMO_RESUMO_V10,
};

/**
 * Getter canonico do texto literal por versao. Retorna o texto quando
 * a versao e conhecida; retorna `null` quando a versao e desconhecida
 * (rastreabilidade: o PDF renderiza fallback "(versao historica —
 * texto nao disponivel)" sem quebrar o render).
 */
export function getTermoLiteral(versao: string): string | null {
  return TERMO_LITERAL_POR_VERSAO[versao] ?? null;
}

/**
 * Getter canonico do resumo curto por versao. Retorna o resumo quando
 * a versao e conhecida; retorna `null` quando desconhecida. O
 * `GateLgpdClient` cai em fallback canonico (versao atual) nesse
 * caso.
 */
export function getTermoResumo(versao: string): string | null {
  return TERMO_RESUMO_POR_VERSAO[versao] ?? null;
}
