// ROIP APP 9BOX — sub-router `auth` (ME-022a + ME-022b).
//
// Sub-router de autenticacao do DOC 02 §4, expandido em duas MEs:
//   - ME-022a: `loginPlatform` (§4.1), `loginSuperAdmin` (§4.2).
//   - ME-022b: `forgotPassword` (§4.4), `validateToken` (§4.5),
//     `resetPassword` (§4.5), `firstAccess` (§4.5). Ciclo completo de
//     token de credencial. Ambos sao `publicProcedure` porque a sessao
//     ainda nao existe / nao e requisito no consumo do link.
//
// Regras invioluveis herdadas do canonico:
//   - Ordem canonica de avaliacao a-i em §4.1, a-e em §4.2, a-d em §4.4,
//     passos 1-8 em §4.5 (comentadas linha a linha nos handlers). Erro de
//     ordem aqui vira vulnerabilidade, nao bug — cf. anti-enumeracao.
//   - Mensagens literais do §13 — nunca reescrever palavra, pontuacao ou
//     acento. As constantes MSG_* concentram a fonte para prevenir drift.
//   - Rate limit canonico do §5.8 via `RATE_LIMITS.*` (ME-020). Em
//     `forgotPassword`, chave difere por origem: `forgot-password:{cpf}`
//     em `/`; `forgot-password-super-admin:{email}` em `/login-super-admin`.
//   - Emissao de token de sessao via `signPlatformToken` /
//     `signSuperAdminToken` (ME-020). Emissao de token de link via
//     `signCredentialToken` (ME-022b, S023).
//   - Invalidacao de sessao pos-reset (§5.7): mecanica S011 — troca de
//     `passwordHash` muda o `pwv` derivado; todos os JWTs em circulacao
//     caem no middleware `authed`. Sem codigo adicional em resetPassword.
//   - Concorrencia de token (§5.4): antes de gerar novo token do mesmo
//     `type` para o mesmo usuario, invalidar os ativos anteriores. Feito
//     em `forgotPassword`, nao no consumo.
//
// Decisoes de autor registradas ate esta ME:
//   - S018 — fatiamento ME-022 em 022a/b/c.
//   - S019 — CPF administrativo ambiguo trata-se como "nao encontrado"
//     em `loginPlatform` e `forgotPassword` branch CPF. Divida D004.
//   - S020 — codigos tRPC canonicos: UNAUTHORIZED (credenciais/token),
//     FORBIDDEN (colaborador puro, empresa inativa, usuario inativo em
//     consumo de token), BAD_REQUEST (token expirado/invalido/usado,
//     politica de senha), TOO_MANY_REQUESTS (rate limit). `cause` carrega
//     extras tipados.
//   - S021 — contratos de resposta canonicos dos logins (ME-022a). Para
//     `forgotPassword`, `resetPassword`, `firstAccess`: `{ msg, enviado? }`.
//     Para `validateToken`: `{ userName, tipo }`.
//   - S022 — sentinel `RATE_LIMIT_IP_UNKNOWN` para `ctx.ip === null`.
//   - S023 (ME-022b) — modulo separado `credentialToken.ts` para JWT de
//     link, sem `exp` (autoridade de validade em `accessTokens.expiresAt`).
//   - S024 (ME-022b) — sem rate limit em `validateToken`, `resetPassword`
//     e `firstAccess`. §5.8 lista apenas pontos de emissao; consumo do
//     link e protegido pela nao-adivinhabilidade do JWT.
//   - S025 (ME-022b) — em `forgotPassword`, incremento de rate limit a
//     cada tentativa (independente de encontrado ou nao). §4.4 e silente
//     sobre incremento; a leitura canonica de "3 tentativas / 15 min"
//     supoe contagem por tentativa efetiva. Anti-enumeracao preservada
//     porque a resposta e SEMPRE identica.
//   - S026 (ME-022b) — em `firstAccess`, `userType='super_admin'` retorna
//     erro canonico. Bruno nasce com senha semeada (§18.1 DOC 01, §5.4
//     lista apenas password_reset para superAdmins); rejeicao defensiva.
//
// RV-13: chamador exclusivo `appRouter` (acoplado em `routers/index.ts`).
// Testes de integracao em `tests/integration/auth-*.test.ts`.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  signCredentialToken,
  verifyCredentialToken,
  type CredentialTokenTipo,
  type CredentialUserType,
} from '../auth/credentialToken';
import { deriveCredentialVersion, signPlatformToken, signSuperAdminToken } from '../auth/jwt';
import type { PlatformRole } from '../auth/jwt';
import { hashPassword, verifyPassword } from '../auth/password';
import { buildRateLimitKey, RATE_LIMITS } from '../auth/rateLimit';
import {
  createAccessToken,
  getAccessTokenByToken,
  invalidateActiveTokensByUserAndType,
  listActiveTokensByUser,
  markTokenAsUsed,
} from '../services/accessTokens';
import { findPlatformUserByCpf, type PlatformUserCandidate } from '../services/authLookup';
import { getCLevelMemberById, updateCLevelMemberCredential } from '../services/cLevelMembers';
import { getCompanyById } from '../services/companies';
import { getEmployeeById, updateEmployeeCredential } from '../services/employees';
import {
  getSuperAdminByEmail,
  getSuperAdminById,
  updateSuperAdminEmail,
  updateSuperAdminPassword,
} from '../services/superAdmins';
import { protectedProcedure, publicProcedure, roleProcedure, router } from '../trpc';

// ---- Constantes canonicas do §13 ---------------------------------------

/** Mensagem canonica exata do login unificado (§13.1). */
export const MSG_LOGIN_INVALID = 'CPF ou senha incorretos.';

/** Mensagem canonica exata do login super admin (§13.1). */
export const MSG_LOGIN_SUPER_ADMIN_INVALID = 'E-mail ou senha incorretos.';

/** Mensagem canonica exata de colaborador puro em `/` (§13.1). */
export const MSG_COLLABORATOR_ONLY =
  'Este CPF não tem acesso à plataforma. Para responder instrumentos, acesse /colaborador.';

/** Mensagem canonica exata de empresa inativa (§13.1, §5.6). */
export const MSG_COMPANY_INACTIVE = 'Empresa inativa no sistema. Entre em contato com o suporte.';

/** Mensagem canonica exata de rate limit (§13.1 e §5.8). "X" literal — a UI substitui. */
export const MSG_RATE_LIMIT = 'Muitas tentativas. Tente novamente em X minutos.';

/**
 * Mensagem canonica exata do modal `[Esqueci minha senha]` (§4.4 c e §13.2).
 * Retornada em 200 SEMPRE (encontrado ou nao — anti-enumeracao).
 */
export const MSG_FORGOT_PASSWORD_SENT =
  'Enviamos um link para alteracao de senha no e-mail cadastrado.';

/**
 * Mensagem canonica exata de token invalido/expirado/usado/type incompativel/
 * usuario inativo (§13.2). Fluxos `validateToken`, `resetPassword`,
 * `firstAccess` — todos retornam ESTA mensagem, com codigo tRPC variando
 * (BAD_REQUEST para token; FORBIDDEN para usuario inativo — §4.5 4c).
 */
export const MSG_TOKEN_EXPIRED = 'Este link expirou. Solicite um novo.';

/**
 * Mensagem canonica exata de politica de senha violada (§4.5, §13.3).
 * Retornada em BAD_REQUEST com `cause: { field: 'novaSenha' }`.
 */
export const MSG_PASSWORD_POLICY =
  'A senha deve ter no minimo 8 caracteres, pelo menos 1 letra e pelo menos 1 numero.';

/**
 * Mensagem canonica exata de sucesso de reset/first-access (§4.5 10f, §13.3).
 * Retornada em 200 apos gravacao bem-sucedida do novo `passwordHash`.
 */
export const MSG_PASSWORD_CHANGED_SUCCESS =
  'Senha alterada com sucesso. Faca login com a nova senha.';

/**
 * Mensagem canonica exata de senha atual incorreta (§13.3, primeira linha).
 * Usada por `changePassword` e por `requestEmailChange` — ambos exigem
 * `bcrypt.compare(senhaAtual)` como passo canonico e devolvem esta msg com
 * `field: 'senhaAtual'` em 401.
 */
