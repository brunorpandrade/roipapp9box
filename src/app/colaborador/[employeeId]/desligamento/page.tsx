// ROIP APP 9BOX — rota RH do formulario de desligamento
// (`/colaborador/[employeeId]/desligamento`, ME-fila6 D2).
//
// Etapa 2 da inativacao (especificacao "Turnover e desligamento" §2).
// Acesso: RH puro e RH-Lider da empresa do colaborador (mesma regra da
// edicao). `?motivo=` define o Formulario A ou B. Colaborador inativo,
// motivo ausente/invalido ou RF titular voltam para a edicao.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { FormularioDesligamentoClient } from '@/components/desligamento/FormularioDesligamento';
import { Layout } from '../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../db/client';
import { resolveDatabaseUrl } from '../../../../lib/db/resolveDatabaseUrl';
import { loadPlatformMenuContext } from '../../../../lib/session/platformMenuContext';
import { parseMotivoDesligamentoParam } from '../../../../lib/shared/terminationForms';
import { getServerSession } from '../../../../server/session/serverSession';
import {
  loadColaboradorEditarPage,
  parseEmployeeIdParam,
} from '../../../super-admin/empresa/[id]/colaborador/[employeeId]/editar/internals';
import { executarTransferenciaRHAction, inativarColaboradorRHAction } from '../editar/actions';

interface PageProps {
  readonly params: Promise<{ readonly employeeId: string }>;
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const ACTIONS = {
  inativarColaborador: inativarColaboradorRHAction,
  executarTransferencia: executarTransferenciaRHAction,
};

export default async function DesligamentoRHPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    redirect('/access-denied?rota=/colaborador/editar');
  }

  const rawParams = await props.params;
  const employeeId = parseEmployeeIdParam(rawParams.employeeId);
  if (employeeId === null) {
    notFound();
  }
  const editarHref = `/colaborador/${employeeId}/editar`;
  const motivo = parseMotivoDesligamentoParam((await props.searchParams)?.motivo);
  if (motivo === null) {
    redirect(editarHref);
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menu = await loadPlatformMenuContext(client.db, session);
    if (menu === null) {
      redirect('/');
    }
    const pageData = await loadColaboradorEditarPage(client.db, session.companyId, employeeId);
    if (pageData === null) {
      notFound();
    }
    const employee = pageData.employee;
    if (employee.status === 'inativo' || employee.isCurrentRF) {
      redirect(editarHref);
    }

    return (
      <Layout
        menuItems={menu.menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: menu.showNotificationBell,
        }}
      >
        <FormularioDesligamentoClient
          employeeId={employee.id}
          employeeName={employee.name}
          motivo={motivo}
          requerTransferencia={employee.isLider && employee.countActiveLiderados > 0}
          editarHref={editarHref}
          sucessoHref="/todos-os-colaboradores"
          actions={ACTIONS}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
