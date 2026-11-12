import { Electroview } from "electrobun/view";
import type { AuthRPCSchema, AuthState } from "../shared/auth-rpc";

/**
 * 界面侧的鉴权状态源。
 *
 * 主进程（bun）是唯一事实来源：这里只保存一份副本，
 * 通过 authStateChanged 消息更新，并用 useSyncExternalStore 让组件订阅。
 */

let state: AuthState = { status: "loggedOut", user: null, error: null };
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  state = next;
  for (const listener of listeners) listener();
}

const rpc = Electroview.defineRPC<AuthRPCSchema>({
  maxRequestTime: 30_000,
  handlers: {
    messages: {
      authStateChanged: (next) => setState(next),
    },
  },
});

// 建立与 bun 主进程的通道。
//
// 注意：Electroview 的构造函数里有一句 window.__electrobun.receiveMessageFromBun = ...
// （编译产物里没有可选链），而 window.__electrobun 是 electrobun 的 preload 注入的。
// 页面刷新、打开 devtools 触发重载等情况下 preload 可能还没注入，这句就会抛
// TypeError；如果不接住，模块顶层求值失败 → React 根本不会挂载 → 整个窗口纯白屏。
// 所以这里必须容错：通道建不起来只是 RPC 不可用，界面照样要渲染出来。
let rpcError: string | null = null;
try {
  if (!window.__electrobun) {
    throw new Error(
      "window.__electrobun 不存在（electrobun preload 未注入），无法与主进程通信"
    );
  }
  new Electroview({ rpc });
} catch (err) {
  rpcError = (err as Error).message;
  console.error("[auth] 建立 RPC 通道失败:", err);
}

/** RPC 通道是否可用；不可用时界面需要给出提示，而不是静默失败 */
export function getRpcError(): string | null {
  return rpcError;
}

/** 调用主进程能力 */
export const authApi = rpc.request;

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthSnapshot(): AuthState {
  return state;
}

/** 界面挂载后主动拉一次，避免错过启动瞬间推送的状态 */
export async function syncAuthState(): Promise<void> {
  if (rpcError) return;
  setState(await authApi.getAuthState());
}