export const MSG_PASSWORD_ACTUAL_INCORRECT = 'Senha atual incorreta.';

/**
 * Mensagem canonica exata de nova senha identica a atual (§13.3, 3a linha).
 * Distincao canonica em relacao ao `/reset-password` (§4.5): reset PERMITE
 * senha identica (backend nao conhece plaintext); `/alterar-senha` (§4.7)
 * PROIBE via `bcrypt.compare(novaSenha, passwordHash)` no passo canonico
 * §4.7 3f.
 */
export const MSG_NEW_PASSWORD_MUST_DIFFER = 'A nova senha deve ser diferente da atual.';

/**
 * Mensagem canonica exata de sucesso de alteracao de senha via
 * `/alterar-senha` (§4.7 3i, §13.3 5a linha). DIFERENTE de
 * `MSG_PASSWORD_CHANGED_SUCCESS` — o reset devolve "... Faca login com a
 * nova senha." (redirect ao login), o /alterar-senha nao redireciona ao
 * login (sessao atual preservada §5.7). Constantes separadas para preservar
 * o literal canonico.
 */
export const MSG_PASSWORD_CHANGE_SUCCESS = 'Senha alterada com sucesso.';

/**
 * Mensagem canonica exata de solicitacao pendente de alteracao de e-mail
 * (§4.8 fluxo passo 5c). Retornada em 409 quando o Super Admin ja tem uma
 * solicitacao `tipo=email_change` ativa (usedAt IS NULL AND expiresAt >
 * NOW()) e tenta iniciar outra. O front renderiza Bloco B canonico.
 */
export const MSG_EMAIL_CHANGE_PENDING =
  'Existe uma solicitacao pendente. Cancele-a antes de iniciar uma nova.';

/**
 * Mensagem canonica exata de novo e-mail identico ao atual (§4.8 fluxo
 * passo 5f). Retornada em 400 com `field: 'novoEmail'`.
 */
export const MSG_NEW_EMAIL_MUST_DIFFER = 'O novo e-mail deve ser diferente do atual.';

/**
 * Mensagem canonica exata do titulo da tela de confirmacao de e-mail
 * (§13.2 2a linha) para status `expirado` ou `invalido`. O front renderiza
 * como titulo; corpo canonico "Solicite uma nova alteracao de e-mail."
 * fica no front (§13.2). O backend so devolve o `status` no `cause`; a
 * `message` do TRPCError usa este literal para preservar a fonte canonica
 * unica em um so lugar.
 */
export const MSG_EMAIL_CHANGE_LINK_INVALID = 'Este link expirou.';

/** Sentinel canonico para `ctx.ip === null` (S022). */
const RATE_LIMIT_IP_UNKNOWN = 'unknown';

/**
 * TTL canonico do token de alteracao de e-mail (DOC 02 §5.4 tabela linha
 * "password_reset para superAdmins com metadado tipo: 'email_change'"):
 * `createdAt + INTERVAL 24 HOUR`. UNICO caso canonico com TTL de 24h —
 * todos os demais password_reset e first_access usam 7 dias.
 */
const EMAIL_CHANGE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * TTL canonico do token de credencial em `accessTokens.expiresAt`
 * (DOC 02 §5.4): `createdAt + INTERVAL 7 DAY` para todos os fluxos cobertos
 * pela ME-022b. O comentario canonico do §4.4 d diz "INTERVAL 7 DAY" para
 * password_reset; §5.4 tabela confirma para todos os tipos exceto o
 * `password_reset` de super_admin com metadado `email_change` (24 h, fluxo
 * H3, fora do escopo desta ME).
 */
const CREDENTIAL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---- Zod schemas de entrada --------------------------------------------

/**
 * CPF apos remocao de mascara: 11 digitos numericos (§4.1 passo 3
 * client-side, redundante no backend). O frontend limpa a mascara antes de
 * enviar; o backend rejeita qualquer outro formato com BAD_REQUEST — o zod
 * cuida disso automaticamente antes do handler.
 */
const cpfSchema = z.string().regex(/^\d{11}$/);

const loginPlatformInput = z.object({
  cpf: cpfSchema,
  senha: z.string().min(1),
});

const loginSuperAdminInput = z.object({
  email: z.string().email().max(255),
  senha: z.string().min(1),
});

/**
 * Input canonico de `auth.forgotPassword` (§4.4). Uniao XOR entre CPF (`/`) e
 * email (`/login-super-admin`), imposta pelo `.refine`. Aceitar ambos ou
 * nenhum e BAD_REQUEST canonico (zod). O discriminador NAO tem campo
 * `origem`/`kind` porque o proprio canonico usa a presenca do campo como
 * discriminador implicito.
 */
const forgotPasswordInput = z
  .object({
    cpf: cpfSchema.optional(),
    email: z.string().email().max(255).optional(),
  })
  .refine((v) => (v.cpf !== undefined) !== (v.email !== undefined), {
    message: 'informe apenas cpf OU email',
  });

/**
 * Input canonico de `auth.validateToken` (§4.5 passo 3). O `tipo` acompanha
 * a rota do frontend (`/reset-password` → 'reset'; `/first-access` →
 * 'first_access'). O handler cruza este `tipo` com o `type` do registro em
 * `accessTokens` — divergencia dispara mensagem canonica anti-enumeracao.
 */
const validateTokenInput = z.object({
  token: z.string().min(1).max(1024),
  tipo: z.enum(['reset', 'first_access']),
});

/**
 * Input canonico de `auth.resetPassword` (§4.5 passo 9, `type=password_reset`).
 * A validacao completa da politica canonica (min 8, >=1 letra, >=1 numero)
 * ocorre server-side dentro do handler para preservar mensagem canonica
 * `MSG_PASSWORD_POLICY` — o zod aqui garante apenas presenca minima.
 */
const resetPasswordInput = z.object({
  token: z.string().min(1).max(1024),
  novaSenha: z.string().min(1).max(255),
});

/** Input canonico de `auth.firstAccess` (§4.5 passo 9, `type=first_access`). */
const firstAccessInput = z.object({
  token: z.string().min(1).max(1024),
  novaSenha: z.string().min(1).max(255),
});

/**
 * Input canonico de `auth.changePassword` (§4.7 passo 2). O canonico envia
 * apenas `{ senhaAtual, novaSenha }` — o campo `confirmarNovaSenha` do form
 * H2 (§4.7 campo 3) e validado exclusivamente client-side (§4.7 passo 1
 * "Frontend valida em tempo real"). O max de 255 acomoda qualquer senha
 * plausivel dentro do custo bcrypt canonico S010.
 */
const changePasswordInput = z.object({
  senhaAtual: z.string().min(1).max(255),
  novaSenha: z.string().min(1).max(255),
});

/**
 * Input canonico de `auth.requestEmailChange` (§4.8 Bloco A passo 4). O
 * canonico envia `{ senhaAtual, novoEmail, confirmarEmail }`. O
 * `confirmarEmail` e validado server-side no `.refine`; a mensagem canonica
 * de divergencia (§4.8 nao especifica literal — validacao pertence ao
 * client-side por padrao) sobe como BAD_REQUEST generico do zod.
 */
const requestEmailChangeInput = z
  .object({
    senhaAtual: z.string().min(1).max(255),
    novoEmail: z.string().email().max(255),
    confirmarEmail: z.string().email().max(255),
  })
  .refine((v) => v.novoEmail === v.confirmarEmail, {
    message: 'confirmarEmail deve ser igual a novoEmail',
    path: ['confirmarEmail'],
  });

/**
 * Input canonico de `auth.cancelEmailChange` (§4.8 Bloco B botao
 * `[Cancelar solicitacao]`). Sem body — a identidade do titular vem do
 * JWT via `roleProcedure(['super_admin'])`. Objeto vazio explicito para
 * que o zod rejeite payload com campos extras (canonico tRPC — inputs
 * fechados).
 */
const cancelEmailChangeInput = z.object({});

/** Input canonico de `auth.confirmEmailChange` (§4.9 passo 1). */
const confirmEmailChangeInput = z.object({
  token: z.string().min(1).max(1024),
});

// ---- Contratos de resposta canonicos (S021) ----------------------------

interface LoginPlatformSuccess {
  token: string;
  user: {
    id: number;
    name: string;
    role: PlatformRole;
    companyId: number;
  };
}

