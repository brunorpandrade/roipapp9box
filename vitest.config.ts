import { defineConfig } from 'vitest/config';

// ROIP APP 9BOX — configuracao do vitest.
//
// Historico: ME-010 (criacao); ME-020 (unitarios de src/server/auth);
// ME-055b (`oxc.jsx = { runtime: 'automatic' }`); ME-B9-fechamento
// (timeouts 2x); ME de otimizacao do tempo de testes (split em dois
// projetos vitest — unitario sem banco, integracao com banco).
//
// - `oxc.jsx = { runtime: 'automatic' }` (raiz, herdado por ambos os
//   projetos via `extends: true`): Vitest 4 usa Vite 7+ com transformador
//   OXC. O `tsconfig.json` do repo preserva JSX para o Next em build
//   (`"jsx": "preserve"`), o que impede o OXC de transformar `.tsx`
//   durante os testes. Este override forca o transform JSX so no contexto
//   do vitest, sem afetar o build do Next. Necessario para os testes que
//   importam componentes `.tsx` diretamente para provar RV-13.
//
// - Split em dois projetos (`test.projects`):
//   * `unit` — `tests/unit/**/*.test.ts`. SEM `globalSetup`: nenhum
//     teste unitario toca o banco (os que importam `src/db/*` usam
//     enums/constantes/derivadores em tempo de compilacao ou um `db`
//     mockado). Sem banco, o projeto roda com o pool paralelo padrao do
//     vitest — e o atalho `validate:fast` (`vitest run --project unit`)
//     nunca sobe o MySQL efemero. O teste `executiveReportAI` — unico
//     unitario que abria conexao real — foi recategorizado para
//     `tests/integration` nesta ME.
//   * `integration` — `tests/integration/**/*.test.ts`. Mantem o
//     `globalSetup` (S007 estendido: DROP+CREATE de `roip_test`, migration
//     canonica, fixture de superAdmin) e o pool sequencial por worker
//     unica (`pool: 'forks'` + `fileParallelism: false` + `maxWorkers: 1`)
//     que isola corridas concorrentes sobre a base MySQL compartilhada.
//     Determinismo sobre paralelismo — condiz com a base compartilhada.
//     `testTimeout`/`hookTimeout` ampliados absorvem a aplicacao da
//     migration (1147 linhas de DDL) em runners lentos (RV-11).
//
// `npx vitest run` sem filtro roda os DOIS projetos — o conjunto coletado
// e identico ao anterior (343 arquivos). O passo 9 do `npm run validate`
// (`npx vitest run`) permanece inalterado em texto e em cobertura.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['./tests/integration/setup.ts'],
          pool: 'forks',
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 60000,
          hookTimeout: 120000,
        },
      },
    ],
  },
});
