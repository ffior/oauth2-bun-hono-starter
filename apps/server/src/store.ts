import { config } from "./config";

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
}

/** 浏览器登录该网站后建立的会话（用于识别"用户是谁"，与 OAuth token 不是一回事） */
export interface LoginSession {
  id: string;
  userId: string;
  expiresAt: number;
}

/** 一次未完成的授权请求（用户登录前，先把 OAuth 参数暂存起来） */
export interface PendingAuthorization {
  id: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  expiresAt: number;
}

/** 授权码：用户同意授权后签发，客户端拿它去换 token */
export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  userId: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  expiresAt: number;
  used: boolean;
}

export interface AccessToken {
  token: string;
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: number;
}

export interface RefreshToken {
  token: string;
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: number;
}

/* ------------------------------------------------------------------ */
/*  存储实现（纯内存 Map，重启进程后数据全部丢失，仅用于演示/开发）        */
/* ------------------------------------------------------------------ */

export const db = {
  users: new Map<string, User>(),
  usersByEmail: new Map<string, string>(), // email -> userId
  loginSessions: new Map<string, LoginSession>(),
  pendingAuthorizations: new Map<string, PendingAuthorization>(),
  authorizationCodes: new Map<string, AuthorizationCode>(),
  accessTokens: new Map<string, AccessToken>(),
  refreshTokens: new Map<string, RefreshToken>(),
};

function randomId(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

/* ------------------------------------------------------------------ */
/*  用户 & 登录会话                                                     */
/* ------------------------------------------------------------------ */

export async function createUser(email: string, password: string, name: string): Promise<User> {
  const passwordHash = await Bun.password.hash(password);
  const user: User = { id: randomId(16), email, passwordHash, name };
  db.users.set(user.id, user);
  db.usersByEmail.set(email.toLowerCase(), user.id);
  return user;
}

export function getUserByEmail(email: string): User | null {
  const userId = db.usersByEmail.get(email.toLowerCase());
  if (!userId) return null;
  return db.users.get(userId) ?? null;
}

export async function verifyPassword(email: string, password: string): Promise<User | null> {
  const userId = db.usersByEmail.get(email.toLowerCase());
  if (!userId) return null;
  const user = db.users.get(userId);
  if (!user) return null;
  const ok = await Bun.password.verify(password, user.passwordHash);
  return ok ? user : null;
}

export function createLoginSession(userId: string): LoginSession {
  const session: LoginSession = {
    id: randomId(32),
    userId,
    expiresAt: Date.now() + config.loginSessionTtlSec * 1000,
  };
  db.loginSessions.set(session.id, session);
  return session;
}

export function getLoginSession(sessionId: string): LoginSession | null {
  const session = db.loginSessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    db.loginSessions.delete(sessionId);
    return null;
  }
  return session;
}

/* ------------------------------------------------------------------ */
/*  待处理的授权请求（登录/同意页刷新之间的中转态）                          */
/* ------------------------------------------------------------------ */

export function savePendingAuthorization(p: Omit<PendingAuthorization, "id" | "expiresAt">): PendingAuthorization {
  const pending: PendingAuthorization = {
    ...p,
    id: randomId(16),
    expiresAt: Date.now() + 10 * 60 * 1000, // 给用户 10 分钟完成登录+同意
  };
  db.pendingAuthorizations.set(pending.id, pending);
  return pending;
}

export function getPendingAuthorization(id: string): PendingAuthorization | null {
  const p = db.pendingAuthorizations.get(id);
  if (!p) return null;
  if (p.expiresAt < Date.now()) {
    db.pendingAuthorizations.delete(id);
    return null;
  }
  return p;
}

export function consumePendingAuthorization(id: string): void {
  db.pendingAuthorizations.delete(id);
}

/* ------------------------------------------------------------------ */
/*  授权码                                                              */
/* ------------------------------------------------------------------ */

export function createAuthorizationCode(
  data: Omit<AuthorizationCode, "code" | "expiresAt" | "used">
): AuthorizationCode {
  const authCode: AuthorizationCode = {
    ...data,
    code: randomId(32),
    expiresAt: Date.now() + config.authCodeTtlSec * 1000,
    used: false,
  };
  db.authorizationCodes.set(authCode.code, authCode);
  return authCode;
}

/** 只读查看授权码（不消费），用于先做完整性校验 */
export function peekAuthorizationCode(code: string): AuthorizationCode | null {
  const authCode = db.authorizationCodes.get(code);
  if (!authCode) return null;
  if (authCode.used || authCode.expiresAt < Date.now()) return null;
  return authCode;
}

/** 把授权码标记为已用（只有在 client_id / redirect_uri / PKCE 全部校验通过、即将签发 token 时才应调用） */
export function markAuthorizationCodeUsed(code: string): boolean {
  const authCode = db.authorizationCodes.get(code);
  if (!authCode || authCode.used || authCode.expiresAt < Date.now()) return false;
  authCode.used = true;
  return true;
}

/** @deprecated 请使用 peekAuthorizationCode + markAuthorizationCodeUsed，避免校验失败时误烧 code */
export function consumeAuthorizationCode(code: string): AuthorizationCode | null {
  const authCode = db.authorizationCodes.get(code);
  if (!authCode) return null;
  if (authCode.used || authCode.expiresAt < Date.now()) return null;
  authCode.used = true;
  return authCode;
}

/* ------------------------------------------------------------------ */
/*  Token                                                              */
/* ------------------------------------------------------------------ */

export function issueTokenPair(clientId: string, userId: string, scope: string) {
  const accessToken: AccessToken = {
    token: randomId(32),
    clientId,
    userId,
    scope,
    expiresAt: Date.now() + config.accessTokenTtlSec * 1000,
  };
  const refreshToken: RefreshToken = {
    token: randomId(32),
    clientId,
    userId,
    scope,
    expiresAt: Date.now() + config.refreshTokenTtlSec * 1000,
  };
  db.accessTokens.set(accessToken.token, accessToken);
  db.refreshTokens.set(refreshToken.token, refreshToken);
  return { accessToken, refreshToken };
}

export function getAccessToken(token: string): AccessToken | null {
  const t = db.accessTokens.get(token);
  if (!t) return null;
  if (t.expiresAt < Date.now()) {
    db.accessTokens.delete(token);
    return null;
  }
  return t;
}

export function rotateRefreshToken(oldToken: string) {
  const t = db.refreshTokens.get(oldToken);
  if (!t) return null;
  if (t.expiresAt < Date.now()) {
    db.refreshTokens.delete(oldToken);
    return null;
  }
  // 旧 refresh token 用完即失效（旋转策略，降低泄露风险）
  db.refreshTokens.delete(oldToken);
  return issueTokenPair(t.clientId, t.userId, t.scope);
}
