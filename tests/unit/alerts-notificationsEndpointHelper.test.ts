// ROIP APP 9BOX — teste unit resolveDestClauseFromSession (ME-059).
// Cobre §10.1 canonizada Q1 — apenas Bruno + RH ativos tem sino.

import { describe, expect, it } from 'vitest';

import { resolveDestClauseFromSession } from '../../src/lib/alerts/notificationsEndpointHelper';
import type { ServerSession } from '../../src/server/session/serverSession';

describe('resolveDestClauseFromSession — narrowing canonico §10.1', () => {
  it('super_admin → {destinatarioTipo=bruno, destinatarioEmployeeId=null}', () => {
    const session: ServerSession = {
      kind: 'super_admin',
      superAdminId: 1,
      displayName: 'Bruno',
    };
    const res = resolveDestClauseFromSession(session);
    expect(res).toEqual({
      kind: 'ok',
      clause: { destinatarioTipo: 'bruno', destinatarioEmployeeId: null },
    });
  });

  it('platform rh → {destinatarioTipo=rh, destinatarioEmployeeId=userId}', () => {
    const session: ServerSession = {
      kind: 'platform',
      role: 'rh',
      userId: 200,
      companyId: 42,
      displayName: 'RH da empresa',
      companyDisplayName: 'Empresa X',
      companyLogoUrl: null,
      passwordSet: true,
    };
    const res = resolveDestClauseFromSession(session);
    expect(res).toEqual({
      kind: 'ok',
      clause: { destinatarioTipo: 'rh', destinatarioEmployeeId: 200 },
    });
  });

  it('platform rh_lider → {destinatarioTipo=rh, destinatarioEmployeeId=userId}', () => {
    const session: ServerSession = {
      kind: 'platform',
      role: 'rh_lider',
      userId: 201,
      companyId: 42,
      displayName: 'RH+Lider',
      companyDisplayName: 'Empresa X',
      companyLogoUrl: null,
      passwordSet: true,
    };
    const res = resolveDestClauseFromSession(session);
    expect(res).toEqual({
      kind: 'ok',
      clause: { destinatarioTipo: 'rh', destinatarioEmployeeId: 201 },
    });
  });

  it('platform clevel → forbidden (perfil_sem_sino_clevel)', () => {
    const session: ServerSession = {
      kind: 'platform',
      role: 'clevel',
      userId: 300,
      companyId: 42,
      displayName: 'C-level',
      companyDisplayName: 'Empresa X',
      companyLogoUrl: null,
      passwordSet: true,
    };
    const res = resolveDestClauseFromSession(session);
    expect(res).toEqual({ kind: 'forbidden', motivo: 'perfil_sem_sino_clevel' });
  });

  it('platform lider → forbidden (perfil_sem_sino_lider)', () => {
    const session: ServerSession = {
      kind: 'platform',
      role: 'lider',
      userId: 400,
      companyId: 42,
      displayName: 'Lider',
      companyDisplayName: 'Empresa X',
      companyLogoUrl: null,
      passwordSet: true,
    };
    const res = resolveDestClauseFromSession(session);
    expect(res).toEqual({ kind: 'forbidden', motivo: 'perfil_sem_sino_lider' });
  });

  it('session null → forbidden (sessao_ausente)', () => {
    const res = resolveDestClauseFromSession(null);
    expect(res).toEqual({ kind: 'forbidden', motivo: 'sessao_ausente' });
  });
});
