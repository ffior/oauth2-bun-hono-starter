import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useNavigate, useSearchParams } from "react-router";
import { getAuthorization, login } from "../api/auth";

const { Title, Paragraph, Text } = Typography;

/**
 * 登录页。
 *
 * 两种进入方式：
 *  1. 桌面应用发起授权 -> 认证服务器 302 到 /login?pending_id=xxx
 *     登录成功后继续走 /oauth/consent 授权确认。
 *  2. 直接访问 /login（普通网站登录），登录成功后回首页。
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const pendingId = params.get("pending_id") ?? "";

  const [appName, setAppName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 带 pending_id 进来时，先确认授权请求还有效，并展示是哪个应用在请求登录。
  // 如果浏览器里已经有登录态，直接跳到授权确认页，省掉一次输入密码。
  useEffect(() => {
    if (!pendingId) return;
    getAuthorization(pendingId)
      .then((info) => {
        setAppName(info.appName);
        if (info.user) {
          navigate(
            `/oauth/consent?pending_id=${encodeURIComponent(pendingId)}`,
            { replace: true }
          );
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [pendingId]);

  const onFinish = async (values: { email: string; password: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(values.email, values.password);
      if (pendingId) {
        navigate(`/oauth/consent?pending_id=${encodeURIComponent(pendingId)}`, {
          replace: true,
        });
      } else {
        navigate("/", { replace: true });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card style={{ width: 380 }}>
      <Title level={4} style={{ marginTop: 0 }}>
        {appName ? `${appName} 请求登录你的账号` : "登录"}
      </Title>
      {error && (
        <Alert
          type="error"
          message={error}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}
      <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item
          name="email"
          label="邮箱"
          rules={[{ required: true, type: "email", message: "请输入邮箱" }]}
        >
          <Input autoFocus placeholder="you@example.com" />
        </Form.Item>
        <Form.Item
          name="password"
          label="密码"
          rules={[{ required: true, message: "请输入密码" }]}
        >
          <Input.Password placeholder="密码" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={submitting}>
          登录
        </Button>
      </Form>
      <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
        <Text type="secondary">演示环境：账号不存在会自动注册。</Text>
      </Paragraph>
    </Card>
  );
}
