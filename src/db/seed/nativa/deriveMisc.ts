// ROIP APP 9BOX — derivacoes canonicas misc da fixture Nativa (ME-068).
//
// Cobre tabelas com volume pequeno derivadas de constantes canonicas:
//   - companyJobFamilies (20) — 5 familias × 4 variaveis
//   - companyMonthlyData (24) — 24 meses × faturamento canonico
//   - monthlyClosureStatus (24) — 24 fechamentos historicos
//   - companyEconomicDiagnosis (8) — 8 trimestres calculados
//   - lgpdConsents (14) — 14 acessos com aceite pre-registrado
//   - responsavelFinanceiroTransferLog (2) — nomeacao Patricia + transferencia Juliana
//   - cycleSchedule (5) — 1 registro por tipoCiclo apontado ao proximo ciclo natural pos-seed
//   - individualProfilePlaceholders (69) — 66 respondidos + 3 C-levels pendentes
//
// RV-13: consumido por src/db/seed/nativa/loadFixtures.ts.
//
// RV-09 canonica bit-exact: os tipos derivados espelham EXATAMENTE os nomes
// de coluna do schema Drizzle real (src/db/schema/tables.ts) — nao ha ponte
// de rename. Se alguem alterar o schema, o TypeScript falha em compile time.

import type { JobFamily, RfEventType, TipoCiclo } from '../../schema/enums';

import {
  NATIVA_CLEVELS,
  NATIVA_EMPLOYEES,
  NATIVA_FATURAMENTO_MENSAL,
  NATIVA_JOB_FAMILY_VARIABLES,
  NATIVA_METAS_POR_CARGO,
  type NativaCargoCodigo,
  type NativaJobFamily,
} from './constants';
import { deriveIsLider, deriveIsRH } from './deriveEmployee';

// ---------------------------------------------------------------------
// 1. companyJobFamilies (20 registros: 5 familias × 4 variaveis)
// ---------------------------------------------------------------------

export interface DerivedJobFamily {
  readonly companyId: number;
  readonly jobFamily: JobFamily;
  readonly variableIndex: number;
  readonly variableName: string;
  readonly unit: string;
  readonly weight: string; // DECIMAL(5,2)
  readonly updatedBy: number; // superAdmins.id
  readonly createdAt: Date;
}

/**
 * Cada familia pode ter varios cargos com pesos identicos. Usamos o cargo
 * default da familia para extrair os pesos canonicos das variaveis.
 * Mapping familia → cargo default:
 *   producao_operacoes → op_pleno
 *   administrativo_suporte → anl_fin_p
 *   vendas_comercial → exec_p
 *   tecnico_especialista → anl_qual_p
 *   lideranca_gestao → lider_f6
 */
const FAMILIA_CARGO_DEFAULT: Record<NativaJobFamily, NativaCargoCodigo> = {
  producao_operacoes: 'op_pleno',
  administrativo_suporte: 'anl_fin_p',
  vendas_comercial: 'exec_p',
  tecnico_especialista: 'anl_qual_p',
  lideranca_gestao: 'lider_f6',
};

const FAMILIAS_NATIVA: readonly NativaJobFamily[] = [
  'producao_operacoes',
  'administrativo_suporte',
  'vendas_comercial',
  'tecnico_especialista',
  'lideranca_gestao',
];

export function deriveCompanyJobFamilies(
  companyId: number,
  superAdminId: number,
): readonly DerivedJobFamily[] {
  const rows: DerivedJobFamily[] = [];
  const createdAt = new Date('2025-11-15T10:00:00.000Z');

  for (const familia of FAMILIAS_NATIVA) {
    const cargoDefault = FAMILIA_CARGO_DEFAULT[familia];
    const variaveis = NATIVA_JOB_FAMILY_VARIABLES[familia];
    const metas = NATIVA_METAS_POR_CARGO[cargoDefault];

    for (let i = 0; i < 4; i++) {
      const variavel = variaveis[i]!;
      const meta = metas[i]!;
      rows.push({
        companyId,
        jobFamily: familia,
        variableIndex: i,
        variableName: variavel.variableName,
        unit: variavel.unit,
        weight: meta.weight.toFixed(2),
        updatedBy: superAdminId,
        createdAt,
      });
    }
  }
  return Object.freeze(rows);
}

export const NATIVA_COMPANY_JOB_FAMILIES_COUNT = 20 as const;

// ---------------------------------------------------------------------
// 2. companyMonthlyData (24 meses)
// ---------------------------------------------------------------------

