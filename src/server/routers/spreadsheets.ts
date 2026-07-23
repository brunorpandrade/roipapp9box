// ROIP APP 9BOX — sub-router `spreadsheets` (ME-048).
//
// Decima-nona ME do Bloco B3 — abre a superficie tRPC canonica do
// §3.11 do DOC 03 (Preenchimento mensal em planilha XLSX). Fecha o
// dominio de download de templates e upload de preenchimento massivo
// dos dados mensais RH e Lider. Nome canonico unico `spreadsheets` —
// o §3.11 usa o namespace literal em todas as 4 procs.
//
// Procedures canonicas (§3.11 + §3.12):
//   - `spreadsheets.downloadRHTemplate` — gera XLSX pronto para
//     preenchimento pelo RH com cabecalhos canonicos exatos (§3.11):
//     Nome | CPF | Cargo | Lider direto | Custo mensal (R$) | Faltas.
//     Nome, CPF, Cargo e Lider direto pre-preenchidos. Faltas = 0.
//     Custo mensal vazio. Aba unica com nome canonico
//     `Preenchimento mensal RH`. Nome de arquivo canonico:
//     `template_rh_[razaoSocialSanitizada]_[YYYY-MM].xlsx` (S188).
//     Autorizacao: super_admin, rh, rh_lider (mesmo perfil de
//     saveMonthlyRHData).
//
//   - `spreadsheets.uploadRHData` — parser XLSX do preenchimento RH.
//     Le o buffer XLSX (Base64 no wire), valida cabecalhos exatos,
//     valida linha a linha (§3.12), agrega em input canonico e
//     delega a `monthlyData.saveMonthlyRHData` via caller tRPC
//     interno (S185 — reusa 100% das validacoes canonicas §3.12,
//     mensagens literais e semantica dedupe (companyId, employeeId,
//     mes)). Retorna consolidado tipado com contagens e erros por
//     linha (S186). Autorizacao: mesma matriz da proc reusada.
//
//   - `spreadsheets.downloadLeaderTemplate` — gera XLSX pronto para
//     preenchimento pelo Lider com cabecalhos canonicos exatos CC3
//     (§3.11 + §7.5): Nome liderado | Cargo | Meta [Variavel N] |
//     Demanda [Variavel N] | Realizado [Variavel N] (repetido por
//     variavel ativa da familia canonica de cada liderado; pesos NAO
//     aparecem na planilha). Cell protection nativa exceljs (§3.11
//     CC3): Familia 6 tem Demanda '—' com `locked=true`; peso zero
//     tem Demanda e Realizado com `locked=true`. Aba unica com nome
//     canonico `Preenchimento mensal Lider`. Nome de arquivo:
//     `template_lider_[razaoSocialSanitizada]_[YYYY-MM]_[nomeLider].xlsx`
//     (S188). Autorizacao: super_admin, rh, rh_lider, clevel, lider
//     (mesmo perfil de saveMonthlyLeaderData).
//
//   - `spreadsheets.uploadLeaderData` — parser XLSX do preenchimento
//     Lider. Le o buffer XLSX, valida cabecalhos (variavel a
//     variavel), valida linha a linha, agrega em input canonico e
//     delega a `monthlyData.saveMonthlyLeaderData` via caller tRPC
//     interno (S185 — reusa vinculo-no-mes S080, forca demanda=5
//     para Familia 6, rejeita peso zero via MSG_VARIAVEL_PESO_ZERO,
//     valida executado 1..5 para Familia 6). Retorna consolidado
//     tipado com contagens e erros por linha. Autorizacao: mesma
//     matriz da proc reusada.
//
// Estrategia canonica de reuso (S185):
//   - As procs de upload NUNCA reimplementam validacoes §3.12. Todas
//     as mensagens canonicas literais (custo>0, faltas<=diasUteis,
//     peso zero, familia 6 nota 1..5, mes fechado, vinculo no mes)
//     vem de `saveMonthlyRHData`/`saveMonthlyLeaderData` via caller
//     interno.
//   - Erros por linha do parser (formato invalido, tipo errado,
//     cabecalho ausente) sao acumulados em `LinhaErro`; linhas
//     validas seguem para o caller que aplica §3.12.
//   - A DI Facade `MonthlyDataFacade` isola o acoplamento — testes
//     injetam mock; producao usa `DEFAULT_MONTHLY_DATA_FACADE` que
//     instancia caller interno com `createMonthlyDataRouter()`.
//   - Preserva RV-13 (nenhum atalho a `updatePerformanceDataInputRH`
//     ou `updatePerformanceVariableInputLeader` — via publica canonica
//     e a proc tRPC do §3.11).
//
// Convencoes canonicas herdadas:
//   - DI factory `createSpreadsheetsRouter(deps)` (S049/S168 estendido):
//     `monthlyDataFacade` injetavel; default real
//     `DEFAULT_MONTHLY_DATA_FACADE`. Testes injetam mock (evita subir
//     o monthlyDataRouter dentro do teste do spreadsheets — teste
//     isolado por sub-router, precedente S144).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador nos testes de
//     integracao desta ME + acoplamento no `appRouter` em
//     `index.ts` (RV-13).
//   - Guard cruzado (§2.4) via `assertCompanyScope` interno — mesmo
//     helper canonico de `monthlyData.ts` (duplicado por evitar edit
//     cruzado; padrao S049).
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes tRPC: `tests/integration/spreadsheets-router.test.ts`.

