// ROIP APP 9BOX — Nr1FormShell (ME-B10-03, S254;
// estendido ME-B10-05 S256 — perimetro mobile via classes utilitarias
// globais em `src/app/globals.css`. Containers usam `.roip-container`,
// paddings usam `.roip-header-padding`/`.roip-progress-padding`/
// `.roip-body-padding`, opcoes Likert usam `.roip-likert-options` e
// `.roip-likert-btn` — mesma primitiva compartilhada com o
// LikertFormShell. Desktop preservado bit-a-bit).
//
// Componente shell dedicado ao formulario do Radar NR-1. NAO deriva
// do LikertFormShell (ME-B10-02) porque cinco pontos materiais divergem
// entre o contrato NR-1 e o contrato A/D:
// 1. Payload do save: `{portalToken, startToken, cicloDbId, respostas:
//    [{fator, itemIndex, valor}]}` vs `{portalToken, trimestre,
//    respostas: [{dimensao, itemIndex, valor}]}`.
// 2. Grid: 32 itens (8 fatores x 4 itens) vs 20 itens (4 dim x 5).
// 3. `startToken` assinado (JWT HS256 com `iat` — §11.5 anti-fraude
//    silencioso "tempo baixo") emitido pelo backend em
//    `POST /api/portal/nr1-form-state` — nao existe equivalente em A/D.
// 4. Modal pre-questionario canonico (§11.4) — obrigatorio antes de
//    renderizar itens. Nao existe em A/D.
// 5. Tratamento canonico do 409 §11.15 com mensagem literal
//    `MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1` — mostrado em
//    modal proprio com botao de retorno ao portal.
//
// Sub-decisao L130: primitivas visuais (cores, tipografia, header
// sticky, rodape sticky, modal de saida) espelham 1:1 o
// LikertFormShell para coesao visual do bloco. Como a divergencia
// estrutural e concentrada em 5 pontos e a UI se sobrepoe apenas em
// primitivas de baixa complexidade, mantemos os dois shells. Se um
// terceiro tipo de formulario reaproveitar as mesmas primitivas
// (Perfil Individual — ME-B10-04), reavaliamos extracao para
// `components/instruments/shared/` na ME-B10-04.
//
// Estrategia de autenticacao (prop `canalAutenticacao`):
// - `portal` — le `portalToken` de `sessionStorage`. Se ausente,
//   redireciona para `/colaborador`.
// - `platform` — sob demanda, chama
//   `POST /api/portal/session-token` para emitir portalToken
//   temporario (TTL 10 min, S247-Alfa da ME-B10-02).
//
// Fluxo canonico do render:
// (a) Monta portalToken (portal vs platform).
// (b) Chama `POST /api/portal/nr1-form-state` que retorna
//     `{disponivel, cicloDbId, startToken, grid[32], dataFechamento,
//       elegivel, jaRespondeu, avisoInicio, tempoMinimoSegundos,
//       escalaMinima, escalaMaxima}`.
// (c) Branch por estado:
//     - `!disponivel && !elegivel && !jaRespondeu` -> sem ciclo aberto.
//     - `!disponivel && !elegivel` -> nao elegivel para o ciclo.
//     - `!disponivel && jaRespondeu` -> ja respondeu neste ciclo.
//     - `disponivel === true` -> renderiza modal pre-questionario;
//       apos aceitar, renderiza os 32 itens em 8 blocos.
// (d) Submit: envia `{portalToken, startToken, cicloDbId, respostas:
//     [{fator, itemIndex, valor}]}` para
//     `POST /api/portal/save-nr1-response`.
// (e) Tratamento canonico do 409:
//     - `MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1` (§11.15) ->
//       modal proprio com botao de retorno.
//     - `MSG_JA_RESPONDIDO_NR1` (§11.4 duplicidade) -> mesma tela de
//       "ja respondeu" da branch (c).
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.
// **RV-13.** Consumido por `RadarNr1PortalPage` +
// `RadarNr1PlatformPage` + smoke unit test.

