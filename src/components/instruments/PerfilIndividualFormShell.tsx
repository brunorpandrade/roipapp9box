// ROIP APP 9BOX — PerfilIndividualFormShell (ME-B10-04, S255,
// DOC 03 §10.1-§10.13 + DOC 05 §7.5 + Perfil_Individual__instrumento_completo_.md §4).
//
// Shell dedicado ao formulario do Perfil Individual — servido bit-a-bit
// nos canais portal (`/colaborador/responder/perfil-individual`, S207
// canonizado no MASTER §3.2) e platform (`/meu-portal/perfil-individual`,
// S246-C). Precedente direto: `Nr1FormShell` da ME-B10-03. A decisao
// canonica de shell DEDICADO (nao generalizacao do `LikertFormShell` nem
// do `Nr1FormShell` nem extracao de primitivas para
// `components/instruments/shared/`) esta fundamentada em 6 divergencias
// materiais:
//
// 1. Layout **pop-up modal 80% (760px max, 90vh)** vs tela cheia dos
//    shells anteriores (DOC 05 §7.5).
// 2. **Navegacao bloco a bloco** (10 blocos de 8 itens) com botoes
//    [Bloco anterior] e [Proximo bloco] no footer vs scroll unico.
// 3. **saveBlock por bloco** (multiplos POSTs incrementais durante o
//    preenchimento) vs single POST no submit.
// 4. **3 tipos de item na mesma tela** (Likert 1-5, EF A/B, Cenario
//    A/B/C/D) vs Likert unico dos anteriores.
// 5. **Bloco 10 muda visualmente** (some [X] e [Salvar depois] do
//    header, footer vira [Enviar respostas], submit aciona
//    `submit-profile-assessment`).
// 6. **Comportamento de retomada** via `profile-form-state` (respostas
//    pre-selecionadas) + **regra de volta unica** (front-only) +
//    [Salvar e continuar depois] com semantica propria.
//
// Extensao canonica L130-05 da §7.24: primitivas visuais (paleta,
// dimensoes sticky, escala Likert visual) espelham 1:1 os shells
// anteriores. Reavaliacao de extracao para `components/instruments/shared/`
// fica para ME dedicada pos-B10 se beneficio empirico se materializar
// com 3 consumidores + padrao consolidado (hoje ainda seriam 3
// contratos de backend distintos + 3 semanticas de progresso
// distintas).
//
// Estrategia de autenticacao (prop `canalAutenticacao`):
// - `portal` — le `portalToken` de `sessionStorage`. Se ausente,
//   redireciona para `/colaborador`.
// - `platform` — no mount, chama `POST /api/portal/session-token`
//   para emitir `portalToken` temporario TTL 10 min (S247-Alfa da
//   ME-B10-02). Falha -> mensagem canonica no shell.
//
// Fluxo canonico:
// (a) Monta portalToken (portal vs platform).
// (b) Chama `POST /api/portal/profile-form-state` — retorna
//     `{assessmentId, blocoAtual, blocosCompletos, respostas,
//       totalBlocos, itensPorBloco}`. Cria tentativa `em_andamento`
//     automaticamente se ausente.
// (c) Renderiza o modal pop-up 80% com o bloco `blocoAtual`.
// (d) Ao clicar `[Proximo bloco]`: valida completude do bloco local,
//     POST `save-profile-block` -> atualiza estado com o novo
//     `blocoAtual` retornado pelo backend.
// (e) Ao clicar `[Bloco anterior]`: decrementa `blocoAtual` local
//     UMA UNICA VEZ (`voltouUmaVez=true`). Nao chama backend. Ao
//     avancar novamente, `voltouUmaVez` reseta (nova volta liberada).
// (f) Ao clicar `[Salvar e continuar depois]` ou `[X]`: se bloco
//     atual completo, POST `save-profile-block`. Fecha (redirect
//     para `hrefPendencias`).
// (g) No bloco 10, `[Enviar respostas]`: POST `save-profile-block`
//     (bloco 10) + POST `submit-profile-assessment`. Sucesso ->
//     tela de confirmacao canonica (DOC 05 §7.5).
//
// Tratamento canonico de erros dos handlers:
// - 400 `MSG_BLOCO_INCOMPLETO`, `MSG_BLOCO_FORA_DE_RANGE`,
//   `MSG_ASSESSMENT_INCOMPLETO`, `MSG_BODY_MALFORMED`.
// - 401 `MSG_MISSING_TOKEN`, `MSG_INVALID_TOKEN`, `MSG_EXPIRED_TOKEN`
//   -> canal portal redireciona para `/colaborador`; canal platform
//   exibe erro (nao redireciona; a sessao platform continua valida).
// - 403 `MSG_ASSESSMENT_TITULAR_MISMATCH` (defesa em profundidade).
// - 404 `MSG_ASSESSMENT_NAO_ENCONTRADO`.
// - 409 `MSG_ASSESSMENT_JA_ENVIADA`, `MSG_ASSESSMENT_NAO_EM_ANDAMENTO`,
//   `MSG_BLOCO_JA_COMPLETO_TRAVADO`.
// - 500 `MSG_UNEXPECTED`.
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.
// **RV-13.** Consumido por `PerfilIndividualPortalPage`
// + `PerfilIndividualPlatformPage` + smoke unit test.

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from 'react';
import { useRouter } from 'next/navigation';

