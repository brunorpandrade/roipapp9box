// ROIP APP 9BOX — page placeholder `/super-admin/desbloqueios`
// (ME-B11.1-FINAL / B11.1g — G14).
//
// Menu Super Admin global canonico (DOC 05 §3.1) referencia este item
// como "Desbloqueios". O href `/super-admin/desbloqueios` existia no
// `menuConfig.ts` apontando para rota sem `page.tsx` — gerava 404
// funcional ao clicar. Esta ME canonicamente materializa a pagina
// placeholder "em breve" para fechar o 404.
//
// Padrao canonico bit-exact extraido de `src/app/super-admin/logs/
// page.tsx` (hub pattern) + simetria com placeholders irmaos G7/G8
// desta mesma ME.
//
// **RV-13.** Consumido pelo roteador Next 15 App Router via href do
// `menuConfig.ts:230`.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { getServerSession } from '../../../server/session/serverSession';
import { COLORS } from '../../../lib/design-tokens/colors';

export default async function DesbloqueiosPlaceholderPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  return (
    <div
      style={{
        padding: 32,
        maxWidth: 1120,
        margin: '0 auto',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 600,
          color: COLORS.text.primary,
        }}
      >
        Desbloqueios
      </h1>
      <p
        style={{
          margin: '8px 0 24px',
          fontSize: 14,
          color: COLORS.text.secondary,
          lineHeight: 1.55,
        }}
      >
        Em breve. Esta superfície de aprovação de desbloqueios de meses fechados será entregue em
        uma próxima fase do produto.
      </p>
    </div>
  );
}
