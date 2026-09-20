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
import type { CSSProperties, JSX, ReactNode } from 'react';

import { COLORS } from '../../../lib/design-tokens/colors';
import { Spinner } from '../../../components/ui/Spinner';
import {
  carregarPerfilRelatorioAction,
  baixarPerfilPdfAction,
  type PerfilRelatorioSnapshot,
} from './perfilRelatorioActions';
import { initialsOf } from './internals';
import {
  DIMENSAO_LABEL,
  DIMENSOES_ORDEM,
  FAIXA_LABEL,
  SECAO_EXPANDIDA_TITULO,
  SUBVETORES_POR_DIMENSAO,
  SUBVETOR_LABEL,
  classificarFaixa,
  type DimensaoPerfil,
  type FaixaPerfil,
  type SubvetorKey,
} from '../../../lib/instruments/individualProfileReportLabels';

const MSG_DESKTOP_ONLY =
  'Esta tela está disponível apenas em dispositivos desktop (viewport ≥ 1024px).';
const MSG_FALHA = 'Erro ao gerar relatório. Tente novamente em alguns instantes.';
const MSG_SEM_RELATORIO =
  'Este colaborador ainda não respondeu ao Perfil Individual. O relatório fica ' +
  'disponível após o envio e o cálculo da avaliação.';

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

function formatEscoreInt(valor: string | null): string {
  if (valor === null) {
    return '—';
  }
  const num = Number(valor);
  if (!Number.isFinite(num)) {
    return '—';
  }
  return String(Math.round(num));
}

function corDaFaixa(faixa: FaixaPerfil): string {
  if (faixa === 'muito_alto') {
    return COLORS.accent.teal;
  }
  if (faixa === 'alto') {
    return COLORS.semantic.success;
  }
  if (faixa === 'medio') {
    return COLORS.semantic.warning;
  }
  return COLORS.semantic.danger;
}

function badgeFaixaStyle(faixa: FaixaPerfil): CSSProperties {
  const mapa: Record<FaixaPerfil, { bg: string; fg: string }> = {
    muito_alto: { bg: COLORS.badge.tealClaroBg, fg: COLORS.badge.tealClaroText },
    alto: { bg: COLORS.badge.successBg, fg: COLORS.badge.successText },
    medio: { bg: COLORS.badge.warningBg, fg: COLORS.badge.warningText },
    baixo: { bg: COLORS.badge.dangerBg, fg: COLORS.badge.dangerText },
    muito_baixo: { bg: COLORS.badge.dangerBg, fg: COLORS.badge.dangerText },
  };
  const c = mapa[faixa];
  return {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 10,
    background: c.bg,
    color: c.fg,
    whiteSpace: 'nowrap',
  };
}

/** Media aritmetica dos subvetores de uma dimensao (0-100). Equilibrio
 *  usa o Indice Geral canonico (`equ_indice`, §5.4.5) quando presente;
 *  as demais derivam da media dos subvetores (DOC 05 omisso na formula
 *  do agregado — derivacao deterministica coerente com EQU_INDICE). */
function escoreDimensao(
  dim: DimensaoPerfil,
  escores: Readonly<Record<string, string | null>>,
): number | null {
  if (dim === 'equilibrio') {
    const indice = escores['equ_indice'];
    if (indice !== null && indice !== undefined && Number.isFinite(Number(indice))) {
      return Number(indice);
    }
  }
  const chaves = SUBVETORES_POR_DIMENSAO[dim];
  const valores: number[] = [];
  for (const k of chaves) {
    const v = escores[k];
    if (v !== null && v !== undefined && Number.isFinite(Number(v))) {
      valores.push(Number(v));
    }
  }
  if (valores.length === 0) {
    return null;
  }
  const soma = valores.reduce((acc, n) => acc + n, 0);
  return soma / valores.length;
}

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
const SECAO_TITULO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: COLORS.text.quaternary,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: 12,
  paddingBottom: 8,
  borderBottom: `1px solid ${COLORS.border.divider}`,
};

function DimensaoRow(props: { dim: DimensaoPerfil; valor: number | null }): JSX.Element {
  const { dim, valor } = props;
  const pct = valor !== null ? Math.max(0, Math.min(100, valor)) : 0;
  const faixa = valor !== null ? classificarFaixa(valor) : null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 5,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.text.secondary }}>
          {DIMENSAO_LABEL[dim]}
        </span>
        {faixa !== null && valor !== null ? (
          <span style={badgeFaixaStyle(faixa)}>
            {FAIXA_LABEL[faixa]} · {Math.round(valor)}
          </span>
        ) : (
          <span style={{ fontSize: 10, color: COLORS.text.quaternary }}>—</span>
        )}
      </div>
      <div style={{ height: 5, background: COLORS.border.default, borderRadius: 3 }}>
        <div
          style={{
            width: `${pct}%`,
            height: 5,
            borderRadius: 3,
            background: faixa !== null ? corDaFaixa(faixa) : COLORS.border.default,
          }}
        />
      </div>
    </div>
  );
}

