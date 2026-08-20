// ROIP APP 9BOX — teste de analise estatica ME-B9-CR (Central de
// Relatorios /RH puro / RH-Lider).
//
// Padrao bit-exact `me084-rh-routes-structure.test.ts`: leitura de
// arquivos + regex canonica, sem dependencia de banco real. Cobre
// canonicamente a arquitetura L123 dual-route + extracao L125 do
// RelatoriosClient para local compartilhado, aprovadas em bloco
// D-CR-1..D-CR-8.
//
// Cobertura:
//   1. Componente compartilhado extraido:
//      - `src/components/central-relatorios/RelatoriosClient.tsx` existe.
//      - `src/components/central-relatorios/internals.ts` existe e
//        exporta CARD_DEFS, ICON_COLORS, NIVEL_OPTIONS, CardId,
//        NivelEscopo + contratos das actions (ClosedQuarter,
//        LeaderOption, GenerateRelatorioExecutivoResult,
//        RelatoriosClientActions).
//      - Client recebe `variant` + `actions` via props (D-CR-3, D-CR-5).
//      - Client esconde board_deck em variant='rh' (D-CR-3).
//   2. Rota Super Admin refatorada:
//      - internals.ts nao contem mais CARD_DEFS/ICON_COLORS/NIVEL_OPTIONS.
//      - page.tsx importa RelatoriosClient do local compartilhado + injeta
//        6 actions Super Admin + variant='super_admin'.
//      - actions.ts importa types (ActionResult, ClosedQuarter,
//        LeaderOption, GenerateRelatorioExecutivoResult) do compartilhado.
//      - RelatoriosClient.tsx local NAO existe mais (deletado).
//   3. Nova rota base RH:
//      - src/app/central-relatorios/{page.tsx, actions.ts, internals.ts}
//        existem.
//      - page.tsx redirect canonico para super_admin + guard
//        defense-in-depth §9.15 (bit-exact ME-084 padrao).
//      - page.tsx renderiza RelatoriosClient com variant='rh' + 6 actions
//        RH-facing injetadas.
//      - actions.ts usa requireRHOrSuperAdmin em todas as 6 actions
//        (D-CR-4).
//      - actions.ts resolve userType='employee' para RH (session.kind ===
//        'platform') e 'super_admin' para Bruno.
//      - actions.ts deriva companyId de session.companyId para RH
//        (D-CR-4).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf-8');
}

function fileExists(rel: string): boolean {
  return existsSync(join(REPO_ROOT, rel));
}

// ============================================================
// 1. Componente compartilhado extraido (L125)
// ============================================================