'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type JSX } from 'react';
import { useRouter } from 'next/navigation';

import { NR1_CATALOG } from '../../lib/instruments/nr1Catalog';

const NAVY = '#1F3A5F';
const NAVY_DARK = '#162d4a';
const TEAL = '#14B8A6';
const TEAL_DARK = '#0d9488';
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
const MSG_ERRO_REDE_ENVIO =
  'Falha de rede ao enviar as respostas. Verifique sua conexão e tente novamente.';
const MSG_ERRO_REDE_ESTADO =
  'Falha de rede ao carregar o questionário. Verifique sua conexão e tente novamente.';
const MSG_ERRO_GENERICO_ENVIO = 'Erro ao enviar as respostas. Tente novamente.';
const MSG_ERRO_GENERICO_ESTADO = 'Erro ao carregar o questionário. Tente novamente.';

const MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1 =
  'O ciclo do Radar NR-1 foi encerrado enquanto você preenchia. ' +
  'Suas respostas não puderam ser salvas.';

const TXT_MODAL_ANTES_TITULO = 'Antes de começar';
const TXT_MODAL_ANTES_BOTAO_INICIAR = 'Iniciar questionário';
const TXT_MODAL_ANTES_BOTAO_CANCELAR = 'Cancelar';
const TXT_MODAL_ANTES_COMPLEMENTO =
  'O Radar NR-1 tem 32 perguntas divididas em 8 blocos temáticos. ' +
  'Reserve cerca de 5 a 8 minutos ininterruptos para respondê-lo.';

const TXT_ESTADO_JA_RESPONDEU_TITULO = 'Você já respondeu o Radar NR-1';
const TXT_ESTADO_JA_RESPONDEU_DESC =
  'Suas respostas para o ciclo atual já foram registradas. ' +
  'Obrigado por contribuir com os dados da plataforma.';

const TXT_ESTADO_NAO_ELEGIVEL_TITULO = 'Você não está elegível para este ciclo';
const TXT_ESTADO_NAO_ELEGIVEL_DESC =
  'Este ciclo do Radar NR-1 foi aberto sem incluir seu cadastro na lista de respondentes. ' +
  'Fale com o RH da sua empresa se acreditar que houve engano.';

const TXT_ESTADO_SEM_CICLO_TITULO = 'Nenhum ciclo aberto no momento';
const TXT_ESTADO_SEM_CICLO_DESC =
  'Não há ciclo do Radar NR-1 aberto para respostas na sua empresa agora. ' +
  'Você será notificado quando um novo ciclo estiver disponível.';

const TXT_MODAL_CICLO_ENCERRADO_TITULO = 'Ciclo encerrado';

const TXT_MODAL_SAIDA_TITULO = 'Sair sem enviar?';
const TXT_MODAL_SAIDA_DESC =
  'Você ainda não enviou suas respostas do Radar NR-1. ' +
  'Se sair agora, vai precisar recomeçar do zero. Deseja sair mesmo assim?';
const TXT_MODAL_SAIDA_CONTINUAR = 'Continuar respondendo';
const TXT_MODAL_SAIDA_CONFIRMAR = 'Sair mesmo assim';

const TXT_CONFIRMACAO_TITULO = 'Resposta enviada com sucesso';
const TXT_CONFIRMACAO_DESC = 'Obrigado por contribuir com os dados da plataforma.';
const TXT_CONFIRMACAO_BOTAO = 'Voltar às pendências';

const TXT_BOTAO_VOLTAR_PORTAL = 'Voltar às pendências';

export interface Nr1FormShellProps {
  readonly canalAutenticacao: 'portal' | 'platform';
  readonly hrefPendencias: string;
}

interface NR1GridItem {
  readonly fator: number;
  readonly fatorNome: string;
  readonly itemIndex: number;
  readonly itemGlobal: number;
}

interface FormStateDisponivel {
  readonly kind: 'disponivel';
  readonly cicloDbId: number;
  readonly ciclo: string | null;
  readonly dataFechamento: string | null;
  readonly startToken: string;
  readonly avisoInicio: string;
  readonly grid: readonly NR1GridItem[];
}

