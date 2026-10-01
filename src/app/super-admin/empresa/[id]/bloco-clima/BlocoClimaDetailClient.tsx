'use client';

// ROIP APP 9BOX — client component canonico da tela de detalhamento
// Clima e Engajamento (ME-B2-01b Fase 2 hotfix3 + ME-B2-01d).
//
// ME-B2-01d (01/10/2026) — 4 ajustes canonicos de UX, zero motor:
//   - Pills do filtro: cada pill exibe "(N)" com o countCobertura do
//     ultimo trimestre fechado. "Empresa toda (N)" + "Dep (N)" para
//     cada departamento ativo. Pills com `respondentes < 3` ficam com
//     estilo atenuado (opacidade reduzida).
//   - Nota de ajuda fixa abaixo do filtro: linha pequena explicando o
//     piso canonico §9.6 (3 respondentes para anonimato §7.6).
//   - Bloqueio por piso: ao filtrar um departamento com respondentes
//     abaixo do piso, a UI renderiza tela de "insuficiencia" em vez
//     do agregado da empresa que a cascata silenciosa produz. Botao
//     Link volta para o escopo empresa. Preserva a semantica canonica
//     do motor (cascata continua funcionando para outros consumidores
//     — relatorio executivo, PDF, IA).
//   - Taxa de adesao visivel: abaixo do "SCORE GERAL · N respondentes",
//     adiciona linha "ADESAO · X%" com o `payload.adesao` canonico §9.4
//     (0-100 em percentual).
//
// Hotfix3 (30/09/2026) preservado:
//   - Titulo sem "Bloco": "Clima e engajamento — Empresa" ou
//     "Clima e engajamento — <Departamento>".
//   - 20 questoes canonicas por extenso (CAMADA_NEGOCIO §6.2).
//   - Layout 2 linhas por questao (texto acima, barra+nota abaixo).
//   - 4 dimensoes canonicas sempre renderizadas, com `data-dim` para
//     auditoria visual.
//
// Client component canonico pela interatividade (useState para
// sanfona). Grafico (gauge + timeline) e barras renderizados como
// SVG inline server-safe.

import Link from 'next/link';
import type { JSX } from 'react';
import { useState } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import type {
  BlocoClimaDashboardData,
  DepartamentoAtivoClimateEntry,
  EmpresaScopeClimateEntry,
} from '../../../../../server/services/blocoClimaDashboard';

const SCALE = COLORS.scoreScale;

/** §9.6 — piso canonico de respondentes para exibir departamento. */
const PISO_RESPONDENTES_CLIMATE = 3 as const;

function corClima(nota: number | null): string {
  if (nota === null) return COLORS.text.quaternary;
  if (nota >= 7.5) return SCALE.climateHigh;
  if (nota >= 6.0) return SCALE.climateMid;
  return SCALE.climateLow;
}

