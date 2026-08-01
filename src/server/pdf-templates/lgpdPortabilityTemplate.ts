/* eslint-disable @stylistic/max-len -- template HTML canonico com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — template PDF de portabilidade LGPD (ME-062b, DOC 06 §19.6).
//
// Renderizacao HTML deterministica do payload canonico de portabilidade
// de dados pessoais do titular (§19.6). Consumido pelo Route Handler
// `GET /api/portal/lgpd/portability`; convertido em PDF pela toolchain
// `pdfRenderer.ts` (Puppeteer via `puppeteer-core`, S260).
//
// Regime canonico (§19.6 — reversao S341 canonizada):
// - Preserva APENAS o PDF unico gerado on-the-fly (JSON descartado
//   canonicamente na Fase Prontidao MVP §8.2).
// - Layout editorial via `layoutBase.ts` (A4 retrato, margens 20mm,
//   S257 bit-exact).
// - Nome canonico do arquivo:
//   `dados_pessoais_{nomeSanitizado}_{YYYYMMDD}.pdf`.
// - Sem cache — cada chamada gera PDF novo refletindo os dados atuais.
//
// Determinismo canonico (§11.12 estendido a §19.6): nenhuma leitura
// interna de `Date.now()`. A data de geracao viaja no input
// (`generatedAtDate`) e vai ao rodape. Mesmos inputs geram byte a byte
// o mesmo HTML.
//
// Escopo canonico do payload (§19.6 literal — verificado bit-exact
// contra schema atual em `src/db/schema/tables.ts`):
//   - Dados cadastrais (employees OU cLevelMembers).
//   - `instrumentA_responses` como respondente (autoavaliacao).
//   - `instrumentD_responses` como respondente (avaliacao do lider
//     direto / C-level).
//   - `copsoq_responses` como respondente (Radar NR-1).
//   - `individualProfileAssessments` como respondente (respostas brutas).
//
// Fora do escopo canonico (§19.6 literal): avaliacoes de terceiros
// sobre o titular (Instrumento C, IQL, 9-Box, `plenitudeScore`,
// `scoreDesempenho`, avaliacoes do lider direto sobre este colaborador).
//
// Decorrencia canonica automatica do schema (S344 canonizada nesta ME):
//   - Para `titularType='clevel'`, as tabelas `instrumentA_responses`,
//     `instrumentD_responses` e `copsoq_responses` retornam vazio pois
//     as FKs apontam exclusivamente a `employees.id`. O template renderiza
//     canonicamente `<p class="muted">Nenhuma resposta registrada.</p>`
//     nessas secoes — preservando determinismo bit-exact e alinhamento
//     literal com §19.6.

import { escapeHtml, type LayoutBaseCompany, renderLayoutBase } from './layoutBase';

/** Discriminante canonico do titular (padrao polimorfico A, DOC 01 §14.1). */
export type LgpdPortabilityTitularType = 'employee' | 'clevel';

/**
 * Dados cadastrais canonicos do titular (§19.6). Union interna preserva
 * as diferencas literais entre `employees` e `cLevelMembers` — os campos
 * comuns (nome, cpf, email, cargo, dataAdmissao, departamento) sao
 * sempre exibidos; campos exclusivos do titular sao exibidos apenas
 * quando aplicaveis.
 */
export interface LgpdPortabilityCadastrais {
  titularType: LgpdPortabilityTitularType;
  nome: string;
  cpf: string;
  email: string | null;
  dataNascimento: string; // YYYY-MM-DD
  dataAdmissao: string; // YYYY-MM-DD
  cargo: string;
  departamento: string;
  /** Exclusivo employee (`cbo` + `descricaoCBO`). Null para C-level. */
  cbo: string | null;
  descricaoCBO: string | null;
  /** Exclusivo employee (`nivelHierarquico`). Null para C-level. */
  nivelHierarquico: 'operacional' | 'tatico' | 'estrategico' | null;
  /** Exclusivo employee (`senioridade`). Null para C-level. */
  senioridade: 'junior' | 'pleno' | 'senior' | null;
  /** Exclusivo employee (`jobFamily`). Null para C-level. */
  jobFamily: string | null;
  status: 'ativo' | 'inativo';
}

/**
 * Linha bruta de resposta canonica dos Instrumentos A ou D
 * (`dimensao`, `itemIndex`, `valor`). Preserva formato canonico DOC 01
 * §11.4/§11.5 (tinyint 0-100 ou escala Likert).
 */
export interface LgpdPortabilityInstrumentoRow {
  trimestre: string; // YYYY-QN
  dimensao: number;
  itemIndex: number;
  valor: number;
  respondidoEm: string | null; // ISO 8601 ou null
}

