import { Outlet } from "react-router";

/** 登录 / 授权相关页面用的极简居中布局（不带站点导航） */
export function AuthLayout() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f5f7",
      }}
    >
      <Outlet />
    </div>
  );
}