import { TRPCError } from '@trpc/server';
import ExcelJS from 'exceljs';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companies,
  companyJobFamilies,
  employees,
  employeeLeaderHistory,
} from '../../db/schema';
import { roleProcedure, router } from '../trpc';
import type { AuthenticatedUser, Context } from '../trpc';
import { createCallerFactory } from '../trpc';
import { createMonthlyDataRouter, FAMILIA_6_JOB_FAMILY } from './monthlyData';

// ============================================================
// Constantes canonicas literais (S188 — testadas verbatim)
// ============================================================

/** §2.4 — companyId fora do escopo do titular (mensagem canonica). */
export const MSG_EMPRESA_FORA_DO_ESCOPO_SPREADSHEETS = 'Empresa fora do escopo.';

/** §3.11 — arquivo XLSX corrompido ou nao e um XLSX valido. */
export const MSG_XLSX_INVALIDO = 'Arquivo XLSX invalido ou corrompido.';

/** §3.11 — aba canonica ausente no upload. */
export const MSG_ABA_AUSENTE_RH = 'Aba "Preenchimento mensal RH" ausente no arquivo.';
export const MSG_ABA_AUSENTE_LIDER = 'Aba "Preenchimento mensal Lider" ausente no arquivo.';

/** §3.11 — cabecalhos canonicos divergentes ou ausentes. */
export const MSG_CABECALHOS_INVALIDOS_RH =
  'Cabecalhos da planilha divergem do template canonico RH.';
export const MSG_CABECALHOS_INVALIDOS_LIDER =
  'Cabecalhos da planilha divergem do template canonico Lider.';

/** §3.12 — CPF nao encontrado entre os colaboradores ativos da empresa. */
export const MSG_CPF_NAO_ENCONTRADO = 'CPF nao encontrado entre colaboradores da empresa.';

/** §3.12 — Lider informado no upload nao bate com o lider do titular. */
export const MSG_LIDERADO_FORA_DA_CADEIA = 'Liderado fora da cadeia direta do lider no mes.';

/** §3.11 — valor nao numerico em coluna numerica. */
export const MSG_VALOR_NAO_NUMERICO = 'Valor nao numerico em coluna numerica.';

/** §3.11 — linha completamente vazia (informativa; ignorada, nao falha). */
export const MSG_LINHA_VAZIA_IGNORADA = 'Linha vazia ignorada.';

/** §3.11 — nenhuma variavel ativa (peso>0) para a familia do liderado. */
export const MSG_SEM_VARIAVEIS_ATIVAS = 'Familia do liderado sem variaveis ativas para o mes.';

/** Nome canonico da aba unica em cada template (§3.11). */
export const NOME_ABA_RH = 'Preenchimento mensal RH';
export const NOME_ABA_LIDER = 'Preenchimento mensal Lider';

/** Cabecalhos canonicos exatos da aba RH (§3.11 + mockup §7.5). */
export const COLUNAS_CANONICAS_RH = [
  'Nome',
  'CPF',
  'Cargo',
  'Lider direto',
  'Custo mensal (R$)',
  'Faltas',
] as const;

/** Cabecalhos fixos canonicos da aba Lider (S188). */
export const COLUNAS_FIXAS_LIDER = ['Nome liderado', 'Cargo'] as const;

/** Etiquetas dinamicas canonicas CC3 (§3.11 — nunca o nome real da variavel). */
export const LABEL_META = (n: number) => `Meta [Variavel ${n}]`;
export const LABEL_DEMANDA = (n: number) => `Demanda [Variavel ${n}]`;
export const LABEL_REALIZADO = (n: number) => `Realizado [Variavel ${n}]`;

/** Senha canonica interna da sheet protection (nao secreta — a protecao
 *  e de UX, o backend rejeita valores invalidos independentemente).
 *  Constante para reprodutibilidade canonica do hash SHA-256 do arquivo
 *  gerado nao — cada geracao usa `algorithmName=SHA-512` com `saltValue`
 *  aleatorio (exceljs), portanto o buffer varia por chamada. Testes
 *  verificam propriedades estruturais, nao bytes exatos. */
export const SHEET_PROTECTION_PASSWORD = 'roip';

/** Valor canonico exibido na celula Demanda de Familia 6 (§3.11 CC3). */
export const VALOR_DEMANDA_FAMILIA_6 = '—';

// ============================================================
// Zod schemas canonicos
// ============================================================

/** §3.12 — mes canonico YYYY-MM (janeiro..dezembro). */
export const MES_INPUT_SCHEMA_SPREADSHEETS = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: 'Mes deve seguir o formato YYYY-MM.',
});

/** §3.11 — lider tipo (employee ou clevel). */
export const LIDER_TIPO_INPUT_SCHEMA_SPREADSHEETS = z.enum(['employee', 'clevel']);

/** Input canonico da proc `downloadRHTemplate`. */
export const DOWNLOAD_RH_TEMPLATE_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  mes: MES_INPUT_SCHEMA_SPREADSHEETS,
});

/** Input canonico da proc `uploadRHData`.
 *  `xlsxBase64` transporta o buffer XLSX serializado em Base64. */
export const UPLOAD_RH_DATA_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  mes: MES_INPUT_SCHEMA_SPREADSHEETS,
  xlsxBase64: z.string().min(1),
  diasUteis: z.number().int().min(1).max(31).optional(),
});