/**
 * Linha bruta de resposta canonica do Radar NR-1 (`fator`, `itemIndex`,
 * `valor`). Preserva formato canonico DOC 01 §11.7.
 */
export interface LgpdPortabilityCopsoqRow {
  cicloDbId: number;
  fator: number;
  itemIndex: number;
  valor: number;
}

/**
 * Snapshot canonico do Perfil Individual (respostas brutas §19.6). O
 * campo `respostas` do schema e `json` — o template renderiza como
 * texto pre-formatado deterministico via `JSON.stringify(v, null, 2)`.
 */
export interface LgpdPortabilityIndividualProfileRow {
  assessmentId: number;
  tentativa: number;
  status: 'em_andamento' | 'enviado' | 'inconsistente';
  blocoAtual: number;
  enviadoEm: string | null; // ISO 8601 ou null
  /** JSON canonico das respostas brutas — pode ser null quando `em_andamento` inicial. */
  respostas: unknown;
}

/** Input canonico do template. */
export interface LgpdPortabilityTemplateInput {
  company: LayoutBaseCompany;
  cadastrais: LgpdPortabilityCadastrais;
  instrumentA: LgpdPortabilityInstrumentoRow[];
  instrumentD: LgpdPortabilityInstrumentoRow[];
  copsoq: LgpdPortabilityCopsoqRow[];
  individualProfile: LgpdPortabilityIndividualProfileRow[];
  /** Data de geracao para o rodape. `YYYY-MM-DD`. */
  generatedAtDate: string;
}

const NIVEL_HIERARQUICO_ROTULO_LGPD: Record<'operacional' | 'tatico' | 'estrategico', string> = {
  operacional: 'Operacional',
  tatico: 'Tático',
  estrategico: 'Estratégico',
};

const SENIORIDADE_ROTULO_LGPD: Record<'junior' | 'pleno' | 'senior', string> = {
  junior: 'Júnior',
  pleno: 'Pleno',
  senior: 'Sênior',
};

const STATUS_TITULAR_ROTULO: Record<'ativo' | 'inativo', string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
};

const STATUS_IPA_ROTULO: Record<'em_andamento' | 'enviado' | 'inconsistente', string> = {
  em_andamento: 'Em andamento',
  enviado: 'Enviado',
  inconsistente: 'Inconsistente',
};

const TITULAR_TIPO_ROTULO: Record<LgpdPortabilityTitularType, string> = {
  employee: 'Colaborador',
  clevel: 'C-Level',
};

/**
 * Sanitizacao canonica do nome do titular para o filename (§19.6).
 * Regras bit-exact ao padrao consolidado em
 * `normalizeColaboradorNameForFilename` do `individualProfileTemplate.ts`:
 * remove acentos, remove pontuacao, colapsa espacos em underscore,
 * remove underscores adjacentes e das bordas, garante nao vazio.
 */
export function sanitizeNomeCanonicoLgpd(nome: string): string {
  const semAcento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const semEspecial = semAcento.replace(/[^A-Za-z0-9\s_-]/g, '');
  const comUnderscore = semEspecial.replace(/\s+/g, '_').replace(/_+/g, '_');
  const trim = comUnderscore.replace(/^_+|_+$/g, '');
  return trim.length > 0 ? trim : 'Titular';
}

/**
 * Converte `YYYY-MM-DD` (formato do `generatedAtDate` canonico) para
 * `YYYYMMDD` (formato canonico literal do filename §19.6). Falha
 * defensiva quando input nao respeita o formato — throw explicito.
 */
export function formatDateYyyyMmDdCompact(dateYyyyMmDd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYyyyMmDd)) {
    throw new Error(
      `formatDateYyyyMmDdCompact: formato invalido "${dateYyyyMmDd}" — esperado YYYY-MM-DD`,
    );
  }
  return dateYyyyMmDd.replace(/-/g, '');
}

/**
 * Compoe o nome canonico do arquivo PDF de portabilidade LGPD conforme
 * §19.6 literal: `dados_pessoais_{nomeSanitizado}_{YYYYMMDD}.pdf`.
 */
export function composeLgpdPortabilityFilename(nome: string, generatedAtDate: string): string {
  const nomeNorm = sanitizeNomeCanonicoLgpd(nome);
  const dateCompact = formatDateYyyyMmDdCompact(generatedAtDate);
  return `dados_pessoais_${nomeNorm}_${dateCompact}.pdf`;
}

// ============================================================
// Renderizacao interna das secoes canonicas
// ============================================================

