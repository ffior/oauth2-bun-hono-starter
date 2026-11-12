import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { config } from "./config";
import { authorizeRoutes } from "./routes/authorize";
import { apiRoutes } from "./routes/api";
import { tokenRoutes } from "./routes/token";
import { meRoutes } from "./routes/me";

const app = new Hono();

app.use("*", logger());

// 打印每个请求的请求头，方便排查 Cookie / CORS / Authorization 相关问题
app.use("*", async (c, next) => {
  console.log(
    `[headers] ${c.req.method} ${c.req.path}`,
    JSON.stringify(Object.fromEntries(c.req.raw.headers), null, 2)
  );
  await next();
});

// web 工程（登录站点）和本服务不同源，需要允许带 Cookie 的跨源请求。
// origin 必须写具体值（不能用 "*"），否则浏览器不会发送/接受 Cookie。
app.use(
  "/api/*",
  cors({
    origin: config.webOrigin,
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type"],
  })
);

// 桌面应用用 access token 调业务接口时不带 Cookie，放开来源即可
app.use("/me", cors({ origin: "*", allowHeaders: ["authorization"] }));

app.get("/", (c) =>
  c.text("OAuth2 auth server is running. See README for usage.")
);

app.route("/", authorizeRoutes);
app.route("/", apiRoutes);
app.route("/", tokenRoutes);
app.route("/", meRoutes);

const port = Number(process.env.PORT ?? 8787);
console.log(`OAuth2 server listening on http://localhost:${port}`);
console.log(`Login site (web) expected at ${config.webOrigin}`);

export default {
  port,
  fetch: app.fetch,
};
