import { clearCredentials } from "./token-store";

await clearCredentials();
console.log("已退出登录，本地凭证已清除。");
