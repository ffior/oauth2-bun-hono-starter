/**
 * 桌面端鉴权核心（只在 bun 主进程里跑）。
 *
 * 流程（Authorization Code + PKCE，桌面应用属于不能保存 client secret 的"公开客户端"）：
 *  1. 生成 code_verifier / code_challenge 和随机 state
 *  2. 在 127.0.0.1 起一个只服务一次的临时 HTTP 服务器（端口由系统随机分配）
 *  3. 调起系统浏览器访问认证服务器的 /oauth/authorize，用户在网页上登录并授权
 *  4. 浏览器被 302 回 http://127.0.0.1:<port>/callback?code=...&state=...
 *     本地服务器接住后再 302 到 web 的 /oauth/done，让地址栏停在正式域名上
 *  5. 主进程拿到 code，直接（不经浏览器）POST /oauth/token 换 access/refresh token
 *  6. token 落盘，之后访问业务接口都带 Authorization: Bearer <access_token>
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { AuthState, AuthUser } from "../shared/auth-rpc";

const AUTH_SERVER = process.env.AUTH_SERVER ?? "http://localhost:8787";
/** 登录站点（web 工程）地址：登录完成后把浏览器 302 回它的 /oauth/done */
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5174";
const CLIENT_ID = "local-desktop-app";
const SCOPE = "profile";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const CREDENTIALS_FILE = join(
  homedir(),
  ".oauth2-desktop-demo",
  "credentials.json"
);

interface StoredCredentials {
  accessToken: string;
  refreshToken: string;
  /** access token 过期时间（epoch ms） */
  expiresAt: number;
  scope: string;
}

/* ------------------------------------------------------------------ */
/*  本地凭证读写                                                        */
/* ------------------------------------------------------------------ */

async function loadCredentials(): Promise<StoredCredentials | null> {
  const file = Bun.file(CREDENTIALS_FILE);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as StoredCredentials;
  } catch {
    return null;
  }
}

async function saveCredentials(creds: StoredCredentials): Promise<void> {
  await Bun.write(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
}

async function clearCredentials(): Promise<void> {
  await rm(CREDENTIALS_FILE, { force: true });
}

/* ------------------------------------------------------------------ */
/*  PKCE / 浏览器                                                       */
/* ------------------------------------------------------------------ */

function randomUrlSafe(bytes: number): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString(
    "base64url"
  );
}

async function generatePkcePair() {
  // RFC 7636 建议 code_verifier 长度在 43~128 字符之间
  const codeVerifier = randomUrlSafe(48);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  return {
    codeVerifier,
    codeChallenge: Buffer.from(digest).toString("base64url"),
  };
}

/** 跨平台调用系统命令打开默认浏览器 */
function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    console.log(`[auth] 无法自动打开浏览器，请手动访问：${url}`);
  }
}

/* ------------------------------------------------------------------ */
/*  token 换取 / 刷新                                                   */
/* ------------------------------------------------------------------ */

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

/**
 * token 端点调用失败。
 * fatal = true 表示服务器明确拒绝（凭证真的没救了，必须重新登录）；
 * fatal = false 表示网络问题等临时故障，凭证要留着，稍后重试。
 */
class TokenError extends Error {
  constructor(message: string, readonly fatal: boolean) {
    super(message);
  }
}

