'use client';

// ROIP APP 9BOX — pop-up do relatorio do Perfil Individual (ME
// pos-fila7, DOC 05 §9). Disparado pelo botao [Perfil individual] do
// dashboard individual. Estrutura canonica em tres blocos: header navy
// fixo (alternador resumo/expandida, badge, PDF Bruno+RH, fechar),
// faixa de identificacao fixa e corpo scrollavel.
//
// Comportamento na demo (N5 vazio — motor de IA no-op S210): os textos
// `resumoJson`/`expandidoJson` chegam NULL e `getReport` sinaliza
// `gerando*=true`. O painel de escores por dimensao (§9.4, ultimo
// bloco) e DETERMINISTICO (renderizado pelo frontend, nao pela IA) e
// aparece sempre. Os blocos de texto exibem o estado canonico de
// carregamento (§9.6) com polling limitado; esgotado o teto sem os
// textos, exibe o estado de falha canonico (§9.7). Assim a tela e util
// na demo sem inventar conteudo nem mascarar o estado real.
//
// Desktop-only (§9.10): conteudo em `.roip-hide-mobile`; a mensagem
// canonica de tela desktop-only em `.roip-hide-desktop` — mesmo padrao
// CSS puro (globals.css §19) usado nas demais telas desktop-only.
//
// RV-14: um statement por linha, largura maxima 100.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../../lib/design-tokens/colors';
import { Spinner } from '../../../components/ui/Spinner';
import {
  carregarPerfilRelatorioAction,
  baixarPerfilPdfAction,
  carregarPerfilOnlineHtmlAction,
  type PerfilInconsistenteSnapshot,
  type PerfilRelatorioSnapshot,
} from './perfilRelatorioActions';
import { initialsOf } from './internals';

const MSG_DESKTOP_ONLY =
  'Esta tela está disponível apenas em dispositivos desktop (viewport ≥ 1024px).';
const MSG_FALHA = 'Erro ao gerar relatório. Tente novamente em alguns instantes.';
const MSG_SEM_RELATORIO =
  'Este colaborador ainda não respondeu ao Perfil Individual. O relatório fica ' +
  'disponível após o envio e o cálculo da avaliação.';

// ME-1.11 Leva 2 — Mensagem canonica do estado `inconsistente` (DOC 03
// §10.6 pt.5 + §6.7). Tres elementos obrigatorios: linha de abertura
// em destaque, paragrafo humanizado explicando os cinco padroes
// possiveis sem termo tecnico sem traducao, instrucao de acao
// apontando para a secao "Perfil Individual inconsistente".
const MSG_INCONSISTENTE_TITULO = 'Última tentativa marcada como inconsistente';
const MSG_INCONSISTENTE_CORPO =
  'A última tentativa deste colaborador apresentou padrões de resposta que comprometem a ' +
  'leitura canônica do perfil — como respostas rápidas demais, inclinação para o que seria ' +
  'socialmente desejável, concordância automática, respostas contraditórias entre si ou uso ' +
  'excessivo das extremidades da escala.';
const MSG_INCONSISTENTE_ACAO =
  'Peça ao RH ou ao Super Admin para abrir a seção "Perfil Individual inconsistente" do ' +
  'painel RH, consultar os motivos detectados e liberar nova tentativa quando for o caso.';
// ME-1.11 Leva 3 — mensagem canonica adicional quando o sub-estado
// do placeholder e `aguardando_nova_resposta` (RH ou Super Admin ja
// liberou o reteste, mas o colaborador ainda nao enviou a nova
// tentativa). Substitui MSG_INCONSISTENTE_ACAO no render.
const MSG_INCONSISTENTE_AGUARDANDO_PREFIXO = 'Nova tentativa já liberada em ';
const MSG_INCONSISTENTE_AGUARDANDO_SUFIXO =
  '. Peça ao colaborador para abrir o portal e responder novamente ao Perfil Individual — a ' +
  'leitura canônica será atualizada automaticamente assim que a nova tentativa for enviada.';

// O expandido gera em ate ~200s (timeout de backend); o polling do
// front precisa cobrir esse pior caso com folga, senao desiste antes de
// o texto ficar pronto e exibe o estado de falha por engano. Intervalo
// de 3s x 90 tentativas = ~270s de teto; o polling para antes disso
// assim que ambos os formatos ficam prontos (gerando* == false).
const POLL_INTERVALO_MS = 3000;
const POLL_TENTATIVAS_MAX = 90;

interface Props {
  readonly companyId: number;
  readonly userType: 'employee' | 'clevel';
  readonly userId: number;
  readonly titularNome: string;
  readonly cargo: string;
  readonly nivelHierarquico: string;
  readonly departamento: string;
  readonly liderDireto: string | null;
  readonly onClose: () => void;
}

