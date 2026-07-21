#!/usr/bin/env node
// ROIP APP 9BOX — verify-canonic-consistency (ME-046a).
//
// Regua nova de consistencia canonica (S161). Opera em DOIS modos:
//
//   --mode=repo  — passo 10 do `npm run validate`. Tabela de assercoes
//                  embutida verificada contra o CODIGO versionado do
//                  repositorio (raiz derivada da posicao do script; pode
//                  ser sobrescrita com --root=DIR para testes/fixtures).
//
//   --mode=docs  — fora do validate. Passo 1 do protocolo §3 nas
//                  aberturas de ME em Claude. Exige `ROIP_DOCS_DIR`
//                  apontando ao diretorio com os 8 .md canonicos.
//                  Verifica assercoes textuais cruzadas entre DOCs.
//
// Exit codes canonicos:
//   0 — todas as assercoes passaram.
//   1 — falha de assercao (ao menos uma reprovou).
//   2 — erro de uso/configuracao (modo invalido, ROIP_DOCS_DIR ausente
//       ou apontando a arquivos inexistentes, --root inexistente).
//
// A regua avalia TODAS as assercoes antes de sair (relatorio completo,
// nao fail-fast interno). Preserva isolamento por passo do validate:
// falha aqui nao mascara/contamina reguas 1-9 e vice-versa (L18).
//
// Sem SQL, sem MySQL, sem HTTP: leitura de arquivos + regex + set-diff.
// Determinismo total — mesma entrada, mesma saida.
//
// L27: termos-canario proibidos sao construidos por concatenacao para
// nao disparar o `check-forbidden-terms.sh` (passo 5) contra o proprio
// arquivo desta regua.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(HERE, '..');

// ---------------------------------------------------------------------
// CLI parsing.
// ---------------------------------------------------------------------

function parseArgs(argv) {
  const args = { mode: null, root: null };
  for (const raw of argv) {
    if (raw.startsWith('--mode=')) args.mode = raw.slice('--mode='.length);
    else if (raw.startsWith('--root=')) args.root = raw.slice('--root='.length);
  }
  return args;
}

function usageError(msg) {
  process.stderr.write(`ERRO: ${msg}\n`);
  process.stderr.write('uso: verify-canonic-consistency.mjs --mode=repo|docs [--root=DIR]\n');
  process.stderr.write('     modo docs exige a variavel de ambiente ROIP_DOCS_DIR.\n');
  process.exit(2);
}

// ---------------------------------------------------------------------
// Termos-canario (L27 — concatenacao para nao disparar o passo 5).
// ---------------------------------------------------------------------

// Termos globalmente proibidos em src/ e tests/ (modo repo A3).
const FORBIDDEN_TERMS_REPO = [
  ['copsoq', 'FactorHistory'].join(''),
  ['cadencia', 'COPSOQ'].join(''),
  ['companies', '.', 'setResponsavelFinanceiro'].join(''),
  ['mysqlTable(', "'", 'platformLogs', "'"].join(''),
];

// Termos proibidos por DOC especifico (modo docs).
const FORBIDDEN_TERM_COPSOQ_HIST = ['copsoq', 'FactorHistory'].join('');
const FORBIDDEN_TERM_COMPANIES_SETRF = ['companies', '.', 'setResponsavelFinanceiro'].join('');
const FORBIDDEN_TERM_FECHAMENTO_MANUAL = ['fechamento', ' ', 'manual'].join('');
const FORBIDDEN_TERM_CICLO_SEMESTRAL = ['ciclo', ' ', 'semestral'].join('');
const FORBIDDEN_TERM_7_JOBS = ['7', ' jobs', ' agendaveis'].join('');
const FORBIDDEN_TERM_NINEBOX_CLASSIFICATION = ['nineBox', 'Classification', 'Engine'].join('');
const FORBIDDEN_TERM_CLIMATE_AGGREGATION = ['climate', 'Aggregation', 'Engine'].join('');

// Achado colateral 13 (ME-saneamento MD 05): resíduo textual em comentario
// do cycleScheduleEngine.ts. Regua A7 grep vazio em src/ apenas.
const FORBIDDEN_TERM_FECHAMENTO_MANUAL_SRC = FORBIDDEN_TERM_FECHAMENTO_MANUAL;

