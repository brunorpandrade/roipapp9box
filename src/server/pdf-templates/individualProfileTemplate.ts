/* eslint-disable @stylistic/max-len -- template HTML canonico com tags e literais que perdem clareza quando quebrados */
// ROIP APP 9BOX — template PDF Perfil Individual (ME-050/51, S257).
//
// Renderizacao HTML deterministica do relatorio expandido do Perfil
// Individual (DOC 03 §10.10, DOC 04 §3.8 + §3.9). Consumido por
// `individualProfile.generatePDF`; convertido em PDF pela toolchain
// `pdfRenderer.ts` (Puppeteer via `puppeteer-core`).
//
// Regime canonico (§10.10):
// - Conteudo IDENTICO a versao expandida do relatorio — o PDF nao
//   introduz texto novo. Apenas troca de formato de entrega.
// - Layout editorial via `layoutBase.ts` (A4 retrato, margens 20mm).
// - Painel visual dos subvetores em barras horizontais.
// - Tamanho de referencia: 4 a 6 paginas.
// - Nome canonico do arquivo:
//   `Perfil_Individual_[Nome_do_Colaborador]_[YYYY-MM-DD].pdf`.
//
// Determinismo canonico: nenhuma leitura de `Date.now()` interna. A
// data de geracao viaja no input (`generatedAt`) e vai ao rodape.

import { escapeHtml, type LayoutBaseCompany, renderLayoutBase } from './layoutBase';

/**
 * Estrutura canonica do JSON expandido conforme DOC 04 §3.8 + §4
 * (Secao 11 do system prompt). Blocos condicionais aparecem como
 * `null` quando a condicao nao e atendida — nunca sao omitidos.
 */
export interface IndividualProfileExpandidoJson {
  sintese_executiva: string;
  como_age: string;
  quem_e: string;
  o_que_move: string;
  como_reage_sob_pressao: string;
  naturalmente_excelente: string;
  recomendacoes_executivas: string[];
  confiabilidade: 'alta' | 'moderada';
  natural_vs_adaptado?: string | null;
  padrao_paradoxal?: string | null;
  dimensoes_com_hedge?: string[] | null;
}

/** Subvetor: rotulo canonico + valor 0-100 (DOC 03 §10.8). */
export interface IndividualProfileSubvector {
  bloco: 'Postura' | 'Estrutura' | 'Motor' | 'Equilibrio' | 'Assinatura';
  rotulo: string;
  valor: number;
}

/** Identificacao canonica do colaborador (DOC 04 §8.1 identificacao). */
export interface IndividualProfileIdentificacao {
  nome: string;
  cargo: string;
  nivelHierarquico: 'operacional' | 'tatico' | 'estrategico';
  departamento: string;
  liderDireto: string;
  dataAplicacao: string; // YYYY-MM-DD
}

/** Input canonico do template. */
export interface IndividualProfileTemplateInput {
  company: LayoutBaseCompany;
  identificacao: IndividualProfileIdentificacao;
  expandido: IndividualProfileExpandidoJson;
  subvetores: IndividualProfileSubvector[];
  /** Data de geracao para o rodape. `YYYY-MM-DD`. */
  generatedAtDate: string;
}

const NIVEL_HIERARQUICO_ROTULO: Record<IndividualProfileIdentificacao['nivelHierarquico'], string> =
  {
    operacional: 'Operacional',
    tatico: 'Tático',
    estrategico: 'Estratégico',
  };

/**
 * Normalizacao canonica do nome do colaborador para o filename
 * (DOC 03 §10.10). Regras: espacos -> underscore; remove acentos;
 * remove pontuacao; nunca vazio.
 */
export function normalizeColaboradorNameForFilename(nome: string): string {
  const semAcento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const semEspecial = semAcento.replace(/[^A-Za-z0-9\s_-]/g, '');
  const comUnderscore = semEspecial.replace(/\s+/g, '_').replace(/_+/g, '_');
  const trim = comUnderscore.replace(/^_+|_+$/g, '');
  return trim.length > 0 ? trim : 'Colaborador';
}

/**
 * Compoe o nome canonico do arquivo PDF conforme §10.10.
 */
export function composeIndividualProfileFilename(nome: string, generatedAtDate: string): string {
  const nomeNorm = normalizeColaboradorNameForFilename(nome);
  return `Perfil_Individual_${nomeNorm}_${generatedAtDate}.pdf`;
}