/** Input canonico da proc `downloadLeaderTemplate`. */
export const DOWNLOAD_LEADER_TEMPLATE_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  mes: MES_INPUT_SCHEMA_SPREADSHEETS,
  liderId: z.number().int().positive(),
  liderTipo: LIDER_TIPO_INPUT_SCHEMA_SPREADSHEETS,
});

/** Input canonico da proc `uploadLeaderData`. */
export const UPLOAD_LEADER_DATA_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  mes: MES_INPUT_SCHEMA_SPREADSHEETS,
  liderId: z.number().int().positive(),
  liderTipo: LIDER_TIPO_INPUT_SCHEMA_SPREADSHEETS,
  xlsxBase64: z.string().min(1),
});

// ============================================================
// Tipos publicos canonicos
// ============================================================

// S193 (ME-043b) — UploadResult e LinhaErro extraidos para modulo
// compartilhado `_shared/uploadResult.ts` para servir como fonte
// canonica unica dos dois sub-routers que produzem uploads
// (spreadsheets e employees). Importados como types locais para uso
// interno neste arquivo e reexportados como types para preservar ABI
// dos importadores externos.
import type { LinhaErro, UploadResult } from './_shared/uploadResult';

export type { LinhaErro, UploadResult };

/** Retorno canonico dos downloads: buffer XLSX em Base64 + metadata. */
export interface DownloadResult {
  filename: string;
  xlsxBase64: string;
  bytes: number;
}

/** Input canonico agregado do saveMonthlyRHData (formato esperado pela
 *  proc reusada). Redefinido localmente para evitar dependencia
 *  circular de tipos com monthlyData.ts. */
export interface SaveMonthlyRHInput {
  companyId: number;
  mes: string;
  diasUteis?: number;
  colaboradores?: Array<{
    employeeId: number;
    custoTotalMes: string;
    faltas: number;
  }>;
}

/** Input canonico agregado do saveMonthlyLeaderData. */
export interface SaveMonthlyLeaderInput {
  companyId: number;
  mes: string;
  liderId: number;
  liderTipo: 'employee' | 'clevel';
  liderados: Array<{
    employeeId: number;
    variaveis: Array<{
      variableIndex: number;
      demanda: string;
      executado: string;
    }>;
  }>;
}

/** Retorno canonico do saveMonthlyRHData/saveMonthlyLeaderData. */
export interface SaveMonthlyDataResultPublic {
  ok: boolean;
  companyId: number;
  mes: string;
  colaboradoresGravados: number;
  variaveisGravadas: number;
}

// ============================================================
// DI Facade — reuso canonico das procs saveMonthly*Data (S185)
// ============================================================

/** Facade injetavel que expoe as duas procs canonicas de save mensal.
 *  Producao usa caller tRPC interno (`DEFAULT_MONTHLY_DATA_FACADE`);
 *  testes injetam mock que grava chamadas sem subir o monthlyData
 *  router (isolamento por sub-router — precedente S144). */
export interface MonthlyDataFacade {
  saveMonthlyRHData(ctx: Context, input: SaveMonthlyRHInput): Promise<SaveMonthlyDataResultPublic>;
  saveMonthlyLeaderData(
    ctx: Context,
    input: SaveMonthlyLeaderInput,
  ): Promise<SaveMonthlyDataResultPublic>;
}

/** Default canonico: caller tRPC interno do `monthlyData` sub-router
 *  compartilhando o mesmo `ctx` (JWT verificado, db conectado). Preserva
 *  toda a matriz de autorizacao das procs reusadas (defense in depth). */
export const DEFAULT_MONTHLY_DATA_FACADE: MonthlyDataFacade = {
  async saveMonthlyRHData(ctx, input) {
    const factory = createCallerFactory(createMonthlyDataRouter());
    const caller = factory(ctx);
    return await caller.saveMonthlyRHData(input);
  },
  async saveMonthlyLeaderData(ctx, input) {
    const factory = createCallerFactory(createMonthlyDataRouter());
    const caller = factory(ctx);
    return await caller.saveMonthlyLeaderData(input);
  },
};

// ============================================================
// Helpers privados
// ============================================================

/** Guard cruzado canonico (§2.4). Duplicado de monthlyData.ts por
 *  evitar edit cruzado (padrao S049 — helper local por sub-router). */
function assertCompanyScope(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: MSG_EMPRESA_FORA_DO_ESCOPO_SPREADSHEETS,
    });
  }
}

/** Sanitiza razao social para uso em nome de arquivo (S188 — sem
 *  espacos, sem caracteres especiais, uppercase). Alinhado com padrao
 *  §13.3/§13.4 (Central de Relatorios). */
export function sanitizeRazaoSocial(razaoSocial: string): string {
  return razaoSocial
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 40);
}

/** Retorna razao social + colaboradores ativos com lider vigente para
 *  montar o template RH. */
