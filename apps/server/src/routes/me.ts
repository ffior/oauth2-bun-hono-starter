import { Hono } from "hono";
import { db, getAccessToken } from "../store";

export const meRoutes = new Hono();

/** 本地应用拿到 access_token 后，用它调用受保护接口的示例 */
meRoutes.get("/me", (c) => {
  const auth = c.req.header("authorization") ?? "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) {
    return c.json({ error: "invalid_token" }, 401);
  }

  const accessToken = getAccessToken(token);
  if (!accessToken) {
    return c.json({ error: "invalid_token", error_description: "token 无效或已过期" }, 401);
  }

  const user = db.users.get(accessToken.userId);
  if (!user) return c.json({ error: "invalid_token" }, 401);

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    scope: accessToken.scope,
  });
});
