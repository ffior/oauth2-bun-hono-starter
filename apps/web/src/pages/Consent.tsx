import { useEffect, useState } from "react";
import { Alert, Button, Card, Space, Spin, Typography } from "antd";
import { useNavigate, useSearchParams } from "react-router";
import {
  decideConsent,
  getAuthorization,
  type AuthorizationInfo,
} from "../api/auth";

const { Title, Paragraph, Text } = Typography;

/**
 * 授权确认页：用户确认后，服务端签发授权码，
 * 这里再跳转到桌面应用监听的本地回调地址（http://127.0.0.1:<port>/callback?code=...）。
 */
export function ConsentPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const pendingId = params.get("pending_id") ?? "";

  const [info, setInfo] = useState<AuthorizationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"allow" | "deny" | null>(null);

  useEffect(() => {
    if (!pendingId) {
      setError("缺少 pending_id，请回到应用重新发起登录");
      return;
    }
    getAuthorization(pendingId)
      .then((data) => {
        if (!data.user) {
          navigate(`/login?pending_id=${encodeURIComponent(pendingId)}`, {
            replace: true,
          });
          return;
        }
        setInfo(data);
      })
      .catch((err: Error) => setError(err.message));
  }, [pendingId]);

  const decide = async (decision: "allow" | "deny") => {
    setDeciding(decision);
    setError(null);
    try {
      const { redirectTo } = await decideConsent(pendingId, decision);
      // 交给浏览器跳转：这个地址由桌面应用在本机临时监听，跳过去就把授权码交回了应用
      window.location.replace(redirectTo);
    } catch (err) {
      setError((err as Error).message);
      setDeciding(null);
    }
  };

  if (error) {
    return (
      <Card style={{ width: 380 }}>
        <Alert
          type="error"
          message="无法完成授权"
          description={error}
          showIcon
        />
      </Card>
    );
  }

  if (!info) {
    return <Spin size="large" />;
  }

  return (
    <Card style={{ width: 380 }}>
      <Title level={4} style={{ marginTop: 0 }}>
        {info.appName} 想要访问你的账号
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 4 }}>
        当前登录：{info.user?.email}
      </Paragraph>
      <Paragraph type="secondary">
        请求的权限范围：<Text code>{info.scope || "基本信息"}</Text>
      </Paragraph>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Button
          type="primary"
          block
          loading={deciding === "allow"}
          onClick={() => decide("allow")}
        >
          允许
        </Button>
        <Button
          block
          loading={deciding === "deny"}
          onClick={() => decide("deny")}
        >
          拒绝
        </Button>
      </Space>
    </Card>
  );
}
