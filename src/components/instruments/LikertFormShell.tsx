// ROIP APP 9BOX — LikertFormShell (ME-B10-02, S253;
// estendido ME-B10-05 S256 — perimetro mobile via classes utilitarias).
//
// Componente shell compartilhado para formularios Likert 4x5 (20 itens)
// dos Instrumentos A e D. Reuso bit-a-bit entre canais portal e platform
// (S246-C + S247-Alfa). Arquitetura visual literal ao mockup canonico
// `delta_instrumento_a_mobile_v1.html` — header sticky com progresso,
// corpo scrollavel com headers de dimensao sticky, rodape sticky com
// botao de envio, modal de aviso de saida.
//
// Estrategia de autenticacao (prop `canalAutenticacao`):
// - `portal` — le `portalToken` de `sessionStorage`. Se ausente,
//   redireciona para `/colaborador`.
// - `platform` — no clique de envio, chama
//   `POST /api/portal/session-token` para emitir portalToken temporario
//   (TTL 10 min, S247-Alfa). Falha 401 -> redireciona para `/logout`.
//
// Submissao: POST `endpointSubmit` com body
// `{ portalToken, trimestre, respostas: [{dimensao, itemIndex, valor}] }`.
// Trata canonicamente: 200 (sucesso -> confirmacao + redirect),
// 400/401/403/409/500 (exibe `msg` canonico do server no rodape).
//
// ME-B10-05 S256 — perimetro mobile: classes CSS utilitarias globais
// (`src/app/globals.css`) sobrescrevem propriedades especificas em
// viewport `< 1024px` sem alterar o layout desktop. Realinhamento
// canonico: as opcoes Likert usam `.roip-likert-options` (grid 5 cols
// desktop -> flex column empilhado mobile — §19.5 DOC 05). Botao
// individual usa `.roip-likert-btn` (numero e label empilhados no
// desktop, lado a lado no mobile com circulo teal para o numero).
// Containers usam `.roip-container` (max-width 780 desktop / 100%
// mobile). Header e body usam paddings responsivos canonicos.
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.
// **RV-13.** Consumido pelas 4 paginas de formulario + teste smoke.

'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type JSX } from 'react';
import { useRouter } from 'next/navigation';

import type { InstrumentCatalog } from '../../lib/instruments/instrumentACatalog';

const NAVY = '#1F3A5F';
const NAVY_DARK = '#162d4a';
const TEAL = '#14B8A6';
const BG = '#F9FAFB';
const BORDER = '#E5E7EB';
const TEXT_1 = '#111827';
const TEXT_2 = '#374151';
const TEXT_3 = '#6B7280';
const TEXT_4 = '#9CA3AF';
const INPUT_BORDER = '#D1D5DB';
const SUCCESS_BG = '#DCFCE7';
const SUCCESS_TX = '#166534';
const DANGER_BG = '#FEE2E2';
const DANGER_TX = '#991B1B';

const MSG_TOKEN_INDISPONIVEL_PORTAL =
  'Sessão do portal indisponível. Faça a identificação novamente.';
const MSG_TOKEN_INDISPONIVEL_PLATFORM =
  'Não foi possível iniciar o envio. Verifique sua sessão e tente novamente.';
const MSG_ERRO_REDE =
  'Falha de rede ao enviar as respostas. Verifique sua conexão e tente novamente.';
const MSG_ERRO_GENERICO = 'Erro ao enviar as respostas. Tente novamente.';

export interface LikertFormShellProps {
  readonly titulo: string;
  readonly subtitulo?: string;
  readonly trimestreAtual: string;
  readonly catalogo: InstrumentCatalog;
  readonly canalAutenticacao: 'portal' | 'platform';
  readonly endpointSubmit: string;
  readonly hrefPendencias: string;
}

interface RespostaMap {
  readonly [key: string]: number;
}

interface EnvioSucesso {
  readonly ok: true;
}

interface EnvioFalha {
  readonly ok: false;
  readonly msg: string;
  readonly status?: number;
}