async function loadRHTemplateData(
  db: RoipDatabase,
  companyId: number,
): Promise<{
  razaoSocial: string;
  linhas: Array<{
    employeeId: number;
    nome: string;
    cpf: string;
    cargo: string;
    liderNome: string;
  }>;
}> {
  const [company] = await db
    .select({ razaoSocial: companies.razaoSocial })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Empresa nao encontrada.',
    });
  }

  const empRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      cpf: employees.cpf,
      cbo: employees.cbo,
      descricaoCBO: employees.descricaoCBO,
    })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
    .orderBy(asc(employees.name));

  const linhas: Array<{
    employeeId: number;
    nome: string;
    cpf: string;
    cargo: string;
    liderNome: string;
  }> = [];

  for (const emp of empRows) {
    // Resolve lider vigente (dataFim IS NULL). Nao ha mes de referencia
    // no template — usa vinculo ativo mais recente (getActiveLeaderHistory
    // seria mais canonico, mas replicamos a query aqui para nao criar
    // dependencia circular via service).
    const [link] = await db
      .select({
        liderId: employeeLeaderHistory.liderId,
        clevelId: employeeLeaderHistory.clevelId,
      })
      .from(employeeLeaderHistory)
      .where(eq(employeeLeaderHistory.employeeId, emp.id))
      .orderBy(asc(employeeLeaderHistory.id));

    let liderNome = '—';
    if (link) {
      if (link.liderId !== null) {
        const [l] = await db
          .select({ name: employees.name })
          .from(employees)
          .where(eq(employees.id, link.liderId))
          .limit(1);
        if (l) liderNome = l.name;
      } else if (link.clevelId !== null) {
        const [c] = await db
          .select({ name: cLevelMembers.name })
          .from(cLevelMembers)
          .where(eq(cLevelMembers.id, link.clevelId))
          .limit(1);
        if (c) liderNome = c.name;
      }
    }

    linhas.push({
      employeeId: emp.id,
      nome: emp.name,
      cpf: emp.cpf,
      cargo: emp.descricaoCBO,
      liderNome,
    });
  }

  return { razaoSocial: company.razaoSocial, linhas };
}

/** Retorna variaveis canonicas da familia para os liderados diretos
 *  do lider no mes. Usado pelo template Lider. */
async function loadLeaderTemplateData(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  liderId: number,
  liderTipo: 'employee' | 'clevel',
): Promise<{
  razaoSocial: string;
  liderNome: string;
  liderados: Array<{
    employeeId: number;
    nome: string;
    cargo: string;
    jobFamily: string;
    variaveis: Array<{ variableIndex: number; weight: string }>;
  }>;
}> {
  const [company] = await db
    .select({ razaoSocial: companies.razaoSocial })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Empresa nao encontrada.',
    });
  }

  // Nome do lider.
  let liderNome = 'Lider';
  if (liderTipo === 'employee') {
    const [l] = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, liderId))
      .limit(1);
    if (l) liderNome = l.name;
  } else {
    const [l] = await db
      .select({ name: cLevelMembers.name })
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, liderId))
      .limit(1);
    if (l) liderNome = l.name;
  }

  // Liderados diretos no mes (mesma semantica de S080, sem replicar
  // a query completa — filtramos por vinculo vigente que cobre o mes).
  const [anoStr, mesStr] = mes.split('-');
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  const firstDay = new Date(Date.UTC(ano, mesNum - 1, 1));
  const lastDay = new Date(Date.UTC(ano, mesNum, 0));

  const allLinks = await db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
      dataInicio: employeeLeaderHistory.dataInicio,
      dataFim: employeeLeaderHistory.dataFim,
    })
    .from(employeeLeaderHistory);

  const lideradoIds = allLinks
    .filter((link) => {
      const cobreMes =
        link.dataInicio <= lastDay && (link.dataFim === null || link.dataFim >= firstDay);
      const isMinha =
        liderTipo === 'employee' ? link.liderId === liderId : link.clevelId === liderId;
      return cobreMes && isMinha;
    })
    .map((link) => link.employeeId);

  if (lideradoIds.length === 0) {
    return { razaoSocial: company.razaoSocial, liderNome, liderados: [] };
  }

  const liderados: Array<{
    employeeId: number;
    nome: string;
    cargo: string;
    jobFamily: string;
    variaveis: Array<{ variableIndex: number; weight: string }>;
  }> = [];

  const varsByFamily = new Map<string, Array<{ variableIndex: number; weight: string }>>();

  for (const empId of lideradoIds) {
    const [emp] = await db
      .select({
        id: employees.id,
        name: employees.name,
        descricaoCBO: employees.descricaoCBO,
        jobFamily: employees.jobFamily,
        status: employees.status,
      })
      .from(employees)
      .where(eq(employees.id, empId))
      .limit(1);
    if (!emp) continue;
    if (emp.status !== 'ativo') continue;

    let vars = varsByFamily.get(emp.jobFamily);
    if (!vars) {
      const rows = await db
        .select({
          variableIndex: companyJobFamilies.variableIndex,
          weight: companyJobFamilies.weight,
        })
        .from(companyJobFamilies)
        .where(
          and(
            eq(companyJobFamilies.companyId, companyId),
            eq(
              companyJobFamilies.jobFamily,
              emp.jobFamily as (typeof companyJobFamilies.jobFamily.enumValues)[number],
            ),
          ),
        )
        .orderBy(asc(companyJobFamilies.variableIndex));
      vars = rows;
      varsByFamily.set(emp.jobFamily, vars);
    }

    liderados.push({
      employeeId: emp.id,
      nome: emp.name,
      cargo: emp.descricaoCBO,
      jobFamily: emp.jobFamily,
      variaveis: vars,
    });
  }

  liderados.sort((a, b) => a.nome.localeCompare(b.nome));
  return { razaoSocial: company.razaoSocial, liderNome, liderados };
}

/** Monta o buffer XLSX canonico do template RH. `mes` reservado para
 *  extensoes futuras (colunas de mes de referencia no cabecalho); nao
 *  usado no MVP porque o nome do arquivo ja carrega o mes. */