interface LoginSuperAdminSuccess {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: 'super_admin';
  };
}

/** Resposta canonica anti-enumeracao de `forgotPassword` (§4.4 c, §13.2). */
interface ForgotPasswordResult {
  msg: string;
  enviado: true;
}

/** Resposta canonica de `validateToken` (§4.5 passo 4d). */
interface ValidateTokenResult {
  userName: string;
  tipo: CredentialTokenTipo;
}

/** Resposta canonica de `resetPassword` e `firstAccess` (§4.5 10f, §13.3). */
interface PasswordChangeResult {
  msg: string;
}

/**
 * Resposta canonica de `changePassword` (§4.7 3i, §13.3). Apenas `msg` no
 * body — a reemissao de sessao "exceto a atual" (§5.7, S011) viaja via
 * header `x-roip-session` (S013 estendido, S029). Nao ha `token` no body.
 */
interface ChangePasswordResult {
  msg: string;
}

/**
 * Resposta canonica de `requestEmailChange` (§4.8 fluxo passo 5i). Body
 * literal do canonico: `{ status: 'solicitado', novoEmail }`.
 */
interface RequestEmailChangeResult {
  status: 'solicitado';
  novoEmail: string;
}

/**
 * Resposta canonica de `cancelEmailChange`. O canonico §4.8 e silente
 * sobre o body do 200 — o front simplesmente re-renderiza Bloco A. Decisao
 * de autor: `{ status: 'cancelado' }` simetrico aos demais status do
 * fluxo H3 (`solicitado`, `sucesso`, `invalido`, `expirado`).
 */
interface CancelEmailChangeResult {
  status: 'cancelado';
}

/**
 * Resposta canonica de `confirmEmailChange` no sucesso (§4.9 passo 3d).
 * Body literal do canonico: `{ status: 'sucesso' }`. Falhas sobem como
 * TRPCError com `cause: { status: 'expirado' | 'invalido' }` (§4.9
 * passos 3a-c).
 */
interface ConfirmEmailChangeResult {
  status: 'sucesso';
}

// ---- Helpers privados --------------------------------------------------

/**
 * Lanca TRPCError TOO_MANY_REQUESTS com o `retryAfterSeconds` no `cause`
 * (padrao S020). Mensagem canonica exata do §13.1 (S021 — "X" literal).
 */
function throwRateLimited(retryAfterSeconds: number): never {
  throw new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    message: MSG_RATE_LIMIT,
    cause: { retryAfterSeconds },
  });
}

/**
 * Lanca TRPCError canonico para token expirado/invalido/usado/type
 * incompativel (§4.5 4a-b, §13.2). Sempre a MESMA mensagem — anti-enumeracao.
 * `code` alterna entre BAD_REQUEST (token) e FORBIDDEN (usuario inativo/
 * ausente, §4.5 4c); a mensagem literal e a mesma em ambos.
 */
function throwTokenExpired(code: 'BAD_REQUEST' | 'FORBIDDEN' = 'BAD_REQUEST'): never {
  throw new TRPCError({
    code,
    message: MSG_TOKEN_EXPIRED,
    cause: { tipo: 'expirado' },
  });
}

/**
 * Aplica a politica canonica de senha (§4.5 passo 7, §13.3): min 8 chars,
 * pelo menos 1 letra e pelo menos 1 numero. Regex compostas para
 * legibilidade — ESLint desta base impede one-liner denso.
 */
function isPasswordPolicyValid(senha: string): boolean {
  if (senha.length < 8) {
    return false;
  }
  const hasLetter = /[A-Za-z]/.test(senha);
  const hasDigit = /[0-9]/.test(senha);
  return hasLetter && hasDigit;
}

/**
 * Estado resolvido apos as verificacoes canonicas de consumo do token
 * (§4.5 passos 1-4). Devolvido pelos handlers `resetPassword` e
 * `firstAccess`, alem de `validateToken`. Nunca vaza para o cliente as
 * strings do accessTokens ou dados sensiveis do titular — apenas o
 * necessario para o passo seguinte.
 */
interface ResolvedCredentialToken {
  accessTokenId: number;
  userType: CredentialUserType;
  userId: number;
  tipo: CredentialTokenTipo;
  userName: string;
}

/**
 * Verifica assinatura do JWT, cruza com o registro em `accessTokens`,
 * verifica `usedAt`, `expiresAt`, compatibilidade de `type` com o `tipo`
 * requisitado, e resolve o titular por `userType + userId` verificando
 * status ativo (para employees e cLevelMembers) / existencia (para
 * superAdmins). Toda falha resolve na MESMA mensagem canonica
 * `MSG_TOKEN_EXPIRED` — codigo tRPC varia (BAD_REQUEST para problemas de
 * token, FORBIDDEN para usuario inativo/ausente, §4.5 4c). Ordem canonica
 * preservada linha a linha.
 */
async function resolveCredentialTokenForConsumption(
  ctx: {
    db: import('../../db/client').RoipDatabase;
  },
  token: string,
  tipoRequisitado: CredentialTokenTipo,
): Promise<ResolvedCredentialToken> {
  // 4a — Decodificar JWT. Assinatura invalida, payload malformado ou
  // ausencia de `tipo`/`userType` cai aqui.
  const verifyResult = await verifyCredentialToken(token);
  if (!verifyResult.valid) {
    throwTokenExpired('BAD_REQUEST');
  }
  const claims = verifyResult.claims;

  // Cruzar `tipo` do payload com o `tipo` requisitado pelo handler. Um
  // token de first_access nunca deve consumir-se em resetPassword e vice-
  // versa; nem o tipo do payload divergir do `type` no accessTokens.
  if (claims.tipo !== tipoRequisitado) {
    throwTokenExpired('BAD_REQUEST');
  }

  // 4b — Busca em `accessTokens` pelo `token` (UNIQUE). Ausente/usado/
  // expirado/type incompativel — todos MSG_TOKEN_EXPIRED.
  const record = await getAccessTokenByToken(ctx.db, token);
  if (record === undefined) {
    throwTokenExpired('BAD_REQUEST');
  }
  if (record.usedAt !== null) {
    throwTokenExpired('BAD_REQUEST');
  }
  const now = new Date();
  if (record.expiresAt.getTime() <= now.getTime()) {
    throwTokenExpired('BAD_REQUEST');
  }
  const tipoDoRegistro: CredentialTokenTipo =
    record.type === 'first_access' ? 'first_access' : 'reset';
  if (tipoDoRegistro !== tipoRequisitado) {
    throwTokenExpired('BAD_REQUEST');
  }

  // Cruzar `userType` e `userId` do payload com o registro. Divergencia
  // aqui e sinal de token forjado / bug de emissao — trata como expirado.
  if (record.userType !== claims.userType || record.userId !== claims.userId) {
    throwTokenExpired('BAD_REQUEST');
  }

  // 4c — Resolver titular e verificar status. Anti-enumeracao: usuario
  // ausente ou inativo devolve MSG_TOKEN_EXPIRED (nunca vaza que o CPF
  // existe ou nao).
  let userName: string;
  if (claims.userType === 'employee') {
    const emp = await getEmployeeById(ctx.db, claims.userId);
    if (emp === undefined || emp.status === 'inativo') {
      throwTokenExpired('FORBIDDEN');
    }
    userName = emp.name;
  } else if (claims.userType === 'clevel') {
    const cle = await getCLevelMemberById(ctx.db, claims.userId);
    if (cle === undefined || cle.status === 'inativo') {
      throwTokenExpired('FORBIDDEN');
    }
    userName = cle.name;
  } else {
    const adm = await getSuperAdminById(ctx.db, claims.userId);
    if (adm === undefined) {
      throwTokenExpired('FORBIDDEN');
    }
    userName = adm.name;
  }

  return {
    accessTokenId: record.id,
    userType: claims.userType,
    userId: claims.userId,
    tipo: claims.tipo,
    userName,
  };
}

/**
 * Emite o JWT de credencial + insere em `accessTokens` com concorrencia
 * canonica (§5.4): invalida ativos anteriores do mesmo (`userType`,
 * `userId`, `type`) e grava o novo com `expiresAt = now + 7 dias`. Uso
 * interno de `forgotPassword`; o `type` fixo em 'password_reset' nesta ME
 * (o botao da ficha, que emite 'first_access', vira na ME-022c). Sem
 * envio de email nesta ME — o worker de email consumira `accessTokens`
 * recem-criados em ME futura.
 */
