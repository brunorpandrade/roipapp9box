import { defineConfig } from 'vitest/config';

// ROIP APP 9BOX — configuracao do vitest (ME-010; estendido na ME-020;
// `oxc.jsx = { runtime: 'automatic' }` adicionado na ME-055b).
//
// - `oxc.jsx = { runtime: 'automatic' }`: adicionado na ME-055b Bloco B.
//   Vitest 4 usa Vite 7+ com transformador OXC. O `tsconfig.json` do
//   repo preserva JSX para o Next em build (`"jsx": "preserve"`), o que
//   impede o OXC de transformar `.tsx` durante os testes. Este override
//   forca o transform JSX so no contexto do vitest, sem afetar o build
//   do Next. Necessario para o `shell.test.ts` que importa componentes
//   `.tsx` diretamente para provar RV-13 (nenhum export orfao).
// - `include`: testes de integracao (Bloco B1 — RV-11, contra MySQL real)
//   e testes unitarios (a partir da ME-020 — modulos puramente
//   algoritmicos de `src/server/auth/` que nao tocam banco). O veredito
//   unit vs integration e pre-decidido na abertura de cada ME (RV-08).
// - `globalSetup`: DROP+CREATE da base `roip_test`, aplicacao da migration
//   canonica e semeadura da fixture minima antes de qualquer teste; DROP ao
//   final. Padrao S007 estendido ao passo 9 da regua §4. Roda uma unica vez
//   para a suite inteira — os testes unitarios convivem com ele sem custo
//   adicional relevante.
// - `pool: 'forks'` + `fileParallelism: false` + `maxWorkers: 1`: uma unica
//   worker sequencial para isolar corridas concorrentes sobre a mesma base
//   MySQL. Determinismo sobre paralelismo — condiz com a natureza da base
//   compartilhada.
// - `testTimeout: 30000` / `hookTimeout: 60000`: primeira execucao inclui
//   aplicacao da migration (1147 linhas de DDL) e pode extrapolar defaults
//   em runners lentos.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    include: ['tests/integration/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    globalSetup: ['./tests/integration/setup.ts'],
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
