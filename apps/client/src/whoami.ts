import { loadCredentials, saveCredentials } from "./token-store";

const AUTH_SERVER = process.env.AUTH_SERVER ?? "http://localhost:8787";
const CLIENT_ID = "local-desktop-app";

async function refreshIfNeeded() {
  let creds = await loadCredentials();
  if (!creds) {
    console.error("尚未登录，请先运行 `bun run login`。");
    process.exit(1);
  }

  // access token 过期前 30 秒就主动刷新，避免请求中途失效
  if (creds.expiresAt - 30_000 < Date.now()) {
    const res = await fetch(new URL("/oauth/token", AUTH_SERVER), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
        client_id: CLIENT_ID,
      }),
    });
    if (!res.ok) {
      console.error("登录已过期，请重新运行 `bun run login`。");
      process.exit(1);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };
    creds = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };
    await saveCredentials(creds);
  }
  return creds;
}

async function main() {
  const creds = await refreshIfNeeded();
  const res = await fetch(new URL("/me", AUTH_SERVER), {
    headers: { authorization: `Bearer ${creds.accessToken}` },
  });
  if (!res.ok) {
    console.error("请求失败：", await res.text());
    process.exit(1);
  }
  console.log(await res.json());
}

main();