interface FormStateSemCiclo {
  readonly kind: 'sem_ciclo';
}

interface FormStateNaoElegivel {
  readonly kind: 'nao_elegivel';
}

interface FormStateJaRespondeu {
  readonly kind: 'ja_respondeu';
}

interface FormStateErro {
  readonly kind: 'erro';
  readonly msg: string;
}

type FormState =
  | FormStateDisponivel
  | FormStateSemCiclo
  | FormStateNaoElegivel
  | FormStateJaRespondeu
  | FormStateErro
  | null;

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

export function Nr1FormShell(props: Nr1FormShellProps): JSX.Element {
  const router = useRouter();
  const [portalToken, setPortalToken] = useState<string | null>(null);
  const [tokenResolvido, setTokenResolvido] = useState(false);
  const [formState, setFormState] = useState<FormState>(null);
  const [avisoAceito, setAvisoAceito] = useState(false);
  const [respostas, setRespostas] = useState<RespostaMap>({});
  const [modalSaidaAberto, setModalSaidaAberto] = useState(false);
  const [modalCicloEncerradoAberto, setModalCicloEncerradoAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const emitirPortalTokenPlatform = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/portal/session-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.status !== 200) {
        return null;
      }
      const body = (await res.json()) as { portalToken?: unknown };
      const raw = body.portalToken;
      if (typeof raw !== 'string' || raw.length === 0) {
        return null;
      }
      return raw;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function inicializar(): Promise<void> {
      let token: string | null = null;
      if (props.canalAutenticacao === 'portal') {
        if (typeof window === 'undefined') {
          return;
        }
        const stored = window.sessionStorage.getItem('portalToken');
        if (stored === null || stored.length === 0) {
          router.replace('/colaborador');
          return;
        }
        token = stored;
      } else {
        token = await emitirPortalTokenPlatform();
        if (token === null) {
          if (!cancelado) {
            setTokenResolvido(true);
            setFormState({ kind: 'erro', msg: MSG_TOKEN_INDISPONIVEL_PLATFORM });
          }
          return;
        }
      }
      if (cancelado) {
        return;
      }
      setPortalToken(token);
      setTokenResolvido(true);
      await carregarEstado(token);
    }

    async function carregarEstado(token: string): Promise<void> {
      try {
        const res = await fetch('/api/portal/nr1-form-state', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ portalToken: token }),
        });
        if (cancelado) {
          return;
        }
        if (res.status === 401 && props.canalAutenticacao === 'portal') {
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem('portalToken');
          }
          router.replace('/colaborador');
          return;
        }
        if (res.status !== 200) {
          let msg = MSG_ERRO_GENERICO_ESTADO;
          try {
            const body = (await res.json()) as { msg?: unknown };
            if (typeof body.msg === 'string' && body.msg.length > 0) {
              msg = body.msg;
            }
          } catch {
            // corpo nao-JSON — mantem generico
          }
          setFormState({ kind: 'erro', msg });
          return;
        }
        const body = (await res.json()) as {
          disponivel: boolean;
          cicloDbId: number | null;
          ciclo: string | null;
          dataFechamento: string | null;
          elegivel: boolean;
          jaRespondeu: boolean;
          startToken: string | null;
          avisoInicio: string;
          grid: readonly NR1GridItem[];
        };
        if (
          body.disponivel === true &&
          body.cicloDbId !== null &&
          body.startToken !== null &&
          body.startToken.length > 0
        ) {
          setFormState({
            kind: 'disponivel',
            cicloDbId: body.cicloDbId,
            ciclo: body.ciclo,
            dataFechamento: body.dataFechamento,
            startToken: body.startToken,
            avisoInicio: body.avisoInicio,
            grid: body.grid,
          });
          return;
        }
        if (body.jaRespondeu === true) {
          setFormState({ kind: 'ja_respondeu' });
          return;
        }
        if (body.elegivel === false && body.cicloDbId !== null) {
          setFormState({ kind: 'nao_elegivel' });
          return;
        }
        setFormState({ kind: 'sem_ciclo' });
      } catch {
        if (!cancelado) {
          setFormState({ kind: 'erro', msg: MSG_ERRO_REDE_ESTADO });
        }
      }
    }

    void inicializar();
    return () => {
      cancelado = true;
    };
  }, [emitirPortalTokenPlatform, props.canalAutenticacao, router]);

  const totalItens = NR1_CATALOG.numeroItens;
  const respondidas = Object.keys(respostas).length;
  const completo = respondidas === totalItens;
  const pct = totalItens === 0 ? 0 : Math.round((respondidas / totalItens) * 100);

  const enunciadoPorChave = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const fator of NR1_CATALOG.fatores) {
      for (const item of fator.itens) {
        mapa.set(`${item.fator}-${item.itemIndex}`, item.enunciado);
      }
    }
    return mapa;
  }, []);

  const gridPorFator = useMemo(() => {
    if (formState === null || formState.kind !== 'disponivel') {
      return [];
    }
    const agrupado = new Map<number, { fatorNome: string; itens: NR1GridItem[] }>();
    for (const item of formState.grid) {
      const bucket = agrupado.get(item.fator);
      if (bucket === undefined) {
        agrupado.set(item.fator, { fatorNome: item.fatorNome, itens: [item] });
      } else {
        bucket.itens.push(item);
      }
    }
    const ordenado = Array.from(agrupado.entries()).sort((a, b) => a[0] - b[0]);
    return ordenado.map(([fator, bucket]) => ({
      fator,
      fatorNome: bucket.fatorNome,
      itens: bucket.itens.slice().sort((a, b) => a.itemIndex - b.itemIndex),
    }));
  }, [formState]);

  function handleSelecionar(fator: number, itemIndex: number, valor: number): void {
    const key = `${fator}-${itemIndex}`;
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

  function handleAceitarAviso(): void {
    setAvisoAceito(true);
  }

  function handleCancelarAviso(): void {
    router.push(props.hrefPendencias);
  }

  function handleFecharModalCicloEncerrado(): void {
    setModalCicloEncerradoAberto(false);
    router.push(props.hrefPendencias);
  }

  const enviarRespostas = useCallback(
    async (token: string, startToken: string, cicloDbId: number): Promise<EnvioResultado> => {
      const respostasArray = Object.entries(respostas).map(([key, valor]) => {
        const [fRaw, iRaw] = key.split('-');
        return {
          fator: Number.parseInt(fRaw ?? '0', 10),
          itemIndex: Number.parseInt(iRaw ?? '0', 10),
          valor,
        };
      });
      try {
        const res = await fetch('/api/portal/save-nr1-response', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            portalToken: token,
            startToken,
            cicloDbId,
            respostas: respostasArray,
          }),
        });
        if (res.status === 200) {
          return { ok: true };
        }
        let msg = MSG_ERRO_GENERICO_ENVIO;
        try {
          const body = (await res.json()) as { msg?: unknown };
          if (typeof body.msg === 'string' && body.msg.length > 0) {
            msg = body.msg;
          }
        } catch {
          // corpo nao-JSON — mantem generico
        }
        return { ok: false, msg, status: res.status };
      } catch {
        return { ok: false, msg: MSG_ERRO_REDE_ENVIO };
      }
    },
    [respostas],
  );

  const handleEnviar = useCallback(async (): Promise<void> => {
    if (formState === null || formState.kind !== 'disponivel') {
      return;
    }
    if (!completo || enviando || enviado) {
      return;
    }
    if (portalToken === null) {
      setErro(
        props.canalAutenticacao === 'portal'
          ? MSG_TOKEN_INDISPONIVEL_PORTAL
          : MSG_TOKEN_INDISPONIVEL_PLATFORM,
      );
      return;
    }
    setEnviando(true);
    setErro(null);

    const resultado = await enviarRespostas(portalToken, formState.startToken, formState.cicloDbId);
    if (resultado.ok) {
      setEnviado(true);
      setEnviando(false);
      return;
    }

    if (resultado.status === 401 && props.canalAutenticacao === 'portal') {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('portalToken');
      }
      router.replace('/colaborador');
      return;
    }

    if (
      resultado.status === 409 &&
      resultado.msg === MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1
    ) {
      setModalCicloEncerradoAberto(true);
      setEnviando(false);
      return;
    }

    setErro(resultado.msg);
    setEnviando(false);
  }, [
    completo,
    enviando,
    enviado,
    enviarRespostas,
    formState,
    portalToken,
    props.canalAutenticacao,
    router,
  ]);

  if (!tokenResolvido || formState === null) {
    return (
      <div style={centerBoxStyle()}>
        <span style={{ color: TEXT_3, fontSize: 13 }}>Carregando…</span>
      </div>
    );
  }

  if (formState.kind === 'erro') {
    return renderEstadoBloqueado(
      TXT_ESTADO_SEM_CICLO_TITULO,
      formState.msg,
      props.hrefPendencias,
      router,
    );
  }

  if (formState.kind === 'ja_respondeu') {
    return renderEstadoBloqueado(
      TXT_ESTADO_JA_RESPONDEU_TITULO,
      TXT_ESTADO_JA_RESPONDEU_DESC,
      props.hrefPendencias,
      router,
    );
  }

  if (formState.kind === 'nao_elegivel') {
    return renderEstadoBloqueado(
      TXT_ESTADO_NAO_ELEGIVEL_TITULO,
      TXT_ESTADO_NAO_ELEGIVEL_DESC,
      props.hrefPendencias,
      router,
    );
  }

  if (formState.kind === 'sem_ciclo') {
    return renderEstadoBloqueado(
      TXT_ESTADO_SEM_CICLO_TITULO,
      TXT_ESTADO_SEM_CICLO_DESC,
      props.hrefPendencias,
      router,
    );
  }

  if (enviado) {
    return renderConfirmacao(props.hrefPendencias, router);
  }

  if (!avisoAceito) {
    return renderModalPreQuestionario(
      formState.avisoInicio,
      handleAceitarAviso,
      handleCancelarAviso,
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
              Radar NR-1
            </span>
            {formState.dataFechamento !== null ? (
              <span style={{ fontSize: 12, color: TEXT_3 }}>
                Fecha em {formatarDataBR(formState.dataFechamento)}
              </span>
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
            {respondidas} de {totalItens} respondidas
          </div>
        </div>
      </div>

      <div className="roip-container roip-body-padding">
        {gridPorFator.map((bloco) => (
          <div key={`fator-${bloco.fator}`}>
            <div
              style={{
                position: 'sticky',
                top: 92,
                zIndex: 10,
                background: BG,
                padding: '12px 4px 8px 4px',
                borderBottom: `1px solid ${BORDER}`,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: TEAL_DARK,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {bloco.fatorNome}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {bloco.itens.map((item) => {
                const key = `${item.fator}-${item.itemIndex}`;
                const valorAtual = respostas[key];
                const respondido = valorAtual !== undefined;
                const enunciado = enunciadoPorChave.get(key) ?? '';
                return (
                  <div
                    key={key}
                    style={{
                      background: '#FFFFFF',
                      border: `1px solid ${respondido ? TEAL : BORDER}`,
                      borderRadius: 12,
                      padding: '14px 16px',
                      boxShadow: respondido ? 'none' : '0 1px 2px rgba(17,24,39,0.04)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: TEXT_4, marginBottom: 6 }}>
                      Item {item.itemGlobal} de {totalItens}
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
                      {enunciado}
                    </div>
                    <div className="roip-likert-options" data-testid="likert-options-container">
                      {NR1_CATALOG.legendas.map((leg) => {
                        const selecionado = valorAtual === leg.valor;
                        return (
                          <button
                            key={`${key}-${leg.valor}`}
                            type="button"
                            onClick={() => handleSelecionar(item.fator, item.itemIndex, leg.valor)}
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
                );
              })}
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
            {enviando ? 'Enviando…' : completo ? '✓ Enviar respostas' : 'Enviar respostas'}
          </button>
          {!completo ? (
            <div style={{ fontSize: 11.5, color: TEXT_3, textAlign: 'center' }}>
              Responda todos os itens para habilitar o envio
            </div>
          ) : null}
        </div>
      </div>

      {modalSaidaAberto ? renderModalSaida(handleFecharModalSaida, handleConfirmarSaida) : null}
      {modalCicloEncerradoAberto
        ? renderModalCicloEncerrado(handleFecharModalCicloEncerrado)
        : null}
    </div>
  );
}

function renderModalPreQuestionario(
  avisoInicio: string,
  onIniciar: () => void,
  onCancelar: () => void,
): JSX.Element {
  return (
    <div style={centerBoxStyle()}>
      <div
        style={{
          background: '#FFFFFF',
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: '28px 24px 22px 24px',
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 10px 30px rgba(17,24,39,0.10)',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: TEXT_1,
            marginBottom: 10,
          }}
        >
          {TXT_MODAL_ANTES_TITULO}
        </div>
        <div
          style={{
            fontSize: 13,
            color: TEXT_2,
            lineHeight: 1.55,
            marginBottom: 18,
          }}
        >
          {TXT_MODAL_ANTES_COMPLEMENTO}
          <br />
          <br />
          {avisoInicio}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={onIniciar}
            style={{
              padding: '12px 18px',
              borderRadius: 8,
              border: 'none',
              background: NAVY,
              color: '#FFFFFF',
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {TXT_MODAL_ANTES_BOTAO_INICIAR}
          </button>
          <button
            type="button"
            onClick={onCancelar}
            style={{
              padding: '12px 18px',
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
            {TXT_MODAL_ANTES_BOTAO_CANCELAR}
          </button>
        </div>
      </div>
    </div>
  );
}

function renderModalSaida(onFechar: () => void, onConfirmar: () => void): JSX.Element {
  return (
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
          {TXT_MODAL_SAIDA_TITULO}
        </div>
        <div
          style={{
            fontSize: 13,
            color: TEXT_2,
            lineHeight: 1.5,
            marginBottom: 18,
          }}
        >
          {TXT_MODAL_SAIDA_DESC}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={onFechar}
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
            {TXT_MODAL_SAIDA_CONTINUAR}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
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
            {TXT_MODAL_SAIDA_CONFIRMAR}
          </button>
        </div>
      </div>
    </div>
  );
}

function renderModalCicloEncerrado(onFechar: () => void): JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(17,24,39,0.5)',
        zIndex: 70,
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
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>⏰</div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: TEXT_1,
            marginBottom: 8,
          }}
        >
          {TXT_MODAL_CICLO_ENCERRADO_TITULO}
        </div>
        <div
          style={{
            fontSize: 13,
            color: TEXT_2,
            lineHeight: 1.5,
            marginBottom: 18,
          }}
        >
          {MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1}
        </div>
        <button
          type="button"
          onClick={onFechar}
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
            width: '100%',
          }}
        >
          {TXT_BOTAO_VOLTAR_PORTAL}
        </button>
      </div>
    </div>
  );
}

function renderEstadoBloqueado(
  titulo: string,
  descricao: string,
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
            color: TEXT_3,
          }}
        >
          📡
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: TEXT_1,
            marginBottom: 10,
          }}
        >
          {titulo}
        </div>
        <div
          style={{
            fontSize: 13,
            color: TEXT_2,
            lineHeight: 1.5,
            marginBottom: 20,
          }}
        >
          {descricao}
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
          {TXT_BOTAO_VOLTAR_PORTAL}
        </button>
      </div>
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
          {TXT_CONFIRMACAO_TITULO}
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
          {TXT_CONFIRMACAO_DESC}
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
          {TXT_CONFIRMACAO_BOTAO}
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

function formatarDataBR(iso: string): string {
  const partes = iso.split('-');
  if (partes.length !== 3) {
    return iso;
  }
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}