function SubvetorRow(props: {
  chave: SubvetorKey;
  valor: string | null;
  tag: string | null;
}): JSX.Element {
  const { chave, valor, tag } = props;
  const num = Number(valor);
  const temNum = valor !== null && Number.isFinite(num);
  const pct = temNum ? Math.max(0, Math.min(100, num)) : 0;
  const faixa = temNum ? classificarFaixa(num) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 180, flexShrink: 0, fontSize: 11, color: COLORS.text.tertiary }}>
        {SUBVETOR_LABEL[chave]}
        {tag !== null ? (
          <span
            style={{
              marginLeft: 6,
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 10,
              background: COLORS.badge.infoBg,
              color: COLORS.badge.infoText,
            }}
          >
            {tag}
          </span>
        ) : null}
      </div>
      <div style={{ flex: 1, height: 5, background: COLORS.border.default, borderRadius: 3 }}>
        <div
          style={{
            width: `${pct}%`,
            height: 5,
            borderRadius: 3,
            background: faixa !== null ? corDaFaixa(faixa) : COLORS.border.default,
          }}
        />
      </div>
      <div
        style={{
          width: 36,
          textAlign: 'right',
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 600,
          color: COLORS.text.secondary,
        }}
      >
        {formatEscoreInt(valor)}
      </div>
    </div>
  );
}

function tagDoSubvetor(chave: SubvetorKey, snap: PerfilRelatorioSnapshot): string | null {
  if (chave === snap.vetorDominante) {
    return 'Dominante';
  }
  if (chave === snap.vetorSustentacao) {
    return 'Sustentação';
  }
  if (chave === snap.vetorNegligenciado) {
    return 'Negligenciado';
  }
  const top3 = Array.isArray(snap.top3Assinatura) ? snap.top3Assinatura : [];
  if (top3.includes(chave)) {
    return 'Top 3';
  }
  return null;
}

// ── Render dos textos ricos de IA (system prompt Secao 11) ────────
// resumoJson/expandidoJson chegam como objetos aninhados. Estes
// helpers renderizam paragrafos e listas com coercao defensiva (a
// origem e um LLM).

function riAsStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function riAsList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(riAsStr).filter((s) => s.trim().length > 0);
}

function riGet(obj: unknown, key: string): unknown {
  if (obj !== null && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

function RiParas(props: { texto: unknown }): JSX.Element | null {
  const s = riAsStr(props.texto).trim();
  if (s.length === 0) return null;
  const paras = s.split(/\n{2,}/).map((p) => p.trim());
  return (
    <>
      {paras.map((p, i) => (
        <p
          key={i}
          style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 1.7, margin: '0 0 8px' }}
        >
          {p}
        </p>
      ))}
    </>
  );
}

function RiSubBloco(props: { rotulo: string; texto: unknown }): JSX.Element | null {
  const s = riAsStr(props.texto).trim();
  if (s.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.text.quaternary,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 4,
        }}
      >
        {props.rotulo}
      </div>
      <RiParas texto={s} />
    </div>
  );
}

