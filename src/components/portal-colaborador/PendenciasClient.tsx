// ROIP APP 9BOX — Client canônico da tela de pendências do portal
// (ME-B10-01, DOC 05 §6.3).
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
// Nesta ME, o botão [Responder →] renderiza DESABILITADO com tooltip
// "Formulário em breve" — os hrefs habilitados chegam nas ME-B10-02
// (Instrumento A e D), ME-B10-03 (Radar NR-1) e ME-B10-04 (Perfil
// Individual).
//
// Guard client-side: se sessionStorage não tem `portalToken`, redirect
// para /colaborador.

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
const TOOLTIP_EM_BREVE = 'Formulário em breve';

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

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 20px 60px', width: '100%' }}>
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
          {pendencias.length > 0 ? (
            <>
              <SectionTitle label="Instrumentos pendentes" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendencias.map((p) => (
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
      descricao={`Avaliação de fatores psicossociais no trabalho — 32 perguntas${
        card.prazoOriginal !== null ? ` · Fecha em ${formatDate(card.prazoOriginal)}` : ''
      }`}
      badge={{ label: card.status === 'Atrasado' ? 'Atrasado' : 'Pendente', kind: card.status }}
      buttonLabel="Responder →"
      buttonKind="teal"
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
      descricao={`Sua percepção sobre a plenitude no trabalho${
        card.prazoOriginal !== null ? ` · Prazo: ${formatDate(card.prazoOriginal)}` : ''
      }`}
      badge={{ label: card.status === 'Atrasado' ? 'Atrasado' : 'Pendente', kind: card.status }}
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
      descricao={`Sua avaliação sobre a qualidade da liderança do seu líder direto${liderInfo}${
        card.prazoOriginal !== null ? ` · Prazo: ${formatDate(card.prazoOriginal)}` : ''
      }`}
      badge={{ label: card.status === 'Atrasado' ? 'Atrasado' : 'Pendente', kind: card.status }}
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
        titulo="Perfil Individual — finalizar questionário"
        descricao="Responda no seu próprio ritmo — suas respostas são salvas por bloco"
        progresso={`${blocos} de 10 blocos concluídos`}
        buttonLabel="Continuar"
        buttonKind="teal"
      />
    );
  }

  // 'pendente' e 'aguardando_nova_resposta' compartilham visual (§6.3).
  return (
    <CardBase
      icone="🧠"
      iconeBg="#EFF6FF"
      titulo="Perfil Individual"
      descricao="Responda seu questionário de perfil executivo"
      buttonLabel="Responder"
      buttonKind="navy"
    />
  );
}

interface CardBaseProps {
  readonly icone: string;
  readonly iconeBg: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly progresso?: string;
  readonly badge?: { label: string; kind: 'Pendente' | 'Atrasado' };
  readonly buttonLabel: string;
  readonly buttonKind: 'navy' | 'teal';
  readonly borderLeftTeal?: boolean;
  readonly andamentoBg?: boolean;
  readonly atrasadoBg?: boolean;
  /**
   * ME-B10-02 S253 — quando definido, o botao vira `<Link>` navegavel
   * para a rota de resposta do instrumento. Quando ausente (default),
   * mantem o botao `disabled` com tooltip "Formulário em breve" (ainda
   * usado pelo Perfil Individual e Radar NR-1 nesta ME).
   */
  readonly href?: string;
}

function CardBase(props: CardBaseProps): JSX.Element {
  const border = props.borderLeftTeal === true ? `4px solid ${TEAL}` : `1px solid ${BORDER}`;
  const bg =
    props.andamentoBg === true ? '#F0FDFA' : props.atrasadoBg === true ? '#FEF2F2' : '#FFFFFF';
  return (
    <div
      style={{
        background: bg,
        border: props.borderLeftTeal === true ? `1px solid ${BORDER}` : border,
        borderLeft: border,
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
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
            background: props.badge.kind === 'Atrasado' ? DANGER_BG : INFO_BG,
            color: props.badge.kind === 'Atrasado' ? DANGER_TX : INFO,
          }}
        >
          {props.badge.label}
        </span>
      ) : null}
      <div style={{ flexShrink: 0 }}>
        {props.href !== undefined ? (
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
        ) : (
          <button
            type="button"
            disabled
            title={TOOLTIP_EM_BREVE}
            aria-label={TOOLTIP_EM_BREVE}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              border: 'none',
              whiteSpace: 'nowrap',
              background: props.buttonKind === 'teal' ? TEAL : NAVY,
              color: '#FFFFFF',
              opacity: 0.5,
              cursor: 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {props.buttonLabel}
          </button>
        )}
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
      style={{
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        opacity: 0.75,
      }}
    >
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
  );
}

function labelInstrumentoColaborador(inst: string): string {
  if (inst === 'meuPerfil') {
    return 'Perfil Individual';
  }
  if (inst === 'autoAvaliacao') {
    return 'Autoavaliação do colaborador';
  }
  if (inst === 'avaliacaoLiderancaDireta') {
    return 'Avaliação da liderança direta';
  }
  return 'Radar NR-1';
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

// WARNING_BG/TX reservados para futuros badges âmbar (regressão-safe).
export const _RESERVED_BADGE_TOKENS = { WARNING_BG, WARNING_TX, DANGER };