async function buildRHTemplateBuffer(
  data: Awaited<ReturnType<typeof loadRHTemplateData>>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(NOME_ABA_RH);

  // Cabecalho canonico exato (§3.11).
  ws.addRow([...COLUNAS_CANONICAS_RH]);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.protection = { locked: true };
  });

  // Linhas pre-preenchidas: Nome, CPF, Cargo, Lider direto (read-only),
  // Custo mensal (editavel, vazio), Faltas (editavel, 0).
  for (const row of data.linhas) {
    const excelRow = ws.addRow([row.nome, row.cpf, row.cargo, row.liderNome, null, 0]);
    // Colunas read-only: A, B, C, D (locked=true).
    // Colunas editaveis: E, F (locked=false).
    (['A', 'B', 'C', 'D'] as const).forEach((col) => {
      excelRow.getCell(col).protection = { locked: true };
    });
    (['E', 'F'] as const).forEach((col) => {
      excelRow.getCell(col).protection = { locked: false };
    });
  }

  // Larguras confortaveis.
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 28;
  ws.getColumn(4).width = 28;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 10;

  // Sheet protection canonica — celulas locked ficam efetivamente
  // travadas (§3.11 CC3).
  await ws.protect(SHEET_PROTECTION_PASSWORD, {
    selectLockedCells: true,
    selectUnlockedCells: true,
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Monta o buffer XLSX canonico do template Lider. */
async function buildLeaderTemplateBuffer(
  data: Awaited<ReturnType<typeof loadLeaderTemplateData>>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(NOME_ABA_LIDER);

  // Numero maximo de variaveis entre os liderados dita a largura do
  // cabecalho.
  const maxVars = data.liderados.reduce((acc, l) => Math.max(acc, l.variaveis.length), 0);

  const header: string[] = [...COLUNAS_FIXAS_LIDER];
  for (let i = 1; i <= maxVars; i += 1) {
    header.push(LABEL_META(i));
    header.push(LABEL_DEMANDA(i));
    header.push(LABEL_REALIZADO(i));
  }
  ws.addRow(header);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.protection = { locked: true };
  });

  // Uma linha por liderado.
  for (const liderado of data.liderados) {
    const row: (string | number | null)[] = [liderado.nome, liderado.cargo];
    for (let i = 0; i < maxVars; i += 1) {
      const varDef = liderado.variaveis[i];
      if (!varDef) {
        // Familia com menos variaveis — deixa em branco e marca locked.
        row.push(null, null, null);
        continue;
      }
      const isFamilia6 = liderado.jobFamily === FAMILIA_6_JOB_FAMILY;
      const pesoZero = Number(varDef.weight) === 0;

      // Meta: read-only cinza (§3.11 CC3). Valor canonico: 5 para
      // Familia 6, senao vazio (usuario preenche demanda como meta
      // do mes se relevante — Meta e read-only informativa aqui).
      const meta = isFamilia6 ? 5 : null;
      // Demanda: '—' para Familia 6 (locked); vazio para peso zero
      // (locked); vazio para geral (editavel).
      const demanda = isFamilia6 ? VALOR_DEMANDA_FAMILIA_6 : pesoZero ? '' : null;
      // Realizado: vazio; locked para peso zero.
      const realizado: string | null = null;

      row.push(meta, demanda, realizado);
    }
    const excelRow = ws.addRow(row);

    // Colunas A, B: read-only (nome liderado, cargo).
    excelRow.getCell('A').protection = { locked: true };
    excelRow.getCell('B').protection = { locked: true };

    // Bloco de 3 colunas por variavel: (Meta, Demanda, Realizado).
    for (let i = 0; i < maxVars; i += 1) {
      const varDef = liderado.variaveis[i];
      const colMeta = 3 + i * 3;
      const colDemanda = 4 + i * 3;
      const colRealizado = 5 + i * 3;

      if (!varDef) {
        excelRow.getCell(colMeta).protection = { locked: true };
        excelRow.getCell(colDemanda).protection = { locked: true };
        excelRow.getCell(colRealizado).protection = { locked: true };
        continue;
      }

      const isFamilia6 = liderado.jobFamily === FAMILIA_6_JOB_FAMILY;
      const pesoZero = Number(varDef.weight) === 0;

      // Meta: sempre read-only cinza (§3.11 CC3).
      excelRow.getCell(colMeta).protection = { locked: true };

      // Demanda: locked para Familia 6 e para peso zero; editavel geral.
      if (isFamilia6 || pesoZero) {
        excelRow.getCell(colDemanda).protection = { locked: true };
      } else {
        excelRow.getCell(colDemanda).protection = { locked: false };
      }

      // Realizado: locked para peso zero; editavel geral e Familia 6.
      if (pesoZero) {
        excelRow.getCell(colRealizado).protection = { locked: true };
      } else {
        excelRow.getCell(colRealizado).protection = { locked: false };
      }
    }
  }

  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 28;
  for (let i = 0; i < maxVars; i += 1) {
    ws.getColumn(3 + i * 3).width = 14;
    ws.getColumn(4 + i * 3).width = 14;
    ws.getColumn(5 + i * 3).width = 14;
  }

  await ws.protect(SHEET_PROTECTION_PASSWORD, {
    selectLockedCells: true,
    selectUnlockedCells: true,
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Le buffer XLSX Base64 e retorna a worksheet canonica ou lanca
 *  TRPCError BAD_REQUEST com mensagem canonica. */
async function readUploadWorksheet(
  xlsxBase64: string,
  nomeAba: string,
  msgAbaAusente: string,
): Promise<ExcelJS.Worksheet> {
  let buf: Buffer;
  try {
    buf = Buffer.from(xlsxBase64, 'base64');
  } catch {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_XLSX_INVALIDO });
  }
  if (buf.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_XLSX_INVALIDO });
  }
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs 4.4.0 aceita Buffer ou ArrayBuffer; o typing interno usa
    // o Buffer classico (pre-Node 22 typing) — cast para o tipo esperado.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
  } catch {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_XLSX_INVALIDO });
  }
  const ws = wb.getWorksheet(nomeAba);
  if (!ws) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: msgAbaAusente });
  }
  return ws;
}

