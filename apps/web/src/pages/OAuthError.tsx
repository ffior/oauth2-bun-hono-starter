import { Alert, Card } from "antd";
import { useSearchParams } from "react-router";

/** 授权参数不合法时，认证服务器会 302 到这里 */
export function OAuthErrorPage() {
  const [params] = useSearchParams();
  const message = params.get("message") ?? "授权请求无效";

  return (
    <Card style={{ width: 380 }}>
      <Alert
        type="error"
        message="授权请求无效"
        description={
          <>
            {message}
            <br />
            请关闭本页面，回到应用重新发起登录。
          </>
        }
        showIcon
      />
    </Card>
  );
}