async function postToken(
  body: Record<string, string>
): Promise<StoredCredentials> {
  let res: Response;
  try {
    res = await fetch(new URL("/oauth/token", AUTH_SERVER), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
  } catch (err) {
    // 断网、服务器没起、DNS 挂了……都属于临时故障，不能因此清掉凭证
    throw new TokenError(
      `无法连接认证服务器：${(err as Error).message}`,
      false
    );
  }

  if (!res.ok) {
    const text = await res.text();
    // 4xx 是服务器明确说"这个凭证不行"；5xx 属于服务端临时故障，可以重试
    throw new TokenError(
      `换取 token 失败：${text}`,
      res.status >= 400 && res.status < 500
    );
  }

  const data = (await res.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/**
 * 同一时刻只允许一个 refresh 请求在飞。
 *
 * 服务端是 refresh token 旋转策略（用一次旧的立刻失效），
 * 如果两个请求并发刷新，后一个拿的是已经作废的 refresh token，
 * 会拿到 invalid_grant 从而把用户误登出。
 */
let refreshInFlight: Promise<StoredCredentials> | null = null;

function refreshTokens(refreshToken: string): Promise<StoredCredentials> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshed = await postToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
    // 先落盘再返回：进程如果这时被杀，至少新 token 已经存下来了
    await saveCredentials(refreshed);
    return refreshed;
  })();

  // 无论成功失败都要放开，否则后续再也刷不了
  refreshInFlight
    .catch(() => {})
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/**
 * 返回可用的 access token；快过期就先刷新。
 * 返回 null 表示当前拿不到可用 token（可能是没登录、也可能是临时网络问题）。
 */
async function ensureAccessToken(): Promise<string | null> {
  const creds = await loadCredentials();
  if (!creds) return null;

  // 过期前 30 秒就主动刷新，避免请求发出去的瞬间刚好失效
  if (creds.expiresAt - 30_000 > Date.now()) return creds.accessToken;

  try {
    return (await refreshTokens(creds.refreshToken)).accessToken;
  } catch (err) {
    if (err instanceof TokenError && !err.fatal) {
      // 临时故障：凭证留着，下次再试，不要把用户踢下线
      console.warn(`[auth] 刷新 token 暂时失败，保留本地凭证：${err.message}`);
      return null;
    }
    // 服务器明确拒绝：refresh token 真的失效了，必须重新走完整登录
    console.warn(
      `[auth] refresh token 已失效，需要重新登录：${(err as Error).message}`
    );
    await clearCredentials();
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  对外能力                                                            */
/* ------------------------------------------------------------------ */

/** 用 access token 拉取当前用户信息（token 不可用返回 null） */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const accessToken = await ensureAccessToken();
  if (!accessToken) return null;

  const res = await fetch(new URL("/me", AUTH_SERVER), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as AuthUser;
}

/** 受保护接口调用示例，界面上用来验证"鉴权确实能用" */
export async function callProtectedApi(): Promise<{
  ok: boolean;
  data: unknown;
}> {
  const accessToken = await ensureAccessToken();
  if (!accessToken) return { ok: false, data: "尚未登录或登录已过期" };

  const res = await fetch(new URL("/me", AUTH_SERVER), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return { ok: res.ok, data: await res.json().catch(() => null) };
}

export async function logout(): Promise<void> {
  await clearCredentials();
}

/**
 * 完整登录流程。resolve 时 token 已经落盘；抛错表示登录失败/被拒绝/超时。
 */
export async function performLogin(): Promise<AuthUser> {
  const { codeVerifier, codeChallenge } = await generatePkcePair();
  const state = randomUrlSafe(16);

  let resolveCallback!: (url: URL) => void;
  const callbackPromise = new Promise<URL>((res) => {
    resolveCallback = res;
  });

  // port: 0 让系统随机分配端口，避免和其他程序冲突；
  // 服务器只为了接住这一次回调，拿到后立刻关掉。
  //
  // 注意：这里不自己渲染成功页，而是 302 回登录站点的 /oauth/done。
  // 这样浏览器地址栏最终停留在正式域名上，127.0.0.1 只在跳转链里闪一下，
  // 用户看到的是"自家网站"，不会觉得突然冒出个本地地址。
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== "/callback")
        return new Response("Not found", { status: 404 });

      // 稍等一下再 resolve：resolve 之后 performLogin 会 server.stop()，
      // 延后一点能确保这个 302 已经写回浏览器，不会被关服务器打断。
      setTimeout(() => resolveCallback(url), 50);

      const error = url.searchParams.get("error");
      const done = new URL("/oauth/done", WEB_ORIGIN);
      done.searchParams.set(
        "status",
        error === "access_denied" ? "denied" : error ? "error" : "ok"
      );
      return new Response(null, {
        status: 302,
        headers: { location: done.toString() },
      });
    },
  });
  const redirectUri = `http://127.0.0.1:${server.port}/callback`;

  const authorizeUrl = new URL("/oauth/authorize", AUTH_SERVER);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", SCOPE);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  console.log(`[auth] 调起浏览器登录：${authorizeUrl.toString()}`);
  openBrowser(authorizeUrl.toString());

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("登录超时（5 分钟），请重试")),
      LOGIN_TIMEOUT_MS
    );
  });

  let callbackUrl: URL;
  try {
    callbackUrl = await Promise.race([callbackPromise, timeout]);
  } finally {
    clearTimeout(timer);
    server.stop();
  }

  const error = callbackUrl.searchParams.get("error");
  if (error)
    throw new Error(
      error === "access_denied"
        ? "你在浏览器里拒绝了授权"
        : `登录失败：${error}`
    );

  if (callbackUrl.searchParams.get("state") !== state) {
    throw new Error("state 不匹配，可能存在 CSRF 风险，已中止登录");
  }

  const code = callbackUrl.searchParams.get("code");
  if (!code) throw new Error("回调中没有拿到授权码");

  const creds = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
    code_verifier: codeVerifier,
  });
  await saveCredentials(creds);

  const user = await fetchCurrentUser();
  if (!user) throw new Error("拿到 token 但读取用户信息失败");
  return user;
}

