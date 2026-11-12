import { useEffect, useState, useSyncExternalStore } from "react";
import {
  authApi,
  getAuthSnapshot,
  subscribeAuth,
  syncAuthState,
} from "./auth-store";

function App() {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot);
  const [apiResult, setApiResult] = useState<string | null>(null);

  // 启动时同步一次主进程里的鉴权状态（本地有有效 token 就直接是已登录）
  useEffect(() => {
    syncAuthState().catch((err: Error) =>
      console.error("同步鉴权状态失败", err)
    );
  }, []);

  const callApi = async () => {
    setApiResult("请求中…");
    const res = await authApi.callProtectedApi();
    setApiResult(
      `${res.ok ? "成功" : "失败"}：${JSON.stringify(res.data, null, 2)}`
    );
  };

  const signOut = async () => {
    setApiResult(null);
    await authApi.logout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-indigo-900 text-gray-900">
      <div className="container mx-auto px-4 py-16 max-w-xl">
        <h1 className="text-4xl font-bold text-center text-white mb-2">
          OAuth2 桌面端示例
        </h1>
        <p className="text-center text-white/80 mb-10">
          点击登录 → 系统浏览器完成登录 → 授权自动带回本应用
        </p>

        {auth.status === "loggedIn" && auth.user ? (
          <div className="bg-white rounded-xl shadow-xl p-8">
            <h2 className="text-xl font-semibold text-indigo-600 mb-4">
              已登录
            </h2>
            <dl className="text-gray-700 space-y-1 mb-6">
              <div>
                <span className="text-gray-500">名称：</span>
                {auth.user.name}
              </div>
              <div>
                <span className="text-gray-500">邮箱：</span>
                {auth.user.email}
              </div>
            </dl>
            <div className="flex gap-3">
              <button
                onClick={callApi}
                className="px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                调用受保护接口 /me
              </button>
              <button
                onClick={signOut}
                className="px-5 py-2.5 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
              >
                退出登录
              </button>
            </div>
            {apiResult && (
              <pre className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-auto whitespace-pre-wrap">
                {apiResult}
              </pre>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-xl p-8 text-center">
            <h2 className="text-xl font-semibold text-indigo-600 mb-4">
              {auth.status === "loggingIn" ? "等待浏览器完成登录…" : "未登录"}
            </h2>
            {auth.status === "loggingIn" ? (
              <p className="text-gray-600">
                已在系统浏览器中打开登录页。完成登录并授权后，本应用会自动拿到凭证。
              </p>
            ) : (
              <>
                <p className="text-gray-600 mb-6">
                  需要登录后才能访问服务端接口。
                </p>
                {auth.error && (
                  <p className="text-red-600 text-sm mb-4">{auth.error}</p>
                )}
                <button
                  onClick={() => authApi.startLogin()}
                  className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
                >
                  使用浏览器登录
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
