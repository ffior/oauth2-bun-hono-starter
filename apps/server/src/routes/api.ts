import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { config, registeredClients } from "../config";
import {
  createAuthorizationCode,
  createLoginSession,
  consumePendingAuthorization,
  db,
  getLoginSession,
  getPendingAuthorization,
  getUserByEmail,
  createUser,
  verifyPassword,
} from "../store";

/**
 * 给 web 工程（远程登录站点）用的 JSON 接口。
 * 所有请求都要带 Cookie（fetch 里 credentials: "include"）。
 */
export const apiRoutes = new Hono();

function currentUser(c: Context) {
  const sessionId = getCookie(c, config.sessionCookieName);
  const session = sessionId ? getLoginSession(sessionId) : null;
  if (!session) return null;
  return db.users.get(session.userId) ?? null;
}

/** 当前浏览器会话对应的用户（未登录返回 user: null） */
apiRoutes.get("/api/session", (c) => {
  const user = currentUser(c);
  return c.json({
    user: user ? { id: user.id, email: user.email, name: user.name } : null,
  });
});

/** 授权请求详情：登录页 / 同意页需要展示"哪个应用要什么权限" */
apiRoutes.get("/api/authorization/:pendingId", (c) => {
  const pending = getPendingAuthorization(c.req.param("pendingId"));
  if (!pending) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "授权请求已过期，请回到应用重新发起登录",
      },
      404
    );
  }
  const client = registeredClients[pending.clientId];
  const user = currentUser(c);

  return c.json({
    pendingId: pending.id,
    appName: client?.name ?? pending.clientId,
    scope: pending.scope,
    user: user ? { id: user.id, email: user.email, name: user.name } : null,
  });
});

/** 登录：建立浏览器会话 Cookie（与签发给应用的 access token 完全无关） */
apiRoutes.post("/api/login", async (c) => {
  const { email, password } = (await c.req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const mail = (email ?? "").trim();
  const pass = password ?? "";

  if (!mail || !pass) {
    return c.json(
      { error: "invalid_request", error_description: "请输入邮箱和密码" },
      400
    );
  }

  // 演示用：账号不存在则自动注册，方便直接跑通整个流程。
  // 生产环境请替换成真实的注册/登录逻辑。
  let user: Awaited<ReturnType<typeof verifyPassword>>;
  if (getUserByEmail(mail)) {
    user = await verifyPassword(mail, pass);
    if (!user) {
      return c.json(
        { error: "invalid_credentials", error_description: "邮箱或密码错误" },
        401
      );
    }
  } else {
    user = await createUser(mail, pass, mail.split("@")[0] ?? mail);
  }

  const session = createLoginSession(user.id);
  setCookie(c, config.sessionCookieName, session.id, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: config.loginSessionTtlSec,
  });

  return c.json({ user: { id: user.id, email: user.email, name: user.name } });
});

/** 退出网站登录态（不影响已经签发出去的 access token） */
apiRoutes.post("/api/logout", (c) => {
  const sessionId = getCookie(c, config.sessionCookieName);
  if (sessionId) db.loginSessions.delete(sessionId);
  deleteCookie(c, config.sessionCookieName, { path: "/" });
  return c.json({ ok: true });
});

/**
 * 用户在同意页点了"允许"/"拒绝"。
 * 服务端签发授权码，并把"该跳去哪"告诉前端，由前端 location.href 过去
 * （目标是桌面应用在 127.0.0.1 上监听的回调地址）。
 */
apiRoutes.post("/api/consent", async (c) => {
  const { pending_id, decision } = (await c.req.json().catch(() => ({}))) as {
    pending_id?: string;
    decision?: string;
  };

  const pending = pending_id ? getPendingAuthorization(pending_id) : null;
  if (!pending) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "授权请求已过期，请回到应用重新发起登录",
      },
      400
    );
  }

  const user = currentUser(c);
  if (!user) return c.json({ error: "login_required" }, 401);

  const callback = new URL(pending.redirectUri);
  consumePendingAuthorization(pending.id);

  if (decision !== "allow") {
    callback.searchParams.set("error", "access_denied");
    if (pending.state) callback.searchParams.set("state", pending.state);
    return c.json({ redirectTo: callback.toString() });
  }

  const authCode = createAuthorizationCode({
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    userId: user.id,
    scope: pending.scope,
    codeChallenge: pending.codeChallenge,
    codeChallengeMethod: pending.codeChallengeMethod,
  });

  // 授权码 + state 一起带回桌面应用监听的回调地址
  callback.searchParams.set("code", authCode.code);
  if (pending.state) callback.searchParams.set("state", pending.state);
  return c.json({ redirectTo: callback.toString() });
});
