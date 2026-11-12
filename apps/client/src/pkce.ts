/** 生成 PKCE 用的 code_verifier / code_challenge，以及防 CSRF 的 state */

function randomUrlSafe(bytes: number): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

export async function generatePkcePair() {
  // RFC 7636 建议 code_verifier 长度在 43~128 字符之间
  const codeVerifier = randomUrlSafe(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = Buffer.from(digest).toString("base64url");
  return { codeVerifier, codeChallenge };
}

export function generateState(): string {
  return randomUrlSafe(16);
}
