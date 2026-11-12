import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const rootEl = document.getElementById("root")!;
let mounted = false;

/**
 * 把致命错误直接画到页面上。
 * webview 里模块顶层抛错时，界面就是一片纯白，不翻 devtools 根本不知道发生了什么。
 *
 * 只在 React 还没挂载成功时才接管 #root —— 挂载之后的运行时错误
 * （比如某次 RPC 超时）不能把整个界面顶掉。
 */
function renderFatal(message: string) {
  if (mounted) {
    console.error("[mainview] 运行时错误:", message);
    return;
  }
  const escape = (s: string) =>
    s.replace(
      /[<>&]/g,
      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!)
    );
  rootEl.innerHTML = `
		<div style="font-family:-apple-system,sans-serif;padding:32px;color:#b91c1c">
			<h2 style="margin:0 0 12px">界面加载失败</h2>
			<pre style="white-space:pre-wrap;background:#fef2f2;padding:16px;border-radius:8px;font-size:13px">${escape(
        message
      )}</pre>
		</div>`;
}

window.addEventListener("error", (e) =>
  renderFatal(`${e.message}\n${e.error?.stack ?? ""}`)
);
window.addEventListener("unhandledrejection", (e) =>
  renderFatal(`未处理的 Promise 拒绝：${String(e.reason)}`)
);

// 样式表加载失败在 views:// 这类自定义 scheme 下是个真实故障，
// 但资源错误不会冒泡到 window，只能在捕获阶段拿到，所以单独记一笔。
window.addEventListener(
  "error",
  (e) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "LINK" || el.tagName === "SCRIPT")) {
      console.error(
        `[mainview] 资源加载失败: ${
          el.getAttribute("href") ?? el.getAttribute("src")
        }`
      );
    }
  },
  true
);

try {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  mounted = true;
} catch (err) {
  renderFatal((err as Error).stack ?? String(err));
}
