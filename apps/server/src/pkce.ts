/**
 * PKCE (Proof Key for Code Exchange, RFC 7636)
 *
 * 流程：
 *  1. 客户端生成随机 code_verifier，计算 code_challenge = BASE64URL(SHA256(code_verifier))
 *  2. /authorize 请求带上 code_challenge，服务端把它和授权码绑定存起来
 *  3. /token 换取阶段，客户端把原始 code_verifier 发过来
 *  4. 服务端重新计算 SHA256(code_verifier) 并与之前存的 code_challenge 比较
 *
 * 这样即使授权码在回调过程中被截获，攻击者没有 code_verifier 也无法换取 token。
 */

export async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest).toString("base64url");
}

export async function verifyPkce(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  if (!codeVerifier) return false;
  const computed = await sha256Base64Url(codeVerifier);
  return computed === codeChallenge;
}