function renderCadastraisSection(c: LgpdPortabilityCadastrais): string {
  const linhas: string[] = [];
  linhas.push(
    `<p><strong>Tipo de titular:</strong> ${escapeHtml(TITULAR_TIPO_ROTULO[c.titularType])}</p>`,
  );
  linhas.push(`<p><strong>Nome:</strong> ${escapeHtml(c.nome)}</p>`);
  linhas.push(`<p><strong>CPF:</strong> ${escapeHtml(c.cpf)}</p>`);
  linhas.push(`<p><strong>E-mail:</strong> ${escapeHtml(c.email ?? '(não cadastrado)')}</p>`);
  linhas.push(`<p><strong>Data de nascimento:</strong> ${escapeHtml(c.dataNascimento)}</p>`);
  linhas.push(`<p><strong>Data de admissão:</strong> ${escapeHtml(c.dataAdmissao)}</p>`);
  linhas.push(`<p><strong>Cargo:</strong> ${escapeHtml(c.cargo)}</p>`);
  linhas.push(`<p><strong>Departamento:</strong> ${escapeHtml(c.departamento)}</p>`);
  linhas.push(`<p><strong>Status:</strong> ${escapeHtml(STATUS_TITULAR_ROTULO[c.status])}</p>`);
  if (c.cbo !== null && c.descricaoCBO !== null) {
    linhas.push(
      `<p><strong>CBO:</strong> ${escapeHtml(c.cbo)} — ${escapeHtml(c.descricaoCBO)}</p>`,
    );
  }
  if (c.nivelHierarquico !== null) {
    linhas.push(
      `<p><strong>Nível hierárquico:</strong> ${escapeHtml(NIVEL_HIERARQUICO_ROTULO_LGPD[c.nivelHierarquico])}</p>`,
    );
  }
  if (c.senioridade !== null) {
    linhas.push(
      `<p><strong>Senioridade:</strong> ${escapeHtml(SENIORIDADE_ROTULO_LGPD[c.senioridade])}</p>`,
    );
  }
  if (c.jobFamily !== null) {
    linhas.push(`<p><strong>Família de cargo:</strong> ${escapeHtml(c.jobFamily)}</p>`);
  }
  return `<section>
  <h2>Dados cadastrais</h2>
  ${linhas.join('\n  ')}
</section>`;
}

function renderInstrumentoRows(rows: LgpdPortabilityInstrumentoRow[], vazioMsg: string): string {
  if (rows.length === 0) {
    return `<p class="muted">${escapeHtml(vazioMsg)}</p>`;
  }
  const cells = rows
    .map(
      (r) => `<tr>
      <td style="padding:1.5mm 3mm 1.5mm 0;">${escapeHtml(r.trimestre)}</td>
      <td style="padding:1.5mm 3mm; text-align:center;">${r.dimensao}</td>
      <td style="padding:1.5mm 3mm; text-align:center;">${r.itemIndex}</td>
      <td style="padding:1.5mm 3mm; text-align:right;">${r.valor}</td>
      <td style="padding:1.5mm 0 1.5mm 3mm;" class="muted">${escapeHtml(r.respondidoEm ?? '')}</td>
    </tr>`,
    )
    .join('\n');
  return `<table style="width:100%; border-collapse:collapse; margin-top:2mm; font-size:9.5pt;">
    <thead>
      <tr>
        <th style="text-align:left; padding:1.5mm 3mm 1.5mm 0; border-bottom:0.5pt solid #d1d5db;">Trimestre</th>
        <th style="text-align:center; padding:1.5mm 3mm; border-bottom:0.5pt solid #d1d5db;">Dimensão</th>
        <th style="text-align:center; padding:1.5mm 3mm; border-bottom:0.5pt solid #d1d5db;">Item</th>
        <th style="text-align:right; padding:1.5mm 3mm; border-bottom:0.5pt solid #d1d5db;">Valor</th>
        <th style="text-align:left; padding:1.5mm 0 1.5mm 3mm; border-bottom:0.5pt solid #d1d5db;">Respondido em</th>
      </tr>
    </thead>
    <tbody>
${cells}
    </tbody>
  </table>`;
}

function renderInstrumentASection(rows: LgpdPortabilityInstrumentoRow[]): string {
  return `<section>
  <h2>Instrumento A — Autoavaliação</h2>
  <p class="muted">Respostas do próprio titular à autoavaliação canônica (DOC 03 §7).</p>
  ${renderInstrumentoRows(rows, 'Nenhuma resposta registrada.')}
</section>`;
}

function renderInstrumentDSection(rows: LgpdPortabilityInstrumentoRow[]): string {
  return `<section>
  <h2>Instrumento D — Avaliação do líder direto</h2>
  <p class="muted">Respostas do próprio titular avaliando seu líder direto ou C-Level (DOC 03 §8).</p>
  ${renderInstrumentoRows(rows, 'Nenhuma resposta registrada.')}
</section>`;
}

