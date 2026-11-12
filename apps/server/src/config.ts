/**
 * 全局配置。生产环境请把 SESSION_SECRET 等敏感值放到环境变量里。
 */

export const config = {
  // 会话 Cookie 名称（浏览器里保存"用户是否已登录该网站"的状态）
  sessionCookieName: "oauth_session",

  // 远程登录站点（web 工程）的地址。
  // 登录页 / 授权同意页都由它渲染，认证服务器只提供 JSON 接口和 302 跳转。
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5174",

  // 签发 access token / 会话时使用的 HMAC 密钥。
  // 生产环境务必换成随机的高熵字符串，并通过环境变量注入。
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-secret-change-me",

  // access token 有效期（秒）
  accessTokenTtlSec: 60 * 60, // 1 小时

  // refresh token 有效期（秒）
  refreshTokenTtlSec: 60 * 60 * 24 * 30, // 30 天

  // 授权码有效期（秒），授权码本身应该很短命
  authCodeTtlSec: 60,

  // 登录会话（浏览器 Cookie）有效期
  loginSessionTtlSec: 60 * 60 * 24 * 7, // 7 天
};

/**
 * 已注册的 OAuth 客户端。
 *
 * 本地/桌面应用属于"公开客户端"(public client)：没有能力安全保存 client secret，
 * 所以不要求 client_secret，而是强制要求 PKCE（code_challenge / code_verifier）来防止
 * 授权码被截获后被冒用。
 *
 * redirectUriAllowlist 支持:
 *  - 精确匹配的 URL
 *  - 用 "*" 通配端口号，表示"回环地址 + 任意端口"，
 *    因为本地应用每次启动监听的端口通常是随机分配的。
 *    例如 http://127.0.0.1:[任意端口]/callback
 */
export interface ClientDef {
  clientId: string;
  name: string;
  redirectUriAllowlist: string[];
  requirePkce: boolean;
}

export const registeredClients: Record<string, ClientDef> = {
  "local-desktop-app": {
    clientId: "local-desktop-app",
    name: "My Local App",
    redirectUriAllowlist: [
      "http://127.0.0.1:*/callback",
      "http://localhost:*/callback",
    ],
    requirePkce: true,
  },
};

function escapeRegExp(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/** 校验某个 redirect_uri 是否被该 client 允许使用（含回环地址通配端口） */
export function isRedirectUriAllowed(
  client: ClientDef,
  redirectUri: string
): boolean {
  return client.redirectUriAllowlist.some((pattern) => {
    if (!pattern.includes("*")) return pattern === redirectUri;
    // 按 "*" 切分后分别转义，再用 "任意数字端口" 的正则拼回去，
    // 例如 "http://127.0.0.1:*/callback" -> /^http:\/\/127\.0\.0\.1:\d+\/callback$/
    const regexStr = pattern.split("*").map(escapeRegExp).join("\\d+");
    return new RegExp(`^${regexStr}$`).test(redirectUri);
  });
}
