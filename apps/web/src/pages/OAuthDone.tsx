import { Alert, Card, Typography } from "antd";
import { useSearchParams } from "react-router";

const { Title, Paragraph } = Typography;

/**
 * 登录完成后的落地页。
 *
 * 桌面应用的本地回调服务器接到授权码后，会把浏览器 302 到这里，
 * 所以用户地址栏最终看到的是本站域名，而不是 http://127.0.0.1:<随机端口>/callback。
 */
export function OAuthDonePage() {
  const [params] = useSearchParams();
  const status = params.get("status") ?? "ok";

  if (status === "denied") {
    return (
      <Card style={{ width: 380 }}>
        <Alert
          type="warning"
          message="已取消授权"
          description="你拒绝了这次授权，应用不会拿到你的账号信息。可以关闭本页面。"
          showIcon
        />
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card style={{ width: 380 }}>
        <Alert
          type="error"
          message="授权失败"
          description="请关闭本页面，回到应用重新发起登录。"
          showIcon
        />
      </Card>
    );
  }

  return (
    <Card style={{ width: 380, textAlign: "center" }}>
      <Title level={4} style={{ marginTop: 0 }}>
        登录成功
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        可以关闭这个标签页，回到应用继续操作。
      </Paragraph>
    </Card>
  );
}
