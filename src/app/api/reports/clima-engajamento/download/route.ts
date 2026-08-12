// ROIP APP 9BOX — Route Handler `GET /api/reports/clima-engajamento/download`
// (ME-053, S275; ME-070 refactor S366).
//
// Endpoint canonico de download do PDF de Clima e engajamento
// (DOC 03 §13.6). Gera on-the-fly, sem cache, sem persistencia. Nao
// consome `pdfEphemeralToken` (§13.6: "URL de acesso direto" — sem
// token efemero por nao envolver IA).
//
// Autorizacao canonica: Bearer JWT do regime administrativo do §5
// via header `Authorization: Bearer <jwt>` (mesmo regime das
// procs tRPC administrativas). Autorizado: Bruno / RH / C-level
// acessoTotal=true.
//
// Parametros da query:
//   - companyId — obrigatorio.
//
// Retornos:
// - 200 + application/pdf — sucesso.
// - 401 — JWT ausente ou invalido.
// - 403 — perfil sem permissao.
// - 404 — empresa/agregados de clima ausentes.
//
// S366 canonizada (ME-069, aplicacao bulk ME-070): estado privado
// dbClient, renderer PDF, relogio e respectivos escape hatches
// migraram para `./internals.ts` irmao. Este arquivo exporta apenas
// GET para conformidade Next 15 App Router.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { and, desc, eq } from 'drizzle-orm';
import { jwtVerify } from 'jose';

import { type RoipDbClient } from '../../../../../db/client';
import {
  cLevelMembers,
  climateEngagementData,
  companies,
  employees,
} from '../../../../../db/schema';
import { sanitizeRazaoSocial } from '../../../../../server/routers/spreadsheets';
import {
  composeClimaEngajamentoFilename,
  renderClimaEngajamentoHTML,
  type ClimaBlocoDepartamento,
  type ClimaBlocoEscopo,
} from '../../../../../server/pdf-templates/climaEngajamentoTemplate';
import {
  EXEC_REPORT_CLIMA_PISO_RESPONDENTES,
  EXEC_REPORT_NOTA_AGREGACAO_DEPARTAMENTO,
  EXEC_REPORT_NOTA_AGREGACAO_EMPRESA,
} from '../../../../../server/services/executiveReportEngine';

import { getDbClient, getNowFn, getPdfRendererFacade } from './internals';

// ============================================================
// Helper: extrai + verifica JWT do request
// ============================================================

interface VerifiedIdentity {
  role: 'super_admin' | 'rh' | 'rh_lider' | 'clevel' | 'lider' | 'employee';
  userId: number;
  companyId: number | null;
}

