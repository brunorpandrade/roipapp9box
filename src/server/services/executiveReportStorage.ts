// ROIP APP 9BOX — storage canonico do PDF do Relatorio executivo
// trimestral (ME-053, S276).
//
// Escreve/le o binario PDF no filesystem local seguindo caminho
// canonico (§7.8 DOC 04 — "padrao a decidir em DOC 06"; S276 canoniza
// path local para o MVP). Storage remoto (S3/GCS) e decisao pos-MVP em
// DOC 06.
//
// Racional canonico (S276, aprovado por Bruno na sessao N7/S226 da
// ME-053):
//   - Filesystem local e a escolha canonica-compativel minima para
//     MVP. O binario existe em disco, `executiveReportCache.conteudoPdfUrl`
//     armazena o caminho absoluto.
//   - Reversibilidade: quando storage remoto entrar (DOC 06), este
//     modulo e substituido; `conteudoPdfUrl` pode passar a apontar URL
//     absoluta em vez de path — o Route Handler de download consome
//     ambos os regimes atraves da mesma abstracao.
//   - Facade DI (S258): permite substituir por stub em teste
//     deterministico que grava em Map em memoria.
//
// Path canonico:
//   `${EXECUTIVE_REPORT_STORAGE_DIR}/${companyId}/${escopoTipo}/`
//   `${referenciaOrRoot}/${trimestre}.pdf`
//
// - `EXECUTIVE_REPORT_STORAGE_DIR` — env-var, default
//   `/var/lib/roip/executive-reports` em producao. Testes injetam via
//   `EXECUTIVE_REPORT_STORAGE_DIR=/tmp/roip-test-...`.
// - `referenciaOrRoot` — string 'root' quando escopo=empresa (nao ha
//   referencia canonica); caso contrario, `referencia` sanitizada.
// - Trimestre no formato canonico `YYYY-QN`.
//
// Determinismo canonico: mesmos (companyId, escopoTipo, referencia,
// trimestre) resolvem para o mesmo path — a UPSERT do
// `executiveReportCache` sobrescreve o mesmo binario.

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Diretorio raiz canonico do storage (env-var, com fallback canonico
 * para producao Manus).
 */
function resolveExecutiveReportStorageDir(): string {
  const dir = process.env.EXECUTIVE_REPORT_STORAGE_DIR;
  if (dir && dir.length > 0) return dir;
  return '/var/lib/roip/executive-reports';
}

/**
 * Sanitiza um segmento de caminho (referencia de escopo). Evita
 * `path traversal` removendo `..`, `/` e `\`. Substitui espacos por
 * `_` e mantem acentos removidos.
 */
function sanitizePathSegment(raw: string | null): string {
  if (raw === null || raw.length === 0) return 'root';
  const semAcento = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const semSep = semAcento.replace(/[/\\.]/g, '_');
  const semEspaco = semSep.replace(/\s+/g, '_');
  const trimmed = semEspaco.trim().slice(0, 100);
  return trimmed.length > 0 ? trimmed : 'root';
}

/**
 * Compoe o path canonico do PDF para uma entrada de cache.
 */
function composeExecutiveReportPdfPath(args: {
  companyId: number;
  escopoTipo: 'empresa' | 'departamento' | 'equipe';
  escopoReferencia: string | null;
  trimestre: string;
  baseDir?: string;
}): string {
  const base = args.baseDir ?? resolveExecutiveReportStorageDir();
  const ref = sanitizePathSegment(args.escopoReferencia);
  return path.join(base, String(args.companyId), args.escopoTipo, ref, `${args.trimestre}.pdf`);
}

/**
 * Facade canonica do storage — substituivel em teste (S258).
 */
export interface ExecutiveReportStorageFacade {
  /**
   * Escreve o binario no path canonico e devolve o caminho gravado.
   * Cria diretorios intermediarios idempotentemente.
   */
  writePdf: (args: {
    companyId: number;
    escopoTipo: 'empresa' | 'departamento' | 'equipe';
    escopoReferencia: string | null;
    trimestre: string;
    bytes: Uint8Array;
  }) => Promise<string>;
  /**
   * Le o binario PDF de um path canonico ja gravado. Retorna `null`
   * quando o arquivo nao existe (nao lanca; permite o Route Handler
   * responder 404).
   */
  readPdfFromPath: (pdfPath: string) => Promise<Uint8Array | null>;
}

/** Facade default — filesystem real (padrao producao Manus). */
export const DEFAULT_EXECUTIVE_REPORT_STORAGE: ExecutiveReportStorageFacade = {
  writePdf: async (args): Promise<string> => {
    const target = composeExecutiveReportPdfPath({
      companyId: args.companyId,
      escopoTipo: args.escopoTipo,
      escopoReferencia: args.escopoReferencia,
      trimestre: args.trimestre,
    });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, args.bytes);
    return target;
  },
  readPdfFromPath: async (pdfPath: string): Promise<Uint8Array | null> => {
    try {
      const buf = await fs.readFile(pdfPath);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'ENOENT') return null;
      throw err;
    }
  },
};
