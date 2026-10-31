// ROIP APP 9BOX — rota canonica Bruno `/super-admin/empresa/[id]/lgpd`
// (ME-1.12.b Despacho A, item [1.12.b] do roadmap V4).
//
// Entry point canonico da nova superficie LGPD exclusiva do SA.
// Interface de busca por colaborador (employees + C-levels da empresa)
// + botao "Exportar PDF" que chama
// `GET /api/super-admin/lgpd/exportar?companyId=X&titularType=Y&
// titularId=Z` com o modo canonico `super_admin` (payload completo
// §19.6 integral: cadastrais + respostas brutas aos 4 instrumentos +
// termo de aceite).
//
// Autorizacao canonica: Super Admin apenas, derivada do
// `getServerSession` (defense-in-depth ao middleware `/super-admin/`).
// Qualquer outra sessao redireciona para `/`.
//
// Pattern canonico `§2.1 CAMADA_UI` bit-exact preservado via consumo
// de `Layout`, `resolveMenuItems`, `resolveProfileKey`,
// `findCompanyDisplayInfo`.
//
// **RV-13.** Imports consumidos: `LgpdExportClient` renderizado no
// corpo do Layout; demais helpers no setup canonico pre-render.
// **RV-14.** Um statement por linha, largura maxima 100 cols.

import { notFound, redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { cLevelMembers, employees } from '../../../../../db/schema';
import { COLORS } from '../../../../../lib/design-tokens/colors';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { headerUserFromSession } from '../../../../../lib/session/headerUser';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';

import { LgpdExportClient, type LgpdTitularRow } from './LgpdExportClient';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

function parseCompanyIdParam(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number(raw);
  return n > 0 ? n : null;
}

export default async function LgpdSuperAdminPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    // Carrega employees + C-levels da empresa. Lista integral ordenada
    // por nome para ambos (busca client-side filtra em memoria). Status
    // 'ativo' + 'inativo' incluidos — SA precisa exportar historico
    // canonico de qualquer titular, nao so os ativos.
    const [empRows, clevelRows] = await Promise.all([
      client.db
        .select({
          id: employees.id,
          name: employees.name,
          cpf: employees.cpf,
          cargo: employees.descricaoCBO,
          status: employees.status,
        })
        .from(employees)
        .where(eq(employees.companyId, companyId))
        .orderBy(asc(employees.name)),
      client.db
        .select({
          id: cLevelMembers.id,
          name: cLevelMembers.name,
          cpf: cLevelMembers.cpf,
          cargo: cLevelMembers.cargo,
          status: cLevelMembers.status,
        })
        .from(cLevelMembers)
        .where(and(eq(cLevelMembers.companyId, companyId)))
        .orderBy(asc(cLevelMembers.name)),
    ]);

    const titulares: LgpdTitularRow[] = [
      ...empRows.map((r) => ({
        titularType: 'employee' as const,
        id: r.id,
        name: r.name,
        cpf: r.cpf,
        cargo: r.cargo,
        status: r.status ?? 'ativo',
      })),
      ...clevelRows.map((r) => ({
        titularType: 'clevel' as const,
        id: r.id,
        name: r.name,
        cpf: r.cpf,
        cargo: r.cargo,
        status: r.status ?? 'ativo',
      })),
    ];

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });
    const menuItems = resolveMenuItems(profileKey, false, companyId);
    if (menuItems === null) {
      throw new Error(`Menu canônico ausente para ${profileKey} — inconsistência §3`);
    }

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: headerUserFromSession(session),
          showNotificationBell: true,
        }}
        superAdminContext={{ companyDisplayName: company.nomeFantasia }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: COLORS.text.primary,
                margin: 0,
              }}
            >
              LGPD — Exportação canônica de dados
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 13,
                  fontWeight: 500,
                  color: COLORS.text.secondary,
                }}
              >
                {titulares.length} titular(es)
              </span>
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              Exportação integral §19.6 do titular selecionado (dados cadastrais, respostas aos 4
              instrumentos, Perfil Individual e termo de aceite). Acesso restrito ao Super Admin.
            </p>
          </div>
          <LgpdExportClient companyId={companyId} titulares={titulares} />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
