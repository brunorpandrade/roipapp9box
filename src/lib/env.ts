// ROIP APP 9BOX — variaveis de ambiente canonicas (ME-023).
//
// Fonte unica de leitura de env vars da camada de autorizacao. Cada leitura
// e centralizada aqui para que o codigo de dominio nao acesse
// `process.env` diretamente e para que a substituicao em teste (e no
// deploy) seja pontual.
//
// LGPD_TERM_VERSION — versao vigente do termo de consentimento (DOC 02
// §7.3 canonico + DOC 01 §14.1 VARCHAR(10)). String livre curta, gravada
// literalmente em `lgpdConsents.versaoTermoAceita`. Sem UI para alterar em
// runtime — bump por Bruno via redeploy da env var. Escopo canonico
// GLOBAL da plataforma (§7.3 fixando S442 Opcao A — sem versao por
// empresa). Fallback `'1.0'`: valor canonico inicial preservado quando a
// env var nao esta setada (uso local/CI); producao seta explicitamente.

const RAW_LGPD_VERSION = process.env.LGPD_TERM_VERSION ?? '1.0';

/**
 * Versao vigente do termo LGPD. Consumida pelo Route Handler
 * `POST /api/portal/consent-lgpd` (grava em `lgpdConsents`) e pelo gate
 * do `POST /api/portal/login` (compara com `versaoTermoAceita` do registro
 * mais recente do titular). VARCHAR(10) no schema; validamos o
 * comprimento aqui para falhar cedo se a env var for editada
 * incorretamente.
 */
export const LGPD_TERM_VERSION: string = (() => {
  if (RAW_LGPD_VERSION.length === 0 || RAW_LGPD_VERSION.length > 10) {
    throw new Error(
      `LGPD_TERM_VERSION invalida: comprimento ${RAW_LGPD_VERSION.length} (esperado 1..10). ` +
        'Ver DOC 01 §14.1 e DOC 02 §7.3.',
    );
  }
  return RAW_LGPD_VERSION;
})();