import {
  LETRAS_ALTERNATIVAS,
  LIKERT_LEGENDAS,
  PERFIL_INDIVIDUAL_ITENS_POR_BLOCO,
  PERFIL_INDIVIDUAL_TOTAL_BLOCOS,
  PERFIL_INDIVIDUAL_TOTAL_ITENS,
  itensDoBlocoUx,
  type PerfilIndividualItem,
} from '../../lib/instruments/perfilIndividualCatalog';

// ============================================================
// Paleta canonica (espelhada dos shells anteriores)
// ============================================================

const NAVY = '#1F3A5F';
const NAVY_DARK = '#162d4a';
const TEAL = '#14B8A6';
const TEAL_DARK = '#0d9488';
const TEAL_BG = '#F0FDFA';
const TEAL_BORDER = '#99F6E4';
const TEAL_SEL_BG = '#CCFBF1';
const TEAL_TX = '#0F766E';
const BORDER = '#E5E7EB';
const INPUT_BORDER = '#D1D5DB';
const OVERLAY = 'rgba(0,0,0,0.5)';
const TEXT_1 = '#111827';
const TEXT_2 = '#374151';
const TEXT_3 = '#6B7280';
const TEXT_4 = '#9CA3AF';
const SUCCESS_BG = '#DCFCE7';

// ============================================================
// Mensagens canonicas do shell (nao vem do server)
// ============================================================

const MSG_TOKEN_INDISPONIVEL_PORTAL =
  'Sessão do portal indisponível. Faça a identificação novamente.';
const MSG_TOKEN_INDISPONIVEL_PLATFORM =
  'Não foi possível iniciar o formulário. Verifique sua sessão e tente novamente.';
const MSG_ERRO_REDE_CARREGAR =
  'Falha de rede ao carregar o formulário. Verifique sua conexão e tente novamente.';
const MSG_ERRO_REDE_SALVAR =
  'Falha de rede ao salvar o bloco. Verifique sua conexão e tente novamente.';
const MSG_ERRO_REDE_ENVIAR =
  'Falha de rede ao enviar o questionário. Verifique sua conexão e tente novamente.';
const MSG_ERRO_GENERICO_CARREGAR = 'Erro ao carregar o formulário. Tente novamente.';
const MSG_ERRO_GENERICO_SALVAR = 'Erro ao salvar o bloco. Tente novamente.';
const MSG_ERRO_GENERICO_ENVIAR = 'Erro ao enviar o questionário. Tente novamente.';
const INSTRUCAO_BLOCO_1 =
  'Instrução: Responda com base em como você realmente se comporta no trabalho — não como' +
  ' gostaria de ser. Não há respostas certas ou erradas. Use a escala de 1 (Nunca) a 5' +
  ' (Sempre) para afirmações de frequência. Quando houver alternativas, escolha a que melhor' +
  ' descreve você.';
const CONFIRM_TITULO = 'Suas respostas foram enviadas!';
const CONFIRM_SUB =
  'Obrigado por responder o Perfil Individual. Suas respostas foram registradas com sucesso.';

// ============================================================
// Props publicas
// ============================================================

export interface PerfilIndividualFormShellProps {
  readonly canalAutenticacao: 'portal' | 'platform';
  readonly hrefPendencias: string;
}

// ============================================================
// Union discriminada canonica (L130-03 §7.24)
// ============================================================

interface FormDataPronto {
  readonly assessmentId: number;
  readonly blocoAtual: number;
  readonly blocosCompletos: readonly number[];
  readonly respostas: Readonly<Record<string, string | number>>;
}

interface StateInicializando {
  readonly kind: 'inicializando';
}
interface StateCarregando {
  readonly kind: 'carregando';
  readonly portalToken: string;
}
interface StatePronto {
  readonly kind: 'pronto';
  readonly portalToken: string;
  readonly formData: FormDataPronto;
}
interface StateEnviando {
  readonly kind: 'enviando';
  readonly portalToken: string;
  readonly formData: FormDataPronto;
}
interface StateEnviado {
  readonly kind: 'enviado';
  readonly enviadoEmIso: string;
}
interface StateErroFatal {
  readonly kind: 'erro_fatal';
  readonly msg: string;
}