async function verifyBearer(req: Request): Promise<VerifiedIdentity | null> {
  let tokenStr: string | undefined;
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    tokenStr = auth.slice(7);
  }
  // D098-2 fix: fallback to session cookie for window.open.
  if (!tokenStr) {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    if (sessionCookie) {
      tokenStr = sessionCookie.value;
    }
  }
  if (!tokenStr) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(tokenStr, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    });
    const role = payload.role;
    if (typeof role !== 'string') return null;
    // Super Admin JWT carries sub as string, not userId.
    const rawId = payload.userId ?? payload.sub;
    const userId =
      typeof rawId === 'number'
        ? rawId
        : typeof rawId === 'string'
          ? Number.parseInt(rawId, 10)
          : Number.NaN;
    if (!Number.isFinite(userId)) return null;
    const companyId = typeof payload.companyId === 'number' ? payload.companyId : null;
    return {
      role: role as VerifiedIdentity['role'],
      userId,
      companyId,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Handler canonico
// ============================================================

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const companyIdStr = url.searchParams.get('companyId');
  if (!companyIdStr) {
    return NextResponse.json({ error: 'company_id_ausente' }, { status: 400 });
  }
  const companyId = Number.parseInt(companyIdStr, 10);
  if (!Number.isFinite(companyId)) {
    return NextResponse.json({ error: 'company_id_invalido' }, { status: 400 });
  }

  const identity = await verifyBearer(req);
  if (!identity) {
    return NextResponse.json({ error: 'nao_autenticado' }, { status: 401 });
  }
  const rolesPermitidos: VerifiedIdentity['role'][] = ['super_admin', 'rh', 'clevel'];
  if (!rolesPermitidos.includes(identity.role)) {
    return NextResponse.json({ error: 'perfil_sem_permissao' }, { status: 403 });
  }
  if (identity.role !== 'super_admin' && identity.companyId !== companyId) {
    return NextResponse.json({ error: 'company_mismatch' }, { status: 403 });
  }

  const client = getDbClient();
  const db = client.db;

  // C-level: exige acessoTotal=true.
  if (identity.role === 'clevel') {
    const cRows = await db
      .select({ acessoTotal: cLevelMembers.acessoTotal })
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, identity.userId))
      .limit(1);
    const c = cRows[0];
    if (!c || c.acessoTotal === false) {
      return NextResponse.json({ error: 'acesso_limitado' }, { status: 403 });
    }
  }

  const companyRows = await db
    .select({ nomeFantasia: companies.nomeFantasia, razaoSocial: companies.razaoSocial })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const company = companyRows[0];
  if (!company) {
    return NextResponse.json({ error: 'empresa_nao_encontrada' }, { status: 404 });
  }

  const trimestreRows = await db
    .select({ trimestre: climateEngagementData.trimestre })
    .from(climateEngagementData)
    .where(eq(climateEngagementData.companyId, companyId))
    .orderBy(desc(climateEngagementData.trimestre))
    .limit(1);
  const trimestre = trimestreRows[0]?.trimestre;
  if (!trimestre) {
    return NextResponse.json({ error: 'sem_agregados_clima' }, { status: 404 });
  }

  // Bloco empresa.
  const rowEmpresa = await getClimaRowByLevel(db, companyId, 'empresa', null, null, trimestre);
  const blocoEmpresa: ClimaBlocoEscopo =
    rowEmpresa === null
      ? {
          titulo: 'Empresa',
          respondentes: 0,
          notaClima: null,
          adesao: null,
          porDimensao: {
            engajamento: null,
            desenvolvimento: null,
            pertencimento: null,
            realizacao: null,
          },
          notaAgregacao: null,
        }
      : rowToBloco('Empresa', rowEmpresa, null);

  // Blocos por departamento com equipes internas.
  const deptRows = await db
    .select({ departamento: employees.departamento })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
    .groupBy(employees.departamento);

  const blocosDepartamentos: ClimaBlocoDepartamento[] = [];
  for (const d of deptRows) {
    const rowDept = await getClimaRowByLevel(
      db,
      companyId,
      'departamento',
      d.departamento,
      null,
      trimestre,
    );
    const blocoDept: ClimaBlocoEscopo =
      rowDept === null || rowDept.countCobertura < EXEC_REPORT_CLIMA_PISO_RESPONDENTES
        ? {
            titulo: d.departamento,
            respondentes: rowDept?.countCobertura ?? 0,
            notaClima: null,
            adesao: null,
            porDimensao: {
              engajamento: null,
              desenvolvimento: null,
              pertencimento: null,
              realizacao: null,
            },
            notaAgregacao: EXEC_REPORT_NOTA_AGREGACAO_EMPRESA,
          }
        : rowToBloco(d.departamento, rowDept, null);

    // Equipes do departamento — busca lideres ativos e climas por lider.
    const lideres = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(
        and(
          eq(employees.companyId, companyId),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ok
          eq(employees.departamento, d.departamento as any),
          eq(employees.status, 'ativo'),
          eq(employees.isLider, true),
        ),
      );
    const equipes: ClimaBlocoEscopo[] = [];
    for (const l of lideres) {
      const rowEq = await getClimaRowByLevel(db, companyId, 'equipe', null, l.id, trimestre);
      if (rowEq === null || rowEq.countCobertura < EXEC_REPORT_CLIMA_PISO_RESPONDENTES) {
        equipes.push({
          titulo: `Equipe: ${l.name}`,
          respondentes: rowEq?.countCobertura ?? 0,
          notaClima: null,
          adesao: null,
          porDimensao: {
            engajamento: null,
            desenvolvimento: null,
            pertencimento: null,
            realizacao: null,
          },
          notaAgregacao: EXEC_REPORT_NOTA_AGREGACAO_DEPARTAMENTO,
        });
      } else {
        equipes.push(rowToBloco(`Equipe: ${l.name}`, rowEq, null));
      }
    }
    blocosDepartamentos.push({ ...blocoDept, equipes });
  }

  const now = getNowFn()();
  const geradoEmIso = now.toISOString();
  const razaoSocialSan = sanitizeRazaoSocial(company.razaoSocial);
  const html = renderClimaEngajamentoHTML({
    nomeFantasia: company.nomeFantasia,
    razaoSocialSanitizada: razaoSocialSan,
    trimestre,
    blocoEmpresa,
    blocosDepartamentos,
    geradoEmIso,
  });

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await getPdfRendererFacade().renderPdf(html);
  } catch (err) {
    return NextResponse.json(
      { error: 'falha_render', message: (err as Error).message },
      { status: 500 },
    );
  }

  const filename = composeClimaEngajamentoFilename(razaoSocialSan, trimestre, geradoEmIso);

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

