// ROIP APP 9BOX — régua única do isolamento por empresa (DOC 02 §2.4),
// ME de segurança cross-company (bateria Etapa 0, item 2).
//
// Regra: o Super Admin atravessa (opera global, sem `companyId` no
// token); todo perfil administrativo só alcança a própria empresa, e o
// único `companyId` de confiança é o do JWT (`ctx.user.companyId`). Um
// `companyId` de input divergente é FORBIDDEN, nunca NOT_FOUND (§8.3:
// perfil autenticado em recurso alheio é acesso negado).
//
// Antes desta ME a comparação vivia em 16 cópias locais (uma por
// router) mais sete blocos inline. Esta é a fonte única (RV-14); os
// routers mantêm apenas o vínculo com a mensagem canônica de cada
// domínio (wrappers de uma linha, sem segunda cópia da regra).
//
// **RV-13.** Consumido pelos routers de domínio (`src/server/routers/*`)
// e provado por `tests/unit/userCompanyScope.test.ts` e pela bateria
// `tests/integration/seguranca-cross-company.test.ts`.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { TRPCError } from '@trpc/server';

/**
 * Identidade mínima que a régua precisa: o discriminante `role` e, para
 * perfis administrativos, o `companyId` do token. Estruturalmente
 * compatível com `AuthenticatedUser` (`src/server/trpc.ts`) sem
 * importar a camada tRPC para dentro de `src/lib`.
 */
export type CompanyScopedUser =
  | { readonly role: 'super_admin' }
  | { readonly role: 'rh' | 'rh_lider' | 'clevel' | 'lider'; readonly companyId: number };

/** Mensagem canônica default quando o domínio não define a sua. */
export const MSG_EMPRESA_FORA_DO_ESCOPO = 'Empresa fora do escopo.';

/**
 * Régua pura: `true` quando o usuário pode operar sobre `companyId`.
 * Super Admin sempre; perfil administrativo só na própria empresa.
 */
export function isCompanyInScope(user: CompanyScopedUser, companyId: number): boolean {
  if (user.role === 'super_admin') {
    return true;
  }
  return user.companyId === companyId;
}

/**
 * Guard cruzado §2.4: lança FORBIDDEN com a mensagem do domínio quando
 * `companyId` está fora do escopo do usuário autenticado.
 */
export function assertUserCompanyScope(
  user: CompanyScopedUser,
  companyId: number,
  message: string = MSG_EMPRESA_FORA_DO_ESCOPO,
): void {
  if (!isCompanyInScope(user, companyId)) {
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }
}
