import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { config, registeredClients, isRedirectUriAllowed } from "../config";
import { getLoginSession, savePendingAuthorization } from "../store";

export const authorizeRoutes = new Hono();

/** 跳到远程登录站点（web 工程）的某个页面 */
function webPage(path: string, params: Record<string, string>): string {
  const url = new URL(path, config.webOrigin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * 第一步：桌面应用打开系统浏览器访问这个地址。
 * 例：
 * http://localhost:8787/oauth/authorize
 *   ?response_type=code
 *   &client_id=local-desktop-app
 *   &redirect_uri=http://127.0.0.1:51234/callback
 *   &scope=profile
 *   &state=xxxx
 *   &code_challenge=xxxx
 *   &code_challenge_method=S256
 *
 * 这里只做参数校验 + 暂存授权请求，页面全部交给 web 工程渲染。
 */
authorizeRoutes.get("/oauth/authorize", (c) => {
  const {
    response_type,
    client_id,
    redirect_uri,
    scope = "",
    state = "",
    code_challenge,
    code_challenge_method,
  } = c.req.query();

  const fail = (message: string) =>
    c.redirect(webPage("/oauth/error", { message }));

  if (response_type !== "code") return fail("仅支持 response_type=code");

  const client = client_id ? registeredClients[client_id] : undefined;
  if (!client) return fail("未知的 client_id");

  if (!redirect_uri || !isRedirectUriAllowed(client, redirect_uri)) {
    return fail("redirect_uri 不在该客户端的白名单内");
  }
  if (
    client.requirePkce &&
    (!code_challenge || code_challenge_method !== "S256")
  ) {
    return fail(
      "该客户端要求使用 PKCE（需要 code_challenge 与 code_challenge_method=S256）"
    );
  }

  const pending = savePendingAuthorization({
    clientId: client.clientId,
    redirectUri: redirect_uri,
    scope,
    state,
    codeChallenge: code_challenge!,
    codeChallengeMethod: "S256",
  });

  const sessionId = getCookie(c, config.sessionCookieName);
  const session = sessionId ? getLoginSession(sessionId) : null;

  // 未登录 -> 登录页；已登录 -> 直接到授权同意页
  return c.redirect(
    webPage(session ? "/oauth/consent" : "/login", { pending_id: pending.id })
  );
});
