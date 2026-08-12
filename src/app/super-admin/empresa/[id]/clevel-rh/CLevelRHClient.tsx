// ROIP APP 9BOX — client component canônico bit-exact da rota Bruno
// `/super-admin/empresa/[id]/clevel-rh` (§5.4 + §13.9 derivado + §3.5
// MASTER_ESCOPO_B8, ME-078a).
//
// Componentiza canonicamente bit-exact:
// - 2 abas horizontais canônicas (`clevels` + `rh`), com switching
//   client-side sem navegação server-side.
// - Aba 1 canonica bit-exact §5.4: tabela de C-levels ativos + inativos,
//   colunas Foto/Nome/Cargo/Departamento/`acessoTotal`/RF badge/Status.
//   Botão `[+ Cadastrar C-level]` primário → `/clevel/novo` (Link).
//   Clique em linha → `/clevel/[cLevelId]/editar` (Link).
// - Aba 2 canonica bit-exact §5.4 + §13.9: tabela de colaboradores com
//   `isRH=true`, colunas reduzidas Foto/Nome/Cargo/Departamento/isLider/
//   RF badge/Status. Botão `[+ Cadastrar novo RH]` DESABILITADO no MVP
//   com tooltip canônico bit-exact (S503 precedente).
//
// **RV-13.** `getIniciaisFromName`, `CLEVEL_RH_TABS`, `CADASTRAR_RH_
// UNAVAILABLE_TOOLTIP` consumidos daqui.

'use client';

import Link from 'next/link';
import { useMemo, useState, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import type { CLevelListRow, ListCLevelResult } from '../../../../../server/routers/cLevelMembers';
import type { ListRHResult, RHListRow } from '../../../../../server/routers/employees';

import { CLEVEL_RH_TABS, getIniciaisFromName, type CLevelRHTab } from './internals';

interface Props {
  readonly companyId: number;
  readonly initialTab: CLevelRHTab;
  readonly initialClevels: ListCLevelResult;
  readonly initialRHs: ListRHResult;
}

// -----------------------------------------------------------------------
// Estilos canonicos bit-exact
// -----------------------------------------------------------------------

const CARD_STYLE = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  padding: 16,
} as const;

const TABLE_STYLE = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  fontSize: 13,
};

const TH_STYLE = {
  textAlign: 'left' as const,
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: COLORS.text.secondary,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.4,
  borderBottom: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.elevated,
};

const TD_STYLE = {
  padding: '12px 12px',
  borderBottom: `1px solid ${COLORS.border.default}`,
  color: COLORS.text.primary,
  verticalAlign: 'middle' as const,
};

const AVATAR_STYLE = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: COLORS.background.elevated,
  border: `1px solid ${COLORS.border.default}`,
  display: 'inline-flex',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  fontSize: 11,
  fontWeight: 600,
  color: COLORS.text.secondary,
  overflow: 'hidden' as const,
};

const BUTTON_PRIMARY_STYLE = {
  background: COLORS.accent.teal,
  color: COLORS.background.card,
  border: 'none',
  borderRadius: 8,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer' as const,
  textDecoration: 'none' as const,
  display: 'inline-flex',
  alignItems: 'center' as const,
  gap: 6,
};

// -----------------------------------------------------------------------
// Renderers helper canonicos
// -----------------------------------------------------------------------

function renderAvatar(name: string, photoUrl: string | null): JSX.Element {
  if (photoUrl !== null && photoUrl.length > 0) {
    return (
      <span style={AVATAR_STYLE}>
        <img
          src={photoUrl}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </span>
    );
  }
  return <span style={AVATAR_STYLE}>{getIniciaisFromName(name)}</span>;
}

function renderStatusBadge(status: 'ativo' | 'inativo'): JSX.Element {
  const isAtivo = status === 'ativo';
  const style = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    background: isAtivo ? '#DCFCE7' : '#FEE2E2',
    color: isAtivo ? '#166534' : '#991B1B',
  } as const;
  return <span style={style}>{isAtivo ? 'Ativo' : 'Inativo'}</span>;
}

function renderRFBadge(isRF: boolean): JSX.Element | null {
  if (!isRF) {
    return null;
  }
  const style = {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    background: '#FEF3C7',
    color: '#78350F',
    marginLeft: 6,
  } as const;
  return <span style={style}>RF</span>;
}

function renderBooleanCell(value: boolean, labelTrue: string, labelFalse: string): JSX.Element {
  return (
    <span style={{ fontSize: 12, color: value ? COLORS.text.primary : COLORS.text.quaternary }}>
      {value ? labelTrue : labelFalse}
    </span>
  );
}

// -----------------------------------------------------------------------
// Sub-componente Aba 1 (C-levels)
// -----------------------------------------------------------------------

