// ROIP APP 9BOX — card canonico do Bloco Clima para dashboards
// agregados (ME-B2-01b Fase 2 — UI).
//
// Layout canonico adaptado do modelo Pulses:
//   - Topo esquerdo: gauge donut com nota geral (0-10) na paleta
//     canonica verde/amarelo/vermelho §2.4 do DOC 05 (climateLow/Mid/
//     High), tons suaves.
//   - Topo direito: timeline canonica dos ultimos 4 trimestres —
//     barras claras (fill com opacidade reduzida) + linha conectando
//     os topos para dar sentido de movimento canonico. Eixo Y fixo
//     0-10 canonico.
//   - Base: 4 dimensoes ROIP (Engajamento, Desenvolvimento,
//     Pertencimento, Realizacao) em barras horizontais com nota 0-10.
//
// Guard C-level acessoTotal (Q1=A): aplicado no caller (page.tsx) —
// quando ausente, o card nao e renderizado.
//
// Cascata silenciosa (§9.6 Q4=A1): o card recebe o payload canonico
// ja resolvido pelo loader; quando `cascata.notaAgregacao !== null`
// exibe badge canonica "Agregado do departamento" ou "Agregado da
// empresa" para transparencia canonica da agregacao aplicada.
//
// Server-safe (sem 'use client'): SVG inline + Tailwind pelo COLORS
// tokens — zero JS no cliente. Padrao canonico herdado dos cards
// existentes (TurnoverCard, IqlLiderCard).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import type { BlocoClimaDashboardData } from '../../../../../server/services/blocoClimaDashboard';
import { CARD, LABEL, fmt } from './shared';

// Paleta canonica §2.4 escala Clima:
//   - 0.0-5.9 vermelho (climateLow)
//   - 6.0-7.4 amarelo (climateMid)
//   - 7.5-10 verde (climateHigh)
const SCALE = COLORS.scoreScale;

function corClima(nota: number | null): string {
  if (nota === null) return COLORS.text.quaternary;
  if (nota >= 7.5) return SCALE.climateHigh;
  if (nota >= 6.0) return SCALE.climateMid;
  return SCALE.climateLow;
}

/**
 * Converte um hex `#RRGGBB` para RGBA com alfa canonico — usado nas
 * barras claras da timeline (fill suave, mesma matiz do semaforo).
 */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Rotulo canonico do trimestre no formato curto da timeline
 * ("2027Q1" → "Q1/27"). Preserva comparabilidade canonica.
 */
function labelTrimestre(trimestre: string): string {
  const match = trimestre.match(/^(\d{4})-?Q([1-4])$/);
  if (!match) return trimestre;
  const [, ano, q] = match;
  return `Q${q}/${ano!.slice(2)}`;
}

/**
 * Gauge donut canonico — SVG inline server-safe. Arco 270 graus
 * (-135° a +135°) com nota 0-10 ao centro na cor canonica da faixa.
 */
function GaugeDonut(props: { readonly nota: number | null }): JSX.Element {
  const nota = props.nota;
  const cor = corClima(nota);
  // Arco canonico: 270° (3/4 de volta), raio 50, stroke 10.
  const raio = 50;
  const circunferencia = 2 * Math.PI * raio;
  const arcLength = circunferencia * (270 / 360);
  const notaCapped = nota === null ? 0 : Math.max(0, Math.min(10, nota));
  const preenchimento = arcLength * (notaCapped / 10);
  const vazio = arcLength - preenchimento;
  const textoCentral = nota === null ? '—' : fmt(nota, 1);
  return (
    <svg
      viewBox="0 0 140 140"
      width="140"
      height="140"
      role="img"
      aria-label="Score do Bloco Clima"
    >
      <circle
        cx="70"
        cy="70"
        r={raio}
        fill="none"
        stroke={COLORS.border.default}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${arcLength} ${circunferencia}`}
        transform="rotate(135 70 70)"
      />
      <circle
        cx="70"
        cy="70"
        r={raio}
        fill="none"
        stroke={cor}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${preenchimento} ${vazio + circunferencia}`}
        transform="rotate(135 70 70)"
      />
      <text
        x="70"
        y="76"
        textAnchor="middle"
        fontSize="30"
        fontWeight="700"
        fill={cor}
        fontFamily="system-ui, sans-serif"
      >
        {textoCentral}
      </text>
      <text
        x="70"
        y="98"
        textAnchor="middle"
        fontSize="10"
        fill={COLORS.text.tertiary}
        fontFamily="system-ui, sans-serif"
      >
        0-10
      </text>
    </svg>
  );
}