type Modo = 'resumo' | 'expandida';

// ── estilos ancora (espelham os tokens do dashboard individual) ──
const OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 200,
};
const POPUP: CSSProperties = {
  background: COLORS.background.card,
  borderRadius: 14,
  width: '80vw',
  maxWidth: 900,
  height: '82vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
};
const HEADER: CSSProperties = {
  background: COLORS.primary.navy,
  padding: '14px 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexShrink: 0,
};
const HEADER_BTN: CSSProperties = {
  padding: '7px 16px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(255,255,255,0.12)',
  color: '#FFFFFF',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const CLOSE_BTN: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(255,255,255,0.1)',
  color: '#FFFFFF',
  fontSize: 14,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
const IDENTIF: CSSProperties = {
  background: COLORS.background.elevated,
  borderBottom: `1px solid ${COLORS.border.default}`,
  padding: '14px 24px',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexShrink: 0,
};
const AVATAR: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  background: COLORS.primary.navy,
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  fontWeight: 700,
  flexShrink: 0,
};
const BODY: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '24px 28px',
};
function EstadoTextoIA(props: { falhou: boolean; onRetry: () => void }): JSX.Element {
  if (props.falhou) {
    return (
      <div style={{ marginBottom: 28, textAlign: 'center', padding: '24px 0' }}>
        <p style={{ fontSize: 13, color: COLORS.badge.dangerText, marginBottom: 12 }}>
          {MSG_FALHA}
        </p>
        <button type="button" onClick={props.onRetry} style={HEADER_BTN}>
          🔁 Tentar novamente
        </button>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 28, textAlign: 'center', padding: '24px 0' }}>
      <Spinner variant="screen" label="Gerando relatório..." color={COLORS.accent.teal} />
      <p style={{ fontSize: 11, color: COLORS.text.quaternary, marginTop: 4 }}>
        Este processo leva alguns segundos
      </p>
    </div>
  );
}

/**
 * ME-1.21 — Perfil completo on-line: embute, em iframe isolado, o HTML
 * gerado pelo mesmo motor do PDF (sem capa, sem rastreabilidade). O
 * isolamento do iframe evita colisao de CSS com a plataforma; a altura
 * acompanha o conteudo, de modo que o scroll do modal role o documento
 * inteiro — "o PDF rolando na tela".
 */
function PerfilOnlineFrame(props: {
  carregando: boolean;
  erro: string | null;
  html: string | null;
  onRetry: () => void;
}): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [altura, setAltura] = useState<number>(600);

  const ajustarAltura = useCallback((): void => {
    const doc = frameRef.current?.contentWindow?.document ?? null;
    if (doc !== null) {
      setAltura(doc.body.scrollHeight + 24);
    }
  }, []);

  if (props.erro !== null) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: COLORS.text.secondary, marginBottom: 12 }}>{props.erro}</p>
        <button
          type="button"
          onClick={props.onRetry}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: `1px solid ${COLORS.border.default}`,
            background: '#fff',
            fontSize: 13,
            color: COLORS.text.secondary,
            cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }
  if (props.carregando || props.html === null) {
    return (
      <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }
  return (
    <iframe
      ref={frameRef}
      title="Perfil individual completo"
      srcDoc={props.html}
      onLoad={ajustarAltura}
      style={{ width: '100%', height: altura, border: 'none', display: 'block' }}
    />
  );
}

