// ROIP APP 9BOX — teste unitario da traducao de erro do caller tRPC do
// dashboard individual (`translateDashboardCallerError` + `loginRedirectPath`).
// Prova nos dois sentidos (RV-03): mapeia FORBIDDEN/NOT_FOUND/UNAUTHORIZED para
// a navegacao correta E re-lanca qualquer erro nao mapeado (nao redireciona).

import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT ${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
  notFound: () => {
    const err = new Error('NEXT_NOT_FOUND');
    (err as Error & { digest?: string }).digest = 'NEXT_HTTP_ERROR_FALLBACK;404';
    throw err;
  },
}));

// Import DEPOIS do mock.
import {
  loginRedirectPath,
  translateDashboardCallerError,
} from '../../src/app/dashboard-individual/[id]/callerErrorRedirect';

describe('loginRedirectPath', () => {
  it('plataforma -> /', () => {
    expect(loginRedirectPath('platform')).toBe('/');
  });

  it('super_admin -> /login-super-admin', () => {
    expect(loginRedirectPath('super_admin')).toBe('/login-super-admin');
  });
});

describe('translateDashboardCallerError — casos mapeados', () => {
  it('FORBIDDEN -> redirect /access-denied?rota=/dashboard-individual', () => {
    const err = new TRPCError({ code: 'FORBIDDEN', message: 'x' });
    expect(() => translateDashboardCallerError(err, 'platform')).toThrowError(
      'NEXT_REDIRECT /access-denied?rota=/dashboard-individual',
    );
  });

  it('NOT_FOUND -> notFound (404)', () => {
    const err = new TRPCError({ code: 'NOT_FOUND', message: 'x' });
    expect(() => translateDashboardCallerError(err, 'platform')).toThrowError('NEXT_NOT_FOUND');
  });

  it('UNAUTHORIZED (plataforma) -> redirect /', () => {
    const err = new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
    expect(() => translateDashboardCallerError(err, 'platform')).toThrowError('NEXT_REDIRECT /');
  });

  it('UNAUTHORIZED (super_admin) -> redirect /login-super-admin', () => {
    const err = new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
    expect(() => translateDashboardCallerError(err, 'super_admin')).toThrowError(
      'NEXT_REDIRECT /login-super-admin',
    );
  });
});

describe('translateDashboardCallerError — casos NAO mapeados sao re-lancados', () => {
  it('TRPCError de codigo nao tratado (BAD_REQUEST) e re-lancado intacto', () => {
    const err = new TRPCError({ code: 'BAD_REQUEST', message: 'entrada invalida' });
    expect(() => translateDashboardCallerError(err, 'platform')).toThrow(err);
  });

  it('erro comum (nao-TRPCError) e re-lancado intacto', () => {
    const err = new Error('erro de banco');
    expect(() => translateDashboardCallerError(err, 'platform')).toThrow(err);
  });

  it('INTERNAL_SERVER_ERROR nao vira redirect — re-lancado', () => {
    const err = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'boom' });
    expect(() => translateDashboardCallerError(err, 'super_admin')).toThrow(err);
  });
});
