import { Hono } from "hono";
import { registeredClients } from "../config";
import { config } from "../config";
import { peekAuthorizationCode, markAuthorizationCodeUsed, issueTokenPair, rotateRefreshToken } from "../store";
import { verifyPkce } from "../pkce";

export const tokenRoutes = new Hono();

/**
 * 第四步：本地应用监听到回调请求、拿到 code 后，
 * 用 code + code_verifier 向这个接口换取 access_token / refresh_token。
 *
 * 这一步是"应用后台到服务器"的直接请求，不经过浏览器，所以拿到的 token
 * 不会像 code 那样暴露在跳转 URL / 浏览器历史里。
 */
tokenRoutes.post("/oauth/token", async (c) => {
  const body = await c.req.parseBody();
  const grantType = String(body.grant_type ?? "");

  if (grantType === "authorization_code") {
    const code = String(body.code ?? "");
    const redirectUri = String(body.redirect_uri ?? "");
    const clientId = String(body.client_id ?? "");
    const codeVerifier = String(body.code_verifier ?? "");

    const client = registeredClients[clientId];
    if (!client) return c.json({ error: "invalid_client" }, 400);

    const authCode = peekAuthorizationCode(code);
    if (!authCode) return c.json({ error: "invalid_grant", error_description: "code 无效、已使用或已过期" }, 400);

    if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
      return c.json({ error: "invalid_grant", error_description: "client_id 或 redirect_uri 不匹配" }, 400);
    }

    const pkceOk = await verifyPkce(codeVerifier, authCode.codeChallenge);
    if (!pkceOk) {
      return c.json({ error: "invalid_grant", error_description: "PKCE 校验失败" }, 400);
    }

    // 全部校验通过，此时才真正"烧掉"这个授权码，防止被重放
    markAuthorizationCodeUsed(code);

    const { accessToken, refreshToken } = issueTokenPair(clientId, authCode.userId, authCode.scope);
    return c.json({
      access_token: accessToken.token,
      token_type: "Bearer",
      expires_in: config.accessTokenTtlSec,
      refresh_token: refreshToken.token,
      scope: authCode.scope,
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(body.refresh_token ?? "");
    const clientId = String(body.client_id ?? "");
    const client = registeredClients[clientId];
    if (!client) return c.json({ error: "invalid_client" }, 400);

    const pair = rotateRefreshToken(refreshToken);
    if (!pair) return c.json({ error: "invalid_grant", error_description: "refresh_token 无效或已过期" }, 400);

    return c.json({
      access_token: pair.accessToken.token,
      token_type: "Bearer",
      expires_in: config.accessTokenTtlSec,
      refresh_token: pair.refreshToken.token,
      scope: pair.accessToken.scope,
    });
  }

  return c.json({ error: "unsupported_grant_type" }, 400);
});
