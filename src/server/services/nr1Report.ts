// ROIP APP 9BOX — servico `nr1Report` (ME-050/51, S250).
//
// Orquestrador canonico do relatorio PDF do Radar NR-1
// (DOC 03 §11.12). Agrega os dados do ciclo fechado — companies,
// copsoqCycles, copsoqFactorScores por escopo, nr1AreaDivergenceAnalysis
// — no shape `Nr1TemplateInput` consumido pelo template determinístico.
//
// Regime canonico (§11.12):
// - Sem cache — cada solicitacao regenera a agregacao a partir das
//   tabelas persistidas.
// - Renderizacao 100% deterministica (mesmos dados = mesmo PDF byte a
//   byte, exceto pelo timestamp de geracao).
// - Sem chamada a IA. O template ja e determinístico.
//
// Consumido por: `POST /api/nr1/download-report/route.ts` (Route
// Handler S207), autorizado pelo `pdfEphemeralToken` (S254).
//
// Nota canonica de auditoria (§11.12): a nota de edicao da data de
// fechamento aparece condicionalmente na pagina de rastreabilidade
// se `copsoqCycles.dataFechamentoOriginal IS NOT NULL`. Este service
// popula `notaAuditoriaEdicao` apenas nesse caso; caso contrario deixa
// `undefined` e o template omite.

import type { RoipDatabase } from '../../db/client';
import { getCompanyById } from './companies';
import { getCopsoqCycleById } from './copsoqCycles';
import { listCopsoqFactorScoresByCiclo } from './copsoqFactorScores';
import { listNr1AreaDivergenceAnalysisByCiclo } from './nr1AreaDivergenceAnalysis';
import { listCopsoqCycleSnapshotsByCiclo } from './copsoqCycleSnapshot';
import type { LayoutBaseCompany } from '../pdf-templates/layoutBase';
import type {
  Nr1AlertaFator,
  Nr1CicloInfo,
  Nr1DepartamentoInsuficiente,
  Nr1DepartamentoScore,
  Nr1DivergenceEntry,
  Nr1FatorScore,
  Nr1NotaAuditoriaEdicao,
  Nr1TemplateInput,
} from '../pdf-templates/nr1Template';

/**
 * Rotulos canonicos dos 8 fatores psicossociais (indices 1..8).
 * Origem: DOC 03 §11 (Radar NR-1). Consumido para render dos radares
 * e alertas informativos (§11.13).
 */
export const NR1_FATOR_NOMES: Record<number, string> = {
  1: 'Demandas',
  2: 'Controle',
  3: 'Apoio Social',
  4: 'Relacoes',
  5: 'Funcao',
  6: 'Mudanca',
  7: 'Saude',
  8: 'Reconhecimento',
};

/**
 * Formata uma coluna DATE (Date | string) do MySQL como YYYY-MM-DD
 * deterministicamente. Nunca faz `toLocaleDateString` (dependeria de
 * locale do runtime — quebra determinismo).
 */