function CLevelsTab(props: {
  readonly companyId: number;
  readonly rows: readonly CLevelListRow[];
  readonly totalActive: number;
  readonly totalInactive: number;
}): JSX.Element {
  const { companyId, rows, totalActive, totalInactive } = props;
  return (
    <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text.primary }}>
            C-levels da empresa
          </div>
          <div style={{ fontSize: 12, color: COLORS.text.secondary, marginTop: 2 }}>
            {totalActive} ativo(s) · {totalInactive} inativo(s)
          </div>
        </div>
        <Link href={`/super-admin/empresa/${companyId}/clevel/novo`} style={BUTTON_PRIMARY_STYLE}>
          + Cadastrar C-level
        </Link>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: COLORS.text.secondary,
            fontSize: 13,
          }}
        >
          Nenhum C-level cadastrado nesta empresa ainda.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={TABLE_STYLE}>
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, width: 48 }}>Foto</th>
                <th style={TH_STYLE}>Nome</th>
                <th style={TH_STYLE}>Cargo</th>
                <th style={TH_STYLE}>Departamento</th>
                <th style={TH_STYLE}>Escopo</th>
                <th style={TH_STYLE}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ cursor: 'pointer' }}>
                  <td style={TD_STYLE}>{renderAvatar(row.name, row.photoUrl)}</td>
                  <td style={TD_STYLE}>
                    <Link
                      href={`/super-admin/empresa/${companyId}/clevel/${row.id}/editar`}
                      style={{
                        color: COLORS.text.primary,
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                    >
                      {row.name}
                      {renderRFBadge(row.isResponsavelFinanceiro)}
                    </Link>
                  </td>
                  <td style={TD_STYLE}>{row.cargo}</td>
                  <td style={TD_STYLE}>{row.departamento}</td>
                  <td style={TD_STYLE}>
                    {renderBooleanCell(row.acessoTotal, 'Empresa inteira', 'Cadeia descendente')}
                  </td>
                  <td style={TD_STYLE}>{renderStatusBadge(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Sub-componente Aba 2 (RH)
// -----------------------------------------------------------------------

function RHTab(props: {
  readonly companyId: number;
  readonly rows: readonly RHListRow[];
  readonly totalActive: number;
  readonly totalInactive: number;
}): JSX.Element {
  const { companyId, rows, totalActive, totalInactive } = props;
  return (
    <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text.primary }}>
            Colaboradores com papel de RH
          </div>
          <div style={{ fontSize: 12, color: COLORS.text.secondary, marginTop: 2 }}>
            {totalActive} ativo(s) · {totalInactive} inativo(s)
          </div>
        </div>
        <Link
          href={`/super-admin/empresa/${companyId}/colaborador/novo?preset=rh`}
          style={BUTTON_PRIMARY_STYLE}
        >
          + Cadastrar novo RH
        </Link>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: COLORS.text.secondary,
            fontSize: 13,
          }}
        >
          Nenhum colaborador com papel de RH cadastrado nesta empresa ainda.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={TABLE_STYLE}>
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, width: 48 }}>Foto</th>
                <th style={TH_STYLE}>Nome</th>
                <th style={TH_STYLE}>Cargo</th>
                <th style={TH_STYLE}>Departamento</th>
                <th style={TH_STYLE}>Líder</th>
                <th style={TH_STYLE}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ cursor: 'pointer' }}>
                  <td style={TD_STYLE}>{renderAvatar(row.name, row.photoUrl)}</td>
                  <td style={TD_STYLE}>
                    <Link
                      href={`/super-admin/empresa/${companyId}/colaborador/${row.id}/editar`}
                      style={{
                        color: COLORS.text.primary,
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                    >
                      {row.name}
                      {renderRFBadge(row.isResponsavelFinanceiro)}
                    </Link>
                  </td>
                  <td style={TD_STYLE}>{row.cargo}</td>
                  <td style={TD_STYLE}>{row.departamento}</td>
                  <td style={TD_STYLE}>{renderBooleanCell(row.isLider, 'Sim', 'Não')}</td>
                  <td style={TD_STYLE}>{renderStatusBadge(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Componente principal — 2 abas com tab switcher
// -----------------------------------------------------------------------

export function CLevelRHClient(props: Props): JSX.Element {
  const { companyId, initialTab, initialClevels, initialRHs } = props;
  const [activeTab, setActiveTab] = useState<CLevelRHTab>(initialTab);

  const tabLabels = useMemo(
    () => ({
      clevels: `C-levels (${initialClevels.totalActive})`,
      rh: `RH (${initialRHs.totalActive})`,
    }),
    [initialClevels.totalActive, initialRHs.totalActive],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tabs */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: `1px solid ${COLORS.border.default}`,
        }}
      >
        {CLEVEL_RH_TABS.map((tab) => {
          const isActive = tab === activeTab;
          const style = {
            padding: '10px 20px',
            border: 'none',
            background: 'transparent',
            fontSize: 13,
            fontWeight: 600,
            color: isActive ? COLORS.accent.teal : COLORS.text.secondary,
            borderBottom: isActive ? `2px solid ${COLORS.accent.teal}` : '2px solid transparent',
            cursor: 'pointer' as const,
            marginBottom: -1,
          };
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab)}
              style={style}
            >
              {tabLabels[tab]}
            </button>
          );
        })}
      </div>

      {/* Conteúdo da aba ativa */}
      {activeTab === 'clevels' ? (
        <CLevelsTab
          companyId={companyId}
          rows={initialClevels.rows}
          totalActive={initialClevels.totalActive}
          totalInactive={initialClevels.totalInactive}
        />
      ) : (
        <RHTab
          companyId={companyId}
          rows={initialRHs.rows}
          totalActive={initialRHs.totalActive}
          totalInactive={initialRHs.totalInactive}
        />
      )}
    </div>
  );
}