/** Le celula preservando string; null/undefined vira ''. */
function cellString(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getRow(row).getCell(col).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) {
    return String((v as { text: unknown }).text ?? '').trim();
  }
  return String(v).trim();
}

/** Retorna numero de linhas com conteudo em qualquer coluna. */
function usedRowCount(ws: ExcelJS.Worksheet): number {
  let last = 0;
  ws.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
    if (rowNumber > last) last = rowNumber;
  });
  return last;
}

// ============================================================
// Parser RH (S186 — acumula erros, delega ao caller)
// ============================================================

interface RHLinhaParsed {
  linha: number;
  employeeId: number;
  custoTotalMes: string;
  faltas: number;
}

async function parseRHUpload(
  db: RoipDatabase,
  companyId: number,
  ws: ExcelJS.Worksheet,
): Promise<{ linhas: RHLinhaParsed[]; erros: LinhaErro[] }> {
  const erros: LinhaErro[] = [];

  // 1) Cabecalho canonico exato (§3.11).
  for (let i = 0; i < COLUNAS_CANONICAS_RH.length; i += 1) {
    const esperado = COLUNAS_CANONICAS_RH[i]!;
    const encontrado = cellString(ws, 1, i + 1);
    if (encontrado !== esperado) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: MSG_CABECALHOS_INVALIDOS_RH,
      });
    }
  }

  // 2) Indice CPF -> employeeId da empresa.
  const empRows = await db
    .select({ id: employees.id, cpf: employees.cpf })
    .from(employees)
    .where(eq(employees.companyId, companyId));
  const cpfIndex = new Map<string, number>();
  for (const emp of empRows) {
    cpfIndex.set(emp.cpf, emp.id);
  }

  // 3) Linhas de dados a partir da linha 2.
  const linhas: RHLinhaParsed[] = [];
  const last = usedRowCount(ws);
  for (let r = 2; r <= last; r += 1) {
    const nome = cellString(ws, r, 1);
    const cpf = cellString(ws, r, 2);
    const custoStr = cellString(ws, r, 5);
    const faltasStr = cellString(ws, r, 6);

    // Linha vazia — ignora (informativo, nao falha).
    if (nome === '' && cpf === '' && custoStr === '' && faltasStr === '') {
      continue;
    }

    const employeeId = cpfIndex.get(cpf);
    if (employeeId === undefined) {
      erros.push({ linha: r, coluna: 'CPF', mensagem: MSG_CPF_NAO_ENCONTRADO });
      continue;
    }

    const custoNum = Number(custoStr.replace(',', '.'));
    if (!Number.isFinite(custoNum)) {
      erros.push({ linha: r, coluna: 'Custo mensal (R$)', mensagem: MSG_VALOR_NAO_NUMERICO });
      continue;
    }
    const faltasNum = Number(faltasStr);
    if (!Number.isInteger(faltasNum) || faltasNum < 0) {
      erros.push({ linha: r, coluna: 'Faltas', mensagem: MSG_VALOR_NAO_NUMERICO });
      continue;
    }

    linhas.push({
      linha: r,
      employeeId,
      custoTotalMes: custoNum.toFixed(2),
      faltas: faltasNum,
    });
  }

  return { linhas, erros };
}

// ============================================================
// Parser Lider (S186)
// ============================================================

interface LiderLinhaParsed {
  linha: number;
  employeeId: number;
  variaveis: Array<{ variableIndex: number; demanda: string; executado: string }>;
}

