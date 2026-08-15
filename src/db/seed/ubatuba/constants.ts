// ROIP APP 9BOX — constantes canonicas da fixture Bebidas Ubatuba Ltda.
// (ME-080b Dispatch 5, companies.id=2).
//
// Estrategia canonica: clone estrutural da Nativa Alimentos (mesmos 66
// employees + 3 C-levels, mesma estrutura organizacional, mesmos cargos e
// datas), com dados de identificacao proprios (CNPJ, razao social, endereco,
// telefone, contatos, encarregado LGPD, CPFs, emails). Nomes de pessoas sao
// preservados — homonimos entre empresas sao plausiveis no mundo real e nao
// geram bug de dominio.
//
// Racional S502: em vez de duplicar ~500 linhas de constants estruturais,
// aqui centralizamos APENAS o que difere; a derivacao funcional em
// `deriveUbatubaEmployees.ts` e `deriveUbatubaCLevels.ts` consome as constants
// da Nativa e aplica transformacoes puras (shift ID, substituicao de dominio
// email, CPF derivado deterministicamente).
//
// RV-13: consumido por:
//   - `src/db/seed/ubatuba/loadUbatubaFixtures.ts`
//   - `src/db/seed/ubatuba/deriveUbatubaEmployees.ts`
//   - `src/db/seed/ubatuba/deriveUbatubaCLevels.ts`
//   - Quatro derivadores in-code (climate, dataAccess, notifications, alerts)
//   - `tests/unit/ubatuba/*.test.ts`
//
// RV-15: todos os numeros medidos e mantidos bit-exact. Alteracao aqui
// requer atualizacao correspondente dos testes de invariante.

// ---------------------------------------------------------------------
// Identificacao canonica da empresa
// ---------------------------------------------------------------------

/** ID canonico da Bebidas Ubatuba (companies.id=2, segunda empresa da base). */
export const UBATUBA_COMPANY_ID = 2 as const;

/** Super admin referenciado por FKs de auditoria (mesmo da Nativa: id=1). */
export const UBATUBA_SUPER_ADMIN_ID = 1 as const;

/**
 * Versao canonica do termo LGPD aceita pelos titulares Ubatuba.
 * Schema `lgpdConsents.versaoTermoAceita` e varchar(10) — o valor DEVE caber
 * em 10 caracteres. Nativa canonicamente usa 'nativa-v1'; Ubatuba usa
 * 'ubatuba-v1' (10 chars exatos). Ambas as strings sao versoes distintas
 * do mesmo termo material (mesmo conteudo LGPD), diferenciadas apenas por
 * origem para rastreabilidade cross-empresa.
 */
export const UBATUBA_LGPD_TERM_VERSION = 'ubatuba-v1' as const;

/**
 * Configuracao canonica da empresa Bebidas Ubatuba Ltda. (companies.id=2).
 * Clone estrutural da Nativa Alimentos para todos os campos de negocio
 * (metas de ROI, thresholds, folha, sazonalidade) — a empresa e uma
 * industria+comercio de bebidas em Ubatuba/SP, mesmo porte e ciclo fiscal.
 *
 * Campos alterados vs Nativa: id, razaoSocial, nomeFantasia, cnpj, telefone,
 * endereco, cidade, contatos, encarregadoLgpd*, descricaoAtividade,
 * contextoMercado. Timestamps ajustados para +30 dias em relacao a Nativa
 * (empresa entrou na plataforma um mes depois — narrativa plausivel).
 */
export const UBATUBA_COMPANY_ROW = {
  id: UBATUBA_COMPANY_ID,
  razaoSocial: 'Bebidas Ubatuba Ltda.',
  nomeFantasia: 'Bebidas Ubatuba',
  cnpj: '50700200000231',
  telefone: '(12) 3832-4100',
  endereco: 'Rodovia Doutor Manoel Hipólito do Rego, km 62 — Praia da Enseada',
  cidade: 'Ubatuba',
  estado: 'SP' as const,
  logoUrl: null,
  contatoPrincipalNome: 'Eduardo Almeida da Silva',
  contatoPrincipalEmail: 'eduardo.almeida@bebidasubatuba.com.br',
  contatoRHNome: 'Renata Lima',
  contatoRHEmail: 'renata.lima@bebidasubatuba.com.br',
  segmento: 'Indústria+Comércio' as const,
  tipoAtividade: 'Indústria de bebidas',
  descricaoAtividade:
    'Fabricação e comercialização de bebidas não alcoólicas artesanais. Portfólio ' +
    'inclui linhas de sucos naturais prensados a frio, águas saborizadas, kombuchas e ' +
    'refrigerantes de baixo teor calórico, comercializados via varejo regional e ' +
    'distribuição direta para bares, hotéis e resorts do litoral norte paulista.',
  contextoMercado:
    'PME de bebidas fundada em 2016 no litoral norte paulista. Objetivo canônico: ' +
    'profissionalizar a gestão de pessoas para sustentar crescimento acelerado e ' +
    'reduzir turnover em Produção. Sazonalidade típica do setor de bebidas com pico ' +
    'de alta temporada (dezembro a fevereiro +25%, feriados longos +18%, inverno -15%) ' +
    'preservada nos dados de faturamento derivados da fixture Nativa.',
  metaROIOperacional: '3.00',
  metaROITatico: '6.00',
  metaROIEstrategico: '9.00',
  roiSegmentoMinimo: '3.50',
  roiSegmentoMaximo: '6.00',
  folhaPercMinima: '16.0',
  folhaPercMaxima: '25.0',
  thresholdDesempenhoBaixo: 60,
  thresholdDesempenhoMedio: 85,
  thresholdPlenitudeBaixo: 50,
  thresholdPlenitudeMedio: 75,
  modoAnoFiscal: 'padrao' as const,
  mesInicioAnoFiscal: 1,
  mesKickoff: 1,
  kickoffDate: '2026-01-01',
  timezone: 'America/Sao_Paulo',
  encarregadoLgpdNome: 'Fernanda Almeida Torres',
  encarregadoLgpdEmail: 'dpo@bebidasubatuba.com.br',
  encarregadoLgpdTelefone: '(12) 3832-4100',
  encarregadoLgpdPoliticaUrl: null,
  status: 'ativa' as const,
  isDemo: true,
  createdAt: new Date('2025-12-15T10:00:00Z'),
} as const;

