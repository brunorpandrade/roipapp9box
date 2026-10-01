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
import { and, eq } from 'drizzle-orm';
import { jwtVerify } from 'jose';

import { cLevelMembers, companies, employees } from '../../../../../db/schema';
import { sanitizeRazaoSocial } from '../../../../../server/routers/spreadsheets';
import {
  composeClimaEngajamentoFilename,
  renderClimaEngajamentoHTML,
  type ClimaBlocoDepartamento,
  type ClimaBlocoEscopo,
} from '../../../../../server/pdf-templates/climaEngajamentoTemplate';
import {
  type ClimateBlockPayload,
  computeClimateBlock,
  listClimateTrimestres,
  PISO_RESPONDENTES_CLIMATE,
} from '../../../../../server/services/climateCalculationEngine';
import {
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
  const rolesPermitidos: VerifiedIdentity['role'][] = ['super_admin', 'rh', 'rh_lider', 'clevel'];
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

  // ME-B2-01b Q1=D — trimestre canonico via motor puro (sob demanda,
  // sem cache). Substitui a leitura da tabela derivada aposentada.
  const trimestres = await listClimateTrimestres(db, companyId, 'desc');
  const trimestre = trimestres[0];
  if (!trimestre) {
    return NextResponse.json({ error: 'sem_agregados_clima' }, { status: 404 });
  }

  // Bloco empresa (sob demanda).
  const payloadEmpresa = await computeClimateBlock(db, {
    companyId,
    escopo: 'empresa',
    escopoReferencia: null,
    liderId: null,
    liderTipo: null,
    trimestre,
  });
  const blocoEmpresa: ClimaBlocoEscopo =
    payloadEmpresa === null
      ? emptyBloco('Empresa', 0, null)
      : payloadToBloco('Empresa', payloadEmpresa, null);

  // Blocos por departamento com equipes internas.
  const deptRows = await db
    .select({ departamento: employees.departamento })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
    .groupBy(employees.departamento);

  const blocosDepartamentos: ClimaBlocoDepartamento[] = [];
  for (const d of deptRows) {
    const payloadDept = await computeClimateBlock(db, {
      companyId,
      escopo: 'departamento',
      escopoReferencia: d.departamento,
      liderId: null,
      liderTipo: null,
      trimestre,
    });
    const blocoDept: ClimaBlocoEscopo =
      payloadDept === null || payloadDept.countCobertura < PISO_RESPONDENTES_CLIMATE
        ? emptyBloco(
            d.departamento,
            payloadDept?.countCobertura ?? 0,
            EXEC_REPORT_NOTA_AGREGACAO_EMPRESA,
          )
        : payloadToBloco(d.departamento, payloadDept, null);

    // Equipes do departamento — lideres employee ativos + payload
    // canonico via motor puro por lider.
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
      const payloadEq = await computeClimateBlock(db, {
        companyId,
        escopo: 'equipe',
        escopoReferencia: null,
        liderId: l.id,
        liderTipo: 'employee',
        trimestre,
      });
      if (payloadEq === null || payloadEq.countCobertura < PISO_RESPONDENTES_CLIMATE) {
        equipes.push(
          emptyBloco(
            `Equipe: ${l.name}`,
            payloadEq?.countCobertura ?? 0,
            EXEC_REPORT_NOTA_AGREGACAO_DEPARTAMENTO,
          ),
        );
      } else {
        equipes.push(payloadToBloco(`Equipe: ${l.name}`, payloadEq, null));
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

/**
 * ME-B2-01b Q1=D — converte o payload canonico do motor puro no
 * shape esperado pelo template PDF. Substitui o antigo `rowToBloco`
 * que lia da tabela derivada aposentada.
 */
function payloadToBloco(
  titulo: string,
  payload: ClimateBlockPayload,
  notaAgregacao: string | null,
): ClimaBlocoEscopo {
  return {
    titulo,
    respondentes: payload.countCobertura,
    notaClima: payload.notaClima,
    adesao: payload.adesao,
    porDimensao: {
      engajamento: payload.notaEngajamento,
      desenvolvimento: payload.notaDesenvolvimento,
      pertencimento: payload.notaPertencimento,
      realizacao: payload.notaRealizacao,
    },
    notaAgregacao,
  };
}

/**
 * ME-B2-01b Q1=D — bloco canonicamente vazio (escopo sem cobertura
 * suficiente). Usado quando o piso 3 nao e atingido, canonizando a
 * mensagem de agregacao ao nivel superior.
 */
function emptyBloco(
  titulo: string,
  respondentes: number,
  notaAgregacao: string | null,
): ClimaBlocoEscopo {
  return {
    titulo,
    respondentes,
    notaClima: null,
    adesao: null,
    porDimensao: {
      engajamento: null,
      desenvolvimento: null,
      pertencimento: null,
      realizacao: null,
    },
    notaAgregacao,
  };
}