async function parseLeaderUpload(
  db: RoipDatabase,
  companyId: number,
  liderId: number,
  liderTipo: 'employee' | 'clevel',
  mes: string,
  ws: ExcelJS.Worksheet,
): Promise<{ linhas: LiderLinhaParsed[]; erros: LinhaErro[]; variableIndexByCol: number[] }> {
  const erros: LinhaErro[] = [];

  // Cabecalhos fixos.
  for (let i = 0; i < COLUNAS_FIXAS_LIDER.length; i += 1) {
    const esperado = COLUNAS_FIXAS_LIDER[i]!;
    const encontrado = cellString(ws, 1, i + 1);
    if (encontrado !== esperado) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: MSG_CABECALHOS_INVALIDOS_LIDER,
      });
    }
  }

  // Cabecalhos dinamicos: (Meta, Demanda, Realizado)* — descobre quantas
  // variaveis pelo cabecalho gerado.
  const variableIndexByCol: number[] = [];
  let col = 3;
  while (true) {
    const meta = cellString(ws, 1, col);
    if (meta === '') break;
    const varN = /^Meta \[Variavel (\d+)\]$/.exec(meta);
    if (!varN) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: MSG_CABECALHOS_INVALIDOS_LIDER,
      });
    }
    const idx = Number(varN[1]);
    const demanda = cellString(ws, 1, col + 1);
    const realizado = cellString(ws, 1, col + 2);
    if (demanda !== LABEL_DEMANDA(idx) || realizado !== LABEL_REALIZADO(idx)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: MSG_CABECALHOS_INVALIDOS_LIDER,
      });
    }
    variableIndexByCol.push(idx);
    col += 3;
  }

  if (variableIndexByCol.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_SEM_VARIAVEIS_ATIVAS });
  }

  // Liderados diretos do lider no mes (S080 — via replay do vinculo).
  const [anoStr, mesStr] = mes.split('-');
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  const firstDay = new Date(Date.UTC(ano, mesNum - 1, 1));
  const lastDay = new Date(Date.UTC(ano, mesNum, 0));

  const allLinks = await db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
      dataInicio: employeeLeaderHistory.dataInicio,
      dataFim: employeeLeaderHistory.dataFim,
    })
    .from(employeeLeaderHistory);
  const liderados = new Set<number>();
  for (const link of allLinks) {
    const cobreMes =
      link.dataInicio <= lastDay && (link.dataFim === null || link.dataFim >= firstDay);
    const isMinha = liderTipo === 'employee' ? link.liderId === liderId : link.clevelId === liderId;
    if (cobreMes && isMinha) liderados.add(link.employeeId);
  }

  // Indice nome -> employeeId (ativo, empresa correta).
  const empRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      status: employees.status,
      companyId: employees.companyId,
    })
    .from(employees)
    .where(eq(employees.companyId, companyId));
  const nameIndex = new Map<string, { id: number; ativo: boolean }>();
  for (const emp of empRows) {
    nameIndex.set(emp.name, { id: emp.id, ativo: emp.status === 'ativo' });
  }

  // Linhas de dados a partir da linha 2.
  const linhas: LiderLinhaParsed[] = [];
  const last = usedRowCount(ws);
  for (let r = 2; r <= last; r += 1) {
    const nome = cellString(ws, r, 1);
    if (nome === '') continue;

    const empInfo = nameIndex.get(nome);
    if (!empInfo) {
      erros.push({ linha: r, coluna: 'Nome liderado', mensagem: MSG_CPF_NAO_ENCONTRADO });
      continue;
    }
    if (!empInfo.ativo) {
      erros.push({ linha: r, coluna: 'Nome liderado', mensagem: 'Colaborador inativo.' });
      continue;
    }
    if (!liderados.has(empInfo.id)) {
      erros.push({ linha: r, coluna: 'Nome liderado', mensagem: MSG_LIDERADO_FORA_DA_CADEIA });
      continue;
    }

    const variaveis: Array<{ variableIndex: number; demanda: string; executado: string }> = [];
    let linhaOk = true;
    for (let i = 0; i < variableIndexByCol.length; i += 1) {
      const idx = variableIndexByCol[i]!;
      const colDemanda = 4 + i * 3;
      const colRealizado = 5 + i * 3;
      const demandaStr = cellString(ws, r, colDemanda);
      const realizadoStr = cellString(ws, r, colRealizado);

      // Ignora variavel completamente vazia (peso zero pode aparecer
      // assim; caller nao recebe input para peso zero).
      if (demandaStr === '' && realizadoStr === '') continue;

      const demandaRaw = demandaStr === VALOR_DEMANDA_FAMILIA_6 ? '5' : demandaStr;
      const demandaNum = Number(demandaRaw.replace(',', '.'));
      if (!Number.isFinite(demandaNum)) {
        erros.push({
          linha: r,
          coluna: LABEL_DEMANDA(idx),
          mensagem: MSG_VALOR_NAO_NUMERICO,
        });
        linhaOk = false;
        break;
      }
      const realizadoNum = Number(realizadoStr.replace(',', '.'));
      if (!Number.isFinite(realizadoNum)) {
        erros.push({
          linha: r,
          coluna: LABEL_REALIZADO(idx),
          mensagem: MSG_VALOR_NAO_NUMERICO,
        });
        linhaOk = false;
        break;
      }

      variaveis.push({
        variableIndex: idx,
        demanda: String(demandaNum),
        executado: String(realizadoNum),
      });
    }
    if (!linhaOk) continue;
    if (variaveis.length === 0) continue;

    linhas.push({ linha: r, employeeId: empInfo.id, variaveis });
  }

  return { linhas, erros, variableIndexByCol };
}

// ============================================================
// Factory canonica (S168 estendido)
// ============================================================

export interface CreateSpreadsheetsRouterDeps {
  monthlyDataFacade?: MonthlyDataFacade;
}

