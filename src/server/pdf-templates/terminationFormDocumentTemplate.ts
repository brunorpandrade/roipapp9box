// ROIP APP 9BOX — documentos padrao de desligamento (especificacao
// "Turnover e desligamento" §6, ME-fila6 D2).
//
// Estrutura fixa dos Formularios A e B, em branco (nao sao dados de uma
// pessoa). O mesmo HTML de corpo alimenta a visualizacao na pagina de
// turnover e o PDF on-the-fly (sem cache), mesmo padrao dos PDFs sem IA da
// Central de Relatorios (`layoutBase` + `pdfRenderer`).
//
// Deterministico: mesma entrada gera o mesmo HTML. Todo texto vem de
// `src/lib/shared/terminationForms.ts` e passa por `escapeHtml`.
//
// ME-1.10-CC079-DIS-E — lapidacao visual estrutural (item [1.10]):
// - O CORPO (`renderDocumentoPadraoBody`, compartilhado com a pagina
//   /turnover em React via `dangerouslySetInnerHTML`) ganha cards de
//   pergunta `.pergunta-card` com borda lateral teal. As classes vivem
//   no CSS LOCAL (constante `CSS`), que viaja com o corpo nas duas
//   superficies — o `LAYOUT_BASE_CSS` nao chega ao React.
// - O `<h2>` de titulo sai do corpo: na web o modal ja exibe o titulo
//   proprio; no PDF o cabecalho editorial do wrapper o exibe. A
//   descricao do documento permanece no corpo (`.doc-desc`), util em
//   ambas as superficies.
// - O cabecalho editorial canonico (badge + titulo + divisoria teal,
//   `.doc-head-compact`) e injetado SO no wrapper do PDF
//   (`renderDocumentoPadraoPdfHtml`), reservando espaco para o logo no
//   canto (fim da colisao logo x titulo observada no PDF antigo).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import {
  CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_VALUES,
  DESTINO_SAIDA_VALUES,
  MOTIVO_SAIDA_VOLUNTARIA_VALUES,
  RESPOSTA_SIM_NAO_NA_VALUES,
  RESPOSTA_SIM_NAO_TALVEZ_VALUES,
} from '../../db/schema/enums';
import {
  CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_LABELS,
  DESTINO_SAIDA_LABELS,
  FORMULARIO_A_DESCRICAO,
  FORMULARIO_A_TITULO,
  FORMULARIO_B_DESCRICAO,
  FORMULARIO_B_TITULO,
  MOTIVO_SAIDA_VOLUNTARIA_LABELS,
  NOTAS_VOLUNTARIO,
  ORIENTACAO_JUSTIFICATIVA_INVOLUNTARIO,
  PERGUNTAS_A,
  PERGUNTAS_B,
  RESPOSTA_SIM_NAO_NA_LABELS,
  RESPOSTA_SIM_NAO_TALVEZ_LABELS,
} from '../../lib/shared/terminationForms';

import { escapeHtml, renderLayoutBase, type LayoutBaseCompany } from './layoutBase';

/** Documentos padrao disponiveis. */
export const DOCUMENTO_PADRAO_TIPOS = ['roteiro-voluntario', 'formulario-involuntario'] as const;
export type DocumentoPadraoTipo = (typeof DOCUMENTO_PADRAO_TIPOS)[number];

/** Titulo exibido no botao, no modal e no PDF. */
export const DOCUMENTO_PADRAO_TITULOS: Record<DocumentoPadraoTipo, string> = {
  'roteiro-voluntario': `Roteiro — ${FORMULARIO_A_TITULO}`,
  'formulario-involuntario': `Formulário — ${FORMULARIO_B_TITULO}`,
};

/** Titulo "limpo" do documento (sem o prefixo Roteiro/Formulario), usado
 * no cabecalho editorial do PDF. */
const DOCUMENTO_PADRAO_TITULO_LIMPO: Record<DocumentoPadraoTipo, string> = {
  'roteiro-voluntario': FORMULARIO_A_TITULO,
  'formulario-involuntario': FORMULARIO_B_TITULO,
};

