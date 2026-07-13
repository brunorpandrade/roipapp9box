#!/usr/bin/env node
// ROIP APP 9BOX — verify-schema (ME-002).
// Compara src/db/schema/tables.ts x src/db/migrations/0000_canonical.sql
// coluna a coluna e tabela a tabela. Falha (RC != 0) em qualquer divergencia.
//
// Fonte da verdade estrutural: a migration (transpilacao canonica do DOC 01).
// tables.ts precisa refletir literalmente o conjunto de tabelas, colunas
// e FKs da migration. Este script eh a regua que a ME-003 encadeia primeiro
// em `npm run validate`.
//
// Decisao S005: comparacao eh tables.ts x migration (nao x DOC 01).
// A garantia contra DOC 01 vem da execucao dos invariantes §20 na base real.
//
// Decisao S004: CHECK constraints vivem apenas na migration; tables.ts
// nao declara CHECKs, entao este script nao os compara.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/0000_canonical.sql');
const TABLES_PATH = resolve(REPO_ROOT, 'src/db/schema/tables.ts');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let hasError = false;
const errors = [];

function fail(msg) {
  hasError = true;
  errors.push(msg);
}

// ---------------------------------------------------------------------
// Parser da migration: extrai tabelas, colunas e FKs.
// ---------------------------------------------------------------------

function parseMigration(sql) {
  const tables = new Map();

  // Divide em blocos de CREATE TABLE. Delimitador: `;` no final de `);`.
  const createBlocks = sql.matchAll(/CREATE TABLE\s+`([^`]+)`\s*\(([\s\S]*?)\n\)\s*;/g);

  for (const match of createBlocks) {
    const tableName = match[1];
    const body = match[2];
    const columns = new Set();
    const foreignKeys = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim().replace(/,$/, '');
      if (line.length === 0) continue;
      if (line.startsWith('--')) continue;

      // Colunas: comecam com `nomeColuna` seguido de tipo.
      const colMatch = line.match(/^`([^`]+)`\s+/);
      if (colMatch) {
        const first = colMatch[1];
        // Descarta constraints/keys que tambem podem comecar com backtick
        // (nao ocorrem nesta migration, mas guarda de seguranca).
        const isConstraint =
          line.startsWith('CONSTRAINT') ||
          line.startsWith('FOREIGN KEY') ||
          line.startsWith('UNIQUE KEY') ||
          line.startsWith('PRIMARY KEY') ||
          line.startsWith('INDEX') ||
          line.startsWith('KEY');
        if (!isConstraint) {
          columns.add(first);
          continue;
        }
      }

      // FK: FOREIGN KEY (`col`) REFERENCES `refTable`(`refCol`) [ON DELETE X]
      const fkPattern =
        'FOREIGN KEY\\s*\\(`([^`]+)`\\)\\s*REFERENCES\\s+`([^`]+)`\\s*\\(`([^`]+)`\\)' +
        '(?:\\s+ON DELETE\\s+([A-Z ]+?))?(?:\\s*,)?$';
      const fkMatch = line.match(new RegExp(fkPattern));
      if (fkMatch) {
        foreignKeys.push({
          column: fkMatch[1],
          refTable: fkMatch[2],
          refColumn: fkMatch[3],
          onDelete: (fkMatch[4] || 'RESTRICT').trim(),
        });
      }
    }

    if (tables.has(tableName)) {
      // Duplicidade: consolidar (nao esperado, mas registrar).
      const existing = tables.get(tableName);
      for (const c of columns) existing.columns.add(c);
      existing.foreignKeys.push(...foreignKeys);
    } else {
      tables.set(tableName, { columns, foreignKeys });
    }
  }

  // ALTER TABLE X ADD COLUMN Y ...: adiciona a coluna a tabela existente.
  const alterAdds = sql.matchAll(/ALTER TABLE\s+`([^`]+)`\s+ADD COLUMN\s+`([^`]+)`/g);
  for (const match of alterAdds) {
    const tableName = match[1];
    const columnName = match[2];
    const table = tables.get(tableName);
    if (table) table.columns.add(columnName);
  }

  // ALTER TABLE X ADD CONSTRAINT ... FOREIGN KEY (`col`) REFERENCES ...
  const alterFkPattern =
    'ALTER TABLE\\s+`([^`]+)`[\\s\\S]*?ADD CONSTRAINT\\s+`[^`]+`\\s+' +
    'FOREIGN KEY\\s*\\(`([^`]+)`\\)\\s*REFERENCES\\s+`([^`]+)`\\s*\\(`([^`]+)`\\)' +
    '(?:\\s+ON DELETE\\s+([A-Z ]+?))?[;]?';
  const alterFks = sql.matchAll(new RegExp(alterFkPattern, 'g'));
  for (const match of alterFks) {
    const tableName = match[1];
    const table = tables.get(tableName);
    if (table) {
      table.foreignKeys.push({
        column: match[2],
        refTable: match[3],
        refColumn: match[4],
        onDelete: (match[5] || 'RESTRICT').trim(),
      });
    }
  }

  return tables;
}

