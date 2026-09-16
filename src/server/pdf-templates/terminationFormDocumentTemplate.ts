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

/** Le o tipo da query string; `null` quando invalido. */
export function parseDocumentoPadraoTipo(raw: string | null): DocumentoPadraoTipo | null {
  return DOCUMENTO_PADRAO_TIPOS.find((t) => t === raw) ?? null;
}

const CSS = `
  .doc-desligamento h2 { font-size: 13pt; margin: 0 0 4mm 0; }
  .doc-desligamento .descricao { font-size: 9.5pt; color: #4b5563; margin-bottom: 6mm; }
  .doc-desligamento .pergunta { margin-bottom: 5mm; page-break-inside: avoid; }
  .doc-desligamento .rotulo { font-weight: 600; font-size: 10pt; margin-bottom: 2mm; }
  .doc-desligamento .ajuda { font-size: 9pt; color: #6b7280; margin-bottom: 2mm; }
  .doc-desligamento ul { list-style: none; padding: 0; margin: 0; }
  .doc-desligamento li { font-size: 9.5pt; margin-bottom: 1mm; }
  .doc-desligamento .linhas { border-bottom: 0.5pt solid #9ca3af; height: 7mm; }
`;

function opcoes(labels: readonly string[]): string {
  const itens = labels.map((l) => `<li>&#9744; ${escapeHtml(l)}</li>`).join('');
  return `<ul>${itens}</ul>`;
}

function pergunta(rotulo: string, corpo: string, ajuda?: string): string {
  const ajudaHtml = ajuda === undefined ? '' : `<div class="ajuda">${escapeHtml(ajuda)}</div>`;
  const rotuloHtml = `<div class="rotulo">${escapeHtml(rotulo)}</div>`;
  return `<div class="pergunta">${rotuloHtml}${ajudaHtml}${corpo}</div>`;
}

function linhas(qtd: number): string {
  return Array.from({ length: qtd }, () => '<div class="linhas"></div>').join('');
}

function escala(): string {
  return opcoes(['1', '2', '3', '4', '5']);
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
  return (
    `<h2>${escapeHtml(FORMULARIO_A_TITULO)}</h2>` +
    `<div class="descricao">${escapeHtml(FORMULARIO_A_DESCRICAO)}</div>` +
    partes.join('')
  );
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
  return (
    `<h2>${escapeHtml(FORMULARIO_B_TITULO)}</h2>` +
    `<div class="descricao">${escapeHtml(FORMULARIO_B_DESCRICAO)}</div>` +
    partes.join('')
  );
}

/** Corpo HTML do documento (visualizacao na pagina e miolo do PDF). */
export function renderDocumentoPadraoBody(tipo: DocumentoPadraoTipo): string {
  const corpo = tipo === 'roteiro-voluntario' ? corpoVoluntario() : corpoInvoluntario();
  return `<style>${CSS}</style><div class="doc-desligamento">${corpo}</div>`;
}

/** HTML completo do PDF (layout base com cabecalho da empresa). */
export function renderDocumentoPadraoPdfHtml(
  tipo: DocumentoPadraoTipo,
  company: LayoutBaseCompany,
  geradoEmLabel: string,
): string {
  return renderLayoutBase({
    title: DOCUMENTO_PADRAO_TITULOS[tipo],
    company,
    bodyHtml: renderDocumentoPadraoBody(tipo),
    footerCenter: geradoEmLabel,
  });
}

/** Nome do arquivo baixado. */
export function composeDocumentoPadraoFilename(tipo: DocumentoPadraoTipo): string {
  return tipo === 'roteiro-voluntario'
    ? 'roteiro_entrevista_desligamento_voluntario.pdf'
    : 'formulario_justificativa_desligamento_involuntario.pdf';
}
