import { defineConfig } from 'vitest/config';

// ROIP APP 9BOX — configuracao do vitest (ME-010).
//
// - `include`: apenas testes de integracao. A partir do Bloco B1 todo teste
//   sobe base efemera contra MySQL real (RV-11); nao ha testes puramente
//   unitarios que dispensem `beforeAll`/`afterAll` custosos.
// - `globalSetup`: DROP+CREATE da base `roip_test`, aplicacao da migration
//   canonica e semeadura da fixture minima antes de qualquer teste; DROP ao
//   final. Padrao S007 estendido ao passo 9 da regua §4.
// - `pool: 'forks'` + `fileParallelism: false` + `maxWorkers: 1`: uma unica
//   worker sequencial para isolar corridas concorrentes sobre a mesma base
//   MySQL. Determinismo sobre paralelismo — condiz com a natureza da base
//   compartilhada.
// - `testTimeout: 30000` / `hookTimeout: 60000`: primeira execucao inclui
//   aplicacao da migration (1147 linhas de DDL) e pode extrapolar defaults
//   em runners lentos.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/integration/setup.ts'],
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