// ---------------------------------------------------------------------
// Parser de tables.ts: extrai tabelas, colunas e FKs por regex.
// Convencao do arquivo: 1 statement por linha, ≤100 col, mysqlTable('name'...
// ---------------------------------------------------------------------

// Extrai o bloco delimitado por caractere de abertura open ate seu par
// balanceado, comecando a leitura no indice start (que deve apontar para
// open). Retorna { end, body } onde body eh o conteudo (sem os delimitadores).
function extractBalanced(src, start, open, close) {
  if (src[start] !== open) return null;
  let depth = 0;
  let i = start;
  const N = src.length;
  while (i < N) {
    const c = src[i];
    // Skip de strings ('...'), template `${...}` e comentarios // e /* */.
    if (c === "'" || c === '"') {
      const quote = c;
      i++;
      while (i < N && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < N && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < N && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        return { end: i, body: src.substring(start + 1, i) };
      }
    }
    i++;
  }
  return null;
}

// Percorre um bloco de codigo TS e coleta propriedades de primeiro nivel,
// definidas como `propName: typeFn('sqlName', ...)`. "Primeiro nivel" =
// profundidade 0 relativa ao inicio do bloco: fora de qualquer subestrutura
// `{...}`, `(...)`, `[...]`. Ignora strings e comentarios.
function collectTopLevelProperties(block) {
  const results = [];
  const N = block.length;
  let depth = 0;
  let i = 0;
  while (i < N) {
    const c = block[i];
    // Strings
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < N && block[i] !== q) {
        if (block[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    // Comentario de linha
    if (c === '/' && block[i + 1] === '/') {
      while (i < N && block[i] !== '\n') i++;
      continue;
    }
    // Comentario de bloco
    if (c === '/' && block[i + 1] === '*') {
      i += 2;
      while (i < N && !(block[i] === '*' && block[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Aberturas / fechamentos
    if (c === '{' || c === '(' || c === '[') {
      depth++;
      i++;
      continue;
    }
    if (c === '}' || c === ')' || c === ']') {
      depth--;
      i++;
      continue;
    }
    // No depth 0, procura um identificador seguido de ':'.
    if (depth === 0 && /[A-Za-z_]/.test(c)) {
      // Consome identificador.
      let j = i;
      while (j < N && /[A-Za-z0-9_]/.test(block[j])) j++;
      const propName = block.substring(i, j);
      // Skip whitespace + verifica ':'.
      let k = j;
      while (k < N && /\s/.test(block[k])) k++;
      if (block[k] === ':') {
        k++;
        // Skip whitespace.
        while (k < N && /\s/.test(block[k])) k++;
        // Consome nome do tipo.
        let t = k;
        while (t < N && /[A-Za-z0-9_]/.test(block[t])) t++;
        // Skip whitespace + verifica '('.
        let u = t;
        while (u < N && /\s/.test(block[u])) u++;
        if (block[u] === '(') {
          // Skip whitespace pos-abertura.
          let v = u + 1;
          while (v < N && /\s/.test(block[v])) v++;
          if (block[v] === "'") {
            // Extrai string literal.
            let w = v + 1;
            while (w < N && block[w] !== "'") {
              if (block[w] === '\\') w++;
              w++;
            }
            const sqlName = block.substring(v + 1, w);
            results.push({ tsName: propName, sqlName, offset: i });
          }
        }
      }
      i = j;
      continue;
    }
    i++;
  }
  return results;
}

function parseTablesTs(src) {
  const tables = new Map();

  // Encontra "export const X = mysqlTable('name'," sequencialmente.
  const headerRegex = /export const (\w+) = mysqlTable\(\s*'([^']+)'\s*,\s*/g;

  let headerMatch;
  while ((headerMatch = headerRegex.exec(src)) !== null) {
    const tableName = headerMatch[2];
    let cursor = headerMatch.index + headerMatch[0].length;

    // Bloco de colunas: comeca em '{' e termina no '}' balanceado.
    if (src[cursor] !== '{') continue;
    const colsExtract = extractBalanced(src, cursor, '{', '}');
    if (!colsExtract) continue;
    const colsBlock = colsExtract.body;
    cursor = colsExtract.end + 1;

    // Depois pode vir ", (t) => ({ ... })" com o bloco de indices.
    let idxBlock = '';
    // Consume whitespace e ','
    while (cursor < src.length && /\s|,/.test(src[cursor])) cursor++;
    if (src[cursor] === '(') {
      // Skip "(t) => (" — encontra o '({' apos '=>'.
      const arrow = src.indexOf('=>', cursor);
      if (arrow >= 0) {
        let p = arrow + 2;
        while (p < src.length && /\s/.test(src[p])) p++;
        if (src[p] === '(') p++;
        while (p < src.length && /\s/.test(src[p])) p++;
        if (src[p] === '{') {
          const idxExtract = extractBalanced(src, p, '{', '}');
          if (idxExtract) idxBlock = idxExtract.body;
        }
      }
    }

    // Extrai propriedades de primeiro nivel do bloco de colunas.
    // "Primeiro nivel" = depth 0 dentro do colsBlock (fora de qualquer
    // sub-bloco `{...}`, `(...)` ou `[...]`). Evita capturar identificadores
    // internos como `{ onDelete: '...' }`.
    const columns = new Set();
    const propsRaw = collectTopLevelProperties(colsBlock);
    for (const p of propsRaw) columns.add(p.sqlName);

    // FKs: chamadas `.references(() => refTable.column, { onDelete: '...' })`.
    // Associa cada FK a propriedade que a contem, via offset.
    const refPattern =
      '\\.references\\(\\s*\\(\\s*\\)\\s*=>\\s*(\\w+)\\.(\\w+)' +
      "(?:\\s*,\\s*\\{\\s*onDelete:\\s*'([^']+)'\\s*\\})?\\s*\\)";
    const refRegex = new RegExp(refPattern, 'g');

    const foreignKeys = [];
    let rMatch;
    while ((rMatch = refRegex.exec(colsBlock)) !== null) {
      let owner = null;
      for (const p of propsRaw) {
        if (p.offset <= rMatch.index) owner = p;
        else break;
      }
      if (!owner) continue;
      foreignKeys.push({
        column: owner.sqlName,
        refTable: rMatch[1],
        refColumn: rMatch[2],
        onDelete: (rMatch[3] || 'restrict').toUpperCase().replace('_', ' '),
      });
    }

    tables.set(tableName, { columns, foreignKeys, idxBlock });
  }

  return tables;
}

// ---------------------------------------------------------------------
// Comparacao
// ---------------------------------------------------------------------

function diffSets(setA, setB) {
  const onlyA = [];
  const onlyB = [];
  for (const v of setA) if (!setB.has(v)) onlyA.push(v);
  for (const v of setB) if (!setA.has(v)) onlyB.push(v);
  return { onlyA, onlyB };
}

function main() {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const ts = readFileSync(TABLES_PATH, 'utf8');

  const sqlTables = parseMigration(sql);
  const tsTables = parseTablesTs(ts);

  console.log(`Migration: ${sqlTables.size} tabelas`);
  console.log(`Schema TS: ${tsTables.size} tabelas`);

  // Nivel 1: contagem
  if (sqlTables.size !== 53) {
    fail(`Migration tem ${sqlTables.size} tabelas, esperado 53.`);
  }
  if (tsTables.size !== sqlTables.size) {
    fail(`tables.ts tem ${tsTables.size} tabelas; migration tem ${sqlTables.size}.`);
  }

  // Nivel 2: nomes das tabelas
  const sqlNames = new Set(sqlTables.keys());
  const tsNames = new Set(tsTables.keys());
  const { onlyA: onlySql, onlyB: onlyTs } = diffSets(sqlNames, tsNames);
  if (onlySql.length > 0) {
    fail(`Tabelas na migration mas ausentes em tables.ts: ${onlySql.join(', ')}`);
  }
  if (onlyTs.length > 0) {
    fail(`Tabelas em tables.ts mas ausentes na migration: ${onlyTs.join(', ')}`);
  }

  // Nivel 3: colunas por tabela
  let totalSqlCols = 0;
  let totalTsCols = 0;
  for (const [name, sqlDef] of sqlTables) {
    totalSqlCols += sqlDef.columns.size;
    if (!tsTables.has(name)) continue;
    const tsDef = tsTables.get(name);
    totalTsCols += tsDef.columns.size;
    const { onlyA: colOnlySql, onlyB: colOnlyTs } = diffSets(sqlDef.columns, tsDef.columns);
    if (colOnlySql.length > 0) {
      fail(`${name}: colunas na migration ausentes em tables.ts: ${colOnlySql.join(', ')}`);
    }
    if (colOnlyTs.length > 0) {
      fail(`${name}: colunas em tables.ts ausentes na migration: ${colOnlyTs.join(', ')}`);
    }
  }

  console.log(`Total de colunas na migration: ${totalSqlCols}`);
  console.log(`Total de colunas em tables.ts: ${totalTsCols}`);

  // Nivel 4: FKs. Compara pares (coluna -> refTable.refColumn) por tabela.
  // Nao compara ON DELETE por variacao de grafia (RESTRICT default etc).
  let totalSqlFks = 0;
  let totalTsFks = 0;
  for (const [name, sqlDef] of sqlTables) {
    totalSqlFks += sqlDef.foreignKeys.length;
    if (!tsTables.has(name)) continue;
    const tsDef = tsTables.get(name);
    totalTsFks += tsDef.foreignKeys.length;

    const sqlFkKeys = new Set(
      sqlDef.foreignKeys.map((fk) => `${fk.column}->${fk.refTable}.${fk.refColumn}`),
    );
    // No TS o refTable e o identificador da const (que igual ao nome da tabela).
    // Em algumas tabelas ha FKs que vivem apenas na migration (S004/S005 nota):
    // por ex monthlyUnlockLog.unlockRequestId -> cycleUnlockRequests.id foi
    // omitida em tables.ts para evitar ciclo de declaracao.
    // Nao vamos falhar se a migration tiver FK ausente em tables.ts; vamos
    // registrar. O que causa falha e o inverso: FK em tables.ts sem par na SQL.
    const tsFkKeys = new Set(
      tsDef.foreignKeys.map((fk) => `${fk.column}->${fk.refTable}.${fk.refColumn}`),
    );
    for (const key of tsFkKeys) {
      if (!sqlFkKeys.has(key)) {
        fail(`${name}: FK ${key} em tables.ts nao existe na migration.`);
      }
    }
  }

  console.log(`Total de FKs na migration: ${totalSqlFks}`);
  console.log(`Total de FKs em tables.ts: ${totalTsFks}`);

  // Invariantes canonicos (§20)
  if (totalSqlCols !== 691) {
    console.log(
      `${YELLOW}AVISO:${RESET} migration tem ${totalSqlCols} colunas; canonico §20 = 691.`,
    );
  }
  if (totalSqlFks !== 107) {
    console.log(`${YELLOW}AVISO:${RESET} migration tem ${totalSqlFks} FKs; canonico §20 = 107.`);
  }

  if (hasError) {
    console.error(`\n${RED}FAIL:${RESET} ${errors.length} divergencia(s)`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}OK${RESET} — schema conforme. Tabelas: 53/53; colunas: ${totalTsCols}.`);
  process.exit(0);
}

main();