function fmt1(v: number | null): string {
  if (v === null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPct0(v: number | null): string {
  if (v === null) return '—';
  return Math.round(v).toLocaleString('pt-BR') + '%';
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function labelTrimestre(trimestre: string): string {
  const match = trimestre.match(/^(\d{4})-?Q([1-4])$/);
  if (!match) return trimestre;
  const [, ano, q] = match;
  return `Q${q}/${ano!.slice(2)}`;
}

/**
 * Props canonicas do client. Recebe o payload canonico ja resolvido
 * pelo server component (page.tsx), a lista canonica de departamentos
 * ativos (com contagens — ME-B2-01d), as contagens agregadas da
 * empresa (ME-B2-01d) e o departamento atual (null = empresa).
 */
export interface BlocoClimaDetailClientProps {
  readonly data: BlocoClimaDashboardData | null;
  readonly companyId: number;
  readonly departamentosAtivos: readonly DepartamentoAtivoClimateEntry[];
  readonly empresaScope: EmpresaScopeClimateEntry | null;
  readonly departamentoAtual: string | null;
}

/**
 * Gauge donut canonico (nota geral 0-10 na paleta canonica §2.4).
 * Arco 270° (-135° a +135°).
 */
function GaugeDonut(props: { readonly nota: number | null }): JSX.Element {
  const nota = props.nota;
  const cor = corClima(nota);
  const raio = 50;
  const circ = 2 * Math.PI * raio;
  const arcLen = circ * (270 / 360);
  const notaCap = nota === null ? 0 : Math.max(0, Math.min(10, nota));
  const preench = arcLen * (notaCap / 10);
  const vazio = arcLen - preench;
  const texto = nota === null ? '—' : fmt1(nota);
  return (
    <svg
      viewBox="0 0 140 140"
      width="160"
      height="160"
      role="img"
      aria-label="Score do Clima e engajamento"
    >
      <circle
        cx="70"
        cy="70"
        r={raio}
        fill="none"
        stroke={COLORS.border.default}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${arcLen} ${circ}`}
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
        strokeDasharray={`${preench} ${vazio + circ}`}
        transform="rotate(135 70 70)"
      />
      <text
        x="70"
        y="76"
        textAnchor="middle"
        fontSize="32"
        fontWeight="700"
        fill={cor}
        fontFamily="system-ui, sans-serif"
      >
        {texto}
      </text>
      <text
        x="70"
        y="100"
        textAnchor="middle"
        fontSize="11"
        fill={COLORS.text.tertiary}
        fontFamily="system-ui, sans-serif"
      >
        0-10
      </text>
    </svg>
  );
}

/**
 * Timeline canonica barras + linha (modelo Pulses adaptado). Barras
 * claras com fill rgba 0.22 na cor do semaforo + linha teal conectando
 * os topos. Eixo Y fixo 0-10.
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
          height: 180,
          color: COLORS.text.tertiary,
          fontSize: 12,
        }}
      >
        Sem histórico canônico.
      </div>
    );
  }
  const W = 480;
  const H = 180;
  const padTop = 16;
  const padBot = 28;
  const padLeft = 32;
  const padRight = 16;
  const graficoW = W - padLeft - padRight;
  const graficoH = H - padTop - padBot;
  const barW = (graficoW / h.length) * 0.55;
  const step = graficoW / h.length;
  const yFor = (nota: number): number => padTop + graficoH * (1 - nota / 10);
  const xCentro = (i: number): number => padLeft + step * i + step / 2;
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
      aria-label="Evolução trimestral"
    >
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
              x={padLeft - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="9"
              fill={COLORS.text.quaternary}
              fontFamily="system-ui, sans-serif"
            >
              {marca}
            </text>
          </g>
        );
      })}
      {h.map((ponto, i) => {
        if (ponto.notaClima === null) return null;
        const cor = corClima(ponto.notaClima);
        const y = yFor(ponto.notaClima);
        const alt = padTop + graficoH - y;
        const x = xCentro(i) - barW / 2;
        return (
          <rect
            key={ponto.trimestre}
            x={x}
            y={y}
            width={barW}
            height={alt}
            fill={hexToRgba(cor, 0.22)}
            stroke={hexToRgba(cor, 0.5)}
            strokeWidth={1}
            rx={2}
          />
        );
      })}
      {pontos.length > 1 ? (
        <path
          d={linhaPath}
          fill="none"
          stroke={COLORS.accent.teal}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {pontos.map((p, i) => (
        <circle
          key={`pt-${i}`}
          cx={p.x}
          cy={p.y}
          r={3.5}
          fill={COLORS.background.card}
          stroke={COLORS.accent.teal}
          strokeWidth={2}
        />
      ))}
      {h.map((ponto, i) => (
        <text
          key={`lbl-${ponto.trimestre}`}
          x={xCentro(i)}
          y={H - 10}
          textAnchor="middle"
          fontSize="10"
          fill={COLORS.text.tertiary}
          fontFamily="system-ui, sans-serif"
        >
          {labelTrimestre(ponto.trimestre)}
        </text>
      ))}
      {pontos.map((p, i) => (
        <text
          key={`val-${i}`}
          x={p.x}
          y={p.y - 8}
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          fill={corClima(p.nota)}
          fontFamily="system-ui, sans-serif"
        >
          {fmt1(p.nota)}
        </text>
      ))}
    </svg>
  );
}

/**
 * Convencao canonica (dim-1)*5+item → indices 1..20 das 20 notas por
 * questao canonicas. Dimensao 1=Engajamento (q1..5); 2=Desenvolvimento
 * (q6..10); 3=Pertencimento (q11..15); 4=Realizacao (q16..20).
 */
const DIMENSOES_CANONICAS = [
  { chave: 'engajamento', label: 'Engajamento', dim: 1 },
  { chave: 'desenvolvimento', label: 'Desenvolvimento', dim: 2 },
  { chave: 'pertencimento', label: 'Pertencimento', dim: 3 },
  { chave: 'realizacao', label: 'Realização', dim: 4 },
] as const;

/**
 * Textos canonicos literais das 20 questoes do Instrumento A — fonte
 * primaria CAMADA_NEGOCIO §6.2 (redacao fixa, autoavaliacao). Ordem
 * canonica (dim-1)*5+item identica a `plenitudeData.notasQuestao`.
 */
const TEXTOS_QUESTOES: readonly string[] = [
  // Dimensao 1 — Engajamento (questoes 1..5)
  'Sinto energia e disposição para o trabalho.',
  'Tenho entusiasmo com o que faço.',
  'Sinto-me comprometido com os resultados da área.',
  'Consigo manter o foco e a concentração nas minhas atividades.',
  'Mesmo diante de dificuldades, mantenho minha dedicação ao trabalho.',
  // Dimensao 2 — Desenvolvimento (questoes 6..10)
  'Tenho aprendido e evoluído na função.',
  'Vejo oportunidades de crescimento aqui.',
  'Recebo desafios que me desenvolvem.',
  'Tenho clareza sobre o que preciso desenvolver para crescer na empresa.',
  'Sinto que minhas habilidades estão sendo bem aproveitadas no trabalho.',
  // Dimensao 3 — Pertencimento (questoes 11..15)
  'Sinto que faço parte do time e da empresa.',
  'Sinto-me valorizado pelo que entrego.',
  'Tenho boas relações com quem trabalho.',
  'Sinto que posso ser eu mesmo no ambiente de trabalho.',
  'Sinto que minha opinião é ouvida e considerada pela equipe.',
  // Dimensao 4 — Realizacao (questoes 16..20)
  'Meu trabalho tem sentido para mim.',
  'Sinto satisfação com o que realizo.',
  'Termino a maior parte das semanas com sensação de realização.',
  'Sinto que meu trabalho contribui de forma relevante para a empresa.',
  'Tenho orgulho do que produzo e entrego.',
] as const;

/**
 * Sanfona canonica de uma dimensao. Cabecalho sempre visivel (nome +
 * barra + nota + icone expandir); corpo expandido mostra as 5 notas
 * por questao em layout de 2 linhas (texto da questao por extenso
 * ACIMA da barra; barra + nota ABAIXO).
 */
function DimensaoSanfona(props: {
  readonly label: string;
  readonly chave: string;
  readonly nota: number | null;
  readonly notasQuestao: readonly (number | null)[];
  readonly textosQuestao: readonly string[];
  readonly expandida: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  const nota = props.nota;
  const cor = corClima(nota);
  const pct = nota === null ? 0 : Math.max(0, Math.min(100, (nota / 10) * 100));
  return (
    <div
      data-dim={props.chave}
      style={{
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        background: COLORS.background.card,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.expandida}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 14,
            fontSize: 12,
            color: COLORS.text.tertiary,
            transform: props.expandida ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 150ms',
          }}
        >
          ▶
        </span>
        <span
          style={{
            flex: '0 0 180px',
            fontSize: 14,
            color: COLORS.text.secondary,
            fontWeight: 600,
          }}
        >
          {props.label}
        </span>
        <span
          style={{
            flex: 1,
            height: 10,
            background: COLORS.border.divider,
            borderRadius: 5,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'block',
              width: `${pct.toFixed(1)}%`,
              height: '100%',
              background: hexToRgba(cor, 0.75),
              borderRadius: 5,
            }}
          />
        </span>
        <span
          style={{
            flex: '0 0 56px',
            textAlign: 'right',
            fontSize: 15,
            fontWeight: 700,
            color: cor,
          }}
        >
          {fmt1(nota)}
        </span>
      </button>
      {props.expandida ? (
        <div
          style={{
            borderTop: `1px solid ${COLORS.border.divider}`,
            padding: '12px 16px 16px 42px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {props.notasQuestao.map((n, i) => {
            const corQ = corClima(n);
            const pctQ = n === null ? 0 : Math.max(0, Math.min(100, (n / 10) * 100));
            const texto = props.textosQuestao[i] ?? '';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span
                  style={{
                    fontSize: 13,
                    color: COLORS.text.secondary,
                    lineHeight: 1.35,
                  }}
                >
                  {texto}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      flex: 1,
                      height: 8,
                      background: COLORS.border.divider,
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        width: `${pctQ.toFixed(1)}%`,
                        height: '100%',
                        background: hexToRgba(corQ, 0.65),
                        borderRadius: 4,
                      }}
                    />
                  </span>
                  <span
                    style={{
                      flex: '0 0 48px',
                      textAlign: 'right',
                      fontWeight: 700,
                      color: corQ,
                      fontSize: 13,
                    }}
                  >
                    {fmt1(n)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Dropdown canonico de escopo (ME-B2-01d — pills com contagens).
 * Default: "Empresa toda (N)". Opcoes: "Dep (N)" para cada
 * departamento ativo. Pills com `respondentes < 3` recebem atenuacao
 * visual (opacidade reduzida + rotulo auxiliar "sem relatorio") mas
 * continuam clicaveis — o clique abre a tela de insuficiencia
 * canonica no componente pai. Troca via Link (SSR — nova request com
 * `?dep=`).
 */
function FiltroEscopo(props: {
  readonly companyId: number;
  readonly departamentosAtivos: readonly DepartamentoAtivoClimateEntry[];
  readonly empresaScope: EmpresaScopeClimateEntry | null;
  readonly atual: string | null;
}): JSX.Element {
  const base = `/super-admin/empresa/${props.companyId}/bloco-clima`;
  const pillBase = {
    padding: '8px 14px',
    borderRadius: 20,
    border: `1px solid ${COLORS.border.default}`,
    textDecoration: 'none',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
  const pillAtivo = {
    ...pillBase,
    background: COLORS.accent.teal,
    color: COLORS.background.card,
    border: `1px solid ${COLORS.accent.teal}`,
  };
  const pillInativo = {
    ...pillBase,
    background: COLORS.background.card,
    color: COLORS.text.secondary,
  };
  const empresaLabel =
    props.empresaScope === null
      ? 'Empresa toda'
      : `Empresa toda (${props.empresaScope.respondentes})`;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
          marginRight: 4,
        }}
      >
        Escopo:
      </span>
      <Link href={base} style={props.atual === null ? pillAtivo : pillInativo}>
        {empresaLabel}
      </Link>
      {props.departamentosAtivos.map((dep) => {
        const abaixoPiso = dep.respondentes < PISO_RESPONDENTES_CLIMATE;
        const estiloBase = props.atual === dep.nome ? pillAtivo : pillInativo;
        const estilo = abaixoPiso ? { ...estiloBase, opacity: 0.6 } : estiloBase;
        return (
          <Link
            key={dep.nome}
            href={`${base}?dep=${encodeURIComponent(dep.nome)}`}
            style={estilo}
            title={abaixoPiso ? 'Abaixo do piso canônico de 3 respondentes' : undefined}
          >
            {dep.nome} ({dep.respondentes})
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Estado canonico de bloqueio por piso canonico §9.6 (ME-B2-01d).
 * Exibido quando o usuario filtra um departamento com `respondentes <
 * 3` — em vez de mostrar o agregado da empresa que a cascata silenciosa
 * do motor produz, a UI bloqueia explicitamente e informa o motivo
 * (anonimato §7.6). Oferece Link de retorno ao escopo empresa.
 */
function TelaInsuficienciaPorPiso(props: {
  readonly companyId: number;
  readonly departamentoAtual: string;
  readonly respondentes: number;
}): JSX.Element {
  const base = `/super-admin/empresa/${props.companyId}/bloco-clima`;
  const plural = props.respondentes === 1 ? 'respondente' : 'respondentes';
  const frasePiso =
    `tem ${props.respondentes} ${plural} no último trimestre, abaixo do piso canônico de ` +
    `3 respondentes exigido para preservar o anonimato individual.`;
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        background: COLORS.background.card,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: COLORS.text.primary,
        }}
      >
        Dados insuficientes para gerar relatório
      </span>
      <span
        style={{
          fontSize: 13,
          color: COLORS.text.secondary,
          maxWidth: 520,
          lineHeight: 1.5,
        }}
      >
        O departamento <strong>{props.departamentoAtual}</strong> {frasePiso}
      </span>
      <Link
        href={base}
        style={{
          marginTop: 8,
          padding: '10px 18px',
          borderRadius: 20,
          border: `1px solid ${COLORS.accent.teal}`,
          color: COLORS.accent.teal,
          background: COLORS.background.card,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        ← Voltar para o Clima da empresa
      </Link>
    </div>
  );
}

/**
 * Determina a contagem canonica de respondentes do departamento
 * requisitado. Usado para decidir o bloqueio por piso canonico §9.6
 * (ME-B2-01d). Retorna `null` quando o departamento nao esta na lista
 * (nome digitado manualmente na URL, por exemplo).
 */
function respondentesDoDepartamento(
  departamentoAtual: string,
  departamentos: readonly DepartamentoAtivoClimateEntry[],
): number | null {
  const entry = departamentos.find((d) => d.nome === departamentoAtual);
  return entry === undefined ? null : entry.respondentes;
}

/**
 * Componente canonico da tela de detalhamento Clima e Engajamento.
 * Layout: titulo (sem "Bloco") + filtro com contagens + nota de ajuda
 * canonica + topo (gauge + timeline + adesao) + lista das 4 dimensoes
 * (sanfonas canonicas, texto da questao por extenso acima da barra)
 * com toggle "Expandir todas / Recolher todas". Bloqueio por piso
 * canonico quando o departamento filtrado tem respondentes abaixo
 * do piso §9.6.
 */
export function BlocoClimaDetailClient(props: BlocoClimaDetailClientProps): JSX.Element {
  const [abertas, setAbertas] = useState<readonly boolean[]>([false, false, false, false]);
  const todasAbertas = abertas.every((b) => b);
  const toggleAll = (): void => {
    const alvo = !todasAbertas;
    setAbertas([alvo, alvo, alvo, alvo]);
  };
  const toggle = (i: number): void => {
    setAbertas((prev) => prev.map((b, idx) => (idx === i ? !b : b)));
  };

  const titulo =
    props.departamentoAtual === null
      ? 'Clima e engajamento — Empresa'
      : `Clima e engajamento — ${props.departamentoAtual}`;

  const notaAjudaPiso = (
    <span
      style={{
        fontSize: 11,
        color: COLORS.text.tertiary,
        lineHeight: 1.4,
      }}
    >
      Mínimo de {PISO_RESPONDENTES_CLIMATE} respondentes para exibir dados de um departamento.
    </span>
  );

  const filtroBloco = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <FiltroEscopo
        companyId={props.companyId}
        departamentosAtivos={props.departamentosAtivos}
        empresaScope={props.empresaScope}
        atual={props.departamentoAtual}
      />
      {notaAjudaPiso}
    </div>
  );

  // ME-B2-01d — bloqueio por piso canonico §9.6 na UI do departamento.
  // Quando o departamento requisitado tem respondentes abaixo do piso,
  // a UI exibe tela de insuficiencia em vez do agregado da empresa que
  // a cascata silenciosa do motor produz. Preserva a semantica canonica
  // do motor para outros consumidores (relatorio executivo, PDF, IA).
  if (props.departamentoAtual !== null) {
    const resp = respondentesDoDepartamento(props.departamentoAtual, props.departamentosAtivos);
    if (resp !== null && resp < PISO_RESPONDENTES_CLIMATE) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
            {titulo}
          </h1>
          {filtroBloco}
          <TelaInsuficienciaPorPiso
            companyId={props.companyId}
            departamentoAtual={props.departamentoAtual}
            respondentes={resp}
          />
        </div>
      );
    }
  }

  if (props.data === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
          {titulo}
        </h1>
        {filtroBloco}
        <div
          style={{
            padding: '48px 16px',
            textAlign: 'center',
            color: COLORS.text.tertiary,
            fontSize: 13,
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 8,
            background: COLORS.background.card,
          }}
        >
          Sem dados de Clima canonicamente disponíveis para o escopo selecionado.
        </div>
      </div>
    );
  }

  const payload = props.data.cascata.payload;
  const dadosDisponiveis = props.data.cascata.dadosDisponiveis;
  const notaAgregacao = props.data.cascata.notaAgregacao;

  const notasPorDimensao: readonly (number | null)[] = [
    payload.notaEngajamento,
    payload.notaDesenvolvimento,
    payload.notaPertencimento,
    payload.notaRealizacao,
  ];
  const notasPorQuestao = payload.notasQuestao;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
        {titulo}
      </h1>

      {filtroBloco}

      {notaAgregacao !== null ? (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: COLORS.badge.infoBg,
            color: COLORS.badge.infoText,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {notaAgregacao === 'agregado_departamento'
            ? 'Agregado do departamento (piso de 3 respondentes aplicado)'
            : 'Agregado da empresa (piso de 3 respondentes aplicado)'}
        </div>
      ) : null}

      {dadosDisponiveis ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 24,
            alignItems: 'center',
            padding: 20,
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 8,
            background: COLORS.background.card,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <GaugeDonut nota={payload.notaClima} />
            <span
              style={{
                marginTop: 4,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: COLORS.text.tertiary,
              }}
            >
              Score geral
            </span>
            <span style={{ marginTop: 2, fontSize: 11, color: COLORS.text.tertiary }}>
              {payload.countCobertura} respondente{payload.countCobertura === 1 ? '' : 's'}
            </span>
            <span
              style={{
                marginTop: 6,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: COLORS.text.tertiary,
              }}
            >
              Adesão
            </span>
            <span
              style={{
                marginTop: 2,
                fontSize: 13,
                fontWeight: 700,
                color: COLORS.text.secondary,
              }}
            >
              {fmtPct0(payload.adesao)}
            </span>
            <span style={{ marginTop: 2, fontSize: 10, color: COLORS.text.quaternary }}>
              {payload.countCobertura} de {payload.countTotal} elegíveis
            </span>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: COLORS.text.tertiary,
                marginBottom: 6,
              }}
            >
              Evolução trimestral
            </div>
            <TimelineBarrasLinha historico={props.data.historico} />
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '48px 16px',
            textAlign: 'center',
            color: COLORS.text.tertiary,
            fontSize: 13,
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 8,
            background: COLORS.background.card,
          }}
        >
          Dados insuficientes para exibir o Clima e engajamento no escopo selecionado (piso de 3
          respondentes).
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: COLORS.text.tertiary,
          }}
        >
          Dimensões (clique para expandir questões)
        </span>
        <button
          type="button"
          onClick={toggleAll}
          style={{
            background: 'transparent',
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: COLORS.accent.teal,
            cursor: 'pointer',
          }}
        >
          {todasAbertas ? 'Recolher todas' : 'Expandir todas'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {DIMENSOES_CANONICAS.map((d, i) => {
          const inicio = (d.dim - 1) * 5;
          const notasQ = notasPorQuestao.slice(inicio, inicio + 5);
          const textosQ = TEXTOS_QUESTOES.slice(inicio, inicio + 5);
          return (
            <DimensaoSanfona
              key={d.chave}
              label={d.label}
              chave={d.chave}
              nota={notasPorDimensao[i] ?? null}
              notasQuestao={notasQ}
              textosQuestao={textosQ}
              expandida={abertas[i] ?? false}
              onToggle={() => toggle(i)}
            />
          );
        })}
      </div>
    </div>
  );
}
