import { createBrowserRouter } from "react-router";
import { Layout } from "./layouts/Layout";
import { AuthLayout } from "./layouts/AuthLayout";
import { HomePage } from "./pages/Home";
import { AboutPage } from "./pages/About";
import { LoginPage } from "./pages/Login";
import { ConsentPage } from "./pages/Consent";
import { OAuthDonePage } from "./pages/OAuthDone";
import { OAuthErrorPage } from "./pages/OAuthError";

export const router = createBrowserRouter([
  {
    // 登录 / 授权流程页面：从桌面应用调起浏览器后落在这里
    Component: AuthLayout,
    children: [
      { path: "login", Component: LoginPage },
      { path: "oauth/consent", Component: ConsentPage },
      // 桌面端本地回调服务器收到授权码后，把浏览器 302 到这里
      { path: "oauth/done", Component: OAuthDonePage },
      { path: "oauth/error", Component: OAuthErrorPage },
    ],
  },
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: "about", Component: AboutPage },
    ],
  },
]);