/**
 * Timeline canonica barras + linha. Barras claras (fill com alfa 0.25
 * canonico) coloridas pela faixa do semaforo, linha conectando os
 * topos (sentido de movimento). Eixo Y fixo 0-10 canonico.
 */
function TimelineBarrasLinha(props: {
  readonly historico: readonly { trimestre: string; notaClima: number | null }[];
}): JSX.Element {
  const h = props.historico;
  if (h.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 140,
          color: COLORS.text.tertiary,
          fontSize: 12,
        }}
      >
        Sem histórico canônico.
      </div>
    );
  }
  // SVG canvas canonico: 320x140, padding bottom 24 (eixo X labels).
  const W = 320;
  const H = 140;
  const padTop = 10;
  const padBot = 24;
  const padLeft = 24;
  const padRight = 10;
  const graficoW = W - padLeft - padRight;
  const graficoH = H - padTop - padBot;
  const barW = (graficoW / h.length) * 0.55;
  const step = graficoW / h.length;
  // Posicao Y canonica: y = padTop + graficoH * (1 - nota/10)
  const yFor = (nota: number): number => padTop + graficoH * (1 - nota / 10);
  const xCentro = (i: number): number => padLeft + step * i + step / 2;
  // Pontos canonicos da linha — ignora valores null.
  const pontos: { x: number; y: number; nota: number }[] = [];
  for (let i = 0; i < h.length; i++) {
    const nota = h[i]!.notaClima;
    if (nota === null) continue;
    pontos.push({ x: xCentro(i), y: yFor(nota), nota });
  }
  const linhaPath = pontos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Histórico canônico"
    >
      {/* Grid canonico 0-10 — 5 linhas horizontais em 0, 2.5, 5, 7.5, 10 */}
      {[0, 2.5, 5, 7.5, 10].map((marca) => {
        const y = yFor(marca);
        return (
          <g key={marca}>
            <line
              x1={padLeft}
              y1={y}
              x2={W - padRight}
              y2={y}
              stroke={COLORS.border.divider}
              strokeWidth={1}
            />
            <text
              x={padLeft - 4}
              y={y + 3}
              textAnchor="end"
              fontSize="8"
              fill={COLORS.text.quaternary}
              fontFamily="system-ui, sans-serif"
            >
              {marca}
            </text>
          </g>
        );
      })}
      {/* Barras claras canonicas — fill com alfa suave, cor do semaforo */}
      {h.map((ponto, i) => {
        if (ponto.notaClima === null) return null;
        const cor = corClima(ponto.notaClima);
        const y = yFor(ponto.notaClima);
        const alturaBarra = padTop + graficoH - y;
        const x = xCentro(i) - barW / 2;
        return (
          <rect
            key={ponto.trimestre}
            x={x}
            y={y}
            width={barW}
            height={alturaBarra}
            fill={hexToRgba(cor, 0.22)}
            stroke={hexToRgba(cor, 0.5)}
            strokeWidth={1}
            rx={2}
          />
        );
      })}
      {/* Linha canonica conectando os topos — sentido de movimento */}
      {pontos.length > 1 ? (
        <path
          d={linhaPath}
          fill="none"
          stroke={COLORS.accent.teal}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {/* Pontos canonicos nos topos — reforcam o sentido de movimento */}
      {pontos.map((p, i) => (
        <circle
          key={`pt-${i}`}
          cx={p.x}
          cy={p.y}
          r={3}
          fill={COLORS.background.card}
          stroke={COLORS.accent.teal}
          strokeWidth={1.75}
        />
      ))}
      {/* Labels do eixo X — trimestre canonico curto */}
      {h.map((ponto, i) => (
        <text
          key={`lbl-${ponto.trimestre}`}
          x={xCentro(i)}
          y={H - 8}
          textAnchor="middle"
          fontSize="9"
          fill={COLORS.text.tertiary}
          fontFamily="system-ui, sans-serif"
        >
          {labelTrimestre(ponto.trimestre)}
        </text>
      ))}
      {/* Rotulos dos valores dos pontos — acima do topo */}
      {pontos.map((p, i) => (
        <text
          key={`val-${i}`}
          x={p.x}
          y={p.y - 6}
          textAnchor="middle"
          fontSize="9"
          fontWeight="600"
          fill={corClima(p.nota)}
          fontFamily="system-ui, sans-serif"
        >
          {fmt(p.nota, 1)}
        </text>
      ))}
    </svg>
  );
}

