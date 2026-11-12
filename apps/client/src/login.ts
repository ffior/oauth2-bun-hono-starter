import { generatePkcePair, generateState } from "./pkce";
import { openBrowser } from "./open-browser";
import { saveCredentials } from "./token-store";

const AUTH_SERVER = process.env.AUTH_SERVER ?? "http://localhost:8787";
const CLIENT_ID = "local-desktop-app";
const SCOPE = "profile";

async function main() {
  const { codeVerifier, codeChallenge } = await generatePkcePair();
  const state = generateState();

  // 1. 在 127.0.0.1 上起一个只服务一次请求的临时 HTTP 服务器，
  //    端口交给操作系统随机分配（port: 0），避免和其他程序冲突。
  let resolve!: (url: URL) => void;
  const callbackPromise = new Promise<URL>((res) => {
    resolve = res;
  });

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/callback") {
        resolve(url);
        return new Response(
          `<html><body style="font-family:sans-serif;text-align:center;margin-top:20vh">
             <h2>登录成功 ✅</h2><p>可以关闭这个标签页，回到应用继续操作。</p>
           </body></html>`,
          { headers: { "content-type": "text/html; charset=utf-8" } }
        );
      }
      return new Response("Not found", { status: 404 });
    },
  });

  const redirectUri = `http://127.0.0.1:${server.port}/callback`;

  // 2. 拼出授权地址，打开系统浏览器
  const authorizeUrl = new URL("/oauth/authorize", AUTH_SERVER);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", SCOPE);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  console.log("正在打开浏览器完成登录…\n若没有自动打开，请手动访问：\n" + authorizeUrl.toString() + "\n");
  await openBrowser(authorizeUrl.toString());

  // 3. 等待浏览器把授权码回调到本地服务器（设置超时避免一直挂着）
  const timeout = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error("登录超时（5 分钟），请重试")), 5 * 60 * 1000)
  );
  const callbackUrl = await Promise.race([callbackPromise, timeout]).finally(() => {
    server.stop();
  });

  const returnedState = callbackUrl.searchParams.get("state");
  const error = callbackUrl.searchParams.get("error");
  const code = callbackUrl.searchParams.get("code");

  if (error) {
    console.error(`登录被拒绝或失败：${error}`);
    process.exit(1);
  }
  if (returnedState !== state) {
    console.error("state 不匹配，可能存在 CSRF 风险，已中止登录。");
    process.exit(1);
  }
  if (!code) {
    console.error("回调中没有拿到 code。");
    process.exit(1);
  }

  // 4. 用授权码 + code_verifier 向服务器换取 access_token / refresh_token
  const tokenRes = await fetch(new URL("/oauth/token", AUTH_SERVER), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    console.error("换取 token 失败：", await tokenRes.text());
    process.exit(1);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  await saveCredentials({
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
    scope: tokenData.scope,
  });

  console.log("登录成功！token 已保存到本地。");
  console.log("运行 `bun run whoami` 查看当前登录用户。");
}

main().catch((err) => {
  console.error("登录失败：", err.message ?? err);
  process.exit(1);
});
