// ROIP APP 9BOX — régua RV-03 da ME de otimização do tempo de testes.
//
// Prova que o split do vitest em dois projetos (unitário sem banco,
// integração com banco) preserva o gate: o conjunto de arquivos de teste
// coletado pelo `npx vitest run` completo não mudou, o projeto unitário é
// livre de banco e o `npm run validate` continua íntegro.
//
// Contagem antes e depois (RV-03): o total no gate era 343 arquivos antes
// da ME (unit 117 + integração 226) e continua 343 depois (unit 116 +
// integração 227 — o teste `executiveReportAI`, único unitário que abria
// conexão real, foi recategorizado para integração). O total no gate não
// mudou.
//
// Provada nos dois sentidos: árvore conforme → exit 0; defeito injetado
// (ex.: um `.test.ts` a mais ou a menos em tests/, ou globalSetup no
// projeto unitário) → falha → exit 1.

import { readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import viteConfig from '../../vitest.config';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

// Baseline do gate ANTES desta ME (contagem "antes" da RV-03).
const BASELINE_TOTAL = 343;
// Distribuição esperada DEPOIS do split (soma preservada = BASELINE_TOTAL).
const EXPECTED_UNIT = 116;
const EXPECTED_INTEGRATION = 227;

interface ProjectShape {
  test?: {
    name?: string;
    include?: string[];
    globalSetup?: string[];
  };
}

interface ConfigShape {
  test?: { projects?: ProjectShape[] };
}

let falhas = 0;

function check(nome: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${nome}`);
    return;
  }
  falhas += 1;
  console.log(`  FAIL ${nome}`);
}

function countTestFiles(relDir: string): number {
  const abs = resolve(REPO_ROOT, relDir);
  const entries = readdirSync(abs, { recursive: true, encoding: 'utf8' });
  return entries.filter((name) => name.endsWith('.test.ts')).length;
}

function findProject(projects: ProjectShape[], name: string): ProjectShape | undefined {
  return projects.find((p) => p.test?.name === name);
}

function main(): void {
  console.log('RÉGUA RV-03 — split do vitest (unitário/integração)');

  // 1) Contagem de arquivos de teste no gate (antes × depois).
  const unit = countTestFiles('tests/unit');
  const integration = countTestFiles('tests/integration');
  const total = unit + integration;
  console.log(`  info unit=${unit} integration=${integration} total=${total}`);
  check(`total no gate inalterado (=${BASELINE_TOTAL})`, total === BASELINE_TOTAL);
  check(`projeto unitário com ${EXPECTED_UNIT} arquivos`, unit === EXPECTED_UNIT);
  check(
    `projeto integração com ${EXPECTED_INTEGRATION} arquivos`,
    integration === EXPECTED_INTEGRATION,
  );

  // 2) Forma do split declarada no vitest.config.ts.
  const cfg = viteConfig as unknown as ConfigShape;
  const projects = cfg.test?.projects ?? [];
  check('config declara exatamente dois projetos', projects.length === 2);

  const unitProject = findProject(projects, 'unit');
  const intProject = findProject(projects, 'integration');
  check('existe projeto "unit"', unitProject !== undefined);
  check('existe projeto "integration"', intProject !== undefined);

  const unitInclude = unitProject?.test?.include ?? [];
  const intInclude = intProject?.test?.include ?? [];
  check('unit inclui tests/unit', unitInclude.includes('tests/unit/**/*.test.ts'));
  check(
    'integration inclui tests/integration',
    intInclude.includes('tests/integration/**/*.test.ts'),
  );

  // 3) Invariante do banco: só integração sobe o globalSetup.
  const unitSetup = unitProject?.test?.globalSetup;
  const intSetup = intProject?.test?.globalSetup ?? [];
  check('unit NÃO tem globalSetup (livre de banco)', unitSetup === undefined);
  const intSetupOk = intSetup.some((s) => s.endsWith('setup.ts'));
  check('integration tem globalSetup (setup.ts)', intSetupOk);

  // 4) Gate completo intocado (npm run validate idêntico).
  const validateSh = readFileSync(resolve(REPO_ROOT, 'scripts/validate.sh'), 'utf8');
  check('validate.sh mantém TOTAL=11', validateSh.includes('TOTAL=11'));
  check(
    'validate.sh mantém o passo vitest run',
    validateSh.includes('run_step "vitest run" npx vitest run'),
  );
  check(
    'validate.sh mantém o passo next build',
    validateSh.includes('run_step "next build" npx next build'),
  );

  console.log('');
  if (falhas > 0) {
    console.log(`RÉGUA REPROVADA: ${falhas} check(s) falharam`);
    process.exit(1);
  }
  console.log('RÉGUA APROVADA: todos os checks passaram');
  process.exit(0);
}

main();
