// ROIP APP 9BOX — test unit da regua nova (ME-046a S161).
//
// Exercita `scripts/verify-canonic-consistency.mjs` por child process,
// SEM MySQL, contra fixtures temporarias construidas em runtime. Cobre:
//   - CLI: modo invalido e ROIP_DOCS_DIR ausente -> RC=2 (S166).
//   - Modo repo em fixture defeituosa -> RC=1 com ID da assercao (S165).
//   - Modo docs em fixture conforme -> RC=0.
//   - Modo docs em fixture defeituosa -> RC=1 com ID da assercao.
//
// Racional S165: este teste NUNCA roda o modo repo contra a raiz real do
// repositorio. Se o fizesse, a prova RV-03 do passo 10 tambem reprovaria
// aqui (passo 9 do validate), destruindo a exclusividade exigida por L18.
// A direcao "modo repo -> RC=0" e provada pelo proprio passo 10 do
// validate em todo run.
//
// L27: termos-canario construidos por concatenacao para nao disparar o
// passo 5 (`check-forbidden-terms`) contra este arquivo.
// L27b: termo proibido pelo modo docs ("ciclo semestral") NAO e canario
// do passo 5 nem do passo 10 sobre tests/, entao pode aparecer literal
// nas fixtures — mas o mockup real do produto usa "ultimo trimestre
// fechado" pos-CC028.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'verify-canonic-consistency.mjs');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[], env?: Record<string, string>): RunResult {
  const res = spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...(env ?? {}) },
  });
  return {
    status: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

function mkTmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

// ---------------------------------------------------------------------
// CLI — S166.
// ---------------------------------------------------------------------

describe('verify-canonic-consistency CLI (ME-046a S166)', () => {
  it('script existe no caminho esperado', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('modo invalido reprova com RC=2', () => {
    const r = runScript(['--mode=xyz']);
    expect(r.status).toBe(2);
    expect(r.stderr.toLowerCase()).toContain('mode');
  });

  it('modo docs sem ROIP_DOCS_DIR reprova com RC=2', () => {
    // Passa env explicitamente sem ROIP_DOCS_DIR.
    const clean = { ...process.env };
    delete clean.ROIP_DOCS_DIR;
    const r = spawnSync('node', [SCRIPT, '--mode=docs'], {
      encoding: 'utf8',
      env: clean,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('ROIP_DOCS_DIR');
  });

  it('modo docs com ROIP_DOCS_DIR apontando a diretorio inexistente reprova com RC=2', () => {
    const r = runScript(['--mode=docs'], { ROIP_DOCS_DIR: '/tmp/roip-inexistente-xyz-12345' });
    expect(r.status).toBe(2);
  });

  it('modo repo com --root inexistente reprova com RC=2', () => {
    const r = runScript(['--mode=repo', '--root=/tmp/roip-inexistente-xyz-67890']);
    expect(r.status).toBe(2);
  });
});

// ---------------------------------------------------------------------
// Modo repo em fixture defeituosa — S165.
// ---------------------------------------------------------------------

describe('verify-canonic-consistency --mode=repo em fixture defeituosa (S165)', () => {
  it('fixture minima sem tables.ts falha em A2/A4/A5/A6 e passa exit 1', () => {
    const dir = mkTmp('roip-repo-broken');
    try {
      // Fixture: apenas as subpastas necessarias, sem os arquivos.
      // A regua registra cada assercao como FAIL com "ausente" e sai
      // com RC=1 (falha de assercao, nao RC=2 de erro de uso).
      mkdirSync(join(dir, 'src', 'db', 'schema'), { recursive: true });
      mkdirSync(join(dir, 'src', 'server', 'routers'), { recursive: true });
      mkdirSync(join(dir, 'src', 'server', 'services'), { recursive: true });
      mkdirSync(join(dir, 'src', 'app', 'api', 'portal', 'save-instrument-d'), {
        recursive: true,
      });
      mkdirSync(join(dir, 'tests'), { recursive: true });

      const r = runScript(['--mode=repo', `--root=${dir}`]);
      expect(r.status).toBe(1);
      // A regua SEMPRE termina com "passou: N falhou: M".
      expect(r.stdout).toMatch(/falhou:\s*[1-9]/);
      // IDs de assercao aparecem no output.
      expect(r.stdout).toMatch(/FAIL A/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------
// Modo docs — fixtures conforme e defeituosa.
// ---------------------------------------------------------------------

// Textos minimos suficientes para satisfazer D1..D11. Cabecalhos so para
// contexto humano; a regua le linhas especificas.
function fixtureDocsConforme(): Record<string, string> {
  const doc00 =
    [
      '# DOC 00 — ROIP_INDICE.md',
      '',
      '- **Instrumento D** — instrumento IQL respondido pelo liderado. ' +
        'Semestral, aplicado nos trimestres impares (Q1 e Q3). DOC 03 §8.',
      '- **Chat IA** — drawer com niveis global, departamento, equipe e individual.',
    ].join('\n') + '\n';

  const doc01 =
    [
      '# DOC 01 — CAMADA_DADOS.md',
      '',
      'Corpo do DOC 01 sem o termo proibido pela CC012 aplicada.',
    ].join('\n') + '\n';

  const doc02 = '# DOC 02 — CAMADA_AUTENTICACAO_AUTORIZACAO.md\n';

  const doc03 =
    [
      '# DOC 03 — CAMADA_NEGOCIO.md',
      '',
      "- `climate.getClimateBlock` — Escopo 'empresa', 'departamento' ou 'equipe'.",
      '',
      '### 18.1 Arquivos canonicos de motor',
      '- `server/services/climateCalculationEngine.ts` — motor do Bloco Clima.',
    ].join('\n') + '\n';

  const doc04 = '# DOC 04 — CAMADA_IA.md\n';
  const doc05 = '# DOC 05 — CAMADA_UI.md\n';

  const doc06 =
    [
      '# DOC 06 — CAMADA_OPERACOES.md',
      '',
      '### 14.1 Cinco tipos canonicos',
      '2. `instrumento_c` — Avaliação do colaborador direto pelo líder. ' + 'Cadência trimestral.',
      '3. `instrumento_d` — Avaliação da liderança direta pelos liderados. ' +
        'Cadência semestral (ciclos Q1 e Q3).',
    ].join('\n') + '\n';

  const doc07 =
    ['# DOC 07 — VALIDACAO_ACEITACAO.md', '- 8 jobs agendáveis registrados no scheduler.'].join(
      '\n',
    ) + '\n';

  return {
    'ROIP_INDICE.md': doc00,
    'CAMADA_DADOS.md': doc01,
    'CAMADA_AUTENTICACAO_AUTORIZACAO.md': doc02,
    'CAMADA_NEGOCIO.md': doc03,
    'CAMADA_IA.md': doc04,
    'CAMADA_UI.md': doc05,
    'CAMADA_OPERACOES.md': doc06,
    'VALIDACAO_ACEITACAO.md': doc07,
  };
}

function writeDocs(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
}

describe('verify-canonic-consistency --mode=docs em fixtures', () => {
  it('fixture conforme passa com RC=0 (D1..D11)', () => {
    const dir = mkTmp('roip-docs-ok');
    try {
      writeDocs(dir, fixtureDocsConforme());
      const r = runScript(['--mode=docs'], { ROIP_DOCS_DIR: dir });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/passou:\s*11/);
      expect(r.stdout).toMatch(/falhou:\s*0/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fixture defeituosa (residuo em DOC 06) falha com RC=1 exclusivo em D8', () => {
    const dir = mkTmp('roip-docs-broken');
    try {
      const files = fixtureDocsConforme();
      // Injeta o termo proibido "fechamento manual" no DOC 06.
      const termo = ['fechamento', ' ', 'manual'].join('');
      files['CAMADA_OPERACOES.md'] = files['CAMADA_OPERACOES.md']! + `\nTexto com ${termo}.\n`;
      writeDocs(dir, files);
      const r = runScript(['--mode=docs'], { ROIP_DOCS_DIR: dir });
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/FAIL D8/);
      // Apenas D8 falha nesta injecao.
      expect(r.stdout).toMatch(/falhou:\s*1/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fixture defeituosa (rotulo do D sem Q1 e Q3) falha com RC=1 em D1', () => {
    const dir = mkTmp('roip-docs-broken-d1');
    try {
      const files = fixtureDocsConforme();
      files['ROIP_INDICE.md'] = files['ROIP_INDICE.md']!.replace('Q1 e Q3', 'Q2 e Q4');
      writeDocs(dir, files);
      const r = runScript(['--mode=docs'], { ROIP_DOCS_DIR: dir });
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/FAIL D1/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
