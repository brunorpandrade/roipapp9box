// ROIP APP 9BOX — Client orquestrador da aba Instrumentos do painel
// raiz do Super Admin (ME-B11.2).
//
// Maquina de estados leve com 3 views:
//   - 'lista'         -> catalogo dinamico (ordem A, B, C, D, PI)
//   - 'apresentacao'  -> card com as 4 secoes canonicas +
//                        botao [Experiencia do usuario] (quando
//                        aplicavel)
//   - 'experiencia'   -> shell real do instrumento com
//                        `canalAutenticacao='demo'` + `onDemoClose`
//                        que retorna a 'lista'
//
// Persistencia: NENHUMA. Toda interacao e puramente visual
// (RV-11 inaplicavel; demoMode cerra os endpoints nos tres shells).
//
// RV-13 — consumido por `page.tsx` desta mesma rota.
// RV-14 — um statement por linha, largura maxima 100 cols.

'use client';

import { useCallback, useState, type CSSProperties, type JSX } from 'react';

import { LikertFormShell } from '../../../components/instruments/LikertFormShell';
import { Nr1FormShell } from '../../../components/instruments/Nr1FormShell';
// eslint-disable-next-line @stylistic/max-len -- import atomico (prettier)
import { PerfilIndividualFormShell } from '../../../components/instruments/PerfilIndividualFormShell';
import { INSTRUMENT_A_CATALOG } from '../../../lib/instruments/instrumentACatalog';
import { INSTRUMENT_C_CATALOG } from '../../../lib/instruments/instrumentCCatalog';
import { INSTRUMENT_D_CATALOG } from '../../../lib/instruments/instrumentDCatalog';
import {
  findInstrumentDemoEntry,
  listInstrumentDemoEntries,
  type InstrumentDemoEntry,
} from '../../../lib/instruments/instrumentsDemoRegistry';
import { COLORS } from '../../../lib/design-tokens/colors';

const NAVY = '#1F3A5F';
const NAVY_DARK = '#162d4a';
const TEAL = '#14B8A6';
const BORDER = '#E5E7EB';
const BG_SOFT = '#F9FAFB';
const SURFACE = '#FFFFFF';

const DEMO_HREF_PENDENCIAS = '/super-admin/instrumentos';
const DEMO_TRIMESTRE_LABEL = 'Demo';

type View =
  | { readonly kind: 'lista' }
  | { readonly kind: 'apresentacao'; readonly entryId: string }
  | { readonly kind: 'experiencia'; readonly entryId: string };

export function InstrumentosSuperAdminClient(): JSX.Element {
  const [view, setView] = useState<View>({ kind: 'lista' });

  const abrirApresentacao = useCallback((entryId: string): void => {
    setView({ kind: 'apresentacao', entryId });
  }, []);

  const abrirExperiencia = useCallback((entryId: string): void => {
    setView({ kind: 'experiencia', entryId });
  }, []);

  const voltarParaLista = useCallback((): void => {
    setView({ kind: 'lista' });
  }, []);

  if (view.kind === 'lista') {
    return <ListaInstrumentos onSelecionar={abrirApresentacao} />;
  }

  const entry = findInstrumentDemoEntry(view.entryId);
  if (entry === null) {
    return <ListaInstrumentos onSelecionar={abrirApresentacao} />;
  }

  if (view.kind === 'apresentacao') {
    return (
      <ApresentacaoInstrumento
        entry={entry}
        onVoltar={voltarParaLista}
        onIniciarExperiencia={() => abrirExperiencia(entry.id)}
      />
    );
  }

  return <ExperienciaInstrumento entry={entry} onFechar={voltarParaLista} />;
}

// ============================================================
// View 1 — Lista geral de instrumentos
// ============================================================

interface ListaProps {
  readonly onSelecionar: (entryId: string) => void;
}

