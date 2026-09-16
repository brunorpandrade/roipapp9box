// ROIP APP 9BOX — Painel de controle do C-level (ME-056 Bloco D).
//
// Origem canonica:
// - DOC 05 §5.1 (estrutura comum), §5.7 (Painel C-level `/painel-clevel`
//   Variacoes A/B/C), §5.9-§5.10 (zonas 9-Box e Status), §4 (Header),
//   §3.8-§3.9 (Menus).
// - DOC 02 §5.2 (sliding 8h), §10.3 (matriz — `/painel-clevel`
//   acessivel a clevel; Bruno redirect a /super-admin; RH/RH-Lider/
//   Lider recebem §9.3).
// - S306 (mínimo canonico D-A Opcao A): total de colaboradores ativos
//   (escopo empresa para acessoTotal=true; cadeia propria em estado
//   §5.2 para acessoTotal=false — cadeia requer traversal complexo);
//   Sino AUSENTE (S474 — C-level nunca destinatario).
// - §5.7 Variacao B/C: badge de escopo canonico "Empresa inteira" ou
//   "Cadeia propria"; Radar da empresa com 6 componentes canonicos
//   estado §5.2 nesta ME (motores Fase 8 vem em MEs futuras).

import { redirect } from 'next/navigation';
import { and, count, eq } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient, type RoipDatabase } from '../../db/client';
import { cLevelMembers, employees } from '../../db/schema';
import { COLORS } from '../../lib/design-tokens/colors';
import {
  loadPlatformMenuContext,
  type PlatformSession,
} from '../../lib/session/platformMenuContext';
import { getServerSession } from '../../server/session/serverSession';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

/**
 * ME-fila6 D1 — total de colaboradores ativos da empresa (employees +
 * C-levels ativos). Flags de menu/RF sairam para `loadPlatformMenuContext`.
 */
async function loadCompanyCollaboratorsCount(
  db: RoipDatabase,
  session: PlatformSession,
): Promise<number> {
  const [empRows, cLevelRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(employees)
      .where(and(eq(employees.companyId, session.companyId), eq(employees.status, 'ativo'))),
    db
      .select({ n: count() })
      .from(cLevelMembers)
      .where(
        and(eq(cLevelMembers.companyId, session.companyId), eq(cLevelMembers.status, 'ativo')),
      ),
  ]);
  return Number(empRows[0]?.n ?? 0) + Number(cLevelRows[0]?.n ?? 0);
}

function StructuralCard(props: {
  readonly title: string;
  readonly value: string;
  readonly sub?: string;
}): JSX.Element {
  return (
    <div
      style={{
        background: COLORS.background.card,
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
        }}
      >
        {props.title}
      </span>
      <span style={{ fontSize: 28, fontWeight: 700, color: COLORS.text.primary }}>
        {props.value}
      </span>
      {props.sub !== undefined ? (
        <span style={{ fontSize: 13, color: COLORS.text.secondary }}>{props.sub}</span>
      ) : null}
    </div>
  );
}

function ComingSoonBlock(props: {
  readonly title: string;
  readonly canonicalText: string;
}): JSX.Element {
  return (
    <div
      style={{
        background: COLORS.background.card,
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
        }}
      >
        {props.title}
      </span>
      <span style={{ fontSize: 14, color: COLORS.text.secondary, lineHeight: 1.5 }}>
        {props.canonicalText}
      </span>
    </div>
  );
}

function ScopeBadge(props: { readonly full: boolean }): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: props.full ? COLORS.badge.tealClaroText : COLORS.badge.warningText,
        background: props.full ? COLORS.badge.tealClaroBg : COLORS.badge.warningBg,
      }}
    >
      {props.full ? 'Empresa inteira' : 'Cadeia própria'}
    </span>
  );
}

// -----------------------------------------------------------------------
// Rota canonica /painel-clevel (§5.7)
// -----------------------------------------------------------------------

