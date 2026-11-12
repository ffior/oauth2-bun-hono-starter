# 桌面应用 OAuth2 登录示例（Figma 风格）

模拟 Figma 桌面客户端那种"点击登录 → 打开系统浏览器 → 登录后自动回到应用"的机制。
采用标准的 **Authorization Code + PKCE** 流程，桌面应用作为"公开客户端"（不保存
client secret），靠 PKCE 防止授权码在回调过程中被截获后被冒用。

## 四个工程的分工

- **`server/`** — 认证 + 资源服务器（Bun + Hono，`http://localhost:8787`）。
  只提供 JSON 接口和 302 跳转，**不再渲染任何页面**。
- **`web/`** — 远程登录站点（Vite+ / React / antd，`http://localhost:5174`）。
  登录页、授权同意页、错误页都在这里（原来 `server/src/templates.ts` 的内容已迁移过来）。
- **`desktop/`** — 桌面应用（Electrobun，类似 Figma 本地客户端）。
  bun 主进程负责 token 落盘、调起浏览器、接住回调；界面通过 RPC 请求主进程。
- **`client/`** — 同一套流程的**命令行版本**，用来在不启动桌面 GUI 的情况下
  快速验证服务端是否正常（`bun run login` / `whoami` / `logout`）。
  它和 `desktop/` 是两个独立客户端，各自存自己的凭证文件，可以并存。

## 完整流程

```
桌面应用（desktop，bun 主进程）
 1. 启动时读本地 credentials.json，尝试用 token 调 /me
    → 成功：直接进入已登录界面，流程结束
    → 失败/没有 token：显示"未登录"，等用户点登录

 2. 用户点击登录：
    生成 PKCE(code_verifier/code_challenge) + 随机 state
    在 127.0.0.1 起一个临时 HTTP 服务器（端口由系统随机分配），只等一次 /callback

 3. 调起系统浏览器访问认证服务器：
    GET  server:8787/oauth/authorize?response_type=code&client_id=...
         &redirect_uri=http://127.0.0.1:<随机端口>/callback
         &state=...&code_challenge=...&code_challenge_method=S256

浏览器（web 站点）
 4. server 校验参数后暂存授权请求，302 到 web:5174/login?pending_id=xxx
 5. 用户输入邮箱密码 → POST server:8787/api/login → 建立 oauth_session Cookie
 6. 跳到 web:5174/oauth/consent?pending_id=xxx，用户点"允许"
    → POST server:8787/api/consent → 服务端签发授权码，返回 redirectTo
 7. 浏览器 location.replace(redirectTo)，即
    http://127.0.0.1:<随机端口>/callback?code=...&state=...
    桌面端接住后立刻 302 到 web:5174/oauth/done
    → 地址栏最终停在正式域名上，127.0.0.1 只在跳转链里闪一下

桌面应用（desktop，bun 主进程）
 8. 临时服务器收到回调，校验 state，拿到 code，关掉服务器
 9. 直接（不经浏览器）POST server:8787/oauth/token，带 code + code_verifier
    换到 access_token / refresh_token，写入本地 credentials.json
10. 之后所有业务请求都带 Authorization: Bearer <access_token>
    （access token 过期时自动用 refresh token 换新的）
```

关键点：**授权码走浏览器，token 不走浏览器**。第 9 步是应用直接和服务器通信，
所以 token 不会出现在跳转 URL 或浏览器历史里。

## 运行方式

需要同时起三个进程（server / web / desktop）：

```bash
# 终端 1：认证服务器  http://localhost:8787
cd server && bun install && bun run dev

# 终端 2：登录站点    http://localhost:5174
cd web && pnpm install && pnpm dev

# 终端 3：桌面应用（带界面热更新）
cd desktop && bun install && bun run dev:hmr
```

端口约定：`web` 用 5174，5173 留给 `desktop` 自己的 HMR 服务，不要弄反。

不想开 GUI 时，用命令行客户端验证服务端：

```bash
cd client && bun install
bun run login    # 打开浏览器走完整流程，token 存到 ~/.local-desktop-app-demo/
bun run whoami   # 用保存的 token 调 /me（过期自动刷新）
bun run logout   # 清除本地凭证
```

演示环境的登录页支持"邮箱不存在则自动注册"，方便直接跑通整个流程。

## 环境变量

- `server`：`PORT`（默认 8787）、`WEB_ORIGIN`（默认 `http://localhost:5174`，
  同时作为 `/api/*` 的 CORS 白名单）、`SESSION_SECRET`
- `web`：`VITE_AUTH_SERVER`（默认 `http://localhost:8787`）
- `desktop`：`AUTH_SERVER`（默认 `http://localhost:8787`）、
  `WEB_ORIGIN`（默认 `http://localhost:5174`，回调后 302 回它的 `/oauth/done`）
