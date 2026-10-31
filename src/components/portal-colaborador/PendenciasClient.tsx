// ROIP APP 9BOX — Client canônico da tela de pendências do portal
// (ME-B10-01, DOC 05 §6.3; estendido ME-B10-05 S256 — perímetro mobile).
//
// Consome GET /api/portal/pendencias com header Authorization Bearer
// (portalToken de sessionStorage). Renderiza:
//   - Cards de pendência ordenados por regra P-M3.8 (Radar NR-1
//     primeiro, demais por prazo asc).
//   - Card específico do Perfil Individual por estado canônico
//     (pendente / em_andamento com progresso / aguardando_nova_resposta).
//   - Seção "Respondidos nos últimos 7 dias" abaixo, quando houver.
//   - Estado vazio canônico literal §6.3.
//
// Nesta ME, os hrefs canonicos estao TODOS habilitados:
// - ME-B10-02 (S253): Instrumento A + Instrumento D.
// - ME-B10-03 (S254): Radar NR-1.
// - ME-B10-04 (S255): Perfil Individual (nos 2 estados canonicos
//   `pendente|aguardando_nova_resposta` e `em_andamento`).
// A partir desta ME o Bloco B10 fecha a superficie de escrita para
// os 4 instrumentos individuais no canal portal — todos os cards de
// pendencia sao clicaveis. O tooltip "Formulário em breve" é a
// constante `TOOLTIP_EM_BREVE` foram removidos (RV-13 canonico —
// codigo morto proibido).
//
// Guard client-side: se sessionStorage não tem `portalToken`, redirect
// para /colaborador.
//
// ME-B10-05 S256: cards recebem classe `roip-pendencia-card` que
// empilha layout verticalmente em `< 1024px`, com botão full-width.
// Container recebe classe `roip-pendencias-container` para padding
// responsivo. Regra canônica §6.3 mobile: card com ícone+título no
// topo, badge à direita no topo, botão full-width no rodapé do card.

'use client';

import { useCallback, useEffect, useState, type JSX } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type {
  PortalColaboradorPendencias,
  PortalPendenciaCard,
  PortalRespondidoRecente,
} from '../../lib/pendencias/portalColaborador';

const NAVY = '#1F3A5F';
const TEAL = '#14B8A6';
const BORDER = '#E5E7EB';
const TEXT_1 = '#111827';
const TEXT_3 = '#6B7280';
const TEXT_4 = '#9CA3AF';
const DANGER = '#DC2626';
const DANGER_BG = '#FEE2E2';
const DANGER_TX = '#991B1B';
const WARNING_BG = '#FEF3C7';
const WARNING_TX = '#92400E';
const SUCCESS_BG = '#DCFCE7';
const SUCCESS_TX = '#166534';
const INFO = '#1E40AF';
const INFO_BG = '#DBEAFE';

const EMPTY_TEXT = 'Você não tem instrumentos pendentes. Obrigado por manter seu portal em dia.';