export interface DerivedMonthlyData {
  readonly companyId: number;
  readonly mes: string; // 'YYYY-MM'
  readonly faturamentoBruto: string; // DECIMAL(15,2)
  readonly diasUteis: number;
  readonly createdAt: Date;
}

/** Dias uteis canonicos por mes — media brasileira (aproximacao coerente). */
const DIAS_UTEIS_POR_MES: Record<number, number> = {
  1: 22,
  2: 20,
  3: 22,
  4: 21,
  5: 21,
  6: 21,
  7: 22,
  8: 22,
  9: 21,
  10: 22,
  11: 20,
  12: 20,
};

export function deriveCompanyMonthlyData(companyId: number): readonly DerivedMonthlyData[] {
  return Object.freeze(
    NATIVA_FATURAMENTO_MENSAL.map((f) => ({
      companyId,
      mes: f.mesRef,
      faturamentoBruto: f.faturamentoBruto.toFixed(2),
      diasUteis: DIAS_UTEIS_POR_MES[f.mes]!,
      createdAt: new Date(`${f.mesRef}-01T00:00:00.000Z`),
    })),
  );
}

export const NATIVA_MONTHLY_DATA_COUNT = 24 as const;

// ---------------------------------------------------------------------
// 3. monthlyClosureStatus (24 fechamentos — todos 'fechado')
// ---------------------------------------------------------------------

export interface DerivedClosureStatus {
  readonly companyId: number;
  readonly mes: string;
  readonly status: 'aberto' | 'fechado' | 'desbloqueado';
  readonly dataFechamento: Date | null;
  readonly createdAt: Date;
}

export function deriveMonthlyClosureStatus(companyId: number): readonly DerivedClosureStatus[] {
  return Object.freeze(
    NATIVA_FATURAMENTO_MENSAL.map((f) => {
      // Fechamento canonico: dia 11 do mes seguinte, 00:00 UTC.
      const anoFechamento = f.mes === 12 ? f.ano + 1 : f.ano;
      const mesFechamento = f.mes === 12 ? 1 : f.mes + 1;
      const dataFechamento = new Date(
        `${anoFechamento}-${String(mesFechamento).padStart(2, '0')}-11T00:00:00.000Z`,
      );
      return {
        companyId,
        mes: f.mesRef,
        status: 'fechado' as const,
        dataFechamento,
        createdAt: dataFechamento,
      };
    }),
  );
}

export const NATIVA_CLOSURE_STATUS_COUNT = 24 as const;

// ---------------------------------------------------------------------
// 4. companyEconomicDiagnosis (8 trimestres)
// ---------------------------------------------------------------------
//
// Nomes canonicos batem 1:1 com companyEconomicDiagnosis (tables.ts):
//   faturamentoMedioTrimestral, folhaTotalMedia, roiEmpresa, folhaPorcentagem,
//   statusDiagnostico ∈ {excelente, muito_bom, aceitavel, critico, sem_referencia}.

export type EconomicDiagnosisStatus =
  'excelente' | 'muito_bom' | 'aceitavel' | 'critico' | 'sem_referencia';

export interface DerivedEconomicDiagnosis {
  readonly companyId: number;
  readonly trimestre: string; // 'YYYY-QN'
  readonly faturamentoMedioTrimestral: string; // DECIMAL(15,2)
  readonly folhaTotalMedia: string; // DECIMAL(15,2)
  readonly roiEmpresa: string; // DECIMAL(6,4)
  readonly folhaPorcentagem: string; // DECIMAL(5,2)
  readonly statusDiagnostico: EconomicDiagnosisStatus;
  readonly createdAt: Date;
}