function renderIdentificacaoSection(id: IndividualProfileIdentificacao): string {
  return `<section>
  <h2>Identificação</h2>
  <p><strong>Nome:</strong> ${escapeHtml(id.nome)}</p>
  <p><strong>Cargo:</strong> ${escapeHtml(id.cargo)}</p>
  <p><strong>Nível hierárquico:</strong> ${escapeHtml(NIVEL_HIERARQUICO_ROTULO[id.nivelHierarquico])}</p>
  <p><strong>Departamento:</strong> ${escapeHtml(id.departamento)}</p>
  <p><strong>Líder direto:</strong> ${escapeHtml(id.liderDireto)}</p>
  <p><strong>Data de aplicação:</strong> ${escapeHtml(id.dataAplicacao)}</p>
</section>`;
}

function renderTextSection(title: string, text: string): string {
  return `<section>
  <h2>${escapeHtml(title)}</h2>
  <p>${escapeHtml(text)}</p>
</section>`;
}

function renderSubvectorPanel(subvetores: IndividualProfileSubvector[]): string {
  const grouped: Record<string, IndividualProfileSubvector[]> = {
    Postura: [],
    Estrutura: [],
    Motor: [],
    Equilibrio: [],
    Assinatura: [],
  };
  for (const s of subvetores) grouped[s.bloco]?.push(s);

  const blocks = Object.entries(grouped)
    .filter(([, arr]) => arr.length > 0)
    .map(([bloco, arr]) => {
      const rows = arr
        .map((s) => {
          const pct = Math.max(0, Math.min(100, s.valor));
          return `<tr>
      <td style="width:35%; padding:2mm 3mm 2mm 0;">${escapeHtml(s.rotulo)}</td>
      <td style="width:55%;">
        <div style="background:#e5e7eb; height:4mm; border-radius:1mm;">
          <div style="background:#111827; width:${pct.toFixed(1)}%; height:4mm; border-radius:1mm;"></div>
        </div>
      </td>
      <td style="width:10%; text-align:right; padding:2mm 0 2mm 3mm;">${pct.toFixed(1)}</td>
    </tr>`;
        })
        .join('\n');
      return `<h3>${escapeHtml(bloco)}</h3>
<table style="width:100%; border-collapse:collapse; margin-bottom:4mm;">
${rows}
</table>`;
    })
    .join('\n');

  return `<section class="page-break">
  <h2>Painel dos subvetores</h2>
  ${blocks}
</section>`;
}

function renderRecomendacoes(items: string[]): string {
  const lis = items.map((r) => `<li>${escapeHtml(r)}</li>`).join('\n');
  return `<section>
  <h2>Recomendações executivas</h2>
  <ul>
${lis}
  </ul>
</section>`;
}

function renderCondicionais(exp: IndividualProfileExpandidoJson): string {
  const blocks: string[] = [];
  if (exp.natural_vs_adaptado) {
    blocks.push(renderTextSection('Natural vs. adaptado', exp.natural_vs_adaptado));
  }
  if (exp.padrao_paradoxal) {
    blocks.push(renderTextSection('Padrão paradoxal', exp.padrao_paradoxal));
  }
  if (exp.dimensoes_com_hedge && exp.dimensoes_com_hedge.length > 0) {
    const lis = exp.dimensoes_com_hedge.map((h) => `<li>${escapeHtml(h)}</li>`).join('\n');
    blocks.push(`<section>
  <h2>Dimensões com ressalva</h2>
  <ul>
${lis}
  </ul>
</section>`);
  }
  return blocks.join('\n');
}

/**
 * Renderiza o HTML canonico do Perfil Individual expandido em PDF.
 * Deterministico: mesmos inputs -> mesma saida byte a byte.
 */
export function renderIndividualProfileHTML(input: IndividualProfileTemplateInput): string {
  const bodyHtml = [
    `<h1>Perfil Individual</h1>`,
    renderIdentificacaoSection(input.identificacao),
    renderTextSection('Síntese executiva', input.expandido.sintese_executiva),
    renderTextSection('Como age', input.expandido.como_age),
    renderTextSection('Quem é', input.expandido.quem_e),
    renderTextSection('O que move', input.expandido.o_que_move),
    renderTextSection('Como reage sob pressão', input.expandido.como_reage_sob_pressao),
    renderTextSection('Naturalmente excelente', input.expandido.naturalmente_excelente),
    renderSubvectorPanel(input.subvetores),
    renderRecomendacoes(input.expandido.recomendacoes_executivas),
    renderCondicionais(input.expandido),
    `<p class="muted"><strong>Confiabilidade:</strong> ${escapeHtml(input.expandido.confiabilidade)}</p>`,
  ].join('\n\n');

  return renderLayoutBase({
    title: `Perfil Individual — ${input.identificacao.nome}`,
    company: input.company,
    bodyHtml,
    footerCenter: `Gerado em ${input.generatedAtDate}`,
  });
}