function ListaInstrumentos(props: ListaProps): JSX.Element {
  const entries = listInstrumentDemoEntries();
  return (
    <div style={containerStyle}>
      <header style={pageHeaderStyle}>
        <h1 style={pageTitleStyle}>Instrumentos</h1>
        <p style={pageSubtitleStyle}>
          Catálogo canônico dos instrumentos do ROIPeople. Clique em um instrumento para ver sua
          descrição e, quando aplicável, experimentar a interface que o colaborador vê ao
          respondê-lo. Nada do que for preenchido aqui é gravado.
        </p>
      </header>

      <div style={listGridStyle}>
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => props.onSelecionar(entry.id)}
            style={listCardStyle}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = TEAL;
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(17,24,39,0.06)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = BORDER;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={listBadgeStyle}>{entry.etiquetaCurta}</div>
            <div style={listTextStyle}>
              <div style={listTituloStyle}>{entry.titulo}</div>
              {entry.subtitulo !== undefined && entry.subtitulo.length > 0 ? (
                <div style={listSubtituloStyle}>{entry.subtitulo}</div>
              ) : null}
              <div style={listPeriodicidadeStyle}>{entry.descricao.periodicidade}</div>
            </div>
            <div style={listChevronStyle}>›</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// View 2 — Apresentacao do instrumento
// ============================================================

interface ApresentacaoProps {
  readonly entry: InstrumentDemoEntry;
  readonly onVoltar: () => void;
  readonly onIniciarExperiencia: () => void;
}

function ApresentacaoInstrumento(props: ApresentacaoProps): JSX.Element {
  const { entry, onVoltar, onIniciarExperiencia } = props;
  const temExperiencia = entry.kind !== 'nao_disponivel';
  return (
    <div style={containerStyle}>
      <button
        type="button"
        onClick={onVoltar}
        style={backLinkStyle}
        onMouseOver={(e) => {
          e.currentTarget.style.color = NAVY_DARK;
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.color = NAVY;
        }}
      >
        ← Voltar à lista de instrumentos
      </button>

      <article style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div style={apresBadgeStyle}>{entry.etiquetaCurta}</div>
          <div>
            <h2 style={cardTitleStyle}>{entry.titulo}</h2>
            {entry.subtitulo !== undefined && entry.subtitulo.length > 0 ? (
              <div style={cardSubtitleStyle}>{entry.subtitulo}</div>
            ) : null}
          </div>
        </div>

        <SecaoApresentacao titulo="O que faz" conteudo={entry.descricao.oQueFaz} />
        <SecaoApresentacao titulo="Para que serve" conteudo={entry.descricao.paraQueServe} />
        <SecaoApresentacao titulo="Periodicidade" conteudo={entry.descricao.periodicidade} />
        <SecaoApresentacao titulo="Quem preenche" conteudo={entry.descricao.quemPreenche} />

        {temExperiencia ? (
          <div style={ctaWrapperStyle}>
            <button
              type="button"
              onClick={onIniciarExperiencia}
              style={ctaButtonStyle}
              onMouseOver={(e) => {
                e.currentTarget.style.background = NAVY_DARK;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = NAVY;
              }}
            >
              Experiência do usuário
            </button>
            <p style={ctaHelperStyle}>
              Abre a mesma tela que o colaborador vê. Suas respostas não são gravadas em nenhum
              momento.
            </p>
          </div>
        ) : (
          <div style={notaBoxStyle}>
            <strong style={notaTitleStyle}>Interface de preenchimento</strong>
            <p style={notaTextStyle}>{entry.notaDisponibilidade}</p>
          </div>
        )}
      </article>
    </div>
  );
}

interface SecaoProps {
  readonly titulo: string;
  readonly conteudo: string;
}

function SecaoApresentacao(props: SecaoProps): JSX.Element {
  return (
    <section style={secaoStyle}>
      <h3 style={secaoTitleStyle}>{props.titulo}</h3>
      <p style={secaoTextStyle}>{props.conteudo}</p>
    </section>
  );
}

// ============================================================
// View 3 — Experiencia do usuario (shell real em canal 'demo')
// ============================================================

interface ExperienciaProps {
  readonly entry: InstrumentDemoEntry;
  readonly onFechar: () => void;
}

function ExperienciaInstrumento(props: ExperienciaProps): JSX.Element {
  const { entry, onFechar } = props;

  if (entry.kind === 'likert_a') {
    return (
      <LikertFormShell
        titulo="Autoavaliação do colaborador"
        subtitulo="Demonstração — nenhuma resposta é gravada"
        trimestreAtual={DEMO_TRIMESTRE_LABEL}
        catalogo={INSTRUMENT_A_CATALOG}
        canalAutenticacao="demo"
        endpointSubmit=""
        hrefPendencias={DEMO_HREF_PENDENCIAS}
        onDemoClose={onFechar}
      />
    );
  }

  if (entry.kind === 'likert_c') {
    return (
      <LikertFormShell
        titulo="Avaliação do colaborador direto — Liderado demo"
        subtitulo="Ciclo Demo · Nenhuma resposta é gravada"
        trimestreAtual={DEMO_TRIMESTRE_LABEL}
        catalogo={INSTRUMENT_C_CATALOG}
        canalAutenticacao="demo"
        endpointSubmit=""
        hrefPendencias={DEMO_HREF_PENDENCIAS}
        onDemoClose={onFechar}
      />
    );
  }

  if (entry.kind === 'likert_d') {
    return (
      <LikertFormShell
        titulo="Avaliação da liderança direta"
        subtitulo="Avaliando: Líder direto · Demonstração — nenhuma resposta é gravada"
        trimestreAtual={DEMO_TRIMESTRE_LABEL}
        catalogo={INSTRUMENT_D_CATALOG}
        canalAutenticacao="demo"
        endpointSubmit=""
        hrefPendencias={DEMO_HREF_PENDENCIAS}
        onDemoClose={onFechar}
      />
    );
  }

  if (entry.kind === 'nr1') {
    return (
      <Nr1FormShell
        canalAutenticacao="demo"
        hrefPendencias={DEMO_HREF_PENDENCIAS}
        onDemoClose={onFechar}
      />
    );
  }

  if (entry.kind === 'perfil_individual') {
    return (
      <PerfilIndividualFormShell
        canalAutenticacao="demo"
        hrefPendencias={DEMO_HREF_PENDENCIAS}
        onDemoClose={onFechar}
      />
    );
  }

  // Fallback defensivo — nunca deveria renderizar porque a view
  // 'experiencia' so e aberta via botao que apenas aparece quando
  // temExperiencia=true.
  return (
    <div style={containerStyle}>
      <p style={{ color: COLORS.text.secondary, fontSize: 14 }}>
        Esta experiência ainda não está disponível para pré-visualização.
      </p>
      <button type="button" onClick={onFechar} style={ctaButtonStyle}>
        Voltar à lista
      </button>
    </div>
  );
}

// ============================================================
// Estilos
// ============================================================

const containerStyle: CSSProperties = {
  padding: 32,
  maxWidth: 1120,
  margin: '0 auto',
};

const pageHeaderStyle: CSSProperties = {
  marginBottom: 28,
};

const pageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 600,
  color: COLORS.text.primary,
};

const pageSubtitleStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 14,
  color: COLORS.text.secondary,
  lineHeight: 1.55,
  maxWidth: 820,
};

const listGridStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const listCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  width: '100%',
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: '18px 20px',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  transition: 'border-color .15s ease-out, box-shadow .15s ease-out',
};

const listBadgeStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 10,
  background: NAVY,
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 15,
  fontWeight: 700,
  flexShrink: 0,
};

const listTextStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
};

const listTituloStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: COLORS.text.primary,
  lineHeight: 1.3,
};

const listSubtituloStyle: CSSProperties = {
  fontSize: 12,
  color: COLORS.text.secondary,
  fontStyle: 'italic',
};

const listPeriodicidadeStyle: CSSProperties = {
  fontSize: 12.5,
  color: COLORS.text.secondary,
  lineHeight: 1.5,
};

const listChevronStyle: CSSProperties = {
  fontSize: 26,
  color: COLORS.text.secondary,
  flexShrink: 0,
  lineHeight: 1,
};

const backLinkStyle: CSSProperties = {
  display: 'inline-block',
  background: 'transparent',
  border: 'none',
  color: NAVY,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
  marginBottom: 20,
  fontFamily: 'inherit',
  transition: 'color .15s ease-out',
};

const cardStyle: CSSProperties = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  padding: '28px 28px 22px 28px',
  boxShadow: '0 1px 2px rgba(17,24,39,0.03)',
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  marginBottom: 20,
  paddingBottom: 18,
  borderBottom: `1px solid ${BORDER}`,
};

const apresBadgeStyle: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 12,
  background: NAVY,
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  fontWeight: 700,
  flexShrink: 0,
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: COLORS.text.primary,
  lineHeight: 1.3,
};

const cardSubtitleStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: COLORS.text.secondary,
  fontStyle: 'italic',
};

const secaoStyle: CSSProperties = {
  marginBottom: 18,
};

const secaoTitleStyle: CSSProperties = {
  margin: '0 0 6px 0',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: NAVY,
};

const secaoTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13.5,
  color: COLORS.text.primary,
  lineHeight: 1.6,
};

const ctaWrapperStyle: CSSProperties = {
  marginTop: 24,
  paddingTop: 20,
  borderTop: `1px solid ${BORDER}`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
};

const ctaButtonStyle: CSSProperties = {
  padding: '12px 22px',
  borderRadius: 8,
  border: 'none',
  background: NAVY,
  color: '#FFFFFF',
  fontSize: 13.5,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background .15s ease-out',
};

const ctaHelperStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: COLORS.text.secondary,
  lineHeight: 1.5,
};

const notaBoxStyle: CSSProperties = {
  marginTop: 24,
  padding: '14px 16px',
  background: BG_SOFT,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
};

const notaTitleStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: NAVY,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
};

const notaTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: COLORS.text.secondary,
  lineHeight: 1.55,
};