// ---------------------------------------------------------------------
// Sementes PRNG canonicas (independencia por domínio — T3, D5.5)
// ---------------------------------------------------------------------
//
// Base canonica: 20260815 (data-referencia YYYYMMDD do inicio do seed
// Ubatuba). Cada consumidor recebe seed distinta para que mudar o formato
// de um gerador nao desloque as sequencias dos outros em regressoes.

/** Semente base — nao consumida diretamente, apenas documenta origem. */
export const UBATUBA_RESEED_BASE_SEED = 20260815 as const;

/** Semente do gerador de matriculas (Dispatch 1 -> matriculaGenerator). */
export const UBATUBA_MATRICULA_SEED = UBATUBA_RESEED_BASE_SEED + 1;

/** Semente do gerador de senhas iniciais (Dispatch 1 -> passwordGenerator). */
export const UBATUBA_PASSWORD_SEED = UBATUBA_RESEED_BASE_SEED + 2;

/** Semente do gerador de CPFs (Dispatch 5 -> cpfGenerator). */
export const UBATUBA_CPF_SEED = UBATUBA_RESEED_BASE_SEED + 3;

/** Semente do derivador de climateEngagementData (Dispatch 5). */
export const UBATUBA_CLIMATE_SEED = UBATUBA_RESEED_BASE_SEED + 4;

/** Semente do derivador de dataAccessLog (Dispatch 5). */
export const UBATUBA_DAL_SEED = UBATUBA_RESEED_BASE_SEED + 5;

/** Semente do derivador de notifications (Dispatch 5). */
export const UBATUBA_NOTIF_SEED = UBATUBA_RESEED_BASE_SEED + 6;

/** Semente do derivador de alerts (Dispatch 5). */
export const UBATUBA_ALERTS_SEED = UBATUBA_RESEED_BASE_SEED + 7;

// ---------------------------------------------------------------------
// Deslocamentos canonicos de ID (T1 aprovado — IDs explicitos bit-exact)
// ---------------------------------------------------------------------
//
// A fixture Nativa Alimentos usa IDs 1..3 em cLevelMembers e 4..69 em
// employees (69 IDs contiguos herdados do gerador Python original). Ubatuba
// desloca cada tabela pelo count da Nativa:
//   - cLevelMembers Ubatuba: IDs 4, 5, 6 (shift +3 sobre 1,2,3).
//   - employees Ubatuba: IDs 70..135 (shift +66 sobre 4..69).
// Nos JSONs pinados de resposta (SHA-256), userType='clevel' referencia
// userId 1..3; userType='employee' referencia userId 4..69. Os mappers
// aplicam o shift constante por tipo — os JSONs NAO sao editados nem
// duplicados (T2 aprovado).

/** Numero de C-levels na Nativa Alimentos (fonte do shift para cLevelMembers). */
export const NATIVA_CLEVEL_COUNT = 3 as const;

/** Numero de employees na Nativa Alimentos (fonte do shift para employees). */
export const NATIVA_EMPLOYEE_COUNT = 66 as const;

/** Shift aplicado a userId com userType='clevel' na Ubatuba. */
export const UBATUBA_CLEVEL_ID_SHIFT = NATIVA_CLEVEL_COUNT;

/** Shift aplicado a userId com userType='employee' e a employeeId na Ubatuba. */
export const UBATUBA_EMPLOYEE_ID_SHIFT = NATIVA_EMPLOYEE_COUNT;

// ---------------------------------------------------------------------
// Dominios canonicos (T3 aprovado — clone estrutural com identidade propria)
// ---------------------------------------------------------------------

/** Dominio canonico dos emails de employees/C-levels Ubatuba. */
export const UBATUBA_EMAIL_DOMAIN = 'bebidasubatuba.com.br' as const;

/**
 * Data canonica de referencia para timestamps derivados. Bit-exact reproduzivel
 * (nao usa `new Date()` em runtime). Consumida pelos derivadores para popular
 * `createdAt` explicitamente e evitar drift entre reseeds.
 */
export const UBATUBA_REFERENCE_DATE = new Date('2027-12-31T18:00:00Z');
