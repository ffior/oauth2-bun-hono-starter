import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * 产物是通过 electrobun 的 views:// 自定义协议加载的，不是 http。
 * vite 默认给 <script> / <link> 加 crossorigin，在自定义协议下会让
 * 样式表的 CORS 检查失败——结果是 DOM 正常渲染但一点样式都没有（看着像白屏）。
 * 这里把它去掉。
 */
function stripCrossorigin() {
    return {
        name: "strip-crossorigin",
        transformIndexHtml(html: string) {
            return html.replace(/\s+crossorigin(=(["']).*?\2)?/g, "");
        },
    };
}

export default defineConfig({
    // 用相对路径，避免 /assets/... 在 views://mainview/ 下被解析到错误的位置
    base: "./",
    plugins: [react(), tailwindcss(), stripCrossorigin()],
    root: "src/mainview",
    build: {
        outDir: "../../dist",
        emptyOutDir: true,
        // 自定义协议下 modulepreload 的 link 同样会带 crossorigin，直接关掉
        modulePreload: false,
    },
    server: {
        port: 5173,
        strictPort: true,
    },
});