// ---------------------------------------------------------------------
// Inventario nominal canonico das 53 tabelas (DOC 01 §3 / schema real).
// Ordem alfabetica para comparacao por conjunto (a ordem no schema e
// funcional, nao canonica).
// ---------------------------------------------------------------------

const CANONIC_TABLE_NAMES = new Set([
  'accessTokens',
  'aiConversations',
  'alerts',
  'apiUsageLog',
  'cLevelMembers',
  'climateEngagementData',
  'companies',
  'companyEconomicDiagnosis',
  'companyJobFamilies',
  'companyMonthlyData',
  'copsoqCycleSnapshot',
  'copsoqCycles',
  'copsoqFactorScores',
  'copsoq_responses',
  'cycleSchedule',
  'cycleUnlockRequests',
  'dataAccessLog',
  'departments',
  'developmentDialogs',
  'digestExecutionLog',
  'emailNotifications',
  'emailQueue',
  'employeeGoals',
  'employeeLeaderHistory',
  'employeeTerminationEvents',
  'employees',
  'executiveReportCache',
  'individualProfileAssessments',
  'individualProfilePlaceholders',
  'individualProfileScores',
  'instrumentA_responses',
  'instrumentC_assessments',
  'instrumentD_responses',
  'instrumentUnlockLog',
  'iqlData',
  'leaderOnboardingNotes',
  'leaderOnboardingStageLog',
  'lgpdConsents',
  'monthlyClosureStatus',
  'monthlyUnlockLog',
  'nineBoxCalculationLog',
  'nineBoxClassifications',
  'notifications',
  'nr1AreaDivergenceAnalysis',
  'performanceData',
  'performanceMultiplierLog',
  'performanceQuarterlyData',
  'performanceVariableData',
  'plenitudeData',
  'portalReminderLog',
  'radarNR1Reports',
  'responsavelFinanceiroTransferLog',
  'superAdmins',
]);

// ---------------------------------------------------------------------
// Enum canonico esperado para `dashboardLevel` (ordem literal em ENUM).
// ---------------------------------------------------------------------

const DASHBOARD_LEVEL_ENUM_LITERAL = "['global','departamento','equipe','individual']";

// ---------------------------------------------------------------------
// Tipos canonicos que fecham no dia 11 (constante exportada por
// cycleScheduleEngine.ts — bloco textual esperado no arquivo).
// ---------------------------------------------------------------------

const TIPOS_FECHAM_DIA_11_LITERAL = ['instrumento_c', 'fechamento_mensal'];

// ---------------------------------------------------------------------
// Utilitarios.
// ---------------------------------------------------------------------

function readFileSafe(path) {
  return readFileSync(path, 'utf8');
}