export default async function PainelCLevelPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'platform') {
    redirect('/super-admin');
  }
  // ME-080b Dispatch 3 — gate canonico "primeiro acesso".
  if (session.passwordSet === false) {
    redirect('/alterar-senha');
  }
  if (session.role !== 'clevel') {
    if (session.role === 'rh' || session.role === 'rh_lider') {
      redirect('/painel-rh');
    }
    if (session.role === 'lider') {
      redirect('/painel-lider');
    }
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  let menu: Awaited<ReturnType<typeof loadPlatformMenuContext>>;
  let companyCollaboratorsCount: number;
  try {
    menu = await loadPlatformMenuContext(client.db, session);
    companyCollaboratorsCount = await loadCompanyCollaboratorsCount(client.db, session);
  } finally {
    await closeDbClient(client);
  }
  if (menu === null) {
    redirect('/');
  }
  const { profileKey, menuItems } = menu;
  const data = { companyCollaboratorsCount };

  const isFullScope = profileKey === 'clevel_full';

  return (
    <Layout
      menuItems={menuItems}
      header={{
        leftMode: 'in_company',
        companyDisplayName: session.companyDisplayName,
        companyLogoUrl: session.companyLogoUrl ?? undefined,
        user: { displayName: session.displayName },
        // C-level NUNCA tem sino (S474 §4.1).
        showNotificationBell: false,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
          Painel de controle
        </h1>
        <ScopeBadge full={isFullScope} />
      </div>

      {/* Secao 1 — Visao geral §5.7 (Variacoes B e C) */}
      <section style={{ marginTop: 24 }} aria-label="Visão geral">
        <h2
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: COLORS.text.secondary,
            margin: '0 0 12px 0',
          }}
        >
          Visão geral
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {isFullScope ? (
            <StructuralCard
              title="Colaboradores ativos na empresa"
              value={String(data.companyCollaboratorsCount)}
              sub="Visão global"
            />
          ) : (
            <ComingSoonBlock
              title="Colaboradores ativos abaixo dele"
              canonicalText="Coleta de dados em andamento"
            />
          )}
          <ComingSoonBlock title="Liderados diretos" canonicalText="Coleta de dados em andamento" />
          <ComingSoonBlock
            title="Status dados do mês — liderados diretos"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="Status da plataforma"
            canonicalText={
              isFullScope ? 'Coleta de dados em andamento' : 'Coleta de dados em andamento'
            }
          />
          <ComingSoonBlock
            title="9-Box"
            canonicalText={
              isFullScope
                ? 'Disponível a partir da Fase 3. Esta zona se tornará o ponto de entrada do ' +
                  'dashboard global da empresa.'
                : 'Disponível a partir da Fase 3. Esta zona se tornará o ponto de entrada do ' +
                  'dashboard da sua equipe.'
            }
          />
        </div>
      </section>

      {/* Secao 2 — Minha equipe §5.7 (padrao) */}
      <section style={{ marginTop: 32 }} aria-label="Minha equipe">
        <h2
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: COLORS.text.secondary,
            margin: '0 0 12px 0',
          }}
        >
          Minha equipe
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <ComingSoonBlock
            title="Status dos liderados diretos"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="Pendências dos meus liderados"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="Diálogos de desenvolvimento — pendências"
            canonicalText="Coleta de dados em andamento"
          />
        </div>
      </section>

      {/* Secao 3 — Cadeia indireta §5.7 (Variacao C apenas). */}
      {!isFullScope ? (
        <section style={{ marginTop: 32 }} aria-label="Cadeia indireta">
          <h2
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: COLORS.text.secondary,
              margin: '0 0 12px 0',
            }}
          >
            Cadeia indireta
          </h2>
          <ComingSoonBlock
            title="Cadeia descendente"
            canonicalText="Coleta de dados em andamento"
          />
        </section>
      ) : null}

      {/* Secao 4 — Meu portal §5.7 (padrao) */}
      <section style={{ marginTop: 32 }} aria-label="Meu portal">
        <h2
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: COLORS.text.secondary,
            margin: '0 0 12px 0',
          }}
        >
          Meu portal
        </h2>
        {/*
          ME-B9-fechamento CORR4 (D-B9F-PAINEL-LIDER-CARD-MEU-PORTAL-
          NAO-CLICAVEL ENCERRADO — aplicado bit-a-bit tambem ao
          painel-clevel §5.7): card canonico clicavel para a rota
          `/meu-portal` (S238-B). Substitui bit-a-bit o
          ComingSoonBlock estatico que nao expunha entry point
          navegacional para C-levels acessarem suas pendencias.
        */}
        <a
          href="/meu-portal"
          aria-label="Acessar meu portal"
          style={{
            display: 'block',
            padding: '20px 24px',
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 8,
            background: COLORS.background.card,
            textDecoration: 'none',
            transition: 'border-color 120ms ease',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: COLORS.text.tertiary,
              marginBottom: 8,
            }}
          >
            Pendências do portal
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: COLORS.text.primary,
              marginBottom: 4,
            }}
          >
            Acessar meu portal →
          </div>
          <div style={{ fontSize: 13, color: COLORS.text.secondary }}>
            Veja suas pendências nos instrumentos do portal.
          </div>
        </a>
      </section>

      {/* Secao 5 — Radar da empresa §5.7 Fase 8. Todos os 6
          componentes canonicos em estado §5.2 nesta ME (motores
          plugam em MEs futuras B5.3+). Bloco Clima e canonicamente
          visivel mesmo em Variacao C (excecao canonica preservada). */}
      <section style={{ marginTop: 32 }} aria-label="Radar da empresa">
        <h2
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: COLORS.text.secondary,
            margin: '0 0 12px 0',
          }}
        >
          Radar da empresa
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <ComingSoonBlock
            title="Radar dos fatores psicossociais"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="Evolução trimestral 9-Box"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="Financeiro (indicadores agregados)"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="Alertas críticos e estratégicos ativos"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock
            title="Clima e Engajamento"
            canonicalText="Coleta de dados em andamento"
          />
          <ComingSoonBlock title="Tabela IQL" canonicalText="Coleta de dados em andamento" />
        </div>
      </section>
    </Layout>
  );
}
