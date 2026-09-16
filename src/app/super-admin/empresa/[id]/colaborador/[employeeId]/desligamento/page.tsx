// ROIP APP 9BOX — rota Bruno do formulario de desligamento
// (`/super-admin/empresa/[id]/colaborador/[employeeId]/desligamento`,
// ME-fila6 D2).
//
// Etapa 2 da inativacao (especificacao "Turnover e desligamento" §2):
// `?motivo=voluntario` abre o Formulario A; `?motivo=involuntario` abre o
// Formulario B. Colaborador inativo, motivo ausente/invalido ou RF titular
// voltam para a edicao (a salvaguarda definitiva e a proc).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { FormularioDesligamentoClient } from '@/components/desligamento/FormularioDesligamento';
import { Layout } from '../../../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../../../db/client';
import { resolveDatabaseUrl } from '../../../../../../../lib/db/resolveDatabaseUrl';
import { findCompanyDisplayInfo } from '../../../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../../../lib/menu/menuConfig';
import { parseMotivoDesligamentoParam } from '../../../../../../../lib/shared/terminationForms';
import { resolveProfileKey } from '../../../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../../../server/session/serverSession';
import { executarTransferenciaAction, inativarColaboradorAction } from '../editar/actions';
import {
  loadColaboradorEditarPage,
  parseCompanyIdParam,
  parseEmployeeIdParam,
} from '../editar/internals';

interface PageProps {
  readonly params: Promise<{ id: string; employeeId: string }>;
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const ACTIONS = {
  inativarColaborador: inativarColaboradorAction,
  executarTransferencia: executarTransferenciaAction,
};

export default async function DesligamentoBrunoPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId, employeeId: rawEmployeeId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  const employeeId = parseEmployeeIdParam(rawEmployeeId);
  if (companyId === null || employeeId === null) {
    notFound();
  }
  const editarHref = `/super-admin/empresa/${companyId}/colaborador/${employeeId}/editar`;
  const motivo = parseMotivoDesligamentoParam((await props.searchParams)?.motivo);
  if (motivo === null) {
    redirect(editarHref);
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }
    const pageData = await loadColaboradorEditarPage(client.db, companyId, employeeId);
    if (pageData === null) {
      notFound();
    }
    const employee = pageData.employee;
    if (employee.status === 'inativo' || employee.isCurrentRF) {
      redirect(editarHref);
    }

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
      throw new Error(`Menu ausente para ${profileKey} — inconsistencia DOC 05 §3`);
    }

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
        superAdminContext={{ companyDisplayName: company.nomeFantasia }}
      >
        <FormularioDesligamentoClient
          employeeId={employee.id}
          employeeName={employee.name}
          motivo={motivo}
          requerTransferencia={employee.isLider && employee.countActiveLiderados > 0}
          editarHref={editarHref}
          sucessoHref={`/super-admin/empresa/${companyId}/todos-os-colaboradores`}
          actions={ACTIONS}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