/** Rotulo do badge editorial do cabecalho do PDF, por tipo. */
const DOCUMENTO_PADRAO_BADGE: Record<DocumentoPadraoTipo, string> = {
  'roteiro-voluntario': 'RH · Desligamento voluntário',
  'formulario-involuntario': 'RH · Desligamento involuntário',
};

/** Le o tipo da query string; `null` quando invalido. */
export function parseDocumentoPadraoTipo(raw: string | null): DocumentoPadraoTipo | null {
  return DOCUMENTO_PADRAO_TIPOS.find((t) => t === raw) ?? null;
}

// CSS LOCAL do corpo — viaja com `renderDocumentoPadraoBody` tanto no PDF
// (dentro do layoutBase) quanto na pagina /turnover (React). Por isso as
// classes dos cards de pergunta ficam aqui, e nao no LAYOUT_BASE_CSS.
const CSS = `
  .doc-desligamento .doc-desc {
    font-size: 9.5pt;
    color: #4b5563;
    line-height: 1.5;
    margin: 0 0 6mm;
  }
  .doc-desligamento .pergunta-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-left: 3px solid #14b8a6;
    border-radius: 0 8pt 8pt 0;
    padding: 4mm 5mm;
    margin-bottom: 3.5mm;
    page-break-inside: avoid;
  }
  .doc-desligamento .rotulo {
    font-weight: 700;
    font-size: 10.5pt;
    color: #111827;
    margin-bottom: 1.5mm;
  }
  .doc-desligamento .ajuda {
    font-size: 8.5pt;
    color: #6b7280;
    margin-bottom: 2.5mm;
    line-height: 1.4;
  }
  .doc-desligamento ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .doc-desligamento li {
    font-size: 9.5pt;
    color: #374151;
    margin-bottom: 1.3mm;
  }
  .doc-desligamento .linhas {
    border-bottom: 0.5pt solid #9ca3af;
    height: 7mm;
  }
  .doc-desligamento .escala {
    display: flex;
    gap: 8mm;
    font-size: 9.5pt;
    color: #374151;
  }
`;

function opcoes(labels: readonly string[]): string {
  const itens = labels.map((l) => `<li>&#9744; ${escapeHtml(l)}</li>`).join('');
  return `<ul>${itens}</ul>`;
}

function pergunta(rotulo: string, corpo: string, ajuda?: string): string {
  const ajudaHtml = ajuda === undefined ? '' : `<div class="ajuda">${escapeHtml(ajuda)}</div>`;
  const rotuloHtml = `<div class="rotulo">${escapeHtml(rotulo)}</div>`;
  return `<div class="pergunta-card">${rotuloHtml}${ajudaHtml}${corpo}</div>`;
}

function linhas(qtd: number): string {
  return Array.from({ length: qtd }, () => '<div class="linhas"></div>').join('');
}

// ME-fila6 D3 — escala 1-5 numa linha so (antes: 5 linhas por pergunta).
function escala(): string {
  const itens = ['1', '2', '3', '4', '5'].map((n) => `<span>&#9744; ${n}</span>`).join('');
  return `<div class="escala">${itens}</div>`;
}

function corpoVoluntario(): string {
  const partes = [
    pergunta(
      PERGUNTAS_A.motivoPrincipal,
      opcoes(MOTIVO_SAIDA_VOLUNTARIA_VALUES.map((m) => MOTIVO_SAIDA_VOLUNTARIA_LABELS[m])),
    ),
    pergunta(
      PERGUNTAS_A.motivosSecundarios,
      opcoes(MOTIVO_SAIDA_VOLUNTARIA_VALUES.map((m) => MOTIVO_SAIDA_VOLUNTARIA_LABELS[m])),
    ),
    ...NOTAS_VOLUNTARIO.map((n) => pergunta(n.label, escala(), PERGUNTAS_A.notasExtremos)),
    pergunta(
      PERGUNTAS_A.voltariaTrabalhar,
      opcoes(RESPOSTA_SIM_NAO_TALVEZ_VALUES.map((r) => RESPOSTA_SIM_NAO_TALVEZ_LABELS[r])),
    ),
    pergunta(
      PERGUNTAS_A.recomendariaEmpresa,
      opcoes(RESPOSTA_SIM_NAO_TALVEZ_VALUES.map((r) => RESPOSTA_SIM_NAO_TALVEZ_LABELS[r])),
    ),
    pergunta(PERGUNTAS_A.destino, opcoes(DESTINO_SAIDA_VALUES.map((d) => DESTINO_SAIDA_LABELS[d]))),
    pergunta(PERGUNTAS_A.oQuePoderiaReter, linhas(5), 'Entre 100 e 500 caracteres.'),
    pergunta(PERGUNTAS_A.comentariosAdicionais, linhas(4), 'Até 500 caracteres.'),
  ];
  return `<div class="doc-desc">${escapeHtml(FORMULARIO_A_DESCRICAO)}</div>` + partes.join('');
}