/** Valores canonicos bit-exact do MD Nativa §7.2. */
const DIAGNOSTICOS_CANONICOS: ReadonlyArray<{
  trimestre: string;
  fatMed: number;
  folha: number;
  roi: number;
  folhaPct: number;
  status: EconomicDiagnosisStatus;
}> = [
  {
    trimestre: '2026-Q1',
    fatMed: 1500000,
    folha: 345300,
    roi: 4.344,
    folhaPct: 23.02,
    status: 'aceitavel',
  },
  {
    trimestre: '2026-Q2',
    fatMed: 1580000,
    folha: 341500,
    roi: 4.6266,
    folhaPct: 21.61,
    status: 'aceitavel',
  },
  {
    trimestre: '2026-Q3',
    fatMed: 1720000,
    folha: 344000,
    roi: 5.0,
    folhaPct: 20.0,
    status: 'muito_bom',
  },
  {
    trimestre: '2026-Q4',
    fatMed: 1820000,
    folha: 350200,
    roi: 5.197,
    folhaPct: 19.24,
    status: 'muito_bom',
  },
  {
    trimestre: '2027-Q1',
    fatMed: 1850000,
    folha: 346800,
    roi: 5.3345,
    folhaPct: 18.75,
    status: 'muito_bom',
  },
  {
    trimestre: '2027-Q2',
    fatMed: 1950000,
    folha: 353600,
    roi: 5.5147,
    folhaPct: 18.13,
    status: 'muito_bom',
  },
  {
    trimestre: '2027-Q3',
    fatMed: 2010000,
    folha: 359000,
    roi: 5.5989,
    folhaPct: 17.86,
    status: 'muito_bom',
  },
  {
    trimestre: '2027-Q4',
    fatMed: 2080000,
    folha: 366600,
    roi: 5.6738,
    folhaPct: 17.63,
    status: 'muito_bom',
  },
];

export function deriveEconomicDiagnosis(companyId: number): readonly DerivedEconomicDiagnosis[] {
  return Object.freeze(
    DIAGNOSTICOS_CANONICOS.map((d) => {
      // Data canonica de calculo do diagnostico: dia 11 do mes seguinte ao fim do trimestre.
      const [anoStr, qStr] = d.trimestre.split('-Q');
      const ano = parseInt(anoStr!, 10);
      const q = parseInt(qStr!, 10);
      const mesFim = q * 3;
      const anoFechamento = mesFim === 12 ? ano + 1 : ano;
      const mesFechamento = mesFim === 12 ? 1 : mesFim + 1;
      const createdAt = new Date(
        `${anoFechamento}-${String(mesFechamento).padStart(2, '0')}-11T00:00:00.000Z`,
      );
      return {
        companyId,
        trimestre: d.trimestre,
        faturamentoMedioTrimestral: d.fatMed.toFixed(2),
        folhaTotalMedia: d.folha.toFixed(2),
        roiEmpresa: d.roi.toFixed(4),
        folhaPorcentagem: d.folhaPct.toFixed(2),
        statusDiagnostico: d.status,
        createdAt,
      };
    }),
  );
}

export const NATIVA_ECONOMIC_DIAGNOSIS_COUNT = 8 as const;

// ---------------------------------------------------------------------
// 5. lgpdConsents (14 pre-aceitos)
// ---------------------------------------------------------------------
//
// Schema canonico bit-exact (tables.ts:1546-1563): companyId, employeeId
// nullable, clevelId nullable, versaoTermoAceita, aceitoEm. Exatamente
// UM entre employeeId/clevelId preenchido por linha (uq_lgpd_employee e
// uq_lgpd_clevel sao indices separados).

export interface DerivedLgpdConsent {
  readonly companyId: number;
  readonly employeeId: number | null;
  readonly clevelId: number | null;
  readonly versaoTermoAceita: string;
  readonly aceitoEm: Date;
  readonly createdAt: Date;
}

/**
 * 14 identidades com acesso a plataforma principal (D2 aprovado — pre-aceite):
 *   - 3 C-levels
 *   - 9 lider_f6 (Juliana, Fernando, Camila, Marcelo, Gustavo, Marcio, Bianca, Thiago, Renata)
 *   - 2 RH puros (Marina Lopes id=46, Tatiane Freitas id=47)
 *
 * Aceito canonico: data de admissao do proprio user.
 */
export function deriveLgpdConsents(
  companyId: number,
  termVersion: string,
): readonly DerivedLgpdConsent[] {
  const rows: DerivedLgpdConsent[] = [];

  // C-levels
  for (const cl of NATIVA_CLEVELS) {
    const aceitoEm = new Date(cl.dataAdmissao + 'T10:00:00.000Z');
    rows.push({
      companyId,
      employeeId: null,
      clevelId: cl.id,
      versaoTermoAceita: termVersion,
      aceitoEm,
      createdAt: aceitoEm,
    });
  }

  // Lideres F6 + RH puros
  for (const emp of NATIVA_EMPLOYEES) {
    const isLider = deriveIsLider(emp.cargoCodigo);
    const isRH = deriveIsRH(emp.nomeCompleto);
    if (!isLider && !isRH) continue;

    const aceitoEm = new Date(emp.dataAdmissao + 'T10:00:00.000Z');
    rows.push({
      companyId,
      employeeId: emp.id,
      clevelId: null,
      versaoTermoAceita: termVersion,
      aceitoEm,
      createdAt: aceitoEm,
    });
  }

  return Object.freeze(rows);
}

