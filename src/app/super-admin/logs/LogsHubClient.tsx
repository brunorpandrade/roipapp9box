// ROIP APP 9BOX — LogsHubClient (ME-080b Dispatch 3.2).
//
// 2 cards canonicos linkando aos sub-logs. Client component para
// suportar hover/estado visual dos cards.

'use client';

import Link from 'next/link';
import type { JSX } from 'react';
import { useState } from 'react';

import { COLORS } from '../../../lib/design-tokens/colors';

interface CardDef {
  readonly title: string;
  readonly description: string;
  readonly href: string;
}

const CARDS: readonly CardDef[] = [
  {
    title: 'Transferências de Responsável financeiro',
    description:
      'Historico de atribuicoes e transferencias de RF por empresa, com justificativa canonica.',
    href: '/super-admin/logs/responsavel-financeiro',
  },
  {
    title: 'Log de acesso individual',
    description:
      'Consulta consolidada de acessos a dados pessoais em toda a plataforma (LGPD art. 37).',
    href: '/super-admin/logs/acesso-individual',
  },
];

export function LogsHubClient(): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      }}
    >
      {CARDS.map((card) => (
        <LogCard key={card.href} card={card} />
      ))}
    </div>
  );
}

function LogCard({ card }: { readonly card: CardDef }): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={card.href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        background: COLORS.background.card,
        border: `1px solid ${hover ? COLORS.accent.teal : COLORS.border.default}`,
        borderRadius: 12,
        padding: 24,
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.06)' : 'none',
        transition: 'border-color 150ms, box-shadow 150ms',
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: COLORS.text.primary,
          marginBottom: 8,
        }}
      >
        {card.title}
      </div>
      <div
        style={{
          fontSize: 13,
          color: COLORS.text.secondary,
          lineHeight: 1.55,
        }}
      >
        {card.description}
      </div>
    </Link>
  );
}