describe('ME-B9-CR — componente compartilhado extraido (L125)', () => {
  const CLIENT = 'src/components/central-relatorios/RelatoriosClient.tsx';
  const INTERNALS = 'src/components/central-relatorios/internals.ts';

  it('RelatoriosClient existe no local compartilhado', () => {
    expect(fileExists(CLIENT)).toBe(true);
  });

  it('internals compartilhado existe', () => {
    expect(fileExists(INTERNALS)).toBe(true);
  });

  it('internals exporta constantes UI canonicas', () => {
    const src = readSrc(INTERNALS);
    expect(src).toContain('export const CARD_DEFS');
    expect(src).toContain('export const NIVEL_OPTIONS');
    expect(src).toContain('export const ICON_COLORS');
    expect(src).toContain('export type CardId');
    expect(src).toContain("export type NivelEscopo = 'empresa' | 'departamento' | 'equipe'");
  });

  it('internals exporta contratos canonicos das actions (D-CR-5)', () => {
    const src = readSrc(INTERNALS);
    expect(src).toContain('export type ActionResult');
    expect(src).toContain('export interface ClosedQuarter');
    expect(src).toContain('export interface LeaderOption');
    expect(src).toContain('export interface GenerateRelatorioExecutivoResult');
    expect(src).toContain('export interface RelatoriosClientActions');
  });

  it('Client recebe variant + actions via props (D-CR-3 + D-CR-5)', () => {
    const src = readSrc(CLIENT);
    // ME-B9-CR3 ampliou a variant para o tipo canonico RelatoriosVariant
    // (super_admin | rh | clevel). Literal do union inline foi substituido.
    expect(src).toContain('readonly variant: RelatoriosVariant');
    expect(src).toContain('readonly actions: RelatoriosClientActions');
    expect(src).toContain('const { companyId, variant, actions } = props');
  });

  it('Client consome actions via prop (nunca importa actions locais)', () => {
    const src = readSrc(CLIENT);
    // Zero imports diretos de actions no componente compartilhado.
    expect(src).not.toMatch(/from ['"]\.\/actions['"]/);
    // Uso via prop injetada.
    expect(src).toContain('actions.listClosedQuarters');
    expect(src).toContain('actions.listDepartments');
    expect(src).toContain('actions.listLeaders');
    expect(src).toContain('actions.generateRelatorioExecutivo');
    expect(src).toContain('actions.startReportDownloadToken');
    expect(src).toContain('actions.startExecutiveReportDownloadToken');
  });

  it('Client esconde board_deck em variant="rh" (D-CR-3)', () => {
    const src = readSrc(CLIENT);
    // ME-B9-CR3 substituiu o filtro ad-hoc pela matriz canonica
    // isCardVisibleForVariant (CAMADA_UI §12.3). Bit-exact: RH esconde
    // board_deck; clevel mostra board_deck; super_admin mostra tudo.
    expect(src).toContain('isCardVisibleForVariant(c.id, variant)');
  });
});

// ============================================================
// 2. Rota Super Admin refatorada
// ============================================================

describe('ME-B9-CR — rota Super Admin refatorada', () => {
  const SA_DIR = 'src/app/super-admin/empresa/[id]/relatorios-e-exportacoes';

  it('RelatoriosClient LOCAL foi deletado (L125)', () => {
    expect(fileExists(`${SA_DIR}/RelatoriosClient.tsx`)).toBe(false);
  });

  it('internals.ts nao contem mais constantes UI extraidas', () => {
    const src = readSrc(`${SA_DIR}/internals.ts`);
    expect(src).not.toContain('export const CARD_DEFS');
    expect(src).not.toContain('export const NIVEL_OPTIONS');
    expect(src).not.toContain('export const ICON_COLORS');
    expect(src).not.toContain('export type CardId');
    expect(src).not.toContain('export type NivelEscopo');
  });

  it('internals.ts mantem parseCompanyIdParam + resolveDatabaseUrl (SA-specific)', () => {
    const src = readSrc(`${SA_DIR}/internals.ts`);
    expect(src).toContain('export function parseCompanyIdParam');
    expect(src).toContain('export function resolveDatabaseUrl');
  });

  it('page.tsx importa RelatoriosClient do local compartilhado', () => {
    const src = readSrc(`${SA_DIR}/page.tsx`);
    expect(src).toContain("from '../../../../../components/central-relatorios/RelatoriosClient'");
  });

  it('page.tsx injeta variant="super_admin" + 6 actions', () => {
    const src = readSrc(`${SA_DIR}/page.tsx`);
    expect(src).toContain('variant="super_admin"');
    expect(src).toContain('listClosedQuarters: listClosedQuartersAction');
    expect(src).toContain('listDepartments: listDepartmentsAction');
    expect(src).toContain('listLeaders: listLeadersAction');
    expect(src).toContain('generateRelatorioExecutivo: generateRelatorioExecutivoAction');
    expect(src).toContain('startReportDownloadToken: startReportDownloadTokenAction');
    expect(src).toContain(
      'startExecutiveReportDownloadToken: startExecutiveReportDownloadTokenAction',
    );
  });

  it('actions.ts importa types do internals compartilhado', () => {
    const src = readSrc(`${SA_DIR}/actions.ts`);
    expect(src).toContain("from '../../../../../components/central-relatorios/internals'");
  });

  it('actions.ts nao redeclara ClosedQuarter/LeaderOption/GenerateRelatorioExecutivoResult', () => {
    const src = readSrc(`${SA_DIR}/actions.ts`);
    expect(src).not.toContain('export interface ClosedQuarter');
    expect(src).not.toContain('export interface LeaderOption');
    expect(src).not.toContain('export interface GenerateRelatorioExecutivoResult');
  });
});

// ============================================================
// 3. Nova rota base RH /central-relatorios (dual-route L123)
// ============================================================

describe('ME-B9-CR — nova rota base RH /central-relatorios (L123)', () => {
  const RH_DIR = 'src/app/central-relatorios';

  it('4 arquivos canonicos existem', () => {
    expect(fileExists(`${RH_DIR}/page.tsx`)).toBe(true);
    expect(fileExists(`${RH_DIR}/actions.ts`)).toBe(true);
    expect(fileExists(`${RH_DIR}/internals.ts`)).toBe(true);
  });

  it('page.tsx faz redirect canonico super_admin -> /super-admin (padrao ME-084)', () => {
    const src = readSrc(`${RH_DIR}/page.tsx`);
    expect(src).toContain("if (session.kind === 'super_admin')");
    expect(src).toContain("redirect('/super-admin')");
  });

  it('page.tsx aplica guard defense-in-depth §9.15 (role !== rh|rh_lider)', () => {
    const src = readSrc(`${RH_DIR}/page.tsx`);
    expect(src).toContain("session.role !== 'rh' && session.role !== 'rh_lider'");
    expect(src).toContain("redirect('/access-denied?rota=/central-relatorios')");
  });

  it('page.tsx renderiza RelatoriosClient com variant="rh" + 6 actions RH-facing', () => {
    const src = readSrc(`${RH_DIR}/page.tsx`);
    expect(src).toContain("from '../../components/central-relatorios/RelatoriosClient'");
    expect(src).toContain('variant="rh"');
    expect(src).toContain('listClosedQuarters: listClosedQuartersRHAction');
    expect(src).toContain('listDepartments: listDepartmentsRHAction');
    expect(src).toContain('listLeaders: listLeadersRHAction');
    expect(src).toContain('generateRelatorioExecutivo: generateRelatorioExecutivoRHAction');
    expect(src).toContain('startReportDownloadToken: startReportDownloadTokenRHAction');
    expect(src).toContain(
      'startExecutiveReportDownloadToken: startExecutiveReportDownloadTokenRHAction',
    );
  });

  it('page.tsx deriva companyId de session.companyId (D-CR-4)', () => {
    const src = readSrc(`${RH_DIR}/page.tsx`);
    expect(src).toContain('companyId={session.companyId}');
  });

  it('actions.ts usa requireRHOrSuperAdmin em todas as 6 actions (D-CR-4)', () => {
    const src = readSrc(`${RH_DIR}/actions.ts`);
    // Import canonico do helper.
    expect(src).toContain("from '../../lib/routes/requireRHOrSuperAdmin'");
    // 6 chamadas do guard (uma por action).
    const matches = src.match(/requireRHOrSuperAdmin\(\s*await getServerSession\(\),/g) ?? [];
    expect(matches.length).toBe(6);
  });

  it('actions.ts resolve userType canonicamente (employee para RH, super_admin para Bruno)', () => {
    const src = readSrc(`${RH_DIR}/actions.ts`);
    expect(src).toContain('function resolveTokenUserType');
    expect(src).toContain("return session.kind === 'super_admin' ? 'super_admin' : 'employee'");
  });

  it('actions.ts deriva companyId de session.companyId para branch platform (D-CR-4)', () => {
    const src = readSrc(`${RH_DIR}/actions.ts`);
    expect(src).toContain('function resolveEffectiveCompanyId');
    expect(src).toContain("if (session.kind === 'platform')");
    expect(src).toContain('return session.companyId');
  });

  it('actions.ts expoe as 6 actions RH-facing canonicas', () => {
    const src = readSrc(`${RH_DIR}/actions.ts`);
    expect(src).toContain('export async function listClosedQuartersRHAction');
    expect(src).toContain('export async function listDepartmentsRHAction');
    expect(src).toContain('export async function listLeadersRHAction');
    expect(src).toContain('export async function generateRelatorioExecutivoRHAction');
    expect(src).toContain('export async function startReportDownloadTokenRHAction');
    expect(src).toContain('export async function startExecutiveReportDownloadTokenRHAction');
  });
});
