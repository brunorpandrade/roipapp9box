// ROIP APP 9BOX — mapeamento canonico role → painel (ME-023).
//
// Consumido por:
//   - `access-denied/page.tsx` para o CTA `[Ir para meu painel]` (§8.1):
//     RH/RH-Lider → /painel-rh; C-level → /painel-clevel;
//     Lider → /painel-lider; Super Admin → /super-admin.
//   - `middleware.ts` para decisoes `redirect_painel` da matriz (§2.3
//     precedencia) e `redirect_super_admin` (§13.7).
//
// Rota `/` (login unificado) NAO e alvo — o middleware a usa quando nao
// ha JWT admin, mas ela nao e "meu painel".

import type { GuardRole } from './matrix';

/**
 * Painel canonico do perfil autenticado. Fonte unica.
 */
export function panelPathForRole(role: GuardRole): string {
  switch (role) {
    case 'super_admin':
      return '/super-admin';
    case 'rh':
    case 'rh_lider':
      return '/painel-rh';
    case 'clevel':
      return '/painel-clevel';
    case 'lider':
      return '/painel-lider';
  }
}
