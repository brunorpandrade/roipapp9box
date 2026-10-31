// ROIP APP 9BOX — helpers canonicos de projecao SVG para PDFs rich (ME-1.3c).
//
// Funcoes puras compartilhadas pelos templates `snapshot9BoxTemplate.ts`
// e `nr1Template.ts` (ME-1.3c) e por `boardDeckTemplate.ts` /
// `executiveReportTemplate.ts` (ME-1.3d) que renderizam SVG inline em
// PDFs via Puppeteer.
//
// Determinismo canonico (DOC 03 §11.12, §13.7): mesmos inputs geram
// mesma saida byte-exact. Nenhuma funcao aqui usa `Date.now()`,
// `Math.random()`, variavel de ambiente ou campo externo. Scores fora
// do dominio 0-100 sao clamp antes da projecao (robustez canonica).
//
// Fonte visual canonica das geometrias: mockup
// `relatorio_radar_nr1_v1.html` paginas 4 e 5 (radar 8 eixos com
// viewBox 400x380, centro 200x200, raio maximo 140) + mockup
// `dashboard_individual_v7.html` (grid 9-Box com bolhas).

// ============================================================
// Projecao polar do Radar NR-1 (8 eixos)
// ============================================================

export interface RadarPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Projeta um ponto polar canonico no SVG do Radar NR-1 (DOC 03 §11.12).
 *
 * Formula canonica:
 * - angulo em radianos: `-PI/2 + (2*PI * idx / totalEixos)` (comeca no
 *   topo, sentido horario — bit-exact ao mockup
 *   `relatorio_radar_nr1_v1.html`);
 * - raio: `(score / 100) * maxRadius` (linear, origem no centro);
 * - x: `cx + raio * cos(angulo)`;
 * - y: `cy + raio * sin(angulo)`.
 *
 * Score clamp 0-100. idx validado 0 <= idx < totalEixos (lanca
 * `RangeError` canonico fora do dominio).
 */
export function projectRadarPoint(
  idx: number,
  totalEixos: number,
  score: number,
  cx: number,
  cy: number,
  maxRadius: number,
): RadarPoint {
  if (!Number.isInteger(idx) || idx < 0 || idx >= totalEixos) {
    throw new RangeError(`projectRadarPoint: idx fora do domínio [0, ${totalEixos})`);
  }
  if (!Number.isInteger(totalEixos) || totalEixos <= 0) {
    throw new RangeError('projectRadarPoint: totalEixos deve ser inteiro positivo');
  }
  const scoreClamp = Math.max(0, Math.min(100, score));
  const angle = -Math.PI / 2 + (2 * Math.PI * idx) / totalEixos;
  const raio = (scoreClamp / 100) * maxRadius;
  const x = cx + raio * Math.cos(angle);
  const y = cy + raio * Math.sin(angle);
  return { x, y };
}

/**
 * Projeta um conjunto de scores canonicos como string `points` para
 * `<polygon>` SVG. Encapsula a projecao bit-exact de todos os eixos.
 */
export function projectRadarPolygon(
  scores: readonly number[],
  cx: number,
  cy: number,
  maxRadius: number,
): string {
  if (scores.length === 0) {
    throw new RangeError('projectRadarPolygon: scores vazio');
  }
  return scores
    .map((score, idx) => {
      const p = projectRadarPoint(idx, scores.length, score, cx, cy, maxRadius);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(' ');
}

/**
 * Projeta a grade octogonal canonica do Radar NR-1 — `nRings` aneis
 * concentricos + `nEixos` linhas radiais. Replica bit-exact o padrao
 * do mockup `relatorio_radar_nr1_v1.html` (pagina 4) com 4 aneis.
 *
 * Retorna fragmento SVG canonico pronto para injecao no template
 * (fill="none", stroke do grid). O template adiciona envelope <svg>
 * e cores finais.
 */
export function renderRadarGridSvg(
  nEixos: number,
  cx: number,
  cy: number,
  maxRadius: number,
  nRings: number,
  gridStroke: string,
): string {
  if (!Number.isInteger(nEixos) || nEixos < 3) {
    throw new RangeError('renderRadarGridSvg: nEixos deve ser inteiro >= 3');
  }
  if (!Number.isInteger(nRings) || nRings < 1) {
    throw new RangeError('renderRadarGridSvg: nRings deve ser inteiro >= 1');
  }
  const ringPolygons: string[] = [];
  for (let ring = 1; ring <= nRings; ring++) {
    const ringScore = (ring / nRings) * 100;
    const pts = projectRadarPolygon(new Array(nEixos).fill(ringScore), cx, cy, maxRadius);
    ringPolygons.push(`<polygon points="${pts}" />`);
  }
  const radialLines: string[] = [];
  for (let i = 0; i < nEixos; i++) {
    const outer = projectRadarPoint(i, nEixos, 100, cx, cy, maxRadius);
    radialLines.push(
      `<line x1="${cx}" y1="${cy}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" />`,
    );
  }
  return [
    `<g fill="none" stroke="${gridStroke}" stroke-width="1">`,
    ...ringPolygons,
    '</g>',
    `<g stroke="${gridStroke}" stroke-width="1">`,
    ...radialLines,
    '</g>',
  ].join('\n');
}

// ME-1.3c CC079-v3: projecao cartesiana de bolha retirada por decisao
// canonica — 9-Box agora exibe apenas o contador por quadrante, sem
// bolhas de colaboradores (padrao visual canonico dos dashboards
// agregados). A funcao `projectNineBoxBubble` canonica foi removida
// com todos os testes correspondentes conforme RV-13 (zero codigo
// morto). Se um consumer futuro precisar, basta restaurar do git
// (commits `6c3da51` e `6b3559a`).