export const NATIVA_LGPD_CONSENTS_COUNT = 14 as const;

// ---------------------------------------------------------------------
// 6. responsavelFinanceiroTransferLog (2 registros)
// ---------------------------------------------------------------------
//
// Schema canonico bit-exact (tables.ts:278-293):
//   companyId, previousHolderType ∈ ('employee','cLevel','none') NOT NULL,
//   previousHolderId nullable, newHolderType NOT NULL, newHolderId nullable,
//   actorSuperAdminId NOT NULL, eventType, reason NOT NULL.
//
// Atencao canonica: enum e 'cLevel' com C maiusculo — nao 'clevel'.

export type RfHolderType = 'employee' | 'cLevel' | 'none';

export interface DerivedRfLog {
  readonly companyId: number;
  readonly previousHolderType: RfHolderType;
  readonly previousHolderId: number | null;
  readonly newHolderType: RfHolderType;
  readonly newHolderId: number | null;
  readonly actorSuperAdminId: number;
  readonly eventType: RfEventType;
  readonly reason: string;
  readonly createdAt: Date;
}

export function deriveRfTransferLog(
  companyId: number,
  superAdminId: number,
): readonly DerivedRfLog[] {
  return Object.freeze([
    {
      companyId,
      previousHolderType: 'none' as const,
      previousHolderId: null,
      newHolderType: 'cLevel' as const,
      newHolderId: 2, // Patricia Menezes
      actorSuperAdminId: superAdminId,
      eventType: 'atribuido' as const,
      reason:
        'Nomeacao inicial canonica do Responsavel Financeiro da Nativa ' +
        'Alimentos Ltda. Patricia Menezes (CFO) assume o papel funcional desde ' +
        'a adocao da plataforma em 2025-11-15. Fonte: MD Nativa §2 v1.1.',
      createdAt: new Date('2025-11-15T10:00:00.000Z'),
    },
    {
      companyId,
      previousHolderType: 'cLevel' as const,
      previousHolderId: 2, // Patricia Menezes
      newHolderType: 'employee' as const,
      newHolderId: 4, // Juliana Freitas
      actorSuperAdminId: superAdminId,
      eventType: 'transferido' as const,
      reason:
        'Transferencia canonica bit-exact do papel funcional de Responsavel ' +
        'Financeiro de Patricia Menezes (CFO) para Juliana Freitas (Controller) ' +
        'em 2027-01-15. Motivo canonico: Patricia mantem titulo CFO mas Juliana ' +
        'passa a responder operacionalmente pelos fechamentos mensais. ' +
        'Fonte: MD Nativa §2.1 v1.1.',
      createdAt: new Date('2027-01-15T10:00:00.000Z'),
    },
  ]);
}

export const NATIVA_RF_LOG_COUNT = 2 as const;

// ---------------------------------------------------------------------
// 7. cycleSchedule (5 registros: 1 por tipoCiclo apontado ao proximo ciclo natural)
// ---------------------------------------------------------------------
//
// Schema canonico bit-exact (tables.ts:1338-1373):
//   companyId, tipoCiclo, cicloReferencia (nao cicloRef), dataAbertura/Corte/Fechamento
//   como timestamp, status ∈ ('aberto','atrasado','fechado') — nao existe
//   'agendado' nem 'em_corte'.
//
// Racional canonico: registros iniciais entram como 'aberto' (o proximo ciclo
// esta agendado no futuro, mas o unico status inicial permitido no enum e
// 'aberto'). Como o motor filtra `isDemo=false`, ele nunca transita para
// 'atrasado' ou 'fechado' automaticamente na Nativa.

export type CycleScheduleStatus = 'aberto' | 'atrasado' | 'fechado';

export interface DerivedCycleSchedule {
  readonly companyId: number;
  readonly tipoCiclo: TipoCiclo;
  readonly cicloReferencia: string;
  readonly dataAbertura: Date;
  readonly dataCorte: Date;
  readonly dataFechamento: Date | null;
  readonly status: CycleScheduleStatus;
  readonly createdAt: Date;
}

/**
 * Configuracao inerte: motores canonicos filtram `companies.isDemo = false`
 * antes de processar, portanto nenhum ciclo agendado sera efetivamente aberto.
 * Este registro existe apenas para satisfazer o schema (routers de dashboard
 * consultam cycleSchedule para exibir 'proximo ciclo').
 *
 * Configurado apontando para T9 (2028-Q1), o proximo ciclo natural pos-seed.
 */
