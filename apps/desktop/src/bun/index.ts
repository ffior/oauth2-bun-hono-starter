import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import type { AuthState, AuthRPCSchema } from "../shared/auth-rpc";
import {
  callProtectedApi,
  logout as clearLocalTokens,
  performLogin,
  readAuthState,
  startTokenAutoRefresh,
} from "./auth";

const pkg = await import("../../package.json");
const version: string = pkg.default.version;

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support."
      );
    }
  }
  return "views://mainview/index.html";
}

// Auto-update: check → prompt → download → apply
async function checkAndApplyUpdate(): Promise<void> {
  const channel = await Updater.localInfo.channel();

  // Skip updates in dev channel
  if (channel === "dev") {
    console.log("[updater] Dev channel — skipping update check.");
    return;
  }

  console.log("[updater] Checking for updates...");

  try {
    const result = await Updater.checkForUpdate();
    console.log(
      `[updater] Current: ${result.version} (${result.hash}), updateAvailable: ${result.updateAvailable}`
    );

    if (!result.updateAvailable) {
      console.log("[updater] App is up to date.");
      return;
    }

    // Prompt user before downloading
    const currentVersion = await Updater.localInfo.version();
    const { response } = await Utils.showMessageBox({
      type: "question",
      title: "发现新版本",
      message: `新版本 ${result.version} 已发布`,
      detail: `当前版本：${currentVersion}\n新版本：${result.version}\n\n是否立即下载并安装？安装完成后应用将自动重启。`,
      buttons: ["立即更新", "稍后再说"],
      defaultId: 0,
      cancelId: 1,
    });

    if (response !== 0) {
      console.log("[updater] User deferred update.");
      return;
    }

    // Subscribe to status events for progress logging
    Updater.onStatusChange((entry) => {
      const { status, message, details } = entry;
      if (details?.progress !== undefined) {
        console.log(
          `[updater] ${status}: ${message} (${Math.round(
            details.progress * 100
          )}%)`
        );
      } else {
        console.log(`[updater] ${status}: ${message}`);
      }
    });

    console.log("[updater] Downloading update...");
    await Updater.downloadUpdate();

    console.log("[updater] Applying update and restarting...");
    await Updater.applyUpdate();
  } catch (err) {
    console.error("[updater] Update failed:", err);
  } finally {
    Updater.onStatusChange(null);
  }
}

// Create the main application window
const url = await getMainViewUrl();

/* ------------------------------------------------------------------ */
/*  鉴权状态：唯一事实来源在主进程，界面只是它的投影                     */
/* ------------------------------------------------------------------ */

let authState: AuthState = { status: "loggedOut", user: null, error: null };

function setAuthState(next: AuthState) {
  authState = next;
  // 界面可能还没挂上 RPC（比如启动瞬间），送不出去就算了，
  // 界面挂载后会自己调一次 getAuthState 兜底。
  try {
    win.webview?.rpc?.send.authStateChanged(authState);
  } catch (err) {
    console.error("[auth] 推送状态到界面失败:", err);
  }
}

const rpc = BrowserView.defineRPC<AuthRPCSchema>({
  maxRequestTime: 30_000,
  handlers: {
    requests: {
      getAuthState: () => authState,

      startLogin: () => {
        if (authState.status === "loggingIn") return;
        setAuthState({ status: "loggingIn", user: null, error: null });

        // 不 await：调起浏览器后可能几分钟才回来，让请求先返回
        performLogin()
          .then((user) =>
            setAuthState({ status: "loggedIn", user, error: null })
          )
          .catch((err: Error) =>
            setAuthState({
              status: "loggedOut",
              user: null,
              error: err.message,
            })
          );
      },

      logout: async () => {
        await clearLocalTokens();
        setAuthState({ status: "loggedOut", user: null, error: null });
      },

      callProtectedApi: () => callProtectedApi(),
    },
  },
});

const win = new BrowserWindow({
  title: `OAuth2 Desktop Demo v${version}`,
  url,
  rpc,
  frame: {
    width: 900,
    height: 800,
    x: 400,
    y: 400,
  },
});

// 启动时先探一次本地 token：有效就直接是已登录态，无效才需要调起浏览器
setAuthState(await readAuthState());

console.log(`[auth] 启动状态: ${authState.status}`);

// 后台自动续期：只要应用在运行，登录态就会一直向后滚动，不用用户再登录。
// 只有服务器明确判定 refresh token 失效时，才把界面切回未登录。
startTokenAutoRefresh(() => {
  setAuthState({
    status: "loggedOut",
    user: null,
    error: "登录已过期，请重新登录",
  });
});

// Run update check after window is created (non-blocking)
checkAndApplyUpdate();