export function PerfilIndividualRelatorioModal(props: Props): JSX.Element {
  const { companyId, userType, userId, onClose } = props;
  const [snap, setSnap] = useState<PerfilRelatorioSnapshot | null>(null);
  const [modo, setModo] = useState<Modo>('resumo');
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semRelatorio, setSemRelatorio] = useState<boolean>(false);
  // ME-1.11 Leva 2: distingue "nunca respondeu" (semRelatorio=true,
  // inconsistente=null) de "respondeu mas inconsistente"
  // (semRelatorio=false, inconsistente!=null).
  const [inconsistente, setInconsistente] = useState<PerfilInconsistenteSnapshot | null>(null);
  const [textoFalhou, setTextoFalhou] = useState<boolean>(false);
  const [baixandoPdf, setBaixandoPdf] = useState<boolean>(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  // ME-1.21 — HTML do perfil completo (motor do PDF, sem capa/rastreab.).
  const [onlineHtml, setOnlineHtml] = useState<string | null>(null);
  const [carregandoOnline, setCarregandoOnline] = useState<boolean>(false);
  const [erroOnline, setErroOnline] = useState<string | null>(null);
  const [onlineReloadKey, setOnlineReloadKey] = useState<number>(0);
  const tentativasRef = useRef<number>(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const carregar = useCallback(async (): Promise<void> => {
    const res = await carregarPerfilRelatorioAction({ companyId, userType, userId });
    if (!res.ok) {
      setErro(res.error ?? 'Erro ao carregar o relatório.');
      setCarregando(false);
      return;
    }
    if (res.kind === 'inconsistente') {
      setInconsistente(res.inconsistente);
      setCarregando(false);
      return;
    }
    if (res.kind === 'none' || res.semRelatorio || res.snapshot === null) {
      setSemRelatorio(true);
      setCarregando(false);
      return;
    }
    setSnap(res.snapshot);
    setCarregando(false);
  }, [companyId, userType, userId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Polling dos textos de IA enquanto NULL, com teto (§9.6/§9.7). O
  // painel de escores ja esta visivel; o polling so persegue os textos.
  useEffect(() => {
    if (snap === null) {
      return;
    }
    const aindaGerando = snap.gerandoResumo || snap.gerandoExpandido;
    if (!aindaGerando || textoFalhou) {
      return;
    }
    if (tentativasRef.current >= POLL_TENTATIVAS_MAX) {
      setTextoFalhou(true);
      return;
    }
    const timer = setTimeout(() => {
      tentativasRef.current += 1;
      void carregar();
    }, POLL_INTERVALO_MS);
    return () => clearTimeout(timer);
  }, [snap, textoFalhou, carregar]);

  const alternar = useCallback((): void => {
    setModo((m) => (m === 'resumo' ? 'expandida' : 'resumo'));
    if (bodyRef.current !== null) {
      bodyRef.current.scrollTop = 0;
    }
  }, []);

  const retryTexto = useCallback((): void => {
    tentativasRef.current = 0;
    setTextoFalhou(false);
    void carregar();
  }, [carregar]);

  // ME-1.21 — carrega o HTML do perfil completo sob demanda, quando o
  // modo "completo" abre e o expandido ja esta pronto.
  // ME-1.21 patch — resumo e completo vêm do mesmo motor (iframe). O HTML
  // é buscado conforme o modo ativo e refeito ao alternar ou no retry.
  useEffect(() => {
    if (snap === null || snap.gerandoExpandido) {
      return;
    }
    let cancelado = false;
    setErroOnline(null);
    setOnlineHtml(null);
    setCarregandoOnline(true);
    const modoOnline: 'completo' | 'resumo' = modo === 'resumo' ? 'resumo' : 'completo';
    void carregarPerfilOnlineHtmlAction({ companyId, userType, userId, modo: modoOnline }).then(
      (res) => {
        if (cancelado) {
          return;
        }
        setCarregandoOnline(false);
        if (!res.ok || res.html === null) {
          setErroOnline(res.error ?? 'Erro ao carregar o perfil.');
          return;
        }
        setOnlineHtml(res.html);
      },
    );
    return () => {
      cancelado = true;
    };
  }, [modo, snap, companyId, userType, userId, onlineReloadKey]);

  const retryOnline = useCallback((): void => {
    setOnlineReloadKey((k) => k + 1);
  }, []);

  const baixarPdf = useCallback(async (): Promise<void> => {
    setErroPdf(null);
    setBaixandoPdf(true);
    const res = await baixarPerfilPdfAction({ companyId, userType, userId });
    setBaixandoPdf(false);
    if (!res.ok || res.pdfBase64 === null || res.filename === null) {
      setErroPdf(res.error ?? 'Erro ao gerar o PDF.');
      return;
    }
    const bin = atob(res.pdfBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [companyId, userType, userId]);

  // As duas visões (resumo e completo) vêm do expandido; o resumoJson não
  // é mais consumido pela tela.
  const textoAusente = snap !== null && (snap.gerandoExpandido || textoFalhou);
  // ME-1.11 Leva 2: no estado `inconsistente` a data de aplicacao vem
  // do payload da tentativa inconsistente (nao ha `snap`). No estado
  // `consistente` vem do assessment do score vigente. Em `none` fica
  // em travessao.
  const dataAplicacaoIso: string | null = snap?.enviadoEm ?? inconsistente?.enviadoEm ?? null;
  const dataAplicacao =
    dataAplicacaoIso !== null ? new Date(dataAplicacaoIso).toLocaleDateString('pt-BR') : '—';

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={POPUP} onClick={(e) => e.stopPropagation()}>
        {/* Mensagem desktop-only (§9.10) — visivel apenas em < 1024px. */}
        <div
          className="roip-hide-desktop"
          style={{ padding: 28, textAlign: 'center', fontSize: 13, color: COLORS.text.tertiary }}
        >
          <p style={{ marginBottom: 16 }}>{MSG_DESKTOP_ONLY}</p>
          <button
            type="button"
            onClick={onClose}
            style={{ ...HEADER_BTN, background: COLORS.primary.navy }}
          >
            Fechar
          </button>
        </div>

        {/* Conteudo do relatorio — desktop (§9). */}
        <div
          className="roip-hide-mobile"
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          <div style={HEADER}>
            <div style={{ flex: 1 }}>
              {snap !== null && !semRelatorio ? (
                <button type="button" onClick={alternar} style={HEADER_BTN}>
                  {modo === 'resumo' ? 'Ver perfil completo →' : '← Ver resumo do perfil'}
                </button>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {snap !== null && !semRelatorio ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 20,
                    padding: '3px 10px',
                    color:
                      modo === 'expandida' ? COLORS.badge.tealClaroBg : 'rgba(255,255,255,0.6)',
                    background: modo === 'expandida' ? 'rgba(20,184,166,0.2)' : 'transparent',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {modo === 'expandida' ? 'Perfil completo' : 'Resumo'}
                </span>
              ) : null}
              {snap !== null && !semRelatorio && snap.podeBaixarPdf && !snap.gerandoExpandido ? (
                <button
                  type="button"
                  onClick={() => void baixarPdf()}
                  disabled={baixandoPdf}
                  style={{ ...HEADER_BTN, opacity: baixandoPdf ? 0.6 : 1 }}
                  title="Baixar PDF executivo completo"
                >
                  {baixandoPdf ? '⏳ Gerando PDF...' : '📄 Baixar PDF'}
                </button>
              ) : null}
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" style={CLOSE_BTN}>
              ✕
            </button>
          </div>

          {erroPdf !== null ? (
            <div
              style={{
                background: COLORS.badge.dangerBg,
                color: COLORS.badge.dangerText,
                padding: '8px 24px',
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {erroPdf}
            </div>
          ) : null}

          <div style={IDENTIF}>
            <div style={AVATAR}>{initialsOf(props.titularNome)}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text.primary }}>
                {props.titularNome}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.text.tertiary,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span>{props.cargo}</span>
                <span>· {props.nivelHierarquico}</span>
                <span>· {props.departamento}</span>
                {props.liderDireto !== null ? <span>· Líder: {props.liderDireto}</span> : null}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  color: COLORS.text.quaternary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Data de aplicação
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: COLORS.text.secondary,
                  marginTop: 2,
                }}
              >
                {dataAplicacao}
              </div>
            </div>
          </div>

          <div style={BODY} ref={bodyRef}>
            {carregando ? (
              <p style={{ fontSize: 13, color: COLORS.text.tertiary }}>Carregando relatório…</p>
            ) : erro !== null ? (
              <p style={{ fontSize: 13, color: COLORS.badge.dangerText }}>{erro}</p>
            ) : inconsistente !== null ? (
              /* ME-1.11 Leva 2: estado canonico `inconsistente` com 3
                 elementos (DOC 03 §10.6 pt.5 + §6.7). */
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: COLORS.semantic.danger,
                    marginBottom: 12,
                  }}
                >
                  {MSG_INCONSISTENTE_TITULO}
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: COLORS.text.secondary,
                    lineHeight: 1.7,
                    marginTop: 0,
                    marginBottom: 12,
                  }}
                >
                  {MSG_INCONSISTENTE_CORPO}
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: COLORS.text.secondary,
                    lineHeight: 1.7,
                    marginTop: 0,
                    marginBottom: 0,
                  }}
                >
                  {inconsistente.aguardandoNovaResposta ? (
                    <>
                      {MSG_INCONSISTENTE_AGUARDANDO_PREFIXO}
                      <strong>
                        {inconsistente.retesteLiberadoEm !== null
                          ? new Date(inconsistente.retesteLiberadoEm).toLocaleDateString('pt-BR')
                          : '—'}
                      </strong>
                      {MSG_INCONSISTENTE_AGUARDANDO_SUFIXO}
                    </>
                  ) : (
                    MSG_INCONSISTENTE_ACAO
                  )}
                </p>
              </div>
            ) : semRelatorio ? (
              <p style={{ fontSize: 13, color: COLORS.text.tertiary, lineHeight: 1.7 }}>
                {MSG_SEM_RELATORIO}
              </p>
            ) : snap !== null ? (
              <>
                {/* Texto da IA ainda gerando/falho -> estado canônico
                    (§9.6/§9.7); pronto -> iframe do motor do PDF (resumo
                    ou completo, conforme o modo). */}
                {textoAusente ? (
                  <EstadoTextoIA falhou={textoFalhou} onRetry={retryTexto} />
                ) : (
                  <PerfilOnlineFrame
                    carregando={carregandoOnline}
                    erro={erroOnline}
                    html={onlineHtml}
                    onRetry={retryOnline}
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