function RiSubLista(props: { rotulo: string; itens: unknown }): JSX.Element | null {
  const arr = riAsList(props.itens);
  if (arr.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.text.quaternary,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 4,
        }}
      >
        {props.rotulo}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, listStyleType: 'disc' }}>
        {arr.map((r, i) => (
          <li
            key={i}
            style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 1.6, marginBottom: 3 }}
          >
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RiSecao(props: { titulo: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={SECAO_TITULO}>{props.titulo}</div>
      {props.children}
    </div>
  );
}

function TextosSintese(props: { sintese: unknown }): JSX.Element {
  const s = props.sintese;
  return (
    <RiSecao titulo="Síntese executiva">
      <RiSubBloco rotulo="Retrato integrado" texto={riGet(s, 'retrato_integrado')} />
      <RiSubBloco rotulo="Entrega natural" texto={riGet(s, 'entrega_natural')} />
      <RiSubBloco rotulo="Pontos de atenção" texto={riGet(s, 'pontos_atencao')} />
      <RiSubBloco rotulo="Recomendação" texto={riGet(s, 'recomendacao_sintese')} />
    </RiSecao>
  );
}

function TextosRecomendacoes(props: { rec: unknown }): JSX.Element {
  const r = props.rec;
  return (
    <RiSecao titulo="Recomendações executivas">
      <RiSubBloco rotulo="Onde performa melhor" texto={riGet(r, 'onde_performa_melhor')} />
      <RiSubLista rotulo="O que precisa do gestor" itens={riGet(r, 'o_que_precisa_do_gestor')} />
      <RiSubBloco rotulo="Zona de desenvolvimento" texto={riGet(r, 'zona_de_desenvolvimento')} />
      <RiSubLista rotulo="Sinais de alerta" itens={riGet(r, 'sinais_de_alerta')} />
      <RiSubBloco rotulo="Contextos a evitar" texto={riGet(r, 'contextos_a_evitar')} />
    </RiSecao>
  );
}

function TextosResumo(props: { resumo: unknown }): JSX.Element {
  const r = props.resumo;
  return (
    <>
      <TextosSintese sintese={riGet(r, 'sintese_executiva')} />
      <TextosRecomendacoes rec={riGet(r, 'recomendacoes_executivas')} />
    </>
  );
}

function TextosExpandido(props: { exp: unknown }): JSX.Element {
  const e = props.exp;
  return (
    <>
      <TextosSintese sintese={riGet(e, 'sintese_executiva')} />
      <RiSecao titulo="Como essa pessoa age">
        <RiSubBloco
          rotulo="Estilo predominante"
          texto={riGet(riGet(e, 'como_age'), 'estilo_predominante')}
        />
        <RiSubLista
          rotulo="Contribuições típicas"
          itens={riGet(riGet(e, 'como_age'), 'contribuicoes_tipicas')}
        />
        <RiSubLista
          rotulo="Riscos de excesso"
          itens={riGet(riGet(e, 'como_age'), 'riscos_de_excesso')}
        />
        <RiSubBloco
          rotulo="Natural vs. adaptado"
          texto={riGet(riGet(e, 'como_age'), 'natural_vs_adaptado')}
        />
      </RiSecao>
      <RiSecao titulo="Quem essa pessoa é">
        <RiSubBloco
          rotulo="Configuração estrutural"
          texto={riGet(riGet(e, 'quem_e'), 'configuracao_estrutural')}
        />
        <RiSubLista
          rotulo="Implicações práticas"
          itens={riGet(riGet(e, 'quem_e'), 'implicacoes_praticas')}
        />
        <RiSubBloco
          rotulo="Amplifica ou compensa"
          texto={riGet(riGet(e, 'quem_e'), 'amplifica_ou_compensa')}
        />
      </RiSecao>
      <RiSecao titulo="O que move essa pessoa">
        <RiSubBloco
          rotulo="Sustenta o engajamento"
          texto={riGet(riGet(e, 'o_que_move'), 'sustenta_engajamento')}
        />
        <RiSubBloco
          rotulo="Sustenta a energia"
          texto={riGet(riGet(e, 'o_que_move'), 'sustenta_energia')}
        />
        <RiSubLista rotulo="O que esgota" itens={riGet(riGet(e, 'o_que_move'), 'o_que_esgota')} />
        <RiSubBloco
          rotulo="O que sacrifica"
          texto={riGet(riGet(e, 'o_que_move'), 'o_que_sacrifica')}
        />
      </RiSecao>
      <RiSecao titulo="Como reage sob pressão">
        <RiSubBloco
          rotulo="Leitura geral"
          texto={riGet(riGet(e, 'como_reage_sob_pressao'), 'leitura_geral')}
        />
        <RiSubLista
          rotulo="O que faz bem"
          itens={riGet(riGet(e, 'como_reage_sob_pressao'), 'o_que_faz_bem')}
        />
        <RiSubLista
          rotulo="O que deteriora"
          itens={riGet(riGet(e, 'como_reage_sob_pressao'), 'o_que_deteriora')}
        />
        <RiSubBloco
          rotulo="Padrão paradoxal"
          texto={riGet(riGet(e, 'como_reage_sob_pressao'), 'padrao_paradoxal')}
        />
      </RiSecao>
      <RiSecao titulo="No que é naturalmente excelente">
        <RiSubBloco
          rotulo="Assinatura dominante"
          texto={riGet(riGet(e, 'naturalmente_excelente'), 'assinatura_dominante')}
        />
        <RiSubLista
          rotulo="Onde gera valor"
          itens={riGet(riGet(e, 'naturalmente_excelente'), 'onde_gera_valor')}
        />
        <RiSubLista
          rotulo="Riscos de overuse"
          itens={riGet(riGet(e, 'naturalmente_excelente'), 'riscos_de_overuse')}
        />
      </RiSecao>
      <TextosRecomendacoes rec={riGet(e, 'recomendacoes_executivas')} />
    </>
  );
}

function PainelEscores(props: { snap: PerfilRelatorioSnapshot }): JSX.Element {
  const { snap } = props;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={SECAO_TITULO}>Painel de escores por dimensão</div>
      <div
        style={{
          background: COLORS.background.elevated,
          border: `1px solid ${COLORS.border.default}`,
          borderRadius: 10,
          padding: '16px 18px',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.text.quaternary,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 12,
          }}
        >
          Visão geral · escala 0–100
        </div>
        {DIMENSOES_ORDEM.map((dim) => (
          <DimensaoRow key={dim} dim={dim} valor={escoreDimensao(dim, snap.escores)} />
        ))}
      </div>
    </div>
  );
}