function fileExists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function dirExists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// grep -rn simplificado: retorna todas as ocorrencias de `needle` em
// arquivos .ts/.tsx sob `roots` (relativos a repoRoot), com paths
// relativos + numero de linha. Exclui node_modules, .next, dist, .git.
function grepInSources(repoRoot, needle, roots) {
  const hits = [];
  const excluded = new Set(['node_modules', '.next', 'dist', '.git', 'out']);
  const allowedExt = new Set(['.ts', '.tsx']);

  function walk(dirRel) {
    const dirAbs = resolve(repoRoot, dirRel);
    if (!dirExists(dirAbs)) return;
    const entries = readdirSync(dirAbs, { withFileTypes: true });
    for (const ent of entries) {
      if (excluded.has(ent.name)) continue;
      const nextRel = dirRel ? `${dirRel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        walk(nextRel);
      } else if (ent.isFile()) {
        const dotIdx = ent.name.lastIndexOf('.');
        if (dotIdx < 0) continue;
        const ext = ent.name.slice(dotIdx);
        if (!allowedExt.has(ext)) continue;
        const abs = resolve(repoRoot, nextRel);
        let content;
        try {
          content = readFileSafe(abs);
        } catch {
          continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(needle)) {
            hits.push(`${nextRel}:${i + 1}`);
          }
        }
      }
    }
  }

  for (const r of roots) walk(r);
  return hits;
}

// ---------------------------------------------------------------------
// Modo REPO — assercoes A1..A7.
// ---------------------------------------------------------------------

function runModeRepo(repoRoot) {
  const results = [];

  function record(id, pass, detail) {
    results.push({ id, pass, detail });
  }

  // ---- A1: cadencia semestral do Instrumento D (regex Q1/Q3) ---------
  // Regex canonica em instrumentD.ts (2x) e iql.ts (1x); Route Handler
  // aplica por vinculo estrutural (import + safeParse).
  // Substring escrita como texto exato do arquivo-fonte (o caractere \
  // faz parte da regex literal /^\d{4}-Q[13]$/ visivel no source).
  const REGEX_LITERAL_D = '\\d{4}-Q[13]';
  const instrumentDPath = resolve(repoRoot, 'src/server/routers/instrumentD.ts');
  const iqlPath = resolve(repoRoot, 'src/server/routers/iql.ts');
  const portalDPath = resolve(repoRoot, 'src/app/api/portal/save-instrument-d/route.ts');

  if (!fileExists(instrumentDPath)) {
    record('A1', false, `src/server/routers/instrumentD.ts ausente`);
  } else {
    const s = readFileSafe(instrumentDPath);
    const count = s.split(REGEX_LITERAL_D).length - 1;
    if (count >= 2) {
      // OK — verificar iql.ts abaixo.
      record('A1a', true, `instrumentD.ts contem regex Q1/Q3 (${count} ocorrencias)`);
    } else {
      record(
        'A1a',
        false,
        `instrumentD.ts com regex Q1/Q3 insuficiente (esperado >=2, encontrado ${count})`,
      );
    }
  }

  if (!fileExists(iqlPath)) {
    record('A1b', false, `src/server/routers/iql.ts ausente`);
  } else {
    const s = readFileSafe(iqlPath);
    const count = s.split(REGEX_LITERAL_D).length - 1;
    if (count >= 1) {
      record('A1b', true, `iql.ts contem regex Q1/Q3 (${count} ocorrencia(s))`);
    } else {
      record('A1b', false, `iql.ts sem regex Q1/Q3 (esperado >=1)`);
    }
  }

  if (!fileExists(portalDPath)) {
    record('A1c', false, `src/app/api/portal/save-instrument-d/route.ts ausente`);
  } else {
    const s = readFileSafe(portalDPath);
    const hasImport = s.includes('TRIMESTRE_SCHEMA_INSTRUMENT_D');
    const hasParse = s.includes('.safeParse(') || s.includes('.parse(');
    if (hasImport && hasParse) {
      record(
        'A1c',
        true,
        `save-instrument-d/route.ts aplica TRIMESTRE_SCHEMA_INSTRUMENT_D (vinculo estrutural)`,
      );
    } else {
      record(
        'A1c',
        false,
        `save-instrument-d/route.ts sem TRIMESTRE_SCHEMA_INSTRUMENT_D ` +
          `(import=${hasImport} parse=${hasParse})`,
      );
    }
  }

  // ---- A2: direcao estrutural C x D ---------------------------------
  const tablesPath = resolve(repoRoot, 'src/db/schema/tables.ts');
  if (!fileExists(tablesPath)) {
    record('A2', false, `src/db/schema/tables.ts ausente`);
  } else {
    const s = readFileSafe(tablesPath);
    // Bloco instrumentC_assessments.
    const cMatch = s.match(/instrumentC_assessments\s*=\s*mysqlTable\([\s\S]*?\n\s*\}\),?\s*\);/m);
    // Bloco instrumentD_responses.
    const dMatch = s.match(/instrumentD_responses\s*=\s*mysqlTable\([\s\S]*?\n\s*\}\),?\s*\);/m);

    if (!cMatch) {
      record('A2c', false, `bloco instrumentC_assessments nao encontrado em tables.ts`);
    } else {
      const bloc = cMatch[0];
      const hasEmp = /(^|[^A-Za-z0-9_])employeeId(\s|:)/.test(bloc);
      const hasResp = /(^|[^A-Za-z0-9_])respondenteId(\s|:)/.test(bloc);
      const hasLid = /(^|[^A-Za-z0-9_])liderId(\s|:)/.test(bloc);
      const hasCle = /(^|[^A-Za-z0-9_])clevelId(\s|:)/.test(bloc);
      if (hasEmp && !hasResp && hasLid && hasCle) {
        record(
          'A2c',
          true,
          `instrumentC_assessments: employeeId presente, respondenteId ` +
            `ausente, liderId/clevelId presentes`,
        );
      } else {
        record(
          'A2c',
          false,
          `instrumentC_assessments com direcao estrutural incorreta ` +
            `(employeeId=${hasEmp} respondenteId=${hasResp} liderId=${hasLid} clevelId=${hasCle})`,
        );
      }
    }

    if (!dMatch) {
      record('A2d', false, `bloco instrumentD_responses nao encontrado em tables.ts`);
    } else {
      const bloc = dMatch[0];
      const hasEmp = /(^|[^A-Za-z0-9_])employeeId(\s|:)/.test(bloc);
      const hasResp = /(^|[^A-Za-z0-9_])respondenteId(\s|:)/.test(bloc);
      const hasLid = /(^|[^A-Za-z0-9_])liderId(\s|:)/.test(bloc);
      const hasCle = /(^|[^A-Za-z0-9_])clevelId(\s|:)/.test(bloc);
      if (!hasEmp && hasResp && hasLid && hasCle) {
        record(
          'A2d',
          true,
          `instrumentD_responses: respondenteId presente, employeeId ` +
            `ausente, liderId/clevelId presentes`,
        );
      } else {
        record(
          'A2d',
          false,
          `instrumentD_responses com direcao estrutural incorreta ` +
            `(employeeId=${hasEmp} respondenteId=${hasResp} liderId=${hasLid} clevelId=${hasCle})`,
        );
      }
    }
  }

  // ---- A3: greps vazios de termos abandonados em src/ e tests/ -------
  for (const term of FORBIDDEN_TERMS_REPO) {
    const hits = grepInSources(repoRoot, term, ['src', 'tests']);
    if (hits.length === 0) {
      record(`A3(${term})`, true, `termo ${term} ausente em src/ e tests/`);
    } else {
      const amostra = hits.slice(0, 5).join(', ');
      const cauda = hits.length > 5 ? ' ...' : '';
      record(
        `A3(${term})`,
        false,
        `termo ${term} encontrado em ${hits.length} local(is): ${amostra}${cauda}`,
      );
    }
  }

  // ---- A4: enum dashboardLevel canonico exato em tables.ts -----------
  if (fileExists(tablesPath)) {
    const s = readFileSafe(tablesPath);
    // Aceita a forma canonica (multilinha) OU forma compacta.
    const enumMultiLiteral =
      "dashboardLevel', [\n" +
      "      'global',\n" +
      "      'departamento',\n" +
      "      'equipe',\n" +
      "      'individual',\n" +
      '    ]';
    const okMultiline = s.includes(enumMultiLiteral);
    const okCompact = s.includes(`dashboardLevel', ${DASHBOARD_LEVEL_ENUM_LITERAL}`);
    if (okMultiline || okCompact) {
      record('A4', true, `enum dashboardLevel canonico exato encontrado`);
    } else {
      record(
        'A4',
        false,
        `enum dashboardLevel nao bate com [global,departamento,equipe,individual] em ordem`,
      );
    }
  }

  // ---- A5: inventario nominal fechado das 53 tabelas -----------------
  if (fileExists(tablesPath)) {
    const s = readFileSafe(tablesPath);
    const found = new Set();
    for (const m of s.matchAll(/mysqlTable\(\s*'([^']+)'/g)) {
      found.add(m[1]);
    }
    const missing = [...CANONIC_TABLE_NAMES].filter((n) => !found.has(n));
    const extra = [...found].filter((n) => !CANONIC_TABLE_NAMES.has(n));
    if (missing.length === 0 && extra.length === 0 && found.size === CANONIC_TABLE_NAMES.size) {
      record('A5', true, `53 tabelas canonicas presentes por nome, sem extras`);
    } else {
      record(
        'A5',
        false,
        `inventario nominal divergente: ` +
          `ausentes=[${missing.join(', ')}] ` +
          `extras=[${extra.join(', ')}] total=${found.size}`,
      );
    }
  }

  // ---- A6: tipos fechaveis do cycleSchedule --------------------------
  const enginePath = resolve(repoRoot, 'src/server/services/cycleScheduleEngine.ts');
  if (!fileExists(enginePath)) {
    record('A6', false, `src/server/services/cycleScheduleEngine.ts ausente`);
  } else {
    const s = readFileSafe(enginePath);
    // Bloco esperado (com export): comentario permite espacos/quebras.
    // Match textual do bloco exportado.
    const blocRE = new RegExp(
      String.raw`export\s+const\s+TIPOS_QUE_FECHAM_NO_DIA_11` +
        String.raw`[\s\S]*?=\s*\[\s*` +
        String.raw`'instrumento_c'\s*,\s*'fechamento_mensal'\s*,?\s*` +
        String.raw`\]\s+as\s+const\s*;`,
    );
    if (blocRE.test(s)) {
      record(
        'A6',
        true,
        `TIPOS_QUE_FECHAM_NO_DIA_11 exportado com ` +
          `[${TIPOS_FECHAM_DIA_11_LITERAL.join(', ')}] em ordem`,
      );
    } else {
      record(
        'A6',
        false,
        `TIPOS_QUE_FECHAM_NO_DIA_11 nao encontrado como export com literais canonicos em ordem`,
      );
    }
  }

  // ---- A7: grep vazio de "fechamento manual" em src/ apenas ----------
  const hitsFM = grepInSources(repoRoot, FORBIDDEN_TERM_FECHAMENTO_MANUAL_SRC, ['src']);
  if (hitsFM.length === 0) {
    record('A7', true, `residuo textual "${FORBIDDEN_TERM_FECHAMENTO_MANUAL_SRC}" ausente em src/`);
  } else {
    const amostraFM = hitsFM.slice(0, 5).join(', ');
    record(
      'A7',
      false,
      `residuo textual "${FORBIDDEN_TERM_FECHAMENTO_MANUAL_SRC}" ` + `encontrado: ${amostraFM}`,
    );
  }

  return results;
}

// ---------------------------------------------------------------------
// Modo DOCS — assercoes D1..D11.
// ---------------------------------------------------------------------

const DOC_FILES = {
  DOC_00: 'ROIP_INDICE.md',
  DOC_01: 'CAMADA_DADOS.md',
  DOC_02: 'CAMADA_AUTENTICACAO_AUTORIZACAO.md',
  DOC_03: 'CAMADA_NEGOCIO.md',
  DOC_04: 'CAMADA_IA.md',
  DOC_05: 'CAMADA_UI.md',
  DOC_06: 'CAMADA_OPERACOES.md',
  DOC_07: 'VALIDACAO_ACEITACAO.md',
};

function runModeDocs(docsDir) {
  const results = [];

  function record(id, pass, detail) {
    results.push({ id, pass, detail });
  }

  // Carga dos 8 DOCs. Falta de arquivo = RC=2.
  const contents = {};
  for (const [key, name] of Object.entries(DOC_FILES)) {
    const path = resolve(docsDir, name);
    if (!fileExists(path)) {
      process.stderr.write(`ERRO: DOC ausente: ${path}\n`);
      process.exit(2);
    }
    contents[key] = readFileSafe(path);
  }

  // ---- D1: DOC 00 §9.1 — cadencia semestral do Instrumento D --------
  // Linha do rotulo do Instrumento D contem "Semestral" e "Q1 e Q3".
  const doc00 = contents.DOC_00;
  const linhasDoc00 = doc00.split('\n');
  // Rotulo canonico do glossario: linha comeca com "- **Instrumento D**".
  // Evita casar linhas de indice/sumario que apenas mencionam o instrumento.
  const linhaD = linhasDoc00.find((l) => /^\-\s+\*\*Instrumento D\*\*/.test(l));
  if (linhaD && /Semestral/.test(linhaD) && /Q1 e Q3/.test(linhaD)) {
    record('D1', true, `DOC 00: rotulo do Instrumento D com "Semestral" e "Q1 e Q3"`);
  } else {
    const amostraD = JSON.stringify(linhaD || null);
    record(
      'D1',
      false,
      `DOC 00: rotulo do Instrumento D nao contem ` + `"Semestral" e "Q1 e Q3" (linha=${amostraD})`,
    );
  }

  // ---- D2: DOC 00 §9.1 — niveis do Chat IA --------------------------
  // Linha do Chat IA contem os 4 niveis canonicos.
  const linhaChat = linhasDoc00.find((l) => /\*\*Chat IA\*\*/.test(l));
  const niveisTexto = 'global, departamento, equipe e individual';
  if (linhaChat && linhaChat.includes(niveisTexto)) {
    record('D2', true, `DOC 00: Chat IA lista "${niveisTexto}"`);
  } else {
    const amostraChat = JSON.stringify(linhaChat || null);
    record(
      'D2',
      false,
      `DOC 00: linha do Chat IA nao contem ` + `"${niveisTexto}" (linha=${amostraChat})`,
    );
  }

  // ---- D3: DOC 06 §14.1 — rotulos C/D corretos + Q1/Q3 --------------
  const doc06 = contents.DOC_06;
  const okC = doc06.includes('`instrumento_c` — Avaliação do colaborador direto pelo líder');
  const okD = doc06.includes('`instrumento_d` — Avaliação da liderança direta pelos liderados');
  const okDsemestral = doc06.includes('Cadência semestral (ciclos Q1 e Q3)');
  if (okC && okD && okDsemestral) {
    record(
      'D3',
      true,
      `DOC 06 §14.1: rotulos c/d canonicos + "Cadência semestral (ciclos Q1 e Q3)"`,
    );
  } else {
    record(
      'D3',
      false,
      `DOC 06 §14.1 divergente (rotuloC=${okC} rotuloD=${okD} semestralQ1Q3=${okDsemestral})`,
    );
  }

  // ---- D4: ausencia de "ciclo semestral" nos 8 DOCs ------------------
  // Reformulacao pos-CC028. Estilo canonico descreve o D como
  // "cadencia semestral"; "ciclo semestral" so aparece no residuo.
  const acervoD4 = [];
  for (const [key, s] of Object.entries(contents)) {
    if (s.includes(FORBIDDEN_TERM_CICLO_SEMESTRAL)) acervoD4.push(key);
  }
  if (acervoD4.length === 0) {
    record('D4', true, `nenhum DOC contem "${FORBIDDEN_TERM_CICLO_SEMESTRAL}"`);
  } else {
    record(
      'D4',
      false,
      `"${FORBIDDEN_TERM_CICLO_SEMESTRAL}" encontrado em: ${acervoD4.join(', ')}`,
    );
  }

  // ---- D5: DOC 07 — "8 jobs agendaveis" presente, "7 jobs" ausente --
  const doc07 = contents.DOC_07;
  const has8 = doc07.includes('8 jobs agendáveis');
  const has7 = doc07.includes(FORBIDDEN_TERM_7_JOBS.replace('agendaveis', 'agendáveis'));
  if (has8 && !has7) {
    record('D5', true, `DOC 07: "8 jobs agendáveis" presente, "7 jobs agendáveis" ausente`);
  } else {
    record('D5', false, `DOC 07: 8jobs=${has8} 7jobs=${has7}`);
  }

  // ---- D6: ausencia global de copsoqFactorHistory nos 8 DOCs ---------
  const acervoD6 = [];
  for (const [key, s] of Object.entries(contents)) {
    if (s.includes(FORBIDDEN_TERM_COPSOQ_HIST)) acervoD6.push(key);
  }
  if (acervoD6.length === 0) {
    record('D6', true, `nenhum DOC contem "${FORBIDDEN_TERM_COPSOQ_HIST}"`);
  } else {
    record('D6', false, `"${FORBIDDEN_TERM_COPSOQ_HIST}" encontrado em: ${acervoD6.join(', ')}`);
  }

  // ---- D7: ausencia de companies.setResponsavelFinanceiro no DOC 01 -
  // (DOC 00 mantem 1 mencao legitima em dossie historico §13 pos-CC027)
  const doc01 = contents.DOC_01;
  if (!doc01.includes(FORBIDDEN_TERM_COMPANIES_SETRF)) {
    record('D7', true, `DOC 01 nao contem "${FORBIDDEN_TERM_COMPANIES_SETRF}"`);
  } else {
    record('D7', false, `DOC 01 contem "${FORBIDDEN_TERM_COMPANIES_SETRF}"`);
  }

  // ---- D8: ausencia de "fechamento manual" no DOC 06 (CC015) ---------
  if (!doc06.includes(FORBIDDEN_TERM_FECHAMENTO_MANUAL)) {
    record('D8', true, `DOC 06 nao contem "${FORBIDDEN_TERM_FECHAMENTO_MANUAL}"`);
  } else {
    record('D8', false, `DOC 06 contem "${FORBIDDEN_TERM_FECHAMENTO_MANUAL}"`);
  }

  // ---- D9: ausencia de nineBoxClassificationEngine nos 8 DOCs (CC029)
  const acervoD9 = [];
  for (const [key, s] of Object.entries(contents)) {
    if (s.includes(FORBIDDEN_TERM_NINEBOX_CLASSIFICATION)) acervoD9.push(key);
  }
  if (acervoD9.length === 0) {
    record('D9', true, `nenhum DOC contem "${FORBIDDEN_TERM_NINEBOX_CLASSIFICATION}"`);
  } else {
    record(
      'D9',
      false,
      `"${FORBIDDEN_TERM_NINEBOX_CLASSIFICATION}" encontrado em: ${acervoD9.join(', ')}`,
    );
  }

  // ---- D10: DOC 03 §9.11 — climate.getClimateBlock com 'equipe' -----
  // (CC030) Linha da proc contem 'equipe' junto de 'empresa' e 'departamento'.
  const doc03 = contents.DOC_03;
  const linhasDoc03 = doc03.split('\n');
  const linhaGetBlock = linhasDoc03.find((l) => l.includes('`climate.getClimateBlock`'));
  if (
    linhaGetBlock &&
    linhaGetBlock.includes("'empresa'") &&
    linhaGetBlock.includes("'departamento'") &&
    linhaGetBlock.includes("'equipe'")
  ) {
    record('D10', true, `DOC 03 §9.11: climate.getClimateBlock com 3 escopos`);
  } else {
    const amostraGB = JSON.stringify(linhaGetBlock || null);
    record(
      'D10',
      false,
      `DOC 03 §9.11: climate.getClimateBlock sem 3 escopos ` + `(linha=${amostraGB})`,
    );
  }

  // ---- D11: DOC 03 — climateCalculationEngine.ts presente, agg ausente
  const hasCalc = doc03.includes('climateCalculationEngine.ts');
  const hasAgg = doc03.includes(FORBIDDEN_TERM_CLIMATE_AGGREGATION);
  if (hasCalc && !hasAgg) {
    record(
      'D11',
      true,
      `DOC 03: climateCalculationEngine.ts presente, ${FORBIDDEN_TERM_CLIMATE_AGGREGATION} ausente`,
    );
  } else {
    record(
      'D11',
      false,
      `DOC 03: climateCalculationEngine=${hasCalc} ${FORBIDDEN_TERM_CLIMATE_AGGREGATION}=${hasAgg}`,
    );
  }

  return results;
}

// ---------------------------------------------------------------------
// Impressao de resultados + exit code.
// ---------------------------------------------------------------------

function printResults(mode, results) {
  process.stdout.write(`verify-canonic-consistency (--mode=${mode})\n`);
  process.stdout.write('----------------------------------------\n');
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`${tag} ${r.id}: ${r.detail}\n`);
    if (r.pass) passed += 1;
    else failed += 1;
  }
  process.stdout.write('----------------------------------------\n');
  process.stdout.write(`total: ${results.length}  passou: ${passed}  falhou: ${failed}\n`);
  return failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------
// Entrypoint.
// ---------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.mode !== 'repo' && args.mode !== 'docs') {
    usageError(`--mode invalido: ${JSON.stringify(args.mode)}`);
  }

  if (args.mode === 'repo') {
    const root = args.root ? resolve(args.root) : DEFAULT_REPO_ROOT;
    if (!dirExists(root)) usageError(`--root inexistente: ${root}`);
    const results = runModeRepo(root);
    process.exit(printResults('repo', results));
  } else {
    const docsDir = process.env.ROIP_DOCS_DIR;
    if (!docsDir) usageError(`ROIP_DOCS_DIR nao definido`);
    const abs = resolve(docsDir);
    if (!dirExists(abs)) usageError(`ROIP_DOCS_DIR inexistente: ${abs}`);
    const results = runModeDocs(abs);
    process.exit(printResults('docs', results));
  }
}

main();