export function PendenciasClient(): JSX.Element {
  const router = useRouter();
  const [data, setData] = useState<PortalColaboradorPendencias | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }
    const token = window.sessionStorage.getItem('portalToken');
    if (token === null || token.length === 0) {
      router.replace('/colaborador');
      return;
    }
    setErro(null);
    setLoading(true);
    try {
      const res = await fetch('/api/portal/pendencias', {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        window.sessionStorage.removeItem('portalToken');
        router.replace('/colaborador');
        return;
      }
      const body = (await res.json()) as PortalColaboradorPendencias | { msg: string };
      if (res.status !== 200) {
        const err = body as { msg: string };
        setErro(err.msg);
        return;
      }
      const payload = body as PortalColaboradorPendencias;
      // Server envia strings ISO para `Date`; convertemos ao entrar.
      const normalizado: PortalColaboradorPendencias = {
        pendencias: payload.pendencias.map((p) => ({
          ...p,
          prazoOriginal: p.prazoOriginal === null ? null : new Date(p.prazoOriginal),
        })),
        respondidosRecentes: payload.respondidosRecentes.map((r) => ({
          ...r,
          respondidoEm: new Date(r.respondidoEm),
        })),
      };
      setData(normalizado);
    } catch {
      setErro('Falha ao carregar pendências. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (loading) {
    return (
      <div style={centerBoxStyle()}>
        <span style={{ color: TEXT_3, fontSize: 13 }}>Carregando…</span>
      </div>
    );
  }

  if (erro !== null) {
    return (
      <div style={centerBoxStyle()}>
        <div
          style={{
            padding: '14px 18px',
            background: DANGER_BG,
            color: DANGER_TX,
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {erro}
        </div>
      </div>
    );
  }

  if (data === null) {
    return <div style={centerBoxStyle()} />;
  }

  const { pendencias, respondidosRecentes } = data;
  const vazio = pendencias.length === 0 && respondidosRecentes.length === 0;

  // ME-1.3b item 2: ordenacao canonica por urgencia do prazo.
  // Prazos passados (atrasados) primeiro, depois prazos proximos, depois
  // distantes; cards sem prazo (`prazoOriginal === null`) ao final.
  // Esta ordenacao e client-side por caracteristica da pendencia renderizada.
  const pendenciasOrdenadas = [...pendencias].sort((a, b) => {
    const ta = a.prazoOriginal === null ? Infinity : a.prazoOriginal.getTime();
    const tb = b.prazoOriginal === null ? Infinity : b.prazoOriginal.getTime();
    return ta - tb;
  });

  // ME-1.3b item 2: barra de progresso global do ciclo.
  // Denominador = pendentes + respondidos recentes (janela de 7 dias).
  // Numerador = respondidos recentes.
  // Snapshot local do ciclo em curso (nao representa historico completo).
  const totalCiclo = pendencias.length + respondidosRecentes.length;
  const respondidosCount = respondidosRecentes.length;
  const progressoPct = totalCiclo === 0 ? 0 : Math.round((respondidosCount / totalCiclo) * 100);

  return (
    <div
      className="roip-pendencias-container"
      style={{ maxWidth: 640, margin: '0 auto', padding: '28px 20px 60px', width: '100%' }}
    >
      {vazio ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: TEXT_4,
            fontSize: 14,
          }}
        >
          <div style={{ fontSize: 38, marginBottom: 12 }}>✅</div>
          <div>{EMPTY_TEXT}</div>
        </div>
      ) : (
        <>
          <ProgressoGlobal respondidos={respondidosCount} total={totalCiclo} pct={progressoPct} />

          {pendenciasOrdenadas.length > 0 ? (
            <>
              <SectionTitle label="Instrumentos pendentes" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendenciasOrdenadas.map((p) => (
                  <CardPendencia key={p.key} card={p} />
                ))}
              </div>
            </>
          ) : null}

          {respondidosRecentes.length > 0 ? (
            <>
              <div style={{ marginTop: 32 }}>
                <SectionTitle label="Respondidos nos últimos 7 dias" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {respondidosRecentes.map((r) => (
                  <CardRespondido key={r.key} card={r} />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function centerBoxStyle(): React.CSSProperties {
  return {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  };
}

interface SectionTitleProps {
  readonly label: string;
}

function SectionTitle(props: SectionTitleProps): JSX.Element {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: TEXT_3,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 14,
      }}
    >
      {props.label}
    </div>
  );
}

interface CardPendenciaProps {
  readonly card: PortalPendenciaCard;
}

function CardPendencia(props: CardPendenciaProps): JSX.Element {
  const { card } = props;
  if (card.instrumento === 'radarNR1') {
    return <CardRadarNr1 card={card} />;
  }
  if (card.instrumento === 'meuPerfil') {
    return <CardPerfilIndividual card={card} />;
  }
  if (card.instrumento === 'autoAvaliacao') {
    return <CardAutoAvaliacao card={card} />;
  }
  return <CardLiderancaDireta card={card} />;
}

function CardRadarNr1(props: CardPendenciaProps): JSX.Element {
  const { card } = props;
  return (
    <CardBase
      icone="📡"
      iconeBg="#F0FDFA"
      borderLeftTeal
      titulo="Radar NR-1"
      descricao="Diagnóstico de fatores psicossociais no ambiente de trabalho. Respostas anônimas."
      badge={computeBadgePrazo(card.prazoOriginal, card.status)}
      buttonLabel="Responder →"
      buttonKind="teal"
      href="/colaborador/responder/radar-nr1"
    />
  );
}

function CardAutoAvaliacao(props: CardPendenciaProps): JSX.Element {
  const { card } = props;
  return (
    <CardBase
      icone="📋"
      iconeBg="#F5F3FF"
      titulo="Autoavaliação do colaborador"
      descricao="Avaliação de como você percebe seu próprio engajamento e satisfação."
      badge={computeBadgePrazo(card.prazoOriginal, card.status)}
      buttonLabel="Responder →"
      buttonKind="navy"
      atrasadoBg={card.status === 'Atrasado'}
      href="/colaborador/responder/auto-avaliacao"
    />
  );
}

function CardLiderancaDireta(props: CardPendenciaProps): JSX.Element {
  const { card } = props;
  const liderInfo =
    card.liderNome !== null && card.liderNome.length > 0 ? ` · Avaliando: ${card.liderNome}` : '';
  return (
    <CardBase
      icone="🧭"
      iconeBg="#FFF7ED"
      titulo="Avaliação da liderança direta"
      descricao={`Você avalia seu líder direto. Suas respostas são anônimas.${liderInfo}`}
      badge={computeBadgePrazo(card.prazoOriginal, card.status)}
      buttonLabel="Responder →"
      buttonKind="navy"
      atrasadoBg={card.status === 'Atrasado'}
      href="/colaborador/responder/lideranca-direta"
    />
  );
}

function CardPerfilIndividual(props: CardPendenciaProps): JSX.Element {
  const { card } = props;
  const estado = card.perfilIndividualEstado ?? 'pendente';

  if (estado === 'em_andamento') {
    const blocos = card.blocosConcluidos ?? 0;
    return (
      <CardBase
        icone="🧠"
        iconeBg="#CCFBF1"
        borderLeftTeal
        andamentoBg
        titulo="Perfil individual — finalizar questionário"
        descricao="Instrumento que revela seus pontos fortes e seu jeito de trabalhar."
        progresso={`${blocos} de 10 blocos concluídos`}
        buttonLabel="Continuar"
        buttonKind="teal"
        href="/colaborador/responder/perfil-individual"
      />
    );
  }

  // 'pendente' e 'aguardando_nova_resposta' compartilham visual (§6.3).
  // ME-B10-04 S255: href habilitado bit-a-bit — o backend do
  // `profile-form-state` cria automaticamente a tentativa
  // `em_andamento` na primeira leitura, mesmo no estado
  // `aguardando_nova_resposta` (§10.7 DOC 03).
  return (
    <CardBase
      icone="🧠"
      iconeBg="#EFF6FF"
      titulo="Perfil individual"
      descricao="Instrumento que revela seus pontos fortes e seu jeito de trabalhar."
      buttonLabel="Responder"
      buttonKind="navy"
      href="/colaborador/responder/perfil-individual"
    />
  );
}

type BadgePalette = 'danger' | 'warning' | 'success' | 'info';

interface BadgeInfo {
  readonly label: string;
  readonly palette: BadgePalette;
}

interface CardBaseProps {
  readonly icone: string;
  readonly iconeBg: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly progresso?: string;
  readonly badge?: BadgeInfo;
  readonly buttonLabel: string;
  readonly buttonKind: 'navy' | 'teal';
  readonly borderLeftTeal?: boolean;
  readonly andamentoBg?: boolean;
  readonly atrasadoBg?: boolean;
  /**
   * Href canonico da rota de resposta do instrumento. ME-B10-04 S255
   * tornou obrigatorio (o Bloco B10 fechou a superficie de escrita
   * para os 4 instrumentos, entao nenhum card e renderizado sem
   * navegacao). O botao renderiza como `<Link>` do next/navigation.
   */
  readonly href: string;
}

// ME-1.3b item 3: badge por urgencia do prazo.
// - Atrasado (dias < 0): paleta DANGER, label "Atrasado há N dias".
// - Fecha hoje (dias === 0): paleta WARNING, label "Fecha hoje".
// - 1-3 dias: paleta WARNING, label "Fecha em N dia(s)".
// - 4+ dias: paleta SUCCESS, label "Fecha em N dias".
// - Sem prazo (prazoOriginal === null): paleta INFO, label do status.
function computeBadgePrazo(prazoOriginal: Date | null, status: 'Pendente' | 'Atrasado'): BadgeInfo {
  if (prazoOriginal === null) {
    return { label: status === 'Atrasado' ? 'Atrasado' : 'Pendente', palette: 'info' };
  }
  const agora = Date.now();
  const diffMs = prazoOriginal.getTime() - agora;
  const diffDias = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDias < 0) {
    const abs = Math.abs(diffDias);
    const label = abs === 1 ? 'Atrasado há 1 dia' : `Atrasado há ${abs} dias`;
    return { label, palette: 'danger' };
  }
  if (diffDias === 0) {
    return { label: 'Fecha hoje', palette: 'warning' };
  }
  if (diffDias <= 3) {
    const label = diffDias === 1 ? 'Fecha em 1 dia' : `Fecha em ${diffDias} dias`;
    return { label, palette: 'warning' };
  }
  return { label: `Fecha em ${diffDias} dias`, palette: 'success' };
}

function paletteBadgeBg(palette: BadgePalette): string {
  if (palette === 'danger') return DANGER_BG;
  if (palette === 'warning') return WARNING_BG;
  if (palette === 'success') return SUCCESS_BG;
  return INFO_BG;
}

function paletteBadgeFg(palette: BadgePalette): string {
  if (palette === 'danger') return DANGER_TX;
  if (palette === 'warning') return WARNING_TX;
  if (palette === 'success') return SUCCESS_TX;
  return INFO;
}

interface ProgressoGlobalProps {
  readonly respondidos: number;
  readonly total: number;
  readonly pct: number;
}

function ProgressoGlobal(props: ProgressoGlobalProps): JSX.Element {
  const { respondidos, total, pct } = props;
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXT_1 }}>
          Você respondeu {respondidos} de {total} instrumentos
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: TEAL }}>{pct}%</span>
      </div>
      <div
        style={{
          height: 6,
          background: '#F3F4F6',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: TEAL,
            transition: 'width 240ms ease-out',
          }}
        />
      </div>
    </div>
  );
}

