'use client';

// ROIP APP 9BOX — client component /super-admin/empresa/[id]/organograma
// (§14.9 + §2.6, ME-077 Patch 2). QUARTA rota de código do bloco B8.
//
// Patch 2 canônico bit-exact (absorção in-place L113 ME-077):
//   - Refino A aprovado: linhas conectoras canônicas bit-exact ao mockup
//     via CSS class-based com pseudo-elementos `::before/::after`
//     (impossível via inline `CSSProperties`). Ajuste técnico canônico:
//     pseudo-elementos do `<li>` com `top: -26px` (não `top: 0` do
//     mockup) — sobem para o espaço vazio do `padding-top` do `<ul>`
//     pai. Bit-exact ao visual do mockup, sem sobreposição do `.node`.
//   - Refino B aprovado: painel resumido renderiza como DRAWER slide-in
//     à direita, com botão fechar `×`. Oculto por default (canvas full-
//     width); aparece ao clicar em qualquer nó; fecha via botão `×` ou
//     clique fora.
//   - D1 mantido (modo analítico diferido → Fase 4): toggle desabilitado.
//   - D2 mantido (dashboards diferidos → Fase 4): todos os botões
//     `[Abrir dashboard]` desabilitados.
//
// Origem canônica:
// - CAMADA_UI §14.9 (organograma — layout árvore + painel resumido +
//   comportamento clique) + §2.6 (cores dos nós).
// - Mockup canônico `organograma_v2.html` (612 linhas) — CSS bit-exact
//   das linhas (linhas 79-97) reproduzido inline via `<style>` tag
//   com adaptação de `top` negativo canonicamente robusta.
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
// Constantes canônicas
// -----------------------------------------------------------------------

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
const ZOOM_INITIAL = 1.0;

const RESUMO_DRAWER_WIDTH = 300;

// -----------------------------------------------------------------------
// CSS canônico bit-exact das linhas conectoras (§14.9 + mockup 79-97)
// -----------------------------------------------------------------------
//
// Injeta como `<style>` inline no componente. Pseudo-elementos
// `::before/::after` são inacessíveis via inline `CSSProperties` — CSS
// class-based é canônica bit-exact.
//
// Adaptação canônica robusta ao gap identificado no mockup: `top: -26px`
// (não `top: 0`) posiciona o pseudo ACIMA da borda superior do `<li>`,
// no espaço vazio do `padding-top: 26px` do `<ul>` pai. Bit-exact ao
// visual do mockup, sem sobreposição das caixas `.node`.

const ORGANOGRAMA_CSS = `
.org-tree,
.org-tree ul {
  list-style: none;
  margin: 0;
  padding-left: 0;
  text-align: center;
}
.org-tree {
  display: inline-flex;
}
.org-tree ul {
  display: flex;
  padding-top: 26px;
  position: relative;
}
.org-tree li {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 14px;
  position: relative;
}
.org-tree li::before,
.org-tree li::after {
  content: '';
  position: absolute;
  top: -26px;
  right: 50%;
  border-top: 2px solid #CBD5E1;
  width: 50%;
  height: 26px;
}
.org-tree li::after {
  right: auto;
  left: 50%;
  border-left: 2px solid #CBD5E1;
}
/* ME-080a — regra ':only-child { display: none }' REMOVIDA (fix */
/* tentativo item 10). Hipótese: linhas somiam entre nível 2 e 3 */
/* quando C-level tinha apenas 1 subordinado, porque o pseudo-       */
/* elemento horizontal era ocultado. Sem essa regra, a linha em T  */
/* aparece mesmo com filho único — visualmente equivalente ao       */
/* organograma canônico. Se produzir efeito colateral visual, */
/* reverter e reabrir com screenshot em ME-080a-bis.                */
.org-tree li:first-child::before {
  border: none;
}
.org-tree li:last-child::after {
  border: none;
}
.org-tree > li::before,
.org-tree > li::after {
  display: none;
}
.org-tree > ul {
  padding-top: 0;
}
.org-tree ul::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  border-left: 2px solid #CBD5E1;
  width: 0;
  height: 26px;
  margin-left: -1px;
}
.org-tree > ul::before {
  display: none;
}
`;

// -----------------------------------------------------------------------
// Helpers puros locais
// -----------------------------------------------------------------------

function resolveInitialExpandedIds(root: OrgTreeNode): Set<string> {
  const ids = new Set<string>();
  ids.add(root.id);
  for (const clevel of root.children) {
    ids.add(clevel.id);
  }
  return ids;
}

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

function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

// -----------------------------------------------------------------------
// Estilos canônicos por tipo de nó
// -----------------------------------------------------------------------

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
// Sub-componente RenderedNode
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
    <li>
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
        <ul>
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

// -----------------------------------------------------------------------
// Sub-componente ResumoDrawer — refino B aprovado ME-077 Patch 2
// -----------------------------------------------------------------------

interface ResumoDrawerProps {
  readonly selectedNode: OrgTreeNode;
  readonly applyPC1b: boolean;
  readonly onClose: () => void;
}

function ResumoDrawer(props: ResumoDrawerProps): JSX.Element {
  const { selectedNode, applyPC1b, onClose } = props;
  const tipoLabel = NODE_TYPE_LABELS[selectedNode.type];
  const isEmpresa = selectedNode.type === 'empresa';
  const showLiderados = !isEmpresa && selectedNode.numLideradosDiretos > 0;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: RESUMO_DRAWER_WIDTH,
        background: COLORS.background.card,
        borderLeft: `1px solid ${COLORS.border.default}`,
        boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        transform: 'translateX(0)',
        transition: 'transform 0.2s ease',
      }}
    >
      {/* Header do drawer com botão fechar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border.default}`,
          background: COLORS.background.elevated,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text.tertiary }}>
          {tipoLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel"
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            border: `1px solid ${COLORS.border.default}`,
            background: COLORS.background.card,
            cursor: 'pointer',
            fontSize: 16,
            color: COLORS.text.secondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Conteúdo do drawer */}
      <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
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

  const handleCloseDrawer = useCallback(() => {
    setSelectedNodeId(null);
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
  const isDrawerOpen = selectedNode !== null;

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
        position: 'relative',
      }}
    >
      {/* CSS canônico bit-exact das linhas conectoras (§14.9) */}
      <style>{ORGANOGRAMA_CSS}</style>

      {/* Toolbar */}
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
        {/* Busca */}
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

        {/* Toggle modo analítico desabilitado (D1 mantida) */}
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

        {/* Zoom controls */}
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

      {/* Body — canvas full-width (drawer sobrepõe quando aberto) */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 500,
          position: 'relative',
        }}
      >
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
            <ul className="org-tree">
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

        {/* Drawer slide-in — só renderiza quando há nó selecionado */}
        {isDrawerOpen && selectedNode !== null && (
          <ResumoDrawer
            selectedNode={selectedNode}
            applyPC1b={applyPC1b}
            onClose={handleCloseDrawer}
          />
        )}
      </div>
    </div>
  );
}