/** 应用启动时的状态探测：本地有可用 token 就算已登录 */
export async function readAuthState(): Promise<AuthState> {
  const user = await fetchCurrentUser();
  return { status: user ? "loggedIn" : "loggedOut", user, error: null };
}

/* ------------------------------------------------------------------ */
/*  后台自动续期                                                        */
/* ------------------------------------------------------------------ */

/** 每分钟检查一次。用轮询而不是一个长 setTimeout：电脑睡眠时定时器不推进，
 *  轮询能在唤醒后立刻发现"已经快过期了"并补上刷新。 */
const AUTO_REFRESH_CHECK_MS = 60_000;
/** 距离 access token 过期还有这么久时就提前刷新 */
const REFRESH_AHEAD_MS = 5 * 60 * 1000;

/**
 * 启动后台自动续期，让桌面端登录态尽量不过期。
 *
 * 服务端是 refresh token 旋转策略：每次刷新都会发一个新的 refresh token，
 * 有效期重新算 30 天。所以只要应用保持运行、每隔不到 30 天刷新一次，
 * 登录态就会一直向后滚动，不需要用户再登录。
 *
 * 反过来说，应用连续关闭超过 refresh token 有效期（默认 30 天）后再打开，
 * 仍然需要重新走一次浏览器登录——这是设计使然，不是 bug。
 *
 * @param onCredentialsLost refresh token 被服务器判定失效时回调（用于把界面切回未登录）
 * @returns 停止续期的函数
 */
export function startTokenAutoRefresh(
  onCredentialsLost: () => void
): () => void {
  const timer = setInterval(async () => {
    try {
      const creds = await loadCredentials();
      if (!creds) return; // 没登录，无需续期
      if (creds.expiresAt - REFRESH_AHEAD_MS > Date.now()) return; // 还早

      await refreshTokens(creds.refreshToken);
      console.log("[auth] access token 已自动续期");
    } catch (err) {
      if (err instanceof TokenError && !err.fatal) {
        // 断网 / 服务端 5xx：留着凭证，下一轮再试
        console.warn(`[auth] 自动续期暂时失败，稍后重试：${err.message}`);
        return;
      }
      console.warn(
        `[auth] 自动续期失败，需要重新登录：${(err as Error).message}`
      );
      await clearCredentials().catch(() => {});
      onCredentialsLost();
    }
  }, AUTO_REFRESH_CHECK_MS);

  return () => clearInterval(timer);
}