export function deriveCycleSchedule(companyId: number): readonly DerivedCycleSchedule[] {
  const dataAbertura = new Date('2028-01-01T00:00:00.000Z');
  const dataCorte = new Date('2028-04-10T00:00:00.000Z');
  const dataFechamento = new Date('2028-04-11T00:00:00.000Z');
  const createdAt = new Date('2027-12-31T23:59:59.000Z');

  return Object.freeze([
    {
      companyId,
      tipoCiclo: 'instrumento_a' as const,
      cicloReferencia: '2028-Q1',
      dataAbertura,
      dataCorte,
      dataFechamento,
      status: 'aberto' as const,
      createdAt,
    },
    {
      companyId,
      tipoCiclo: 'instrumento_c' as const,
      cicloReferencia: '2028-Q1',
      dataAbertura,
      dataCorte,
      dataFechamento,
      status: 'aberto' as const,
      createdAt,
    },
    {
      companyId,
      tipoCiclo: 'instrumento_d' as const,
      cicloReferencia: '2028-Q1',
      dataAbertura,
      dataCorte,
      dataFechamento,
      status: 'aberto' as const,
      createdAt,
    },
    {
      companyId,
      tipoCiclo: 'fechamento_mensal' as const,
      cicloReferencia: '2028-01',
      dataAbertura: new Date('2028-01-01T00:00:00.000Z'),
      dataCorte: new Date('2028-02-10T23:59:59.000Z'),
      dataFechamento: new Date('2028-02-11T00:00:00.000Z'),
      status: 'aberto' as const,
      createdAt,
    },
    // radar_nr1 canonicamente 'fechado' do ciclo passado.
    {
      companyId,
      tipoCiclo: 'radar_nr1' as const,
      cicloReferencia: '2026',
      dataAbertura: new Date('2026-10-20T00:00:00.000Z'),
      dataCorte: new Date('2026-11-30T00:00:00.000Z'),
      dataFechamento: new Date('2026-11-30T00:00:00.000Z'),
      status: 'fechado' as const,
      createdAt: new Date('2026-10-20T00:00:00.000Z'),
    },
  ]);
}

export const NATIVA_CYCLE_SCHEDULE_COUNT = 5 as const;

// ---------------------------------------------------------------------
// 8. individualProfilePlaceholders (69: 66 respondidos + 3 C-levels pendentes)
// ---------------------------------------------------------------------

export type PlaceholderStatus =
  'pendente' | 'em_andamento' | 'respondido' | 'inconsistente' | 'aguardando_nova_resposta';

export interface DerivedProfilePlaceholder {
  readonly companyId: number;
  readonly userType: 'employee' | 'clevel';
  readonly userId: number;
  readonly status: PlaceholderStatus;
  readonly createdAt: Date;
  readonly respondidoEm: Date | null;
}

/**
 * D8 aprovado: 3 C-levels ficam com status='pendente' para exercitar o fluxo
 * de resposta do Perfil Individual a partir do dashboard C-level. Os 66
 * employees ficam com status='respondido' (respostas embutidas nos assessments
 * carregados via JSON).
 */
export function deriveProfilePlaceholders(companyId: number): readonly DerivedProfilePlaceholder[] {
  const rows: DerivedProfilePlaceholder[] = [];

  // 3 C-levels pendentes
  for (const cl of NATIVA_CLEVELS) {
    rows.push({
      companyId,
      userType: 'clevel',
      userId: cl.id,
      status: 'pendente',
      createdAt: new Date(cl.dataAdmissao + 'T10:00:00.000Z'),
      respondidoEm: null,
    });
  }

  // 66 employees respondidos (data canonica: 30 dias apos admissao ou 15/02/2026,
  // o que for maior)
  for (const emp of NATIVA_EMPLOYEES) {
    const admissao = new Date(emp.dataAdmissao);
    const trintaDiasApos = new Date(admissao.getTime() + 30 * 24 * 3600 * 1000);
    const dataMinima = new Date('2026-02-15T10:00:00.000Z');
    const respondidoEm = trintaDiasApos > dataMinima ? trintaDiasApos : dataMinima;

    rows.push({
      companyId,
      userType: 'employee',
      userId: emp.id,
      status: 'respondido',
      createdAt: new Date(emp.dataAdmissao + 'T10:00:00.000Z'),
      respondidoEm,
    });
  }

  return Object.freeze(rows);
}

export const NATIVA_PROFILE_PLACEHOLDERS_COUNT = 69 as const;