function CardBase(props: CardBaseProps): JSX.Element {
  const border = props.borderLeftTeal === true ? `4px solid ${TEAL}` : `1px solid ${BORDER}`;
  const bg =
    props.andamentoBg === true ? '#F0FDFA' : props.atrasadoBg === true ? '#FEF2F2' : '#FFFFFF';
  return (
    <div
      className="roip-pendencia-card"
      style={{
        background: bg,
        border: props.borderLeftTeal === true ? `1px solid ${BORDER}` : border,
        borderLeft: border,
        borderRadius: 12,
        padding: '16px 18px',
      }}
    >
      <div className="roip-pendencia-topo">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: props.iconeBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {props.icone}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT_1 }}>{props.titulo}</div>
          <div style={{ fontSize: 11.5, color: TEXT_3, marginTop: 2, lineHeight: 1.4 }}>
            {props.descricao}
          </div>
          {props.progresso !== undefined ? (
            <div
              style={{
                fontSize: 11.5,
                color: TEAL,
                fontWeight: 600,
                marginTop: 3,
              }}
            >
              {props.progresso}
            </div>
          ) : null}
        </div>
        {props.badge !== undefined ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 999,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              background: paletteBadgeBg(props.badge.palette),
              color: paletteBadgeFg(props.badge.palette),
            }}
          >
            {props.badge.label}
          </span>
        ) : null}
      </div>
      <div className="roip-pendencia-btn-wrap">
        <Link
          href={props.href}
          aria-label={props.buttonLabel}
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            background: props.buttonKind === 'teal' ? TEAL : NAVY,
            color: '#FFFFFF',
            textDecoration: 'none',
            fontFamily: 'inherit',
          }}
        >
          {props.buttonLabel}
        </Link>
      </div>
    </div>
  );
}