function SecaoSubvetores(props: {
  dim: DimensaoPerfil;
  snap: PerfilRelatorioSnapshot;
}): JSX.Element {
  const { dim, snap } = props;
  const chaves = SUBVETORES_POR_DIMENSAO[dim];
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={SECAO_TITULO}>{SECAO_EXPANDIDA_TITULO[dim]}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {chaves.map((k) => (
          <SubvetorRow
            key={k}
            chave={k}
            valor={snap.escores[k] ?? null}
            tag={tagDoSubvetor(k, snap)}
          />
        ))}
        {dim === 'equilibrio' ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              borderTop: `1px solid ${COLORS.border.default}`,
              paddingTop: 8,
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: 180,
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                color: COLORS.primary.navy,
              }}
            >
              Índice geral de equilíbrio
            </div>
            <div style={{ flex: 1, height: 5, background: COLORS.border.default, borderRadius: 3 }}>
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, Number(snap.escores['equ_indice'] ?? 0)))}%`,
                  height: 5,
                  borderRadius: 3,
                  background: COLORS.primary.navy,
                }}
              />
            </div>
            <div
              style={{
                width: 36,
                textAlign: 'right',
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                color: COLORS.primary.navy,
              }}
            >
              {formatEscoreInt(snap.escores['equ_indice'] ?? null)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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

export function PerfilIndividualRelatorioModal(props: Props): JSX.Element {
  const { companyId, userType, userId, onClose } = props;
  const [snap, setSnap] = useState<PerfilRelatorioSnapshot | null>(null);
  const [modo, setModo] = useState<Modo>('resumo');
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semRelatorio, setSemRelatorio] = useState<boolean>(false);
  const [textoFalhou, setTextoFalhou] = useState<boolean>(false);
  const [baixandoPdf, setBaixandoPdf] = useState<boolean>(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const tentativasRef = useRef<number>(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const carregar = useCallback(async (): Promise<void> => {
    const res = await carregarPerfilRelatorioAction({ companyId, userType, userId });
    if (!res.ok) {
      setErro(res.error ?? 'Erro ao carregar o relatório.');
      setCarregando(false);
      return;
    }
    if (res.semRelatorio || res.snapshot === null) {
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

  const textoAusente =
    snap !== null && (snap.gerandoResumo || snap.gerandoExpandido || textoFalhou);
  const dataAplicacao =
    snap?.enviadoEm !== null && snap?.enviadoEm !== undefined
      ? new Date(snap.enviadoEm).toLocaleDateString('pt-BR')
      : '—';

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
            ) : semRelatorio ? (
              <p style={{ fontSize: 13, color: COLORS.text.tertiary, lineHeight: 1.7 }}>
                {MSG_SEM_RELATORIO}
              </p>
            ) : snap !== null ? (
              <>
                {/* Blocos de texto (IA). Ausentes -> estado canonico de
                    carregamento/falha (§9.6/§9.7); presentes -> textos ricos. */}
                {textoAusente ? (
                  <EstadoTextoIA falhou={textoFalhou} onRetry={retryTexto} />
                ) : modo === 'resumo' ? (
                  <TextosResumo resumo={snap.resumoJson} />
                ) : (
                  <TextosExpandido exp={snap.expandidoJson} />
                )}

                {/* Painel de escores deterministico — sempre visivel. */}
                {modo === 'resumo' ? <PainelEscores snap={snap} /> : null}

                {/* Versao expandida — subvetores por dimensao (§9.5). */}
                {modo === 'expandida'
                  ? DIMENSOES_ORDEM.map((dim) => (
                      <SecaoSubvetores key={dim} dim={dim} snap={snap} />
                    ))
                  : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
