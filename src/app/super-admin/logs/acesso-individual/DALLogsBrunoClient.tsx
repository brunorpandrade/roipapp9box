'use client';

// ROIP APP 9BOX — client component wrapper para
// /super-admin/logs/acesso-individual (Bruno) — ME-057b Bloco C.
//
// Origem canonica:
// - DOC 05 §14.22 subtitle Bruno + CC043.
//
// Racional:
// - Este componente e um wrapper fino sobre `DALLogsClient` (Bloco B)
//   injetando `showEmpresaFilter=true` + `onListar=listarDALLogsBruno
//   Action`. Toda a UI e reaproveitada bit-exact — apenas a origem do
//   re-fetch difere (server action Bruno-specific respeita RV-13).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `DALLogsBrunoClient` → /super-admin/logs/acesso-individual/
//     page.tsx.

import type { JSX } from 'react';

import {
  DALLogsClient,
  type DALEmpresaOption,
} from '../../../logs/acesso-individual/DALLogsClient';
import type { DALFilters, DALListResult } from '../../../../lib/logs/dataAccessLog';

import { listarDALLogsBrunoAction } from './actions';

export interface DALLogsBrunoClientProps {
  readonly initialResult: DALListResult;
  readonly initialFilters: DALFilters;
  readonly empresas: readonly DALEmpresaOption[];
}

export function DALLogsBrunoClient(props: DALLogsBrunoClientProps): JSX.Element {
  return (
    <DALLogsClient
      initialResult={props.initialResult}
      initialFilters={props.initialFilters}
      showEmpresaFilter={true}
      empresas={props.empresas}
      onListar={listarDALLogsBrunoAction}
    />
  );
}