/**
 * Barra horizontal canonica de uma dimensao do Clima (0-10). Rotulo +
 * barra preenchida na cor do semaforo + valor a direita.
 */
function BarraDimensao(props: {
  readonly label: string;
  readonly nota: number | null;
}): JSX.Element {
  const nota = props.nota;
  const cor = corClima(nota);
  const pct = nota === null ? 0 : Math.max(0, Math.min(100, (nota / 10) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          flex: '0 0 160px',
          fontSize: 12,
          color: COLORS.text.secondary,
          fontWeight: 500,
        }}
      >
        {props.label}
      </div>
      <div
        style={{
          flex: 1,
          height: 10,
          background: COLORS.border.divider,
          borderRadius: 5,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct.toFixed(1)}%`,
            height: '100%',
            background: hexToRgba(cor, 0.75),
            borderRadius: 5,
          }}
        />
      </div>
      <div
        style={{
          flex: '0 0 48px',
          textAlign: 'right',
          fontSize: 13,
          fontWeight: 700,
          color: cor,
        }}
      >
        {nota === null ? '—' : fmt(nota, 1)}
      </div>
    </div>
  );
}

/**
 * Badge canonico da cascata silenciosa (§9.6 Q4=A1). Exibido quando
 * o escopo efetivo divergir do escopo requisitado.
 */
function BadgeCascata(props: {
  readonly notaAgregacao: 'agregado_departamento' | 'agregado_empresa' | null;
}): JSX.Element | null {
  if (props.notaAgregacao === null) return null;
  const texto =
    props.notaAgregacao === 'agregado_departamento'
      ? 'Agregado do departamento'
      : 'Agregado da empresa';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 600,
        background: COLORS.badge.infoBg,
        color: COLORS.badge.infoText,
        marginLeft: 8,
        verticalAlign: 'middle',
      }}
    >
      {texto}
    </span>
  );
}

/**
 * Card canonico do Bloco Clima para dashboards agregados.
 *
 * `data = null` renderiza o estado canonicamente vazio ("Sem dados
 * de Clima disponíveis") — correspondente ao caller nao ter o acesso
 * canonico (C-level acessoTotal=false) OU a empresa nao ter nenhum
 * `scoreA` canonicamente gravado em `plenitudeData`.
 */
export function BlocoClimaCard(props: {
  readonly data: BlocoClimaDashboardData | null;
}): JSX.Element | null {
  const d = props.data;
  if (d === null) {
    return null;
  }
  const payload = d.cascata.payload;
  const dadosDisponiveis = d.cascata.dadosDisponiveis;

  return (
    <div style={CARD}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text.primary }}>
            Bloco Clima e Engajamento
          </span>
          <BadgeCascata notaAgregacao={d.cascata.notaAgregacao} />
        </div>
        <span style={{ fontSize: 11, color: COLORS.text.tertiary }}>
          {payload.countCobertura} respondente{payload.countCobertura === 1 ? '' : 's'}
        </span>
      </div>

      {dadosDisponiveis ? (
        <>
          {/* Topo: donut + timeline */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              gap: 16,
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <GaugeDonut nota={payload.notaClima} />
              <span style={{ ...LABEL, marginTop: 4 }}>Score geral</span>
            </div>
            <div>
              <div style={{ ...LABEL, marginBottom: 4 }}>Histórico canônico</div>
              <TimelineBarrasLinha historico={d.historico} />
            </div>
          </div>

          {/* 4 dimensoes ROIP canonicas */}
          <div style={{ ...LABEL, marginBottom: 8 }}>Dimensões canônicas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <BarraDimensao label="Engajamento" nota={payload.notaEngajamento} />
            <BarraDimensao label="Desenvolvimento" nota={payload.notaDesenvolvimento} />
            <BarraDimensao label="Pertencimento" nota={payload.notaPertencimento} />
            <BarraDimensao label="Realização" nota={payload.notaRealizacao} />
          </div>
        </>
      ) : (
        <div
          style={{
            padding: '24px 12px',
            textAlign: 'center',
            color: COLORS.text.tertiary,
            fontSize: 12,
          }}
        >
          Dados insuficientes para exibir o Bloco Clima (piso de 3 respondentes).
        </div>
      )}
    </div>
  );
}