// ============================================================
// Agregacao auxiliar
// ============================================================

interface ClimaRawRow {
  notaClima: string | null;
  adesao: string | null;
  countCobertura: number;
  notaEngajamento: string | null;
  notaDesenvolvimento: string | null;
  notaPertencimento: string | null;
  notaRealizacao: string | null;
}

async function getClimaRowByLevel(
  db: RoipDbClient['db'],
  companyId: number,
  escopo: 'empresa' | 'departamento' | 'equipe',
  departamento: string | null,
  liderId: number | null,
  trimestre: string,
): Promise<ClimaRawRow | null> {
  const where = [
    eq(climateEngagementData.companyId, companyId),
    eq(climateEngagementData.escopo, escopo),
    eq(climateEngagementData.trimestre, trimestre),
  ];
  if (departamento !== null) {
    where.push(eq(climateEngagementData.departamento, departamento));
  }
  if (liderId !== null) {
    where.push(eq(climateEngagementData.liderId, liderId));
  }
  const rows = await db
    .select({
      notaClima: climateEngagementData.notaClima,
      adesao: climateEngagementData.adesao,
      countCobertura: climateEngagementData.countCobertura,
      notaEngajamento: climateEngagementData.notaEngajamento,
      notaDesenvolvimento: climateEngagementData.notaDesenvolvimento,
      notaPertencimento: climateEngagementData.notaPertencimento,
      notaRealizacao: climateEngagementData.notaRealizacao,
    })
    .from(climateEngagementData)
    .where(and(...where))
    .limit(1);
  return rows[0] ?? null;
}

function rowToBloco(
  titulo: string,
  row: ClimaRawRow,
  notaAgregacao: string | null,
): ClimaBlocoEscopo {
  return {
    titulo,
    respondentes: row.countCobertura,
    notaClima: row.notaClima ? Number(row.notaClima) : null,
    adesao: row.adesao ? Number(row.adesao) : null,
    porDimensao: {
      engajamento: row.notaEngajamento ? Number(row.notaEngajamento) : null,
      desenvolvimento: row.notaDesenvolvimento ? Number(row.notaDesenvolvimento) : null,
      pertencimento: row.notaPertencimento ? Number(row.notaPertencimento) : null,
      realizacao: row.notaRealizacao ? Number(row.notaRealizacao) : null,
    },
    notaAgregacao,
  };
}
