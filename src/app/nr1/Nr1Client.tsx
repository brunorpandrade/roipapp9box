'use client';

import type { ReactNode } from 'react';
import type { RhSessionFlags } from '../../lib/session/rhSessionFlags';

export interface Nr1ClientProps {
  readonly variant: 'rh' | 'super_admin';
  readonly cycleDetails: { status?: string; cicloId?: number | null };
  readonly collectionStatus: {
    cicloId: number;
    fatoresTotais: [];
    respondentes: [];
  };
  readonly rhFlags: RhSessionFlags;
  readonly company: { id: number; displayName: string };
}

export function Nr1Client(props: Nr1ClientProps): ReactNode {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Radar NR-1</h1>
      <p>{props.company.displayName}</p>
      <p>{props.cycleDetails.status}</p>
    </div>
  );
}
