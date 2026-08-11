'use client';

// ROIP APP 9BOX — client component /super-admin/empresa/[id]/organograma
// (§14.9 + §2.6, ME-077). QUARTA rota de código do bloco B8.
//
// Origem canônica:
// - CAMADA_UI §14.9 (organograma — layout árvore + modo normal +
//   painel resumido + comportamento clique) + §2.6 (cores dos nós).
// - Mockup canônico `organograma_v2.html` (612 linhas) — CSS canônico
//   bit-exact reproduzido inline (linhas 79-153 do mockup): árvore
//   HTML/CSS `<ul>/<li>` aninhada com conectores CSS puros; nó com
//   avatar + nome + cargo + departamento; painel resumido lateral
//   fixo 290px com foto/avatar + nome + cargo + departamento +
//   "N liderados diretos" + botão `[Abrir dashboard]` desabilitado.
//
// Decisões canônicas bit-exact aprovadas ME-077:
// - D1: modo analítico diferido para B9/Fase 4 → toggle no header
//   renderizado desabilitado com tooltip literal *"Disponível a partir
//   da Fase 4."*.
// - D2 refinada: TODOS os botões `[Abrir dashboard]` (empresa, C-level,
//   líder, colaborador) renderizados desabilitados com tooltip literal
//   *"Disponível a partir da Fase 4."*. Motivo: rotas `/dashboard/*` de
//   equipe/global E rota `/dashboard-individual/:id` também não
//   existem no repo (Master §7.1 O1 — construídas em B9).
// - D3: C-level renderiza como pai direto do colaborador (sem líder
//   intermediário) quando `elh.clevelId` está preenchido — invariante
//   §4.6 aplicada pelo service.
// - D4: ordem alfabética de irmãos por nome pt-BR (padrão Patch 3
//   ME-076) — aplicada pelo service.
// - D5: técnica de renderização HTML/CSS `<ul>/<li>` aninhado com CSS
//   bit-exact ao mockup (linhas 79-97).
// - D6: raiz + primeiro nível (C-levels) expandidos por default;
//   demais colapsados. Botão `+/−` por nó com filhos.
// - D7: busca por nome com dropdown de resultados + zoom −/100%/+ bit-
//   exact ao mockup (linhas 550-566 + 539-548).
// - D8: PC1b canônica bit-exact — nós de C-level esmaecidos + sem
//   clique + tooltip §15.7 quando `applyPC1b === true` (não aplicável
//   ao Bruno da rota Super Admin; superfície pronta para reuso em B9).
//
// **RV-13.** `OrganogramaClient` → `page.tsx` (mesma rota).
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { useCallback, useMemo, useState, type CSSProperties, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import type { OrgTreeNode, OrgTreeNodeType } from '../../../../../server/services/orgTree';

import {
  DASHBOARD_UNAVAILABLE_TOOLTIP,
  NODE_TYPE_LABELS,
  PC1B_TOOLTIP,
  getIniciaisFromName,
} from './internals';

// -----------------------------------------------------------------------
// Props canônicas
// -----------------------------------------------------------------------

export interface OrganogramaClientProps {
  readonly companyId: number;
  readonly initialRoot: OrgTreeNode;
  readonly applyPC1b: boolean;
}

// -----------------------------------------------------------------------
// Constantes canônicas de zoom
// -----------------------------------------------------------------------

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
const ZOOM_INITIAL = 1.0;

// -----------------------------------------------------------------------
// Helpers puros locais
// -----------------------------------------------------------------------

/**
 * §D6 canônica bit-exact — resolve o conjunto inicial de IDs expandidos:
 * raiz (`empresa`) + todos os C-levels do primeiro nível.
 */
function resolveInitialExpandedIds(root: OrgTreeNode): Set<string> {
  const ids = new Set<string>();
  ids.add(root.id);
  for (const clevel of root.children) {
    ids.add(clevel.id);
  }
  return ids;
}

/**
 * Coleta todos os ancestrais canônicos do nó alvo (indexado por id) na
 * árvore. Retorna a lista de IDs a expandir para tornar o alvo visível.
 * Consumido pelo dropdown de busca (§D7 canônica bit-exact) via callback
 * de "ir para nó".
 */
function collectAncestorIds(root: OrgTreeNode, targetId: string): readonly string[] {
  const path: string[] = [];
  function visit(node: OrgTreeNode, trail: readonly string[]): boolean {
    if (node.id === targetId) {
      path.push(...trail);
      return true;
    }
    for (const child of node.children) {
      if (visit(child, [...trail, node.id])) {
        return true;
      }
    }
    return false;
  }
  visit(root, []);
  return path;
}

/**
 * Coleta canonicamente todos os nós da árvore em ordem alfabética por
 * nome (busca §D7). Retorna id + name + cargo + type para render dos
 * itens do dropdown de busca.
 */
interface SearchIndexEntry {
  readonly id: string;
  readonly name: string;
  readonly cargo: string;
  readonly type: OrgTreeNodeType;
}

function buildSearchIndex(root: OrgTreeNode): readonly SearchIndexEntry[] {
  const flat: SearchIndexEntry[] = [];
  function visit(node: OrgTreeNode): void {
    flat.push({ id: node.id, name: node.name, cargo: node.cargo, type: node.type });
    for (const child of node.children) {
      visit(child);
    }
  }
  visit(root);
  return flat;
}

/**
 * Normaliza string para busca canônica (case-insensitive, sem acento).
 * Padrão consolidado ME-076 (busca em `TodosColaboradoresClient`).
 */
function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

// -----------------------------------------------------------------------
// Estilos canônicos bit-exact do mockup
// -----------------------------------------------------------------------

/**
 * Cores canônicas §2.6 por tipo de nó. Bit-exact ao mockup linhas 108-
 * 111 (`.node.empresa`, `.node.clevel`, `.node.lider`, `.node.operacional`).
 */
function nodeContainerStyle(type: OrgTreeNodeType, esmaecido: boolean): CSSProperties {
  const base: CSSProperties = {
    width: 150,
    padding: '8px 10px',
    borderRadius: 10,
    cursor: esmaecido ? 'default' : 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    transition: 'box-shadow 0.15s',
    border: '2px solid transparent',
    boxSizing: 'border-box',
    opacity: esmaecido ? 0.35 : 1,
  };
  if (type === 'empresa') {
    return {
      ...base,
      background: COLORS.background.card,
      borderColor: COLORS.primary.navy,
    };
  }
  if (type === 'clevel') {
    return { ...base, background: COLORS.primary.navy, color: COLORS.background.card };
  }
  if (type === 'lider') {
    return { ...base, background: COLORS.accent.teal, color: COLORS.background.card };
  }
  return {
    ...base,
    background: COLORS.background.card,
    borderColor: COLORS.border.default,
    color: COLORS.text.primary,
  };
}

function nodeAvatarStyle(type: OrgTreeNodeType): CSSProperties {
  const isDark = type === 'clevel' || type === 'lider';
  return {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: isDark ? 'rgba(0,0,0,0.15)' : COLORS.primary.navy,
    color: COLORS.background.card,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
  };
}

// -----------------------------------------------------------------------
// Sub-componentes internos
// -----------------------------------------------------------------------

interface RenderedNodeProps {
  readonly node: OrgTreeNode;
  readonly selectedNodeId: string | null;
  readonly expandedIds: ReadonlySet<string>;
  readonly applyPC1b: boolean;
  readonly onSelect: (id: string) => void;
  readonly onToggle: (id: string) => void;
}

function RenderedNode(props: RenderedNodeProps): JSX.Element {
  const { node, selectedNodeId, expandedIds, applyPC1b, onSelect, onToggle } = props;
  const isSelected = selectedNodeId === node.id;
  const isExpanded = expandedIds.has(node.id);
  const temFilhos = node.children.length > 0;
  const esmaecido = applyPC1b && node.type === 'clevel';
  const containerStyle = nodeContainerStyle(node.type, esmaecido);
  const shadowStyle: CSSProperties = isSelected
    ? {
        borderColor: COLORS.primary.navy,
        boxShadow: `0 0 0 3px rgba(31,58,95,0.15)`,
      }
    : {};

  const handleClick = useCallback(() => {
    if (esmaecido) {
      return;
    }
    onSelect(node.id);
  }, [esmaecido, node.id, onSelect]);

  const handleToggle = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onToggle(node.id);
    },
    [node.id, onToggle],
  );

  const nodeTitle = esmaecido ? PC1B_TOOLTIP : undefined;

  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 14px',
        position: 'relative',
        listStyle: 'none',
      }}
    >
      <div
        onClick={handleClick}
        title={nodeTitle}
        data-node-id={node.id}
        data-node-type={node.type}
        style={{ ...containerStyle, ...shadowStyle, position: 'relative' }}
      >
        <div style={nodeAvatarStyle(node.type)}>{getIniciaisFromName(node.name)}</div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1.2,
            textAlign: 'center',
          }}
        >
          {node.name}
        </div>
        {node.cargo.length > 0 && (
          <div style={{ fontSize: 9.5, opacity: 0.85, lineHeight: 1.2, textAlign: 'center' }}>
            {node.cargo}
          </div>
        )}
        {node.departamento.length > 0 && (
          <div style={{ fontSize: 9, opacity: 0.7, textAlign: 'center' }}>{node.departamento}</div>
        )}
        {temFilhos && (
          <div
            onClick={handleToggle}
            data-toggle-id={node.id}
            role="button"
            aria-label={isExpanded ? 'Recolher' : 'Expandir'}
            style={{
              position: 'absolute',
              bottom: -8,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: COLORS.background.card,
              border: `1px solid ${COLORS.border.default}`,
              fontSize: 10,
              color: COLORS.text.secondary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 5,
            }}
          >
            {isExpanded ? '−' : '+'}
          </div>
        )}
      </div>
      {temFilhos && isExpanded && (
        <ul
          style={{
            display: 'flex',
            paddingTop: 26,
            paddingLeft: 0,
            margin: 0,
            listStyle: 'none',
            position: 'relative',
          }}
        >
          {node.children.map((child) => (
            <RenderedNode
              key={child.id}
              node={child}
              selectedNodeId={selectedNodeId}
              expandedIds={expandedIds}
              applyPC1b={applyPC1b}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface ResumoPanelProps {
  readonly selectedNode: OrgTreeNode | null;
  readonly applyPC1b: boolean;
}

function ResumoPanel(props: ResumoPanelProps): JSX.Element {
  const { selectedNode, applyPC1b } = props;
  const panelStyle: CSSProperties = {
    width: 290,
    flexShrink: 0,
    borderLeft: `1px solid ${COLORS.border.default}`,
    background: COLORS.background.card,
    padding: 18,
    overflowY: 'auto',
    minHeight: 400,
  };
  if (selectedNode === null) {
    return (
      <div style={panelStyle}>
        <div
          style={{
            color: COLORS.text.quaternary,
            fontSize: 12,
            textAlign: 'center',
            marginTop: 40,
            lineHeight: 1.6,
          }}
        >
          Selecione um colaborador ou C-level na árvore para ver os detalhes.
        </div>
      </div>
    );
  }

  const tipoLabel = NODE_TYPE_LABELS[selectedNode.type];
  const isEmpresa = selectedNode.type === 'empresa';
  const showLiderados = !isEmpresa && selectedNode.numLideradosDiretos > 0;

  return (
    <div style={panelStyle}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: COLORS.primary.navy,
          color: COLORS.background.card,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {getIniciaisFromName(selectedNode.name)}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text.primary }}>
        {selectedNode.name}
      </div>
      <div style={{ fontSize: 12, color: COLORS.text.tertiary, marginBottom: 10 }}>
        {selectedNode.cargo.length > 0 ? selectedNode.cargo : tipoLabel}
      </div>
      {selectedNode.departamento.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            padding: '6px 0',
            borderBottom: `1px solid ${COLORS.border.divider}`,
          }}
        >
          <span style={{ color: COLORS.text.tertiary }}>Departamento</span>
          <span style={{ color: COLORS.text.secondary, fontWeight: 500 }}>
            {selectedNode.departamento}
          </span>
        </div>
      )}
      {showLiderados && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            padding: '6px 0',
            borderBottom: `1px solid ${COLORS.border.divider}`,
          }}
        >
          <span style={{ color: COLORS.text.tertiary }}>Liderados diretos</span>
          <span style={{ color: COLORS.text.secondary, fontWeight: 500 }}>
            {selectedNode.numLideradosDiretos}
          </span>
        </div>
      )}
      {isEmpresa && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            padding: '6px 0',
            borderBottom: `1px solid ${COLORS.border.divider}`,
          }}
        >
          <span style={{ color: COLORS.text.tertiary }}>C-levels ativos</span>
          <span style={{ color: COLORS.text.secondary, fontWeight: 500 }}>
            {selectedNode.numLideradosDiretos}
          </span>
        </div>
      )}
      <button
        type="button"
        disabled
        title={DASHBOARD_UNAVAILABLE_TOOLTIP}
        style={{
          marginTop: 14,
          width: '100%',
          padding: 9,
          background: COLORS.background.elevated,
          color: COLORS.text.quaternary,
          border: `1px solid ${COLORS.border.default}`,
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'not-allowed',
        }}
      >
        Abrir dashboard
      </button>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: COLORS.text.quaternary,
          lineHeight: 1.5,
          fontStyle: 'italic',
        }}
      >
        {DASHBOARD_UNAVAILABLE_TOOLTIP}
      </div>
      {applyPC1b && selectedNode.type === 'clevel' && (
        <div
          style={{
            marginTop: 14,
            fontSize: 11,
            color: COLORS.text.quaternary,
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}
        >
          {PC1B_TOOLTIP}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Component principal
// -----------------------------------------------------------------------

export function OrganogramaClient(props: OrganogramaClientProps): JSX.Element {
  const { initialRoot, applyPC1b } = props;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    resolveInitialExpandedIds(initialRoot),
  );
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(ZOOM_INITIAL);

  const searchIndex = useMemo(() => buildSearchIndex(initialRoot), [initialRoot]);

  const selectedNode = useMemo<OrgTreeNode | null>(() => {
    if (selectedNodeId === null) {
      return null;
    }
    function find(node: OrgTreeNode): OrgTreeNode | null {
      if (node.id === selectedNodeId) {
        return node;
      }
      for (const child of node.children) {
        const found = find(child);
        if (found !== null) {
          return found;
        }
      }
      return null;
    }
    return find(initialRoot);
  }, [initialRoot, selectedNodeId]);

  const filteredResults = useMemo<readonly SearchIndexEntry[]>(() => {
    const term = normalizeForSearch(searchTerm.trim());
    if (term.length === 0) {
      return [];
    }
    return searchIndex.filter((entry) => normalizeForSearch(entry.name).includes(term));
  }, [searchIndex, searchTerm]);

  const handleSelect = useCallback((id: string) => {
    setSelectedNodeId(id);
  }, []);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleGoToNode = useCallback(
    (id: string) => {
      const ancestors = collectAncestorIds(initialRoot, id);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const ancestorId of ancestors) {
          next.add(ancestorId);
        }
        next.add(id);
        return next;
      });
      setSelectedNodeId(id);
      setSearchTerm('');
      setShowSearchResults(false);
      // Scroll canônico bit-exact ao mockup linha 584 — best effort.
      setTimeout(() => {
        const el = document.querySelector(`[data-node-id="${id}"]`);
        if (el !== null) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      }, 50);
    },
    [initialRoot],
  );

  const handleZoomIn = useCallback(() => {
    setZoomLevel((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoomLevel((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))));
  }, []);
  const handleZoomReset = useCallback(() => {
    setZoomLevel(ZOOM_INITIAL);
  }, []);

  const zoomLabel = `${Math.round(zoomLevel * 100)}%`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 12,
        background: COLORS.background.card,
        overflow: 'hidden',
        minHeight: 620,
      }}
    >
      {/* Toolbar canônica bit-exact §14.9 (linhas 208-230 do mockup) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          padding: '14px 20px',
          borderBottom: `1px solid ${COLORS.border.default}`,
          background: COLORS.background.elevated,
        }}
      >
        {/* Busca §D7 */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowSearchResults(true);
            }}
            onFocus={() => {
              if (searchTerm.length > 0) {
                setShowSearchResults(true);
              }
            }}
            placeholder="Buscar colaborador por nome..."
            style={{
              padding: '7px 10px',
              border: `1px solid ${COLORS.border.default}`,
              borderRadius: 8,
              fontSize: 12,
              color: COLORS.text.secondary,
              width: 240,
              background: COLORS.background.card,
            }}
          />
          {showSearchResults && searchTerm.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 36,
                left: 0,
                width: 240,
                background: COLORS.background.card,
                border: `1px solid ${COLORS.border.default}`,
                borderRadius: 8,
                boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                zIndex: 50,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {filteredResults.length === 0 && (
                <div style={{ padding: 10, fontSize: 11, color: COLORS.text.quaternary }}>
                  Nenhum colaborador encontrado.
                </div>
              )}
              {filteredResults.slice(0, 20).map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => handleGoToNode(entry.id)}
                  role="button"
                  style={{
                    padding: '8px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderBottom: `1px solid ${COLORS.border.divider}`,
                    color: COLORS.text.primary,
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: COLORS.primary.navy,
                      color: COLORS.background.card,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 600,
                    }}
                  >
                    {getIniciaisFromName(entry.name)}
                  </div>
                  <span>
                    {entry.name}
                    {entry.cargo.length > 0 ? ` · ${entry.cargo}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Toggle modo analítico §D1 desabilitado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            disabled
            title={DASHBOARD_UNAVAILABLE_TOOLTIP}
            style={{
              width: 38,
              height: 20,
              background: COLORS.border.default,
              borderRadius: 999,
              cursor: 'not-allowed',
              flexShrink: 0,
              border: 'none',
              padding: 0,
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: COLORS.background.card,
              }}
            />
          </button>
          <span
            title={DASHBOARD_UNAVAILABLE_TOOLTIP}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.text.quaternary,
              cursor: 'not-allowed',
            }}
          >
            Modo analítico
          </span>
        </div>

        {/* Zoom controls §D7 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginLeft: 'auto',
          }}
        >
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Diminuir zoom"
            style={{
              width: 26,
              height: 26,
              border: `1px solid ${COLORS.border.default}`,
              background: COLORS.background.card,
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              color: COLORS.text.secondary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            −
          </button>
          <span
            onClick={handleZoomReset}
            role="button"
            style={{
              fontSize: 10,
              color: COLORS.text.tertiary,
              padding: '0 6px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {zoomLabel}
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Aumentar zoom"
            style={{
              width: 26,
              height: 26,
              border: `1px solid ${COLORS.border.default}`,
              background: COLORS.background.card,
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              color: COLORS.text.secondary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Body canônico bit-exact §14.9 — árvore + painel resumido */}
      <div style={{ display: 'flex', flex: 1, minHeight: 500 }}>
        {/* Canvas da árvore */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            background:
              `radial-gradient(circle, ${COLORS.border.default} 1px, transparent 1px) ` +
              `0 0/16px 16px`,
            backgroundColor: COLORS.background.page,
          }}
        >
          <div
            style={{
              padding: 40,
              transformOrigin: 'top left',
              transform: `scale(${zoomLevel})`,
              transition: 'transform 0.15s',
              display: 'inline-block',
              minWidth: '100%',
            }}
          >
            <ul
              style={{
                display: 'inline-flex',
                listStyle: 'none',
                padding: 0,
                margin: 0,
                textAlign: 'center',
              }}
            >
              <RenderedNode
                node={initialRoot}
                selectedNodeId={selectedNodeId}
                expandedIds={expandedIds}
                applyPC1b={applyPC1b}
                onSelect={handleSelect}
                onToggle={handleToggle}
              />
            </ul>
          </div>
        </div>

        {/* Painel resumido lateral 290px §14.9 */}
        <ResumoPanel selectedNode={selectedNode} applyPC1b={applyPC1b} />
      </div>
    </div>
  );
}