async function emitCredentialToken(
  ctx: { db: import('../../db/client').RoipDatabase },
  params: {
    userType: CredentialUserType;
    userId: number;
    tipo: CredentialTokenTipo;
    tipoAccessTokens: 'password_reset' | 'first_access';
  },
): Promise<void> {
  const now = new Date();
  await invalidateActiveTokensByUserAndType(
    ctx.db,
    params.userType,
    params.userId,
    params.tipoAccessTokens,
    now,
  );
  const jwt = await signCredentialToken({
    userId: params.userId,
    tipo: params.tipo,
    userType: params.userType,
  });
  const expiresAt = new Date(now.getTime() + CREDENTIAL_TOKEN_TTL_MS);
  await createAccessToken(ctx.db, {
    userType: params.userType,
    userId: params.userId,
    token: jwt,
    type: params.tipoAccessTokens,
    expiresAt,
  });
}

/**
 * Deriva o `role` canonico (§2.2, §2.3) do candidato resolvido pela
 * precedencia inviolavel do §2.3. Retorna undefined quando o employee
 * existente NAO e RH nem Lider — cenario canonico de "colaborador puro"
 * em `employees` (§4.1 passo g).
 */
function resolveTargetAndRole(
  candidate: PlatformUserCandidate,
):
  | { kind: 'employee'; user: NonNullable<PlatformUserCandidate['employee']>; role: PlatformRole }
  | { kind: 'clevel'; user: NonNullable<PlatformUserCandidate['clevel']>; role: 'clevel' }
  | { kind: 'collaborator_only'; user: NonNullable<PlatformUserCandidate['employee']> }
  | undefined {
  const { employee, clevel } = candidate;
  // Regra 1 (§2.3): isRH prevalece — role administrativa distingue-se pelo
  // isLider (rh_lider quando acumula, rh puro caso contrario).
  if (employee !== undefined && employee.isRH === true) {
    return {
      kind: 'employee',
      user: employee,
      role: employee.isLider === true ? 'rh_lider' : 'rh',
    };
  }
  // Regra 2 (§2.3): registro em cLevelMembers com mesmo CPF e mesma
  // empresa (a agregacao ja garante o "mesma empresa").
  if (clevel !== undefined) {
    return { kind: 'clevel', user: clevel, role: 'clevel' };
  }
  // Regra 3 (§2.3): isLider (sem isRH e sem C-level).
  if (employee !== undefined && employee.isLider === true) {
    return { kind: 'employee', user: employee, role: 'lider' };
  }
  // Regra 4 (§2.3): colaborador puro — employee sem isRH e sem isLider.
  if (employee !== undefined) {
    return { kind: 'collaborator_only', user: employee };
  }
  return undefined;
}

/**
 * Localiza um token ativo (usedAt IS NULL AND expiresAt > NOW) do Super
 * Admin cujo payload JWT carrega `tipo === 'email_change'` (S031). Usa
 * `listActiveTokensByUser` + decodificacao do payload de cada registro
 * candidato (`type = 'password_reset'`). Retorna o PRIMEIRO ativo
 * encontrado (§5.4 concorrencia garante no maximo 1 na pratica) ou null.
 *
 * Este helper existe porque o canonico §4.8g proibe extensao do enum
 * `accessTokens.type` do DOC 01 (S027 estende so o discriminador do
 * payload). Sem coluna `metadata` na tabela, a unica forma de
 * discriminar `tipo=email_change` de `tipo=reset` para o mesmo
 * `type=password_reset` de super_admin e decodificar o JWT.
 */
async function findActiveEmailChangeToken(
  db: import('../../db/client').RoipDatabase,
  superAdminId: number,
): Promise<{
  id: number;
  token: string;
  expiresAt: Date;
  type: 'password_reset' | 'first_access';
} | null> {
  const active = await listActiveTokensByUser(db, 'super_admin', superAdminId);
  for (const record of active) {
    if (record.type !== 'password_reset') {
      continue;
    }
    const verified = await verifyCredentialToken(record.token);
    if (!verified.valid) {
      continue;
    }
    if (verified.claims.tipo !== 'email_change') {
      continue;
    }
    return record;
  }
  return null;
}

/**
 * Lanca TRPCError canonico de `confirmEmailChange` com status `invalido`
 * no `cause` (§4.9 3a, 3b). Mensagem canonica literal §13.2 "Este link
 * expirou." — o front distingue `invalido` de `expirado` pelo `cause` e
 * escolhe o corpo canonico apropriado (ambos usam o mesmo titulo).
 */
function throwEmailChangeInvalido(): never {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: MSG_EMAIL_CHANGE_LINK_INVALID,
    cause: { status: 'invalido' },
  });
}

/**
 * Lanca TRPCError canonico de `confirmEmailChange` com status `expirado`
 * no `cause` (§4.9 3c). Mesma mensagem canonica de `throwEmailChangeInvalido`.
 * O status no `cause` distingue os dois caminhos para observabilidade,
 * mas do ponto de vista do usuario a UI e identica (S030 anti-enum).
 */
function throwEmailChangeExpirado(): never {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: MSG_EMAIL_CHANGE_LINK_INVALID,
    cause: { status: 'expirado' },
  });
}

/**
 * Detecta erro de UNIQUE constraint do driver mysql2 (ER_DUP_ENTRY, codigo
 * 1062). Usado por `confirmEmailChange` para mapear colisao concorrente do
 * `novoEmail` com outro Super Admin em `{ status: 'invalido' }` (S030
 * anti-enum). Assinatura do erro do mysql2: objeto com `code:
 * 'ER_DUP_ENTRY'` OU `errno: 1062`. O `drizzle-orm` envelopa o erro em
 * um `Error` proprio e coloca o original em `.cause` — o verificador
 * varre a raiz e a cadeia de causas.
 */
function isDuplicateEntryError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur !== null && typeof cur === 'object'; depth += 1) {
    const shape = cur as { code?: unknown; errno?: unknown; cause?: unknown };
    if (shape.code === 'ER_DUP_ENTRY') {
      return true;
    }
    if (shape.errno === 1062) {
      return true;
    }
    cur = shape.cause;
  }
  return false;
}

// ---- authRouter --------------------------------------------------------