function renderCopsoqSection(rows: LgpdPortabilityCopsoqRow[]): string {
  if (rows.length === 0) {
    return `<section>
  <h2>Radar NR-1 (COPSOQ)</h2>
  <p class="muted">Respostas do próprio titular ao Radar NR-1 (DOC 03 §11).</p>
  <p class="muted">Nenhuma resposta registrada.</p>
</section>`;
  }
  const cells = rows
    .map(
      (r) => `<tr>
      <td style="padding:1.5mm 3mm 1.5mm 0;">${r.cicloDbId}</td>
      <td style="padding:1.5mm 3mm; text-align:center;">${r.fator}</td>
      <td style="padding:1.5mm 3mm; text-align:center;">${r.itemIndex}</td>
      <td style="padding:1.5mm 0 1.5mm 3mm; text-align:right;">${r.valor}</td>
    </tr>`,
    )
    .join('\n');
  return `<section>
  <h2>Radar NR-1 (COPSOQ)</h2>
  <p class="muted">Respostas do próprio titular ao Radar NR-1 (DOC 03 §11).</p>
  <table style="width:100%; border-collapse:collapse; margin-top:2mm; font-size:9.5pt;">
    <thead>
      <tr>
        <th style="text-align:left; padding:1.5mm 3mm 1.5mm 0; border-bottom:0.5pt solid #d1d5db;">Ciclo</th>
        <th style="text-align:center; padding:1.5mm 3mm; border-bottom:0.5pt solid #d1d5db;">Fator</th>
        <th style="text-align:center; padding:1.5mm 3mm; border-bottom:0.5pt solid #d1d5db;">Item</th>
        <th style="text-align:right; padding:1.5mm 0 1.5mm 3mm; border-bottom:0.5pt solid #d1d5db;">Valor</th>
      </tr>
    </thead>
    <tbody>
${cells}
    </tbody>
  </table>
</section>`;
}

function renderIndividualProfileSection(rows: LgpdPortabilityIndividualProfileRow[]): string {
  if (rows.length === 0) {
    return `<section>
  <h2>Perfil Individual — respostas brutas</h2>
  <p class="muted">Respostas do próprio titular ao Perfil Individual (DOC 03 §10).</p>
  <p class="muted">Nenhuma resposta registrada.</p>
</section>`;
  }
  const tentativas = rows
    .map((r) => {
      const respostasStr =
        r.respostas === null || r.respostas === undefined
          ? '(sem dados)'
          : JSON.stringify(r.respostas, null, 2);
      return `<div style="margin-bottom:5mm; page-break-inside:avoid;">
    <h3>Tentativa ${r.tentativa}</h3>
    <p><strong>Status:</strong> ${escapeHtml(STATUS_IPA_ROTULO[r.status])}</p>
    <p><strong>Bloco atual:</strong> ${r.blocoAtual}</p>
    <p><strong>Enviado em:</strong> ${escapeHtml(r.enviadoEm ?? '(não enviado)')}</p>
    <p><strong>Respostas brutas:</strong></p>
    <pre style="background:#f3f4f6; padding:3mm; font-size:8.5pt; overflow-wrap:break-word; white-space:pre-wrap;">${escapeHtml(respostasStr)}</pre>
  </div>`;
    })
    .join('\n');
  return `<section>
  <h2>Perfil Individual — respostas brutas</h2>
  <p class="muted">Respostas do próprio titular ao Perfil Individual (DOC 03 §10).</p>
${tentativas}
</section>`;
}

/**
 * Renderiza o HTML canonico do PDF de portabilidade LGPD.
 * Deterministico bit-exact: mesmos inputs -> mesma saida byte a byte.
 */
export function renderLgpdPortabilityHTML(input: LgpdPortabilityTemplateInput): string {
  const preambulo = `<section>
  <h1>Portabilidade de dados pessoais</h1>
  <p class="muted">Documento canônico emitido em atendimento ao direito de portabilidade previsto na Lei Geral de Proteção de Dados Pessoais (LGPD, Lei nº 13.709/2018). Contém os dados cadastrais do titular e as respostas fornecidas pelo próprio titular aos instrumentos de avaliação da plataforma. Avaliações realizadas por terceiros sobre o titular não integram o escopo deste documento.</p>
</section>`;

  const bodyHtml = [
    preambulo,
    renderCadastraisSection(input.cadastrais),
    renderInstrumentASection(input.instrumentA),
    renderInstrumentDSection(input.instrumentD),
    renderCopsoqSection(input.copsoq),
    renderIndividualProfileSection(input.individualProfile),
  ].join('\n\n');

  return renderLayoutBase({
    title: `Portabilidade LGPD — ${input.cadastrais.nome}`,
    company: input.company,
    bodyHtml,
    footerCenter: `Gerado em ${input.generatedAtDate}`,
  });
}
