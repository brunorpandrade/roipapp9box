// ROIP APP 9BOX — régua unitária das fontes únicas de escopo (bateria de
// segurança cross-company e autorização cruzada, Etapa 0, item 2).
//
// Cobre, nos dois sentidos (RV-03):
//   · `userCompanyScope` — régua §2.4 que absorveu 16 cópias + 7 blocos
//     inline dos routers (RV-14);
//   · `cadeiaScopeGuard` — `assertAlvoNoEscopo` puro e a invariante de
//     que nenhum router mantém uma segunda cópia da comparação de
//     `companyId` (grep sobre `src/server/routers`).
// RV-14: um statement por linha, 100 colunas.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import {
  assertUserCompanyScope,
  isCompanyInScope,
  MSG_EMPRESA_FORA_DO_ESCOPO,
  type CompanyScopedUser,
} from '../../src/lib/scope/userCompanyScope';
import {
  assertAlvoNoEscopo,
  MSG_AGREGADO_EMPRESA_RESTRITO,
  MSG_FORA_DA_CADEIA_DESCENDENTE,
  type CadeiaScopedUser,
} from '../../src/server/services/cadeiaScopeGuard';

const bruno: CompanyScopedUser = { role: 'super_admin' };
const rhDaEmpresa5: CompanyScopedUser = { role: 'rh', companyId: 5 };
const liderDaEmpresa5: CadeiaScopedUser = { role: 'lider', userId: 9, companyId: 5 };

describe('userCompanyScope — régua única §2.4', () => {
  it('super_admin atravessa qualquer empresa', () => {
    expect(isCompanyInScope(bruno, 1)).toBe(true);
    expect(isCompanyInScope(bruno, 999)).toBe(true);
    expect(() => assertUserCompanyScope(bruno, 999)).not.toThrow();
  });

  it('perfil administrativo só alcança a própria empresa (caso bom)', () => {
    expect(isCompanyInScope(rhDaEmpresa5, 5)).toBe(true);
    expect(() => assertUserCompanyScope(rhDaEmpresa5, 5)).not.toThrow();
  });

  it('empresa divergente → FORBIDDEN com a mensagem do domínio (defeito)', () => {
    expect(isCompanyInScope(rhDaEmpresa5, 6)).toBe(false);
    let erro: unknown;
    try {
      assertUserCompanyScope(rhDaEmpresa5, 6, 'Colaborador não pertence à sua empresa.');
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(TRPCError);
    expect((erro as TRPCError).code).toBe('FORBIDDEN');
    expect((erro as TRPCError).message).toBe('Colaborador não pertence à sua empresa.');
  });

  it('sem mensagem do domínio, usa a canônica default', () => {
    expect(() => assertUserCompanyScope(rhDaEmpresa5, 6)).toThrow(MSG_EMPRESA_FORA_DO_ESCOPO);
  });

  it('nenhum router mantém cópia própria da comparação (RV-14)', () => {
    const dir = join(process.cwd(), 'src', 'server', 'routers');
    const copias: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, file), 'utf-8');
      const temCopia =
        /user\.companyId !== companyId\b/.test(src) ||
        /ctx\.user\.companyId !== input\.companyId/.test(src);
      if (temCopia) copias.push(file);
    }
    expect(copias).toEqual([]);
  });
});

describe('cadeiaScopeGuard — assertAlvoNoEscopo (puro, RV-03)', () => {
  it('escopo nulo (total) libera qualquer alvo', () => {
    expect(() => assertAlvoNoEscopo(null, 123)).not.toThrow();
  });

  it('alvo dentro do Set passa; fora do Set → FORBIDDEN com a mensagem dada', () => {
    const escopo = new Set<string>(['employee-10', 'employee-11']);
    expect(() => assertAlvoNoEscopo(escopo, 11)).not.toThrow();
    expect(() => assertAlvoNoEscopo(escopo, 12)).toThrow(MSG_FORA_DA_CADEIA_DESCENDENTE);
    expect(() => assertAlvoNoEscopo(escopo, 12, 'msg do dominio')).toThrow('msg do dominio');
  });

  it('mensagem do agregado é a canônica usada por turnover/diagnóstico/status', () => {
    expect(MSG_AGREGADO_EMPRESA_RESTRITO).toContain('escopo total');
    expect(liderDaEmpresa5.role).toBe('lider');
  });
});
