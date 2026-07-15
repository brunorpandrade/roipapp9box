// ROIP APP 9BOX — modulo de hash de senha (ME-020).
//
// Wrapper tipado sobre `bcryptjs`. O algoritmo bcrypt e canonico: o DOC 02
// cita `bcrypt.compare` e `bcrypt.hash` literalmente em todos os fluxos de
// credencial (§4.1 passo f, §4.5 passo 10c, §4.7, §4.8). A biblioteca
// `bcryptjs` (JS puro, sem binding nativo) elimina risco de build no
// sandbox de integracao.
//
// Custo canonico: 12 (S010 — o DOC 02 nao fixa custo; decisao de autor
// registrada). O parametro `cost` existe exclusivamente para os testes
// reduzirem o tempo de execucao; nenhum fluxo de producao deve passa-lo.
//
// Consumidores canonicos: procedures `auth.loginPlatform`,
// `auth.loginSuperAdmin`, `auth.changePassword`, `auth.resetPassword`,
// `auth.firstAccess` (ME-022, DOC 02 §4). Ate la, o chamador e o teste
// unitario da propria ME-020 (precedente do Bloco B1 — teste conta como
// chamador; regua RV-13 estendida a `src/server/auth/` nesta ME).

import bcrypt from 'bcryptjs';

/** Custo canonico do bcrypt em producao (S010). */
export const BCRYPT_COST = 12;

/**
 * Gera o hash bcrypt de uma senha em texto plano. O salt e gerado
 * internamente pelo bcrypt e embutido no proprio hash (formato `$2b$`).
 * `cost` so deve ser sobrescrito em teste.
 */
export async function hashPassword(plain: string, cost: number = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(plain, cost);
}

/**
 * Compara uma senha em texto plano com um hash bcrypt armazenado.
 * Hash malformado (string vazia, formato invalido, truncado) resolve
 * `false` — nunca lanca. Isso preserva a semantica anti-enumeracao do
 * DOC 02 §13.1: falha de verificacao e indistinguivel de senha errada.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
