/**
 * 与认证服务器（server 工程）通信的封装。
 *
 * 注意：认证服务器和本站不同源，所有请求必须带上 credentials: 'include'，
 * 否则浏览器不会携带 / 保存 oauth_session Cookie。
 */

export const AUTH_SERVER =
  import.meta.env.VITE_AUTH_SERVER ?? "http://localhost:8787";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthorizationInfo {
  pendingId: string;
  appName: string;
  scope: string;
  user: SessionUser | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AUTH_SERVER}${path}`, {
    ...init,
    credentials: "include",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error_description?: string }).error_description ??
        `请求失败（${res.status}）`
    );
  }
  return data as T;
}

/** 读取授权请求详情（哪个应用、要什么权限、当前是否已登录） */
export function getAuthorization(pendingId: string) {
  return call<AuthorizationInfo>(
    `/api/authorization/${encodeURIComponent(pendingId)}`
  );
}

/** 当前浏览器登录态 */
export function getSession() {
  return call<{ user: SessionUser | null }>("/api/session");
}

export function login(email: string, password: string) {
  return call<{ user: SessionUser }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return call<{ ok: true }>("/api/logout", { method: "POST" });
}

/** 同意 / 拒绝授权，返回需要跳转的地址（桌面应用的本地回调地址） */
export function decideConsent(pendingId: string, decision: "allow" | "deny") {
  return call<{ redirectTo: string }>("/api/consent", {
    method: "POST",
    body: JSON.stringify({ pending_id: pendingId, decision }),
  });
}