type EnvioResultado = EnvioSucesso | EnvioFalha;

export function LikertFormShell(props: LikertFormShellProps): JSX.Element {
  const router = useRouter();
  const [respostas, setRespostas] = useState<RespostaMap>({});
  const [modalSaidaAberto, setModalSaidaAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [tokenPortalPronto, setTokenPortalPronto] = useState<boolean>(
    props.canalAutenticacao === 'platform',
  );

  const numeroItens = props.catalogo.numeroItens;

  useEffect(() => {
    if (props.canalAutenticacao !== 'portal') {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const token = window.sessionStorage.getItem('portalToken');
    if (token === null || token.length === 0) {
      router.replace('/colaborador');
      return;
    }
    setTokenPortalPronto(true);
  }, [props.canalAutenticacao, router]);

  const respondidas = Object.keys(respostas).length;
  const completo = respondidas === numeroItens;
  const pct = numeroItens === 0 ? 0 : Math.round((respondidas / numeroItens) * 100);

  function handleSelecionar(dimensao: number, itemIndex: number, valor: number): void {
    const key = `${dimensao}-${itemIndex}`;
    setRespostas((prev) => ({ ...prev, [key]: valor }));
    setErro(null);
  }

  function handleAbrirModalSaida(): void {
    if (enviando || enviado) {
      return;
    }
    if (respondidas === 0) {
      router.push(props.hrefPendencias);
      return;
    }
    setModalSaidaAberto(true);
  }

  function handleFecharModalSaida(): void {
    setModalSaidaAberto(false);
  }

  function handleConfirmarSaida(): void {
    setModalSaidaAberto(false);
    router.push(props.hrefPendencias);
  }

  const handleEnviar = useCallback(async (): Promise<void> => {
    if (!completo || enviando) {
      return;
    }
    setErro(null);
    setEnviando(true);

    let portalToken: string | null = null;

    try {
      if (props.canalAutenticacao === 'portal') {
        if (typeof window === 'undefined') {
          setErro(MSG_TOKEN_INDISPONIVEL_PORTAL);
          setEnviando(false);
          return;
        }
        portalToken = window.sessionStorage.getItem('portalToken');
        if (portalToken === null || portalToken.length === 0) {
          setErro(MSG_TOKEN_INDISPONIVEL_PORTAL);
          setEnviando(false);
          router.replace('/colaborador');
          return;
        }
      } else {
        const sessionRes = await fetch('/api/portal/session-token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        });
        if (sessionRes.status === 401) {
          setErro(MSG_TOKEN_INDISPONIVEL_PLATFORM);
          setEnviando(false);
          router.replace('/logout');
          return;
        }
        if (sessionRes.status !== 200) {
          const body = (await sessionRes.json()) as { msg?: string };
          setErro(body.msg ?? MSG_TOKEN_INDISPONIVEL_PLATFORM);
          setEnviando(false);
          return;
        }
        const sessionBody = (await sessionRes.json()) as { portalToken: string };
        portalToken = sessionBody.portalToken;
      }

      const respostasArr = Object.entries(respostas).map(([key, valor]) => {
        const [dimStr, itemStr] = key.split('-');
        return {
          dimensao: Number(dimStr),
          itemIndex: Number(itemStr),
          valor,
        };
      });

      const res = await fetch(props.endpointSubmit, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          portalToken,
          trimestre: props.trimestreAtual,
          respostas: respostasArr,
        }),
      });

      let result: EnvioResultado;
      if (res.status === 200) {
        result = { ok: true };
      } else {
        try {
          const body = (await res.json()) as { msg: string };
          result = { ok: false, msg: body.msg, status: res.status };
        } catch {
          result = { ok: false, msg: MSG_ERRO_GENERICO, status: res.status };
        }
      }

      if (result.ok) {
        setEnviado(true);
        setEnviando(false);
        return;
      }

      setErro(result.msg);
      setEnviando(false);
    } catch {
      setErro(MSG_ERRO_REDE);
      setEnviando(false);
    }
  }, [
    completo,
    enviando,
    props.canalAutenticacao,
    props.endpointSubmit,
    props.trimestreAtual,
    respostas,
    router,
  ]);

  const itensRenderizados = useMemo(() => {
    let idx = 0;
    return props.catalogo.dimensoes.map((dim, dIdx) => {
      const itens = dim.itens.map((item) => {
        idx += 1;
        const key = `${item.dimensao}-${item.itemIndex}`;
        const valorAtual = respostas[key];
        const respondido = valorAtual !== undefined;
        return { item, key, numero: idx, valor: valorAtual, respondido };
      });
      return { ordem: dIdx, itens };
    });
  }, [props.catalogo.dimensoes, respostas]);

  if (enviado) {
    return renderConfirmacao(props.hrefPendencias, router);
  }

  if (!tokenPortalPronto) {
    return (
      <div style={centerBoxStyle()}>
        <span style={{ color: TEXT_3, fontSize: 13 }}>Carregando…</span>
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: '#FFFFFF',
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <div
          className="roip-container roip-header-padding"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: TEXT_1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {props.titulo}
            </span>
            {props.subtitulo !== undefined && props.subtitulo.length > 0 ? (
              <span style={{ fontSize: 12, color: TEXT_3 }}>{props.subtitulo}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleAbrirModalSaida}
            aria-label="Fechar"
            style={{
              width: 34,
              height: 34,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 20,
              color: TEXT_3,
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
        <div className="roip-container roip-progress-padding">
          <div
            style={{
              height: 6,
              background: BORDER,
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: TEAL,
                transition: 'width .2s ease-out',
              }}
            />
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: TEXT_3,
              textAlign: 'right',
            }}
          >
            {respondidas} de {numeroItens} respondidas
          </div>
        </div>
      </div>

      <div className="roip-container roip-body-padding">
        {itensRenderizados.map((dim) => (
          <div key={`dim-${dim.ordem}`}>
            {/*
             * ME-B10-04 CC079 acumulativo: cabecalho sticky com nome da
             * dimensao (ex. "ENGAJAMENTO", "DIRECIONAMENTO E CLAREZA")
             * removido — realinhamento com DOC 05 §7.1 (Instrumento A)
             * e §7.3 (Instrumento D) que descrevem apenas
             * "Lista sequencial de itens com escala Likert" sem
             * cabecalho de dimensao. Motivo psicometrico: exibir o
             * nome da dimensao antes das perguntas induz priming e
             * desejabilidade social — o respondente ve "Engajamento"
             * e tende a responder no topo da escala para nao parecer
             * desengajado. NR-1 (§7.4) e excecao (exibe titulo do
             * fator por design de conscientizacao psicossocial).
             * Perfil Individual (§7.5) tambem canoniza sem nome —
             * apenas "Bloco X de 10".
             */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {dim.itens.map((entry) => (
                <div
                  key={entry.key}
                  style={{
                    background: '#FFFFFF',
                    border: `1px solid ${entry.respondido ? TEAL : BORDER}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    boxShadow: entry.respondido ? 'none' : '0 1px 2px rgba(17,24,39,0.04)',
                  }}
                >
                  <div style={{ fontSize: 11, color: TEXT_4, marginBottom: 6 }}>
                    Item {entry.numero} de {numeroItens}
                  </div>
                  <div
                    style={{
                      fontSize: 14.5,
                      fontWeight: 600,
                      color: TEXT_1,
                      lineHeight: 1.4,
                      marginBottom: 14,
                    }}
                  >
                    {entry.item.enunciado}
                  </div>
                  <div className="roip-likert-options" data-testid="likert-options-container">
                    {props.catalogo.legendas.map((leg) => {
                      const selecionado = entry.valor === leg.valor;
                      return (
                        <button
                          key={`${entry.key}-${leg.valor}`}
                          type="button"
                          onClick={() =>
                            handleSelecionar(entry.item.dimensao, entry.item.itemIndex, leg.valor)
                          }
                          className="roip-likert-btn"
                          style={{
                            borderRadius: 8,
                            border: `1px solid ${selecionado ? TEAL : INPUT_BORDER}`,
                            background: selecionado ? TEAL : '#FFFFFF',
                            color: selecionado ? '#FFFFFF' : TEXT_2,
                            fontFamily: 'inherit',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            className={
                              selecionado
                                ? 'roip-likert-btn-num selecionado'
                                : 'roip-likert-btn-num'
                            }
                          >
                            {leg.valor}
                          </span>
                          <span className="roip-likert-btn-label">{leg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#FFFFFF',
          borderTop: `1px solid ${BORDER}`,
          padding: '14px 20px 18px 20px',
          zIndex: 40,
        }}
      >
        <div
          className="roip-container"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {erro !== null ? (
            <div
              style={{
                padding: '10px 14px',
                background: DANGER_BG,
                color: DANGER_TX,
                borderRadius: 8,
                fontSize: 12.5,
              }}
            >
              {erro}
            </div>
          ) : null}
          <button
            type="button"
            disabled={!completo || enviando}
            onClick={() => {
              void handleEnviar();
            }}
            style={{
              padding: '14px 20px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              border: 'none',
              background: !completo || enviando ? INPUT_BORDER : NAVY,
              color: '#FFFFFF',
              cursor: !completo || enviando ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'background .15s ease-out',
            }}
            onMouseOver={(e) => {
              if (completo && !enviando) {
                e.currentTarget.style.background = NAVY_DARK;
              }
            }}
            onMouseOut={(e) => {
              if (completo && !enviando) {
                e.currentTarget.style.background = NAVY;
              }
            }}
          >
            {enviando ? 'Enviando…' : completo ? '✓ Salvar e enviar' : 'Salvar e enviar'}
          </button>
          {!completo ? (
            <div style={{ fontSize: 11.5, color: TEXT_3, textAlign: 'center' }}>
              Responda todos os itens para habilitar o envio
            </div>
          ) : null}
        </div>
      </div>

      {modalSaidaAberto ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17,24,39,0.5)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              padding: '24px 22px 20px 22px',
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: TEXT_1,
                marginBottom: 8,
              }}
            >
              Sair sem enviar?
            </div>
            <div
              style={{
                fontSize: 13,
                color: TEXT_2,
                lineHeight: 1.5,
                marginBottom: 18,
              }}
            >
              Você ainda não enviou suas respostas. Se sair agora, vai precisar recomeçar. Deseja
              sair mesmo assim?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={handleFecharModalSaida}
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: NAVY,
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Continuar respondendo
              </button>
              <button
                type="button"
                onClick={handleConfirmarSaida}
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: `1px solid ${INPUT_BORDER}`,
                  background: '#FFFFFF',
                  color: TEXT_2,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Sair mesmo assim
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderConfirmacao(
  hrefPendencias: string,
  router: ReturnType<typeof useRouter>,
): JSX.Element {
  return (
    <div style={centerBoxStyle()}>
      <div
        style={{
          background: '#FFFFFF',
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: '32px 24px',
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(17,24,39,0.06)',
        }}
      >
        <div
          style={{
            fontSize: 44,
            marginBottom: 12,
            color: SUCCESS_TX,
          }}
        >
          ✅
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: TEXT_1,
            marginBottom: 8,
          }}
        >
          Resposta enviada com sucesso
        </div>
        <div
          style={{
            fontSize: 13,
            color: TEXT_2,
            lineHeight: 1.5,
            marginBottom: 20,
            background: SUCCESS_BG,
            padding: '10px 12px',
            borderRadius: 8,
          }}
        >
          Obrigado por contribuir com os dados da plataforma.
        </div>
        <button
          type="button"
          onClick={() => router.push(hrefPendencias)}
          style={{
            padding: '12px 22px',
            borderRadius: 8,
            border: 'none',
            background: NAVY,
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Voltar às pendências
        </button>
      </div>
    </div>
  );
}

function centerBoxStyle(): CSSProperties {
  return {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    background: BG,
  };
}