interface CardRespondidoProps {
  readonly card: PortalRespondidoRecente;
}

function CardRespondido(props: CardRespondidoProps): JSX.Element {
  const { card } = props;
  return (
    <div
      className="roip-pendencia-card"
      style={{
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: '16px 18px',
        opacity: 0.75,
      }}
    >
      <div className="roip-pendencia-topo">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: '#F3F4F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          ✅
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT_1, opacity: 0.7 }}>
            {labelInstrumentoColaborador(card.instrumento)}
          </div>
          <div style={{ fontSize: 11.5, color: TEXT_3, marginTop: 2 }}>
            Enviado em {formatDate(card.respondidoEm)}
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 9px',
            borderRadius: 999,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            background: SUCCESS_BG,
            color: SUCCESS_TX,
          }}
        >
          Enviado
        </span>
      </div>
    </div>
  );
}

function labelInstrumentoColaborador(inst: string): string {
  if (inst === 'meuPerfil') {
    return 'Perfil individual';
  }
  if (inst === 'autoAvaliacao') {
    return 'Autoavaliação do colaborador';
  }
  if (inst === 'avaliacaoLiderancaDireta') {
    return 'Avaliação da liderança direta';
  }
  return 'Radar NR-1';
}

// PNR1 (ME-B11.1b): formata usando getUTC* para consistir com o
// header do questionario Nr1FormShell, que recebe `dataFechamento`
// serializado por `dataCivilDeColunaNr1` (UTC-safe). Antes desta ME,
// `getDate()`/`getMonth()`/`getFullYear()` operavam em local time e
// produziam divergencia de +/- 1 dia em TZ fora de UTC (ex.: Sao Paulo
// UTC-03: a data UTC `2026-10-30 00:00` virava "29/10/2026" no local
// time do card, enquanto o header do formulario mantinha "30/10/2026").
function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = d.getUTCFullYear();
  return `${dd}/${mm}/${yy}`;
}

// ME-1.3b item 3: WARNING_BG/TX agora sao consumidos em
// `paletteBadgeBg/Fg` para o badge "Fecha em N dias" quando o prazo
// esta dentro de 3 dias; mantemos `DANGER` reservado para destaques de
// borda futuros (regressão-safe canonica — RV-13).
export const _RESERVED_BADGE_TOKENS = { DANGER };