type ShellState =
  | StateInicializando
  | StateCarregando
  | StatePronto
  | StateEnviando
  | StateEnviado
  | StateErroFatal;

interface SaveBlockResponse {
  readonly companyId: number;
  readonly userType: string;
  readonly userId: number;
  readonly assessmentId: number;
  readonly blocoAtual: number;
  readonly blocosCompletos: readonly number[];
  readonly totalBlocos: number;
}

interface SubmitAssessmentResponse {
  readonly companyId: number;
  readonly userType: string;
  readonly userId: number;
  readonly assessmentId: number;
  readonly tentativa: number;
  readonly motivo: string;
  readonly status: string;
  readonly confiabilidadeNivel: string;
  readonly enviadoEm: string;
  readonly exibirConfirmacaoAte: string;
}

// ============================================================
// Componente
// ============================================================

export function PerfilIndividualFormShell(props: PerfilIndividualFormShellProps): JSX.Element {
  const router = useRouter();
  const [state, setState] = useState<ShellState>({ kind: 'inicializando' });
  const [respostasLocais, setRespostasLocais] = useState<Record<string, string | number>>({});
  const [blocoUx, setBlocoUx] = useState<number>(1);
  const [voltouUmaVez, setVoltouUmaVez] = useState<boolean>(false);
  const [erroTransiente, setErroTransiente] = useState<string | null>(null);
  // Ref canonica ao corpo scrollavel do modal — usada para resetar
  // `scrollTop` ao 0 sempre que o `blocoUx` muda (padrao bit-a-bit do
  // mockup canonico `perfil_individual_formulario_v3.html` linha 434
  // e 447). Sem esse reset, avancar ou voltar bloco preserva a rolagem
  // anterior, fazendo o usuario ver o meio ou o final do proximo bloco
  // ao inves do topo.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (bodyRef.current !== null) {
      bodyRef.current.scrollTop = 0;
    }
  }, [blocoUx]);

  // -------- 1) Emissao de portalToken (canal-specifico) --------

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

  const resolverPortalToken = useCallback(async (): Promise<string | null> => {
    if (props.canalAutenticacao === 'portal') {
      if (typeof window === 'undefined') {
        return null;
      }
      const stored = window.sessionStorage.getItem('portalToken');
      if (stored === null || stored.length === 0) {
        return null;
      }
      return stored;
    }
    return emitirPortalTokenPlatform();
  }, [emitirPortalTokenPlatform, props.canalAutenticacao]);

  // -------- 2) Fetch inicial do form-state --------

  const carregarFormState = useCallback(
    async (portalToken: string): Promise<FormDataPronto | { msg: string }> => {
      try {
        const res = await fetch('/api/portal/profile-form-state', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ portalToken }),
        });
        if (res.status === 200) {
          const body = (await res.json()) as {
            assessmentId?: unknown;
            blocoAtual?: unknown;
            blocosCompletos?: unknown;
            respostas?: unknown;
          };
          if (
            typeof body.assessmentId !== 'number' ||
            typeof body.blocoAtual !== 'number' ||
            !Array.isArray(body.blocosCompletos) ||
            typeof body.respostas !== 'object' ||
            body.respostas === null
          ) {
            return { msg: MSG_ERRO_GENERICO_CARREGAR };
          }
          const blocosCompletos = body.blocosCompletos.filter(
            (v): v is number => typeof v === 'number' && Number.isInteger(v),
          );
          const respostas: Record<string, string | number> = {};
          for (const [k, v] of Object.entries(body.respostas as Record<string, unknown>)) {
            if (typeof v === 'string' || typeof v === 'number') respostas[k] = v;
          }
          return {
            assessmentId: body.assessmentId,
            blocoAtual: body.blocoAtual,
            blocosCompletos,
            respostas,
          };
        }
        let msg = MSG_ERRO_GENERICO_CARREGAR;
        try {
          const body = (await res.json()) as { msg?: unknown };
          if (typeof body.msg === 'string' && body.msg.length > 0) msg = body.msg;
        } catch {
          // corpo nao-JSON — mantem generico
        }
        return { msg };
      } catch {
        return { msg: MSG_ERRO_REDE_CARREGAR };
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function init(): Promise<void> {
      const token = await resolverPortalToken();
      if (cancelled) return;
      if (token === null) {
        const msg =
          props.canalAutenticacao === 'portal'
            ? MSG_TOKEN_INDISPONIVEL_PORTAL
            : MSG_TOKEN_INDISPONIVEL_PLATFORM;
        setState({ kind: 'erro_fatal', msg });
        if (props.canalAutenticacao === 'portal' && typeof window !== 'undefined') {
          router.replace('/colaborador');
        }
        return;
      }
      setState({ kind: 'carregando', portalToken: token });
      const result = await carregarFormState(token);
      if (cancelled) return;
      if ('msg' in result) {
        setState({ kind: 'erro_fatal', msg: result.msg });
        return;
      }
      // Bootstrap: usa blocoAtual do backend como bloco UX inicial +
      // hidrata respostasLocais bit-a-bit para permitir retomada visual.
      setBlocoUx(Math.min(Math.max(result.blocoAtual, 1), PERFIL_INDIVIDUAL_TOTAL_BLOCOS));
      setRespostasLocais({ ...result.respostas });
      setState({ kind: 'pronto', portalToken: token, formData: result });
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [carregarFormState, props.canalAutenticacao, resolverPortalToken, router]);

  // -------- 3) Derivacoes de UI --------

  const itensBlocoAtual = useMemo(() => itensDoBlocoUx(blocoUx), [blocoUx]);
  const respondidasNoBloco = itensBlocoAtual.filter(
    (it) => respostasLocais[it.id] !== undefined && respostasLocais[it.id] !== null,
  ).length;
  const blocoAtualCompleto = respondidasNoBloco === PERFIL_INDIVIDUAL_ITENS_POR_BLOCO;

  const respondidasTotal = useMemo(() => {
    let n = 0;
    for (let numero = 1; numero <= PERFIL_INDIVIDUAL_TOTAL_ITENS; numero += 1) {
      const key = `ITEM_${String(numero).padStart(3, '0')}`;
      const v = respostasLocais[key];
      if (v !== undefined && v !== null) n += 1;
    }
    return n;
  }, [respostasLocais]);

  const progressoPct = Math.round((respondidasTotal / PERFIL_INDIVIDUAL_TOTAL_ITENS) * 100);
  const ehBlocoFinal = blocoUx === PERFIL_INDIVIDUAL_TOTAL_BLOCOS;

  // -------- 4) Handlers --------

  function handleResponder(item: PerfilIndividualItem, valor: string | number): void {
    setRespostasLocais((prev) => ({ ...prev, [item.id]: valor }));
    setErroTransiente(null);
  }

  function extrairRespostasDoBloco(bloco: number): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    for (const it of itensDoBlocoUx(bloco)) {
      const v = respostasLocais[it.id];
      if (v !== undefined && v !== null) out[it.id] = v;
    }
    return out;
  }

  const salvarBloco = useCallback(
    async (
      portalToken: string,
      assessmentId: number,
      bloco: number,
      respostasBloco: Record<string, string | number>,
    ): Promise<SaveBlockResponse | { msg: string; status?: number }> => {
      try {
        const res = await fetch('/api/portal/save-profile-block', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            portalToken,
            assessmentId,
            bloco,
            respostas: respostasBloco,
          }),
        });
        if (res.status === 200) {
          const body = (await res.json()) as SaveBlockResponse;
          return body;
        }
        let msg = MSG_ERRO_GENERICO_SALVAR;
        try {
          const body = (await res.json()) as { msg?: unknown };
          if (typeof body.msg === 'string' && body.msg.length > 0) msg = body.msg;
        } catch {
          // corpo nao-JSON — mantem generico
        }
        return { msg, status: res.status };
      } catch {
        return { msg: MSG_ERRO_REDE_SALVAR };
      }
    },
    [],
  );

  const submeterAssessment = useCallback(
    async (
      portalToken: string,
      assessmentId: number,
    ): Promise<SubmitAssessmentResponse | { msg: string; status?: number }> => {
      try {
        const res = await fetch('/api/portal/submit-profile-assessment', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ portalToken, assessmentId }),
        });
        if (res.status === 200) {
          const body = (await res.json()) as SubmitAssessmentResponse;
          return body;
        }
        let msg = MSG_ERRO_GENERICO_ENVIAR;
        try {
          const body = (await res.json()) as { msg?: unknown };
          if (typeof body.msg === 'string' && body.msg.length > 0) msg = body.msg;
        } catch {
          // corpo nao-JSON — mantem generico
        }
        return { msg, status: res.status };
      } catch {
        return { msg: MSG_ERRO_REDE_ENVIAR };
      }
    },
    [],
  );

  const handleProximo = useCallback(async (): Promise<void> => {
    if (state.kind !== 'pronto') return;
    if (!blocoAtualCompleto) return;
    if (ehBlocoFinal) return;

    setErroTransiente(null);
    setState({ kind: 'enviando', portalToken: state.portalToken, formData: state.formData });
    const respostasBloco = extrairRespostasDoBloco(blocoUx);
    const result = await salvarBloco(
      state.portalToken,
      state.formData.assessmentId,
      blocoUx,
      respostasBloco,
    );
    if ('msg' in result) {
      setErroTransiente(result.msg);
      setState({ kind: 'pronto', portalToken: state.portalToken, formData: state.formData });
      return;
    }
    const novoFormData: FormDataPronto = {
      assessmentId: state.formData.assessmentId,
      blocoAtual: result.blocoAtual,
      blocosCompletos: result.blocosCompletos,
      respostas: { ...state.formData.respostas, ...respostasBloco },
    };
    setState({ kind: 'pronto', portalToken: state.portalToken, formData: novoFormData });
    setBlocoUx(Math.min(blocoUx + 1, PERFIL_INDIVIDUAL_TOTAL_BLOCOS));
    setVoltouUmaVez(false);
  }, [blocoAtualCompleto, blocoUx, ehBlocoFinal, salvarBloco, state]);

  function handleAnterior(): void {
    if (state.kind !== 'pronto') return;
    if (blocoUx <= 1) return;
    if (voltouUmaVez) return;
    setBlocoUx(blocoUx - 1);
    setVoltouUmaVez(true);
    setErroTransiente(null);
  }

  const handleSalvarDepoisOuFechar = useCallback(async (): Promise<void> => {
    if (state.kind !== 'pronto') return;
    // Se bloco atual completo, salva antes de fechar (regra §7.5).
    if (blocoAtualCompleto) {
      const respostasBloco = extrairRespostasDoBloco(blocoUx);
      // Fire-and-forget canonico: se falhar, o proximo carregamento
      // do form-state recupera o estado consistente (o backend nao
      // avancou blocoAtual). Nao bloqueamos o retorno ao portal.
      void salvarBloco(state.portalToken, state.formData.assessmentId, blocoUx, respostasBloco);
    }
    router.push(props.hrefPendencias);
  }, [blocoAtualCompleto, blocoUx, props.hrefPendencias, router, salvarBloco, state]);

  const handleEnviarFinal = useCallback(async (): Promise<void> => {
    if (state.kind !== 'pronto') return;
    if (!ehBlocoFinal) return;
    if (!blocoAtualCompleto) return;

    setErroTransiente(null);
    setState({ kind: 'enviando', portalToken: state.portalToken, formData: state.formData });

    // 1) Salva o bloco 10 (idempotente do lado do backend — merge canonico).
    const respostasBloco = extrairRespostasDoBloco(blocoUx);
    const saveResult = await salvarBloco(
      state.portalToken,
      state.formData.assessmentId,
      blocoUx,
      respostasBloco,
    );
    if ('msg' in saveResult) {
      setErroTransiente(saveResult.msg);
      setState({ kind: 'pronto', portalToken: state.portalToken, formData: state.formData });
      return;
    }

    // 2) Submete o assessment (aciona motor 5 camadas in-band).
    const submitResult = await submeterAssessment(state.portalToken, state.formData.assessmentId);
    if ('msg' in submitResult) {
      setErroTransiente(submitResult.msg);
      setState({ kind: 'pronto', portalToken: state.portalToken, formData: state.formData });
      return;
    }

    // 3) Sucesso — tela de confirmacao canonica (DOC 05 §7.5).
    setState({ kind: 'enviado', enviadoEmIso: submitResult.enviadoEm });
  }, [blocoAtualCompleto, blocoUx, ehBlocoFinal, salvarBloco, state, submeterAssessment]);

  function handleFecharPosEnvio(): void {
    router.push(props.hrefPendencias);
  }

  // -------- 5) Render --------

  if (state.kind === 'inicializando' || state.kind === 'carregando') {
    return (
      <div style={estilos.overlayVazio}>
        <div style={estilos.msgLoading}>Carregando…</div>
      </div>
    );
  }

  if (state.kind === 'erro_fatal') {
    return (
      <div style={estilos.overlay}>
        <div style={estilos.modalErroFatal}>
          <div style={estilos.erroFatalTitulo}>Não foi possível abrir o formulário</div>
          <div style={estilos.erroFatalMsg}>{state.msg}</div>
          <button type="button" onClick={handleFecharPosEnvio} style={estilos.btnFecharErroFatal}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'enviado') {
    return (
      <div style={estilos.overlay}>
        <div style={estilos.modalQuiz}>
          <div style={estilos.confirmacaoWrapper}>
            <div style={estilos.confirmacaoIcone}>✅</div>
            <div style={estilos.confirmacaoTitulo}>{CONFIRM_TITULO}</div>
            <div style={estilos.confirmacaoSub}>{CONFIRM_SUB}</div>
            <div style={estilos.confirmacaoData}>
              Enviado em {formatarEnviadoEm(state.enviadoEmIso)}
            </div>
            <button
              type="button"
              onClick={handleFecharPosEnvio}
              style={estilos.btnFecharConfirmacao}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // state.kind === 'pronto' | 'enviando'
  const enviandoAcao = state.kind === 'enviando';
  const anteriorDisabled = blocoUx <= 1 || voltouUmaVez || enviandoAcao;
  const avancarDisabled = !blocoAtualCompleto || enviandoAcao;

  return (
    <div style={estilos.overlay}>
      <div style={estilos.modalQuiz}>
        {/* HEADER */}
        <div style={estilos.header}>
          <div style={estilos.headerTop}>
            <div style={estilos.titulo}>Perfil Individual</div>
            {!ehBlocoFinal ? (
              <div style={estilos.headerActions}>
                <button
                  type="button"
                  onClick={() => {
                    void handleSalvarDepoisOuFechar();
                  }}
                  disabled={enviandoAcao}
                  style={estilos.btnSalvarDepois}
                >
                  💾 Salvar e continuar depois
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSalvarDepoisOuFechar();
                  }}
                  disabled={enviandoAcao}
                  aria-label="Fechar"
                  style={estilos.btnFecharQuiz}
                >
                  ✕
                </button>
              </div>
            ) : null}
          </div>
          <div style={estilos.progressoContainer}>
            <span style={estilos.progressoLabel}>Progresso geral</span>
            <div style={estilos.progressoTrack}>
              <div style={{ ...estilos.progressoFill, width: `${progressoPct}%` }} />
            </div>
            <span style={estilos.progressoPct}>{progressoPct}%</span>
          </div>
        </div>

        {/* CORPO */}
        <div ref={bodyRef} style={estilos.body}>
          {blocoUx === 1 ? <div style={estilos.instrucao}>{INSTRUCAO_BLOCO_1}</div> : null}
          <div style={estilos.blocoLabel}>
            Bloco {blocoUx} de {PERFIL_INDIVIDUAL_TOTAL_BLOCOS}
          </div>
          {itensBlocoAtual.map((item) => (
            <ItemRender
              key={item.id}
              item={item}
              valor={respostasLocais[item.id]}
              onResponder={handleResponder}
              desabilitado={enviandoAcao}
            />
          ))}
        </div>

        {/* FOOTER */}
        <div style={estilos.footer}>
          <button
            type="button"
            onClick={handleAnterior}
            disabled={anteriorDisabled}
            style={estilos.btnAnterior(anteriorDisabled)}
          >
            ← Bloco anterior
          </button>
          <div style={estilos.footerInfo}>
            Bloco {blocoUx} de {PERFIL_INDIVIDUAL_TOTAL_BLOCOS} ·{' '}
            {PERFIL_INDIVIDUAL_ITENS_POR_BLOCO} itens
          </div>
          <button
            type="button"
            onClick={() => {
              if (ehBlocoFinal) {
                void handleEnviarFinal();
              } else {
                void handleProximo();
              }
            }}
            disabled={avancarDisabled}
            style={estilos.btnAvancar(ehBlocoFinal, avancarDisabled)}
          >
            {ehBlocoFinal ? 'Enviar respostas ✓' : 'Próximo bloco →'}
          </button>
        </div>

        {erroTransiente !== null ? (
          <div style={estilos.erroTransiente} role="alert">
            {erroTransiente}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// Sub-componentes de item (3 tipos canonicos)
// ============================================================

interface ItemRenderProps {
  readonly item: PerfilIndividualItem;
  readonly valor: string | number | undefined;
  readonly onResponder: (item: PerfilIndividualItem, valor: string | number) => void;
  readonly desabilitado: boolean;
}

function ItemRender(props: ItemRenderProps): JSX.Element {
  const { item, valor, onResponder, desabilitado } = props;
  return (
    <div style={estilos.itemWrapper}>
      <div style={estilos.itemEnunciado}>
        <span style={estilos.itemNumero}>{item.numero}.</span>
        {item.enunciado}
      </div>
      {item.tipo === 'likert' ? (
        <LikertOpcoes
          item={item}
          valor={typeof valor === 'number' ? valor : undefined}
          onResponder={onResponder}
          desabilitado={desabilitado}
        />
      ) : (
        <AlternativaOpcoes
          item={item}
          valor={typeof valor === 'string' ? valor : undefined}
          onResponder={onResponder}
          desabilitado={desabilitado}
        />
      )}
    </div>
  );
}

interface LikertOpcoesProps {
  readonly item: PerfilIndividualItem;
  readonly valor: number | undefined;
  readonly onResponder: (item: PerfilIndividualItem, valor: string | number) => void;
  readonly desabilitado: boolean;
}

function LikertOpcoes(props: LikertOpcoesProps): JSX.Element {
  const { item, valor, onResponder, desabilitado } = props;
  return (
    <div style={estilos.likertTrack}>
      {LIKERT_LEGENDAS.map((leg, idx) => {
        const v = idx + 1;
        const selecionada = valor === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onResponder(item, v)}
            disabled={desabilitado}
            style={estilos.likertOption(selecionada, desabilitado)}
          >
            <span style={estilos.likertNum(selecionada)}>{v}</span>
            <span style={estilos.likertRot(selecionada)}>{leg}</span>
          </button>
        );
      })}
    </div>
  );
}

interface AlternativaOpcoesProps {
  readonly item: PerfilIndividualItem;
  readonly valor: string | undefined;
  readonly onResponder: (item: PerfilIndividualItem, valor: string | number) => void;
  readonly desabilitado: boolean;
}

function AlternativaOpcoes(props: AlternativaOpcoesProps): JSX.Element {
  const { item, valor, onResponder, desabilitado } = props;
  const opcoes = item.opcoes ?? [];
  return (
    <div style={estilos.efContainer}>
      {opcoes.map((texto, idx) => {
        const letra = LETRAS_ALTERNATIVAS[idx] ?? '?';
        const selecionada = valor === letra;
        return (
          <button
            key={letra}
            type="button"
            onClick={() => onResponder(item, letra)}
            disabled={desabilitado}
            style={estilos.efCard(selecionada, desabilitado)}
          >
            <span style={estilos.efLetra(selecionada)}>{letra}</span>
            <span style={estilos.efTexto(selecionada)}>{texto}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Helpers puros
// ============================================================

function formatarEnviadoEm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} às ${hh}h${mi}`;
}

// ============================================================
// Estilos (CSSProperties factories — bit-a-bit DOC 05 §7.5)
// ============================================================

const estilos = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: OVERLAY,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 100,
  } as CSSProperties,
  overlayVazio: {
    position: 'fixed',
    inset: 0,
    background: OVERLAY,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 100,
  } as CSSProperties,
  msgLoading: {
    background: '#FFFFFF',
    borderRadius: 12,
    padding: '32px 40px',
    color: TEXT_3,
    fontSize: 13,
  } as CSSProperties,
  modalQuiz: {
    background: '#FFFFFF',
    borderRadius: 14,
    width: '80%',
    maxWidth: 760,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  } as CSSProperties,
  modalErroFatal: {
    background: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
    textAlign: 'center' as const,
  } as CSSProperties,
  erroFatalTitulo: {
    fontSize: 15,
    fontWeight: 700,
    color: TEXT_1,
  } as CSSProperties,
  erroFatalMsg: {
    fontSize: 13,
    color: TEXT_3,
    lineHeight: 1.5,
  } as CSSProperties,
  btnFecharErroFatal: {
    marginTop: 8,
    padding: '10px 22px',
    borderRadius: 8,
    border: 'none',
    background: NAVY,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  header: {
    background: NAVY,
    padding: '16px 20px 12px',
    flexShrink: 0,
  } as CSSProperties,
  headerTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  } as CSSProperties,
  titulo: {
    fontSize: 14,
    fontWeight: 700,
    color: '#FFFFFF',
  } as CSSProperties,
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as CSSProperties,
  btnSalvarDepois: {
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    cursor: 'pointer',
  } as CSSProperties,
  btnFecharQuiz: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as CSSProperties,
  progressoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as CSSProperties,
  progressoLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  } as CSSProperties,
  progressoTrack: {
    flex: 1,
    height: 5,
    background: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  } as CSSProperties,
  progressoFill: {
    height: '100%',
    borderRadius: 3,
    background: TEAL,
    transition: 'width .4s ease',
  } as CSSProperties,
  progressoPct: {
    fontSize: 11,
    fontWeight: 600,
    color: TEAL,
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '24px 28px',
  } as CSSProperties,
  instrucao: {
    background: TEAL_BG,
    border: `1px solid ${TEAL_BORDER}`,
    borderRadius: 10,
    padding: '12px 16px',
    marginBottom: 20,
    fontSize: 12,
    color: TEAL_TX,
    lineHeight: 1.6,
  } as CSSProperties,
  blocoLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: TEXT_4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 16,
  } as CSSProperties,
  itemWrapper: {
    marginBottom: 22,
    paddingTop: 16,
    borderTop: '1px dashed #F3F4F6',
  } as CSSProperties,
  itemEnunciado: {
    fontSize: 13,
    fontWeight: 500,
    color: TEXT_1,
    lineHeight: 1.55,
    marginBottom: 12,
  } as CSSProperties,
  itemNumero: {
    fontSize: 11,
    fontWeight: 600,
    color: TEXT_4,
    marginRight: 6,
  } as CSSProperties,
  likertTrack: {
    display: 'flex',
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    overflow: 'hidden',
  } as CSSProperties,
  likertOption: (selecionada: boolean, desabilitado: boolean): CSSProperties => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 4px 8px',
    cursor: desabilitado ? 'not-allowed' : 'pointer',
    borderRight: `1px solid ${BORDER}`,
    background: selecionada ? TEAL : '#FFFFFF',
    border: 'none',
    borderRightStyle: 'solid' as const,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    fontFamily: 'inherit',
    opacity: desabilitado ? 0.6 : 1,
  }),
  likertNum: (selecionada: boolean): CSSProperties => ({
    fontSize: 15,
    fontWeight: 700,
    color: selecionada ? '#FFFFFF' : NAVY,
  }),
  likertRot: (selecionada: boolean): CSSProperties => ({
    fontSize: 10,
    color: selecionada ? '#FFFFFF' : TEXT_4,
    textAlign: 'center' as const,
    marginTop: 2,
  }),
  efContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  } as CSSProperties,
  efCard: (selecionada: boolean, desabilitado: boolean): CSSProperties => ({
    border: `1.5px solid ${selecionada ? TEAL : INPUT_BORDER}`,
    borderRadius: 10,
    padding: '13px 16px',
    cursor: desabilitado ? 'not-allowed' : 'pointer',
    background: selecionada ? TEAL_SEL_BG : '#FFFFFF',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    opacity: desabilitado ? 0.6 : 1,
  }),
  efLetra: (selecionada: boolean): CSSProperties => ({
    width: 22,
    height: 22,
    borderRadius: 6,
    background: selecionada ? TEAL : '#F3F4F6',
    color: selecionada ? '#FFFFFF' : NAVY,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11.5,
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 1,
  }),
  efTexto: (selecionada: boolean): CSSProperties => ({
    fontSize: 13,
    color: selecionada ? TEXT_1 : TEXT_2,
    lineHeight: 1.45,
    fontWeight: selecionada ? 500 : 400,
  }),
  footer: {
    padding: '14px 28px',
    background: '#FFFFFF',
    borderTop: `1px solid ${BORDER}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  } as CSSProperties,
  btnAnterior: (disabled: boolean): CSSProperties => ({
    padding: '8px 20px',
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: '#FFFFFF',
    color: TEXT_2,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
  }),
  footerInfo: {
    fontSize: 11,
    color: TEXT_4,
    textAlign: 'center' as const,
    flex: 1,
  } as CSSProperties,
  btnAvancar: (ehBlocoFinal: boolean, disabled: boolean): CSSProperties => ({
    padding: '8px 24px',
    borderRadius: 8,
    border: 'none',
    background: disabled ? '#D1D5DB' : ehBlocoFinal ? TEAL : NAVY,
    color: disabled ? '#9CA3AF' : '#FFFFFF',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  erroTransiente: {
    background: '#FEE2E2',
    color: '#991B1B',
    fontSize: 12,
    fontWeight: 500,
    padding: '10px 20px',
    borderTop: '1px solid #FCA5A5',
    textAlign: 'center' as const,
  } as CSSProperties,
  confirmacaoWrapper: {
    padding: '48px 32px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    gap: 12,
  } as CSSProperties,
  confirmacaoIcone: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: SUCCESS_BG,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 30,
    marginBottom: 6,
  } as CSSProperties,
  confirmacaoTitulo: {
    fontSize: 18,
    fontWeight: 700,
    color: TEXT_1,
  } as CSSProperties,
  confirmacaoSub: {
    fontSize: 13,
    color: TEXT_3,
    lineHeight: 1.55,
    maxWidth: 380,
  } as CSSProperties,
  confirmacaoData: {
    fontSize: 11,
    color: TEXT_4,
    marginBottom: 12,
  } as CSSProperties,
  btnFecharConfirmacao: {
    marginTop: 12,
    padding: '10px 28px',
    borderRadius: 8,
    border: 'none',
    background: NAVY,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
};

// Suprime warnings de constantes reservadas para expansao futura
// (variantes visuais mobile ME-B10-05).
void NAVY_DARK;
void TEAL_DARK;
