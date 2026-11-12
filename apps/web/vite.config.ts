import { defineConfig } from "vite-plus";

import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],

    // 5173 留给 desktop 工程的 HMR 服务，这里用 5174。
    // 认证服务器的 WEB_ORIGIN / CORS 白名单需要与此一致。
    server: {
        port: 5174,
        strictPort: true,
    },
});