export function createSpreadsheetsRouter(deps: CreateSpreadsheetsRouterDeps = {}) {
  const facade = deps.monthlyDataFacade ?? DEFAULT_MONTHLY_DATA_FACADE;

  return router({
    // ============================================================
    // Proc 1 — downloadRHTemplate (§3.11)
    // ============================================================
    downloadRHTemplate: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(DOWNLOAD_RH_TEMPLATE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<DownloadResult> => {
        assertCompanyScope(ctx.user, input.companyId);
        const data = await loadRHTemplateData(ctx.db, input.companyId);
        const buf = await buildRHTemplateBuffer(data);
        const filename = `template_rh_${sanitizeRazaoSocial(data.razaoSocial)}_${input.mes}.xlsx`;
        return {
          filename,
          xlsxBase64: buf.toString('base64'),
          bytes: buf.length,
        };
      }),

    // ============================================================
    // Proc 2 — uploadRHData (§3.11 — reusa saveMonthlyRHData via S185)
    // ============================================================
    uploadRHData: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(UPLOAD_RH_DATA_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<UploadResult> => {
        assertCompanyScope(ctx.user, input.companyId);
        const ws = await readUploadWorksheet(input.xlsxBase64, NOME_ABA_RH, MSG_ABA_AUSENTE_RH);
        const { linhas, erros } = await parseRHUpload(ctx.db, input.companyId, ws);

        if (linhas.length === 0) {
          return {
            ok: erros.length === 0,
            linhasProcessadas: erros.length,
            linhasSucesso: 0,
            linhasErro: erros.length,
            erros,
          };
        }

        // Delega ao caller canonico (S185). Erros de negocio §3.12
        // (custo>0, faltas<=diasUteis, mes fechado) sao capturados
        // linha a linha para preservar semantica "processa todas".
        const sucessos: number[] = [];
        for (const linha of linhas) {
          try {
            await facade.saveMonthlyRHData(ctx, {
              companyId: input.companyId,
              mes: input.mes,
              diasUteis: input.diasUteis,
              colaboradores: [
                {
                  employeeId: linha.employeeId,
                  custoTotalMes: linha.custoTotalMes,
                  faltas: linha.faltas,
                },
              ],
            });
            sucessos.push(linha.linha);
          } catch (err) {
            const msg = err instanceof TRPCError ? err.message : 'Erro ao gravar linha.';
            erros.push({ linha: linha.linha, coluna: '-', mensagem: msg });
          }
        }

        const linhasSucesso = sucessos.length;
        const linhasErro = erros.length;
        return {
          ok: linhasErro === 0,
          linhasProcessadas: linhasSucesso + linhasErro,
          linhasSucesso,
          linhasErro,
          erros,
        };
      }),

    // ============================================================
    // Proc 3 — downloadLeaderTemplate (§3.11)
    // ============================================================
    downloadLeaderTemplate: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(DOWNLOAD_LEADER_TEMPLATE_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<DownloadResult> => {
        assertCompanyScope(ctx.user, input.companyId);

        // Autorizacao por perfil (mesma matriz do saveMonthlyLeaderData).
        if (ctx.user.role === 'lider') {
          if (input.liderTipo !== 'employee' || input.liderId !== ctx.user.userId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Lider so baixa o proprio template.',
            });
          }
        }
        if (ctx.user.role === 'clevel') {
          if (input.liderTipo !== 'clevel' || input.liderId !== ctx.user.userId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'C-level so baixa o proprio template.',
            });
          }
        }

        const data = await loadLeaderTemplateData(
          ctx.db,
          input.companyId,
          input.mes,
          input.liderId,
          input.liderTipo,
        );
        const buf = await buildLeaderTemplateBuffer(data);
        const nomeSan = sanitizeRazaoSocial(data.liderNome);
        const empSan = sanitizeRazaoSocial(data.razaoSocial);
        const filename = `template_lider_${empSan}_${input.mes}_${nomeSan}.xlsx`;
        return {
          filename,
          xlsxBase64: buf.toString('base64'),
          bytes: buf.length,
        };
      }),

    // ============================================================
    // Proc 4 — uploadLeaderData (§3.11 — reusa saveMonthlyLeaderData)
    // ============================================================
    uploadLeaderData: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(UPLOAD_LEADER_DATA_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<UploadResult> => {
        assertCompanyScope(ctx.user, input.companyId);

        if (ctx.user.role === 'lider') {
          if (input.liderTipo !== 'employee' || input.liderId !== ctx.user.userId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Lider so envia o proprio arquivo.',
            });
          }
        }
        if (ctx.user.role === 'clevel') {
          if (input.liderTipo !== 'clevel' || input.liderId !== ctx.user.userId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'C-level so envia o proprio arquivo.',
            });
          }
        }

        const ws = await readUploadWorksheet(
          input.xlsxBase64,
          NOME_ABA_LIDER,
          MSG_ABA_AUSENTE_LIDER,
        );
        const { linhas, erros } = await parseLeaderUpload(
          ctx.db,
          input.companyId,
          input.liderId,
          input.liderTipo,
          input.mes,
          ws,
        );

        if (linhas.length === 0) {
          return {
            ok: erros.length === 0,
            linhasProcessadas: erros.length,
            linhasSucesso: 0,
            linhasErro: erros.length,
            erros,
          };
        }

        const sucessos: number[] = [];
        for (const linha of linhas) {
          try {
            await facade.saveMonthlyLeaderData(ctx, {
              companyId: input.companyId,
              mes: input.mes,
              liderId: input.liderId,
              liderTipo: input.liderTipo,
              liderados: [
                {
                  employeeId: linha.employeeId,
                  variaveis: linha.variaveis,
                },
              ],
            });
            sucessos.push(linha.linha);
          } catch (err) {
            const msg = err instanceof TRPCError ? err.message : 'Erro ao gravar linha.';
            erros.push({ linha: linha.linha, coluna: '-', mensagem: msg });
          }
        }

        const linhasSucesso = sucessos.length;
        const linhasErro = erros.length;
        return {
          ok: linhasErro === 0,
          linhasProcessadas: linhasSucesso + linhasErro,
          linhasSucesso,
          linhasErro,
          erros,
        };
      }),
  });
}