function toIsoDate(v: Date | string | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

function toIsoDateTime(v: Date | string | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return v.toISOString();
}

function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

interface CicloRow {
  id: number;
  companyId: number;
  ciclo: string;
  dataAbertura: Date | string | null;
  dataFechamento: Date | string | null;
  dataFechamentoOriginal: Date | string | null;
  ultimaEdicaoEm: Date | string | null;
  ultimaEdicaoJustificativa: string | null;
  status: string;
  departamentoCriticoNome?: string | null;
  departamentosAmostraInsuficiente?: unknown;
}

/**
 * Deps injetaveis do orquestrador. Testes substituem para exercitar o
 * shape do `Nr1TemplateInput` sem tocar o banco real.
 */
export interface Nr1ReportDeps {
  db: RoipDatabase;
  now?: () => Date;
}

/**
 * Erros canonicos discriminados que o Route Handler traduz em HTTP.
 */
export type Nr1ReportBuildError =
  { kind: 'ciclo_not_found' } | { kind: 'company_not_found' } | { kind: 'ciclo_not_closed' };

export type Nr1ReportBuildResult =
  { ok: true; input: Nr1TemplateInput } | { ok: false; error: Nr1ReportBuildError };

/**
 * Compoe o `Nr1TemplateInput` a partir dos dados persistidos do ciclo.
 * Nunca lanca — devolve union discriminado.
 *
 * Fluxo canonico:
 * 1. Carrega o ciclo por id.
 * 2. Carrega a empresa dona.
 * 3. Agrega scores por escopo (empresa vs departamento).
 * 4. Agrega divergencias.
 * 5. Agrega snapshots para totais elegiveis / respondentes.
 * 6. Deriva alertas informativos (§11.13 — score < 50).
 * 7. Deriva departamentos com amostra insuficiente (piso 5).
 * 8. Constroi nota de auditoria de edicao se aplicavel.
 */
export async function buildNr1TemplateInput(
  deps: Nr1ReportDeps,
  cicloDbId: number,
): Promise<Nr1ReportBuildResult> {
  const now = deps.now ?? ((): Date => new Date());

  const cicloRaw = (await getCopsoqCycleById(deps.db, cicloDbId)) as CicloRow | undefined;
  if (!cicloRaw) {
    return { ok: false, error: { kind: 'ciclo_not_found' } };
  }
  if (cicloRaw.status !== 'fechado') {
    return { ok: false, error: { kind: 'ciclo_not_closed' } };
  }

  const company = await getCompanyById(deps.db, cicloRaw.companyId);
  if (!company) {
    return { ok: false, error: { kind: 'company_not_found' } };
  }

  const layoutCompany: LayoutBaseCompany = {
    nomeFantasia:
      (company as { nomeFantasia?: string | null }).nomeFantasia ??
      (company as { razaoSocial?: string | null }).razaoSocial ??
      'Empresa',
    logoUrl: (company as { logoUrl?: string | null }).logoUrl ?? undefined,
  };

  const scores = await listCopsoqFactorScoresByCiclo(deps.db, cicloDbId);

  // Radar empresa: 8 fatores no escopo `empresa`.
  const radarEmpresa: Nr1FatorScore[] = [1, 2, 3, 4, 5, 6, 7, 8].map((fatorId) => {
    const row = scores.find((s) => s.escopo === 'empresa' && s.fator === fatorId);
    return {
      fatorId,
      nome: NR1_FATOR_NOMES[fatorId] ?? `Fator ${fatorId}`,
      score: row ? toNumber(row.score) : 0,
    };
  });

  // Radar por departamento: agrupa por `escopoDepartamentoId`.
  const departamentoScoresMap: Map<number, Nr1FatorScore[]> = new Map();
  for (const s of scores) {
    if (s.escopo !== 'departamento') continue;
    if (s.escopoDepartamentoId === null || s.escopoDepartamentoId === undefined) continue;
    const arr = departamentoScoresMap.get(s.escopoDepartamentoId) ?? [];
    arr.push({
      fatorId: s.fator,
      nome: NR1_FATOR_NOMES[s.fator] ?? `Fator ${s.fator}`,
      score: toNumber(s.score),
    });
    departamentoScoresMap.set(s.escopoDepartamentoId, arr);
  }

  // Snapshots: para nome do departamento e contagens.
  const snapshots = await listCopsoqCycleSnapshotsByCiclo(deps.db, cicloDbId);
  const totalElegiveis = snapshots.length;
  const totalRespondentes = snapshots.filter(
    (s) => (s as { respondeu?: boolean | null }).respondeu === true,
  ).length;

  const departamentosPorId: Map<number, { nome: string; amostra: number }> = new Map();
  for (const snap of snapshots) {
    const depId = (snap as { departamentoId?: number | null }).departamentoId;
    const depNome =
      (snap as { departamentoNome?: string | null }).departamentoNome ?? 'Departamento';
    if (depId === null || depId === undefined) continue;
    const entry = departamentosPorId.get(depId) ?? { nome: depNome, amostra: 0 };
    entry.nome = depNome;
    if ((snap as { respondeu?: boolean | null }).respondeu === true) entry.amostra += 1;
    departamentosPorId.set(depId, entry);
  }

  const radaresPorDepartamento: Nr1DepartamentoScore[] = [];
  const departamentosInsuficientes: Nr1DepartamentoInsuficiente[] = [];
  for (const [depId, meta] of departamentosPorId.entries()) {
    const fatores = departamentoScoresMap.get(depId);
    if (fatores && fatores.length > 0 && meta.amostra >= 5) {
      radaresPorDepartamento.push({
        departamentoNome: meta.nome,
        amostra: meta.amostra,
        fatores: fatores.sort((a, b) => a.fatorId - b.fatorId),
      });
    } else {
      departamentosInsuficientes.push({
        departamentoNome: meta.nome,
        amostra: meta.amostra,
      });
    }
  }

  // Alertas informativos §11.13 — score < 50.
  const alertas: Nr1AlertaFator[] = [];
  for (const f of radarEmpresa) {
    if (f.score < 50) {
      alertas.push({ fatorNome: f.nome, escopo: 'empresa', score: f.score });
    }
  }
  for (const dep of radaresPorDepartamento) {
    for (const f of dep.fatores) {
      if (f.score < 50) {
        alertas.push({
          fatorNome: f.nome,
          escopo: 'departamento',
          departamentoNome: dep.departamentoNome,
          score: f.score,
        });
      }
    }
  }

  // Divergencias — apenas rotulos por departamento (versao mínima canônica).
  const divergRows = await listNr1AreaDivergenceAnalysisByCiclo(deps.db, cicloDbId);
  const divergencias: Nr1DivergenceEntry[] = [];
  for (const row of divergRows) {
    const depId = (row as { escopoDepartamentoId?: number | null }).escopoDepartamentoId;
    const departamentoNome =
      depId !== null && depId !== undefined
        ? (departamentosPorId.get(depId)?.nome ?? 'Departamento')
        : 'Departamento';
    const fatorId = (row as { fator?: number }).fator ?? 0;
    const gapVal = (row as { gap?: string | number | null }).gap ?? 0;
    const scoreEmp = (row as { scoreEmpresa?: string | number | null }).scoreEmpresa ?? 0;
    const scoreDep = (row as { scoreDepartamento?: string | number | null }).scoreDepartamento ?? 0;
    divergencias.push({
      fatorNome: NR1_FATOR_NOMES[fatorId] ?? `Fator ${fatorId}`,
      scoreEmpresa: toNumber(scoreEmp),
      scoreDepartamento: toNumber(scoreDep),
      departamentoNome,
      gap: toNumber(gapVal),
    });
  }

  // Nota de auditoria de edicao (§11.12) — condicional.
  let notaAuditoriaEdicao: Nr1NotaAuditoriaEdicao | undefined;
  if (cicloRaw.dataFechamentoOriginal !== null && cicloRaw.dataFechamentoOriginal !== undefined) {
    notaAuditoriaEdicao = {
      dataFechamentoOriginal: toIsoDate(cicloRaw.dataFechamentoOriginal),
      dataFechamentoAtual: toIsoDate(cicloRaw.dataFechamento),
      ultimaEdicaoEm: toIsoDateTime(cicloRaw.ultimaEdicaoEm),
      // Nome do executor requer JOIN com employees/superAdmins que
      // vive em ME de refinamento (D### de debito); nesta ME entrega
      // rotulo minimo canonico.
      ultimaEdicaoPor: 'Autor da edicao',
      ultimaEdicaoJustificativa: cicloRaw.ultimaEdicaoJustificativa ?? '',
    };
  }

  const cicloInfo: Nr1CicloInfo = {
    cicloRotulo: cicloRaw.ciclo,
    dataAbertura: toIsoDate(cicloRaw.dataAbertura),
    dataFechamento: toIsoDate(cicloRaw.dataFechamento),
    totalRespondentes,
    totalElegiveis,
  };

  const generatedAt = now();
  const input: Nr1TemplateInput = {
    company: layoutCompany,
    ciclo: cicloInfo,
    // Resumo executivo canonico minimo — MEs de refinamento posteriores
    // podem enriquecer. O template renderiza o texto como paragrafo.
    resumoExecutivo:
      alertas.length > 0
        ? `Ciclo com ${alertas.length} alerta(s) informativo(s) — ` +
          'atencao aos fatores com score abaixo de 50.'
        : 'Ciclo sem fatores em alerta.',
    radarEmpresa,
    radaresPorDepartamento,
    departamentosInsuficientes,
    divergencias,
    departamentoCritico: cicloRaw.departamentoCriticoNome
      ? {
          nome: cicloRaw.departamentoCriticoNome,
          fatoresCriticos: [],
          diagnostico:
            'Departamento identificado com maior severidade agregada no fechamento do ciclo.',
        }
      : undefined,
    alertas,
    sugestoesProximosPassos: [],
    ...(notaAuditoriaEdicao ? { notaAuditoriaEdicao } : {}),
    generatedAtIso: generatedAt.toISOString(),
    generatedAtDate: toIsoDate(generatedAt),
  };

  return { ok: true, input };
}