export const authRouter = router({
  /**
   * `/` — login unificado (§4.1). Ordem canonica a-i, comentada nos
   * proprios passos. Perfis atendidos: RH, RH-Lider, C-level, Lider.
   * Colaborador puro digitando o proprio CPF recebe FORBIDDEN com
   * `redirectUrl: '/colaborador'` (canonico §4.1 g, §13.1).
   */
  loginPlatform: publicProcedure
    .input(loginPlatformInput)
    .mutation(async ({ ctx, input }): Promise<LoginPlatformSuccess> => {
      const ip = ctx.ip ?? RATE_LIMIT_IP_UNKNOWN;
      const rule = RATE_LIMITS.loginUnified;
      const key = buildRateLimitKey(ip, rule.op, input.cpf);

      // (a) — Rate limit.
      const status = ctx.rateLimiter.check(key, rule);
      if (status.blocked) {
        throwRateLimited(status.retryAfterSeconds);
      }

      // (b) e (c) — Busca cross-company (agregada por companyId).
      const candidates = await findPlatformUserByCpf(ctx.db, input.cpf);

      // (d) — Nao encontrado + (S019) ambiguidade cross-company. Ambos
      // sao tratados como "nao encontrado" para preservar anti-enumeracao.
      if (candidates.length !== 1) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }
      const only = candidates[0];
      if (only === undefined) {
        // Inalcancavel (candidates.length === 1 acima), mas o narrowing
        // do TS exige. Trata como "nao encontrado" defensivamente.
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }

      // Precedencia §2.3 escolhe o alvo antes das verificacoes de e/f.
      const resolved = resolveTargetAndRole(only);
      if (resolved === undefined) {
        // Nenhum registro elegivel no candidato — trata como "nao
        // encontrado". O caminho canonico coloca este cenario em (d).
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }

      // (e) — status = 'inativo' (nao incrementa; §4.1 e).
      // Para C-level, DOC 01 §4.4 declara status ativo/inativo; para
      // employee, §4.5. Colaborador puro tambem tem status; tratamos
      // igual — a mensagem canonica cobre "encontrado mas inativo".
      const targetStatus = resolved.user.status;
      if (targetStatus === 'inativo') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }

      // (f) — bcrypt.compare. `passwordHash` pode ser null para titulares
      // que ainda nao definiram senha (passwordSet=false); tratamos como
      // senha errada (incrementa rate limit) — anti-enumeracao preservada.
      const passwordHash = resolved.user.passwordHash;
      if (passwordHash === null || passwordHash === undefined) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }
      const passwordOk = await verifyPassword(input.senha, passwordHash);
      if (!passwordOk) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }

      // (g) — colaborador puro APOS validar senha (canonico §4.1 g).
      if (resolved.kind === 'collaborator_only') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: MSG_COLLABORATOR_ONLY,
          cause: { redirectUrl: '/colaborador' },
        });
      }

      // (h) — empresa inativa.
      const company = await getCompanyById(ctx.db, only.companyId);
      if (company === undefined || company.status === 'inativa') {
        throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_INACTIVE });
      }

      // (i) — Sucesso: reset + emissao do JWT.
      ctx.rateLimiter.reset(key);
      const token = await signPlatformToken({
        userId: resolved.user.id,
        role: resolved.role,
        companyId: only.companyId,
        credentialVersion: deriveCredentialVersion(passwordHash),
      });
      return {
        token,
        user: {
          id: resolved.user.id,
          name: resolved.user.name,
          role: resolved.role,
          companyId: only.companyId,
        },
      };
    }),

  /**
   * `/login-super-admin` — login exclusivo do Super Admin (§4.2). Ordem
   * canonica a-e. Sem `exp` no JWT (§5.1 — sessao nunca expira).
   */
  loginSuperAdmin: publicProcedure
    .input(loginSuperAdminInput)
    .mutation(async ({ ctx, input }): Promise<LoginSuperAdminSuccess> => {
      const ip = ctx.ip ?? RATE_LIMIT_IP_UNKNOWN;
      const rule = RATE_LIMITS.loginSuperAdmin;
      const key = buildRateLimitKey(ip, rule.op, input.email);

      // (a) — Rate limit.
      const status = ctx.rateLimiter.check(key, rule);
      if (status.blocked) {
        throwRateLimited(status.retryAfterSeconds);
      }

      // (b) — Busca em superAdmins por email (UNIQUE global).
      const admin = await getSuperAdminByEmail(ctx.db, input.email);

      // (c) — Nao encontrado.
      if (admin === undefined) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_SUPER_ADMIN_INVALID });
      }

      // (d) — bcrypt.compare. `passwordHash` e NOT NULL no schema (§4.1
      // DOC 01), mas o narrow defensivo trata como senha errada.
      const passwordOk = await verifyPassword(input.senha, admin.passwordHash);
      if (!passwordOk) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_SUPER_ADMIN_INVALID });
      }

      // (e) — Sucesso: reset + emissao do JWT (sem exp).
      ctx.rateLimiter.reset(key);
      const token = await signSuperAdminToken({
        superAdminId: admin.id,
        credentialVersion: deriveCredentialVersion(admin.passwordHash + admin.email),
      });
      return {
        token,
        user: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: 'super_admin',
        },
      };
    }),

  /**
   * Modal `[Esqueci minha senha]` — comum a `/` (branch CPF) e
   * `/login-super-admin` (branch email). DOC 02 §4.4. Ordem canonica a-d,
   * comentada nos proprios passos.
   *
   * Anti-enumeracao total: a resposta e SEMPRE 200 com a mesma mensagem
   * canonica, independentemente de o usuario existir ou nao. Rate limit
   * incrementa a cada tentativa (S025), sem reset.
   *
   * Envio de e-mail fica FORA do escopo desta ME. Um worker de email
   * consumira registros recem-criados de `accessTokens` em ME futura
   * (Bloco B6/B8). O token de link ja fica gravado em `accessTokens.token`.
   */
  forgotPassword: publicProcedure
    .input(forgotPasswordInput)
    .mutation(async ({ ctx, input }): Promise<ForgotPasswordResult> => {
      const ip = ctx.ip ?? RATE_LIMIT_IP_UNKNOWN;

      if (input.cpf !== undefined) {
        // ---- Branch CPF (`/`) ----
        const rule = RATE_LIMITS.forgotPassword;
        const key = buildRateLimitKey(ip, rule.op, input.cpf);

        // (a) — Rate limit.
        const status = ctx.rateLimiter.check(key, rule);
        if (status.blocked) {
          throwRateLimited(status.retryAfterSeconds);
        }
        // S025 — incrementa a cada tentativa, independente de encontrado.
        ctx.rateLimiter.registerFailure(key, rule);

        // (b) — Busca cross-company via authLookup.
        const candidates = await findPlatformUserByCpf(ctx.db, input.cpf);

        // (d) — S019: ambiguidade cross-company tratada como nao encontrado
        // (mesma logica de loginPlatform). Um unico candidato + resolucao
        // por §2.3 → emite token; qualquer outro caso → resposta 200 sem
        // gerar token (anti-enumeracao).
        if (candidates.length === 1) {
          const only = candidates[0];
          if (only !== undefined) {
            const resolved = resolveTargetAndRole(only);
            if (resolved !== undefined) {
              // Colaborador puro NAO recebe link — canonico §4.4 restringe
              // a "encontrado e ativo" no fluxo administrativo. Mesmo assim,
              // a resposta ao cliente e IDENTICA (anti-enumeracao).
              // C-level: userType='clevel'; employee (rh|rh_lider|lider):
              // userType='employee'. Colaborador puro (kind='collaborator_only')
              // e ignorado no gerador — resposta anti-enumeracao unificada.
              if (resolved.kind === 'clevel' && resolved.user.status === 'ativo') {
                await emitCredentialToken(ctx, {
                  userType: 'clevel',
                  userId: resolved.user.id,
                  tipo: 'reset',
                  tipoAccessTokens: 'password_reset',
                });
              } else if (resolved.kind === 'employee' && resolved.user.status === 'ativo') {
                await emitCredentialToken(ctx, {
                  userType: 'employee',
                  userId: resolved.user.id,
                  tipo: 'reset',
                  tipoAccessTokens: 'password_reset',
                });
              }
              // Empresa inativa NAO impede a emissao aqui — o §4.4 nao
              // menciona guard de empresa; o guard de empresa inativa vive
              // no consumo (loginPlatform, requests autenticados). Um
              // reset com empresa inativa produz um passwordHash novo mas
              // o login continuara bloqueado por §5.6 no proximo request.
            }
          }
        }

        // (c) — Resposta anti-enumeracao, SEMPRE 200 com msg canonica.
        return { msg: MSG_FORGOT_PASSWORD_SENT, enviado: true };
      }

      // ---- Branch email (`/login-super-admin`) ----
      if (input.email === undefined) {
        // Inalcancavel por refinement do zod, mas o narrowing do TS exige.
        return { msg: MSG_FORGOT_PASSWORD_SENT, enviado: true };
      }
      const email = input.email;
      const rule = RATE_LIMITS.forgotPasswordSuperAdmin;
      const key = buildRateLimitKey(ip, rule.op, email);

      // (a) — Rate limit.
      const status = ctx.rateLimiter.check(key, rule);
      if (status.blocked) {
        throwRateLimited(status.retryAfterSeconds);
      }
      // S025 — incrementa a cada tentativa.
      ctx.rateLimiter.registerFailure(key, rule);

      // (b) — Busca em superAdmins.
      const admin = await getSuperAdminByEmail(ctx.db, email);
      if (admin !== undefined) {
        await emitCredentialToken(ctx, {
          userType: 'super_admin',
          userId: admin.id,
          tipo: 'reset',
          tipoAccessTokens: 'password_reset',
        });
      }

      // (c) — Resposta anti-enumeracao, SEMPRE 200.
      return { msg: MSG_FORGOT_PASSWORD_SENT, enviado: true };
    }),

  /**
   * Validacao do link (`/reset-password?token=...` e
   * `/first-access?token=...`) — DOC 02 §4.5 passo 3-4. O frontend chama
   * ANTES de renderizar a tela A4 para saber se o link e valido. Sem rate
   * limit (S024).
   *
   * Cruza `tipo` do payload com `tipo` requisitado pela rota e com o
   * `type` do registro em `accessTokens`. Falhas devolvem MSG_TOKEN_EXPIRED
   * unica (anti-enumeracao). Sucesso devolve `{ userName, tipo }` para o
   * frontend renderizar o saludo personalizado (§4.5 tabela de diferencas
   * por fluxo).
   */
  validateToken: publicProcedure
    .input(validateTokenInput)
    .mutation(async ({ ctx, input }): Promise<ValidateTokenResult> => {
      const resolved = await resolveCredentialTokenForConsumption(ctx, input.token, input.tipo);
      return { userName: resolved.userName, tipo: resolved.tipo };
    }),

  /**
   * Reset de senha via link — `type=password_reset`. DOC 02 §4.5 passo
   * 9-11. Sem rate limit (S024). Ordem canonica:
   *
   *   1. Revalida token (mesmas verificacoes do §4.5 4a-c).
   *   2. Verifica que `tipo='reset'` bate com `type='password_reset'` no
   *      accessTokens (feito no proprio helper).
   *   3. Politica de senha (§4.5 passo 7, §13.3): min 8, >=1 letra,
   *      >=1 numero. Falha → BAD_REQUEST com MSG_PASSWORD_POLICY.
   *   4. `hashPassword(novaSenha)` com custo canonico S010 = 12.
   *   5. `updateEmployeeCredential` / `updateCLevelMemberCredential` /
   *      `updateSuperAdminPassword` conforme userType (RV-12: via Drizzle
   *      tipado). Reset NAO altera `passwordSet` (assume-se ja true).
   *   6. `markTokenAsUsed(accessTokenId)` — impede reuso do link.
   *   7. 200 com msg canonica de sucesso.
   *
   * Invalidacao de sessao pos-reset (§5.7 "inclusive a atual"):
   * automaticamente coberta pela mecanica S011 — o `pwv` derivado do novo
   * `passwordHash` muda; qualquer JWT de sessao em circulacao cai no
   * middleware `authed`. Sem codigo adicional.
   *
   * §4.5 "Regra canonica de reutilizacao": PERMITE nova senha == anterior
   * (backend nao conhece plaintext). Distincao ao `/alterar-senha` (§4.7)
   * fora do escopo desta ME.
   */
  resetPassword: publicProcedure
    .input(resetPasswordInput)
    .mutation(async ({ ctx, input }): Promise<PasswordChangeResult> => {
      // 1-2 — Revalida token para `tipo='reset'`.
      const resolved = await resolveCredentialTokenForConsumption(ctx, input.token, 'reset');

      // 3 — Politica de senha canonica.
      if (!isPasswordPolicyValid(input.novaSenha)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: MSG_PASSWORD_POLICY,
          cause: { field: 'novaSenha' },
        });
      }

      // 4 — Hash canonico bcrypt custo 12 (S010).
      const passwordHash = await hashPassword(input.novaSenha);

      // 5 — Update por userType. RV-12 — via Drizzle tipado nos services.
      if (resolved.userType === 'employee') {
        await updateEmployeeCredential(ctx.db, resolved.userId, { passwordHash });
      } else if (resolved.userType === 'clevel') {
        await updateCLevelMemberCredential(ctx.db, resolved.userId, { passwordHash });
      } else {
        // super_admin: sem coluna passwordSet; troca so o hash.
        await updateSuperAdminPassword(ctx.db, resolved.userId, passwordHash);
      }

      // 6 — Marca token como usado (impede reuso — §5.4).
      await markTokenAsUsed(ctx.db, resolved.accessTokenId);

      // 7 — Sucesso. Invalidacao de sessao via S011 (mudanca de pwv).
      return { msg: MSG_PASSWORD_CHANGED_SUCCESS };
    }),

  /**
   * Primeiro acesso via link — `type=first_access`. DOC 02 §4.5, §5.5.
   * Sem rate limit (S024). S026: `userType='super_admin'` e rejeitado
   * canonicamente (Bruno nasce com senha semeada §18.1 DOC 01; §5.4 lista
   * apenas password_reset para superAdmins). Ordem canonica identica ao
   * resetPassword, com duas diferencas:
   *
   *   - `tipo='first_access'`, cruzado com `type='first_access'` no
   *     accessTokens.
   *   - Update grava tambem `passwordSet=true` (libera o botao de login
   *     na ficha, §5.5).
   *
   * §5.7 "primeiro acesso NAO invalida sessoes" — nao ha sessoes previas
   * por definicao (o titular nunca fez login antes).
   */
  firstAccess: publicProcedure
    .input(firstAccessInput)
    .mutation(async ({ ctx, input }): Promise<PasswordChangeResult> => {
      // 1-2 — Revalida token para `tipo='first_access'`.
      const resolved = await resolveCredentialTokenForConsumption(ctx, input.token, 'first_access');

      // S026 — super_admin nunca deveria receber first_access; rejeicao
      // defensiva com msg canonica unificada.
      if (resolved.userType === 'super_admin') {
        throwTokenExpired('BAD_REQUEST');
      }

      // 3 — Politica de senha canonica.
      if (!isPasswordPolicyValid(input.novaSenha)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: MSG_PASSWORD_POLICY,
          cause: { field: 'novaSenha' },
        });
      }

      // 4 — Hash canonico.
      const passwordHash = await hashPassword(input.novaSenha);

      // 5 — Update por userType, com passwordSet=true (libera login §5.5).
      if (resolved.userType === 'employee') {
        await updateEmployeeCredential(ctx.db, resolved.userId, {
          passwordHash,
          passwordSet: true,
        });
      } else {
        // clevel — S026 ja rejeitou super_admin acima.
        await updateCLevelMemberCredential(ctx.db, resolved.userId, {
          passwordHash,
          passwordSet: true,
        });
      }

      // 6 — Marca token como usado.
      await markTokenAsUsed(ctx.db, resolved.accessTokenId);

      // 7 — Sucesso.
      return { msg: MSG_PASSWORD_CHANGED_SUCCESS };
    }),

  /**
   * `/alterar-senha` — DOC 02 §4.7 (tela H2). Alteracao autenticada de
   * senha para todos os 5 perfis com sessao (colaborador puro nao possui
   * JWT de plataforma §2.2, entao nao alcanca esta procedure — o guard
   * canonico H2 do §4.7 "Colaborador puro: redirect para /colaborador" se
   * materializa na ausencia estrutural). Ordem canonica a-i, comentada
   * passo a passo.
   *
   * Contrato de resposta canonico literal (§4.7 3i): `{ msg }` — SEM
   * token no body. A reemissao "exceto a sessao atual" (§5.7 primeira
   * linha) usa a mecanica S011 + S013 estendida por S029: o resolver
   * assina novo JWT com pwv derivado do NOVO passwordHash e sobrepoe em
   * `ctx.reissuedToken.value`; o adapter fetch publica no header
   * `x-roip-session`. Sem essa sobreposicao, o proximo request cairia no
   * middleware `authed` com pwv divergente (pois a mecanica S011 muda o
   * pwv esperado com a troca do passwordHash).
   *
   * §4.5 vs §4.7 — DIFERENCA CANONICA: `resetPassword` PERMITE nova senha
   * identica (backend nao conhece plaintext); `changePassword` PROIBE via
   * `bcrypt.compare(novaSenha, passwordHash)` no passo canonico (f). Duas
   * comparacoes bcrypt seguidas — custo aceitavel (custo 12, uso
   * autenticado nao-hot).
   */
  changePassword: protectedProcedure
    .input(changePasswordInput)
    .mutation(async ({ ctx, input }): Promise<ChangePasswordResult> => {
      const ip = ctx.ip ?? RATE_LIMIT_IP_UNKNOWN;
      const rule = RATE_LIMITS.changePassword;
      const userIdForKey =
        ctx.user.role === 'super_admin' ? ctx.user.superAdminId : ctx.user.userId;
      const key = buildRateLimitKey(ip, rule.op, String(userIdForKey));

      // (a) — Autoriza via JWT: `protectedProcedure` ja executou (middleware
      //       `authed` do trpc.ts).
      // (b) — Rate limit `{ip}:change-password:{userId}` = 5/15min.
      const status = ctx.rateLimiter.check(key, rule);
      if (status.blocked) {
        throwRateLimited(status.retryAfterSeconds);
      }

      // (c) — Busca `passwordHash` do titular. Cinco branches por role,
      //       cada uma resolvendo o registro canonico corresp. Nos casos
      //       administrativos (RH/RH-Lider/Lider) o titular vive em
      //       `employees`; C-level em `cLevelMembers`; Super Admin em
      //       `superAdmins`. S014 defensiva: titular sumido/sem hash sobe
      //       como UNAUTHORIZED (sessao expirada, §8.3) — nao deveria
      //       acontecer com sessao valida, mas cobre estado corrompido.
      let currentHash: string;
      let userEmail: string | null = null;
      if (ctx.user.role === 'super_admin') {
        const admin = await getSuperAdminById(ctx.db, ctx.user.superAdminId);
        if (admin === undefined) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
        }
        currentHash = admin.passwordHash;
        userEmail = admin.email;
      } else if (ctx.user.role === 'clevel') {
        const member = await getCLevelMemberById(ctx.db, ctx.user.userId);
        if (member === undefined || member.passwordHash === null) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
        }
        currentHash = member.passwordHash;
      } else {
        const employee = await getEmployeeById(ctx.db, ctx.user.userId);
        if (employee === undefined || employee.passwordHash === null) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
        }
        currentHash = employee.passwordHash;
      }

      // (d) — `bcrypt.compare(senhaAtual, passwordHash)`. Falha: incrementa
      //       rate limit + 401 canonica literal §13.3.
      const senhaAtualOk = await verifyPassword(input.senhaAtual, currentHash);
      if (!senhaAtualOk) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: MSG_PASSWORD_ACTUAL_INCORRECT,
          cause: { field: 'senhaAtual' },
        });
      }

      // (e) — Politica de senha server-side, redundante ao client-side
      //       (§4.7 passo 1). Mensagem canonica literal §13.3.
      if (!isPasswordPolicyValid(input.novaSenha)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: MSG_PASSWORD_POLICY,
          cause: { field: 'novaSenha' },
        });
      }

      // (f) — `bcrypt.compare(novaSenha, passwordHash)`. Se TRUE (nova ===
      //       atual): 400 canonica literal §13.3. Distincao ao reset
      //       (§4.5) que PERMITE nova identica.
      const novaIgualAtual = await verifyPassword(input.novaSenha, currentHash);
      if (novaIgualAtual) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: MSG_NEW_PASSWORD_MUST_DIFFER,
          cause: { field: 'novaSenha' },
        });
      }

      // (g) — Hash canonico bcrypt custo 12 (S010) e UPDATE por role. RV-12:
      //       via Drizzle tipado nos services. Reset NAO altera passwordSet
      //       (assume-se ja true — o titular esta autenticado).
      const newHash = await hashPassword(input.novaSenha);
      if (ctx.user.role === 'super_admin') {
        await updateSuperAdminPassword(ctx.db, ctx.user.superAdminId, newHash);
      } else if (ctx.user.role === 'clevel') {
        await updateCLevelMemberCredential(ctx.db, ctx.user.userId, { passwordHash: newHash });
      } else {
        await updateEmployeeCredential(ctx.db, ctx.user.userId, { passwordHash: newHash });
      }

      // (h) — §5.7 "exceto a sessao atual" (S029): reemite JWT com pwv
      //       derivado do NOVO material e sobrepoe `ctx.reissuedToken.value`.
      //       O middleware `authed` ja havia gravado o bearer velho para
      //       reemissao sliding (perfis administrativos); esta atribuicao
      //       substitui pelo token novo, alinhado ao pwv atualizado. Para
      //       Super Admin, o middleware nao reemite (§5.1 sem exp), mas
      //       aqui a reemissao e obrigatoria para preservar a sessao — sem
      //       ela, o proximo request cai por pwv divergente.
      if (ctx.user.role === 'super_admin' && userEmail !== null) {
        const newPwv = deriveCredentialVersion(newHash + userEmail);
        ctx.reissuedToken.value = await signSuperAdminToken({
          superAdminId: ctx.user.superAdminId,
          credentialVersion: newPwv,
        });
      } else if (ctx.user.role !== 'super_admin') {
        const newPwv = deriveCredentialVersion(newHash);
        ctx.reissuedToken.value = await signPlatformToken({
          userId: ctx.user.userId,
          role: ctx.user.role,
          companyId: ctx.user.companyId,
          credentialVersion: newPwv,
        });
      }

      // Reset do rate limit no sucesso (padrao canonico dos logins).
      ctx.rateLimiter.reset(key);

      // (i) — 200 canonica literal §4.7 3i, §13.3.
      return { msg: MSG_PASSWORD_CHANGE_SUCCESS };
    }),

  /**
   * `/alterar-email` — Bloco A do fluxo H3 (DOC 02 §4.8). EXCLUSIVO do
   * Super Admin (`roleProcedure(['super_admin'])`). Ordem canonica a-i
   * do §4.8 passo 5, comentada passo a passo. Emite JWT de credencial
   * com metadado `tipo: 'email_change'` (S027) + `novoEmail` (S028); o
   * registro em `accessTokens` usa o mesmo enum `type = 'password_reset'`
   * (§4.8g e §6.5: canonico proibe extensao do enum DOC 01) com TTL
   * canonico de 24 HOUR (§5.4).
   *
   * Anti-enumeracao (S030): NAO verifica pre-existencia de `novoEmail`
   * em outro super_admin. Uma eventual colisao aparece na confirmacao
   * (§4.9) como `{ status: 'invalido' }` generico — mesma msg de link
   * expirado, mesma msg de forjado. Bruno nao descobre existencia de
   * outros super_admins via mensagem de erro.
   */
  requestEmailChange: roleProcedure(['super_admin'])
    .input(requestEmailChangeInput)
    .mutation(async ({ ctx, input }): Promise<RequestEmailChangeResult> => {
      // roleProcedure garante ctx.user.role === 'super_admin' — narrowing.
      if (ctx.user.role !== 'super_admin') {
        // Inalcancavel: roleProcedure ja filtrou. Narrowing defensivo.
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Perfil sem permissao.' });
      }
      const superAdminId = ctx.user.superAdminId;

      const ip = ctx.ip ?? RATE_LIMIT_IP_UNKNOWN;
      const rule = RATE_LIMITS.requestEmailChange;
      const key = buildRateLimitKey(ip, rule.op, String(superAdminId));

      // (a) — Autoriza via JWT + role: roleProcedure ja executou.
      // (b) — Rate limit `{ip}:request-email-change:{superAdminId}` 5/15min.
      const status = ctx.rateLimiter.check(key, rule);
      if (status.blocked) {
        throwRateLimited(status.retryAfterSeconds);
      }

      // (c) — Verifica solicitacao pendente ATIVA de email_change. §4.8 5c
      //       exige distinguir `tipo=email_change` de `tipo=reset` no
      //       mesmo enum `password_reset` — S031 varre os ativos e decodifica
      //       o payload de cada um.
      const pending = await findActiveEmailChangeToken(ctx.db, superAdminId);
      if (pending !== null) {
        throw new TRPCError({ code: 'CONFLICT', message: MSG_EMAIL_CHANGE_PENDING });
      }

      // (d) — bcrypt.compare(senhaAtual) com passwordHash canonico. Falha:
      //       registerFailure + 401 literal §13.3.
      const admin = await getSuperAdminById(ctx.db, superAdminId);
      if (admin === undefined) {
        // S014 defensiva — sessao valida com superAdmin sumido e estado
        // corrompido. UNAUTHORIZED coerente com §8.3.
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
      }
      const senhaAtualOk = await verifyPassword(input.senhaAtual, admin.passwordHash);
      if (!senhaAtualOk) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: MSG_PASSWORD_ACTUAL_INCORRECT,
          cause: { field: 'senhaAtual' },
        });
      }

      // (e) — Formato do novoEmail: zod ja validou (email + max 255) e a
      //       igualdade novoEmail === confirmarEmail via .refine. Nada
      //       adicional aqui.

      // (f) — novoEmail === admin.email atual: 400 literal §4.8 5f.
      if (input.novoEmail === admin.email) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: MSG_NEW_EMAIL_MUST_DIFFER,
          cause: { field: 'novoEmail' },
        });
      }

      // (g) — Emissao do JWT + INSERT em accessTokens. Concorrencia canonica
      //       (§5.4): invalida ativos anteriores do mesmo (userType, userId,
      //       type='password_reset') ANTES da emissao. TTL canonico 24 HOUR
      //       (§5.4 tabela, UNICO caso de 24h no repo).
      const now = new Date();
      await invalidateActiveTokensByUserAndType(
        ctx.db,
        'super_admin',
        superAdminId,
        'password_reset',
        now,
      );
      const jwt = await signCredentialToken({
        userId: superAdminId,
        tipo: 'email_change',
        userType: 'super_admin',
        novoEmail: input.novoEmail,
      });
      const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_TOKEN_TTL_MS);
      await createAccessToken(ctx.db, {
        userType: 'super_admin',
        userId: superAdminId,
        token: jwt,
        type: 'password_reset',
        expiresAt,
      });

      // (h) — Template 3 de e-mail (envio real fica no worker de email —
      //       Fase de motores). Fora do escopo desta ME.

      // Reset do rate limit no sucesso.
      ctx.rateLimiter.reset(key);

      // (i) — 200 canonica literal §4.8 5i.
      return { status: 'solicitado', novoEmail: input.novoEmail };
    }),

  /**
   * Botao `[Cancelar solicitacao]` do Bloco B do fluxo H3 (§4.8 ultimo
   * paragrafo). EXCLUSIVO do Super Admin. Invalida qualquer token de
   * alteracao de e-mail ativo do titular, marcando `usedAt = NOW()`. NAO
   * afeta tokens de reset comum (`tipo=reset`) — a filtragem por metadado
   * `tipo=email_change` preserva a distincao canonica.
   *
   * Idempotente: sem token ativo, devolve `{ status: 'cancelado' }` sem
   * erro. O frontend nao precisa saber quantos tokens foram invalidados;
   * o comportamento canonico e "re-renderiza Bloco A do zero" (§4.8 fim).
   */
  cancelEmailChange: roleProcedure(['super_admin'])
    .input(cancelEmailChangeInput)
    .mutation(async ({ ctx }): Promise<CancelEmailChangeResult> => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Perfil sem permissao.' });
      }
      const superAdminId = ctx.user.superAdminId;

      // Encontra todos os tokens ATIVOS do titular filtrando por metadado
      // `tipo=email_change` no payload do JWT. §5.4 concorrencia garante
      // que na pratica ha no maximo 1 ativo — mas o loop cobre estados
      // corrompidos ou execucao concorrente.
      const active = await listActiveTokensByUser(ctx.db, 'super_admin', superAdminId);
      const now = new Date();
      for (const record of active) {
        if (record.type !== 'password_reset') {
          continue;
        }
        const verified = await verifyCredentialToken(record.token);
        if (!verified.valid) {
          continue;
        }
        if (verified.claims.tipo !== 'email_change') {
          continue;
        }
        await markTokenAsUsed(ctx.db, record.id, now);
      }

      return { status: 'cancelado' };
    }),

  /**
   * `/confirmar-alteracao-email?token=JWT` (§4.9). Consumido pelo link no
   * novo e-mail — `publicProcedure` (o novo endereco nao tem sessao ainda,
   * e a sessao no e-mail antigo esta ativa mas nao e requisito). S024
   * estendida a este consumo: sem rate limit — o bearer e um JWT longo
   * nao-adivinhavel, e a defesa contra abuso de emissao vive em
   * `requestEmailChange`.
   *
   * Ordem canonica (§4.9 passo 3):
   *   (a) Decodificar JWT + tipo === 'email_change' + userType ===
   *       'super_admin' + novoEmail presente → falha: 400 `invalido`.
   *   (b) Busca accessTokens por token=? + userType='super_admin' +
   *       type='password_reset' + usedAt IS NULL + expiresAt > NOW → falha:
   *       400 `expirado`.
   *   (c) Cruza sub do payload com userId do registro → divergencia: 400
   *       `invalido`.
   *   (d) Busca superAdmin por id → sumido: 400 `expirado` (defensivo).
   *   (e) UPDATE superAdmins.email + markTokenAsUsed. UNIQUE constraint
   *       captura colisao concorrente: mapeia para 400 `invalido` (S030
   *       anti-enum).
   *   (f) 200 `{ status: 'sucesso' }`. Invalidacao "inclusive a atual"
   *       (§5.7 segunda linha) automatica via S011 email-based: pwv do
   *       Super Admin muda com a troca do e-mail, todos os JWTs em
   *       circulacao caem no `authed`.
   *
   * As duas UPDATEs (superAdmins.email + accessTokens.usedAt) NAO estao
   * em transacao SQL formal: o driver mysql2 padrao nao promove a
   * atomicidade. Aceitavel canonicamente — sequencia (email primeiro,
   * token usedAt depois) garante que uma falha no meio nao permite reuso
   * do token: se o UPDATE do email quebra (UNIQUE), o token permanece
   * ativo e o Super Admin pode tentar novamente ou cancelar. Se o
   * markTokenAsUsed quebra apos o UPDATE do email, o token expira em 24h
   * (§5.4). Sem janela de reuso pratica.
   */
  confirmEmailChange: publicProcedure
    .input(confirmEmailChangeInput)
    .mutation(async ({ ctx, input }): Promise<ConfirmEmailChangeResult> => {
      // (a) — Decodifica JWT. Assinatura invalida OU tipo diferente de
      //       'email_change' OU userType diferente de 'super_admin' OU
      //       novoEmail ausente → 'invalido' (S030 anti-enum: mesma msg do
      //       expirado, so o status difere no cause para o front).
      const verified = await verifyCredentialToken(input.token);
      if (!verified.valid) {
        throwEmailChangeInvalido();
      }
      if (verified.claims.tipo !== 'email_change') {
        throwEmailChangeInvalido();
      }
      if (verified.claims.userType !== 'super_admin') {
        throwEmailChangeInvalido();
      }
      if (verified.claims.novoEmail === undefined) {
        // Estruturalmente inalcancavel apos S028 (verifyCredentialToken
        // rejeita tipo=email_change sem novoEmail), mas o narrowing do TS
        // exige o guard explicito.
        throwEmailChangeInvalido();
      }
      const superAdminId = verified.claims.userId;
      const novoEmail = verified.claims.novoEmail;

      // (b) — Busca accessTokens pelo token bruto (UNIQUE §4.8). Falhas
      //       de estado (nao encontrado / usedAt / expiresAt / type) todas
      //       viram 'expirado'.
      const record = await getAccessTokenByToken(ctx.db, input.token);
      if (record === undefined) {
        throwEmailChangeExpirado();
      }
      if (record.usedAt !== null) {
        throwEmailChangeExpirado();
      }
      const now = new Date();
      if (record.expiresAt.getTime() <= now.getTime()) {
        throwEmailChangeExpirado();
      }
      if (record.type !== 'password_reset') {
        throwEmailChangeExpirado();
      }

      // (c) — Cruza userType + userId com o payload verificado. Divergencia
      //       aqui e token forjado ou bug — 'invalido'.
      if (record.userType !== 'super_admin' || record.userId !== superAdminId) {
        throwEmailChangeInvalido();
      }

      // (d) — Titular deve existir. Sumido: defensivo — 'expirado' (nao
      //       vaza informacao sobre estado interno).
      const admin = await getSuperAdminById(ctx.db, superAdminId);
      if (admin === undefined) {
        throwEmailChangeExpirado();
      }

      // (e) — UPDATE do e-mail. UNIQUE violation (novoEmail tomado por
      //       outro super_admin nesse meio-tempo) mapeia para 'invalido'
      //       (S030). Erros de rede do banco sobem naturalmente.
      try {
        await updateSuperAdminEmail(ctx.db, superAdminId, novoEmail);
      } catch (err) {
        if (isDuplicateEntryError(err)) {
          throwEmailChangeInvalido();
        }
        throw err;
      }
      await markTokenAsUsed(ctx.db, record.id, now);

      // (f) — 200 canonica literal §4.9 3d. Invalidacao "inclusive a atual"
      //       automatica via S011 (email participa da derivacao do pwv).
      return { status: 'sucesso' };
    }),
});