- `client`：`AUTH_SERVER`（默认 `http://localhost:8787`）

## 主要接口

- `GET  /oauth/authorize` — 校验参数、暂存授权请求，302 到 web 的登录页/同意页
- `GET  /api/session` — 当前浏览器登录态
- `GET  /api/authorization/:pendingId` — 授权请求详情（哪个应用、要什么权限）
- `POST /api/login` / `POST /api/logout` — 网站登录态（Cookie）
- `POST /api/consent` — 签发授权码，返回要跳转的本地回调地址
- `POST /oauth/token` — 授权码换 token / refresh token 旋转
- `GET  /me` — 受保护接口示例（`Authorization: Bearer <access_token>`）

## 桌面端 bun 主进程 ↔ 界面

界面（webview）不能碰文件系统、也不能起本地服务器，所有鉴权动作都在 bun 主进程：

- 契约定义在 `desktop/src/shared/auth-rpc.ts`
- 主进程实现：`desktop/src/bun/auth.ts` + `desktop/src/bun/index.ts`
- 界面侧状态源：`desktop/src/mainview/auth-store.ts`

`startLogin` 会立刻返回（登录可能要几分钟），进展通过 `authStateChanged`
消息推给界面，避免把整个浏览器登录过程挂在一次 RPC 请求上。

## 桌面端登录态如何保持不过期

- **被动刷新**：每次要用 access token 前先看剩余有效期，不足 30 秒就先刷新
  （`ensureAccessToken`）。
- **主动续期**：`startTokenAutoRefresh` 每分钟检查一次，距 access token 过期
  不足 5 分钟就提前换新的。用轮询而不是一个长 `setTimeout`，是因为电脑睡眠时
  定时器不推进，轮询能在唤醒后立刻补上。
- **为什么这样就不会过期**：服务端是 refresh token 旋转策略，每次刷新都会发
  一个新的 refresh token 并重新计算 30 天有效期。只要应用保持运行，这个窗口
  就一直向后滚动。反之，应用连续关闭超过 30 天后再打开，仍然要重新登录。
- **并发刷新去重**：旋转策略下，两个请求同时刷新会导致后一个用到已作废的
  refresh token 从而把用户误登出，所以同一时刻只允许一个 refresh 在飞。
- **临时故障不清凭证**：断网或服务端 5xx 时保留本地凭证下轮重试，
  只有服务器明确返回 4xx（`invalid_grant`）才清除并要求重新登录。

## 安全要点

- **PKCE 强制启用**：`server/src/config.ts` 里 `requirePkce: true`，
  `/oauth/authorize` 和 `/oauth/token` 都会校验。
- **redirect_uri 白名单**：支持 `http://127.0.0.1:*/callback` 这种
  回环地址 + 任意端口的写法（本地应用每次监听的端口是随机的）。
  回环回调是 RFC 8252（OAuth 2.0 for Native Apps）§7.3 推荐给原生应用的做法，
  Figma / VS Code / gcloud / GitHub Desktop 都是这么干的；不要换成自定义
  端口的固定值，也不要用 `localhost` 之外的主机名。
  为了不让用户看到 `127.0.0.1`，桌面端收到回调后会立刻 302 回 web 的
  `/oauth/done`，地址栏最终停在正式域名上。
- **授权码只能用一次且短命**（默认 60 秒）。校验顺序是先做完 client_id /
  redirect_uri / PKCE 全部校验，最后才"烧掉"授权码，避免参数写错就误销毁。
- **state 校验**：桌面端比对回调里的 state，防 CSRF。
- **refresh token 旋转**：每次刷新后旧的立即失效。
- **登录会话与 OAuth token 分离**：浏览器的 `oauth_session` Cookie 只代表
  "网站记住你已登录"，和签发给应用的 access token 是两套独立凭证。
- **CORS 收紧到具体 origin**：`/api/*` 只允许 `WEB_ORIGIN` 且 `credentials: true`
  （带 Cookie 的跨源请求不允许用 `*`）。

## 生产环境需要替换的部分

- `server/src/store.ts` 用的是进程内 `Map`，重启即丢失，需要换成数据库。
- 登录页的"邮箱不存在自动注册"仅为演示，生产要走正规注册/找回密码流程。
- `config.sessionSecret` 目前是占位符，务必通过环境变量注入高熵密钥。
- 桌面端 token 现在是明文存在 `~/.oauth2-desktop-demo/credentials.json`，
  生产环境应该放进系统钥匙串（Keychain / Credential Manager / libsecret）。
- 建议给 `/api/login` 和 `/oauth/token` 加速率限制。
- 生产环境全站 HTTPS，Cookie 需要加 `Secure`。