function corpoInvoluntario(): string {
  const partes = [
    pergunta(
      PERGUNTAS_B.categoria,
      opcoes(
        CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_VALUES.map(
          (c) => CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_LABELS[c],
        ),
      ),
    ),
    pergunta(
      PERGUNTAS_B.houveFeedbackFormal,
      opcoes(RESPOSTA_SIM_NAO_NA_VALUES.map((r) => RESPOSTA_SIM_NAO_NA_LABELS[r])),
      PERGUNTAS_B.houveFeedbackFormalAjuda,
    ),
    pergunta(PERGUNTAS_B.nivelDocumentacao, escala(), PERGUNTAS_B.nivelDocumentacaoExtremos),
    pergunta(
      PERGUNTAS_B.justificativa,
      linhas(5),
      `${ORIENTACAO_JUSTIFICATIVA_INVOLUNTARIO} Entre 100 e 500 caracteres.`,
    ),
    pergunta(PERGUNTAS_B.necessidadeReposicao, opcoes(['Sim', 'Não'])),
  ];
  return `<div class="doc-desc">${escapeHtml(FORMULARIO_B_DESCRICAO)}</div>` + partes.join('');
}

/** Corpo HTML do documento (visualizacao na pagina e miolo do PDF). */
export function renderDocumentoPadraoBody(tipo: DocumentoPadraoTipo): string {
  const corpo = tipo === 'roteiro-voluntario' ? corpoVoluntario() : corpoInvoluntario();
  return `<style>${CSS}</style><div class="doc-desligamento">${corpo}</div>`;
}

/**
 * Cabecalho editorial canonico do PDF (so o wrapper usa; nao vai ao
 * corpo compartilhado). Badge + titulo + divisoria teal via
 * `.doc-head-compact` do LAYOUT_BASE_CSS, que reserva espaco para o logo.
 */
function renderDocumentoPadraoHeader(tipo: DocumentoPadraoTipo): string {
  const badge = DOCUMENTO_PADRAO_BADGE[tipo];
  const titulo = DOCUMENTO_PADRAO_TITULO_LIMPO[tipo];
  return `<div class="doc-head-compact">
  <div class="doc-head-badge">${escapeHtml(badge)}</div>
  <div class="doc-head-title">${escapeHtml(titulo)}</div>
</div>`;
}

/** HTML completo do PDF (layout base com cabecalho da empresa). */
export function renderDocumentoPadraoPdfHtml(
  tipo: DocumentoPadraoTipo,
  company: LayoutBaseCompany,
  geradoEmLabel: string,
): string {
  const bodyHtml = renderDocumentoPadraoHeader(tipo) + renderDocumentoPadraoBody(tipo);
  return renderLayoutBase({
    title: DOCUMENTO_PADRAO_TITULOS[tipo],
    company,
    bodyHtml,
    footerCenter: geradoEmLabel,
  });
}

/** Nome do arquivo baixado. */
export function composeDocumentoPadraoFilename(tipo: DocumentoPadraoTipo): string {
  return tipo === 'roteiro-voluntario'
    ? 'roteiro_entrevista_desligamento_voluntario.pdf'
    : 'formulario_justificativa_desligamento_involuntario.pdf';
}
