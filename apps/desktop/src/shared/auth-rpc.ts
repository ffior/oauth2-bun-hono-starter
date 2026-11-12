/**
 * 桌面端 bun 主进程 <-> mainview（webview）之间的 RPC 契约。
 *
 * 所有涉及本地文件、起本地服务器、调起浏览器的能力都只能在 bun 侧做，
 * 界面（webview）通过这些方法请求主进程干活，并通过 authStateChanged 收到状态推送。
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthState {
  /** loggedOut: 未登录；loggingIn: 已调起浏览器，等待回调；loggedIn: 已拿到 token */
  status: "loggedOut" | "loggingIn" | "loggedIn";
  user: AuthUser | null;
  /** 最近一次登录失败的原因 */
  error: string | null;
}

export type AuthRPCSchema = {
  bun: {
    requests: {
      /** 读取当前鉴权状态（应用启动时调一次） */
      getAuthState: { params: void; response: AuthState };
      /**
       * 调起系统浏览器走 OAuth2 登录。
       * 立即返回，登录进展通过 authStateChanged 推给界面
       * （整个流程可能持续几分钟，不能挂在一次 RPC 请求上等）。
       */
      startLogin: { params: void; response: void };
      /** 清除本地 token */
      logout: { params: void; response: void };
      /** 带 access token 调用服务端受保护接口 /me，验证鉴权可用 */
      callProtectedApi: {
        params: void;
        response: { ok: boolean; data: unknown };
      };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      /** bun 侧状态变化时主动推给界面 */
      authStateChanged: AuthState;
    };
  };
};
